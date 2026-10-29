// InfoPanel Studio: runs the bundled dashboard server and shows the studio from it.

mod about;
mod agents;
mod commands;
mod control;
mod debug;
mod http;
mod infopanel_local;
mod kiosk;
mod logs;
mod nav;
mod native;
mod paths;
mod probe;
mod refresh;
mod release;
mod server_log;
mod settings;
mod state;
mod studio_target;
mod tray;
mod updater;
mod webview2;
mod windows;

use crate::state::{lock, AppState, Phase};
use std::sync::{Arc, Mutex};
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tauri::{Manager, RunEvent};
use tauri_plugin_log::{RotationStrategy, Target, TargetKind};

const HIDDEN_ARG: &str = "--hidden";
const DEBUG_ARG: &str = "--debug";
const APP_LOG_MAX: u128 = 5 * 1024 * 1024;

/// `--debug` or INFOPANEL_STUDIO_DEBUG=1.
pub fn debug_forced(args: &[String], env: Option<&str>) -> bool {
    args.iter().any(|a| a == DEBUG_ARG) || env.is_some_and(|v| v == "1")
}

/// Debug level for the app's own log lines in debug mode; Info otherwise.
pub fn apply_log_level(debug: bool) {
    log::set_max_level(if debug {
        log::LevelFilter::Debug
    } else {
        log::LevelFilter::Info
    });
}

fn now_secs() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
}

