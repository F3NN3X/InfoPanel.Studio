// The agents' unit tests (src/agents.rs): the reducers over the hook events and the statusline, the Claude session merge,
// what the kiosks get, and the live object's publish throttle.

use std::sync::atomic::AtomicUsize;

use super::*;
use crate::json::stringify;

fn ev(name: &str, more: Value) -> Value {
    let mut e = json!({ "hook_event_name": name, "session_id": "s1", "cwd": "E:\\GitHub\\MyRepos\\InfoPanel.Dashboard", "transcript_path": "C:\\secret\\t.jsonl", "prompt": "secret prompt" });
    e.as_object_mut().unwrap().extend(more.as_object().unwrap().clone());
    e
}

fn fresh() -> AgentsState {
    AgentsState { usage: json!({}), ..AgentsState::default() }
}

fn run(events: &[(Value, f64)], agent: &str) -> AgentsState {
    events.iter().fold(fresh(), |s, (e, t)| reduce_agents(&s, agent, e, *t).unwrap_or(s))
}

fn only(s: &AgentsState) -> &Session {
    &s.sessions[0].1
}

fn step(s: &AgentsState, agent: &str, e: Value, t: f64) -> AgentsState {
    reduce_agents(s, agent, &e, t).unwrap()
}

#[test]
fn follows_a_turn_working_waiting_and_done_with_its_duration() {
    let mut s = run(&[(ev("SessionStart", json!({})), 0.0), (ev("UserPromptSubmit", json!({})), 1000.0), (ev("PreToolUse", json!({ "tool_name": "Bash" })), 2000.0)], "claude");
    let session = only(&s);
    assert_eq!((session.project.as_str(), session.state.as_str(), session.tool.as_str(), session.since, session.turn_start), ("InfoPanel.Dashboard", "working", "Bash", 1000.0, Some(1000.0)));
    s = step(&s, "claude", ev("PermissionRequest", json!({ "tool_name": "Edit" })), 3000.0);
    assert_eq!((only(&s).state.as_str(), only(&s).tool.as_str(), only(&s).since), ("waiting", "Edit", 3000.0));
    s = step(&s, "claude", ev("PostToolUse", json!({})), 4000.0);
    assert_eq!(only(&s).state, "working");
    s = step(&s, "claude", ev("Stop", json!({})), 61_000.0);
    assert_eq!((only(&s).state.as_str(), only(&s).last_turn_ms, only(&s).turn_start, only(&s).tool.as_str()), ("done", Some(60_000.0), None, ""));
}

#[test]
fn waits_only_on_the_notifications_that_need_you() {
    let base = run(&[(ev("UserPromptSubmit", json!({})), 0.0)], "claude");
    assert_eq!(only(&step(&base, "claude", ev("Notification", json!({ "notification_type": "idle_prompt" })), 5.0)).state, "waiting");
    assert_eq!(only(&step(&base, "claude", ev("Notification", json!({ "notification_type": "auth_success" })), 5.0)).state, "working");
}

#[test]
fn counts_subagents_marks_a_failed_stop_and_drops_an_ended_session() {
    let s = run(&[(ev("UserPromptSubmit", json!({})), 0.0), (ev("SubagentStart", json!({})), 1.0), (ev("SubagentStart", json!({})), 2.0), (ev("SubagentStop", json!({})), 3.0)], "claude");
    assert_eq!(only(&s).subagents, 1);
    assert_eq!(only(&step(&s, "claude", ev("StopFailure", json!({})), 4.0)).state, "error");
    assert!(step(&s, "claude", ev("SessionEnd", json!({})), 5.0).sessions.is_empty());
    // The counter stops at 50 and at 0.
    let many = (0..60).fold(s, |s, i| step(&s, "claude", ev("SubagentStart", json!({})), 10.0 + f64::from(i)));
    assert_eq!(only(&many).subagents, 50);
    let none = (0..60).fold(many, |s, i| step(&s, "claude", ev("SubagentStop", json!({})), 100.0 + f64::from(i)));
    assert_eq!(only(&none).subagents, 0);
}

