// The pack-script switch (PACK_SCRIPTS=off) over a real socket. Its own test binary: the variable is process-wide.

use std::time::Duration;

use ips_server::{bind_with_home, ServerConfig};
use serde_json::{json, Value};
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::TcpStream;
use tokio::sync::oneshot;

async fn status_and_body(port: u16, method: &str, path: &str, headers: &str, body: &str) -> (u16, String) {
    let mut stream = TcpStream::connect(("127.0.0.1", port)).await.unwrap();
    let request = format!(
        "{method} {path} HTTP/1.1\r\nConnection: close\r\nHost: 127.0.0.1:{port}\r\n{headers}Content-Length: {}\r\n\r\n{body}",
        body.len()
    );
    stream.write_all(request.as_bytes()).await.unwrap();
    let mut raw = Vec::new();
    tokio::time::timeout(Duration::from_secs(5), stream.read_to_end(&mut raw)).await.unwrap().unwrap();
    let text = String::from_utf8_lossy(&raw).into_owned();
    let status = text.split(' ').nth(1).unwrap().parse().unwrap();
    let rest = text.split("\r\n\r\n").nth(1).unwrap_or("");
    // a chunked body: the text between the size line and the end, enough for these short answers
    let body = if text.to_ascii_lowercase().contains("transfer-encoding: chunked") {
        rest.lines().nth(1).unwrap_or("").to_string()
    } else {
        rest.to_string()
    };
    (status, body)
}

#[tokio::test]
async fn off_no_pack_runs_its_script_whatever_the_user_said() {
    std::env::set_var("PACK_SCRIPTS", "off");
    let dir = tempfile::tempdir().unwrap();
    std::fs::create_dir_all(dir.path().join("dist")).unwrap();
    let cfg = ServerConfig {
        host: "127.0.0.1".into(),
        port: 0,
        allowed_hosts: vec![],
        allow_remote_edit: false,
        allow_remote_upload: false,
        action_runner: false,
        obs_stream: false,
        agent_approvals: vec![],
        agent_key_file: None,
        dist: dir.path().join("dist"),
        data_dir: dir.path().join("data"),
        infopanel_dir: dir.path().join("infopanel"),
        debug: false,
        version: "9.9.9".into(),
    };
    let home = cfg.data_dir.with_file_name("home");
    let bound = bind_with_home(cfg, home).await.unwrap();
    let port = bound.port();
    let (stop, stopped) = oneshot::channel::<()>();
    let done = tokio::spawn(bound.serve(async {
        let _ = stopped.await;
    }));
    let pack = json!({ "id": "mine", "name": "Mine", "version": "1.0.0", "script": { "file": "fx.js" } });
    let files = json!([
        { "path": "pack.json", "data": base64(&pack.to_string()) },
        { "path": "look.json", "data": base64(r#"{"id":"mine"}"#) },
        { "path": "assets/fx.js", "data": base64("fx.onFrame(() => {});") },
    ]);
    let write = "Content-Type: application/json\r\nX-Dashboard-Pack: 1\r\n";
    assert_eq!(status_and_body(port, "POST", "/api/packs", write, &json!({ "id": "mine", "files": files }).to_string()).await.0, 200);
    assert_eq!(status_and_body(port, "PUT", "/api/packs/mine/script-consent", write, r#"{"granted":true}"#).await.0, 200);
    let (_, body) = status_and_body(port, "GET", "/api/packs/mine/trust", "", "").await;
    let trust: Value = serde_json::from_str(&body).unwrap();
    assert_eq!((trust["consent"].as_str(), trust["scriptRuns"].as_bool()), (Some("granted"), Some(false)));
    assert_eq!(status_and_body(port, "GET", "/api/packs/mine/fx.js", "", "").await.0, 404);
    let (_, body) = status_and_body(port, "GET", "/api/pack-scripts", "", "").await;
    assert_eq!(serde_json::from_str::<Value>(&body).unwrap()["env"], false, "the studio shows the server's switch");
    // the pack's declarative files are unaffected
    assert_eq!(status_and_body(port, "GET", "/api/packs/mine/look.json", "", "").await.0, 200);
    let _ = stop.send(());
    tokio::time::timeout(Duration::from_secs(5), done).await.expect("graceful stop").unwrap();
}

fn base64(text: &str) -> String {
    use base64::Engine;
    base64::engine::general_purpose::STANDARD.encode(text)
}
