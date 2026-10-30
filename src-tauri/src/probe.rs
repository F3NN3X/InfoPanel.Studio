// What answers on the server port before the app starts its own server, and who owns it.

use crate::http::{self, HttpError, Response};
use serde::Serialize;
use std::time::Duration;

pub const HEALTH_PATH: &str = "/api/health";
pub const PROBE_TIMEOUT: Duration = Duration::from_millis(1500);
/// The app id servers answer with on /api/health. It keeps the pre-rename name so every installed
/// version still recognises the others as its own server.
pub const DASHBOARD_APP: &str = "infopanel-dashboard";

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum Probe {
    /// Nothing listens: the app can start its server.
    Free,
    /// An InfoPanel Studio server answers.
    Dashboard { version: Option<String> },
    /// Something else holds the port (wrong body, 404, 421, no answer).
    Other { detail: String },
}

pub fn classify_probe(result: &Result<Response, HttpError>) -> Probe {
    match result {
        Err(HttpError::Refused) => Probe::Free,
        Err(HttpError::Timeout) => Probe::Other {
            detail: "it accepted the connection but did not answer".into(),
        },
        Err(HttpError::Other(e)) => Probe::Other { detail: e.clone() },
        Ok(r) if r.status == 200 => {
            let body: Option<serde_json::Value> = serde_json::from_str(&r.body).ok();
            match body {
                Some(v) if v.get("app").and_then(|a| a.as_str()) == Some(DASHBOARD_APP) => {
                    Probe::Dashboard {
                        version: v.get("version").and_then(|a| a.as_str()).map(str::to_owned),
                    }
                }
                _ => Probe::Other {
                    detail: "it answered, but not as an InfoPanel Studio server".into(),
                },
            }
        }
        Ok(r) => Probe::Other {
            detail: format!("it answered {} to {HEALTH_PATH}", r.status),
        },
    }
}

pub fn probe(host: &str, port: u16, timeout: Duration) -> Probe {
    classify_probe(&http::get(host, port, HEALTH_PATH, timeout))
}

/// True when nothing listens on `port` for `host` (or for loopback) and the port can be bound.
pub fn is_port_free(host: &str, port: u16) -> bool {
    std::net::TcpListener::bind((host, port)).is_ok()
        && std::net::TcpListener::bind(("127.0.0.1", port)).is_ok()
        && listener_pid(port).is_none()
}

/// The PID listening on TCP `port`, from one `netstat -ano` line. Listening sockets are told
/// apart by their remote address (`0.0.0.0:0` / `[::]:0`), which, unlike the state column, is
/// not translated.
pub fn parse_listener_pid(netstat: &str, port: u16) -> Option<u32> {
    let suffix = format!(":{port}");
    netstat.lines().find_map(|line| {
        let cols: Vec<&str> = line.split_whitespace().collect();
        if cols.len() < 4 || !cols[0].eq_ignore_ascii_case("TCP") {
            return None;
        }
        if !cols[1].ends_with(&suffix) || !matches!(cols[2], "0.0.0.0:0" | "[::]:0") {
            return None;
        }
        cols.last()?.parse().ok().filter(|pid| *pid != 0)
    })
}

pub fn listener_pid(port: u16) -> Option<u32> {
    let out = crate::server_log::hidden_command("netstat")
        .args(["-ano", "-p", "TCP"])
        .output()
        .ok()?;
    let text = String::from_utf8_lossy(&out.stdout);
    parse_listener_pid(&text, port).or_else(|| {
        // IPv6 listeners only show without `-p TCP`.
        let out = crate::server_log::hidden_command("netstat")
            .arg("-ano")
            .output()
            .ok()?;
        parse_listener_pid(&String::from_utf8_lossy(&out.stdout), port)
    })
}

#[derive(Debug, Clone, Serialize)]
pub struct ProcessInfo {
    pub pid: u32,
    /// The image name, e.g. `ips-server.exe`.
    pub name: String,
    /// The full executable path when Windows lets us read it.
    pub exe: Option<String>,
    /// Owned by the same user as this app; false when either owner is unknown.
    #[serde(skip)]
    pub same_user: bool,
}

