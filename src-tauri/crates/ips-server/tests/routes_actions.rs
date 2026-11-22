// The action runner over a real socket (pinned layer P7: /api/actions, /api/actions/run, /api/actions/log) and OBS's go
// live switch (/api/obs/act `stream`): a server on a free port with a temp data folder, once with the switches off (the
// default) and once on. Nothing real is started: the runs here are refused, dry, in test mode, or name a program that does
// not exist. Requests from another machine can't be made over loopback; `request-guard.spec.ts` sends them (VERIFY_LAN=1),
// and actions.rs's unit tests cover the rule.

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

fn config(dir: &Path, on: bool) -> ServerConfig {
    ServerConfig {
        host: "127.0.0.1".into(),
        port: 0,
        allowed_hosts: vec![],
        allow_remote_edit: false,
        allow_remote_upload: false,
        action_runner: on,
        obs_stream: on,
        agent_approvals: vec![],
        agent_key_file: None,
        dist: dir.join("dist"),
        data_dir: dir.join("data"),
        infopanel_dir: dir.join("infopanel"),
        debug: false,
        version: "9.9.9".into(),
    }
}

async fn start(on: bool) -> Server {
    let dir = tempfile::tempdir().unwrap();
    let cfg = config(dir.path(), on);
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

/// Sends `method path` with `headers` and reads the whole answer.
async fn send(port: u16, method: &str, path: &str, headers: &[(&str, &str)], body: &str) -> Reply {
    let mut stream = TcpStream::connect(("127.0.0.1", port)).await.unwrap();
    let mut request = format!("{method} {path} HTTP/1.1\r\nConnection: close\r\nHost: 127.0.0.1:{port}\r\n");
    for (k, v) in headers {
        request.push_str(&format!("{k}: {v}\r\n"));
    }
    request.push_str(&format!("Content-Length: {}\r\n\r\n{body}", body.len()));
    stream.write_all(request.as_bytes()).await.unwrap();
    let mut raw = Vec::new();
    tokio::time::timeout(Duration::from_secs(5), stream.read_to_end(&mut raw)).await.unwrap().unwrap();
    let split = raw.windows(4).position(|w| w == b"\r\n\r\n").unwrap();
    let head = String::from_utf8_lossy(&raw[..split]).into_owned();
    let status = head.split(' ').nth(1).unwrap().parse().unwrap();
    let chunked = head.to_ascii_lowercase().contains("transfer-encoding: chunked");
    let rest = &raw[split + 4..];
    Reply { status, body: if chunked { dechunk(rest) } else { rest.to_vec() } }
}

const WRITE: [(&str, &str); 2] = [("Content-Type", "application/json"), ("X-Dashboard-Control", "1")];

fn json_of(r: &Reply) -> Value {
    serde_json::from_slice(&r.body).unwrap_or(Value::Null)
}

async fn run(port: u16, body: Value) -> Reply {
    send(port, "POST", "/api/actions/run", &WRITE, &body.to_string()).await
}

async fn put(port: u16, body: Value) -> Reply {
    send(port, "PUT", "/api/actions", &WRITE, &body.to_string()).await
}

async fn log(port: u16) -> Vec<Value> {
    let r = send(port, "GET", "/api/actions/log", &[], "").await;
    assert_eq!(r.status, 200);
    json_of(&r)["entries"].as_array().unwrap().clone()
}

/// A program no machine has, so an approved run reaches the spawn and fails without starting anything.
const MISSING: &str = "ips-test-no-such-program-7f3a";

#[tokio::test]
async fn the_runner_is_off_by_default_and_refuses_even_an_approved_command() {
    let s = start(false).await;
    let state = send(s.port, "GET", "/api/actions", &[], "").await;
    assert_eq!(state.status, 200);
    assert_eq!(json_of(&state), json!({ "runner": false, "obsStream": false, "testMode": false, "approved": [] }));
    assert_eq!(put(s.port, json!({ "approve": [MISSING] })).await.status, 200);
    for dry in [false, true] {
        let r = run(s.port, json!({ "command": MISSING, "dry": dry })).await;
        assert_eq!((r.status, json_of(&r)["reason"].clone()), (403, json!("off")), "dry {dry}");
    }
    let lines: Vec<(Value, Value, Value)> =
        log(s.port).await.iter().map(|e| (e["outcome"].clone(), e["reason"].clone(), e["command"].clone())).collect();
    assert_eq!(lines, vec![(json!("refused"), json!("off"), json!(MISSING)); 2]);
    // OBS's go live is refused while its switch is off; the other OBS actions are not (OBS isn't connected here)
    let off = send(s.port, "POST", "/api/obs/act", &WRITE, r#"{"op":"stream","state":"toggle"}"#).await;
    assert_eq!(
        (off.status, String::from_utf8_lossy(&off.body).into_owned()),
        (403, ips_server::obs_control::STREAM_OFF_MESSAGE.to_string())
    );
    assert_eq!(send(s.port, "POST", "/api/obs/act", &WRITE, r#"{"op":"replay"}"#).await.status, 503);
    s.stop().await;
}

#[tokio::test]
async fn runs_only_an_approved_command_word_for_word_and_logs_each_one() {
    let s = start(true).await;
    let cmd = format!("{MISSING} \"a b\" c");
    // not approved: refused, whatever the dry flag
    let r = run(s.port, json!({ "command": cmd })).await;
    assert_eq!((r.status, json_of(&r)["reason"].clone()), (403, json!("unapproved")));
    assert_eq!(run(s.port, json!({ "command": cmd, "dry": true })).await.status, 403);
    // approve it (and one that can't be cut into a program)
    let approved = put(s.port, json!({ "approve": [cmd, "app \"open"] })).await;
    assert_eq!(approved.status, 200);
    assert_eq!(json_of(&approved)["approved"], json!([cmd, "app \"open"]));
    // only the exact text is approved
    assert_eq!(run(s.port, json!({ "command": format!("{MISSING}  \"a b\" c") })).await.status, 403);
    // a dry run says what would run, as separate arguments
    let dry = run(s.port, json!({ "command": cmd, "dry": true })).await;
    assert_eq!((dry.status, json_of(&dry)), (200, json!({ "ran": false, "dry": true, "program": MISSING, "args": ["a b", "c"] })));
    // an unbalanced quote is no command
    let bad = run(s.port, json!({ "command": "app \"open" })).await;
    assert_eq!((bad.status, json_of(&bad)["reason"].clone()), (400, json!("command")));
    // a real run reaches the spawn: this program doesn't exist, so it fails and nothing starts
    let failed = run(s.port, json!({ "command": cmd })).await;
    assert_eq!((failed.status, json_of(&failed)["reason"].clone()), (500, json!("failed")));
    // test mode makes every run dry
    assert_eq!(json_of(&put(s.port, json!({ "testMode": true })).await)["testMode"], json!(true));
    let testing = run(s.port, json!({ "command": cmd })).await;
    assert_eq!((testing.status, json_of(&testing)["dry"].clone()), (200, json!(true)));
    // revoked: refused again
    assert_eq!(put(s.port, json!({ "revoke": [cmd], "testMode": false })).await.status, 200);
    assert_eq!(json_of(&run(s.port, json!({ "command": cmd })).await)["reason"], json!("unapproved"));
    let entries = log(s.port).await;
    let outcomes: Vec<&str> = entries.iter().map(|e| e["outcome"].as_str().unwrap()).collect();
    assert_eq!(outcomes, ["refused", "refused", "refused", "dry", "refused", "failed", "dry", "refused"]);
    let reasons: Vec<&str> = entries.iter().filter(|e| e["outcome"] == "refused").map(|e| e["reason"].as_str().unwrap()).collect();
    assert_eq!(reasons, ["unapproved", "unapproved", "unapproved", "command", "unapproved"]);
    // a dry or failed line says what it would have started; each says where it came from and when
    assert_eq!((entries[3]["program"].clone(), entries[3]["args"].clone()), (json!(MISSING), json!(["a b", "c"])));
    assert!(entries[5]["reason"].as_str().is_some_and(|r| !r.is_empty()));
    assert!(entries.iter().all(|e| e["from"].as_str().is_some_and(|f| f.contains("127.0.0.1")) && e["at"].is_i64()));
    // OBS's go live passes the switch and then finds no OBS
    assert_eq!(send(s.port, "POST", "/api/obs/act", &WRITE, r#"{"op":"stream","state":"start"}"#).await.status, 503);
    s.stop().await;
}

#[tokio::test]
async fn guards_the_routes_and_their_bodies() {
    let s = start(true).await;
    let good = json!({ "command": "x" }).to_string();
    // methods
    assert_eq!(send(s.port, "GET", "/api/actions/run", &[], "").await.status, 405);
    assert_eq!(send(s.port, "POST", "/api/actions", &WRITE, "{}").await.status, 405);
    assert_eq!(send(s.port, "POST", "/api/actions/log", &WRITE, "{}").await.status, 405);
    assert_eq!(send(s.port, "GET", "/api/actions/other", &[], "").await.status, 404);
    // the JSON type and the marker header, on both writes
    for (method, path) in [("POST", "/api/actions/run"), ("PUT", "/api/actions")] {
        assert_eq!(send(s.port, method, path, &[("X-Dashboard-Control", "1")], &good).await.status, 415, "{path}");
        assert_eq!(send(s.port, method, path, &[("Content-Type", "application/json")], &good).await.status, 403, "{path}");
        assert_eq!(
            send(s.port, method, path, &[("Content-Type", "application/json"), ("X-Dashboard-Control", "0")], &good).await.status,
            403,
            "{path}"
        );
    }
    // a cross-site write is refused before any route
    let cross = [("Content-Type", "application/json"), ("X-Dashboard-Control", "1"), ("Origin", "https://evil.example")];
    assert_eq!(send(s.port, "POST", "/api/actions/run", &cross, &good).await.status, 403);
    assert_eq!(send(s.port, "PUT", "/api/actions", &cross, r#"{"approve":["x"]}"#).await.status, 403);
    assert_eq!(json_of(&send(s.port, "GET", "/api/actions", &[], "").await)["approved"], json!([]));
    // bodies
    for bad in ["", "[]", "{}", r#"{"command":""}"#, r#"{"command":5}"#, r#"{"command":"x","dry":1}"#] {
        assert_eq!(send(s.port, "POST", "/api/actions/run", &WRITE, bad).await.status, 400, "{bad}");
    }
    for bad in ["", "[]", r#"{"approve":"x"}"#, r#"{"approve":[""]}"#, r#"{"revoke":[1]}"#, r#"{"testMode":"on"}"#] {
        assert_eq!(send(s.port, "PUT", "/api/actions", &WRITE, bad).await.status, 400, "{bad}");
    }
    let long = json!({ "approve": ["x".repeat(ips_server::actions::MAX_COMMAND_BYTES + 1)] }).to_string();
    assert_eq!(send(s.port, "PUT", "/api/actions", &WRITE, &long).await.status, 400);
    // a refused body is never logged as a run
    assert_eq!(log(s.port).await, Vec::<Value>::new());
    s.stop().await;
}
