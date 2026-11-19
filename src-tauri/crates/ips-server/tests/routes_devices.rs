// The devices routes over a real socket (/api/devices/battery and the `peripherals` section of /api/integrations): a
// server on a free port with a temp data folder, and raw HTTP/1.1 requests, so the exact status and headers are what a
// client sees. `bind_with_home` (a test server) never polls this PC's devices: the switch is off here and turning it
// on only makes the state route say so, as it does on a server that runs its backends.

use std::path::{Path, PathBuf};
use std::time::Duration;

use ips_server::{bind_with_home, ServerConfig};
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::TcpStream;
use tokio::sync::oneshot;

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
        action_runner: false,
        obs_stream: false,
        agent_approvals: vec![],
        agent_key_file: None,
        dist: dir.join("dist"),
        data_dir: dir.join("data"),
        infopanel_dir: dir.join("infopanel"),
        debug: false,
        version: "9.9.9".into(),
    }
}

async fn start() -> Server {
    let dir = tempfile::tempdir().unwrap();
    std::fs::create_dir_all(dir.path().join("dist")).unwrap();
    let cfg = config(dir.path());
    let home = cfg.data_dir.with_file_name("home");
    let bound = bind_with_home(cfg, home).await.unwrap();
    let port = bound.port();
    let (stop, stopped) = oneshot::channel::<()>();
    let done = tokio::spawn(bound.serve(async {
        let _ = stopped.await;
    }));
    Server { port, dir, stop: Some(stop), done }
}

struct Reply {
    status: u16,
    headers: Vec<(String, String)>,
    body: Vec<u8>,
}

impl Reply {
    fn header(&self, name: &str) -> Option<&str> {
        self.headers.iter().find(|(k, _)| k.eq_ignore_ascii_case(name)).map(|(_, v)| v.as_str())
    }

