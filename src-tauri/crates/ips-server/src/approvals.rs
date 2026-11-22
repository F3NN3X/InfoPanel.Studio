// Agent approvals from the panel (pinned layer P8, decision 5, owner Q4): a coding agent's permission request, answered in
// InfoPanel Studio's own prompt window on this PC. Allowing a tool call approves running code, so every layer has to agree:
//
// - it is off unless the agent is named in AGENT_APPROVALS (the app's Settings > Coding agents switches set it), read at
//   start only. While an agent is off its requests are recorded as events and answered `{}` at once;
// - the hook (`ips-agent permission <agent>`, a foreground PermissionRequest hook) posts here from this machine with the agent
//   header (`agent_write_refusal`) and a fresh nonce, and waits at most `WAIT`. With no answer it gets `{}`, prints nothing,
//   and the agent shows its own prompt in the terminal. Silence never allows and never denies;
// - an answer carries the server's signature over the nonce, the request's id and the decision (`hook_auth.rs`), so the hook
//   takes no decision from another program listening on the port;
// - nothing on HTTP reads a request or gives an answer: any process on this PC can send HTTP to loopback, the agent asking
//   included, and so can every page and code widget the server serves. The desktop app reads the requests and gives the
//   answers in-process (`requests`, `answer`), from its prompt window, a local page no server page can run in. The old HTTP
//   paths answer 403. A kiosk in a browser can't answer; it shows that the agent waits;
// - every outcome is logged (DATA_DIR/agent-approvals-log.jsonl, cut back past 256 KB): allow, deny, a request that went back
//   to the terminal (`none`) or whose hook went away (`gone`). The log is read in-process too (`entries`).
//
// POST /api/agents/permission?agent=claude|codex   the hook's JSON with `X-Agent-Nonce` → 200
//                                                  `{ behavior: "allow" | "deny", id, mac }` or `{}`
// /api/agents/requests, /api/agents/answer, /api/agents/requests/log   403, any method

use std::io::Write as _;
use std::path::PathBuf;
use std::sync::{Arc, Mutex, OnceLock, PoisonError};
use std::time::Duration;

use axum::body::Body;
use axum::http::{Method, Response};
use serde_json::{json, Map, Value};
use tokio::sync::{oneshot, watch};

use crate::agents::{project_of, public_key, tool_of, AGENTS};
use crate::hook_auth::{self, Key};
use crate::http::{self, Req};
use crate::request_guard::agent_write_refusal;
use crate::App;

/// How long a request waits for the panel before it goes back to the terminal. The hook gives up a little later and is
/// installed with a timeout above both (ips-agent's `PERMISSION_DEADLINE`, install.rs `PERMISSION_TIMEOUT`).
pub const WAIT: Duration = Duration::from_secs(25);
/// The most requests waiting at once; past it a request goes straight to the terminal.
pub const MAX_PENDING: usize = 8;
const MAX_HOOK_BYTES: usize = 512 * 1024;
const LOG: &str = "agent-approvals-log.jsonl";
const LOG_MAX_BYTES: u64 = 256 * 1024;
const LOG_READ: usize = 200;

pub const HTTP_REFUSED_MESSAGE: &str =
    "Agent requests are shown and answered only in InfoPanel Studio's own prompt window on this PC, never over HTTP.";

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

/// The field that says what a tool call does, shown first.
const SUMMARY_KEYS: [&str; 6] = ["command", "file_path", "url", "path", "pattern", "query"];

fn value_text(v: &Value) -> String {
    match v {
        Value::String(s) => s.clone(),
        other => serde_json::to_string_pretty(other).unwrap_or_default(),
    }
}

/// `text` with each line marked (`- ` taken out, `+ ` put in).
fn marked(text: &str, mark: &str) -> String {
    text.split('\n').map(|l| format!("{mark}{l}")).collect::<Vec<_>>().join("\n")
}

/// One edit's change as a diff: what goes, then what comes.
fn diff(edit: &Map<String, Value>) -> String {
    let old = edit.get("old_string").map(value_text).unwrap_or_default();
    let new = edit.get("new_string").map(value_text).unwrap_or_default();
    format!("{}\n{}", marked(&old, "- "), marked(&new, "+ "))
}

