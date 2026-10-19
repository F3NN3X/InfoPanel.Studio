// Starting, watching and stopping the server: the startup probe, the health wait, crash
// restarts, and what the window and tray show for each outcome.

use crate::probe::{self, Probe};
use crate::sidecar::{self, allow_restart};
use crate::state::{self, lock, AppState, Phase, Status};
use crate::{agents, settings, tray, windows};
use std::sync::atomic::Ordering;
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter, Manager};

const HEALTH_POLL: Duration = Duration::from_millis(250);
const HEALTH_DEADLINE: Duration = Duration::from_secs(10);
pub const STATUS_EVENT: &str = "server-status";

/// The server permissions the studio page gets on its origin.
const STUDIO_PERMISSIONS: &[&str] = &[
    "allow-open-settings",
    "allow-save-text-file",
    "allow-open-text-file",
    "allow-log-frontend",
    "allow-report-metrics",
    "allow-get-debug",
    "allow-flush-done",
    "core:event:allow-listen",
    "core:event:allow-unlisten",
    // The studio's top bar is the window's title bar (the window has no native frame).
    "core:window:allow-minimize",
    "core:window:allow-toggle-maximize",
    "core:window:allow-internal-toggle-maximize",
    "core:window:allow-close",
    "core:window:allow-start-dragging",
    "core:window:allow-is-maximized",
];

/// Updates the status (always for the current settings' address) and tells the pages and tray.
fn set_status(app: &AppHandle, generation: u64, f: impl FnOnce(&mut Status)) -> bool {
    let st = app.state::<AppState>();
    let s = st.settings();
    let origin = settings::server_origin(&s);
    let status = {
        let mut server = lock(&st.server);
        if server.generation != generation {
            return false;
        }
        let status = &mut server.status;
        status.host = s.host.clone();
        status.port = s.port;
        status.studio_url = state::studio_url(&origin);
        status.kiosk_url = state::kiosk_url(&origin);
        status.origin = origin;
        status.debug = st.debug();
        f(status);
        status.clone()
    };
    log::debug!("status: {:?} {:?}", status.state, status.message);
    let _ = app.emit(STATUS_EVENT, &status);
    tray::update(app, &status);
    if !matches!(status.state, Phase::Starting | Phase::Running)
        && st.show_on_problem.swap(false, Ordering::SeqCst)
    {
        windows::show_main(app);
    }
    true
}

fn next_generation(app: &AppHandle) -> u64 {
    let st = app.state::<AppState>();
    let mut server = lock(&st.server);
    server.generation += 1;
    server.generation
}

/// Stops the server if the app started it.
pub fn stop_owned(app: &AppHandle) {
    let st = app.state::<AppState>();
    let sidecar = {
        let mut server = lock(&st.server);
        server.generation += 1;
        server.status.owned = false;
        server.status.pid = None;
        server.sidecar.take()
    };
    if let Some(mut sc) = sidecar {
        log::info!("stopping server (pid {})", sc.pid);
        let _ = sc.child.kill();
        let _ = sc.child.wait();
    }
}

/// Probes the port and starts the server, on a background thread.
pub fn start(app: &AppHandle) {
    let app = app.clone();
    std::thread::spawn(move || run_start(&app));
}

pub fn restart(app: &AppHandle) {
    let app = app.clone();
    std::thread::spawn(move || {
        stop_owned(&app);
        lock(&app.state::<AppState>().server).restarts.clear();
        run_start(&app);
    });
}

fn run_start(app: &AppHandle) {
    let st = app.state::<AppState>();
    let s = st.settings();
    let generation = next_generation(app);
    set_status(app, generation, |status| {
        status.state = Phase::Starting;
        status.owned = false;
        status.message = None;
        status.foreign_version = None;
        status.pid = None;
    });
    let host = settings::connect_host(&s.host);
    let found = probe::probe(&host, s.port, probe::PROBE_TIMEOUT);
    log::debug!("probe {host}:{} -> {found:?}", s.port);
    if found != Probe::Free {
        // Another dashboard server (start-dashboard.bat, an older build without /api/health, ...)
        // is closed so the app can use the port; any other program is left alone.
        match stop_dashboard_on_port(app) {
            Ok(stopped) => {
                log::info!("{stopped}; starting the app's own server");
                spawn_and_wait(app, generation);
                return;
            }
            Err(why) => log::debug!("port {} not taken over: {why}", s.port),
        }
    }
    match found {
        Probe::Free => spawn_and_wait(app, generation),
        Probe::Dashboard { version } => {
            set_status(app, generation, |status| {
                status.state = Phase::ForeignDashboard;
                status.foreign_version = version;
                status.message = Some(format!(
                    "Another InfoPanel Studio server is running on port {}.",
                    s.port
                ));
            });
        }
        Probe::Other { detail } => {
            set_status(app, generation, |status| {
                status.state = Phase::PortInUse;
                status.message = Some(format!(
                    "Port {} is used by another program ({detail}).",
                    s.port
                ));
            });
        }
    }
}

