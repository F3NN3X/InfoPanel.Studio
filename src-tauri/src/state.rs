// Shared app state: settings, the server's status and process, and the debug samples.

use crate::debug::History;
use crate::paths::Paths;
use crate::settings::{self, Settings};
use crate::sidecar::{RotatingLog, Sidecar};
use serde::Serialize;
use serde_json::Value;
use std::collections::{HashSet, VecDeque};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Condvar, Mutex, MutexGuard, RwLock};
use std::time::{Duration, Instant};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum Phase {
    Starting,
    Running,
    /// The app's server did not start or crashed too often.
    Failed,
    /// Another InfoPanel Studio server (e.g. start-dashboard.bat) holds the port.
    ForeignDashboard,
    /// Some other program holds the port.
    PortInUse,
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
}

pub fn studio_url(origin: &str) -> String {
    format!("{origin}/?studio=1")
}

pub fn kiosk_url(origin: &str) -> String {
    format!("{origin}/?kiosk=1")
}

pub struct Server {
    pub status: Status,
    pub sidecar: Option<Sidecar>,
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
            crate::sidecar::SERVER_LOG_MAX,
            crate::sidecar::SERVER_LOG_FILES,
        );
        let status = Status {
            state: Phase::Starting,
            owned: false,
            host: settings.host.clone(),
            port: settings.port,
            studio_url: studio_url(&origin),
            kiosk_url: kiosk_url(&origin),
            origin: origin.clone(),
            message: None,
            foreign_version: None,
            app_version: version.clone(),
            debug: settings.debug || debug_forced,
            pid: None,
        };
        Self {
            paths,
            version,
            debug_forced,
            settings: Mutex::new(settings),
            server: Mutex::new(Server {
                status,
                sidecar: None,
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
