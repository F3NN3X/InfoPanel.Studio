// Coding agents (Claude Code, Codex) for the island and the Agents widget (server/agents.mjs). Their hooks post each
// lifecycle event here, their statusline posts the plan and context use, and the server reads the transcripts' token
// counts (agent_usage.rs) and Claude Code's live session files (claude_sessions.rs).
//
// Only metadata reaches the kiosks: the agent, the project folder's name, the state, the tool's name, times and numbers.
// Prompts, replies, tool inputs and paths stay here. `reduce_agents`, `merge_claude_sessions` and `public_agents` are pure.
//
// POST /api/agents/event?agent=claude|codex and POST /api/agents/statusline: this machine only, always 204.

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex, OnceLock, PoisonError};
use std::time::Duration;

use axum::body::Body;
use axum::http::{Method, Response};
use serde_json::{json, Map, Value};
use sha2::{Digest, Sha256};
use tokio::sync::watch;
use tokio::task::JoinHandle;

use crate::agent_usage::AgentUsage;
use crate::http::{self, Req};
use crate::request_guard::agent_write_refusal;
use crate::json::{parse as parse_json, stringify};
use crate::{supervisor, App};

pub const AGENTS: [&str; 2] = ["claude", "codex"];
/// A working or waiting session not heard from for this long is dropped (a missed SessionEnd), ms.
pub const STALE_MS: f64 = 30.0 * 60_000.0;
/// A finished session stays listed this long, ms.
pub const DONE_KEEP_MS: f64 = 15.0 * 60_000.0;
const MAX_SESSIONS: usize = 12;
const MAX_AGENT_BYTES: usize = 512 * 1024;
const SWEEP: Duration = Duration::from_secs(30);
pub const PUBLISH_THROTTLE: Duration = Duration::from_millis(250);
/// The hook events that put a session into a state; anything else only refreshes it.
const NEEDS_YOU: [&str; 4] = ["permission_prompt", "idle_prompt", "elicitation_dialog", "agent_needs_input"];

/// One agent session as the server keeps it. `hooked` is set once a hook event has named it.
#[derive(Debug, Clone, PartialEq)]
pub struct Session {
    pub agent: String,
    pub id: String,
    pub project: String,
    pub state: String,
    pub since: f64,
    pub turn_start: Option<f64>,
    pub tool: String,
    pub subagents: u32,
    pub last_turn_ms: Option<f64>,
    pub last_seen: f64,
    pub hooked: bool,
    pub context: Option<f64>,
    pub cost: Option<f64>,
    pub model: String,
}

/// The sessions by `<agent>:<id>` in the order a JavaScript object keeps them, the plan, and the usage totals.
#[derive(Debug, Clone, Default)]
pub struct AgentsState {
    pub sessions: Vec<(String, Session)>,
    pub plan: Map<String, Value>,
    pub usage: Value,
}

/// A live Claude Code session file as the merge reads it.
#[derive(Debug, Clone, PartialEq)]
pub struct LiveSession {
    pub id: String,
    pub project: String,
    pub state: String,
    pub updated_at: Option<f64>,
    /// `Some(false)`: its process ended.
    pub alive: Option<bool>,
}

/// A number as JavaScript prints it: whole values without a fraction.
pub fn num(x: f64) -> Value {
    if x.is_finite() && x.fract() == 0.0 && x.abs() <= 9_007_199_254_740_992.0 {
        return Value::from(x as i64);
    }
    json!(x)
}

fn opt_num(x: Option<f64>) -> Value {
    x.map_or(Value::Null, num)
}

/// A string cut to `max` UTF-16 units. A cut through a surrogate pair leaves U+FFFD where JavaScript keeps a lone one.
pub fn slice16(s: &str, max: usize) -> String {
    if s.len() <= max {
        return s.to_string();
    }
    let units: Vec<u16> = s.encode_utf16().collect();
    if units.len() <= max {
        return s.to_string();
    }
    String::from_utf16_lossy(&units[..max])
}

/// `str(v, max)`: a string cut to `max`, else "".
fn str_of(v: Option<&Value>, max: usize) -> String {
    v.and_then(Value::as_str).map_or_else(String::new, |s| slice16(s, max))
}

