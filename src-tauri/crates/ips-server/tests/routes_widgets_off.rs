// The user-widget rollback switch (USER_WIDGETS=off) over a real socket. Its own test binary: the variable is process-wide.

use std::time::Duration;

use ips_server::{bind_with_home, ServerConfig};
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::TcpStream;
use tokio::sync::oneshot;

/// The status, whether the answer says the store is off, and the body (enough for these short answers).
async fn ask(port: u16, method: &str, path: &str, headers: &str, body: &str) -> (u16, bool, String) {
    let mut stream = TcpStream::connect(("127.0.0.1", port)).await.unwrap();
    let request = format!("{method} {path} HTTP/1.1\r\nConnection: close\r\nHost: 127.0.0.1:{port}\r\n{headers}Content-Length: {}\r\n\r\n{body}", body.len());
    stream.write_all(request.as_bytes()).await.unwrap();
    let mut raw = Vec::new();
    tokio::time::timeout(Duration::from_secs(5), stream.read_to_end(&mut raw)).await.unwrap().unwrap();
    let text = String::from_utf8_lossy(&raw).into_owned();
    let status = text.split(' ').nth(1).unwrap().parse().unwrap();
    let off = text.to_ascii_lowercase().contains("x-user-widgets: off");
    let rest = text.split("\r\n\r\n").nth(1).unwrap_or("");
    let body = if text.to_ascii_lowercase().contains("transfer-encoding: chunked") { rest.lines().nth(1).unwrap_or("").to_string() } else { rest.to_string() };
    (status, off, body)
}

#[tokio::test]
async fn off_the_folder_is_not_read_nothing_is_written_and_every_answer_says_so() {
    std::env::set_var("USER_WIDGETS", "off");
    let dir = tempfile::tempdir().unwrap();
    std::fs::create_dir_all(dir.path().join("dist")).unwrap();
    let root = dir.path().join("data").join("widgets").join("recipe.mine");
    std::fs::create_dir_all(&root).unwrap();
    std::fs::write(root.join("manifest.json"), r#"{"kind":"recipe","id":"recipe:mine"}"#).unwrap();
    std::fs::write(root.join("recipe.json"), r#"{"id":"recipe:mine"}"#).unwrap();
    std::fs::create_dir_all(dir.path().join("data").join("widgets").join(".import-1")).unwrap();
    let cfg = ServerConfig {
        host: "127.0.0.1".into(),
        port: 0,
        allowed_hosts: vec![],
        allow_remote_edit: false,
        allow_remote_upload: false,
        action_runner: false,
        obs_stream: false,
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
    assert_eq!(ask(port, "GET", "/api/widgets", "", "").await, (200, true, "[]".to_string()), "the studio and the kiosk read this to hide user widgets");
    let (status, off, _) = ask(port, "GET", "/api/widgets/recipe.mine/manifest.json", "", "").await;
    assert_eq!((status, off), (404, true), "a file: the kiosk draws nothing for a recipe placement");
    let write = "Content-Type: application/json\r\nX-Dashboard-Widget: 1\r\n";
    assert_eq!(ask(port, "POST", "/api/widgets", write, r#"{"files":[]}"#).await.0, 403);
    assert_eq!(ask(port, "DELETE", "/api/widgets/recipe.mine", write, "").await.0, 403);
    assert!(root.join("manifest.json").exists(), "nothing was deleted");
    assert!(dir.path().join("data").join("widgets").join(".import-1").exists(), "not even swept");
    let _ = stop.send(());
    tokio::time::timeout(Duration::from_secs(5), done).await.unwrap().unwrap();
}
