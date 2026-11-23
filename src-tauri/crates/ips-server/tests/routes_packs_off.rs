// The user-pack rollback switch (USER_PACKS=off) over a real socket. Its own test binary: the variable is process-wide.

use std::time::Duration;

use ips_server::{bind_with_home, ServerConfig};
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::TcpStream;
use tokio::sync::oneshot;

/// Whether the answer to `GET /api/packs` says the store is off.
async fn says_off(port: u16) -> bool {
    let mut stream = TcpStream::connect(("127.0.0.1", port)).await.unwrap();
    stream.write_all(format!("GET /api/packs HTTP/1.1\r\nConnection: close\r\nHost: 127.0.0.1:{port}\r\n\r\n").as_bytes()).await.unwrap();
    let mut raw = Vec::new();
    tokio::time::timeout(Duration::from_secs(5), stream.read_to_end(&mut raw)).await.unwrap().unwrap();
    String::from_utf8_lossy(&raw).to_ascii_lowercase().contains("x-user-packs: off")
}

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
async fn off_the_folder_is_not_read_and_nothing_is_written() {
    std::env::set_var("USER_PACKS", "off");
    let dir = tempfile::tempdir().unwrap();
    std::fs::create_dir_all(dir.path().join("dist")).unwrap();
    let packs = dir.path().join("data").join("packs").join("mine");
    std::fs::create_dir_all(&packs).unwrap();
    std::fs::write(packs.join("pack.json"), r#"{"id":"mine","name":"Mine"}"#).unwrap();
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
    assert_eq!(status_and_body(port, "GET", "/api/packs", "", "").await, (200, "[]".to_string()));
    assert!(says_off(port).await, "the studio reads this to hide its import buttons");
    assert_eq!(status_and_body(port, "GET", "/api/packs/mine/pack.json", "", "").await.0, 404);
    let write = "Content-Type: application/json\r\nX-Dashboard-Pack: 1\r\n";
    assert_eq!(status_and_body(port, "POST", "/api/packs", write, r#"{"id":"mine","files":[]}"#).await.0, 403);
    assert_eq!(status_and_body(port, "DELETE", "/api/packs/mine", write, "").await.0, 403);
    // the signing route and the render check's page go with it, and a stored CSS is not read
    std::fs::write(packs.join("pack.css"), "a{}").unwrap();
    assert_eq!(status_and_body(port, "POST", "/api/packs/mine/sign", write, r#"{"css":"YQ==","hash":"x"}"#).await.0, 403);
    assert_eq!(status_and_body(port, "GET", "/api/packs/mine/pack.css", "", "").await.0, 404);
    assert_eq!(
        status_and_body(port, "GET", "/?widget-qa&pack-check=1", "Sec-Fetch-Dest: iframe\r\nSec-Fetch-Site: same-origin\r\n", "").await.0,
        404
    );
    assert_eq!(
        status_and_body(port, "GET", "/index.html?widget-qa&pack-check=1", "Sec-Fetch-Dest: iframe\r\nSec-Fetch-Site: same-origin\r\n", "")
            .await
            .0,
        404
    );
    assert!(!dir.path().join("data").join(ips_server::pack_sign::KEY_FILE).exists(), "and no key is made");
    assert!(packs.join("pack.json").exists(), "nothing was deleted");
    let _ = stop.send(());
    tokio::time::timeout(Duration::from_secs(5), done).await.unwrap().unwrap();
}
