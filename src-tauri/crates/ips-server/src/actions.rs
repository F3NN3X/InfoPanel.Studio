// The action runner (pinned layer P7, decision 4): a touch action `{ op: "run", command }` asks this server to start a
// program on this PC. It is the panel's one way to run something, so every layer below has to agree before anything runs:
//
// - the runner is off unless ACTION_RUNNER=on (the app's Settings > Actions switch sets it), read at start only;
// - a run comes from this machine (the local kiosk) unless "Allow editing from other devices" is on (`remote_edit_refusal`),
//   with the control header and JSON (`control_write_refusal`), so a page on another site cannot post one;
// - the command must be approved, word for word. Approvals are kept here (DATA_DIR/actions.json), never in the config, and
//   only this machine may give or take one back, whatever ALLOW_REMOTE_EDIT says: a config written from another device, or a
//   profile file imported, can name a command but never approve it;
// - test mode (or `dry: true`) checks all of that and logs what would run, and starts nothing;
// - every request that reaches a decision is logged (DATA_DIR/actions-log.jsonl, the last few hundred lines).
//
// No shell is involved. `split_command` cuts the command into the program and its arguments (spaces separate, double quotes
// group, `""` inside quotes is a quote, nothing else is special: `&`, `|`, `>`, `%VAR%` and `^` are plain text), and
// `std::process::Command` starts the program with them as separate arguments, quoting each for the Windows command line.
// A `.bat` or `.cmd` program is run by Windows through cmd.exe; Rust's std escapes its arguments for that and refuses to start
// one it can't pass safely (CVE-2024-24576, fixed in Rust 1.77.2). Hold to confirm is the kiosk's: the server can't see a
// finger, so it never relies on it.
//
// GET  /api/actions          `{ runner, obsStream, testMode, approved: [command] }` (this machine, or remote editing on)
// PUT  /api/actions          `{ approve?: [command], revoke?: [command], testMode?: bool }` (this machine only)
// GET  /api/actions/log      `{ entries: [{ at, from, command?, outcome, reason?, program?, args? }] }`, oldest first
// POST /api/actions/run      `{ command, dry?: bool }` → 200 `{ ran, dry, program, args }`; 403 `{ error, reason }` with
//                            reason `remote`, `off` or `unapproved`; 400 for a body or command that is not one; 500 when
//                            the program could not be started

use std::io::Write as _;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

use axum::body::Body;
use axum::http::{Method, Response};
use serde_json::{json, Map, Value};

use crate::http::{self, Req};
use crate::request_guard::{control_write_refusal, is_loopback, remote_edit_refusal};
use crate::App;

const MAX_BODY_BYTES: usize = 64 * 1024;
/// The longest command kept or run, in bytes.
pub const MAX_COMMAND_BYTES: usize = 2048;
/// The most approvals kept.
pub const MAX_APPROVED: usize = 500;
/// Once the log passes this size it is cut back to its newest lines that fit in half of it.
const LOG_MAX_BYTES: u64 = 256 * 1024;
/// The most entries GET /api/actions/log returns.
const LOG_READ: usize = 200;

const STORE: &str = "actions.json";
const LOG: &str = "actions-log.jsonl";

pub const OFF_MESSAGE: &str = "Running commands is off. Turn it on in Settings > Actions on the PC running InfoPanel Studio.";
pub const UNAPPROVED_MESSAGE: &str = "This command isn't approved. Approve it in Settings > Actions on the PC running InfoPanel Studio.";
pub const APPROVE_HERE_MESSAGE: &str = "Commands are approved on the PC running InfoPanel Studio only.";

/// A command cut into its program and arguments, or why it can't be.
pub fn split_command(command: &str) -> Result<(String, Vec<String>), String> {
    if command.contains('\0') {
        return Err("a command can't hold a NUL character".into());
    }
    let mut words: Vec<String> = Vec::new();
    let mut word = String::new();
    // a word has started (so `""` is an empty argument, not nothing)
    let mut started = false;
    let mut quoted = false;
    let mut chars = command.chars().peekable();
    while let Some(c) = chars.next() {
        match c {
            '"' if quoted && chars.peek() == Some(&'"') => {
                chars.next();
                word.push('"');
            }
            '"' => {
                quoted = !quoted;
                started = true;
            }
            c if c.is_whitespace() && !quoted => {
                if started {
                    words.push(std::mem::take(&mut word));
                    started = false;
                }
            }
            c => {
                word.push(c);
                started = true;
            }
        }
    }
    if quoted {
        return Err("a quote is not closed".into());
    }
    if started {
        words.push(word);
    }
    let mut words = words.into_iter();
    match words.next() {
        Some(program) if !program.is_empty() => Ok((program, words.collect())),
        _ => Err("the command names no program".into()),
    }
}

