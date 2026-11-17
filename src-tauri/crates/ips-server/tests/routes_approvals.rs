// Agent approvals over a real socket (pinned layer P8: /api/agents/permission, /requests, /answer, /requests/log): a server on
// a free port with a temp data folder, with Claude Code's approvals on and Codex's off. The hook's post is held while the
// panel answers; the server's 25 s wait itself is covered by approvals.rs's unit tests with a short wait. Requests from
// another machine can't be made over loopback; `request-guard.spec.ts` sends them (VERIFY_LAN=1), and request_guard.rs's
// unit tests cover the rule.

use std::path::Path;
use std::time::Duration;

use ips_server::{bind_with_home, ServerConfig};
use serde_json::{json, Value};
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::TcpStream;
use tokio::sync::oneshot;

struct Server {
    port: u16,
    _dir: tempfile::TempDir,
    stop: Option<oneshot::Sender<()>>,
    done: tokio::task::JoinHandle<()>,
}

impl Server {
    async fn stop(mut self) {
        let _ = self.stop.take().unwrap().send(());
        tokio::time::timeout(Duration::from_secs(5), &mut self.done).await.expect("graceful stop").unwrap();
    }
}

fn config(dir: &Path) -> ServerConfig {
    ServerConfig {
        host: "127.0.0.1".into(),
        port: 0,
        allowed_hosts: vec![],
        allow_remote_edit: false,
        allow_remote_upload: false,
        action_runner: false,
        obs_stream: false,
        agent_approvals: vec!["claude".into()],
        dist: dir.join("dist"),
        data_dir: dir.join("data"),
        infopanel_dir: dir.join("infopanel"),
        debug: false,
        version: "9.9.9".into(),
    }
}

async fn start() -> Server {
    let dir = tempfile::tempdir().unwrap();
    let cfg = config(dir.path());
    let home = cfg.data_dir.with_file_name("home");
    let bound = bind_with_home(cfg, home).await.unwrap();
    let port = bound.port();
    let (stop, stopped) = oneshot::channel::<()>();
    let done = tokio::spawn(bound.serve(async {
        let _ = stopped.await;
    }));
    Server { port, _dir: dir, stop: Some(stop), done }
}

struct Reply {
    status: u16,
    body: Vec<u8>,
}

fn dechunk(mut raw: &[u8]) -> Vec<u8> {
    let mut out = Vec::new();
    while let Some(end) = raw.windows(2).position(|w| w == b"\r\n") {
        let size = usize::from_str_radix(std::str::from_utf8(&raw[..end]).unwrap().trim(), 16).unwrap();
        if size == 0 {
            break;
        }
        out.extend_from_slice(&raw[end + 2..end + 2 + size]);
        raw = &raw[end + 4 + size..];
    }
    out
}

/// Sends `method path` with `headers` and reads the whole answer (within 10 s).
async fn send(port: u16, method: &str, path: &str, headers: &[(&str, &str)], body: &str) -> Reply {
    let mut stream = TcpStream::connect(("127.0.0.1", port)).await.unwrap();
    let mut request = format!("{method} {path} HTTP/1.1\r\nConnection: close\r\nHost: 127.0.0.1:{port}\r\n");
    for (k, v) in headers {
        request.push_str(&format!("{k}: {v}\r\n"));
    }
    request.push_str(&format!("Content-Length: {}\r\n\r\n{body}", body.len()));
    stream.write_all(request.as_bytes()).await.unwrap();
    let mut raw = Vec::new();
    tokio::time::timeout(Duration::from_secs(10), stream.read_to_end(&mut raw)).await.unwrap().unwrap();
    let split = raw.windows(4).position(|w| w == b"\r\n\r\n").unwrap();
    let head = String::from_utf8_lossy(&raw[..split]).into_owned();
    let status = head.split(' ').nth(1).unwrap().parse().unwrap();
    let chunked = head.to_ascii_lowercase().contains("transfer-encoding: chunked");
    let rest = &raw[split + 4..];
    Reply { status, body: if chunked { dechunk(rest) } else { rest.to_vec() } }
}

fn json_of(r: &Reply) -> Value {
    serde_json::from_slice(&r.body).unwrap_or(Value::Null)
}

const HOOK: [(&str, &str); 2] = [("Content-Type", "application/json"), ("X-Agent-Event", "1")];
const ANSWER: [(&str, &str); 2] = [("Content-Type", "application/json"), ("X-Agent-Answer", "1")];
const READ: [(&str, &str); 1] = [("X-Agent-Answer", "1")];
const COMMAND: &str = "npm run build && npm run verify -- --feature dev-fixtures";

fn permission() -> String {
    json!({ "hook_event_name": "PermissionRequest", "session_id": "s1", "cwd": "E:\\work\\InfoPanel.Studio", "tool_name": "Bash", "tool_input": { "command": COMMAND } }).to_string()
}

/// The hook's post, held in the background until the panel answers.
fn hook(port: u16, agent: &'static str) -> tokio::task::JoinHandle<Reply> {
    let body = permission();
    tokio::spawn(async move { send(port, "POST", &format!("/api/agents/permission?agent={agent}"), &HOOK, &body).await })
}

/// The request the panel sees, once the hook's post has arrived.
async fn waiting(port: u16) -> Value {
    for _ in 0..200 {
        let r = send(port, "GET", "/api/agents/requests", &READ, "").await;
        assert_eq!(r.status, 200);
        if let Some(first) = json_of(&r)["requests"].as_array().and_then(|l| l.first().cloned()) {
            return first;
        }
        tokio::time::sleep(Duration::from_millis(20)).await;
    }
    panic!("no request arrived");
}