/// Every 30 s in debug mode: process numbers, server stats and the studio's sample.
fn run_sampler(app: tauri::AppHandle) {
    let mut sampler = debug::ProcessSampler::default();
    loop {
        std::thread::sleep(Duration::from_secs(debug::SAMPLE_EVERY_SECS));
        let st = app.state::<AppState>();
        if !st.debug() {
            continue;
        }
        let status = st.status();
        let mut sample = sampler.sample();
        if status.state == Phase::Running {
            let host = settings::connect_host(&status.host);
            if let Ok(r) = http::get(
                &host,
                status.port,
                "/api/debug/stats",
                Duration::from_secs(2),
            ) {
                if let Ok(v) = serde_json::from_str::<serde_json::Value>(&r.body) {
                    if r.status == 200 {
                        sample.extend(debug::server_series(&v));
                    }
                }
            }
        }
        if let Some(v) = lock(&st.studio_sample).as_ref() {
            sample.extend(debug::studio_series(v));
        }
        let ts = now_secs();
        if let Err(e) = debug::append_csv(&st.paths.log_dir, ts, &sample) {
            log::warn!("metrics.csv: {e}");
        }
        log::debug!("sample: {sample:?}");
        lock(&st.history).push(ts, sample);
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let args: Vec<String> = std::env::args().collect();
    let forced = debug_forced(
        &args,
        std::env::var("INFOPANEL_STUDIO_DEBUG").ok().as_deref(),
    );
    let hidden = args.iter().any(|a| a == HIDDEN_ARG);
    // The settings and log folders are known before Tauri starts; resources only once it has.
    let early = paths::Paths::from_env(Default::default());
    let log_dir = early.log_dir;
    // server.log: the in-app server's log lines (target `server`).
    let server_log = Arc::new(Mutex::new(server_log::RotatingLog::new(
        &log_dir,
        "server",
        server_log::SERVER_LOG_MAX,
        server_log::SERVER_LOG_FILES,
    )));
    let server_lines = server_log.clone();
    // Only a peek: `setup` loads (and logs about) the file once the log is up.
    let remember_bounds = std::fs::read_to_string(settings::settings_file(&early.config_dir))
        .ok()
        .and_then(|text| settings::load_from_str(&text).ok())
        .is_none_or(|s| s.remember_bounds);

    let builder = tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, argv, _cwd| {
            log::debug!("second launch: {argv:?}");
            if !argv.iter().any(|a| a == HIDDEN_ARG) {
                studio_target::open(app);
            }
        }))
        .plugin(
            tauri_plugin_log::Builder::new()
                .clear_targets()
                .target(
                    Target::new(TargetKind::Folder {
                        path: log_dir,
                        file_name: Some("app".into()),
                    })
                    .filter(|m| m.target() != "server"),
                )
                .target(
                    Target::new(TargetKind::Dispatch(
                        tauri_plugin_log::fern::Dispatch::new().chain(
                            tauri_plugin_log::fern::Output::call(move |record| {
                                if let Ok(mut l) = server_lines.lock() {
                                    let _ = l.write_line(&record.args().to_string());
                                }
                            }),
                        ),
                    ))
                    .filter(|m| m.target() == "server"),
                )
                .max_file_size(APP_LOG_MAX)
                .rotation_strategy(RotationStrategy::KeepSome(3))
                .level(log::LevelFilter::Debug)
                .filter(|m| {
                    m.level() <= log::Level::Info
                        || m.target().starts_with("infopanel_studio")
                        || m.target() == "studio"
                })
                .build(),
        );
    // Remember window size and position off: no window state is restored or saved this run.
    let builder = if remember_bounds {
        builder.plugin(
            tauri_plugin_window_state::Builder::new()
                .with_state_flags(
                    // Never the frame: the window draws its own title bar, so a saved
                    // "decorated" state from an older run must not bring the native one back.
                    tauri_plugin_window_state::StateFlags::all()
                        - tauri_plugin_window_state::StateFlags::VISIBLE
                        - tauri_plugin_window_state::StateFlags::DECORATIONS,
                )
                .with_denylist(&[windows::SETTINGS])
                .build(),
        )
    } else {
        builder
    };
    let app = builder
        .plugin(
            tauri_plugin_autostart::Builder::new()
                .args([HIDDEN_ARG])
                .build(),
        )
        // Links go to `on_new_window` (windows.rs), which opens them with a rate limit; the plugin's own
        // click handler calls a command no capability grants.
        .plugin(
            tauri_plugin_opener::Builder::new()
                .open_js_links_on_click(false)
                .build(),
        )
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .invoke_handler(tauri::generate_handler![
            commands::get_settings,
            commands::set_setting,
            commands::set_zoom,
            commands::server_status,
            commands::start_server,
            commands::stop_server,
            commands::restart_server,
            commands::find_free_port,
            commands::server_stats,
            commands::use_foreign_server,
            commands::foreign_server_info,
            commands::open_studio,
            commands::open_logs_folder,
            commands::read_log_tail,
            commands::read_log,
            commands::reveal_path,
            commands::get_diagnostics,
            commands::set_agents,
            commands::agents_status,
            commands::repair_agents,
            commands::open_agent_backups,
            commands::open_devtools,
            commands::open_webview_task_manager,
            commands::list_local_addresses,
            commands::quit_app,
            commands::open_settings,
            commands::show_studio,
            commands::open_help,
            commands::kiosk_window,
            commands::save_text_file,
            commands::save_binary_file,
            commands::open_text_file,
            commands::log_frontend,
            commands::report_metrics,
            commands::get_debug,
            commands::flush_done,
            commands::update_state,
            commands::check_for_update,
            commands::download_update,
            commands::cancel_update,
            commands::install_update,
            commands::app_info,
            commands::changelog,
            commands::open_external,
            commands::default_browser_kind,
            commands::infopanel_local,
            commands::infopanel_start,
            commands::infopanel_restart,
            commands::port_owner,
            commands::setup_options,
            commands::setup_end,
            commands::run_setup,
        ])
        .setup(move |app| {
            let handle = app.handle().clone();
            let paths = paths::Paths::from_env(app.path().resource_dir()?);
            let s = settings::load(&paths.config_dir);
            let version = app.package_info().version.to_string();
            log::info!(
                "InfoPanel Studio {version} starting (hidden={hidden}, debug forced={forced}); settings in {}",
                paths::display(&paths.config_dir)
            );
            let open_window = !hidden && s.open_studio_on_launch;
            let start_at_login = s.start_at_login;
            let check_updates = s.check_for_updates;
            let start_server = s.start_server;
            app.manage(updater::Updates::new(&version));
            let st = AppState {
                server_log,
                ..AppState::new(paths, version, s, forced, hidden)
            };
            apply_log_level(st.debug());
            // A first launch (no dashboard config yet) opens a setup session: the studio's first-run setup may start
            // InfoPanel and set its switches until it ends.
            let config = st.paths.data_dir.clone().unwrap_or_else(ips_server::env::default_data_dir).join("config.json");
            if !config.exists() {
                st.setup.store(true, std::sync::atomic::Ordering::SeqCst);
            }
            // A config an older version saved opens the studio, even on a hidden launch: it asks to update the screens
            // (keeping a backup first), which only the studio can do.
            let outdated = std::fs::read_to_string(&config).is_ok_and(|text| ips_server::config_guard::needs_update(&text));
            if outdated {
                log::info!("the saved config is older than this version; opening the studio to update it");
            }
            let open_window = open_window || outdated;
            app.manage(st);
            commands::sync_autostart(&handle, start_at_login);
            tray::create(&handle)?;
            if open_window {
                // A browser target waits for the server (starting below, or by itself when that's off).
                studio_target::open(&handle);
            }
            if start_server {
                control::start(&handle);
            } else {
                log::info!("start the server on launch is off; the server stays stopped");
                control::show_stopped(&handle);
            }
            if check_updates {
                updater::check_soon(&handle);
            }
            refresh::start(&handle);
            release::start(&handle);
            let sampler = handle.clone();
            std::thread::spawn(move || run_sampler(sampler));
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building InfoPanel Studio");

    app.run(|app, event| match event {
        // Closing the last window keeps the app (and the server) in the tray.
        RunEvent::ExitRequested {
            code: None, api, ..
        } if !app.state::<AppState>().is_quitting() => api.prevent_exit(),
        RunEvent::Exit => control::stop_owned(app),
        _ => {}
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn debug_flag_and_env() {
        let args = |a: &[&str]| a.iter().map(|s| s.to_string()).collect::<Vec<_>>();
        assert!(debug_forced(&args(&["app", "--debug"]), None));
        assert!(debug_forced(&args(&["app"]), Some("1")));
        assert!(!debug_forced(&args(&["app"]), Some("0")));
        assert!(!debug_forced(&args(&["app", "--hidden"]), None));
    }
}