/// The project folder's name from a cwd (both slash kinds), never the path.
pub fn project_of(cwd: Option<&Value>) -> String {
    let path = str_of(cwd, 1000);
    let path = path.trim_end_matches(['\\', '/']);
    slice16(path.rsplit(['\\', '/']).next().unwrap_or(""), 60)
}

/// A tool's display name: an MCP tool (`mcp__<server>__<tool>`) keeps only its own name.
pub fn tool_of(v: Option<&Value>) -> String {
    let s = str_of(v, 200);
    // `^mcp__.*__`: greedy, and `.` stops at a line break.
    let stripped = s.strip_prefix("mcp__").and_then(|rest| {
        let line = rest.find(['\n', '\r', '\u{2028}', '\u{2029}']).unwrap_or(rest.len());
        rest[..line].rfind("__").map(|i| &rest[i + 2..])
    });
    slice16(stripped.unwrap_or(&s), 60)
}

fn find<'a>(sessions: &'a [(String, Session)], key: &str) -> Option<&'a Session> {
    sessions.iter().find(|(k, _)| k == key).map(|(_, s)| s)
}

/// `sessions[key] = session`: in place when the key exists, else last.
fn set(sessions: &mut Vec<(String, Session)>, key: &str, session: Session) {
    match sessions.iter_mut().find(|(k, _)| k == key) {
        Some(slot) => slot.1 = session,
        None => sessions.push((key.to_string(), session)),
    }
}

/// The newest sessions only.
fn trim(mut sessions: Vec<(String, Session)>) -> Vec<(String, Session)> {
    if sessions.len() > MAX_SESSIONS {
        sessions.sort_by(|a, b| b.1.last_seen.total_cmp(&a.1.last_seen));
        sessions.truncate(MAX_SESSIONS);
    }
    sessions
}

fn to(s: &mut Session, state: &str, now: f64) {
    if s.state != state {
        s.since = now;
    }
    s.state = state.to_string();
}

fn clear_turn(s: &mut Session) {
    s.turn_start = None;
    s.tool.clear();
    s.subagents = 0;
}

/// One hook event into the sessions: `event` is the hook's JSON, `agent` "claude" or "codex", `now` ms. `None`: nothing
/// to change (the state is returned as it was).
pub fn reduce_agents(state: &AgentsState, agent: &str, event: &Value, now: f64) -> Option<AgentsState> {
    if !AGENTS.contains(&agent) || event.is_null() || !(event.is_object() || event.is_array()) {
        return None;
    }
    let name = str_of(event.get("hook_event_name"), 40);
    let id = str_of(event.get("session_id"), 100);
    if name.is_empty() || id.is_empty() {
        return None;
    }
    let key = format!("{agent}:{id}");
    let mut sessions = state.sessions.clone();
    if name == "SessionEnd" {
        sessions.retain(|(k, _)| *k != key);
        return Some(AgentsState { sessions, ..state.clone() });
    }
    let prev = find(&sessions, &key).cloned().unwrap_or_else(|| Session {
        agent: agent.into(),
        id: id.clone(),
        project: String::new(),
        state: "idle".into(),
        since: now,
        turn_start: None,
        tool: String::new(),
        subagents: 0,
        last_turn_ms: None,
        last_seen: now,
        hooked: false,
        context: None,
        cost: None,
        model: String::new(),
    });
    let project = project_of(event.get("cwd"));
    let mut next = Session { project: if project.is_empty() { prev.project.clone() } else { project }, last_seen: now, hooked: true, ..prev.clone() };
    let tool = tool_of(event.get("tool_name"));
    match name.as_str() {
        "SessionStart" => {
            to(&mut next, "idle", now);
            next.tool.clear();
        }
        "UserPromptSubmit" => {
            to(&mut next, "working", now);
            next.turn_start = Some(now);
            next.tool.clear();
        }
        "PreToolUse" => {
            to(&mut next, "working", now);
            next.turn_start = next.turn_start.or(Some(now));
            next.tool = tool;
        }
        "PostToolUse" | "PostToolUseFailure" => {
            to(&mut next, "working", now);
            next.turn_start = next.turn_start.or(Some(now));
        }
        "PermissionRequest" => {
            to(&mut next, "waiting", now);
            if !tool.is_empty() {
                next.tool = tool;
            }
        }
        "Notification" if NEEDS_YOU.contains(&str_of(event.get("notification_type"), 40).as_str()) => to(&mut next, "waiting", now),
        "SubagentStart" => next.subagents = (prev.subagents + 1).min(50),
        "SubagentStop" => next.subagents = prev.subagents.saturating_sub(1),
        "Stop" => {
            to(&mut next, "done", now);
            next.last_turn_ms = next.turn_start.map(|t| now - t);
            clear_turn(&mut next);
        }
        // Codex: the turn was stopped by hand.
        "Interrupt" => {
            to(&mut next, "idle", now);
            clear_turn(&mut next);
        }
        "StopFailure" => {
            to(&mut next, "error", now);
            next.turn_start = None;
            next.tool.clear();
        }
        _ => {}
    }
    set(&mut sessions, &key, next);
    Some(AgentsState { sessions: trim(sessions), ..state.clone() })
}