#[test]
fn sets_a_codex_turn_stopped_by_hand_back_to_idle() {
    let s = run(&[(ev("UserPromptSubmit", json!({})), 0.0), (ev("Interrupt", json!({})), 5.0)], "codex");
    assert_eq!((only(&s).state.as_str(), only(&s).turn_start), ("idle", None));
}

#[test]
fn keeps_codex_apart_from_claude_and_ignores_junk() {
    let mut s = run(&[(ev("UserPromptSubmit", json!({})), 0.0)], "claude");
    s = step(&s, "codex", ev("UserPromptSubmit", json!({ "cwd": "/home/me/proj" })), 1.0);
    assert_eq!(s.sessions.iter().map(|(_, x)| (x.agent.as_str(), x.project.as_str())).collect::<Vec<_>>(), [("claude", "InfoPanel.Dashboard"), ("codex", "proj")]);
    assert!(reduce_agents(&s, "gemini", &ev("Stop", json!({})), 2.0).is_none());
    for junk in [json!(null), json!(5), json!("x"), json!({ "hook_event_name": "Stop" }), json!({ "session_id": "s" }), json!({ "hook_event_name": 4, "session_id": "s" })] {
        assert!(reduce_agents(&s, "claude", &junk, 2.0).is_none(), "{junk}");
    }
}

#[test]
fn shows_an_mcp_tool_by_its_own_name() {
    assert_eq!(tool_of(Some(&json!("mcp__plugin_playwright_playwright__browser_run_code_unsafe"))), "browser_run_code_unsafe");
    assert_eq!(tool_of(Some(&json!("mcp__codegraph__codegraph_explore"))), "codegraph_explore");
    assert_eq!(tool_of(Some(&json!("mcp__nodoublepair"))), "mcp__nodoublepair");
    assert_eq!(tool_of(Some(&json!("Bash"))), "Bash");
    assert_eq!(tool_of(Some(&json!(5))), "");
}

#[test]
fn names_the_project_from_either_slash() {
    assert_eq!(project_of(Some(&json!("C:\\Users\\me\\repo\\"))), "repo");
    assert_eq!(project_of(Some(&json!("/srv/app"))), "app");
    assert_eq!(project_of(Some(&json!(42))), "");
    assert_eq!(project_of(Some(&json!("/"))), "");
    assert_eq!(project_of(Some(&json!(format!("/w/{}", "x".repeat(100))))).len(), 60);
}

#[test]
fn sends_the_kiosks_no_prompt_reply_tool_input_path_or_session_id() {
    let s = run(&[(ev("UserPromptSubmit", json!({})), 0.0), (ev("PreToolUse", json!({ "tool_name": "Bash", "tool_input": { "command": "cat ~/.ssh/id_rsa" } })), 1.0), (ev("Stop", json!({ "last_assistant_message": "secret reply" })), 2.0)], "claude");
    let public = public_agents(&s);
    let out = stringify(&public);
    for secret in ["secret", "ssh", "E:\\\\", "C:\\\\", "s1", "transcript"] {
        assert!(!out.contains(secret), "{secret}");
    }
    let key = public["sessions"][0]["key"].as_str().unwrap();
    assert!(key.len() == 12 && key.bytes().all(|b| b.is_ascii_hexdigit()));
}

#[test]
fn keeps_the_twelve_newest_sessions() {
    let s = (0..15).fold(fresh(), |s, i| {
        let mut e = ev("UserPromptSubmit", json!({}));
        e["session_id"] = json!(format!("s{i}"));
        step(&s, "claude", e, f64::from(i))
    });
    assert_eq!(s.sessions.len(), 12);
    assert!(s.sessions.iter().all(|(_, x)| x.last_seen >= 3.0));
}

