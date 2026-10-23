// The alert routes over a real socket (/api/alerts/history, /api/control/alert) with the engine reading a fake Data API
// (a local SSE server): a server on a free port with a temp data folder, and raw HTTP/1.1 requests.

use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use ips_server::{bind_with_home, ServerConfig};
use serde_json::{json, Value};
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::{TcpListener, TcpStream};
use tokio::sync::{broadcast, oneshot};

/* ---------------- the fake Data API ---------------- */

struct FakeApi {
    url: String,
    /// The request line and Accept header of every connection, in order.
    seen: Arc<Mutex<Vec<String>>>,
    open: Arc<AtomicUsize>,
    events: broadcast::Sender<String>,
}

impl FakeApi {
    /// Answers the first `fail` connections 500, then streams every message sent through `send`.
    async fn start(fail: usize) -> Self {
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let url = format!("http://127.0.0.1:{}", listener.local_addr().unwrap().port());
        let (events, _) = broadcast::channel(64);
        let api = Self { url, seen: Arc::default(), open: Arc::default(), events };
        let (seen, open, tx, failing) = (Arc::clone(&api.seen), Arc::clone(&api.open), api.events.clone(), Arc::new(AtomicUsize::new(fail)));
        tokio::spawn(async move {
            loop {
                let Ok((stream, _)) = listener.accept().await else { return };
                let fail_this = failing.fetch_update(Ordering::SeqCst, Ordering::SeqCst, |n| n.checked_sub(1)).is_ok();
                tokio::spawn(serve_stream(stream, fail_this, Arc::clone(&seen), Arc::clone(&open), tx.subscribe()));
            }
        });
        api
    }

    fn send(&self, message: &Value) {
        let _ = self.events.send(message.to_string());
    }

    fn requests(&self) -> Vec<String> {
        self.seen.lock().unwrap().clone()
    }
}

async fn serve_stream(
    mut stream: TcpStream,
    fail: bool,
    seen: Arc<Mutex<Vec<String>>>,
    open: Arc<AtomicUsize>,
    mut events: broadcast::Receiver<String>,
) {
    let mut head = Vec::new();
    let mut byte = [0u8; 1];
    while !head.ends_with(b"\r\n\r\n") {
        if stream.read(&mut byte).await.unwrap_or(0) == 0 {
            return;
        }
        head.push(byte[0]);
    }
    let head = String::from_utf8_lossy(&head).into_owned();
    let accept = head.lines().find(|l| l.to_lowercase().starts_with("accept:")).unwrap_or_default().to_lowercase();
    seen.lock().unwrap().push(format!("{} | {}", head.lines().next().unwrap_or_default(), accept));
    if fail {
        let _ = stream.write_all(b"HTTP/1.1 500 Internal Server Error\r\nContent-Length: 0\r\nConnection: close\r\n\r\n").await;
        return;
    }
    if stream.write_all(b"HTTP/1.1 200 OK\r\nContent-Type: text/event-stream\r\nConnection: close\r\n\r\n").await.is_err() {
        return;
    }
    open.fetch_add(1, Ordering::SeqCst);
    let (mut reader, mut writer) = stream.into_split();
    let mut buf = [0u8; 64];
    loop {
        tokio::select! {
            message = events.recv() => match message {
                Ok(message) => {
                    if writer.write_all(format!("data: {message}\n\n").as_bytes()).await.is_err() {
                        break;
                    }
                }
                Err(_) => break,
            },
            read = reader.read(&mut buf) => if read.unwrap_or(0) == 0 { break },
        }
    }
    open.fetch_sub(1, Ordering::SeqCst);
}

/* ---------------- the server under test ---------------- */

struct Server {
    port: u16,
    dir: tempfile::TempDir,
    stop: Option<oneshot::Sender<()>>,
    done: tokio::task::JoinHandle<()>,
}