/// What the panel shows of a tool call, every field of its input and nothing cut: the summary field first (the command, the
/// file, the address), then each other field by name, an edit's old and new text as a diff and a file's new content as it is.
pub fn request_text(input: Option<&Value>) -> String {
    let Some(input) = input else { return String::new() };
    let Some(o) = input.as_object() else { return if input.is_null() { String::new() } else { value_text(input) } };
    let summary = SUMMARY_KEYS.into_iter().find(|k| o.get(*k).is_some_and(Value::is_string));
    let mut parts: Vec<String> = Vec::new();
    if let Some(k) = summary {
        parts.push(value_text(&o[k]));
    }
    let edits = o.contains_key("old_string") || o.contains_key("new_string");
    if edits {
        parts.push(format!("change:\n{}", diff(o)));
    }
    for (k, v) in o {
        if Some(k.as_str()) == summary || (edits && (k == "old_string" || k == "new_string")) {
            continue;
        }
        let shown = match (k.as_str(), v) {
            ("edits", Value::Array(list)) => list
                .iter()
                .enumerate()
                .map(|(i, e)| match e.as_object() {
                    Some(e) => {
                        let rest: Map<String, Value> = e
                            .iter()
                            .filter(|(k, _)| *k != "old_string" && *k != "new_string")
                            .map(|(k, v)| (k.clone(), v.clone()))
                            .collect();
                        let extra = if rest.is_empty() { String::new() } else { format!("\n{}", value_text(&Value::Object(rest))) };
                        format!("edit {}:\n{}{extra}", i + 1, diff(e))
                    }
                    None => format!("edit {}:\n{}", i + 1, value_text(e)),
                })
                .collect::<Vec<_>>()
                .join("\n"),
            (_, Value::String(s)) if s.contains('\n') => format!("{k}:\n{s}"),
            (_, Value::String(s)) => format!("{k}: {s}"),
            _ => format!("{k}: {}", value_text(v)),
        };
        parts.push(shown);
    }
    parts.join("\n\n")
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

/// A request waiting for the prompt.
#[derive(Debug, Clone, PartialEq)]
pub struct Request {
    pub id: String,
    pub agent: String,
    /// The session's public key (`public_agents`), so a session's card can tell it waits for this.
    pub session: String,
    pub project: String,
    pub tool: String,
    /// The tool's input in full (`request_text`).
    pub text: String,
    /// When it stops waiting, ms.
    pub until: i64,
}

impl Request {
    /// The request as the prompt window reads it, with the ms left of its wait.
    pub fn to_json(&self, now: i64) -> Value {
        json!({ "id": self.id, "agent": self.agent, "session": self.session, "project": self.project, "tool": self.tool, "text": self.text, "left": (self.until - now).max(0) })
    }
}

struct Pending {
    request: Request,
    answer: Option<oneshot::Sender<Behavior>>,
}

struct Inner {
    enabled: Vec<String>,
    wait: Duration,
    log_dir: PathBuf,
    /// The key the answers are signed with; None (approvals off, or no key could be made) answers nothing.
    key: Option<Key>,
    pending: Mutex<Vec<Pending>>,
    write: Mutex<()>,
    on_change: OnceLock<Box<dyn Fn() + Send + Sync>>,
}

/// The requests waiting for the prompt, the switch per agent, the signing key, and the log.
#[derive(Clone)]
pub struct Approvals(Arc<Inner>);

/// How a wait ended.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Outcome {
    Answered(Behavior),
    /// Nobody answered in time, or the server is stopping: the terminal asks.
    None,
    /// The agent is off, the hook sent no nonce, there is no key, or too many wait already: answered `{}` at once.
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
            self.approvals.changed();
        }
    }
}

impl Approvals {
    /// Approvals for `enabled` agents, logged in `log_dir`; with any on, the signing key is read from `key_file` or made there.
    pub fn new(enabled: Vec<String>, wait: Duration, log_dir: PathBuf, key_file: PathBuf) -> Self {
        let key = if enabled.is_empty() {
            None
        } else {
            match hook_auth::load_or_create(&key_file) {
                Ok(key) => Some(key),
                Err(err) => {
                    log::warn!(target: "server", "approvals: no agent hook key ({err}); requests go to the terminal");
                    None
                }
            }
        };
        Self(Arc::new(Inner {
            enabled,
            wait,
            log_dir,
            key,
            pending: Mutex::new(Vec::new()),
            write: Mutex::new(()),
            on_change: OnceLock::new(),
        }))
    }