/// Claude Code's session files into the sessions: a live session without hooks is added and follows its file; a live one is
/// not expired; one whose process ended (a crash), or an unhooked one whose file is gone, is dropped. Hooked sessions
/// without a file are left to `expire_agents`. `None`: unchanged.
pub fn merge_claude_sessions(state: &AgentsState, live: &[LiveSession], now: f64) -> Option<AgentsState> {
    let mut sessions = state.sessions.clone();
    let mut changed = false;
    let mut live_keys: Vec<String> = Vec::new();
    for l in live {
        let key = format!("claude:{}", l.id);
        if l.alive == Some(false) {
            if sessions.iter().any(|(k, _)| *k == key) {
                sessions.retain(|(k, _)| *k != key);
                changed = true;
            }
            continue;
        }
        live_keys.push(key.clone());
        let Some(prev) = find(&sessions, &key).cloned() else {
            let since = l.updated_at.unwrap_or(now);
            let created = Session {
                agent: "claude".into(),
                id: l.id.clone(),
                project: l.project.clone(),
                state: l.state.clone(),
                since,
                turn_start: (l.state == "working").then_some(since),
                tool: String::new(),
                subagents: 0,
                last_turn_ms: None,
                last_seen: now,
                hooked: false,
                context: None,
                cost: None,
                model: String::new(),
            };
            set(&mut sessions, &key, created);
            changed = true;
            continue;
        };
        let mut next = Session { last_seen: now, ..prev.clone() };
        if !prev.hooked {
            if !l.project.is_empty() {
                next.project = l.project.clone();
            }
            if prev.state != l.state {
                next.state = l.state.clone();
                next.since = now;
                next.turn_start = (l.state == "working").then(|| prev.turn_start.unwrap_or(now));
            }
        }
        if next != prev {
            set(&mut sessions, &key, next);
            changed = true;
        }
    }
    let before = sessions.len();
    sessions.retain(|(key, s)| !(s.agent == "claude" && !s.hooked && !live_keys.contains(key)));
    changed |= sessions.len() != before;
    changed.then(|| AgentsState { sessions: trim(sessions), ..state.clone() })
}

/// Drops sessions gone quiet (working or waiting past `STALE_MS`, finished past `DONE_KEEP_MS`). `None`: none dropped.
pub fn expire_agents(state: &AgentsState, now: f64) -> Option<AgentsState> {
    let keep: Vec<(String, Session)> = state
        .sessions
        .iter()
        .filter(|(_, s)| {
            let quiet = now - s.last_seen;
            if s.state == "working" || s.state == "waiting" { quiet < STALE_MS } else { quiet < DONE_KEEP_MS }
        })
        .cloned()
        .collect();
    (keep.len() != state.sessions.len()).then(|| AgentsState { sessions: keep, ..state.clone() })
}

/// `pct(v)`: a finite number clamped to 0..100.
fn pct(v: Option<&Value>) -> Option<f64> {
    v.and_then(Value::as_f64).map(|x| x.clamp(0.0, 100.0))
}

/// Unix seconds or ms, or an ISO string, as ms.
fn ms_of(v: Option<&Value>) -> Option<f64> {
    match v? {
        Value::Number(n) => n.as_f64().map(|x| if x < 1e12 { x * 1000.0 } else { x }),
        Value::String(s) => crate::js_date::parse_date(s, crate::ical::LocalZone::System),
        _ => None,
    }
}

