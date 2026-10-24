// The parity fixtures for the coding agents (agents, agent-usage, claude-sessions; tests/fixtures/parity/*.json, written once from the Node server (removed; tests/fixtures/parity/README.md)): each case's input through the native function must give the
// Node output exactly. The scans and the local days are read in Europe/Oslo, the zone the fixtures were built in.

use std::path::PathBuf;

use ips_server::agent_usage::{claude_line, codex_context, codex_line, model_of, root_of, AgentUsage, CHUNK};
use ips_server::agents::{codex_plan, expire_agents, merge_claude_sessions, project_of, public_agents, reduce_agents, reduce_statusline, tool_of, AgentsState, LiveSession};
use ips_server::claude_sessions::{parse_claude_session, read_claude_sessions};
use ips_server::ical::LocalZone;
use ips_server::js_date::day_key;
use ips_server::json::stringify;
use serde_json::{json, Value};

const ZONE: LocalZone = LocalZone::Pinned(chrono_tz::Europe::Oslo);

fn cases(module: &str) -> Vec<(Value, Value)> {
    let file = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../../tests/fixtures/parity").join(format!("{module}.json"));
    let text = std::fs::read_to_string(&file).unwrap_or_else(|e| panic!("{}: {e}", file.display()));
    let list: Vec<Value> = serde_json::from_str(&text).unwrap();
    assert!(!list.is_empty(), "{module}: no cases");
    list.into_iter().map(|case| (case["input"].clone(), case["output"].clone())).collect()
}

fn str_of<'a>(v: &'a Value, key: &str) -> &'a str {
    v.get(key).and_then(Value::as_str).unwrap_or_default()
}

/// Compares as JSON text, so key order counts.
fn same(module: &str, input: &Value, got: &Value, want: &Value) {
    let shown = stringify(input);
    assert_eq!(stringify(got), stringify(want), "{module}: {}", &shown[..shown.len().min(500)]);
}

/// A reducer's answer in the fixtures' shape: whether the state came back untouched, and the state after. The sessions keep
/// their order and the plan its key order; a session's own key order is not part of what clients see.
fn step(module: &str, input: &Value, next: Option<AgentsState>, before: &AgentsState, want: &Value) {
    let after = next.as_ref().unwrap_or(before);
    assert_eq!(next.is_none(), want["same"].as_bool().unwrap(), "{module}: same? {}", stringify(input));
    let got = after.to_json();
    let expected = &want["state"];
    let keys = |v: &Value| v["sessions"].as_object().unwrap().keys().cloned().collect::<Vec<_>>();
    assert_eq!(keys(&got), keys(expected), "{module}: session order {}", stringify(input));
    assert_eq!(got, *expected, "{module}: {}", stringify(input));
    assert_eq!(stringify(&got["plan"]), stringify(&expected["plan"]), "{module}: plan order {}", stringify(input));
}

fn live_of(v: &Value) -> LiveSession {
    LiveSession {
        id: str_of(v, "id").into(),
        project: str_of(v, "project").into(),
        state: str_of(v, "state").into(),
        updated_at: v.get("updatedAt").and_then(Value::as_f64),
        alive: v.get("alive").and_then(Value::as_bool),
    }
}

#[test]
fn agents() {
    for (input, want) in cases("agents") {
        let now = input["now"].as_f64().unwrap_or(0.0);
        let state = AgentsState::from_json(&input["state"]);
        match str_of(&input, "fn") {
            "projectOf" => assert_eq!(json!(project_of(Some(&input["value"]))), want, "{input}"),
            "toolOf" => assert_eq!(json!(tool_of(Some(&input["value"]))), want, "{input}"),
            "reduceAgents" => step("agents", &input, reduce_agents(&state, str_of(&input, "agent"), &input["event"], now), &state, &want),
            "mergeClaudeSessions" => {
                let live: Vec<LiveSession> = input["live"].as_array().unwrap().iter().map(live_of).collect();
                step("agents", &input, merge_claude_sessions(&state, &live, now), &state, &want);
            }
            "expireAgents" => step("agents", &input, expire_agents(&state, now), &state, &want),
            "reduceStatusline" => step("agents", &input, reduce_statusline(&state, &input["payload"], now), &state, &want),
            "codexPlan" => step("agents", &input, codex_plan(&state, &input["limits"], now), &state, &want),
            "publicAgents" => same("agents", &input, &public_agents(&state), &want),
            other => panic!("unknown fn {other}"),
        }
    }
}

