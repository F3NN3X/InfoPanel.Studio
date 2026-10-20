// Starting, watching and stopping the server: the startup probe, the health wait, crash
// restarts, and what the window and tray show for each outcome.

use crate::probe::{self, Probe};
use crate::settings::{self, Settings, MIN_PORT};
use crate::sidecar::{self, allow_restart};
use crate::state::{self, lock, now_ms, AppState, ErrorCode, Phase, RunningConfig, Status};
use crate::{agents, tray, windows};
use std::sync::atomic::Ordering;
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter, Manager};

const HEALTH_POLL: Duration = Duration::from_millis(250);
const HEALTH_DEADLINE: Duration = Duration::from_secs(10);
pub const STATUS_EVENT: &str = "server-status";

/// The server permissions the studio page gets on its origin.
const STUDIO_PERMISSIONS: &[&str] = &[
    "allow-open-settings",
    "allow-open-help",
    "allow-save-text-file",
    "allow-save-binary-file",
    "allow-open-text-file",
    "allow-log-frontend",
    "allow-report-metrics",
    "allow-get-debug",
    "allow-flush-done",
    // Ctrl + / - / 0 in the studio.
    "allow-set-zoom",
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

/// The address a status shows: the running server's, or the saved settings' until one runs.
pub fn status_address(running: Option<&RunningConfig>, s: &Settings) -> (&'static str, u16) {
    match running {
        Some(rc) => (rc.listen.host(), rc.port),
        None => (s.host(), s.port),
    }
}

/// Clears what only a running or failed server has.
fn clear_run(status: &mut Status) {
    status.owned = false;
    status.pid = None;
    status.started_at = None;
    status.running_config = None;
    status.message = None;
    status.foreign_version = None;
    status.error_code = None;
    status.failed_at = None;
    status.suggested_port = None;
}

/// Updates the status and tells the pages and tray.
fn set_status(app: &AppHandle, generation: u64, f: impl FnOnce(&mut Status)) -> bool {
    let st = app.state::<AppState>();
    let s = st.settings();
    let status = {
        let mut server = lock(&st.server);
        if server.generation != generation {
            return false;
        }
        let status = &mut server.status;
        status.debug = st.debug();
        f(status);
        let (host, port) = status_address(status.running_config.as_ref(), &s);
        let origin = settings::origin(host, port);
        status.host = host.into();
        status.port = port;
        status.studio_url = state::studio_url(&origin);
        status.kiosk_url = state::kiosk_url(&origin);
        status.origin = origin;
        status.clone()
    };
    log::debug!("status: {:?} {:?}", status.state, status.message);
    let _ = app.emit(STATUS_EVENT, &status);
    tray::update(app, &status);
    if shows_start_page(status.state) {
        windows::load_start_page(app);
    }
    if !matches!(
        status.state,
        Phase::Starting | Phase::Running | Phase::Stopped | Phase::Restarting
    ) && st.show_on_problem.swap(false, Ordering::SeqCst)
    {
        windows::show_main(app);
    }
    true
}

/// The states that take the main window to start.html (running loads the studio again, in
/// `on_running`). Starting does not: after a crash the studio stays loaded, keeps its unsaved
/// edits and reconnects when the server is back.
pub fn shows_start_page(state: Phase) -> bool {
    matches!(
        state,
        Phase::Stopped
            | Phase::Failed
            | Phase::PortInUse
            | Phase::ForeignDashboard
            | Phase::Restarting
    )
}

fn current_generation(app: &AppHandle) -> u64 {
    lock(&app.state::<AppState>().server).generation
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

/// Shows "stopped" without spawning anything: a launch with `startServer` off, or after a stop.
pub fn show_stopped(app: &AppHandle) {
    set_status(app, current_generation(app), |status| {
        clear_run(status);
        status.state = Phase::Stopped;
    });
}

/// Probes the port and starts the server, on a background thread.
pub fn start(app: &AppHandle) {
    let app = app.clone();
    std::thread::spawn(move || run_start(&app));
}

/// Starts the server unless one is up (the app's or another) or on its way; returns the state the start
/// settles in. Blocks for up to the health deadline.
pub fn start_blocking(app: &AppHandle) -> Status {
    let st = app.state::<AppState>();
    let status = st.status();
    // Running includes a server the app did not start: starting would take its port over.
    let busy = matches!(
        status.state,
        Phase::Starting | Phase::Restarting | Phase::Running
    );
    if busy {
        return status;
    }
    stop_owned(app);
    lock(&st.server).restarts.clear();
    run_start(app);
    st.status()
}

/// Stops the app's own server (a server the app did not start is left running) and shows
/// "stopped".
pub fn stop(app: &AppHandle) -> Result<Status, String> {
    let status = app.state::<AppState>().status();
    if status.state == Phase::Running && !status.owned {
        return Err(FOREIGN_STOP.into());
    }
    windows::flush_studio(app);
    stop_owned(app);
    show_stopped(app);
    Ok(app.state::<AppState>().status())
}

pub const FOREIGN_STOP: &str =
    "This server was not started by InfoPanel Studio, so the app can't stop it. Close the program that runs it.";

/// Shows "restarting", stops the server, then starts it with the saved settings. Blocks.
pub fn restart_blocking(app: &AppHandle) -> Status {
    let st = app.state::<AppState>();
    windows::flush_studio(app);
    set_status(app, current_generation(app), |status| {
        clear_run(status);
        status.state = Phase::Restarting;
    });
    stop_owned(app);
    lock(&st.server).restarts.clear();
    run_start(app);
    st.status()
}

pub fn restart(app: &AppHandle) {
    let app = app.clone();
    std::thread::spawn(move || {
        restart_blocking(&app);
    });
}

/// The first port from `from` (at least 1024) up to 65535 that `free` accepts.
pub fn first_free(from: u16, free: impl Fn(u16) -> bool) -> Option<u16> {
    (from.max(MIN_PORT)..=u16::MAX).find(|p| free(*p))
}

/// The first port from `from` that is free on `host`.
pub fn find_free_port(host: &str, from: u16) -> Option<u16> {
    first_free(from, |p| probe::is_port_free(host, p))
}

/// The port the error callout offers instead of the one in use.
fn suggest_port(s: &Settings) -> Option<u16> {
    s.port
        .checked_add(1)
        .and_then(|p| find_free_port(s.host(), p))
}

/// The error code and message for a server that exited before it answered; `code` is the bind
/// failure its output reported.
pub fn start_failure(code: Option<ErrorCode>, port: u16, exit: &str) -> (ErrorCode, String) {
    match code {
        Some(ErrorCode::AddrInUse) => (
            ErrorCode::AddrInUse,
            format!("Port {port} is already in use by another app."),
        ),
        Some(ErrorCode::Access) => (
            ErrorCode::Access,
            format!("Windows blocked port {port} ({exit})."),
        ),
        _ => (
            ErrorCode::Other,
            format!("The server stopped while starting ({exit})."),
        ),
    }
}

fn run_start(app: &AppHandle) {
    let st = app.state::<AppState>();
    let s = st.settings();
    let generation = next_generation(app);
    set_status(app, generation, |status| {
        clear_run(status);
        status.state = Phase::Starting;
    });
    let host = settings::connect_host(s.host());
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
            let suggested = suggest_port(&s);
            set_status(app, generation, |status| {
                status.state = Phase::PortInUse;
                status.message = Some(format!(
                    "Port {} is used by another program ({detail}).",
                    s.port
                ));
                status.error_code = Some(ErrorCode::AddrInUse);
                status.failed_at = Some(now_ms());
                status.suggested_port = suggested;
            });
        }
    }
}

