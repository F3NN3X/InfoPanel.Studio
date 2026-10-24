// Shared app state: settings, the server's status and process, and the debug samples.

use crate::debug::History;
use crate::paths::Paths;
use crate::settings::{self, Listen, Settings};
use crate::server_log::RotatingLog;
use serde::Serialize;
use serde_json::Value;
use std::collections::{HashSet, VecDeque};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Condvar, Mutex, MutexGuard, RwLock};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum Phase {
    Starting,
    Running,
    /// Stopped on purpose, or not started because `startServer` is off.
    Stopped,
    /// Stopping to start again with the saved settings.
    Restarting,
    /// The app's server did not start or crashed too often.
    Failed,
    /// Another InfoPanel Studio server (e.g. start-dashboard.bat) holds the port.
    ForeignDashboard,
    /// Some other program holds the port.
    PortInUse,
}

/// Why the server could not start.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
pub enum ErrorCode {
    #[serde(rename = "EADDRINUSE")]
    AddrInUse,
    #[serde(rename = "EACCES")]
    Access,
    #[serde(rename = "OTHER")]
    Other,
}

/// What the running server was started with; the settings page compares it with the saved
/// settings to tell whether a restart is needed.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RunningConfig {
    pub listen: Listen,
    pub port: u16,
    pub debug: bool,
    /// The extra host names the request guard accepts; read at start only.
    pub allowed_hosts: Vec<String>,
    /// Whether the server takes writes from other devices; read at start only.
    pub allow_remote_edit: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Status {
    pub state: Phase,
    /// The app started (and will stop) the server it is using.
    pub owned: bool,
    pub host: String,
    pub port: u16,
    pub origin: String,
    pub studio_url: String,
    pub kiosk_url: String,
    pub message: Option<String>,
    /// The version a foreign dashboard server reports.
    pub foreign_version: Option<String>,
    pub app_version: String,
    pub debug: bool,
    pub pid: Option<u32>,
    /// Milliseconds since the epoch, while running.
    pub started_at: Option<u64>,
    pub running_config: Option<RunningConfig>,
    /// Set with `failed_at` when the state is failed or port_in_use.
    pub error_code: Option<ErrorCode>,
    pub failed_at: Option<u64>,
    /// The first free port above `port`, for EADDRINUSE.
    pub suggested_port: Option<u16>,
}

pub fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

pub fn studio_url(origin: &str) -> String {
    format!("{origin}/?studio=1")
}

pub fn kiosk_url(origin: &str) -> String {
    format!("{origin}/?kiosk=1")
}

pub struct Server {
    pub status: Status,
    /// ips-server running in the app's process.
    pub native: Option<crate::native::Native>,
    /// Bumped by every start and stop; a monitor or start flow of an older generation gives up.
    pub generation: u64,
    pub restarts: VecDeque<Instant>,
}

/// The studio's answer to `studio://flush`.
#[derive(Default)]
pub struct FlushGate {
    pending: Mutex<bool>,
    done: Condvar,
}

pub const FLUSH_TIMEOUT: Duration = Duration::from_millis(1500);

impl FlushGate {
    pub fn arm(&self) {
        *self.pending.lock().unwrap_or_else(|e| e.into_inner()) = true;
    }

    pub fn release(&self) {
        *self.pending.lock().unwrap_or_else(|e| e.into_inner()) = false;
        self.done.notify_all();
    }

    /// Waits for `release` or the timeout; true when the studio answered.
    pub fn wait(&self, timeout: Duration) -> bool {
        let guard = self.pending.lock().unwrap_or_else(|e| e.into_inner());
        let (guard, _) = self
            .done
            .wait_timeout_while(guard, timeout, |pending| *pending)
            .unwrap_or_else(|e| e.into_inner());
        !*guard
    }
}

pub struct AppState {
    pub paths: Paths,
    pub version: String,
    /// `--debug` or INFOPANEL_STUDIO_DEBUG=1: debug mode for this run regardless of settings.
    pub debug_forced: bool,
    pub settings: Mutex<Settings>,
    pub server: Mutex<Server>,
    pub server_log: Arc<Mutex<RotatingLog>>,
    /// The server origin the navigation guard allows.
    pub origin: Arc<RwLock<String>>,
    pub flush: FlushGate,
    pub history: Mutex<History>,
    pub studio_sample: Mutex<Option<Value>>,
    pub capabilities: Mutex<HashSet<String>>,
    /// Show the window when the first start runs into a problem (manual launches only).
    pub show_on_problem: AtomicBool,
    pub quitting: AtomicBool,
    /// The main window was last sent to the studio (not start.html), whether or not that
    /// navigation has committed yet.
    pub studio_page: AtomicBool,
    /// The studio window's geometry while Kiosk view has resized it (see `kiosk`).
    pub kiosk: Mutex<Option<crate::kiosk::Saved>>,
}