/// What actions.json holds.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct Stored {
    pub approved: Vec<String>,
    pub test_mode: bool,
}

impl Stored {
    fn of(v: &Value) -> Self {
        let approved = v.get("approved").and_then(Value::as_array).map_or_else(Vec::new, |list| {
            list.iter().filter_map(Value::as_str).filter(|c| valid_command(c)).map(String::from).take(MAX_APPROVED).collect()
        });
        Self { approved, test_mode: v.get("testMode").and_then(Value::as_bool).unwrap_or(false) }
    }

    fn to_json(&self) -> Value {
        json!({ "approved": self.approved, "testMode": self.test_mode })
    }
}

fn valid_command(c: &str) -> bool {
    !c.trim().is_empty() && c.len() <= MAX_COMMAND_BYTES && !c.contains('\0')
}

/// One line of the log.
#[derive(Debug, Clone, PartialEq)]
pub struct Entry {
    pub from: String,
    pub command: Option<String>,
    /// `ran`, `dry`, `refused` or `failed`.
    pub outcome: &'static str,
    pub reason: Option<String>,
    pub program: Option<(String, Vec<String>)>,
}

/// How a run turned out, before the log line and the answer are written.
#[derive(Debug, PartialEq)]
pub enum Decision {
    Refused { status: u16, reason: &'static str, message: String },
    Dry { program: String, args: Vec<String> },
    Run { program: String, args: Vec<String> },
}

/// The checks of a run that reach a decision without starting anything, in order: the runner switch, then approval, then
/// the command's shape; a dry run (or test mode) stops there.
pub fn decide(runner: bool, stored: &Stored, command: &str, dry: bool) -> Decision {
    if !runner {
        return Decision::Refused { status: 403, reason: "off", message: OFF_MESSAGE.into() };
    }
    if !stored.approved.iter().any(|c| c == command) {
        return Decision::Refused { status: 403, reason: "unapproved", message: UNAPPROVED_MESSAGE.into() };
    }
    match split_command(command) {
        Err(message) => Decision::Refused { status: 400, reason: "command", message },
        Ok((program, args)) if dry || stored.test_mode => Decision::Dry { program, args },
        Ok((program, args)) => Decision::Run { program, args },
    }
}

/// The approvals, test mode and log, in the data folder.
pub struct Actions {
    dir: PathBuf,
    /// Held across a read-change-write of actions.json and a log append.
    write: Mutex<()>,
}

impl Actions {
    pub fn new(dir: PathBuf) -> Self {
        Self { dir, write: Mutex::new(()) }
    }

    pub fn stored(&self) -> Stored {
        Stored::of(&crate::store::read_json(&self.dir.join(STORE)).unwrap_or(Value::Null))
    }

    /// Approves and revokes commands and sets test mode, then saves.
    pub fn change(&self, approve: &[String], revoke: &[String], test_mode: Option<bool>) -> std::io::Result<Stored> {
        let _held = self.write.lock().unwrap_or_else(|e| e.into_inner());
        let mut s = self.stored();
        s.approved.retain(|c| !revoke.contains(c));
        for c in approve {
            if !s.approved.contains(c) && s.approved.len() < MAX_APPROVED {
                s.approved.push(c.clone());
            }
        }
        if let Some(on) = test_mode {
            s.test_mode = on;
        }
        std::fs::create_dir_all(&self.dir)?;
        crate::store::write_atomic(&self.dir.join(STORE), s.to_json().to_string().as_bytes())?;
        Ok(s)
    }