#[test]
fn expires_working_sessions_after_the_stale_time_and_finished_ones_after_the_keep_time() {
    let working = run(&[(ev("UserPromptSubmit", json!({})), 0.0)], "claude");
    assert!(expire_agents(&working, STALE_MS - 1.0).is_none());
    assert!(expire_agents(&working, STALE_MS).unwrap().sessions.is_empty());
    let done = run(&[(ev("Stop", json!({})), 0.0)], "claude");
    assert!(expire_agents(&done, DONE_KEEP_MS - 1.0).is_none());
    assert!(expire_agents(&done, DONE_KEEP_MS).unwrap().sessions.is_empty());
}

fn live(state: &str, updated_at: Option<f64>) -> LiveSession {
    LiveSession { id: "f1".into(), project: "repo".into(), state: state.into(), updated_at, alive: None }
}

#[test]
fn adds_a_live_session_without_hooks_and_follows_its_file() {
    let a = merge_claude_sessions(&fresh(), &[live("working", Some(500.0))], 1000.0).unwrap();
    assert_eq!(a.sessions[0].1, Session { agent: "claude".into(), id: "f1".into(), project: "repo".into(), state: "working".into(), since: 500.0, turn_start: Some(500.0), tool: String::new(), subagents: 0, last_turn_ms: None, last_seen: 1000.0, hooked: false, context: None, cost: None, model: String::new() });
    let idle = merge_claude_sessions(&fresh(), &[live("idle", None)], 1000.0).unwrap();
    assert_eq!((idle.sessions[0].1.since, idle.sessions[0].1.turn_start), (1000.0, None));
    assert!(merge_claude_sessions(&a, &[live("working", Some(500.0))], 1000.0).is_none());
    let later = merge_claude_sessions(&a, &[live("working", Some(500.0))], 2000.0).unwrap();
    assert_eq!((later.sessions[0].1.last_seen, later.sessions[0].1.since), (2000.0, 500.0));
    let waiting = merge_claude_sessions(&later, &[live("waiting", None)], 3000.0).unwrap();
    assert_eq!((waiting.sessions[0].1.state.as_str(), waiting.sessions[0].1.since, waiting.sessions[0].1.turn_start), ("waiting", 3000.0, None));
}

#[test]
fn keeps_a_hooked_sessions_own_state_and_removes_an_unhooked_one_whose_file_is_gone() {
    let hooked = step(&fresh(), "claude", json!({ "hook_event_name": "Stop", "session_id": "f1", "cwd": "/x/repo" }), 10.0);
    let merged = merge_claude_sessions(&hooked, &[live("working", None)], 99.0).unwrap();
    assert_eq!((merged.sessions[0].1.state.as_str(), merged.sessions[0].1.last_seen), ("done", 99.0));
    assert!(merge_claude_sessions(&hooked, &[], 99.0).is_none());
    let unhooked = merge_claude_sessions(&fresh(), &[live("working", None)], 1000.0).unwrap();
    assert!(merge_claude_sessions(&unhooked, &[], 2000.0).unwrap().sessions.is_empty());
}

#[test]
fn drops_a_session_whose_process_ended_hooked_or_not() {
    let hooked = step(&fresh(), "claude", json!({ "hook_event_name": "UserPromptSubmit", "session_id": "f1" }), 0.0);
    let dead = LiveSession { alive: Some(false), ..live("working", None) };
    assert!(merge_claude_sessions(&hooked, std::slice::from_ref(&dead), 99.0).unwrap().sessions.is_empty());
    assert!(merge_claude_sessions(&fresh(), &[dead], 99.0).is_none());
}

#[test]
fn publishes_no_pid_hook_flag_or_session_id() {
    let hooked = step(&fresh(), "claude", json!({ "hook_event_name": "Stop", "session_id": "f1" }), 0.0);
    let s = merge_claude_sessions(&hooked, &[LiveSession { id: "g2".into(), ..live("idle", None) }], 1.0).unwrap();
    let out = stringify(&public_agents(&s));
    for leak in ["pid", "hooked", "f1", "g2", "\"id\""] {
        assert!(!out.contains(leak), "{leak}");
    }
}