#[test]
fn claude_sessions() {
    for (input, want) in cases("claude-sessions") {
        match str_of(&input, "fn") {
            "parseClaudeSession" => {
                let got = parse_claude_session(str_of(&input, "text")).map_or(Value::Null, |s| {
                    json!({ "id": s.id, "pid": s.pid, "project": s.project, "state": s.state, "updatedAt": s.updated_at.map_or(Value::Null, ips_server::agents::num) })
                });
                same("claude-sessions", &input, &got, &want);
            }
            "readClaudeSessions" => {
                let home = tempfile::tempdir().unwrap();
                let dir = home.path().join(".claude").join("sessions");
                std::fs::create_dir_all(&dir).unwrap();
                for (name, text) in input["files"].as_object().unwrap() {
                    match text.as_str() {
                        Some(text) => std::fs::write(dir.join(name), text).unwrap(),
                        None => std::fs::create_dir_all(dir.join(name.trim_end_matches('/'))).unwrap(),
                    }
                }
                let alive: Vec<u64> = input["alive"].as_array().unwrap().iter().filter_map(Value::as_u64).collect();
                let mut found = read_claude_sessions(home.path(), &|pid| alive.contains(&pid));
                found.sort_by(|a, b| a.id.cmp(&b.id));
                // The fixture lists the files' pids; the session carries `alive` and the fields the merge reads.
                let got: Vec<Value> = found.iter().map(|s| json!({ "id": s.id, "project": s.project, "state": s.state, "updatedAt": s.updated_at.map_or(Value::Null, ips_server::agents::num), "alive": s.alive })).collect();
                let want: Vec<Value> = want.as_array().unwrap().iter().map(|s| json!({ "id": s["id"], "project": s["project"], "state": s["state"], "updatedAt": s["updatedAt"], "alive": s["alive"] })).collect();
                same("claude-sessions", &input, &Value::Array(got), &Value::Array(want));
            }
            other => panic!("unknown fn {other}"),
        }
    }
}

fn scan_case(input: &Value, want: &Value) {
    let home = tempfile::tempdir().unwrap();
    let now = input["now"].as_f64().unwrap();
    let usage = AgentUsage::with(home.path(), Box::new(move || now), ZONE, CHUNK);
    let steps = input["steps"].as_array().unwrap();
    for (i, step) in steps.iter().enumerate() {
        for (rel, content) in step["files"].as_object().unwrap() {
            let file = rel.split('/').fold(home.path().to_path_buf(), |p, part| p.join(part));
            std::fs::create_dir_all(file.parent().unwrap()).unwrap();
            let content = content.as_str().unwrap();
            if step["append"].as_bool() == Some(true) {
                use std::io::Write;
                std::fs::OpenOptions::new().append(true).create(true).open(&file).unwrap().write_all(content.as_bytes()).unwrap();
            } else {
                std::fs::write(&file, content).unwrap();
            }
        }
        usage.scan();
        let want = &want[i];
        let label = format!("{} step {i}", str_of(input, "label"));
        same(&label, input, &usage.totals(), &want["totals"]);
        same(&label, input, &usage.codex_limits().unwrap_or(Value::Null), &want["limits"]);
        same(&label, input, &usage.codex_limits_at().map_or(Value::Null, ips_server::agents::num), &want["limitsAt"]);
    }
}

#[test]
fn agent_usage() {
    for (input, want) in cases("agent-usage") {
        let line = str_of(&input, "line");
        match str_of(&input, "fn") {
            "scan" => scan_case(&input, &want),
            "claudeLine" => same("agent-usage", &input, &claude_line(line, ZONE).map_or(Value::Null, |l| l.to_json()), &want),
            "codexLine" => same("agent-usage", &input, &codex_line(line, ZONE).map_or(Value::Null, |l| l.to_json()), &want),
            "codexContext" => same("agent-usage", &input, &codex_context(line).map_or(Value::Null, |(project, model)| json!({ "project": project, "model": model })), &want),
            "dayKey" => assert_eq!(json!(day_key(input["ms"].as_f64().unwrap(), ZONE)), want, "{input}"),
            "modelOf" => assert_eq!(json!(model_of(Some(&input["value"]))), want, "{input}"),
            "rootOf" => same("agent-usage", &input, &root_of(Some(&input["value"])).unwrap_or(Value::Null), &want),
            other => panic!("unknown fn {other}"),
        }
    }
}