/// `v ?? fallback`: `v` unless it is null or missing.
fn nullish<'a>(v: Option<&'a Value>, fallback: Option<&'a Value>) -> Option<&'a Value> {
    v.filter(|v| !v.is_null()).or(fallback)
}

/// A rate-limit window: `used_percentage` (or `used_percent`) clamped, and `resets_at`.
fn window(w: Option<&Value>) -> Option<Value> {
    let w = w.filter(|w| w.is_object() || w.is_array())?;
    let used = pct(nullish(w.get("used_percentage"), w.get("used_percent")))?;
    let mut out = Map::new();
    out.insert("used".into(), num(used));
    if let Some(resets) = ms_of(w.get("resets_at")) {
        out.insert("resetsAt".into(), num(resets));
    }
    Some(Value::Object(out))
}

/// A Claude Code statusline payload into the plan and the session's context and cost: `rate_limits.five_hour` /
/// `seven_day` (and any `seven_day_<name>`), the Claude Code `version`, `context_window.used_percentage`,
/// `cost.total_cost_usd`. `None`: unchanged.
pub fn reduce_statusline(state: &AgentsState, payload: &Value, now: f64) -> Option<AgentsState> {
    if !(payload.is_object() || payload.is_array()) {
        return None;
    }
    let empty = Map::new();
    let limits = nullish(payload.get("rate_limits"), None).and_then(Value::as_object).unwrap_or(&empty);
    let five_hour = window(limits.get("five_hour"));
    let seven_day = window(limits.get("seven_day"));
    // Any other weekly window (a per-model one) by its key's suffix.
    let extra: Vec<Value> = limits
        .iter()
        .filter_map(|(k, w)| {
            let name = str_of(Some(&Value::String(k.strip_prefix("seven_day_")?.to_string())), 30);
            let Value::Object(mut win) = window(Some(w)).filter(|_| !name.is_empty())? else { return None };
            let mut out = Map::new();
            out.insert("name".into(), Value::String(name));
            out.append(&mut win);
            Some(Value::Object(out))
        })
        .collect();
    let version = str_of(payload.get("version"), 20);
    let prev_claude = state.plan.get("claude").and_then(Value::as_object);
    let prev_version = prev_claude.and_then(|c| c.get("version")).and_then(Value::as_str).unwrap_or("");
    let mut plan = state.plan.clone();
    // JavaScript compares the plan object itself: it is a new one exactly when a branch below builds it.
    let rebuilt = five_hour.is_some() || seven_day.is_some() || !extra.is_empty() || (!version.is_empty() && version != prev_version);
    if five_hour.is_some() || seven_day.is_some() || !extra.is_empty() {
        let mut claude = Map::new();
        if let Some(w) = five_hour {
            claude.insert("fiveHour".into(), w);
        }
        if let Some(w) = seven_day {
            claude.insert("sevenDay".into(), w);
        }
        if !extra.is_empty() {
            claude.insert("extra".into(), Value::Array(extra));
        }
        if !version.is_empty() || !prev_version.is_empty() {
            claude.insert("version".into(), Value::String(if version.is_empty() { prev_version.into() } else { version }));
        }
        claude.insert("at".into(), num(now));
        plan.insert("claude".into(), Value::Object(claude));
    } else if !version.is_empty() && version != prev_version {
        let mut claude = prev_claude.cloned().unwrap_or_default();
        claude.insert("version".into(), Value::String(version));
        if !claude.contains_key("at") {
            claude.insert("at".into(), num(now));
        }
        plan.insert("claude".into(), Value::Object(claude));
    }
    let id = str_of(payload.get("session_id"), 100);
    let key = format!("claude:{id}");
    let prev = if id.is_empty() { None } else { find(&state.sessions, &key) };
    let mut sessions = state.sessions.clone();
    if let Some(prev) = prev {
        let context = pct(payload.get("context_window").and_then(|c| c.get("used_percentage")));
        let cost = payload.get("cost").and_then(|c| c.get("total_cost_usd")).and_then(Value::as_f64);
        let m = payload.get("model");
        let model = str_of(nullish(m.and_then(|m| m.get("display_name")), m.and_then(|m| m.get("id"))), 40);
        let next = Session {
            context: context.or(prev.context),
            cost: cost.or(prev.cost),
            model: if model.is_empty() { prev.model.clone() } else { model },
            ..prev.clone()
        };
        set(&mut sessions, &key, next);
    }
    (rebuilt || prev.is_some()).then(|| AgentsState { sessions, plan, ..state.clone() })
}

