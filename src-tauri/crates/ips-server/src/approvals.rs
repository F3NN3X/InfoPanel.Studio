// Agent approvals from the panel (pinned layer P8, decision 5, owner Q4): a coding agent's permission request, answered on
// the local kiosk. Allowing a tool call from a touch panel approves code execution, so every layer has to agree:
//
// - it is off unless the agent is named in AGENT_APPROVALS (the app's Settings > Coding agents switches set it), read at
//   start only. While an agent is off its requests are recorded as events and answered `{}` at once;
// - the hook (`ips-agent permission <agent>`, a synchronous PermissionRequest hook) posts here from this machine with the
//   agent header (`agent_write_refusal`) and waits at most `WAIT` for an answer. With none it gets `{}`, prints nothing, and
//   the agent shows its own prompt in the terminal. Silence never allows and never denies;
// - the request, with the tool's input in full, is read only by this machine (`agent_requests_refusal`): the local kiosk asks
//   for it while the extras say a session waits. It never goes into the extras stream, which every kiosk gets;
// - only this machine may answer (`agent_answer_refusal`), whatever "Allow editing from other devices" says. There is no
//   pairing of other devices today, so loopback is the whole rule;
// - every answer is logged (DATA_DIR/agent-approvals-log.jsonl, cut back past 256 KB): allow, deny, a request that went back
//   to the terminal (`none`) or whose hook went away (`gone`), and refused answers with the peer's address.
//
// POST /api/agents/permission?agent=claude|codex   the hook's JSON → 200 `{ behavior: "allow" | "deny" }` or `{}`
// GET  /api/agents/requests                        `{ wait, requests: [{ id, agent, session, project, tool, text, left }] }`
// POST /api/agents/answer                          `{ id, behavior: "allow" | "deny" }` → 200, or 404 once it is gone
// GET  /api/agents/requests/log                    `{ entries: [{ at, from, agent, project, tool, text, answer }] }`

use std::io::Write as _;
use std::path::PathBuf;
use std::sync::{Arc, Mutex, PoisonError};
use std::time::Duration;

use axum::body::Body;
use axum::http::{Method, Response};
use serde_json::{json, Map, Value};
use tokio::sync::{oneshot, watch};

use crate::agents::{project_of, public_key, tool_of, AGENTS};
use crate::http::{self, Req};
use crate::request_guard::{agent_answer_refusal, agent_requests_refusal, agent_write_refusal};
use crate::App;

/// How long a request waits for the panel before it goes back to the terminal. The hook gives up a little later and is
/// installed with a timeout above both (ips-agent's `PERMISSION_DEADLINE`, install.rs `PERMISSION_TIMEOUT`).
pub const WAIT: Duration = Duration::from_secs(25);
/// The most requests waiting at once; past it a request goes straight to the terminal.
pub const MAX_PENDING: usize = 8;
const MAX_HOOK_BYTES: usize = 512 * 1024;
const MAX_ANSWER_BYTES: usize = 4 * 1024;
const LOG: &str = "agent-approvals-log.jsonl";
const LOG_MAX_BYTES: u64 = 256 * 1024;
const LOG_READ: usize = 200;

pub const GONE_MESSAGE: &str = "This request was answered already, or went back to the terminal.";

/// The agents whose requests the panel may answer, from a comma-separated AGENT_APPROVALS value.
pub fn parse_agents(value: Option<&str>) -> Vec<String> {
    let mut out: Vec<String> = Vec::new();
    for a in value.unwrap_or("").split(',').map(|s| s.trim().to_ascii_lowercase()) {
        if AGENTS.contains(&a.as_str()) && !out.contains(&a) {
            out.push(a);
        }
    }
    out
}

/// What the panel shows of a tool call: a command in full, else the file or address it names, else its whole input.
pub fn request_text(tool_input: Option<&Value>) -> String {
    let Some(input) = tool_input else { return String::new() };
    for key in ["command", "file_path", "url", "path"] {
        if let Some(s) = input.get(key).and_then(Value::as_str) {
            return s.to_string();
        }
    }
    match input {
        Value::Null => String::new(),
        Value::String(s) => s.clone(),
        other => serde_json::to_string_pretty(other).unwrap_or_default(),
    }
}

/// One answer's word.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Behavior {
    Allow,
    Deny,
}

