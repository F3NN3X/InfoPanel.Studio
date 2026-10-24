// The server's log and restart budget: the rotated server.log the in-app server writes to, a hidden-window command
// helper, and the crash-restart limit.

use std::collections::VecDeque;
use std::fs::{File, OpenOptions};
use std::io::Write;
use std::path::{Path, PathBuf};
use std::process::Command;
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

pub fn timestamp() -> String {
    let secs = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    let (h, m, s) = ((secs / 3600) % 24, (secs / 60) % 60, secs % 60);
    format!("{h:02}:{m:02}:{s:02}Z")
}

#[cfg(test)]
mod tests {
    use super::*;

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
