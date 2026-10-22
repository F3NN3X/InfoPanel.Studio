// The bundled server: node.exe running server.mjs, its environment, its rotated log and the
// crash-restart budget.

use crate::paths::{self, Paths};
use crate::settings::Settings;
use crate::state::ErrorCode;
use std::collections::VecDeque;
use std::fs::{File, OpenOptions};
use std::io::{BufRead, BufReader, Write};
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

pub const SERVER_LOG_MAX: u64 = 1024 * 1024;
pub const SERVER_LOG_FILES: usize = 3;
pub const MAX_RESTARTS: usize = 3;
pub const RESTART_WINDOW: Duration = Duration::from_secs(60);

/// A command that never flashes a console window.
pub fn hidden_command(program: impl AsRef<std::ffi::OsStr>) -> Command {
    #[allow(unused_mut)]
    let mut cmd = Command::new(program);
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }
    cmd
}

/// The server's environment for these settings.
pub fn sidecar_env(s: &Settings, paths: &Paths, debug: bool) -> Vec<(&'static str, String)> {
    let mut env = vec![
        ("PORT", s.port.to_string()),
        ("HOST", s.host().into()),
        ("ALLOWED_HOSTS", s.allowed_hosts.join(",")),
        ("DASHBOARD_DIST", paths::display(&paths.dist_dir())),
        ("DASHBOARD_DEBUG", if debug { "1" } else { "0" }.into()),
    ];
    if s.allow_remote_edit {
        env.push(("ALLOW_REMOTE_EDIT", "1".into()));
    }
    if let Some(dir) = &paths.data_dir {
        env.push(("DASHBOARD_DATA_DIR", paths::display(dir)));
    }
    env
}

/// Whether one more crash restart fits in the budget (3 per minute); records it when it does.
pub fn allow_restart(history: &mut VecDeque<Instant>, now: Instant) -> bool {
    while history
        .front()
        .is_some_and(|t| now.duration_since(*t) >= RESTART_WINDOW)
    {
        history.pop_front();
    }
    if history.len() >= MAX_RESTARTS {
        return false;
    }
    history.push_back(now);
    true
}

/// A log file rotated by size: `<name>.log`, `<name>.1.log`, … up to `keep` files.
pub struct RotatingLog {
    dir: PathBuf,
    name: String,
    max: u64,
    keep: usize,
    file: Option<File>,
    size: u64,
}

impl RotatingLog {
    pub fn new(dir: &Path, name: &str, max: u64, keep: usize) -> Self {
        Self {
            dir: dir.to_path_buf(),
            name: name.into(),
            max,
            keep: keep.max(1),
            file: None,
            size: 0,
        }
    }

    fn path(&self, index: usize) -> PathBuf {
        if index == 0 {
            self.dir.join(format!("{}.log", self.name))
        } else {
            self.dir.join(format!("{}.{index}.log", self.name))
        }
    }

    fn open(&mut self) -> std::io::Result<()> {
        std::fs::create_dir_all(&self.dir)?;
        let file = OpenOptions::new()
            .create(true)
            .append(true)
            .open(self.path(0))?;
        self.size = file.metadata()?.len();
        self.file = Some(file);
        Ok(())
    }

    fn rotate(&mut self) -> std::io::Result<()> {
        self.file = None;
        let _ = std::fs::remove_file(self.path(self.keep - 1));
        for i in (0..self.keep - 1).rev() {
            let from = self.path(i);
            if from.exists() {
                std::fs::rename(&from, self.path(i + 1))?;
            }
        }
        self.open()
    }

    pub fn write_line(&mut self, line: &str) -> std::io::Result<()> {
        if self.file.is_none() {
            self.open()?;
        }
        if self.size > 0 && self.size + line.len() as u64 + 1 > self.max {
            self.rotate()?;
        }
        if let Some(f) = self.file.as_mut() {
            writeln!(f, "{line}")?;
            self.size += line.len() as u64 + 1;
        }
        Ok(())
    }
}

/// The last `n` lines of `<name>.log`, reaching into `<name>.1.log` when the current file is short.
pub fn tail(dir: &Path, name: &str, n: usize) -> String {
    let read = |p: PathBuf| std::fs::read_to_string(p).unwrap_or_default();
    let current = read(dir.join(format!("{name}.log")));
    let mut lines: Vec<&str> = current.lines().collect();
    let previous;
    if lines.len() < n {
        previous = read(dir.join(format!("{name}.1.log")));
        let mut older: Vec<&str> = previous.lines().collect();
        older.extend(lines);
        lines = older;
    }
    let start = lines.len().saturating_sub(n);
    lines[start..].join("\n")
}

fn timestamp() -> String {
    let secs = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    let (h, m, s) = ((secs / 3600) % 24, (secs / 60) % 60, secs % 60);
    format!("{h:02}:{m:02}:{s:02}Z")
}