impl Behavior {
    pub fn parse(s: &str) -> Option<Self> {
        match s {
            "allow" => Some(Self::Allow),
            "deny" => Some(Self::Deny),
            _ => None,
        }
    }

    pub fn as_str(self) -> &'static str {
        match self {
            Self::Allow => "allow",
            Self::Deny => "deny",
        }
    }
}

/// A request the panel can see.
#[derive(Debug, Clone, PartialEq)]
pub struct Request {
    pub id: String,
    pub agent: String,
    /// The session's public key (`public_agents`), so a card can find its request.
    pub session: String,
    pub project: String,
    pub tool: String,
    pub text: String,
    /// When it stops waiting, ms.
    pub until: i64,
}

struct Pending {
    request: Request,
    answer: Option<oneshot::Sender<Behavior>>,
}

struct Inner {
    enabled: Vec<String>,
    wait: Duration,
    log_dir: PathBuf,
    pending: Mutex<Vec<Pending>>,
    write: Mutex<()>,
}

/// The requests waiting for the panel, the switch per agent, and the log.
#[derive(Clone)]
pub struct Approvals(Arc<Inner>);

/// How a wait ended.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Outcome {
    Answered(Behavior),
    /// Nobody answered in time, or the server is stopping: the terminal asks.
    None,
    /// The agent is off, or too many wait already: answered `{}` at once.
    Skipped,
}

/// Takes the request out of the list when the wait ends, however it ends (a hook that goes away drops the wait).
struct Waiting<'a> {
    approvals: &'a Approvals,
    id: String,
    outcome: Option<Outcome>,
}

impl Drop for Waiting<'_> {
    fn drop(&mut self) {
        let removed = {
            let mut list = self.approvals.lock();
            let at = list.iter().position(|p| p.request.id == self.id);
            at.map(|i| list.remove(i).request)
        };
        // an answer is logged where it is given; a wait that ended otherwise is logged here
        if let Some(r) = removed {
            let answer = if self.outcome == Some(Outcome::None) { "none" } else { "gone" };
            self.approvals.log(crate::config::now_ms(), "hook", &r, answer);
        }
    }
}

impl Approvals {
    pub fn new(enabled: Vec<String>, wait: Duration, log_dir: PathBuf) -> Self {
        Self(Arc::new(Inner { enabled, wait, log_dir, pending: Mutex::new(Vec::new()), write: Mutex::new(()) }))
    }

    pub fn enabled(&self, agent: &str) -> bool {
        self.0.enabled.iter().any(|a| a == agent)
    }

    pub fn agents(&self) -> &[String] {
        &self.0.enabled
    }

