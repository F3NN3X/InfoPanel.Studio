// IPC commands. The local pages (start.html, settings.html) get the first group through
// capabilities/default.json; the studio's origin gets the second through a capability added
// at runtime (control::add_studio_capability).

use crate::debug::SeriesStats;
use crate::probe::{self, ProcessInfo};
use crate::settings::{self, FieldError, Settings};
use crate::state::{lock, AppState, Phase, Status};
use crate::{agents, control, debug, windows};
use serde::Serialize;
use serde_json::Value;
use tauri::{AppHandle, Manager};
use tauri_plugin_autostart::ManagerExt as _;
use tauri_plugin_dialog::DialogExt;
use tauri_plugin_opener::OpenerExt;

type CmdResult<T> = Result<T, String>;

/// Runs blocking work off the async runtime's threads.
async fn blocking<T: Send + 'static>(f: impl FnOnce() -> T + Send + 'static) -> CmdResult<T> {
    tauri::async_runtime::spawn_blocking(f)
        .await
        .map_err(|e| e.to_string())
}

// ---- Local pages ----

#[tauri::command]
pub fn get_settings(app: AppHandle) -> Settings {
    log::debug!("ipc: get_settings");
    app.state::<AppState>().settings()
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ApplyResult {
    pub ok: bool,
    pub errors: Vec<FieldError>,
    /// The server is restarting with the new address or options.
    pub restarted: bool,
    pub settings: Settings,
}

/// Keeps the autostart entry in line with `start_at_login`.
pub fn sync_autostart(app: &AppHandle, on: bool) {
    let launcher = app.autolaunch();
    let current = launcher.is_enabled().unwrap_or(false);
    if current == on {
        return;
    }
    let result = if on {
        launcher.enable()
    } else {
        launcher.disable()
    };
    match result {
        Ok(()) => log::info!("start at login: {on}"),
        Err(e) => log::warn!("could not change start at login: {e}"),
    }
}

/// True when changing these settings means restarting the server.
pub fn server_settings_changed(old: &Settings, new: &Settings) -> bool {
    old.host != new.host
        || old.port != new.port
        || old.allowed_hosts != new.allowed_hosts
        || old.debug != new.debug
}

#[tauri::command]
pub async fn save_settings(app: AppHandle, settings: Settings) -> CmdResult<ApplyResult> {
    log::debug!("ipc: save_settings");
    blocking(move || apply_settings(&app, settings)).await
}

fn apply_settings(app: &AppHandle, mut next: Settings) -> ApplyResult {
    let st = app.state::<AppState>();
    let old = st.settings();
    // The page edits only its own fields; the rest is the app's bookkeeping.
    next.version = old.version;
    next.agents = old.agents.clone();
    next.close_warning_shown = old.close_warning_shown;
    next.allowed_hosts = next
        .allowed_hosts
        .iter()
        .map(|h| h.trim().to_owned())
        .filter(|h| !h.is_empty())
        .collect();
    let mut errors = settings::validate(&next);
    let address_changed = old.host != next.host || old.port != next.port;
    if errors.is_empty() && address_changed {
        let status = st.status();
        let ours = status.owned && status.state == Phase::Running && status.port == next.port;
        if !ours && !probe::is_port_free(&next.host, next.port) {
            errors.push(FieldError {
                field: "port",
                message: format!(
                    "Port {} is already in use on {}. Pick another port.",
                    next.port, next.host
                ),
            });
        }
    }
    if !errors.is_empty() {
        return ApplyResult {
            ok: false,
            errors,
            restarted: false,
            settings: old,
        };
    }
    if let Err(e) = settings::save(&st.paths.config_dir, &next) {
        return ApplyResult {
            ok: false,
            errors: vec![FieldError {
                field: "",
                message: format!("Could not save the settings: {e}"),
            }],
            restarted: false,
            settings: old,
        };
    }
    *lock(&st.settings) = next.clone();
    log::info!(
        "settings saved: host={} port={} allowedHosts={:?} startAtLogin={} openStudioOnLaunch={} closeToTray={} debug={}",
        next.host,
        next.port,
        next.allowed_hosts,
        next.start_at_login,
        next.open_studio_on_launch,
        next.close_to_tray,
        next.debug
    );
    if old.start_at_login != next.start_at_login {
        sync_autostart(app, next.start_at_login);
    }
    crate::apply_log_level(st.debug());
    let restarted = server_settings_changed(&old, &next);
    if restarted {
        control::restart(app);
    }
    ApplyResult {
        ok: true,
        errors: Vec::new(),
        restarted,
        settings: next,
    }
}

#[tauri::command]
pub fn server_status(app: AppHandle) -> Status {
    log::debug!("ipc: server_status");
    app.state::<AppState>().status()
}

#[tauri::command]
pub fn restart_server(app: AppHandle) {
    log::debug!("ipc: restart_server");
    control::restart(&app);
}

#[tauri::command]
pub async fn use_foreign_server(app: AppHandle) -> CmdResult<StopResult> {
    log::debug!("ipc: use_foreign_server");
    blocking(move || match control::use_foreign(&app) {
        Ok(()) => StopResult {
            ok: true,
            message: String::new(),
        },
        Err(message) => StopResult { ok: false, message },
    })
    .await
}

#[derive(Debug, Serialize)]
pub struct StopResult {
    pub ok: bool,
    pub message: String,
}

#[tauri::command]
pub async fn stop_foreign_server(app: AppHandle) -> CmdResult<StopResult> {
    log::debug!("ipc: stop_foreign_server");
    blocking(move || match control::stop_foreign(&app) {
        Ok(message) => StopResult { ok: true, message },
        Err(message) => StopResult { ok: false, message },
    })
    .await
}

#[derive(Debug, Serialize)]
pub struct ForeignInfo {
    pub pid: u32,
    /// The executable path, or the image name when Windows hides the path.
    pub exe: String,
    pub name: String,
    /// node.exe holding the port: the page may offer to stop it.
    pub stoppable: bool,
    /// node.exe of the current user holding the port: the page may offer to use it.
    pub adoptable: bool,
}

#[tauri::command]
pub async fn foreign_server_info(app: AppHandle) -> CmdResult<Option<ForeignInfo>> {
    log::debug!("ipc: foreign_server_info");
    let port = app.state::<AppState>().settings().port;
    blocking(move || {
        let pid = probe::listener_pid(port)?;
        let info: ProcessInfo = probe::process_info(pid)?;
        Some(ForeignInfo {
            pid,
            exe: info.exe.clone().unwrap_or_else(|| info.name.clone()),
            stoppable: probe::is_node(&info),
            adoptable: probe::may_adopt(&info),
            name: info.name,
        })
    })
    .await
}

#[tauri::command]
pub async fn open_studio(app: AppHandle) {
    log::debug!("ipc: open_studio");
    windows::show_main(&app);
    let status = app.state::<AppState>().status();
    if status.state == Phase::Running {
        windows::load_studio(&app, &status.studio_url);
    }
}

#[tauri::command]
pub fn open_logs_folder(app: AppHandle) -> CmdResult<()> {
    log::debug!("ipc: open_logs_folder");
    let dir = app.state::<AppState>().paths.log_dir.clone();
    let _ = std::fs::create_dir_all(&dir);
    app.opener()
        .open_path(crate::paths::display(&dir), None::<&str>)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn read_log_tail(app: AppHandle, name: String, lines: Option<usize>) -> CmdResult<String> {
    log::debug!("ipc: read_log_tail {name}");
    if name != "app" && name != "server" {
        return Err(format!("unknown log \"{name}\""));
    }
    let dir = &app.state::<AppState>().paths.log_dir;
    Ok(crate::sidecar::tail(
        dir,
        &name,
        lines.unwrap_or(200).clamp(1, 2000),
    ))
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Diagnostics {
    pub debug: bool,
    pub samples: usize,
    pub latest_time: Option<u64>,
    pub series: Vec<SeriesStats>,
    pub logs_dir: String,
    pub sample_every_secs: u64,
    pub status: Status,
}

#[tauri::command]
pub fn get_diagnostics(app: AppHandle) -> Diagnostics {
    log::debug!("ipc: get_diagnostics");
    let st = app.state::<AppState>();
    let history = lock(&st.history);
    Diagnostics {
        debug: st.debug(),
        samples: history.len(),
        latest_time: history.latest().map(|(t, _)| *t),
        series: history.stats(),
        logs_dir: crate::paths::display(&st.paths.log_dir),
        sample_every_secs: debug::SAMPLE_EVERY_SECS,
        status: st.status(),
    }
}

#[tauri::command]
pub async fn set_agents(app: AppHandle, enabled: bool) -> CmdResult<agents::AgentResult> {
    log::debug!("ipc: set_agents {enabled}");
    blocking(move || {
        let st = app.state::<AppState>();
        let s = st.settings();
        let result = agents::apply(&st.paths, &s, enabled);
        let node = crate::paths::display(&st.paths.node_exe());
        let mut current = lock(&st.settings);
        if result.ok {
            current.agents.enabled = enabled;
            current.agents.installed =
                enabled.then(|| agents::install_record(&s, &st.version, &node));
        } else if enabled {
            // The old hooks may be gone already; nothing is installed for sure.
            current.agents.enabled = false;
            current.agents.installed = None;
        }
        let _ = settings::save(&st.paths.config_dir, &current);
        result
    })
    .await
}

#[tauri::command]
pub fn open_devtools(app: AppHandle) -> CmdResult<()> {
    log::debug!("ipc: open_devtools");
    if !app.state::<AppState>().debug() {
        return Err("Turn on debug mode first.".into());
    }
    let window = app
        .get_webview_window(windows::MAIN)
        .or_else(|| app.get_webview_window(windows::SETTINGS))
        .ok_or("No window is open.")?;
    window.open_devtools();
    Ok(())
}

#[tauri::command]
pub fn list_local_addresses() -> Vec<String> {
    log::debug!("ipc: list_local_addresses");
    let mut list: Vec<String> = if_addrs::get_if_addrs()
        .unwrap_or_default()
        .into_iter()
        .filter(|i| !i.is_loopback())
        .filter_map(|i| match i.ip() {
            std::net::IpAddr::V4(ip) if !ip.is_link_local() => Some(ip.to_string()),
            _ => None,
        })
        .collect();
    list.sort();
    list.dedup();
    list
}

#[tauri::command]
pub fn quit_app(app: AppHandle) {
    log::debug!("ipc: quit_app");
    std::thread::spawn(move || windows::quit(&app));
}

// ---- Studio (and local pages) ----

#[tauri::command]
pub async fn open_settings(app: AppHandle) {
    log::debug!("ipc: open_settings");
    windows::show_settings(&app);
}

/// Largest file `open_text_file` reads.
const MAX_OPEN_BYTES: u64 = 50 * 1024 * 1024;

#[tauri::command]
pub async fn save_text_file(
    app: AppHandle,
    default_name: String,
    contents: String,
) -> CmdResult<bool> {
    log::debug!("ipc: save_text_file {default_name}");
    if contents.len() as u64 > MAX_OPEN_BYTES {
        return Err("The file is too large to save.".into());
    }
    let default_name = json_file_name(&default_name);
    blocking(move || {
        let mut dialog = app
            .dialog()
            .file()
            .set_file_name(&default_name)
            .add_filter("JSON", &["json"]);
        if let Some(w) = app.get_webview_window(windows::MAIN) {
            dialog = dialog.set_parent(&w);
        }
        let Some(path) = dialog.blocking_save_file() else {
            return Ok(false);
        };
        let mut path = path.into_path().map_err(|e| e.to_string())?;
        // The studio only exports JSON: never write another kind of file for a page.
        if !path
            .extension()
            .is_some_and(|e| e.eq_ignore_ascii_case("json"))
        {
            path.set_extension("json");
        }
        std::fs::write(&path, contents).map_err(|e| e.to_string())?;
        log::info!("saved {}", path.display());
        Ok(true)
    })
    .await?
}

#[tauri::command]
pub async fn open_text_file(app: AppHandle) -> CmdResult<Option<String>> {
    log::debug!("ipc: open_text_file");
    blocking(move || {
        let mut dialog = app.dialog().file().add_filter("JSON", &["json"]);
        if let Some(w) = app.get_webview_window(windows::MAIN) {
            dialog = dialog.set_parent(&w);
        }
        let Some(path) = dialog.blocking_pick_file() else {
            return Ok(None);
        };
        let path = path.into_path().map_err(|e| e.to_string())?;
        let size = std::fs::metadata(&path).map_err(|e| e.to_string())?.len();
        if size > MAX_OPEN_BYTES {
            return Err(format!("{} is too large to import.", path.display()));
        }
        std::fs::read_to_string(&path)
            .map(Some)
            .map_err(|e| e.to_string())
    })
    .await?
}

/// The page's suggested name without folders, always ending in `.json`.
pub(crate) fn json_file_name(name: &str) -> String {
    let base = name
        .rsplit(['/', '\\'])
        .next()
        .unwrap_or_default()
        .trim()
        .trim_matches('.');
    let base = if base.is_empty() { "dashboard" } else { base };
    if base.to_ascii_lowercase().ends_with(".json") {
        base.to_string()
    } else {
        format!("{base}.json")
    }
}

const MAX_FRONTEND_MESSAGE: usize = 4000;

#[tauri::command]
pub fn log_frontend(level: String, message: String) {
    // Continuation lines are indented so a page can't forge a log line of its own.
    let message: String = message
        .chars()
        .take(MAX_FRONTEND_MESSAGE)
        .collect::<String>()
        .replace("\r\n", "\n")
        .replace('\r', "\n")
        .replace('\n', "\n    | ");
    match level.as_str() {
        "error" => log::error!(target: "studio", "{message}"),
        "warn" => log::warn!(target: "studio", "{message}"),
        _ => log::info!(target: "studio", "{message}"),
    }
}

#[tauri::command]
pub fn report_metrics(app: AppHandle, sample: Value) {
    log::debug!("ipc: report_metrics");
    *lock(&app.state::<AppState>().studio_sample) = Some(sample);
}

#[tauri::command]
pub fn get_debug(app: AppHandle) -> bool {
    app.state::<AppState>().debug()
}

#[tauri::command]
pub fn flush_done(app: AppHandle) {
    log::debug!("ipc: flush_done");
    app.state::<AppState>().flush.release();
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn only_server_fields_restart() {
        let old = Settings::default();
        let same = Settings {
            close_to_tray: false,
            start_at_login: false,
            open_studio_on_launch: false,
            ..old.clone()
        };
        assert!(!server_settings_changed(&old, &same));
        for next in [
            Settings {
                port: 3942,
                ..old.clone()
            },
            Settings {
                host: "0.0.0.0".into(),
                ..old.clone()
            },
            Settings {
                allowed_hosts: vec!["a".into()],
                ..old.clone()
            },
            Settings {
                debug: true,
                ..old.clone()
            },
        ] {
            assert!(server_settings_changed(&old, &next));
        }
    }
}

#[cfg(test)]
mod save_name_tests {
    use super::json_file_name;

    #[test]
    fn suggested_names_lose_folders_and_end_in_json() {
        assert_eq!(json_file_name("dashboard-2026.json"), "dashboard-2026.json");
        assert_eq!(json_file_name("update.bat"), "update.bat.json");
        assert_eq!(json_file_name(r"..\..\AppData\Startup\x.ps1"), "x.ps1.json");
        assert_eq!(json_file_name("a/b/c.JSON"), "c.JSON");
        assert_eq!(json_file_name(".."), "dashboard.json");
        assert_eq!(json_file_name(""), "dashboard.json");
    }
}