fn fail(app: &AppHandle, generation: u64, message: String) {
    log::warn!("server: {message}");
    set_status(app, generation, |status| {
        status.state = Phase::Failed;
        status.owned = false;
        status.pid = None;
        status.message = Some(message);
    });
}

fn spawn_and_wait(app: &AppHandle, generation: u64) {
    let st = app.state::<AppState>();
    let s = st.settings();
    let spawned = sidecar::spawn(&s, &st.paths, st.debug(), st.server_log.clone());
    let pid = match spawned {
        Err(e) => return fail(app, generation, format!("The server could not start: {e}")),
        Ok(sc) => {
            let pid = sc.pid;
            let mut server = lock(&st.server);
            if server.generation != generation {
                drop(server);
                let mut sc = sc;
                let _ = sc.child.kill();
                return;
            }
            server.sidecar = Some(sc);
            server.status.pid = Some(pid);
            pid
        }
    };
    log::info!("server started (pid {pid}) on {}:{}", s.host, s.port);
    let monitor = app.clone();
    std::thread::spawn(move || watch(&monitor, generation));

    let host = settings::connect_host(&s.host);
    let deadline = Instant::now() + HEALTH_DEADLINE;
    while Instant::now() < deadline {
        {
            let server = lock(&st.server);
            if server.generation != generation || server.status.state != Phase::Starting {
                return;
            }
        }
        if let Probe::Dashboard { .. } = probe::probe(&host, s.port, probe::PROBE_TIMEOUT) {
            if set_status(app, generation, |status| {
                status.state = Phase::Running;
                status.owned = true;
                status.message = None;
            }) {
                on_running(app);
            }
            return;
        }
        std::thread::sleep(HEALTH_POLL);
    }
    let sidecar = {
        let mut server = lock(&st.server);
        if server.generation != generation {
            return;
        }
        server.sidecar.take()
    };
    if let Some(mut sc) = sidecar {
        let _ = sc.child.kill();
        let _ = sc.child.wait();
    }
    fail(
        app,
        generation,
        format!(
            "The server did not answer within {} seconds.",
            HEALTH_DEADLINE.as_secs()
        ),
    );
}

/// Watches the server process of `generation`; restarts it after a crash while the budget lasts.
fn watch(app: &AppHandle, generation: u64) {
    let st = app.state::<AppState>();
    loop {
        std::thread::sleep(HEALTH_POLL);
        let (exit, was_running) = {
            let mut server = lock(&st.server);
            if server.generation != generation {
                return;
            }
            let Some(sc) = server.sidecar.as_mut() else {
                return;
            };
            match sc.child.try_wait() {
                Ok(None) => continue,
                Ok(Some(code)) => {
                    server.sidecar = None;
                    (code.to_string(), server.status.state == Phase::Running)
                }
                Err(e) => {
                    server.sidecar = None;
                    (e.to_string(), server.status.state == Phase::Running)
                }
            }
        };
        if st.is_quitting() {
            return;
        }
        if !was_running {
            return fail(
                app,
                generation,
                format!("The server stopped while starting ({exit})."),
            );
        }
        let allowed = allow_restart(&mut lock(&st.server).restarts, Instant::now());
        if allowed {
            log::warn!("server crashed ({exit}); restarting");
            run_start(app);
        } else {
            fail(
                app,
                generation,
                format!(
                    "The server crashed {} times within a minute ({exit}).",
                    sidecar::MAX_RESTARTS + 1
                ),
            );
        }
        return;
    }
}

