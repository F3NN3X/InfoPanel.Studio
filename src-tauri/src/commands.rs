// IPC commands. The local pages (start.html, app/settings.html) get the first group through
// capabilities/default.json; the studio's origin gets the second through a capability added
// at runtime (control::add_studio_capability).

use crate::about::{self, AppInfo};
use crate::debug::SeriesStats;
use crate::logs::{self, LogChunk};
use crate::probe::{self, ProcessInfo};
use crate::settings::{self, Settings};
use crate::state::{lock, AppState, Phase, RunningConfig, Status};
use crate::updater::{self, UpdateState};
use crate::{agents, control, debug, http, windows};
use serde::Serialize;
use serde_json::Value;
use std::time::Duration;
use tauri::{AppHandle, Manager, Url};
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
pub struct SetResult {
    pub ok: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
    /// Port, listen, allowed hosts or debug differ from what the running server was started with.
    pub restart_required: bool,
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

/// True when the saved settings differ from what the running server was started with. Nothing
/// is pending while no server runs: the next start uses the saved settings.
pub fn restart_required(
    saved: &Settings,
    debug_forced: bool,
    running: Option<&RunningConfig>,
) -> bool {
    running.is_some_and(|rc| {
        rc.listen != saved.listen
            || rc.port != saved.port
            || rc.allowed_hosts != saved.allowed_hosts
            || rc.debug != (saved.debug || debug_forced)
    })
}

/// Validates and saves one setting, then applies what needs no restart: the login item, the
/// zoom, the log level and an update check for a new channel. Never restarts the server.
pub fn apply_setting(app: &AppHandle, key: &str, value: Value) -> SetResult {
    let st = app.state::<AppState>();
    let running = st.status().running_config;
    let pending = |s: &Settings| restart_required(s, st.debug_forced, running.as_ref());
    let (old, next) = {
        // Held across the save so a concurrent agents or close-warning write can't be lost.
        let mut current = lock(&st.settings);
        let old = current.clone();
        let next = match settings::with_setting(&old, key, value) {
            Ok(next) => next,
            Err(error) => {
                return SetResult {
                    ok: false,
                    error: Some(error),
                    restart_required: pending(&old),
                    settings: old,
                }
            }
        };
        if let Err(e) = settings::save(&st.paths.config_dir, &next) {
            return SetResult {
                ok: false,
                error: Some(format!("Could not save the settings: {e}")),
                restart_required: pending(&old),
                settings: old,
            };
        }
        *current = next.clone();
        (old, next)
    };
    log::info!("setting saved: {key}");
    if old.start_at_login != next.start_at_login {
        sync_autostart(app, next.start_at_login);
    }
    if old.zoom != next.zoom {
        windows::apply_zoom(app, next.zoom);
    }
    if old.debug != next.debug {
        crate::apply_log_level(st.debug());
    }
    if old.update_channel != next.update_channel {
        let app = app.clone();
        tauri::async_runtime::spawn(async move {
            updater::check(&app).await;
        });
    }
    SetResult {
        ok: true,
        error: None,
        restart_required: pending(&next),
        settings: next,
    }
}

#[tauri::command]
pub async fn set_setting(app: AppHandle, key: String, value: Value) -> CmdResult<SetResult> {
    log::debug!("ipc: set_setting {key}");
    blocking(move || apply_setting(&app, &key, value)).await
}

/// `factor` 1.0 is 100 %; it must be one of the zoom steps.
#[tauri::command]
pub async fn set_zoom(app: AppHandle, factor: f64) -> CmdResult<SetResult> {
    log::debug!("ipc: set_zoom {factor}");
    let percent = (factor * 100.0).round();
    let value = if (0.0..=1000.0).contains(&percent) {
        Value::from(percent as u64)
    } else {
        Value::Null
    };
    blocking(move || apply_setting(&app, "zoom", value)).await
}

#[tauri::command]
pub fn server_status(app: AppHandle) -> Status {
    log::debug!("ipc: server_status");
    app.state::<AppState>().status()
}

#[tauri::command]
pub async fn start_server(app: AppHandle) -> CmdResult<Status> {
    log::debug!("ipc: start_server");
    blocking(move || control::start_blocking(&app)).await
}

#[tauri::command]
pub async fn stop_server(app: AppHandle) -> CmdResult<Status> {
    log::debug!("ipc: stop_server");
    blocking(move || control::stop(&app)).await?
}

#[tauri::command]
pub async fn restart_server(app: AppHandle) -> CmdResult<Status> {
    log::debug!("ipc: restart_server");
    blocking(move || control::restart_blocking(&app)).await
}

#[tauri::command]
pub async fn find_free_port(app: AppHandle, from: u16) -> CmdResult<u16> {
    log::debug!("ipc: find_free_port {from}");
    let host = app.state::<AppState>().settings().host();
    blocking(move || control::find_free_port(host, from))
        .await?
        .ok_or_else(|| format!("No free port from {from} up."))
}

#[derive(Debug, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ServerStats {
    pub clients: Option<u64>,
    pub rss_bytes: Option<u64>,
    pub uptime_ms: Option<u64>,
}