fn fail(app: &AppHandle, generation: u64, code: ErrorCode, message: String) {
    log::warn!("server: {message}");
    let suggested = if code == ErrorCode::AddrInUse {
        suggest_port(&app.state::<AppState>().settings())
    } else {
        None
    };
    set_status(app, generation, |status| {
        clear_run(status);
        status.state = Phase::Failed;
        status.message = Some(message);
        status.error_code = Some(code);
        status.failed_at = Some(now_ms());
        status.suggested_port = suggested;
    });
}

fn spawn_and_wait(app: &AppHandle, generation: u64) {
    let st = app.state::<AppState>();
    let s = st.settings();
    let debug = st.debug();
    let spawned = sidecar::spawn(&s, &st.paths, debug, st.server_log.clone());
    let pid = match spawned {
        Err(e) => {
            return fail(
                app,
                generation,
                ErrorCode::Other,
                format!("The server could not start: {e}"),
            )
        }
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
    log::info!("server started (pid {pid}) on {}:{}", s.host(), s.port);
    let monitor = app.clone();
    std::thread::spawn(move || watch(&monitor, generation));

    let host = settings::connect_host(s.host());
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
                status.started_at = Some(now_ms());
                status.running_config = Some(RunningConfig {
                    listen: s.listen,
                    port: s.port,
                    debug,
                    allowed_hosts: s.allowed_hosts.clone(),
                });
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
        ErrorCode::Other,
        format!(
            "The server did not answer within {} seconds.",
            HEALTH_DEADLINE.as_secs()
        ),
    );
}