fn statusline(s: &AgentsState, payload: Value, now: f64) -> AgentsState {
    reduce_statusline(s, &payload, now).unwrap_or_else(|| s.clone())
}

#[test]
fn reads_claudes_rate_limits_context_and_cost_from_the_statusline() {
    let s = run(&[(ev("UserPromptSubmit", json!({})), 0.0)], "claude");
    let s = statusline(&s, json!({ "session_id": "s1", "model": { "display_name": "Opus" }, "rate_limits": { "five_hour": { "used_percentage": 82, "resets_at": 1_760_000_000 }, "seven_day": { "used_percentage": 40 } }, "context_window": { "used_percentage": 37 }, "cost": { "total_cost_usd": 1.25 } }), 9.0);
    assert_eq!(stringify(&s.plan["claude"]), r#"{"fiveHour":{"used":82,"resetsAt":1760000000000},"sevenDay":{"used":40},"at":9}"#);
    let session = only(&s);
    assert_eq!((session.context, session.cost, session.model.as_str()), (Some(37.0), Some(1.25), "Opus"));
    // Without rate limits the plan stays as it was; a session id that names no session changes nothing.
    let same = statusline(&s, json!({ "session_id": "s1" }), 10.0);
    assert_eq!(same.plan, s.plan);
    assert!(reduce_statusline(&s, &json!({ "session_id": "nope" }), 10.0).is_none());
    assert!(reduce_statusline(&s, &json!(null), 10.0).is_none());
    assert!(reduce_statusline(&s, &json!("x"), 10.0).is_none());
}

#[test]
fn reads_per_model_weekly_windows_and_the_claude_code_version() {
    let mut s = statusline(&fresh(), json!({ "version": "2.1.220", "rate_limits": { "five_hour": { "used_percentage": 10 }, "seven_day_opus": { "used_percentage": 55, "resets_at": 1_760_000_000 }, "seven_day_sonnet": "junk", "seven_day_x": {}, "other": { "used_percentage": 5 } } }), 9.0);
    assert_eq!(stringify(&s.plan["claude"]), r#"{"fiveHour":{"used":10},"extra":[{"name":"opus","used":55,"resetsAt":1760000000000}],"version":"2.1.220","at":9}"#);
    assert!(!stringify(&statusline(&fresh(), json!({ "rate_limits": { "five_hour": { "used_percentage": 10 } } }), 1.0).plan["claude"]).contains("extra"));
    // The version alone still updates, keeping the plan's time; a later payload without one keeps it.
    s = statusline(&s, json!({ "version": "2.1.221" }), 20.0);
    assert_eq!((s.plan["claude"]["version"].as_str(), s.plan["claude"]["at"].as_i64(), s.plan["claude"]["fiveHour"]["used"].as_i64()), (Some("2.1.221"), Some(9), Some(10)));
    let s = statusline(&s, json!({ "rate_limits": { "five_hour": { "used_percentage": 11 } } }), 30.0);
    assert_eq!((s.plan["claude"]["version"].as_str(), s.plan["claude"]["at"].as_i64()), (Some("2.1.221"), Some(30)));
    assert_eq!(stringify(&statusline(&fresh(), json!({ "version": "2.1.220" }), 5.0).plan["claude"]), r#"{"version":"2.1.220","at":5}"#);
}

#[test]
fn clamps_windows_and_reads_times_as_seconds_ms_or_iso() {
    let s = statusline(&fresh(), json!({ "rate_limits": { "five_hour": { "used_percent": 250, "resets_at": "2026-10-15T10:00:00Z" }, "seven_day": { "used_percentage": -5, "resets_at": 1_760_000_000_000_i64 }, "seven_day_a": { "used_percentage": "5" } } }), 1.0);
    assert_eq!(stringify(&s.plan["claude"]), r#"{"fiveHour":{"used":100,"resetsAt":1792058400000},"sevenDay":{"used":0,"resetsAt":1760000000000},"at":1}"#);
}

#[test]
fn reads_codexs_primary_and_secondary_windows() {
    let s = codex_plan(&fresh(), &json!({ "primary": { "used_percent": 12.5, "window_minutes": 300, "resets_at": 1_760_000_000 }, "secondary": { "used_percent": 3, "window_minutes": 10080 } }), 5.0).unwrap();
    assert_eq!(stringify(&s.plan["codex"]), r#"{"fiveHour":{"used":12.5,"resetsAt":1760000000000},"sevenDay":{"used":3},"at":5}"#);
    // A free plan's primary window is the weekly one, but with no minutes over 360 it still reads as the short one.
    let free = codex_plan(&fresh(), &json!({ "primary": { "used_percent": 3, "window_minutes": 10080 }, "secondary": null }), 5.0).unwrap();
    assert_eq!(stringify(&free.plan["codex"]), r#"{"sevenDay":{"used":3},"at":5}"#);
    assert!(codex_plan(&fresh(), &json!(null), 5.0).is_none());
}

fn sources(live: Vec<LiveSession>, now: f64) -> Sources {
    // A folder that does not exist: the real home is never read.
    let usage = Arc::new(AgentUsage::new(&std::env::temp_dir().join("ips-agents-no-such-home")));
    Sources { usage, claude_sessions: Box::new(move || live.clone()), now: Box::new(move || now) }
}

#[tokio::test]
async fn lists_live_sessions_at_creation_and_publishes_once_for_a_burst() {
    let agents = Agents::new(sources(vec![live("working", None)], 5.0), Duration::from_millis(40));
    assert_eq!(agents.state()["sessions"].as_array().unwrap().len(), 1);
    let published = Arc::new(AtomicUsize::new(0));
    agents.set_on_change({
        let published = Arc::clone(&published);
        move || {
            published.fetch_add(1, Ordering::SeqCst);
        }
    });
    agents.event("claude", &ev("UserPromptSubmit", json!({})));
    agents.event("claude", &ev("PreToolUse", json!({ "tool_name": "Read" })));
    agents.statusline(&json!({ "session_id": "s1", "context_window": { "used_percentage": 5 } }));
    assert_eq!(published.load(Ordering::SeqCst), 0);
    tokio::time::sleep(Duration::from_millis(150)).await;
    assert_eq!(published.load(Ordering::SeqCst), 1);
    let state = agents.state();
    let session = state["sessions"].as_array().unwrap().iter().find(|s| s["project"] == "InfoPanel.Dashboard").unwrap();
    assert_eq!((&session["state"], &session["tool"], &session["context"]), (&json!("working"), &json!("Read"), &json!(5)));
    // A sweep that changes nothing the kiosks see publishes nothing.
    agents.refresh();
    tokio::time::sleep(Duration::from_millis(100)).await;
    assert_eq!(published.load(Ordering::SeqCst), 1);
}

#[test]
fn stamps_codexs_plan_with_when_codex_reported_it() {
    let home = tempfile::tempdir().unwrap();
    let rollout = home.path().join(".codex/sessions/2026/10/15/rollout-1.jsonl");
    std::fs::create_dir_all(rollout.parent().unwrap()).unwrap();
    let line = json!({ "timestamp": "2026-10-15T10:00:00Z", "type": "event_msg", "payload": { "type": "token_count", "info": null, "rate_limits": { "primary": { "used_percent": 9, "window_minutes": 300 } } } });
    std::fs::write(&rollout, format!("{line}\n")).unwrap();
    let usage = Arc::new(AgentUsage::with(home.path(), Box::new(|| 1_792_058_400_000.0), crate::ical::LocalZone::System, crate::agent_usage::CHUNK));
    usage.scan();
    let agents = Agents::new(Sources { usage, claude_sessions: Box::new(Vec::new), now: Box::new(|| 1_792_058_400_000.0 + 9000.0) }, Duration::from_millis(1));
    assert_eq!(stringify(&agents.state()["plan"]["codex"]), r#"{"fiveHour":{"used":9},"at":1792058400000}"#);
}