    pub fn enabled(&self, agent: &str) -> bool {
        self.0.enabled.iter().any(|a| a == agent)
    }

    pub fn agents(&self) -> &[String] {
        &self.0.enabled
    }

    /// What runs when a request arrives or goes; set once, by the desktop app's prompt window.
    pub fn set_on_change(&self, f: impl Fn() + Send + Sync + 'static) {
        let _ = self.0.on_change.set(Box::new(f));
    }

    fn changed(&self) {
        if let Some(f) = self.0.on_change.get() {
            f();
        }
    }

    fn lock(&self) -> std::sync::MutexGuard<'_, Vec<Pending>> {
        self.0.pending.lock().unwrap_or_else(PoisonError::into_inner)
    }

    /// The requests waiting now, oldest first.
    pub fn requests(&self) -> Vec<Request> {
        self.lock().iter().map(|p| p.request.clone()).collect()
    }

    /// The signature the hook checks on decision `behavior` for request `id` asked with `nonce`.
    pub fn sign(&self, nonce: &str, id: &str, behavior: Behavior) -> Option<String> {
        self.0.key.as_ref().map(|key| hook_auth::sign(key, nonce, id, behavior.as_str()))
    }

    /// Waits for the prompt's answer to the hook's `payload`, at most the wait, or until `stop` turns true. The answer's id is
    /// returned with it, for the signature.
    pub async fn wait(&self, agent: &str, payload: &Value, now: i64, mut stop: watch::Receiver<bool>) -> (Outcome, String) {
        if !self.enabled(agent) || self.0.key.is_none() {
            return (Outcome::Skipped, String::new());
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
        let id = request.id.clone();
        let (tx, rx) = oneshot::channel();
        {
            let mut list = self.lock();
            if list.len() >= MAX_PENDING {
                return (Outcome::Skipped, String::new());
            }
            list.push(Pending { request, answer: Some(tx) });
        }
        self.changed();
        let mut waiting = Waiting { approvals: self, id: id.clone(), outcome: None };
        let outcome = tokio::select! {
            answer = rx => answer.map_or(Outcome::None, Outcome::Answered),
            () = tokio::time::sleep(self.0.wait) => Outcome::None,
            _ = stop.wait_for(|s| *s) => Outcome::None,
        };
        waiting.outcome = Some(outcome);
        (outcome, id)
    }

    /// The prompt's answer to request `id`, logged with `from`. It takes exactly that request, which must still be waiting: an
    /// id that is gone, or any other, is refused (false) and nothing else is answered.
    pub fn answer(&self, id: &str, behavior: Behavior, from: &str, now: i64) -> bool {
        let taken = {
            let mut list = self.lock();
            let at = list.iter().position(|p| p.request.id == id);
            at.map(|i| list.remove(i))
        };
        let Some(mut pending) = taken else { return false };
        self.log(now, from, &pending.request, behavior.as_str());
        let sent = pending.answer.take().is_some_and(|tx| tx.send(behavior).is_ok());
        self.changed();
        sent
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
        let written =
            std::fs::OpenOptions::new().create(true).append(true).open(&file).and_then(|mut f| writeln!(f, "{}", Value::Object(line)));
        if let Err(err) = written {
            log::warn!(target: "server", "approvals: could not write the log: {err}");
        }
        if std::fs::metadata(&file).is_ok_and(|m| m.len() > LOG_MAX_BYTES) {
            crate::actions::trim(&file, (LOG_MAX_BYTES / 2) as usize);
        }
    }

    /// The last `LOG_READ` entries, oldest first.
    pub fn entries(&self) -> Vec<Value> {
        read_log(&self.0.log_dir)
    }
}

/// The last `LOG_READ` entries of the log in `data_dir`, oldest first, whether or not a server runs.
pub fn read_log(data_dir: &std::path::Path) -> Vec<Value> {
    let text = crate::store::read_text(&data_dir.join(LOG)).unwrap_or_default();
    let lines: Vec<&str> = text.lines().collect();
    lines[lines.len().saturating_sub(LOG_READ)..].iter().filter_map(|l| serde_json::from_str(l).ok()).collect()
}