/// What happens after the running server exits on its own.
#[derive(Debug, PartialEq, Eq)]
pub enum AfterCrash {
    Restart,
    /// Restarting after a crash is off.
    Off,
    /// The budget of 3 a minute is used up.
    Exhausted,
}

pub fn after_crash(auto_restart: bool, budget_left: bool) -> AfterCrash {
    match (auto_restart, budget_left) {
        (false, _) => AfterCrash::Off,
        (true, true) => AfterCrash::Restart,
        (true, false) => AfterCrash::Exhausted,
    }
}

/// Watches the server process of `generation`; restarts it after a crash while the budget lasts.
fn watch(app: &AppHandle, generation: u64) {
    let st = app.state::<AppState>();
    loop {
        std::thread::sleep(HEALTH_POLL);
        let (exit, was_running, sidecar) = {
            let mut server = lock(&st.server);
            if server.generation != generation {
                return;
            }
            let Some(sc) = server.sidecar.as_mut() else {
                return;
            };
            let exit = match sc.child.try_wait() {
                Ok(None) => continue,
                Ok(Some(code)) => code.to_string(),
                Err(e) => e.to_string(),
            };
            (
                exit,
                server.status.state == Phase::Running,
                server.sidecar.take(),
            )
        };
        if st.is_quitting() {
            return;
        }
        let s = st.settings();
        if !was_running {
            let code = sidecar.and_then(|sc| sc.exit_error(Duration::from_secs(1)));
            let (code, message) = start_failure(code, s.port, &exit);
            return fail(app, generation, code, message);
        }
        let budget_left =
            s.auto_restart && allow_restart(&mut lock(&st.server).restarts, Instant::now());
        match after_crash(s.auto_restart, budget_left) {
            AfterCrash::Restart => {
                if lock(&st.server).generation != generation {
                    return;
                }
                log::warn!("server crashed ({exit}); restarting");
                run_start(app);
            }
            AfterCrash::Off => fail(
                app,
                generation,
                ErrorCode::Other,
                format!("The server crashed ({exit}); restarting after a crash is off."),
            ),
            AfterCrash::Exhausted => fail(
                app,
                generation,
                ErrorCode::Other,
                format!(
                    "The server crashed {} times within a minute ({exit}).",
                    sidecar::MAX_RESTARTS + 1
                ),
            ),
        }
        return;
    }
}