#[tauri::command]
pub async fn server_stats(app: AppHandle) -> CmdResult<ServerStats> {
    log::debug!("ipc: server_stats");
    let status = app.state::<AppState>().status();
    if status.state != Phase::Running {
        return Ok(ServerStats::default());
    }
    blocking(move || {
        let host = settings::connect_host(&status.host);
        let answer = http::get(
            &host,
            status.port,
            "/api/server/stats",
            Duration::from_secs(2),
        )
        .ok()
        .filter(|r| r.status == 200)
        .and_then(|r| debug::parse_server_stats(&r.body));
        ServerStats {
            clients: answer.map(|(_, c)| c),
            rss_bytes: status.pid.and_then(debug::process_rss),
            uptime_ms: answer.map(|(u, _)| u),
        }
    })
    .await
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
pub async fn read_log(
    app: AppHandle,
    source: String,
    cursor: Option<String>,
) -> CmdResult<LogChunk> {
    log::debug!("ipc: read_log {source}");
    let source = logs::Source::parse(&source).ok_or(format!("unknown log \"{source}\""))?;
    let dir = app.state::<AppState>().paths.log_dir.clone();
    blocking(move || logs::read(&dir, source, cursor.as_deref()))
        .await?
        .map_err(|e| e.to_string())
}

/// Opens Explorer with `path` selected.
fn select_in_explorer(path: &std::path::Path) -> CmdResult<()> {
    #[allow(unused_mut)]
    let mut cmd = std::process::Command::new("explorer.exe");
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        // Explorer wants `/select,"<path>"` as one argument, quoted its own way.
        cmd.raw_arg(format!("/select,\"{}\"", crate::paths::display(path)));
    }
    cmd.spawn().map(|_| ()).map_err(|e| e.to_string())
}