/// The routes: the hook's post, and a refusal on the paths that once read or answered requests over HTTP.
pub async fn handle(app: &App, req: Req) -> std::io::Result<Response<Body>> {
    match req.path.as_str() {
        "/api/agents/permission" => handle_permission(app, req).await,
        _ => Ok(http::text(403, HTTP_REFUSED_MESSAGE)),
    }
}

async fn handle_permission(app: &App, mut req: Req) -> std::io::Result<Response<Body>> {
    if req.method != Method::POST {
        return Ok(http::empty(405));
    }
    if let Some(refusal) =
        agent_write_refusal(req.header("content-type").as_deref(), req.header("x-agent-event").as_deref(), Some(&req.peer))
    {
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
    // an answer is signed over the hook's nonce; a hook that sends none can't check one, so it isn't held
    let Some(nonce) = req.header("x-agent-nonce").filter(|n| hook_auth::valid_nonce(n)) else {
        return Ok(http::json(200, &json!({})));
    };
    let (outcome, id) = app.approvals.wait(&agent, &payload, crate::config::now_ms(), app.shutdown.clone()).await;
    Ok(match outcome {
        Outcome::Answered(b) => match app.approvals.sign(&nonce, &id, b) {
            Some(mac) => http::json(200, &json!({ "behavior": b.as_str(), "id": id, "mac": mac })),
            None => http::json(200, &json!({})),
        },
        Outcome::None | Outcome::Skipped => http::json(200, &json!({})),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn approvals(dir: &std::path::Path, on: &[&str], wait_ms: u64) -> Approvals {
        Approvals::new(
            on.iter().map(|s| (*s).to_string()).collect(),
            Duration::from_millis(wait_ms),
            dir.to_path_buf(),
            dir.join("config").join(hook_auth::KEY_FILE),
        )
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

    async fn first(a: &Approvals) -> Request {
        loop {
            if let Some(r) = a.requests().first() {
                return r.clone();
            }
            tokio::task::yield_now().await;
        }
    }

    #[test]
    fn reads_the_switch_per_agent() {
        assert_eq!(parse_agents(Some(" Claude, codex,claude,gemini")), vec!["claude", "codex"]);
        assert!(parse_agents(None).is_empty());
        assert!(parse_agents(Some("")).is_empty());
    }

    #[test]
    fn shows_every_field_with_the_command_first_and_nothing_cut() {
        let long = "x".repeat(10_000);
        let bash = request_text(Some(
            &json!({ "command": format!("ls\nrm -rf /tmp/a {long}"), "description": "List, then clean up", "timeout": 120000, "run_in_background": true }),
        ));
        assert!(bash.starts_with(&format!("ls\nrm -rf /tmp/a {long}")));
        for field in ["description: List, then clean up", "timeout: 120000", "run_in_background: true"] {
            assert!(bash.contains(field), "{field} in {bash:.80}");
        }
        let edit = request_text(Some(
            &json!({ "file_path": "src/a.ts", "old_string": "let a = 1;\nlet b = 2;", "new_string": "let a = 3;", "replace_all": false }),
        ));
        assert_eq!(edit, "src/a.ts\n\nchange:\n- let a = 1;\n- let b = 2;\n+ let a = 3;\n\nreplace_all: false");
        let write = request_text(Some(&json!({ "file_path": "run.ps1", "content": "Remove-Item -Recurse C:\\\nWrite-Host done" })));
        assert_eq!(write, "run.ps1\n\ncontent:\nRemove-Item -Recurse C:\\\nWrite-Host done");
        let multi =
            request_text(Some(&json!({ "file_path": "b.rs", "edits": [{ "old_string": "a", "new_string": "b", "replace_all": true }] })));
        assert_eq!(multi, "b.rs\n\nedit 1:\n- a\n+ b\n{\n  \"replace_all\": true\n}");
        // no summary field: every field still shows
        assert_eq!(request_text(Some(&json!({ "a": 1, "b": "two" }))), "a: 1\n\nb: two");
        assert_eq!(request_text(None), "");
    }

    #[tokio::test]
    async fn an_agent_that_is_off_is_never_held_and_has_no_key() {
        let dir = tempfile::tempdir().unwrap();
        let a = approvals(dir.path(), &[], 5_000);
        let (_keep, stop) = running();
        assert_eq!(a.wait("claude", &hook(), 0, stop).await.0, Outcome::Skipped);
        assert!(a.requests().is_empty());
        assert!(!dir.path().join("config").join(hook_auth::KEY_FILE).exists());
        assert_eq!(a.sign("0123456789abcdef0123456789abcdef", "x", Behavior::Allow), None);
    }

    #[tokio::test]
    async fn the_prompt_allows_or_denies_each_logged_and_the_change_is_told() {
        let dir = tempfile::tempdir().unwrap();
        let a = approvals(dir.path(), &["claude"], 5_000);
        let told = Arc::new(std::sync::atomic::AtomicUsize::new(0));
        a.set_on_change({
            let told = Arc::clone(&told);
            move || {
                told.fetch_add(1, std::sync::atomic::Ordering::SeqCst);
            }
        });
        for behavior in [Behavior::Allow, Behavior::Deny] {
            let (_keep, stop) = running();
            let waiter = {
                let a = a.clone();
                tokio::spawn(async move { a.wait("claude", &hook(), 0, stop).await })
            };
            let r = first(&a).await;
            assert_eq!((r.agent.as_str(), r.project.as_str(), r.tool.as_str()), ("claude", "InfoPanel.Studio", "Bash"));
            assert_eq!(r.text, "npm run build && npm run verify\n\ndescription: Build");
            assert_eq!(r.session, public_key("claude:s1"));
            assert!(a.answer(&r.id, behavior, "prompt", 1));
            assert_eq!(waiter.await.unwrap(), (Outcome::Answered(behavior), r.id.clone()));
            assert!(!a.answer(&r.id, Behavior::Allow, "prompt", 2));
        }
        assert_eq!(answers(&a), vec!["allow", "deny"]);
        // arrived and went, twice
        assert_eq!(told.load(std::sync::atomic::Ordering::SeqCst), 4);
    }

    #[tokio::test]
    async fn an_answer_takes_only_the_request_it_names() {
        let dir = tempfile::tempdir().unwrap();
        let a = approvals(dir.path(), &["claude"], 60_000);
        let (_keep, stop) = running();
        let one = {
            let (a, stop) = (a.clone(), stop.clone());
            tokio::spawn(async move { a.wait("claude", &hook(), 0, stop).await })
        };
        let old = first(&a).await;
        assert!(a.answer(&old.id, Behavior::Deny, "prompt", 1));
        assert_eq!(one.await.unwrap().0, Outcome::Answered(Behavior::Deny));
        // the same session asks again: an answer that names the earlier request takes nothing
        let two = {
            let a = a.clone();
            tokio::spawn(async move { a.wait("claude", &hook(), 0, stop).await })
        };
        let new = first(&a).await;
        assert_ne!(new.id, old.id);
        assert!(!a.answer(&old.id, Behavior::Allow, "prompt", 2));
        assert_eq!(a.requests(), vec![new.clone()]);
        assert!(a.answer(&new.id, Behavior::Deny, "prompt", 3));
        assert_eq!(two.await.unwrap().0, Outcome::Answered(Behavior::Deny));
    }

    #[tokio::test]
    async fn no_answer_in_time_goes_back_to_the_terminal() {
        let dir = tempfile::tempdir().unwrap();
        let a = approvals(dir.path(), &["claude"], 50);
        let (_keep, stop) = running();
        assert_eq!(a.wait("claude", &hook(), 0, stop).await.0, Outcome::None);
        assert!(a.requests().is_empty());
        assert_eq!(answers(&a), vec!["none"]);
    }

    #[tokio::test]
    async fn a_stopping_server_and_a_hook_that_goes_away_leave_nothing_waiting() {
        let dir = tempfile::tempdir().unwrap();
        let a = approvals(dir.path(), &["claude"], 60_000);
        let (tx, stop) = running();
        let waiter = {
            let a = a.clone();
            tokio::spawn(async move { a.wait("claude", &hook(), 0, stop).await })
        };
        first(&a).await;
        tx.send(true).unwrap();
        assert_eq!(waiter.await.unwrap().0, Outcome::None);
        let (_keep, stop) = running();
        let waiter = {
            let a = a.clone();
            tokio::spawn(async move { a.wait("claude", &hook(), 0, stop).await })
        };
        first(&a).await;
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
        assert_eq!(a.wait("claude", &hook(), 0, stop).await.0, Outcome::Skipped);
        for h in held {
            h.abort();
        }
    }
}