/// Uses a dashboard server the app did not start, until the next restart. Re-checks the listener
/// first: only a node.exe owned by the current user is adopted.
pub fn use_foreign(app: &AppHandle) -> Result<(), String> {
    let st = app.state::<AppState>();
    let port = st.settings().port;
    let pid = probe::listener_pid(port)
        .ok_or_else(|| format!("Could not find the process that holds port {port}."))?;
    let info = probe::process_info(pid).ok_or_else(|| format!("Process {pid} has gone."))?;
    if lock(&st.server).sidecar.as_ref().map(|sc| sc.pid) == Some(pid) {
        return Err("That is the app's own server.".into());
    }
    if !probe::may_adopt(&info) {
        let why = if probe::is_node(&info) {
            "running as another user"
        } else {
            "which is not node.exe"
        };
        return Err(format!(
            "Port {port} is held by {} (PID {pid}), {why}; it was not used.",
            info.name
        ));
    }
    let generation = lock(&st.server).generation;
    let s = st.settings();
    let debug = st.debug();
    if set_status(app, generation, |status| {
        clear_run(status);
        status.state = Phase::Running;
        status.message = Some("Using a server the app did not start.".into());
        status.started_at = Some(now_ms());
        status.running_config = Some(RunningConfig {
            listen: s.listen,
            port: s.port,
            debug,
            allowed_hosts: s.allowed_hosts.clone(),
        });
    }) {
        on_running(app);
    }
    Ok(())
}

/// The server answers: allow the studio's IPC on its origin, load it, refresh the agent hooks.
fn on_running(app: &AppHandle) {
    let st = app.state::<AppState>();
    let s = st.settings();
    // The status' origin follows the running config, not settings saved since the start.
    let origin = st.status().origin;
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
    let host = settings::connect_host(s.host());
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

#[cfg(test)]
mod tests {
    use super::*;
    use crate::settings::Listen;

    #[test]
    fn port_search_starts_at_from_and_skips_taken_ports() {
        let taken = [3923, 3924];
        assert_eq!(first_free(3923, |p| !taken.contains(&p)), Some(3925));
        assert_eq!(first_free(3922, |p| !taken.contains(&p)), Some(3922));
        assert_eq!(first_free(80, |_| true), Some(MIN_PORT));
        assert_eq!(first_free(65535, |_| false), None);
        assert_eq!(first_free(65535, |_| true), Some(65535));
    }

    #[test]
    fn a_real_free_port_is_found() {
        // Hold a port so the search has to step past it.
        let held = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
        let port = held.local_addr().unwrap().port();
        let found = find_free_port("127.0.0.1", port).unwrap();
        assert!(found > port);
    }

    #[test]
    fn bind_failures_map_to_codes() {
        let (code, message) = start_failure(Some(ErrorCode::AddrInUse), 3922, "exit code: 1");
        assert_eq!(code, ErrorCode::AddrInUse);
        assert!(message.contains("3922"));
        assert_eq!(
            start_failure(Some(ErrorCode::Access), 80, "exit code: 1").0,
            ErrorCode::Access
        );
        let (code, message) = start_failure(None, 3922, "exit code: 7");
        assert_eq!(code, ErrorCode::Other);
        assert!(message.contains("exit code: 7"));
    }

    #[test]
    fn crash_restarts_follow_the_setting_and_budget() {
        assert_eq!(after_crash(true, true), AfterCrash::Restart);
        assert_eq!(after_crash(true, false), AfterCrash::Exhausted);
        assert_eq!(after_crash(false, true), AfterCrash::Off);
        assert_eq!(after_crash(false, false), AfterCrash::Off);
    }

    #[test]
    fn only_running_keeps_the_studio_page() {
        assert!(!shows_start_page(Phase::Running));
        // A crash restart goes through starting: the studio stays.
        assert!(!shows_start_page(Phase::Starting));
        for state in [
            Phase::Stopped,
            Phase::Restarting,
            Phase::Failed,
            Phase::PortInUse,
            Phase::ForeignDashboard,
        ] {
            assert!(shows_start_page(state), "{state:?}");
        }
    }

    #[test]
    fn the_address_is_the_running_one_until_it_stops() {
        let saved = Settings {
            port: 3950,
            listen: Listen::Lan,
            ..Settings::default()
        };
        assert_eq!(status_address(None, &saved), ("0.0.0.0", 3950));
        let running = RunningConfig {
            listen: Listen::Local,
            port: 3922,
            debug: false,
            allowed_hosts: Vec::new(),
        };
        assert_eq!(status_address(Some(&running), &saved), ("127.0.0.1", 3922));
    }
}
