// The media keys route over a real socket (POST /api/media/act, pinned layer P6): a server on a free port with a temp data
// folder. Every refusal is checked; a good key is sent only off Windows, where it is turned away with 503, because on
// Windows it would press a real media key on the machine running the tests.

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

async fn act(port: u16, body: &str) -> Reply {
    send(port, "POST", "/api/media/act", &WRITE, body).await
}

#[tokio::test]
async fn guards_and_validates_a_media_key() {
    let s = start().await;
    let ok = r#"{"key":"play-pause"}"#;
    // Only POST.
    assert_eq!(send(s.port, "GET", "/api/media/act", &[], "").await.status, 405);
    assert_eq!(send(s.port, "PUT", "/api/media/act", &WRITE, ok).await.status, 405);
    // The JSON type and the marker header.
    let only = |h: &'static [(&'static str, &'static str)]| send(s.port, "POST", "/api/media/act", h, ok);
    assert_eq!(only(&[("X-Dashboard-Control", "1")]).await.status, 415);
    assert_eq!(only(&[("Content-Type", "text/plain"), ("X-Dashboard-Control", "1")]).await.status, 415);
    assert_eq!(only(&[("Content-Type", "application/json")]).await.status, 403);
    assert_eq!(only(&[("Content-Type", "application/json"), ("X-Dashboard-Control", "0")]).await.status, 403);
    // Any other key, or a body that is not one, or is too large.
    for bad in ["", "nope", "[]", "{}", r#"{"key":"volume-up"}"#, r#"{"key":"Next"}"#, r#"{"key":1}"#, r#"{"op":"next"}"#] {
        assert_eq!(act(s.port, bad).await.status, 400, "{bad}");
    }
    // It names the three keys it takes.
    let reply = act(s.port, r#"{"key":"volume-up"}"#).await;
    assert_eq!(String::from_utf8_lossy(&reply.body), "\"key\" must be play-pause, next or previous");
    assert_eq!(act(s.port, &format!(r#"{{"key":"next","pad":"{}"}}"#, "x".repeat(2000))).await.status, 400);
    s.stop().await;
}

#[cfg(not(windows))]
#[tokio::test]
async fn a_good_key_finds_no_media_keys_off_windows() {
    let s = start().await;
    for good in [r#"{"key":"play-pause"}"#, r#"{"key":"next"}"#, r#"{"key":"previous"}"#] {
        let reply = act(s.port, good).await;
        assert_eq!((reply.status, String::from_utf8_lossy(&reply.body).as_ref()), (503, "media keys aren't available"), "{good}");
    }
    s.stop().await;
}