async fn answer(port: u16, id: &str, behavior: &str) -> Reply {
    send(port, "POST", "/api/agents/answer", &ANSWER, &json!({ "id": id, "behavior": behavior }).to_string()).await
}

async fn log(port: u16) -> Vec<Value> {
    let r = send(port, "GET", "/api/agents/requests/log", &READ, "").await;
    assert_eq!(r.status, 200);
    json_of(&r)["entries"].as_array().unwrap().clone()
}

#[tokio::test]
async fn the_panel_allows_and_denies_and_every_answer_is_logged() {
    let server = start().await;
    let port = server.port;
    for behavior in ["allow", "deny"] {
        let held = hook(port, "claude");
        let request = waiting(port).await;
        // the whole command, the project's name (never its path) and the time left of the wait
        assert_eq!(request["text"], COMMAND);
        assert_eq!(request["project"], "InfoPanel.Studio");
        assert_eq!(request["tool"], "Bash");
        assert!(request["left"].as_i64().unwrap() > 20_000);
        // the session shows as waiting in the extras, under the same key, without the command
        let extras = send(port, "GET", "/api/extras", &[], "").await;
        let text = String::from_utf8_lossy(&extras.body).into_owned();
        assert!(!text.contains("npm run build"), "the command stays out of the extras");
        let session = &json_of(&extras)["agents"]["sessions"][0];
        assert_eq!((session["state"].as_str(), session["key"].as_str()), (Some("waiting"), request["session"].as_str()));

        let id = request["id"].as_str().unwrap();
        let r = answer(port, id, behavior).await;
        assert_eq!(r.status, 200);
        let hooked = held.await.unwrap();
        assert_eq!((hooked.status, json_of(&hooked)), (200, json!({ "behavior": behavior })));
        // answered: it is gone, and a second answer says so
        assert_eq!(answer(port, id, "allow").await.status, 404);
        assert_eq!(json_of(&send(port, "GET", "/api/agents/requests", &READ, "").await)["requests"], json!([]));
    }
    let entries = log(port).await;
    let answers: Vec<&str> = entries.iter().map(|e| e["answer"].as_str().unwrap()).collect();
    assert_eq!(answers, ["allow", "deny"]);
    assert_eq!(entries[0]["text"], COMMAND);
    assert_eq!(entries[0]["from"], "127.0.0.1");
    server.stop().await;
}

#[tokio::test]
async fn an_agent_that_is_off_goes_straight_to_the_terminal() {
    let server = start().await;
    let r = send(server.port, "POST", "/api/agents/permission?agent=codex", &HOOK, &permission()).await;
    assert_eq!((r.status, json_of(&r)), (200, json!({})));
    let listed = send(server.port, "GET", "/api/agents/requests", &READ, "").await;
    assert_eq!(json_of(&listed)["agents"], json!(["claude"]));
    assert_eq!(json_of(&listed)["requests"], json!([]));
    assert!(log(server.port).await.is_empty());
    server.stop().await;
}

#[tokio::test]
async fn a_stopping_server_lets_the_hook_go_without_an_answer() {
    let server = start().await;
    let port = server.port;
    let held = hook(port, "claude");
    waiting(port).await;
    server.stop().await;
    let hooked = held.await.unwrap();
    assert_eq!((hooked.status, json_of(&hooked)), (200, json!({})));
}

#[tokio::test]
async fn the_routes_take_their_headers_and_bodies() {
    let server = start().await;
    let port = server.port;
    // the hook's post: the agent header, then JSON
    assert_eq!(send(port, "POST", "/api/agents/permission?agent=claude", &[("Content-Type", "application/json")], "{}").await.status, 403);
    assert_eq!(send(port, "POST", "/api/agents/permission?agent=claude", &[("Content-Type", "text/plain"), ("X-Agent-Event", "1")], "{}").await.status, 415);
    assert_eq!(send(port, "POST", "/api/agents/permission?agent=claude", &HOOK, "nope").await.status, 400);
    assert_eq!(send(port, "GET", "/api/agents/permission", &HOOK, "").await.status, 405);
    // reading the requests or the log needs the answer header
    assert_eq!(send(port, "GET", "/api/agents/requests", &[], "").await.status, 403);
    assert_eq!(send(port, "GET", "/api/agents/requests/log", &[], "").await.status, 403);
    // an answer: the header, then JSON, then a body naming a request and a behaviour
    assert_eq!(send(port, "POST", "/api/agents/answer", &[("Content-Type", "application/json")], r#"{"id":"x","behavior":"allow"}"#).await.status, 403);
    assert_eq!(send(port, "POST", "/api/agents/answer", &[("Content-Type", "text/plain"), ("X-Agent-Answer", "1")], r#"{"id":"x","behavior":"allow"}"#).await.status, 415);
    assert_eq!(send(port, "POST", "/api/agents/answer", &ANSWER, r#"{"id":"x","behavior":"ask"}"#).await.status, 400);
    assert_eq!(send(port, "POST", "/api/agents/answer", &ANSWER, r#"{"behavior":"allow"}"#).await.status, 400);
    assert_eq!(answer(port, "no-such-request", "allow").await.status, 404);
    assert_eq!(send(port, "GET", "/api/agents/answer", &READ, "").await.status, 405);
    server.stop().await;
}
