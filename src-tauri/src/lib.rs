// InfoPanel Studio: runs the bundled dashboard server and shows the studio from it.

mod agents;
mod commands;
mod control;
mod debug;
mod http;
mod nav;
mod paths;
mod probe;
mod settings;
mod sidecar;
mod state;
mod tray;
mod updater;
mod windows;

use crate::state::{lock, AppState, Phase};
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
        let mut sample = sampler.sample(status.pid);
        if status.state == Phase::Running {
            let s = st.settings();
            let host = settings::connect_host(&s.host);
            if let Ok(r) = http::get(&host, s.port, "/api/debug/stats", Duration::from_secs(2)) {
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
    // The log folder is known before Tauri starts; resources only once it has.
    let log_dir = paths::Paths::from_env(Default::default()).log_dir;

    let app = tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, argv, _cwd| {
            log::debug!("second launch: {argv:?}");
            if !argv.iter().any(|a| a == HIDDEN_ARG) {
                windows::show_main(app);
            }
        }))
        .plugin(
            tauri_plugin_log::Builder::new()
                .clear_targets()
                .target(Target::new(TargetKind::Folder {
                    path: log_dir,
                    file_name: Some("app".into()),
                }))
                .max_file_size(APP_LOG_MAX)
                .rotation_strategy(RotationStrategy::KeepSome(3))
                .level(log::LevelFilter::Debug)
                .filter(|m| {
                    m.level() <= log::Level::Info
                        || m.target().starts_with("infopanel_studio")
                        || m.target() == "studio"
                })
                .build(),
        )
        .plugin(
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
        .plugin(
            tauri_plugin_autostart::Builder::new()
                .args([HIDDEN_ARG])
                .build(),
        )
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .invoke_handler(tauri::generate_handler![
            commands::get_settings,
            commands::save_settings,
            commands::server_status,
            commands::restart_server,
            commands::use_foreign_server,
            commands::stop_foreign_server,
            commands::foreign_server_info,
            commands::open_studio,
            commands::open_logs_folder,
            commands::read_log_tail,
            commands::get_diagnostics,
            commands::set_agents,
            commands::open_devtools,
            commands::list_local_addresses,
            commands::quit_app,
            commands::open_settings,
            commands::save_text_file,
            commands::save_binary_file,
            commands::open_text_file,
            commands::log_frontend,
            commands::report_metrics,
            commands::get_debug,
            commands::flush_done,
            commands::check_for_update,
            commands::pending_update,
            commands::install_update,
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
            let st = AppState::new(paths, version, s, forced, hidden);
            apply_log_level(st.debug());
            app.manage(st);
            app.manage(updater::Pending::default());
            commands::sync_autostart(&handle, start_at_login);
            tray::create(&handle)?;
            if open_window {
                windows::show_main(&handle);
            }
            control::start(&handle);
            if check_updates {
                updater::check_soon(&handle);
            }
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