/// Uses a dashboard server the app did not start, until the next restart.
pub fn use_foreign(app: &AppHandle) {
    let generation = lock(&app.state::<AppState>().server).generation;
    if set_status(app, generation, |status| {
        status.state = Phase::Running;
        status.owned = false;
        status.pid = None;
        status.message = Some("Using a server the app did not start.".into());
    }) {
        on_running(app);
    }
}

/// The server answers: allow the studio's IPC on its origin, load it, refresh the agent hooks.
fn on_running(app: &AppHandle) {
    let st = app.state::<AppState>();
    let s = st.settings();
    let origin = settings::server_origin(&s);
    if let Ok(mut o) = st.origin.write() {
        o.clone_from(&origin);
    }
    add_studio_capability(app, &origin);
    windows::load_studio(app, &state::studio_url(&origin));
    let node = crate::paths::display(&st.paths.node_exe());
    if agents::needs_reinstall(&s, &st.version, &node) {
        let app = app.clone();
        std::thread::spawn(move || refresh_agents(&app));
    }
}

fn add_studio_capability(app: &AppHandle, origin: &str) {
    let st = app.state::<AppState>();
    let id = format!(
        "studio-{}",
        origin.replace(|c: char| !c.is_ascii_alphanumeric(), "-")
    );
    if !lock(&st.capabilities).insert(id.clone()) {
        return;
    }
    let mut cap = tauri::ipc::CapabilityBuilder::new(id)
        .remote(format!("{origin}/*"))
        .window("main");
    for p in STUDIO_PERMISSIONS {
        cap = cap.permission(*p);
    }
    if let Err(e) = app.add_capability(cap) {
        log::error!("could not add the studio capability for {origin}: {e}");
    }
}

/// Rewrites the agent hooks for the current port, node path and app version.
pub fn refresh_agents(app: &AppHandle) {
    let st = app.state::<AppState>();
    let s = st.settings();
    if !s.agents.enabled {
        return;
    }
    let result = agents::apply(&st.paths, &s, true);
    if result.ok {
        let node = crate::paths::display(&st.paths.node_exe());
        let mut current = lock(&st.settings);
        current.agents.installed = Some(agents::install_record(&s, &st.version, &node));
        let _ = settings::save(&st.paths.config_dir, &current);
    } else {
        log::warn!("agents: refresh failed: {:?}", result.steps);
    }
}

/// Stops a foreign dashboard server after re-checking it, then starts ours.
pub fn stop_foreign(app: &AppHandle) -> Result<String, String> {
    let stopped = stop_dashboard_on_port(app)?;
    start(app);
    Ok(stopped)
}

/// Stops the dashboard server the app did not start that holds the configured port: a node.exe
/// that answers as the dashboard or runs `server.mjs` (older builds have no /api/health). Anything
/// else, and the app's own server, is left alone. Waits up to 5 s for the port to free.
fn stop_dashboard_on_port(app: &AppHandle) -> Result<String, String> {
    let st = app.state::<AppState>();
    let s = st.settings();
    let host = settings::connect_host(&s.host);
    let pid = probe::listener_pid(s.port)
        .ok_or_else(|| format!("Could not find the process that holds port {}.", s.port))?;
    let info = probe::process_info(pid).ok_or_else(|| format!("Process {pid} has gone."))?;
    if lock(&st.server).sidecar.as_ref().map(|sc| sc.pid) == Some(pid) {
        return Err("That is the app's own server.".into());
    }
    let answers = matches!(
        probe::probe(&host, s.port, probe::PROBE_TIMEOUT),
        Probe::Dashboard { .. }
    );
    if !probe::is_node(&info) || !(answers || probe::runs_dashboard_server(&info)) {
        return Err(format!(
            "Port {} is held by {} (PID {pid}), which is not an InfoPanel Studio server; it was not stopped.",
            s.port, info.name
        ));
    }
    log::info!("stopping dashboard server {} (pid {pid})", info.name);
    if !probe::kill(pid) {
        return Err(format!(
            "Windows refused to stop {} (PID {pid}).",
            info.name
        ));
    }
    let deadline = Instant::now() + Duration::from_secs(5);
    while probe::probe(&host, s.port, Duration::from_millis(500)) != Probe::Free {
        if Instant::now() >= deadline {
            return Err(format!(
                "Stopped {} (PID {pid}), but port {} is still busy.",
                info.name, s.port
            ));
        }
        std::thread::sleep(HEALTH_POLL);
    }
    Ok(format!("Stopped {} (PID {pid})", info.name))
}
