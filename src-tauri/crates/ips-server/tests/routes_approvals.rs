// Agent approvals over a real socket (pinned layer P8: /api/agents/permission): a server on a free port with a temp data
// folder, with Claude Code's approvals on and Codex's off. The hook's post is held while the prompt answers in-process
// (`Bound::approvals`, as the desktop app's prompt window does); the old HTTP paths that read and answered requests refuse
// everything, so no local process or page can answer. The server's 25 s wait itself is covered by approvals.rs's unit tests
// with a short wait.

use std::path::{Path, PathBuf};
use std::time::Duration;

use ips_server::approvals::{Approvals, Behavior, Request};
use ips_server::{bind_with_home, hook_auth, ServerConfig};
use serde_json::{json, Value};
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::TcpStream;
use tokio::sync::oneshot;

struct Server {
    port: u16,
    approvals: Approvals,
    data: PathBuf,
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
    let data = cfg.data_dir.clone();
    let home = cfg.data_dir.with_file_name("home");
    let bound = bind_with_home(cfg, home).await.unwrap();
    let port = bound.port();
    let approvals = bound.approvals();
    let (stop, stopped) = oneshot::channel::<()>();
    let done = tokio::spawn(bound.serve(async {
        let _ = stopped.await;
    }));
    Server { port, approvals, data, _dir: dir, stop: Some(stop), done }
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

const NONCE: &str = "0123456789abcdef0123456789abcdef";
const HOOK: [(&str, &str); 3] = [("Content-Type", "application/json"), ("X-Agent-Event", "1"), ("X-Agent-Nonce", NONCE)];
/// What the kiosk page sent before the security review: the answer header, from loopback, and no credential.
const OLD_ANSWER: [(&str, &str); 2] = [("Content-Type", "application/json"), ("X-Agent-Answer", "1")];
const COMMAND: &str = "npm run build && npm run verify -- --feature dev-fixtures";

fn permission() -> String {
    json!({ "hook_event_name": "PermissionRequest", "session_id": "s1", "cwd": "E:\\work\\InfoPanel.Studio", "tool_name": "Bash", "tool_input": { "command": COMMAND, "description": "Build and verify" } }).to_string()
}

/// The hook's post, held in the background until the prompt answers.
fn hook(port: u16, agent: &'static str) -> tokio::task::JoinHandle<Reply> {
    let body = permission();
    tokio::spawn(async move { send(port, "POST", &format!("/api/agents/permission?agent={agent}"), &HOOK, &body).await })
}

/// The request the prompt sees, once the hook's post has arrived.
async fn waiting(approvals: &Approvals) -> Request {
    for _ in 0..500 {
        if let Some(first) = approvals.requests().first() {
            return first.clone();
        }
        tokio::time::sleep(Duration::from_millis(10)).await;
    }
    panic!("no request arrived");
}

fn key(data: &Path) -> hook_auth::Key {
    std::fs::read(data.join(hook_auth::KEY_FILE)).unwrap().try_into().unwrap()
}

#[tokio::test]
async fn the_prompt_allows_and_denies_signed_for_the_hook_and_logged() {
    let server = start().await;
    let port = server.port;
    for (behavior, word) in [(Behavior::Allow, "allow"), (Behavior::Deny, "deny")] {
        let held = hook(port, "claude");
        let request = waiting(&server.approvals).await;
        // every field of the input, the summary first; the project's name, never its path
        assert_eq!(request.text, format!("{COMMAND}\n\ndescription: Build and verify"));
        assert_eq!((request.project.as_str(), request.tool.as_str()), ("InfoPanel.Studio", "Bash"));
        // the session shows as waiting in the extras, under the same key, without the command
        let extras = send(port, "GET", "/api/extras", &[], "").await;
        let text = String::from_utf8_lossy(&extras.body).into_owned();
        assert!(!text.contains("npm run build"), "the command stays out of the extras");
        let session = &json_of(&extras)["agents"]["sessions"][0];
        assert_eq!((session["state"].as_str(), session["key"].as_str()), (Some("waiting"), Some(request.session.as_str())));

        assert!(server.approvals.answer(&request.id, behavior, "prompt", 1));
        let hooked = held.await.unwrap();
        // signed with the key in the data folder, over the hook's nonce, this request and this decision
        let mac = hook_auth::sign(&key(&server.data), NONCE, &request.id, word);
        assert_eq!((hooked.status, json_of(&hooked)), (200, json!({ "behavior": word, "id": request.id, "mac": mac })));
        assert!(!server.approvals.answer(&request.id, Behavior::Allow, "prompt", 2));
    }
    let answers: Vec<String> = server.approvals.entries().iter().map(|e| e["answer"].as_str().unwrap().to_string()).collect();
    assert_eq!(answers, ["allow", "deny"]);
    server.stop().await;
}

#[tokio::test]
async fn no_local_process_or_page_answers_over_http() {
    let server = start().await;
    let port = server.port;
    let held = hook(port, "claude");
    let request = waiting(&server.approvals).await;
    let body = json!({ "id": request.id, "behavior": "allow" }).to_string();
    // the agent itself, or a page on this server, with the old header from loopback: refused, and the request still waits
    let r = send(port, "POST", "/api/agents/answer", &OLD_ANSWER, &body).await;
    assert_eq!(r.status, 403);
    assert!(String::from_utf8_lossy(&r.body).contains("prompt window"));
    for path in ["/api/agents/requests", "/api/agents/requests/log"] {
        let read = send(port, "GET", path, &OLD_ANSWER, "").await;
        assert_eq!(read.status, 403, "{path}");
        assert!(!String::from_utf8_lossy(&read.body).contains("npm run build"), "{path}");
    }
    assert_eq!(server.approvals.requests(), vec![request.clone()]);
    assert!(server.approvals.answer(&request.id, Behavior::Deny, "prompt", 1));
    assert_eq!(json_of(&held.await.unwrap())["behavior"], "deny");
    server.stop().await;
}

#[tokio::test]
async fn an_agent_that_is_off_or_a_hook_without_a_nonce_goes_straight_to_the_terminal() {
    let server = start().await;
    let r = send(server.port, "POST", "/api/agents/permission?agent=codex", &HOOK, &permission()).await;
    assert_eq!((r.status, json_of(&r)), (200, json!({})));
    let r = send(server.port, "POST", "/api/agents/permission?agent=claude", &HOOK[..2], &permission()).await;
    assert_eq!((r.status, json_of(&r)), (200, json!({})));
    assert!(server.approvals.requests().is_empty());
    assert!(server.approvals.entries().is_empty());
    server.stop().await;
}

#[tokio::test]
async fn a_stopping_server_lets_the_hook_go_without_an_answer() {
    let server = start().await;
    let port = server.port;
    let held = hook(port, "claude");
    waiting(&server.approvals).await;
    let approvals = server.approvals.clone();
    server.stop().await;
    let hooked = held.await.unwrap();
    assert_eq!((hooked.status, json_of(&hooked)), (200, json!({})));
    assert!(approvals.requests().is_empty());
}

#[tokio::test]
async fn the_hook_route_takes_its_headers_and_body() {
    let server = start().await;
    let port = server.port;
    assert_eq!(send(port, "POST", "/api/agents/permission?agent=claude", &[("Content-Type", "application/json")], "{}").await.status, 403);
    assert_eq!(send(port, "POST", "/api/agents/permission?agent=claude", &[("Content-Type", "text/plain"), ("X-Agent-Event", "1")], "{}").await.status, 415);
    assert_eq!(send(port, "POST", "/api/agents/permission?agent=claude", &HOOK, "nope").await.status, 400);
    assert_eq!(send(port, "GET", "/api/agents/permission", &HOOK, "").await.status, 405);
    server.stop().await;
}
