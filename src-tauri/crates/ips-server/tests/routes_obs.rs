// The OBS control routes over a real socket (POST /api/obs/act, and the streaming settings in /api/integrations): a server on
// a free port with a temp data folder and no OBS set up, so nothing here connects to an OBS: a good action is turned away with
// 503. The session with an OBS is in obs_live.rs.

use std::path::Path;
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
    fn data(&self) -> std::path::PathBuf {
        self.dir.path().join("data")
    }

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
        dir,
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
    send(port, "POST", "/api/obs/act", &WRITE, body).await
}

#[tokio::test]
async fn guards_and_validates_a_write_before_asking_obs() {
    let s = start().await;
    let ok = r#"{"op":"scene","id":"abc"}"#;
    // Only POST.
    assert_eq!(
        send(s.port, "GET", "/api/obs/act", &[], "").await.status,
        405
    );
    assert_eq!(
        send(s.port, "PUT", "/api/obs/act", &WRITE, ok).await.status,
        405
    );
    // The JSON type and the marker header.
    assert_eq!(
        send(
            s.port,
            "POST",
            "/api/obs/act",
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
            "/api/obs/act",
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
            "/api/obs/act",
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
    // A body that is not an action (there is no start or stop stream), or is too large.
    for bad in [
        "",
        "nope",
        "[]",
        "{}",
        r#"{"op":"stream"}"#,
        r#"{"op":"scene"}"#,
        r#"{"op":"scene","id":5}"#,
        r#"{"op":"start"}"#,
    ] {
        assert_eq!(act(s.port, bad).await.status, 400, "{bad}");
    }
    assert_eq!(
        act(
            s.port,
            &format!(r#"{{"op":"scene","id":"{}"}}"#, "x".repeat(8000))
        )
        .await
        .status,
        400
    );
    // A good one finds no OBS connected.
    for good in [ok, r#"{"op":"mic"}"#, r#"{"op":"replay"}"#] {
        let reply = act(s.port, good).await;
        assert_eq!(
            (reply.status, String::from_utf8_lossy(&reply.body).as_ref()),
            (503, "OBS isn't connected"),
            "{good}"
        );
    }
    s.stop().await;
}

#[tokio::test]
async fn takes_64_scenes_looks_at_their_longest_in_one_save() {
    let s = start().await;
    let scenes: serde_json::Map<String, serde_json::Value> = (0..64)
        .map(|i| (format!("{i:03}{}", "i".repeat(125)), serde_json::json!({ "sub": "s".repeat(60), "icon": "c".repeat(40) })))
        .collect();
    let body = serde_json::json!({ "streaming": { "obs": { "mic": "m".repeat(256), "scenes": scenes } } }).to_string();
    assert!(body.len() > 16 * 1024, "{} bytes is more than the old cap", body.len());
    let saved = send(s.port, "PUT", "/api/integrations", &[("Content-Type", "application/json"), ("X-Dashboard-Config", "1")], &body).await;
    assert_eq!(saved.status, 200);
    let view: serde_json::Value = serde_json::from_slice(&saved.body).unwrap();
    assert_eq!(view["streaming"]["obs"]["scenes"].as_object().map(|m| m.len()), Some(64));
    s.stop().await;
}

#[tokio::test]
async fn saves_the_streaming_settings_beside_the_obs_ones() {
    let s = start().await;
    let put = |body: &'static str| {
        send(
            s.port,
            "PUT",
            "/api/integrations",
            &[
                ("Content-Type", "application/json"),
                ("X-Dashboard-Config", "1"),
            ],
            body,
        )
    };
    let stored = put(r#"{"streaming":{"obs":{"mic":"Mic/Aux","scenes":{"u1":{"sub":"Cam","icon":"videocam"}}}}}"#).await;
    assert_eq!(stored.status, 200);
    let view: serde_json::Value = serde_json::from_slice(&stored.body).unwrap();
    assert_eq!(
        view["streaming"],
        serde_json::json!({ "obs": { "mic": "Mic/Aux", "scenes": { "u1": { "sub": "Cam", "icon": "videocam" } } } })
    );
    assert_eq!(
        view["obs"],
        serde_json::json!({ "host": "", "port": 4455, "hasPassword": false })
    );
    let again = send(s.port, "GET", "/api/integrations", &[], "").await;
    assert_eq!(
        serde_json::from_slice::<serde_json::Value>(&again.body).unwrap(),
        view
    );
    let file = std::fs::read_to_string(s.data().join("integrations.json")).unwrap();
    assert!(file.contains("\"streaming\"") && file.contains("Mic/Aux"));
    // A bad section is refused whole.
    assert_eq!(put(r#"{"streaming":{"obs":{"mic":4}}}"#).await.status, 400);
    s.stop().await;
}