/// Codex's rate limits as its session files report them (`primary`, `secondary`). Which is the 5-hour and which the weekly
/// window goes by `window_minutes` (a free plan's primary is the weekly one). `None`: unchanged.
pub fn codex_plan(state: &AgentsState, limits: &Value, now: f64) -> Option<AgentsState> {
    if !(limits.is_object() || limits.is_array()) {
        return None;
    }
    let windows: Vec<&Value> = ["primary", "secondary"].iter().filter_map(|k| limits.get(k)).filter(|w| w.is_object() || w.is_array()).collect();
    let short = windows.iter().position(|w| w.get("window_minutes").and_then(Value::as_f64).is_none_or(|m| m <= 360.0));
    let long = windows.iter().enumerate().find(|(i, _)| Some(*i) != short).map(|(i, _)| i);
    let as_window = |i: Option<usize>| {
        let w = windows[i?];
        window(Some(&json!({ "used_percent": w.get("used_percent"), "resets_at": w.get("resets_at") })))
    };
    let (five_hour, seven_day) = (as_window(short), as_window(long));
    if five_hour.is_none() && seven_day.is_none() {
        return None;
    }
    let mut codex = Map::new();
    if let Some(w) = five_hour {
        codex.insert("fiveHour".into(), w);
    }
    if let Some(w) = seven_day {
        codex.insert("sevenDay".into(), w);
    }
    codex.insert("at".into(), num(now));
    let mut plan = state.plan.clone();
    plan.insert("codex".into(), Value::Object(codex));
    Some(AgentsState { plan, ..state.clone() })
}

/// What the kiosks get: sessions newest first, each keyed by a short hash (not the agent's session id).
pub fn public_agents(state: &AgentsState) -> Value {
    let mut sorted: Vec<&(String, Session)> = state.sessions.iter().collect();
    sorted.sort_by(|a, b| b.1.last_seen.total_cmp(&a.1.last_seen));
    let sessions: Vec<Value> = sorted
        .into_iter()
        .map(|(key, s)| {
            let digest = Sha256::digest(key.as_bytes());
            let mut out = Map::new();
            out.insert("key".into(), Value::String(digest.iter().take(6).map(|b| format!("{b:02x}")).collect()));
            out.insert("agent".into(), s.agent.clone().into());
            out.insert("project".into(), s.project.clone().into());
            out.insert("state".into(), s.state.clone().into());
            out.insert("since".into(), num(s.since));
            if let Some(t) = s.turn_start {
                out.insert("turnStart".into(), num(t));
            }
            if !s.tool.is_empty() {
                out.insert("tool".into(), s.tool.clone().into());
            }
            if s.subagents > 0 {
                out.insert("subagents".into(), s.subagents.into());
            }
            if let Some(t) = s.last_turn_ms {
                out.insert("lastTurnMs".into(), num(t));
            }
            if let Some(c) = s.context {
                out.insert("context".into(), num(c));
            }
            if let Some(c) = s.cost {
                out.insert("cost".into(), num(c));
            }
            if !s.model.is_empty() {
                out.insert("model".into(), s.model.clone().into());
            }
            Value::Object(out)
        })
        .collect();
    let usage = if state.usage.is_null() { json!({}) } else { state.usage.clone() };
    json!({ "sessions": sessions, "plan": state.plan, "usage": usage })
}

