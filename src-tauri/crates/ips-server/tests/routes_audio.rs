// The audio routes over a real socket (/api/audio, /events/audio, /api/audio/act): a server on a free port with a temp
// data folder. `bind_with_home` starts no audio backend, so nothing here reads or writes this PC's audio or Wave Link:
// the state is the empty one and every write is turned away with 503.

use std::path::Path;
use std::time::Duration;

use ips_server::{bind_with_home, ServerConfig};
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
        tokio::time::timeout(Duration::from_secs(5), &mut self.done)
            .await
            .expect("graceful stop")
            .unwrap();
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
    Server {
        port,
        _dir: dir,
        stop: Some(stop),
        done,
    }
}

struct Reply {
    status: u16,
    body: Vec<u8>,
}

fn dechunk(mut raw: &[u8]) -> Vec<u8> {
    let mut out = Vec::new();
    while let Some(end) = raw.windows(2).position(|w| w == b"\r\n") {
        let size =
            usize::from_str_radix(std::str::from_utf8(&raw[..end]).unwrap().trim(), 16).unwrap();
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
    let mut request =
        format!("{method} {path} HTTP/1.1\r\nConnection: close\r\nHost: 127.0.0.1:{port}\r\n");
    for (k, v) in headers {
        request.push_str(&format!("{k}: {v}\r\n"));
    }
    request.push_str(&format!("Content-Length: {}\r\n\r\n{body}", body.len()));
    stream.write_all(request.as_bytes()).await.unwrap();
    let mut raw = Vec::new();
    tokio::time::timeout(Duration::from_secs(5), stream.read_to_end(&mut raw))
        .await
        .unwrap()
        .unwrap();
    let split = raw.windows(4).position(|w| w == b"\r\n\r\n").unwrap();
    let head = String::from_utf8_lossy(&raw[..split]).into_owned();
    let status = head.split(' ').nth(1).unwrap().parse().unwrap();
    let chunked = head
        .to_ascii_lowercase()
        .contains("transfer-encoding: chunked");
    let rest = &raw[split + 4..];
    Reply {
        status,
        body: if chunked {
            dechunk(rest)
        } else {
            rest.to_vec()
        },
    }
}

const WRITE: [(&str, &str); 2] = [
    ("Content-Type", "application/json"),
    ("X-Dashboard-Control", "1"),
];

async fn act(port: u16, body: &str) -> Reply {
    send(port, "POST", "/api/audio/act", &WRITE, body).await
}

#[tokio::test]
async fn answers_the_empty_state_with_the_shape_the_client_reads() {
    let s = start().await;
    let reply = send(s.port, "GET", "/api/audio", &[], "").await;
    assert_eq!(reply.status, 200);
    let state: serde_json::Value = serde_json::from_slice(&reply.body).unwrap();
    assert_eq!(
        state,
        serde_json::json!({
            "windows": { "available": false, "outputs": [], "inputs": [], "apps": [] },
            "wavelink": { "status": "absent", "channels": [], "mixes": [] }
        })
    );
    assert_eq!(
        send(s.port, "POST", "/api/audio", &WRITE, "{}")
            .await
            .status,
        405
    );
    s.stop().await;
}

#[tokio::test]
async fn streams_the_state_first() {
    let s = start().await;
    let mut stream = TcpStream::connect(("127.0.0.1", s.port)).await.unwrap();
    stream
        .write_all(
            format!(
                "GET /events/audio HTTP/1.1\r\nHost: localhost:{}\r\n\r\n",
                s.port
            )
            .as_bytes(),
        )
        .await
        .unwrap();
    let mut seen = String::new();
    let mut buf = [0u8; 4096];
    while !seen.contains("}\n\n") {
        let read = tokio::time::timeout(Duration::from_secs(5), stream.read(&mut buf))
            .await
            .unwrap()
            .unwrap();
        assert!(read > 0, "stream closed: {seen}");
        seen.push_str(&String::from_utf8_lossy(&buf[..read]));
    }
    assert!(seen.starts_with("HTTP/1.1 200"), "{seen}");
    assert!(seen
        .to_ascii_lowercase()
        .contains("content-type: text/event-stream\r\n"));
    assert!(
        seen.contains(r#"data: {"windows":{"available":false"#),
        "{seen}"
    );
    s.stop().await;
}

#[tokio::test]
async fn guards_and_validates_a_write_before_asking_a_backend() {
    let s = start().await;
    let ok = r#"{"target":"windows","op":"volume","kind":"output","id":"x","value":10}"#;
    // Only POST.
    assert_eq!(
        send(s.port, "GET", "/api/audio/act", &[], "").await.status,
        405
    );
    assert_eq!(
        send(s.port, "PUT", "/api/audio/act", &WRITE, ok)
            .await
            .status,
        405
    );
    // The JSON type and the marker header.
    assert_eq!(
        send(
            s.port,
            "POST",
            "/api/audio/act",
            &[("X-Dashboard-Control", "1")],
            ok
        )
        .await
        .status,
        415
    );
    assert_eq!(
        send(
            s.port,
            "POST",
            "/api/audio/act",
            &[("Content-Type", "application/json")],
            ok
        )
        .await
        .status,
        403
    );
    assert_eq!(
        send(
            s.port,
            "POST",
            "/api/audio/act",
            &[
                ("Content-Type", "application/json"),
                ("X-Dashboard-Control", "0")
            ],
            ok
        )
        .await
        .status,
        403
    );
    // A body that is not an action, or is too large.
    for bad in [
        "",
        "nope",
        "[]",
        r#"{"target":"windows","op":"volume","kind":"output","id":"x","value":101}"#,
        r#"{"target":"wavelink","op":"mix","id":"m"}"#,
    ] {
        assert_eq!(act(s.port, bad).await.status, 400, "{bad}");
    }
    assert_eq!(
        act(
            s.port,
            &format!(
                r#"{{"target":"windows","op":"default","id":"{}"}}"#,
                "x".repeat(8000)
            )
        )
        .await
        .status,
        400
    );
    // A good one reaches no backend here.
    assert_eq!(act(s.port, ok).await.status, 503);
    assert_eq!(
        act(
            s.port,
            r#"{"target":"wavelink","op":"channel","id":"c","level":50}"#
        )
        .await
        .status,
        503
    );
    assert_eq!(
        act(s.port, r#"{"target":"windows","op":"settings"}"#)
            .await
            .status,
        503,
        "never opens the settings app from a test"
    );
    s.stop().await;
}