impl Server {
    fn data(&self) -> PathBuf {
        self.dir.path().join("data")
    }

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
        dist: dir.join("dist"),
        data_dir: dir.join("data"),
        infopanel_dir: dir.join("infopanel"),
        debug: false,
        version: "9.9.9".into(),
    }
}

/// A server whose saved config is `saved` (when given) before it starts.
async fn start(saved: Option<&Value>) -> Server {
    let dir = tempfile::tempdir().unwrap();
    std::fs::create_dir_all(dir.path().join("data")).unwrap();
    if let Some(saved) = saved {
        std::fs::write(dir.path().join("data/config.json"), saved.to_string()).unwrap();
    }
    let bound = bind_with_home(config(dir.path()), dir.path().join("home")).await.unwrap();
    let port = bound.port();
    let (stop, stopped) = oneshot::channel::<()>();
    let done = tokio::spawn(bound.serve(async {
        let _ = stopped.await;
    }));
    Server { port, dir, stop: Some(stop), done }
}

struct Reply {
    status: u16,
    body: Vec<u8>,
}

impl Reply {
    fn text(&self) -> String {
        String::from_utf8_lossy(&self.body).into_owned()
    }

    fn json(&self) -> Value {
        serde_json::from_slice(&self.body).unwrap()
    }
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
    let chunked = head.to_lowercase().contains("transfer-encoding: chunked");
    let rest = &raw[split + 4..];
    Reply { status, body: if chunked { dechunk(rest) } else { rest.to_vec() } }
}

const CONTROL: [(&str, &str); 2] = [("Content-Type", "application/json"), ("X-Dashboard-Control", "1")];
const CONFIG: [(&str, &str); 2] = [("Content-Type", "application/json"), ("X-Dashboard-Config", "1")];

async fn post_alert(port: u16, body: &str) -> Reply {
    send(port, "POST", "/api/control/alert", &CONTROL, body).await
}

/// Polls `check` (every 25 ms, for five seconds) until it holds.
async fn until<F: std::future::Future<Output = bool>>(what: &str, mut check: impl FnMut() -> F) {
    let started = Instant::now();
    while started.elapsed() < Duration::from_secs(5) {
        if check().await {
            return;
        }
        tokio::time::sleep(Duration::from_millis(25)).await;
    }
    panic!("timed out waiting for {what}");
}

fn saved_config(api: &str, rules: Value) -> Value {
    json!({
        "activeProfile": "auto",
        "dataApiUrl": api,
        "profiles": [{ "id": "desk", "pages": [{ "id": "main" }, { "id": "alerts" }] }],
        "alerts": { "enabled": true, "rules": rules, "defaults": { "seconds": 8 } },
    })
}

fn gpu_rule() -> Value {
    json!({
        "id": "r1", "name": "GPU temp", "enabled": true, "severity": "critical", "cooldownSeconds": 0,
        "source": { "kind": "sensor", "key": "gpu.temp", "op": ">", "value": 80, "forSeconds": 0 },
        "outputs": { "page": { "page": "alerts", "returnAfter": true } },
    })
}

async fn control_state(port: u16) -> Value {
    send(port, "GET", "/api/control", &[], "").await.json()
}

#[tokio::test]
async fn the_history_route_is_get_only_and_starts_empty() {
    let server = start(None).await;
    let reply = send(server.port, "GET", "/api/alerts/history", &[], "").await;
    assert_eq!((reply.status, reply.text().as_str()), (200, "[]"));
    for method in ["POST", "PUT", "DELETE", "PATCH"] {
        assert_eq!(send(server.port, method, "/api/alerts/history", &[], "").await.status, 405, "{method}");
    }
    server.stop().await;
}