    fn lock(&self) -> std::sync::MutexGuard<'_, Vec<Pending>> {
        self.0.pending.lock().unwrap_or_else(PoisonError::into_inner)
    }

    /// The requests waiting now, oldest first.
    pub fn requests(&self) -> Vec<Request> {
        self.lock().iter().map(|p| p.request.clone()).collect()
    }

    /// Waits for the panel's answer to the hook's `payload`, at most the wait, or until `stop` turns true.
    pub async fn wait(&self, agent: &str, payload: &Value, now: i64, mut stop: watch::Receiver<bool>) -> Outcome {
        if !self.enabled(agent) {
            return Outcome::Skipped;
        }
        let session = payload.get("session_id").and_then(Value::as_str).unwrap_or("");
        let request = Request {
            id: uuid::Uuid::new_v4().to_string(),
            agent: agent.to_string(),
            session: public_key(&format!("{agent}:{session}")),
            project: project_of(payload.get("cwd")),
            tool: tool_of(payload.get("tool_name")),
            text: request_text(payload.get("tool_input")),
            until: now + self.0.wait.as_millis() as i64,
        };
        let (tx, rx) = oneshot::channel();
        {
            let mut list = self.lock();
            if list.len() >= MAX_PENDING {
                return Outcome::Skipped;
            }
            list.push(Pending { request: request.clone(), answer: Some(tx) });
        }
        let mut waiting = Waiting { approvals: self, id: request.id, outcome: None };
        let outcome = tokio::select! {
            answer = rx => answer.map_or(Outcome::None, Outcome::Answered),
            () = tokio::time::sleep(self.0.wait) => Outcome::None,
            _ = stop.wait_for(|s| *s) => Outcome::None,
        };
        waiting.outcome = Some(outcome);
        outcome
    }

    /// The panel's answer to request `id`, logged with `from`; false when it is no longer waiting.
    pub fn answer(&self, id: &str, behavior: Behavior, from: &str, now: i64) -> bool {
        let taken = {
            let mut list = self.lock();
            let at = list.iter().position(|p| p.request.id == id);
            at.map(|i| list.remove(i))
        };
        let Some(mut pending) = taken else { return false };
        self.log(now, from, &pending.request, behavior.as_str());
        pending.answer.take().is_some_and(|tx| tx.send(behavior).is_ok())
    }

    /// Appends a line to the log, cutting it back once it has grown past its size.
    pub fn log(&self, at: i64, from: &str, r: &Request, answer: &str) {
        let _held = self.0.write.lock().unwrap_or_else(PoisonError::into_inner);
        let mut line = Map::new();
        line.insert("at".into(), json!(at));
        line.insert("from".into(), json!(from));
        line.insert("agent".into(), json!(r.agent));
        line.insert("project".into(), json!(r.project));
        line.insert("tool".into(), json!(r.tool));
        line.insert("text".into(), json!(r.text));
        line.insert("answer".into(), json!(answer));
        let file = self.0.log_dir.join(LOG);
        let _ = std::fs::create_dir_all(&self.0.log_dir);
        let written = std::fs::OpenOptions::new().create(true).append(true).open(&file).and_then(|mut f| writeln!(f, "{}", Value::Object(line)));
        if let Err(err) = written {
            log::warn!(target: "server", "approvals: could not write the log: {err}");
        }
        if std::fs::metadata(&file).is_ok_and(|m| m.len() > LOG_MAX_BYTES) {
            crate::actions::trim(&file, (LOG_MAX_BYTES / 2) as usize);
        }
    }

    /// The last `LOG_READ` entries, oldest first.
    pub fn entries(&self) -> Vec<Value> {
        let text = crate::store::read_text(&self.0.log_dir.join(LOG)).unwrap_or_default();
        let lines: Vec<&str> = text.lines().collect();
        lines[lines.len().saturating_sub(LOG_READ)..].iter().filter_map(|l| serde_json::from_str(l).ok()).collect()
    }
}

fn request_json(r: &Request, now: i64) -> Value {
    json!({ "id": r.id, "agent": r.agent, "session": r.session, "project": r.project, "tool": r.tool, "text": r.text, "left": (r.until - now).max(0) })
}

/// The routes: the hook's post, the panel's read and answer, and the log.
pub async fn handle(app: &App, req: Req) -> std::io::Result<Response<Body>> {
    match req.path.as_str() {
        "/api/agents/permission" => handle_permission(app, req).await,
        "/api/agents/requests" => Ok(handle_requests(app, &req)),
        "/api/agents/requests/log" => Ok(handle_log(app, &req)),
        "/api/agents/answer" => handle_answer(app, req).await,
        _ => Ok(http::empty(404)),
    }
}

async fn handle_permission(app: &App, mut req: Req) -> std::io::Result<Response<Body>> {
    if req.method != Method::POST {
        return Ok(http::empty(405));
    }
    if let Some(refusal) = agent_write_refusal(req.header("content-type").as_deref(), req.header("x-agent-event").as_deref(), Some(&req.peer)) {
        return Ok(http::text(refusal.status, refusal.message));
    }
    let payload = match req.read_body(MAX_HOOK_BYTES).await {
        Ok(body) => crate::json::parse(&body),
        Err(http::BodyRefused) => return Ok(http::closing(http::text(400, "invalid JSON"))),
    };
    let Some(payload) = payload else {
        return Ok(http::text(400, "invalid JSON"));
    };
    let agent = req.query("agent").unwrap_or_default();
    // the session shows as waiting, as the event hook's post does
    app.agents.event(&agent, &payload);
    let outcome = app.approvals.wait(&agent, &payload, crate::config::now_ms(), app.shutdown.clone()).await;
    Ok(match outcome {
        Outcome::Answered(b) => http::json(200, &json!({ "behavior": b.as_str() })),
        Outcome::None | Outcome::Skipped => http::json(200, &json!({})),
    })
}

fn handle_requests(app: &App, req: &Req) -> Response<Body> {
    if req.method != Method::GET && req.method != Method::HEAD {
        return http::empty(405);
    }
    if let Some(refusal) = agent_requests_refusal(req.header("x-agent-answer").as_deref(), Some(&req.peer)) {
        return http::text(refusal.status, refusal.message);
    }
    let now = crate::config::now_ms();
    let requests: Vec<Value> = app.approvals.requests().iter().map(|r| request_json(r, now)).collect();
    http::json(200, &json!({ "wait": WAIT.as_millis() as u64, "agents": app.approvals.agents(), "requests": requests }))
}