/// Locks, recovering the data of a mutex a panicking thread left poisoned.
pub fn lock<T>(m: &Mutex<T>) -> MutexGuard<'_, T> {
    m.lock().unwrap_or_else(|e| e.into_inner())
}

impl AppState {
    pub fn new(
        paths: Paths,
        version: String,
        settings: Settings,
        debug_forced: bool,
        hidden_start: bool,
    ) -> Self {
        let origin = settings::server_origin(&settings);
        let server_log = RotatingLog::new(
            &paths.log_dir,
            "server",
            crate::server_log::SERVER_LOG_MAX,
            crate::server_log::SERVER_LOG_FILES,
        );
        let status = Status {
            state: if settings.start_server {
                Phase::Starting
            } else {
                Phase::Stopped
            },
            owned: false,
            host: settings.host().into(),
            port: settings.port,
            studio_url: studio_url(&origin),
            kiosk_url: kiosk_url(&origin),
            origin: origin.clone(),
            message: None,
            foreign_version: None,
            app_version: version.clone(),
            debug: settings.debug || debug_forced,
            pid: None,
            started_at: None,
            running_config: None,
            error_code: None,
            failed_at: None,
            suggested_port: None,
        };
        Self {
            paths,
            version,
            debug_forced,
            settings: Mutex::new(settings),
            server: Mutex::new(Server {
                status,
                native: None,
                generation: 0,
                restarts: VecDeque::new(),
            }),
            server_log: Arc::new(Mutex::new(server_log)),
            origin: Arc::new(RwLock::new(origin)),
            flush: FlushGate::default(),
            history: Mutex::new(History::default()),
            studio_sample: Mutex::new(None),
            capabilities: Mutex::new(HashSet::new()),
            show_on_problem: AtomicBool::new(!hidden_start),
            quitting: AtomicBool::new(false),
            studio_page: AtomicBool::new(false),
            kiosk: Mutex::new(None),
        }
    }

    pub fn settings(&self) -> Settings {
        lock(&self.settings).clone()
    }

    pub fn debug(&self) -> bool {
        self.debug_forced || lock(&self.settings).debug
    }

    pub fn status(&self) -> Status {
        lock(&self.server).status.clone()
    }

    pub fn origin(&self) -> String {
        self.origin
            .read()
            .map(|o| o.clone())
            .unwrap_or_else(|e| e.into_inner().clone())
    }

    pub fn is_quitting(&self) -> bool {
        self.quitting.load(Ordering::SeqCst)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn flush_gate_times_out_or_releases() {
        let gate = Arc::new(FlushGate::default());
        gate.arm();
        assert!(!gate.wait(Duration::from_millis(20)));
        gate.arm();
        let g = gate.clone();
        let t = std::thread::spawn(move || {
            std::thread::sleep(Duration::from_millis(20));
            g.release();
        });
        assert!(gate.wait(Duration::from_secs(5)));
        t.join().unwrap();
    }

    #[test]
    fn status_fields_serialize_for_the_pages() {
        let v = serde_json::to_value(Phase::PortInUse).unwrap();
        assert_eq!(v, "port_in_use");
        assert_eq!(serde_json::to_value(Phase::Stopped).unwrap(), "stopped");
        assert_eq!(
            serde_json::to_value(Phase::Restarting).unwrap(),
            "restarting"
        );
        assert_eq!(
            serde_json::to_value(ErrorCode::AddrInUse).unwrap(),
            "EADDRINUSE"
        );
        assert_eq!(serde_json::to_value(ErrorCode::Access).unwrap(), "EACCES");
        assert_eq!(serde_json::to_value(ErrorCode::Other).unwrap(), "OTHER");
        let rc = RunningConfig {
            listen: Listen::Lan,
            port: 3942,
            debug: true,
            allowed_hosts: vec!["panel.lan".into()],
            allow_remote_edit: true,
        };
        assert_eq!(
            serde_json::to_value(rc).unwrap(),
            serde_json::json!({ "listen": "lan", "port": 3942, "debug": true, "allowedHosts": ["panel.lan"], "allowRemoteEdit": true })
        );
    }

    #[test]
    fn a_stopped_launch_starts_stopped() {
        let paths = Paths {
            config_dir: "c".into(),
            log_dir: std::env::temp_dir(),
            resource_dir: "r".into(),
            data_dir: None,
        };
        let off = Settings {
            start_server: false,
            ..Settings::default()
        };
        let st = AppState::new(paths.clone(), "1.0.0".into(), off, false, true);
        assert_eq!(st.status().state, Phase::Stopped);
        let st = AppState::new(paths, "1.0.0".into(), Settings::default(), false, true);
        assert_eq!(st.status().state, Phase::Starting);
        assert!(st.status().running_config.is_none());
    }

    #[test]
    fn urls() {
        assert_eq!(
            studio_url("http://127.0.0.1:3942"),
            "http://127.0.0.1:3942/?studio=1"
        );
        assert_eq!(
            kiosk_url("http://127.0.0.1:3942"),
            "http://127.0.0.1:3942/?kiosk=1"
        );
    }
}