impl Session {
    /// The session as the Node server's state object holds it (for the fixtures).
    pub fn to_json(&self) -> Value {
        let mut out = Map::new();
        out.insert("agent".into(), self.agent.clone().into());
        out.insert("id".into(), self.id.clone().into());
        out.insert("project".into(), self.project.clone().into());
        out.insert("state".into(), self.state.clone().into());
        out.insert("since".into(), num(self.since));
        out.insert("turnStart".into(), opt_num(self.turn_start));
        out.insert("tool".into(), self.tool.clone().into());
        out.insert("subagents".into(), self.subagents.into());
        out.insert("lastTurnMs".into(), opt_num(self.last_turn_ms));
        out.insert("lastSeen".into(), num(self.last_seen));
        if self.hooked {
            out.insert("hooked".into(), true.into());
        }
        if let Some(c) = self.context {
            out.insert("context".into(), num(c));
        }
        if let Some(c) = self.cost {
            out.insert("cost".into(), num(c));
        }
        if !self.model.is_empty() {
            out.insert("model".into(), self.model.clone().into());
        }
        Value::Object(out)
    }

    pub fn from_json(v: &Value) -> Self {
        let text = |k: &str| v.get(k).and_then(Value::as_str).unwrap_or("").to_string();
        let float = |k: &str| v.get(k).and_then(Value::as_f64);
        Self {
            agent: text("agent"),
            id: text("id"),
            project: text("project"),
            state: text("state"),
            since: float("since").unwrap_or(0.0),
            turn_start: float("turnStart"),
            tool: text("tool"),
            subagents: float("subagents").unwrap_or(0.0) as u32,
            last_turn_ms: float("lastTurnMs"),
            last_seen: float("lastSeen").unwrap_or(0.0),
            hooked: v.get("hooked").and_then(Value::as_bool).unwrap_or(false),
            context: float("context"),
            cost: float("cost"),
            model: text("model"),
        }
    }
}

impl AgentsState {
    pub fn to_json(&self) -> Value {
        let sessions: Map<String, Value> = self.sessions.iter().map(|(k, s)| (k.clone(), s.to_json())).collect();
        json!({ "sessions": sessions, "plan": self.plan, "usage": self.usage })
    }

    pub fn from_json(v: &Value) -> Self {
        let sessions = v.get("sessions").and_then(Value::as_object).map(|m| m.iter().map(|(k, s)| (k.clone(), Session::from_json(s))).collect()).unwrap_or_default();
        Self { sessions, plan: v.get("plan").and_then(Value::as_object).cloned().unwrap_or_default(), usage: v.get("usage").cloned().unwrap_or_else(|| json!({})) }
    }
}

/// Where the agents' inputs come from: the usage reader, Claude Code's session files, and the clock (ms).
pub struct Sources {
    pub usage: Arc<AgentUsage>,
    pub claude_sessions: Box<dyn Fn() -> Vec<LiveSession> + Send + Sync>,
    pub now: Box<dyn Fn() -> f64 + Send + Sync>,
}

struct Inner {
    state: Mutex<AgentsState>,
    sources: Sources,
    throttle: Duration,
    /// A publish is waiting out the throttle.
    pending: AtomicBool,
    on_change: OnceLock<Box<dyn Fn() + Send + Sync>>,
}

/// The live agents: hook events and statusline payloads in, a change callback out (throttled so a burst of tool calls is
/// one publish).
#[derive(Clone)]
pub struct Agents(Arc<Inner>);

impl Agents {
    pub fn new(sources: Sources, throttle: Duration) -> Self {
        let agents = Self(Arc::new(Inner { state: Mutex::new(AgentsState { usage: json!({}), ..AgentsState::default() }), sources, throttle, pending: AtomicBool::new(false), on_change: OnceLock::new() }));
        agents.refresh();
        agents
    }

    /// What runs when the public state changed; set once, after the extras exist.
    pub fn set_on_change(&self, f: impl Fn() + Send + Sync + 'static) {
        let _ = self.0.on_change.set(Box::new(f));
    }

    fn changed(&self) {
        if self.0.pending.swap(true, Ordering::SeqCst) {
            return;
        }
        let inner = Arc::clone(&self.0);
        let publish = move || {
            inner.pending.store(false, Ordering::SeqCst);
            if let Some(f) = inner.on_change.get() {
                f();
            }
        };
        match tokio::runtime::Handle::try_current() {
            Ok(handle) => {
                let throttle = self.0.throttle;
                handle.spawn(async move {
                    tokio::time::sleep(throttle).await;
                    publish();
                });
            }
            Err(_) => publish(),
        }
    }