#[tokio::test]
async fn the_alert_action_checks_its_guards_before_the_engine() {
    let server = start(None).await;
    let p = server.port;
    assert_eq!(send(p, "GET", "/api/control/alert", &[], "").await.status, 405);
    assert_eq!(send(p, "POST", "/api/control/alert", &[("Content-Type", "application/json")], "{}").await.status, 403);
    for body in ["{", "5", "[]", "null", "\"x\""] {
        let reply = post_alert(p, body).await;
        assert_eq!((reply.status, reply.text().as_str()), (400, "expected a JSON object"), "{body}");
    }
    for (body, error) in [
        ("{}", "unknown action"),
        (r#"{"action":"boom"}"#, "unknown action"),
        (r#"{"action":"test"}"#, "unknown rule"),
        (r#"{"action":"test","ruleId":"nope"}"#, "unknown rule"),
        (r#"{"action":"ack","id":"nope"}"#, "unknown alert"),
        (r#"{"action":"dismiss"}"#, "unknown alert"),
        (r#"{"action":"mute"}"#, "bad mute minutes"),
        (r#"{"action":"mute","minutes":"x"}"#, "bad mute minutes"),
        (r#"{"action":"mute","minutes":1441}"#, "bad mute minutes"),
        (r#"{"action":"mute","minutes":1.5}"#, "bad mute minutes"),
    ] {
        let reply = post_alert(p, body).await;
        assert_eq!((reply.status, reply.text()), (400, error.to_string()), "{body}");
    }
    // An empty body is an empty object, so an unknown action as well.
    assert_eq!(post_alert(p, "").await.text(), "unknown action");
    server.stop().await;
}

#[tokio::test]
async fn mute_sets_the_deadline_and_zero_clears_it() {
    let server = start(None).await;
    let p = server.port;
    let muted = post_alert(p, r#"{"action":"mute","minutes":10}"#).await;
    assert_eq!(muted.status, 200);
    let body = muted.json();
    assert_eq!(body["alerts"], json!([]));
    let until = body["mutedUntil"].as_f64().unwrap();
    assert_eq!(control_state(p).await["mutedUntil"].as_f64(), Some(until));
    let cleared = post_alert(p, r#"{"action":"mute","minutes":0}"#).await.json();
    assert_eq!(cleared, json!({ "alerts": [], "mutedUntil": null }));
    server.stop().await;
}

#[tokio::test]
async fn a_reading_fires_an_alert_that_switches_the_page_and_clears_with_it() {
    let api = FakeApi::start(0).await;
    let server = start(Some(&saved_config(&api.url, json!([gpu_rule()])))).await;
    let p = server.port;
    until("the subscription", || async { !api.requests().is_empty() }).await;
    assert_eq!(api.requests(), ["GET /events?prefix=gpu.&interval=1000 HTTP/1.1 | accept: text/event-stream"]);
    until("the stream", || async { api.open.load(Ordering::SeqCst) == 1 }).await;

    api.send(&json!({ "sensors": { "gpu.temp": { "value": 90, "unit": "°C" } }, "removed": [] }));
    until("the alert", || async { control_state(p).await["alerts"].as_array().unwrap().len() == 1 }).await;
    let state = control_state(p).await;
    let alert = &state["alerts"][0];
    assert_eq!((alert["ruleId"].as_str(), alert["text"].as_str(), alert["severity"].as_str()), (Some("r1"), Some("90°C"), Some("critical")));
    assert_eq!(state["profiles"]["desk"]["page"], "alerts");

    let history = send(p, "GET", "/api/alerts/history", &[], "").await.json();
    assert_eq!(history.as_array().unwrap().len(), 1);
    assert_eq!(history[0]["id"], alert["id"]);
    assert!(history[0].get("endedAt").is_none());

    // Acknowledge, then the reading drops and the alert clears; the page goes back.
    let id = alert["id"].as_str().unwrap();
    let acked = post_alert(p, &json!({ "action": "ack", "id": id }).to_string()).await;
    assert_eq!(acked.status, 200);
    assert_eq!(acked.json()["alerts"][0]["acknowledged"], true);
    assert_eq!(acked.json()["mutedUntil"], Value::Null);
    api.send(&json!({ "sensors": { "gpu.temp": { "value": 60 } } }));
    until("the clear", || async { control_state(p).await["alerts"] == json!([]) }).await;
    assert_eq!(control_state(p).await["profiles"]["desk"]["page"], "main");
    let history = send(p, "GET", "/api/alerts/history", &[], "").await.json();
    assert!(history[0]["endedAt"].is_number() && history[0]["acknowledgedAt"].is_number());

    // The history reaches alerts.json after the debounce (compact, as Node writes it).
    let file = server.data().join("alerts.json");
    until("alerts.json", || async { std::fs::read_to_string(&file).is_ok_and(|t| t.contains("endedAt")) }).await;
    let saved = std::fs::read_to_string(&file).unwrap();
    assert!(saved.starts_with(r#"{"history":[{"id":""#) && !saved.contains('\n') && !saved.contains(": "));
    server.stop().await;
}

#[tokio::test]
async fn a_test_alert_fires_without_a_reading_and_dismiss_removes_it() {
    let server = start(Some(&saved_config("http://127.0.0.1:9", json!([gpu_rule()])))).await;
    let p = server.port;
    let test = post_alert(p, r#"{"action":"test","ruleId":"r1"}"#).await;
    assert_eq!(test.status, 200);
    let alerts = test.json()["alerts"].clone();
    assert_eq!((alerts[0]["test"].clone(), alerts[0]["text"].clone()), (json!(true), json!("")));
    let id = alerts[0]["id"].as_str().unwrap();
    let dismissed = post_alert(p, &json!({ "action": "dismiss", "id": id }).to_string()).await;
    assert_eq!(dismissed.json(), json!({ "alerts": [], "mutedUntil": null }));
    let history = send(p, "GET", "/api/alerts/history", &[], "").await.json();
    assert_eq!((history[0]["test"].clone(), history[0]["dismissed"].clone()), (json!(true), json!(true)));
    server.stop().await;
}

#[tokio::test]
async fn saving_the_config_changes_the_streams_and_closes_the_old_ones() {
    let api = FakeApi::start(0).await;
    let server = start(Some(&saved_config(&api.url, json!([gpu_rule()])))).await;
    let p = server.port;
    until("the first stream", || async { api.open.load(Ordering::SeqCst) == 1 }).await;

    // The same keys again: no reconnect. A rule on another prefix adds a stream.
    let same = saved_config(&api.url, json!([gpu_rule()])).to_string();
    assert_eq!(send(p, "POST", "/api/config", &CONFIG, &same).await.status, 200);
    let more = saved_config(&api.url, json!([gpu_rule(), { "id": "r2", "source": { "kind": "sensor", "key": "cpu.load", "op": ">", "value": 1 } }]));
    assert_eq!(send(p, "POST", "/api/config", &CONFIG, &more.to_string()).await.status, 200);
    until("the second stream", || async { api.open.load(Ordering::SeqCst) == 2 }).await;
    assert_eq!(api.requests().len(), 2);

    // Alerts off: every stream closes.
    let mut off = more.clone();
    off["alerts"]["enabled"] = json!(false);
    assert_eq!(send(p, "POST", "/api/config", &CONFIG, &off.to_string()).await.status, 200);
    until("the streams to close", || async { api.open.load(Ordering::SeqCst) == 0 }).await;
    server.stop().await;
}

#[tokio::test]
async fn a_refused_connection_is_retried_after_a_second() {
    let api = FakeApi::start(1).await;
    let started = Instant::now();
    let server = start(Some(&saved_config(&api.url, json!([gpu_rule()])))).await;
    until("the retry", || async { api.open.load(Ordering::SeqCst) == 1 }).await;
    assert_eq!(api.requests().len(), 2);
    assert!(started.elapsed() >= Duration::from_millis(900), "retried after {:?}", started.elapsed());
    server.stop().await;
}
