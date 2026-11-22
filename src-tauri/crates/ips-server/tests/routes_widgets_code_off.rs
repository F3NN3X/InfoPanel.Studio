// The code-widget switch (USER_CODE_WIDGETS=off, Phase 6a) over a real socket. Its own test binary: the variable is process-wide.
// Off, a code widget is not listed, not served and not imported, even signed with a trusted key; recipes are untouched.

use std::path::{Path, PathBuf};
use std::time::Duration;

use base64::engine::general_purpose::STANDARD;
use base64::Engine;
use ips_server::widget_keys::KeyStore;
use ips_server::{bind_with_home, ServerConfig};
use serde_json::{json, Value};
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::TcpStream;
use tokio::sync::oneshot;

/// The status, whether the answer says code widgets are off, and the body (enough for these short answers).
async fn ask(port: u16, method: &str, path: &str, headers: &str, body: &str) -> (u16, bool, String) {
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
    let off = text.to_ascii_lowercase().contains("x-user-code-widgets: off");
    let rest = text.split("\r\n\r\n").nth(1).unwrap_or("");
    let body = if text.to_ascii_lowercase().contains("transfer-encoding: chunked") {
        rest.lines().nth(1).unwrap_or("").to_string()
    } else {
        rest.to_string()
    };
    (status, off, body)
}

fn fixtures() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../../tests/fixtures/widgets")
}

fn copy(from: &Path, to: &Path) {
    std::fs::create_dir_all(to).unwrap();
    for entry in std::fs::read_dir(from).unwrap() {
        let entry = entry.unwrap();
        std::fs::copy(entry.path(), to.join(entry.file_name())).unwrap();
    }
}

#[tokio::test]
async fn off_a_code_widget_is_not_listed_served_or_imported_and_recipes_are_untouched() {
    std::env::set_var("USER_CODE_WIDGETS", "off");
    let dir = tempfile::tempdir().unwrap();
    std::fs::create_dir_all(dir.path().join("dist")).unwrap();
    let data = dir.path().join("data");
    copy(&fixtures().join("ext.test.clock"), &data.join("widgets").join("ext.test.clock"));
    copy(&fixtures().join("recipe.signed"), &data.join("widgets").join("recipe.signed"));
    KeyStore::new(&data)
        .add_user("Test", &std::fs::read_to_string(fixtures().join("TEST-ONLY-publisher.pub")).unwrap(), &["test".into()])
        .unwrap();
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
        data_dir: data.clone(),
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
    let (status, off, body) = ask(port, "GET", "/api/widgets", "", "").await;
    let ids: Vec<String> =
        serde_json::from_str::<Value>(&body).unwrap().as_array().unwrap().iter().map(|i| i["id"].as_str().unwrap().to_string()).collect();
    assert_eq!((status, off, ids), (200, true, vec!["recipe:signed".to_string()]), "the signed recipe stays; the code widget is hidden");
    assert_eq!(ask(port, "GET", "/api/widgets/ext.test.clock/widget.js", "", "").await.0, 404);
    assert_eq!(ask(port, "GET", "/api/widgets/recipe.signed/recipe.json", "", "").await.0, 200);
    let files: Vec<Value> = ["manifest.json", "widget.js"]
        .iter()
        .map(|p| json!({ "path": p, "data": STANDARD.encode(std::fs::read(fixtures().join("ext.test.clock").join(p)).unwrap()) }))
        .collect();
    let write = "Content-Type: application/json\r\nX-Dashboard-Widget: 1\r\n";
    let (status, _, body) = ask(port, "POST", "/api/widgets", write, &json!({ "files": files }).to_string()).await;
    assert_eq!((status, body.as_str()), (403, "code widgets are off (USER_CODE_WIDGETS=off)"));
    let _ = stop.send(());
    tokio::time::timeout(Duration::from_secs(5), done).await.unwrap().unwrap();
}