    fn lock(&self) -> std::sync::MutexGuard<'_, AgentsState> {
        self.0.state.lock().unwrap_or_else(PoisonError::into_inner)
    }

    /// A hook event.
    pub fn event(&self, agent: &str, payload: &Value) {
        let now = (self.0.sources.now)();
        let mut state = self.lock();
        if let Some(next) = reduce_agents(&state, agent, payload, now) {
            *state = next;
            drop(state);
            self.changed();
        }
    }

    /// A statusline payload.
    pub fn statusline(&self, payload: &Value) {
        let now = (self.0.sources.now)();
        let mut state = self.lock();
        if let Some(next) = reduce_statusline(&state, payload, now) {
            *state = next;
            drop(state);
            self.changed();
        }
    }

    /// The sweep, and after each usage scan: merge the session files, expire the quiet, take Codex's plan and the usage
    /// totals; publishes only when what the kiosks get changed.
    pub fn refresh(&self) {
        let sources = &self.0.sources;
        let now = (sources.now)();
        let live = (sources.claude_sessions)();
        let (limits, limits_at, usage) = (sources.usage.codex_limits(), sources.usage.codex_limits_at(), sources.usage.totals());
        let mut state = self.lock();
        let mut next = merge_claude_sessions(&state, &live, now).unwrap_or_else(|| state.clone());
        next = expire_agents(&next, now).unwrap_or(next);
        // Stamped with when Codex reported them, so the widget can tell old numbers from fresh ones.
        if let Some(limits) = &limits {
            next = codex_plan(&next, limits, limits_at.unwrap_or(now)).unwrap_or(next);
        }
        next.usage = usage;
        // Only what the kiosks get decides a publish: a live session's `last_seen` moves on every sweep.
        let publish = stringify(&public_agents(&next)) != stringify(&public_agents(&state));
        *state = next;
        drop(state);
        if publish {
            self.changed();
        }
    }

    /// The agents' public state: `{ sessions, plan, usage }`.
    pub fn state(&self) -> Value {
        public_agents(&self.lock())
    }

    /// The 30 s sweep and the 60 s usage scan, each under the supervisor.
    pub fn start(&self, shutdown: &watch::Receiver<bool>) -> [JoinHandle<()>; 2] {
        let sweep = self.clone();
        let scan = self.clone();
        [
            supervisor::spawn("agents-sweep", shutdown.clone(), move || {
                let agents = sweep.clone();
                async move {
                    loop {
                        tokio::time::sleep(SWEEP).await;
                        let agents = agents.clone();
                        let _ = tokio::task::spawn_blocking(move || agents.refresh()).await;
                    }
                }
            }),
            supervisor::spawn("agent-usage", shutdown.clone(), move || {
                let agents = scan.clone();
                async move {
                    loop {
                        let agents = agents.clone();
                        let _ = tokio::task::spawn_blocking(move || {
                            if agents.0.sources.usage.scan() {
                                agents.refresh();
                            }
                        })
                        .await;
                        tokio::time::sleep(crate::agent_usage::SCAN).await;
                    }
                }
            }),
        ]
    }
}

/// POST /api/agents/event and /api/agents/statusline: this machine only, a hook's JSON; 204.
pub async fn handle(app: &App, mut req: Req) -> std::io::Result<Response<Body>> {
    if req.method != Method::POST {
        return Ok(http::empty(405));
    }
    if let Some(refusal) = agent_write_refusal(req.header("content-type").as_deref(), req.header("x-agent-event").as_deref(), Some(&req.peer)) {
        return Ok(http::text(refusal.status, refusal.message));
    }
    let payload = match req.read_body(MAX_AGENT_BYTES).await {
        Ok(body) => parse_json(&body),
        Err(()) => return Ok(http::closing(http::text(400, "invalid JSON"))),
    };
    let Some(payload) = payload else {
        return Ok(http::text(400, "invalid JSON"));
    };
    if req.path == "/api/agents/statusline" {
        app.agents.statusline(&payload);
    } else {
        app.agents.event(&req.query("agent").unwrap_or_default(), &payload);
    }
    Ok(http::empty(204))
}

#[cfg(test)]
#[path = "agents_tests.rs"]
mod tests;