/// The bind failure a server output line reports: node's `Error: listen EADDRINUSE: ...`. Other
/// EACCES errors (a file it can't open) are not a port problem.
pub fn parse_bind_error(line: &str) -> Option<ErrorCode> {
    if line.contains("listen EADDRINUSE") {
        Some(ErrorCode::AddrInUse)
    } else if line.contains("listen EACCES") {
        Some(ErrorCode::Access)
    } else {
        None
    }
}

/// A running server process. Stdout and stderr go to the shared log.
pub struct Sidecar {
    pub child: Child,
    pub pid: u32,
    /// The bind failure the output reported, if any.
    pub bind_error: Arc<Mutex<Option<ErrorCode>>>,
    readers: Vec<std::thread::JoinHandle<()>>,
}

impl Sidecar {
    /// After the process exited: waits (at most `timeout`) for its last output lines to be read,
    /// then returns the bind failure they reported.
    pub fn exit_error(&self, timeout: Duration) -> Option<ErrorCode> {
        let deadline = Instant::now() + timeout;
        while self.readers.iter().any(|r| !r.is_finished()) && Instant::now() < deadline {
            std::thread::sleep(Duration::from_millis(20));
        }
        *self.bind_error.lock().unwrap_or_else(|e| e.into_inner())
    }
}