fn handle_log(app: &App, req: &Req) -> Response<Body> {
    if req.method != Method::GET && req.method != Method::HEAD {
        return http::empty(405);
    }
    if let Some(refusal) = agent_requests_refusal(req.header("x-agent-answer").as_deref(), Some(&req.peer)) {
        return http::text(refusal.status, refusal.message);
    }
    http::json(200, &json!({ "entries": app.approvals.entries() }))
}

/// Reads an answer's body: `{ id, behavior }`.
pub fn parse_answer(body: &str) -> Result<(String, Behavior), String> {
    let v: Value = serde_json::from_str(body).map_err(|_| "expected a JSON object".to_string())?;
    let id = v.get("id").and_then(Value::as_str).filter(|s| !s.is_empty() && s.len() <= 64).ok_or("\"id\" must name a request")?;
    let behavior = v.get("behavior").and_then(Value::as_str).and_then(Behavior::parse).ok_or("\"behavior\" must be \"allow\" or \"deny\"")?;
    Ok((id.to_string(), behavior))
}

async fn handle_answer(app: &App, mut req: Req) -> std::io::Result<Response<Body>> {
    if req.method != Method::POST {
        return Ok(http::empty(405));
    }
    let now = crate::config::now_ms();
    if let Some(refusal) = agent_answer_refusal(req.header("content-type").as_deref(), req.header("x-agent-answer").as_deref(), Some(&req.peer)) {
        // an answer from another device is logged, with no request named (it is never looked up)
        if !req.is_loopback() {
            let none = Request { id: String::new(), agent: String::new(), session: String::new(), project: String::new(), tool: String::new(), text: String::new(), until: now };
            app.approvals.log(now, &req.peer, &none, "refused");
        }
        return Ok(http::text(refusal.status, refusal.message));
    }
    let body = match req.read_body(MAX_ANSWER_BYTES).await {
        Ok(body) => body,
        Err(http::BodyRefused) => return Ok(http::closing(http::text(400, "expected a JSON object"))),
    };
    let (id, behavior) = match parse_answer(&body) {
        Ok(a) => a,
        Err(message) => return Ok(http::text(400, message)),
    };
    Ok(if app.approvals.answer(&id, behavior, &req.peer, now) {
        http::json(200, &json!({ "ok": true, "behavior": behavior.as_str() }))
    } else {
        http::json(404, &json!({ "error": GONE_MESSAGE }))
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn approvals(dir: &std::path::Path, on: &[&str], wait_ms: u64) -> Approvals {
        Approvals::new(on.iter().map(|s| (*s).to_string()).collect(), Duration::from_millis(wait_ms), dir.to_path_buf())
    }

    fn hook() -> Value {
        json!({ "hook_event_name": "PermissionRequest", "session_id": "s1", "cwd": "E:\\work\\InfoPanel.Studio", "tool_name": "Bash", "tool_input": { "command": "npm run build && npm run verify", "description": "Build" } })
    }

    fn running() -> (watch::Sender<bool>, watch::Receiver<bool>) {
        watch::channel(false)
    }

    fn answers(a: &Approvals) -> Vec<String> {
        a.entries().iter().map(|e| e["answer"].as_str().unwrap_or("").to_string()).collect()
    }

    #[test]
    fn reads_the_switch_per_agent() {
        assert_eq!(parse_agents(Some(" Claude, codex,claude,gemini")), vec!["claude", "codex"]);
        assert!(parse_agents(None).is_empty());
        assert!(parse_agents(Some("")).is_empty());
    }

    #[test]
    fn shows_the_command_in_full_else_the_file_else_the_input() {
        let long = "x".repeat(10_000);
        assert_eq!(request_text(Some(&json!({ "command": long }))), long);
        assert_eq!(request_text(Some(&json!({ "file_path": "src/a.ts", "content": "…" }))), "src/a.ts");
        assert_eq!(request_text(Some(&json!({ "a": 1 }))), "{\n  \"a\": 1\n}");
        assert_eq!(request_text(None), "");
    }

    #[test]
    fn reads_an_answer() {
        assert_eq!(parse_answer(r#"{"id":"a","behavior":"deny"}"#), Ok(("a".into(), Behavior::Deny)));
        assert!(parse_answer(r#"{"id":"a","behavior":"ask"}"#).is_err());
        assert!(parse_answer(r#"{"behavior":"allow"}"#).is_err());
        assert!(parse_answer("nope").is_err());
    }

    #[tokio::test]
    async fn an_agent_that_is_off_is_never_held() {
        let dir = tempfile::tempdir().unwrap();
        let a = approvals(dir.path(), &["codex"], 5_000);
        let (_keep, stop) = running();
        assert_eq!(a.wait("claude", &hook(), 0, stop).await, Outcome::Skipped);
        assert!(a.requests().is_empty());
        assert!(a.entries().is_empty());
    }

    #[tokio::test]
    async fn the_panel_allows_or_denies_and_each_answer_is_logged() {
        let dir = tempfile::tempdir().unwrap();
        let a = approvals(dir.path(), &["claude"], 5_000);
        for behavior in [Behavior::Allow, Behavior::Deny] {
            let (_keep, stop) = running();
            let waiter = { let a = a.clone(); tokio::spawn(async move { a.wait("claude", &hook(), 0, stop).await }) };
            let id = loop {
                if let Some(r) = a.requests().first() {
                    break r.id.clone();
                }
                tokio::task::yield_now().await;
            };
            let r = &a.requests()[0];
            assert_eq!((r.agent.as_str(), r.project.as_str(), r.tool.as_str(), r.text.as_str()), ("claude", "InfoPanel.Studio", "Bash", "npm run build && npm run verify"));
            assert_eq!(r.session, public_key("claude:s1"));
            assert!(a.answer(&id, behavior, "127.0.0.1", 1));
            assert_eq!(waiter.await.unwrap(), Outcome::Answered(behavior));
            // answered once: a second answer finds nothing
            assert!(!a.answer(&id, Behavior::Allow, "127.0.0.1", 2));
            assert!(a.requests().is_empty());
        }
        assert_eq!(answers(&a), vec!["allow", "deny"]);
        assert_eq!(a.entries()[0]["text"], "npm run build && npm run verify");
    }

    #[tokio::test]
    async fn no_answer_in_time_goes_back_to_the_terminal() {
        let dir = tempfile::tempdir().unwrap();
        let a = approvals(dir.path(), &["claude"], 50);
        let (_keep, stop) = running();
        assert_eq!(a.wait("claude", &hook(), 0, stop).await, Outcome::None);
        assert!(a.requests().is_empty());
        assert_eq!(answers(&a), vec!["none"]);
    }

    #[tokio::test]
    async fn a_stopping_server_and_a_hook_that_goes_away_leave_nothing_waiting() {
        let dir = tempfile::tempdir().unwrap();
        let a = approvals(dir.path(), &["claude"], 60_000);
        let (tx, stop) = running();
        let waiter = { let a = a.clone(); tokio::spawn(async move { a.wait("claude", &hook(), 0, stop).await }) };
        while a.requests().is_empty() {
            tokio::task::yield_now().await;
        }
        tx.send(true).unwrap();
        assert_eq!(waiter.await.unwrap(), Outcome::None);
        // the hook's connection closes: the handler's future is dropped mid-wait
        let (_keep, stop) = running();
        let waiter = { let a = a.clone(); tokio::spawn(async move { a.wait("claude", &hook(), 0, stop).await }) };
        while a.requests().is_empty() {
            tokio::task::yield_now().await;
        }
        waiter.abort();
        let _ = waiter.await;
        assert!(a.requests().is_empty());
        assert_eq!(answers(&a), vec!["none", "gone"]);
    }

    #[tokio::test]
    async fn past_the_limit_a_request_goes_straight_to_the_terminal() {
        let dir = tempfile::tempdir().unwrap();
        let a = approvals(dir.path(), &["claude"], 60_000);
        let (_keep, stop) = running();
        let mut held = Vec::new();
        for _ in 0..MAX_PENDING {
            let (a, stop) = (a.clone(), stop.clone());
            held.push(tokio::spawn(async move { a.wait("claude", &hook(), 0, stop).await }));
        }
        while a.requests().len() < MAX_PENDING {
            tokio::task::yield_now().await;
        }
        assert_eq!(a.wait("claude", &hook(), 0, stop).await, Outcome::Skipped);
        for h in held {
            h.abort();
        }
    }
}