pub fn process_info(pid: u32) -> Option<ProcessInfo> {
    use sysinfo::{Pid, ProcessRefreshKind, ProcessesToUpdate, System, UpdateKind};
    let mut sys = System::new();
    let spid = Pid::from_u32(pid);
    let own = Pid::from_u32(std::process::id());
    // The same pid twice makes sysinfo find neither.
    let pids = if spid == own {
        vec![spid]
    } else {
        vec![spid, own]
    };
    sys.refresh_processes_specifics(
        ProcessesToUpdate::Some(&pids),
        true,
        ProcessRefreshKind::nothing()
            .with_exe(UpdateKind::Always)
            .with_user(UpdateKind::Always),
    );
    let p = sys.process(spid)?;
    let same_user = match (p.user_id(), sys.process(own).and_then(|o| o.user_id())) {
        (Some(a), Some(b)) => a == b,
        _ => false,
    };
    Some(ProcessInfo {
        pid,
        name: p.name().to_string_lossy().into_owned(),
        exe: p.exe().map(|e| e.to_string_lossy().into_owned()),
        same_user,
    })
}

/// ips-server run on its own (`cargo run -p ips-server` from a checkout): a dashboard server by its image name.
pub fn is_ips_server(info: &ProcessInfo) -> bool {
    info.name.eq_ignore_ascii_case("ips-server.exe") || info.name == "ips-server"
}

/// Only an ips-server owned by the current user may be adopted as the session's server. The app never stops one
/// for the user: it is a developer's from-source run.
pub fn may_adopt(info: &ProcessInfo) -> bool {
    is_ips_server(info) && info.same_user
}

#[cfg(test)]
mod tests {
    use super::*;

    fn ok(status: u16, body: &str) -> Result<Response, HttpError> {
        Ok(Response {
            status,
            body: body.into(),
        })
    }

    #[test]
    fn refused_is_free() {
        assert_eq!(classify_probe(&Err(HttpError::Refused)), Probe::Free);
    }

    #[test]
    fn health_body_is_a_dashboard() {
        let r = ok(
            200,
            r#"{"app":"infopanel-dashboard","version":"1.0.0","configVersion":4}"#,
        );
        assert_eq!(
            classify_probe(&r),
            Probe::Dashboard {
                version: Some("1.0.0".into())
            }
        );
    }

    #[test]
    fn anything_else_is_another_program() {
        for r in [
            ok(200, r#"{"app":"something"}"#),
            ok(200, "<html>"),
            ok(404, "Not found"),
            ok(421, "Misdirected"),
            Err(HttpError::Timeout),
            Err(HttpError::Other("reset".into())),
        ] {
            assert!(matches!(classify_probe(&r), Probe::Other { .. }), "{r:?}");
        }
    }

    const NETSTAT: &str = "
Active Connections

  Proto  Local Address          Foreign Address        State           PID
  TCP    0.0.0.0:135            0.0.0.0:0              LISTENING       1200
  TCP    127.0.0.1:3922         127.0.0.1:50123        ESTABLISHED     4444
  TCP    127.0.0.1:3922         0.0.0.0:0              ABHÖREN         5150
  TCP    [::]:3942              [::]:0                 LISTENING       6060
  UDP    0.0.0.0:3922           *:*                                    7070
";

    #[test]
    fn finds_the_listening_pid_in_any_language() {
        assert_eq!(parse_listener_pid(NETSTAT, 3922), Some(5150));
        assert_eq!(parse_listener_pid(NETSTAT, 3942), Some(6060));
        assert_eq!(parse_listener_pid(NETSTAT, 135), Some(1200));
        assert_eq!(parse_listener_pid(NETSTAT, 39220), None);
        assert_eq!(parse_listener_pid(NETSTAT, 922), None);
    }

    #[test]
    fn only_an_ips_server_of_the_same_user_is_adoptable() {
        let info = |name: &str, same_user: bool| ProcessInfo {
            pid: 1,
            name: name.into(),
            exe: None,
            same_user,
        };
        assert!(
            !may_adopt(&info("node.exe", true)),
            "a Node server is just another app"
        );
        assert!(!may_adopt(&info("InfoPanel.exe", true)));
        assert!(may_adopt(&info("ips-server.exe", true)));
        assert!(may_adopt(&info("IPS-SERVER.EXE", true)));
        assert!(!may_adopt(&info("ips-server.exe", false)));
        assert!(!may_adopt(&info("ips-agent.exe", true)));
    }

    #[test]
    fn reads_the_owner_of_a_real_process() {
        // A child this test starts is, by definition, the current user's.
        let mut child = std::process::Command::new("cmd")
            .args(["/C", "ping -n 3 127.0.0.1 >NUL"])
            .spawn()
            .expect("spawn");
        let info = process_info(child.id());
        let own = process_info(std::process::id());
        let _ = child.kill();
        let _ = child.wait();
        let info = info.expect("child process");
        assert!(info.same_user, "child not seen as the same user");
        assert!(own.is_some(), "own process not found");
    }
}