/// Shows a file of the app (settings, logs, the server's data) in Explorer.
#[tauri::command]
pub async fn reveal_path(app: AppHandle, path: String) -> CmdResult<()> {
    log::debug!("ipc: reveal_path {path}");
    let roots = app.state::<AppState>().paths.revealable_roots();
    blocking(move || {
        let path = std::path::PathBuf::from(path);
        if !crate::paths::is_inside(&path, &roots) {
            return Err("That path is not one of the app's files.".into());
        }
        select_in_explorer(&path)
    })
    .await?
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

fn home_dir(app: &AppHandle) -> CmdResult<std::path::PathBuf> {
    app.path().home_dir().map_err(|e| e.to_string())
}

fn agent_statuses(app: &AppHandle) -> CmdResult<Vec<agents::AgentStatus>> {
    let st = app.state::<AppState>();
    Ok(agents::statuses(
        &st.paths,
        &st.settings(),
        &st.version,
        &home_dir(app)?,
    ))
}

/// Installs or removes the hooks and records the outcome in the settings.
fn apply_agents(app: &AppHandle, enabled: bool) -> agents::AgentResult {
    let st = app.state::<AppState>();
    let s = st.settings();
    let result = agents::apply(&st.paths, &s, enabled);
    let node = crate::paths::display(&st.paths.node_exe());
    let mut current = lock(&st.settings);
    if result.ok {
        current.agents.enabled = enabled;
        current.agents.installed = enabled.then(|| agents::install_record(&s, &st.version, &node));
    } else if enabled {
        // The old hooks may be gone already; nothing is installed for sure.
        current.agents.enabled = false;
        current.agents.installed = None;
    }
    let _ = settings::save(&st.paths.config_dir, &current);
    result
}

#[derive(Debug, Serialize)]
pub struct SetAgentsResult {
    #[serde(flatten)]
    pub result: agents::AgentResult,
    /// The hook files after the change, as `agents_status` returns them.
    pub agents: Vec<agents::AgentStatus>,
}

#[tauri::command]
pub async fn set_agents(app: AppHandle, enabled: bool) -> CmdResult<SetAgentsResult> {
    log::debug!("ipc: set_agents {enabled}");
    blocking(move || {
        let result = apply_agents(&app, enabled);
        Ok(SetAgentsResult {
            result,
            agents: agent_statuses(&app)?,
        })
    })
    .await?
}

#[tauri::command]
pub async fn agents_status(app: AppHandle) -> CmdResult<Vec<agents::AgentStatus>> {
    log::debug!("ipc: agents_status");
    blocking(move || agent_statuses(&app)).await?
}

/// Writes the hooks again (while they are on).
#[tauri::command]
pub async fn repair_agents(app: AppHandle) -> CmdResult<Vec<agents::AgentStatus>> {
    log::debug!("ipc: repair_agents");
    blocking(move || {
        if app.state::<AppState>().settings().agents.enabled {
            let result = apply_agents(&app, true);
            if !result.ok {
                log::warn!("agents: repair failed: {:?}", result.steps);
            }
        }
        agent_statuses(&app)
    })
    .await?
}

/// agent-install backs each file up beside it: shows the newest backup in Explorer, or the
/// Claude Code (else Codex) folder when there is none.
#[tauri::command]
pub async fn open_agent_backups(app: AppHandle) -> CmdResult<()> {
    log::debug!("ipc: open_agent_backups");
    blocking(move || show_agent_backups(&app)).await?
}

fn show_agent_backups(app: &AppHandle) -> CmdResult<()> {
    let dirs: Vec<_> = agents::agent_files(&home_dir(app)?)
        .into_iter()
        .map(|(_, _, dir)| dir)
        .collect();
    if let Some(backup) = agents::newest_backup(&dirs) {
        return select_in_explorer(&backup);
    }
    let dir = dirs
        .iter()
        .find(|d| d.is_dir())
        .ok_or("Neither Claude Code nor Codex is installed.")?;
    app.opener()
        .open_path(crate::paths::display(dir), None::<&str>)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn open_devtools(app: AppHandle) -> CmdResult<()> {
    log::debug!("ipc: open_devtools");
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
pub fn update_state(app: AppHandle) -> UpdateState {
    log::debug!("ipc: update_state");
    updater::state(&app)
}

#[tauri::command]
pub async fn check_for_update(app: AppHandle) -> UpdateState {
    log::debug!("ipc: check_for_update");
    updater::check(&app).await
}

#[tauri::command]
pub async fn download_update(app: AppHandle) -> CmdResult<UpdateState> {
    log::debug!("ipc: download_update");
    blocking(move || updater::download(&app)).await
}

#[tauri::command]
pub async fn cancel_update(app: AppHandle) -> CmdResult<UpdateState> {
    log::debug!("ipc: cancel_update");
    blocking(move || updater::cancel(&app)).await
}

#[tauri::command]
pub async fn install_update(app: AppHandle) -> CmdResult<()> {
    log::debug!("ipc: install_update");
    blocking(move || updater::install(&app)).await?
}

/// Async: the first call runs the bundled node for its version.
#[tauri::command]
pub async fn app_info(app: AppHandle) -> CmdResult<AppInfo> {
    log::debug!("ipc: app_info");
    blocking(move || {
        let st = app.state::<AppState>();
        about::info(&st.paths, &st.version, st.settings().update_channel)
    })
    .await
}

#[tauri::command]
pub async fn changelog(app: AppHandle) -> CmdResult<String> {
    log::debug!("ipc: changelog");
    let paths = app.state::<AppState>().paths.clone();
    blocking(move || about::changelog(&paths))
        .await?
        .map_err(|e| format!("Could not read the changelog: {e}"))
}

/// Only web links open: the pages never hand the shell a file or another scheme.
pub(crate) fn external_url(url: &str) -> CmdResult<Url> {
    let url = Url::parse(url).map_err(|_| "That is not a link.".to_string())?;
    if matches!(url.scheme(), "http" | "https") {
        Ok(url)
    } else {
        Err("Only http and https links open.".into())
    }
}

#[tauri::command]
pub async fn open_external(app: AppHandle, url: String) -> CmdResult<()> {
    log::debug!("ipc: open_external {url}");
    let url = external_url(&url)?;
    blocking(move || {
        app.opener()
            .open_url(url.as_str(), None::<&str>)
            .map_err(|e| e.to_string())
    })
    .await?
}

#[tauri::command]
pub fn quit_app(app: AppHandle) {
    log::debug!("ipc: quit_app");
    std::thread::spawn(move || windows::quit(&app));
}

// ---- Studio (and local pages) ----

#[tauri::command]
pub async fn open_settings(app: AppHandle, section: Option<String>) {
    log::debug!("ipc: open_settings {section:?}");
    windows::show_settings(&app, section.as_deref());
}

#[tauri::command]
pub async fn open_help(app: AppHandle, article: Option<String>, heading: Option<String>) {
    log::debug!("ipc: open_help {article:?} {heading:?}");
    windows::show_help(
        &app,
        &windows::HelpTarget::new(article.as_deref(), heading.as_deref()),
    );
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

/// Largest file `save_binary_file` writes (a canvas zip holds its assets and fonts).
const MAX_SAVE_BINARY_BYTES: usize = 200 * 1024 * 1024;

/// Saves raw bytes (the IPC body) through a Save As dialog. The `x-file-name` and `x-file-ext`
/// headers carry the suggested name and the kind (`zip` or `infopanel`). False when cancelled.
#[tauri::command]
pub async fn save_binary_file(app: AppHandle, request: tauri::ipc::Request<'_>) -> CmdResult<bool> {
    let header = |key: &str| {
        request
            .headers()
            .get(key)
            .and_then(|v| v.to_str().ok())
            .unwrap_or_default()
            .to_string()
    };
    let (name, ext) = (header("x-file-name"), header("x-file-ext"));
    log::debug!("ipc: save_binary_file {name}");
    let Some(ext) = binary_extension(&ext) else {
        return Err("This kind of file can't be saved.".into());
    };
    let tauri::ipc::InvokeBody::Raw(bytes) = request.body() else {
        return Err("No file contents were sent.".into());
    };
    if bytes.len() > MAX_SAVE_BINARY_BYTES {
        return Err("The file is too large to save.".into());
    }
    let bytes = bytes.clone();
    let default_name = binary_file_name(&name, ext);
    blocking(move || {
        let label = if ext == "zip" {
            "Canvas zip"
        } else {
            "InfoPanel"
        };
        let mut dialog = app
            .dialog()
            .file()
            .set_file_name(&default_name)
            .add_filter(label, &[ext]);
        if let Some(w) = app.get_webview_window(windows::MAIN) {
            dialog = dialog.set_parent(&w);
        }
        let Some(path) = dialog.blocking_save_file() else {
            return Ok(false);
        };
        let mut path = path.into_path().map_err(|e| e.to_string())?;
        if !path
            .extension()
            .is_some_and(|e| e.eq_ignore_ascii_case(ext))
        {
            let mut full = path.into_os_string();
            full.push(format!(".{ext}"));
            path = full.into();
        }
        std::fs::write(&path, bytes).map_err(|e| e.to_string())?;
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

/// The allow-listed extension for a binary save, or None.
pub(crate) fn binary_extension(ext: &str) -> Option<&'static str> {
    ["zip", "infopanel"]
        .into_iter()
        .find(|e| e.eq_ignore_ascii_case(ext.trim().trim_start_matches('.')))
}

/// The suggested name without folders, always ending in `.{ext}` (`x.canvas.zip` stays whole).
pub(crate) fn binary_file_name(name: &str, ext: &str) -> String {
    let base = name
        .rsplit(['/', '\\'])
        .next()
        .unwrap_or_default()
        .trim()
        .trim_matches('.');
    let base = if base.is_empty() { "export" } else { base };
    let suffix = format!(".{ext}");
    if base.to_ascii_lowercase().ends_with(&suffix) {
        base.to_string()
    } else {
        format!("{base}{suffix}")
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
    use crate::settings::Listen;

    #[test]
    fn restart_is_required_only_against_a_running_server() {
        let saved = Settings::default();
        let running = RunningConfig {
            listen: Listen::Local,
            port: saved.port,
            debug: false,
            allowed_hosts: Vec::new(),
        };
        assert!(!restart_required(&saved, false, None));
        assert!(!restart_required(&saved, false, Some(&running)));
        for next in [
            Settings {
                port: 3942,
                ..saved.clone()
            },
            Settings {
                listen: Listen::Lan,
                ..saved.clone()
            },
            Settings {
                debug: true,
                ..saved.clone()
            },
            Settings {
                allowed_hosts: vec!["panel.lan".into()],
                ..saved.clone()
            },
        ] {
            assert!(restart_required(&next, false, Some(&running)));
        }
        let other = Settings {
            close_to_tray: false,
            zoom: 125,
            auto_restart: false,
            update_channel: crate::settings::Channel::Beta,
            ..saved.clone()
        };
        assert!(!restart_required(&other, false, Some(&running)));
        // Forced debug: the server runs with it whatever the setting says.
        let forced = RunningConfig {
            debug: true,
            ..running.clone()
        };
        assert!(!restart_required(&saved, true, Some(&forced)));
        assert!(restart_required(&saved, false, Some(&forced)));
        // Back to what the server runs with: nothing pending.
        let lan = RunningConfig {
            listen: Listen::Lan,
            allowed_hosts: vec!["panel.lan".into()],
            ..running
        };
        let same = Settings {
            listen: Listen::Lan,
            allowed_hosts: vec!["panel.lan".into()],
            ..saved.clone()
        };
        assert!(!restart_required(&same, false, Some(&lan)));
    }

    #[test]
    fn only_web_links_open() {
        assert!(external_url("https://github.com/F3NN3X/InfoPanel.Studio/issues").is_ok());
        assert!(external_url("http://127.0.0.1:3922/?kiosk=1").is_ok());
        for bad in [
            "file:///C:/Windows/notepad.exe",
            "javascript:alert(1)",
            "ms-settings:",
            "nope",
        ] {
            assert!(external_url(bad).is_err(), "{bad}");
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

#[cfg(test)]
mod save_binary_tests {
    use super::{binary_extension, binary_file_name};

    #[test]
    fn only_zip_and_infopanel_are_saved() {
        assert_eq!(binary_extension("zip"), Some("zip"));
        assert_eq!(binary_extension(".InfoPanel"), Some("infopanel"));
        for bad in ["", "exe", "json", "bat", "zip.exe"] {
            assert_eq!(binary_extension(bad), None);
        }
    }

    #[test]
    fn suggested_names_lose_folders_and_keep_the_double_extension() {
        assert_eq!(binary_file_name("my.canvas.zip", "zip"), "my.canvas.zip");
        assert_eq!(binary_file_name("my", "zip"), "my.zip");
        assert_eq!(binary_file_name("a.infopanel", "infopanel"), "a.infopanel");
        assert_eq!(binary_file_name("x.bat", "infopanel"), "x.bat.infopanel");
        assert_eq!(
            binary_file_name(r"..\..\x/y.INFOPANEL", "infopanel"),
            "y.INFOPANEL"
        );
        assert_eq!(binary_file_name("..", "zip"), "export.zip");
    }
}