    /// Appends a line to the log, cutting it back once it has grown past its size.
    pub fn log(&self, at: i64, e: &Entry) {
        let _held = self.write.lock().unwrap_or_else(|e| e.into_inner());
        let mut line = Map::new();
        line.insert("at".into(), json!(at));
        line.insert("from".into(), json!(e.from));
        line.insert("outcome".into(), json!(e.outcome));
        if let Some(c) = &e.command {
            line.insert("command".into(), json!(c));
        }
        if let Some(r) = &e.reason {
            line.insert("reason".into(), json!(r));
        }
        if let Some((program, args)) = &e.program {
            line.insert("program".into(), json!(program));
            line.insert("args".into(), json!(args));
        }
        let file = self.dir.join(LOG);
        let _ = std::fs::create_dir_all(&self.dir);
        let written =
            std::fs::OpenOptions::new().create(true).append(true).open(&file).and_then(|mut f| writeln!(f, "{}", Value::Object(line)));
        if let Err(err) = written {
            log::warn!(target: "server", "actions: could not write the log: {err}");
        }
        if std::fs::metadata(&file).is_ok_and(|m| m.len() > LOG_MAX_BYTES) {
            trim(&file, (LOG_MAX_BYTES / 2) as usize);
        }
    }

    /// The last `LOG_READ` entries, oldest first.
    pub fn entries(&self) -> Vec<Value> {
        let text = crate::store::read_text(&self.dir.join(LOG)).unwrap_or_default();
        let lines: Vec<&str> = text.lines().collect();
        lines[lines.len().saturating_sub(LOG_READ)..].iter().filter_map(|l| serde_json::from_str(l).ok()).collect()
    }
}

/// Keeps the newest whole lines of `file` that fit in `budget` bytes.
pub(crate) fn trim(file: &Path, budget: usize) {
    let Ok(text) = crate::store::read_text(file) else { return };
    let mut size = 0;
    let newest: Vec<&str> = text
        .lines()
        .rev()
        .take_while(|l| {
            size += l.len() + 1;
            size <= budget
        })
        .collect();
    let kept: String = newest.iter().rev().map(|l| format!("{l}\n")).collect();
    let _ = crate::store::write_atomic(file, kept.as_bytes());
}

/// Starts `program` with `args`, no shell, its input and output closed, in the user's home folder. It is not waited for.
fn start(program: &str, args: &[String]) -> std::io::Result<()> {
    let mut cmd = std::process::Command::new(program);
    cmd.args(args).stdin(std::process::Stdio::null()).stdout(std::process::Stdio::null()).stderr(std::process::Stdio::null());
    if let Some(home) = std::env::home_dir() {
        cmd.current_dir(home);
    }
    let child = cmd.spawn()?;
    // On Windows the handle just closes; elsewhere a thread reaps the child when it ends, so it leaves no zombie.
    #[cfg(not(windows))]
    std::thread::spawn(move || {
        let mut child = child;
        let _ = child.wait();
    });
    #[cfg(windows)]
    drop(child);
    Ok(())
}

/// Whether a request from `peer` may approve or revoke a command, or set test mode: this PC only, whatever remote editing
/// allows, so another device can never both name a command (in the config) and approve it.
pub fn may_approve(peer: &str) -> bool {
    is_loopback(Some(peer))
}

/// Why a read of the runner's state is refused: another machine, unless remote editing is on.
fn read_refusal(app: &App, req: &Req) -> Option<Response<Body>> {
    app.refuse_remote_edit(req)
}

fn error(status: u16, reason: &str, message: impl Into<String>) -> Response<Body> {
    http::json(status, &json!({ "error": message.into(), "reason": reason }))
}

/// The routes under /api/actions.
pub async fn handle(app: &App, req: Req) -> std::io::Result<Response<Body>> {
    match req.path.as_str() {
        "/api/actions" => handle_state(app, req).await,
        "/api/actions/log" => Ok(handle_log(app, &req)),
        "/api/actions/run" => handle_run(app, req).await,
        _ => Ok(http::empty(404)),
    }
}

fn state_json(app: &App, s: &Stored) -> Value {
    json!({ "runner": app.cfg.action_runner, "obsStream": app.cfg.obs_stream, "testMode": s.test_mode, "approved": s.approved })
}

/// The list of commands in a PUT body's `key`, each a command that could be kept.
fn commands(body: &Value, key: &str) -> Result<Vec<String>, String> {
    match body.get(key) {
        None => Ok(Vec::new()),
        Some(Value::Array(list)) if list.len() <= MAX_APPROVED => list
            .iter()
            .map(|c| c.as_str().filter(|c| valid_command(c)).map(String::from))
            .collect::<Option<Vec<_>>>()
            .ok_or_else(|| format!("\"{key}\" must list commands of 1 to {MAX_COMMAND_BYTES} bytes")),
        Some(_) => Err(format!("\"{key}\" must list commands of 1 to {MAX_COMMAND_BYTES} bytes")),
    }
}

async fn handle_state(app: &App, mut req: Req) -> std::io::Result<Response<Body>> {
    if req.method == Method::GET || req.method == Method::HEAD {
        if let Some(refused) = read_refusal(app, &req) {
            return Ok(refused);
        }
        return Ok(http::json(200, &state_json(app, &app.actions.stored())));
    }
    if req.method != Method::PUT {
        return Ok(http::empty(405));
    }
    if !may_approve(&req.peer) {
        return Ok(error(403, "remote", APPROVE_HERE_MESSAGE));
    }
    if let Some(refusal) = control_write_refusal(req.header("content-type").as_deref(), req.header("x-dashboard-control").as_deref()) {
        return Ok(http::text(refusal.status, refusal.message));
    }
    let body = match req.read_body(MAX_BODY_BYTES).await {
        Ok(body) => body,
        Err(http::BodyRefused) => return Ok(http::closing(http::text(400, "expected a JSON object"))),
    };
    let body: Value = match serde_json::from_str(&body) {
        Ok(v @ Value::Object(_)) => v,
        _ => return Ok(http::text(400, "expected a JSON object")),
    };
    let (approve, revoke) = match (commands(&body, "approve"), commands(&body, "revoke")) {
        (Ok(a), Ok(r)) => (a, r),
        (Err(m), _) | (_, Err(m)) => return Ok(http::text(400, m)),
    };
    let test_mode = match body.get("testMode") {
        None => None,
        Some(Value::Bool(on)) => Some(*on),
        Some(_) => return Ok(http::text(400, "\"testMode\" must be true or false")),
    };
    match app.actions.change(&approve, &revoke, test_mode) {
        Ok(s) => Ok(http::json(200, &state_json(app, &s))),
        Err(err) => Ok(http::text(500, format!("could not save: {err}"))),
    }
}

fn handle_log(app: &App, req: &Req) -> Response<Body> {
    if req.method != Method::GET && req.method != Method::HEAD {
        return http::empty(405);
    }
    if let Some(refused) = read_refusal(app, req) {
        return refused;
    }
    http::json(200, &json!({ "entries": app.actions.entries() }))
}

/// Reads a run's body: `{ command, dry? }`.
pub fn parse_run(body: &str) -> Result<(String, bool), String> {
    let body: Value = serde_json::from_str(body).map_err(|_| "expected a JSON object".to_string())?;
    let Some(o) = body.as_object() else { return Err("expected a JSON object".into()) };
    let command = o
        .get("command")
        .and_then(Value::as_str)
        .filter(|c| valid_command(c))
        .ok_or_else(|| format!("\"command\" must be a command of 1 to {MAX_COMMAND_BYTES} bytes"))?;
    let dry = match o.get("dry") {
        None => false,
        Some(Value::Bool(dry)) => *dry,
        Some(_) => return Err("\"dry\" must be true or false".into()),
    };
    Ok((command.to_string(), dry))
}

async fn handle_run(app: &App, mut req: Req) -> std::io::Result<Response<Body>> {
    if req.method != Method::POST {
        return Ok(http::empty(405));
    }
    let now = crate::config::now_ms();
    if let Some(refusal) = remote_edit_refusal(Some(&req.peer), app.cfg.allow_remote_edit) {
        app.actions
            .log(now, &Entry { from: req.peer.clone(), command: None, outcome: "refused", reason: Some("remote".into()), program: None });
        return Ok(error(refusal.status, "remote", refusal.message));
    }
    if let Some(refusal) = control_write_refusal(req.header("content-type").as_deref(), req.header("x-dashboard-control").as_deref()) {
        return Ok(http::text(refusal.status, refusal.message));
    }
    let body = match req.read_body(MAX_BODY_BYTES).await {
        Ok(body) => body,
        Err(http::BodyRefused) => return Ok(http::closing(http::text(400, "expected a JSON object"))),
    };
    let (command, dry) = match parse_run(&body) {
        Ok(run) => run,
        Err(message) => return Ok(http::text(400, message)),
    };
    let entry = |outcome, reason: Option<String>, program: Option<(String, Vec<String>)>| Entry {
        from: req.peer.clone(),
        command: Some(command.clone()),
        outcome,
        reason,
        program,
    };
    Ok(match decide(app.cfg.action_runner, &app.actions.stored(), &command, dry) {
        Decision::Refused { status, reason, message } => {
            app.actions.log(now, &entry("refused", Some(reason.into()), None));
            error(status, reason, message)
        }
        Decision::Dry { program, args } => {
            app.actions.log(now, &entry("dry", None, Some((program.clone(), args.clone()))));
            http::json(200, &json!({ "ran": false, "dry": true, "program": program, "args": args }))
        }
        Decision::Run { program, args } => match start(&program, &args) {
            Ok(()) => {
                app.actions.log(now, &entry("ran", None, Some((program.clone(), args.clone()))));
                http::json(200, &json!({ "ran": true, "dry": false, "program": program, "args": args }))
            }
            Err(err) => {
                app.actions.log(now, &entry("failed", Some(err.to_string()), Some((program.clone(), args))));
                error(500, "failed", format!("couldn't start {program}: {err}"))
            }
        },
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn split(c: &str) -> Result<(String, Vec<String>), String> {
        split_command(c)
    }
    fn ok(program: &str, args: &[&str]) -> Result<(String, Vec<String>), String> {
        Ok((program.into(), args.iter().map(|a| a.to_string()).collect()))
    }

    #[test]
    fn splits_on_spaces_and_groups_quotes_with_nothing_else_special() {
        assert_eq!(split("notepad"), ok("notepad", &[]));
        assert_eq!(split("  explorer.exe   ms-settings:sound "), ok("explorer.exe", &["ms-settings:sound"]));
        assert_eq!(split(r#""C:\Program Files\App\app.exe" --open "a b""#), ok(r"C:\Program Files\App\app.exe", &["--open", "a b"]));
        // shell syntax is plain text: no pipe, no redirect, no chaining, no variables
        assert_eq!(
            split("cmd /c echo hi & del x | more > out %PATH% ^"),
            ok("cmd", &["/c", "echo", "hi", "&", "del", "x", "|", "more", ">", "out", "%PATH%", "^"])
        );
        // a quote inside quotes is two; an empty pair is an empty argument; quotes join with what touches them
        assert_eq!(split(r#"app "say ""hi""" "" a"b c"d"#), ok("app", &[r#"say "hi""#, "", "ab cd"]));
        // backslashes are kept as they are (Windows paths)
        assert_eq!(split(r"app C:\dir\ \\server\share"), ok("app", &[r"C:\dir\", r"\\server\share"]));
        // tabs and newlines separate too
        assert_eq!(split("app\ta\nb"), ok("app", &["a", "b"]));
    }

    #[test]
    fn refuses_a_command_it_cannot_cut_cleanly() {
        assert_eq!(split(r#"app "open"#), Err("a quote is not closed".into()));
        assert_eq!(split(""), Err("the command names no program".into()));
        assert_eq!(split("   "), Err("the command names no program".into()));
        assert_eq!(split(r#""" a"#), Err("the command names no program".into()));
        assert_eq!(split("app\0x"), Err("a command can't hold a NUL character".into()));
    }

    #[test]
    fn decides_off_then_approval_then_shape_then_dry() {
        let approved = Stored { approved: vec!["notepad a.txt".into(), r#"app "x"#.into()], test_mode: false };
        let refused = |d: Decision| match d {
            Decision::Refused { status, reason, .. } => (status, reason),
            other => panic!("{other:?}"),
        };
        // off wins over everything, approved or not
        assert_eq!(refused(decide(false, &approved, "notepad a.txt", false)), (403, "off"));
        assert_eq!(refused(decide(false, &approved, "notepad a.txt", true)), (403, "off"));
        // only the exact text is approved
        assert_eq!(refused(decide(true, &approved, "notepad", false)), (403, "unapproved"));
        assert_eq!(refused(decide(true, &approved, "notepad a.txt ", false)), (403, "unapproved"));
        assert_eq!(refused(decide(true, &approved, "NOTEPAD a.txt", false)), (403, "unapproved"));
        assert_eq!(refused(decide(true, &approved, r#"app "x"#, false)), (400, "command"));
        assert_eq!(decide(true, &approved, "notepad a.txt", true), Decision::Dry { program: "notepad".into(), args: vec!["a.txt".into()] });
        assert_eq!(
            decide(true, &approved, "notepad a.txt", false),
            Decision::Run { program: "notepad".into(), args: vec!["a.txt".into()] }
        );
        // test mode makes every run a dry one
        let testing = Stored { test_mode: true, ..approved };
        assert_eq!(decide(true, &testing, "notepad a.txt", false), Decision::Dry { program: "notepad".into(), args: vec!["a.txt".into()] });
    }

    #[test]
    fn keeps_approvals_and_test_mode_and_drops_what_could_not_be_one() {
        let dir = tempfile::tempdir().unwrap();
        let a = Actions::new(dir.path().to_path_buf());
        assert_eq!(a.stored(), Stored::default());
        let s = a.change(&["one".into(), "two".into(), "one".into()], &[], Some(true)).unwrap();
        assert_eq!(s, Stored { approved: vec!["one".into(), "two".into()], test_mode: true });
        let s = a.change(&[], &["one".into()], None).unwrap();
        assert_eq!(s, Stored { approved: vec!["two".into()], test_mode: true });
        assert_eq!(a.stored(), s);
        // a hand-edited file: what isn't a command is dropped, a bad switch is off
        std::fs::write(dir.path().join(STORE), r#"{"approved":["ok","",5,"   "],"testMode":"yes"}"#).unwrap();
        assert_eq!(a.stored(), Stored { approved: vec!["ok".into()], test_mode: false });
        std::fs::write(dir.path().join(STORE), "not json").unwrap();
        assert_eq!(a.stored(), Stored::default());
    }

    #[test]
    fn logs_every_line_and_cuts_the_log_back() {
        let dir = tempfile::tempdir().unwrap();
        let a = Actions::new(dir.path().to_path_buf());
        a.log(
            1,
            &Entry {
                from: "127.0.0.1".into(),
                command: Some("app x".into()),
                outcome: "dry",
                reason: None,
                program: Some(("app".into(), vec!["x".into()])),
            },
        );
        a.log(2, &Entry { from: "192.168.1.9".into(), command: None, outcome: "refused", reason: Some("remote".into()), program: None });
        assert_eq!(
            a.entries(),
            vec![
                json!({ "at": 1, "from": "127.0.0.1", "outcome": "dry", "command": "app x", "program": "app", "args": ["x"] }),
                json!({ "at": 2, "from": "192.168.1.9", "outcome": "refused", "reason": "remote" }),
            ]
        );
        let long = "x".repeat(1000);
        for i in 0..400 {
            a.log(
                i,
                &Entry {
                    from: "127.0.0.1".into(),
                    command: Some(long.clone()),
                    outcome: "refused",
                    reason: Some("off".into()),
                    program: None,
                },
            );
        }
        let size = std::fs::metadata(dir.path().join(LOG)).unwrap().len();
        assert!(size <= LOG_MAX_BYTES, "{size}");
        let entries = a.entries();
        assert!(entries.len() <= LOG_READ && entries.len() > 100, "{}", entries.len());
        // the newest stay, in order
        assert_eq!(entries.last().unwrap()["at"], 399);
        assert_eq!(entries[entries.len() - 2]["at"], 398);
    }

    #[test]
    fn approves_on_this_pc_only_and_runs_from_elsewhere_only_with_remote_editing() {
        for here in ["127.0.0.1", "127.0.0.2", "::1", "::ffff:127.0.0.1"] {
            assert!(may_approve(here), "{here}");
            assert_eq!(remote_edit_refusal(Some(here), false), None, "{here}");
        }
        for there in ["192.168.1.9", "10.0.0.2", "::ffff:192.168.1.9", "fe80::1", ""] {
            assert!(!may_approve(there), "{there}");
            assert_eq!(remote_edit_refusal(Some(there), false).map(|r| r.status), Some(403), "{there}");
            // remote editing lets a run through to the next checks, never an approval
            assert_eq!(remote_edit_refusal(Some(there), true), None, "{there}");
        }
    }

    #[test]
    fn reads_a_run_body() {
        assert_eq!(parse_run(r#"{"command":"notepad"}"#), Ok(("notepad".into(), false)));
        assert_eq!(parse_run(r#"{"command":"notepad","dry":true}"#), Ok(("notepad".into(), true)));
        for bad in ["", "[]", "{}", r#"{"command":""}"#, r#"{"command":"  "}"#, r#"{"command":5}"#, r#"{"command":"a","dry":"yes"}"#] {
            assert!(parse_run(bad).is_err(), "{bad}");
        }
        assert!(parse_run(&format!(r#"{{"command":"{}"}}"#, "x".repeat(MAX_COMMAND_BYTES + 1))).is_err());
    }
}