pub fn spawn(
    s: &Settings,
    paths: &Paths,
    debug: bool,
    log: Arc<Mutex<RotatingLog>>,
) -> std::io::Result<Sidecar> {
    let node = paths.node_exe();
    let script = paths.server_script();
    if !node.exists() || !script.exists() {
        return Err(std::io::Error::new(
            std::io::ErrorKind::NotFound,
            format!(
                "the bundled server is missing ({} / {})",
                paths::display(&node),
                paths::display(&script)
            ),
        ));
    }
    let mut cmd = hidden_command(paths::display(&node));
    cmd.arg(paths::display(&script))
        .current_dir(paths::display(&paths.app_dir()))
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    for (key, value) in sidecar_env(s, paths, debug) {
        cmd.env(key, value);
    }
    if paths.data_dir.is_none() {
        cmd.env_remove("DASHBOARD_DATA_DIR");
    }
    let mut child = cmd.spawn()?;
    let pid = child.id();
    if !job::adopt(&child) {
        log::warn!("server (pid {pid}) is not tied to the app: it may outlive a crash");
    }
    if let Ok(mut l) = log.lock() {
        let _ = l.write_line(&format!(
            "[{}] --- starting server (pid {pid}) on {}:{} ---",
            timestamp(),
            s.host(),
            s.port
        ));
    }
    let pipes: [Option<Box<dyn std::io::Read + Send>>; 2] = [
        child
            .stdout
            .take()
            .map(|p| Box::new(p) as Box<dyn std::io::Read + Send>),
        child
            .stderr
            .take()
            .map(|p| Box::new(p) as Box<dyn std::io::Read + Send>),
    ];
    let bind_error = Arc::new(Mutex::new(None));
    let mut readers = Vec::new();
    for pipe in pipes.into_iter().flatten() {
        let log = log.clone();
        let bind_error = bind_error.clone();
        readers.push(std::thread::spawn(move || {
            for line in BufReader::new(pipe).lines().map_while(Result::ok) {
                if let Some(code) = parse_bind_error(&line) {
                    let mut slot = bind_error.lock().unwrap_or_else(|e| e.into_inner());
                    slot.get_or_insert(code);
                }
                if let Ok(mut l) = log.lock() {
                    let _ = l.write_line(&line);
                }
            }
        }));
    }
    Ok(Sidecar {
        child,
        pid,
        bind_error,
        readers,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn paths(data: Option<&str>) -> Paths {
        Paths {
            config_dir: "c".into(),
            log_dir: "l".into(),
            resource_dir: PathBuf::from(r"\\?\C:\Apps\Studio"),
            data_dir: data.map(PathBuf::from),
        }
    }

    fn get<'a>(env: &'a [(&str, String)], key: &str) -> Option<&'a str> {
        env.iter().find(|(k, _)| *k == key).map(|(_, v)| v.as_str())
    }

    #[test]
    fn env_carries_host_port_and_dist() {
        let s = Settings {
            listen: crate::settings::Listen::Lan,
            port: 3942,
            allowed_hosts: vec!["panel.lan".into(), "kiosk".into()],
            ..Settings::default()
        };
        let env = sidecar_env(&s, &paths(None), false);
        assert_eq!(get(&env, "PORT"), Some("3942"));
        assert_eq!(get(&env, "HOST"), Some("0.0.0.0"));
        assert_eq!(get(&env, "ALLOWED_HOSTS"), Some("panel.lan,kiosk"));
        assert_eq!(
            get(&env, "DASHBOARD_DIST"),
            Some(r"C:\Apps\Studio\app\dist")
        );
        assert_eq!(get(&env, "DASHBOARD_DEBUG"), Some("0"));
        assert_eq!(get(&env, "DASHBOARD_DATA_DIR"), None);
    }

    #[test]
    fn env_passes_debug_and_test_data_dir() {
        let env = sidecar_env(&Settings::default(), &paths(Some(r"D:\tmp\data")), true);
        assert_eq!(get(&env, "DASHBOARD_DEBUG"), Some("1"));
        assert_eq!(get(&env, "DASHBOARD_DATA_DIR"), Some(r"D:\tmp\data"));
        assert_eq!(get(&env, "ALLOWED_HOSTS"), Some(""));
    }

    #[test]
    fn env_allows_remote_edit_only_when_on() {
        let off = sidecar_env(&Settings::default(), &paths(None), false);
        assert_eq!(get(&off, "ALLOW_REMOTE_EDIT"), None);
        let s = Settings {
            allow_remote_edit: true,
            ..Settings::default()
        };
        assert_eq!(get(&sidecar_env(&s, &paths(None), false), "ALLOW_REMOTE_EDIT"), Some("1"));
    }

    #[test]
    fn env_binds_loopback_for_local() {
        let env = sidecar_env(&Settings::default(), &paths(None), false);
        assert_eq!(get(&env, "HOST"), Some("127.0.0.1"));
    }

    #[test]
    fn bind_errors_are_read_from_node_output() {
        assert_eq!(
            parse_bind_error("Error: listen EADDRINUSE: address already in use 127.0.0.1:3922"),
            Some(ErrorCode::AddrInUse)
        );
        assert_eq!(
            parse_bind_error("Error: listen EACCES: permission denied 0.0.0.0:80"),
            Some(ErrorCode::Access)
        );
        for not_bind in [
            "Error: EACCES: permission denied, open 'C:\\data\\config.json'",
            "  code: 'EACCES',",
            "  code: 'EADDRINUSE',",
            "[debug] GET /api/health 200 1ms",
        ] {
            assert_eq!(parse_bind_error(not_bind), None, "{not_bind}");
        }
        assert_eq!(
            parse_bind_error("InfoPanel Studio on http://127.0.0.1:3922"),
            None
        );
    }

    #[test]
    fn restart_budget_is_three_per_minute() {
        let mut h = VecDeque::new();
        let t0 = Instant::now();
        assert!(allow_restart(&mut h, t0));
        assert!(allow_restart(&mut h, t0 + Duration::from_secs(1)));
        assert!(allow_restart(&mut h, t0 + Duration::from_secs(2)));
        assert!(!allow_restart(&mut h, t0 + Duration::from_secs(3)));
        assert!(allow_restart(&mut h, t0 + Duration::from_secs(61)));
    }

    #[test]
    fn log_rotates_and_tails() {
        let dir = std::env::temp_dir().join(format!("ips-log-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        let mut log = RotatingLog::new(&dir, "server", 40, 3);
        for i in 0..20 {
            log.write_line(&format!("line {i:02}")).unwrap();
        }
        assert!(dir.join("server.log").exists());
        assert!(dir.join("server.1.log").exists());
        assert!(dir.join("server.2.log").exists());
        assert!(!dir.join("server.3.log").exists());
        let t = tail(&dir, "server", 5);
        assert_eq!(t.lines().count(), 5);
        assert!(t.ends_with("line 19"));
        let _ = std::fs::remove_dir_all(&dir);
    }
}

/// Every server the app starts joins one job object that kills its processes when the job's last
/// handle closes, which is when the app exits for any reason (crash or `taskkill /F` included), so
/// a server never outlives the app that started it.
#[cfg(windows)]
mod job {
    use std::os::windows::io::AsRawHandle;
    use std::sync::OnceLock;
    use windows_sys::Win32::Foundation::{CloseHandle, HANDLE};
    use windows_sys::Win32::System::JobObjects::{
        AssignProcessToJobObject, CreateJobObjectW, JobObjectExtendedLimitInformation,
        SetInformationJobObject, JOBOBJECT_EXTENDED_LIMIT_INFORMATION,
        JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE,
    };

    /// The job handle as an address (a raw HANDLE is not Send); 0 when it could not be made.
    static JOB: OnceLock<usize> = OnceLock::new();

    fn handle() -> Option<HANDLE> {
        let job = *JOB.get_or_init(|| unsafe {
            let job = CreateJobObjectW(std::ptr::null(), std::ptr::null());
            if job.is_null() {
                return 0;
            }
            let mut info: JOBOBJECT_EXTENDED_LIMIT_INFORMATION = std::mem::zeroed();
            info.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;
            let ok = SetInformationJobObject(
                job,
                JobObjectExtendedLimitInformation,
                (&info as *const JOBOBJECT_EXTENDED_LIMIT_INFORMATION).cast(),
                std::mem::size_of::<JOBOBJECT_EXTENDED_LIMIT_INFORMATION>() as u32,
            );
            if ok == 0 {
                CloseHandle(job);
                return 0;
            }
            // Never closed: the handle lives as long as the app.
            job as usize
        });
        (job != 0).then_some(job as HANDLE)
    }

    pub fn adopt(child: &std::process::Child) -> bool {
        handle().is_some_and(|job| unsafe {
            AssignProcessToJobObject(job, child.as_raw_handle() as HANDLE) != 0
        })
    }
}

#[cfg(not(windows))]
mod job {
    pub fn adopt(_child: &std::process::Child) -> bool {
        true
    }
}
