// Claude Code's live sessions, from the files it writes itself: ~/.claude/sessions/<pid>.json (`pid`, `sessionId`, `cwd`,
// `status`, `updatedAt`) (server/claude-sessions.mjs). A session counts while its process is alive.
//
// Only the project folder's name, the state and a time are kept; the cwd is parsed and dropped.

use std::path::Path;

use serde_json::Value;
use sysinfo::{Pid, ProcessesToUpdate, System};

use crate::agents::{project_of, slice16, LiveSession};
use crate::js;
use crate::json::parse as parse_json;

/// A session file's id, pid, project, state ("working", "waiting", "idle") and update time.
#[derive(Debug, Clone, PartialEq)]
pub struct ClaudeSession {
    pub id: String,
    pub pid: u64,
    pub project: String,
    pub state: &'static str,
    pub updated_at: Option<f64>,
}

/// A session file's contents, or `None` when it is not one.
pub fn parse_claude_session(text: &str) -> Option<ClaudeSession> {
    let j = parse_json(text)?;
    if !j.is_object() {
        return None;
    }
    let pid = j.get("pid").and_then(Value::as_f64).filter(|p| p.fract() == 0.0 && *p > 0.0)?;
    let id = j.get("sessionId").and_then(Value::as_str).filter(|s| !s.is_empty())?;
    let state = match j.get("status").map(|s| js::to_property_key(Some(s))).as_deref() {
        Some("busy") => "working",
        Some("waiting") => "waiting",
        _ => "idle",
    };
    Some(ClaudeSession {
        id: slice16(id, 100),
        pid: pid as u64,
        project: project_of(j.get("cwd")),
        state,
        updated_at: j.get("updatedAt").and_then(Value::as_f64),
    })
}

/// Whether a process exists (one owned by someone else counts).
pub fn is_alive(pid: u64) -> bool {
    let Ok(pid) = u32::try_from(pid) else { return false };
    let mut system = System::new();
    let target = [Pid::from_u32(pid)];
    system.refresh_processes(ProcessesToUpdate::Some(&target), true);
    system.process(target[0]).is_some()
}

/// Every session file under `home`, each with whether its process is alive (a crash leaves the file behind).
pub fn read_claude_sessions(home: &Path, alive: &dyn Fn(u64) -> bool) -> Vec<LiveSession> {
    let dir = home.join(".claude").join("sessions");
    let Ok(entries) = std::fs::read_dir(&dir) else { return Vec::new() };
    entries
        .filter_map(Result::ok)
        .filter(|e| e.file_name().to_string_lossy().ends_with(".json"))
        .filter_map(|e| {
            let text = String::from_utf8_lossy(&std::fs::read(e.path()).ok()?).into_owned();
            let s = parse_claude_session(&text)?;
            Some(LiveSession { id: s.id, project: s.project, state: s.state.to_string(), updated_at: s.updated_at, alive: Some(alive(s.pid)) })
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_a_session_file() {
        let s = parse_claude_session(r#"{"pid":4242,"sessionId":"abc","cwd":"E:\\GitHub\\repo\\","status":"busy","updatedAt":1760000000000,"name":"x"}"#).unwrap();
        assert_eq!(s, ClaudeSession { id: "abc".into(), pid: 4242, project: "repo".into(), state: "working", updated_at: Some(1_760_000_000_000.0) });
        let waiting = parse_claude_session(r#"{"pid":1,"sessionId":"s","status":"waiting"}"#).unwrap();
        assert_eq!((waiting.state, waiting.project.as_str(), waiting.updated_at), ("waiting", "", None));
    }

    #[test]
    fn maps_other_states_to_idle_and_keeps_the_id_to_100() {
        for status in [r#""idle""#, r#""other""#, "null", "5"] {
            assert_eq!(parse_claude_session(&format!(r#"{{"pid":1,"sessionId":"s","status":{status}}}"#)).unwrap().state, "idle");
        }
        let long = format!(r#"{{"pid":1,"sessionId":"{}"}}"#, "x".repeat(150));
        assert_eq!(parse_claude_session(&long).unwrap().id.len(), 100);
    }

    #[test]
    fn rejects_what_is_not_a_session() {
        for text in ["", "{", "null", "[]", "5", r#"{"sessionId":"s"}"#, r#"{"pid":0,"sessionId":"s"}"#, r#"{"pid":-3,"sessionId":"s"}"#, r#"{"pid":1.5,"sessionId":"s"}"#, r#"{"pid":"7","sessionId":"s"}"#, r#"{"pid":7}"#, r#"{"pid":7,"sessionId":""}"#, r#"{"pid":7,"sessionId":9}"#] {
            assert_eq!(parse_claude_session(text), None, "{text}");
        }
        // updatedAt must be a number.
        assert_eq!(parse_claude_session(r#"{"pid":1,"sessionId":"s","updatedAt":"now"}"#).unwrap().updated_at, None);
    }

    #[test]
    fn reads_the_json_files_of_a_sessions_folder_with_their_liveness() {
        let home = tempfile::tempdir().unwrap();
        let dir = home.path().join(".claude").join("sessions");
        std::fs::create_dir_all(dir.join("folder.json")).unwrap();
        std::fs::write(dir.join("1.json"), r#"{"pid":11,"sessionId":"live","cwd":"/w/a","status":"busy"}"#).unwrap();
        std::fs::write(dir.join("2.json"), r#"{"pid":22,"sessionId":"dead","cwd":"/w/b"}"#).unwrap();
        std::fs::write(dir.join("3.json"), "not json").unwrap();
        std::fs::write(dir.join("4.txt"), r#"{"pid":44,"sessionId":"txt"}"#).unwrap();
        let mut found = read_claude_sessions(home.path(), &|pid| pid == 11);
        found.sort_by(|a, b| a.id.cmp(&b.id));
        assert_eq!(found.iter().map(|s| (s.id.as_str(), s.project.as_str(), s.state.as_str(), s.alive)).collect::<Vec<_>>(), [("dead", "b", "idle", Some(false)), ("live", "a", "working", Some(true))]);
        assert!(read_claude_sessions(&home.path().join("none"), &|_| true).is_empty());
    }

    #[test]
    fn knows_this_process_is_alive_and_a_huge_pid_is_not() {
        assert!(is_alive(u64::from(std::process::id())));
        assert!(!is_alive(u64::MAX));
    }
}