    fn text(&self) -> String {
        String::from_utf8_lossy(&self.body).into_owned()
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

/// Sends `method path` with `headers` (a Host is added unless given) and reads the whole answer.
async fn send(port: u16, method: &str, path: &str, headers: &[(&str, &str)], body: &str) -> Reply {
    let mut stream = TcpStream::connect(("127.0.0.1", port)).await.unwrap();
    let mut request = format!("{method} {path} HTTP/1.1\r\nConnection: close\r\n");
    if !headers.iter().any(|(k, _)| k.eq_ignore_ascii_case("host")) {
        request.push_str(&format!("Host: 127.0.0.1:{port}\r\n"));
    }
    for (k, v) in headers {
        request.push_str(&format!("{k}: {v}\r\n"));
    }
    request.push_str(&format!("Content-Length: {}\r\n\r\n{body}", body.len()));
    stream.write_all(request.as_bytes()).await.unwrap();
    let mut raw = Vec::new();
    tokio::time::timeout(Duration::from_secs(5), stream.read_to_end(&mut raw)).await.unwrap().unwrap();
    let split = raw.windows(4).position(|w| w == b"\r\n\r\n").unwrap();
    let head = String::from_utf8_lossy(&raw[..split]).into_owned();
    let mut lines = head.split("\r\n");
    let status = lines.next().unwrap().split(' ').nth(1).unwrap().parse().unwrap();
    let headers: Vec<(String, String)> =
        lines.filter_map(|l| l.split_once(':')).map(|(k, v)| (k.trim().to_string(), v.trim().to_string())).collect();
    let rest = &raw[split + 4..];
    let chunked = headers.iter().any(|(k, v)| k.eq_ignore_ascii_case("transfer-encoding") && v == "chunked");
    Reply { status, body: if chunked { dechunk(rest) } else { rest.to_vec() }, headers }
}

async fn get(port: u16, path: &str) -> Reply {
    send(port, "GET", path, &[], "").await
}

fn json(reply: &Reply) -> serde_json::Value {
    serde_json::from_slice(&reply.body).unwrap()
}

const PUT_HEADERS: [(&str, &str); 2] = [("Content-Type", "application/json"), ("X-Dashboard-Config", "1")];

async fn put(port: u16, body: &str) -> Reply {
    send(port, "PUT", "/api/integrations", &PUT_HEADERS, body).await
}

#[tokio::test]
async fn starts_off_with_no_devices_and_says_so_in_the_header() {
    let s = start().await;
    let state = get(s.port, "/api/devices/battery").await;
    assert_eq!(state.status, 200);
    assert_eq!(state.header("x-devices"), Some("off"));
    assert_eq!(state.header("content-type"), Some("application/json; charset=utf-8"));
    let body = json(&state);
    assert_eq!(body["enabled"], false);
    assert_eq!(body["devices"], serde_json::json!([]));
    assert_eq!(body["lastPoll"], serde_json::Value::Null);
    assert_eq!(body["error"], serde_json::Value::Null);
    assert_eq!((body["intervalSec"].clone(), body["lowPercent"].clone()), (serde_json::json!(60), serde_json::json!(15)));
    assert_eq!(body["platform"], if cfg!(windows) { "full" } else { "none" });
    for method in ["POST", "PUT", "DELETE"] {
        assert_eq!(send(s.port, method, "/api/devices/battery", &[], "").await.status, 405, "{method}");
    }
    assert_eq!(get(s.port, "/api/devices/other").await.status, 404);
    s.stop().await;
}

#[tokio::test]
async fn a_saved_peripherals_section_is_the_switch_the_state_route_reads() {
    let s = start().await;
    let patch = r#"{"peripherals":{"enabled":true,"intervalSec":90,"lowPercent":20,"hidden":["glorious:1038:1234:1"],"names":{"glorious:1038:1234:1":"Lounge mouse"}}}"#;
    let saved = put(s.port, patch).await;
    assert_eq!(saved.status, 200);
    // Nothing in the section is secret: the studio sees it whole, beside the sections that were there before.
    assert_eq!(
        saved.text(),
        r#"{"obs":{"host":"","port":4455,"hasPassword":false},"calendar":{"links":[]},"peripherals":{"enabled":true,"intervalSec":90,"lowPercent":20,"hidden":["glorious:1038:1234:1"],"names":{"glorious:1038:1234:1":"Lounge mouse"}}}"#
    );
    // The state route reads the live section: on, from the store, without a restart (nothing polls here).
    let state = get(s.port, "/api/devices/battery").await;
    assert_eq!(state.status, 200);
    assert_eq!(state.header("x-devices"), None);
    let body = json(&state);
    assert_eq!((body["enabled"].clone(), body["intervalSec"].clone(), body["lowPercent"].clone()), (serde_json::json!(true), serde_json::json!(90), serde_json::json!(20)));
    assert_eq!(body["devices"], serde_json::json!([]));
    // Absent fields keep their value; a list is replaced whole.
    assert_eq!(put(s.port, r#"{"peripherals":{"enabled":false}}"#).await.status, 200);
    let off = get(s.port, "/api/devices/battery").await;
    assert_eq!(off.header("x-devices"), Some("off"));
    assert_eq!((json(&off)["enabled"].clone(), json(&off)["intervalSec"].clone()), (serde_json::json!(false), serde_json::json!(90)));
    // It is written to the integrations file, not to config.json.
    let file = std::fs::read_to_string(s.data().join("integrations.json")).unwrap();
    assert!(file.contains("\"peripherals\"") && file.contains("\"intervalSec\": 90"), "{file}");
    s.stop().await;
}

#[tokio::test]
async fn refuses_a_peripherals_write_without_the_config_header_or_with_a_bad_patch() {
    let s = start().await;
    let no_header = send(s.port, "PUT", "/api/integrations", &[("Content-Type", "application/json")], r#"{"peripherals":{"enabled":true}}"#).await;
    assert_eq!((no_header.status, no_header.text().as_str()), (403, "missing X-Dashboard-Config header"));
    let refusals = [
        (r#"{"peripherals":null}"#, "peripherals: expected an object"),
        (r#"{"peripherals":{"enabled":1}}"#, "peripherals.enabled: expected true or false"),
        (r#"{"peripherals":{"intervalSec":-5}}"#, "peripherals.intervalSec: a whole number"),
        (r#"{"peripherals":{"hidden":"k"}}"#, "peripherals.hidden: expected a list"),
        (r#"{"peripherals":{"names":[]}}"#, "peripherals.names: expected an object"),
    ];
    for (body, message) in refusals {
        let r = put(s.port, body).await;
        assert_eq!((r.status, r.text().as_str()), (400, message), "{body}");
    }
    // A refused patch changes nothing: the switch is still off.
    assert_eq!(get(s.port, "/api/devices/battery").await.header("x-devices"), Some("off"));
    assert!(!s.data().join("integrations.json").exists());
    s.stop().await;
}
