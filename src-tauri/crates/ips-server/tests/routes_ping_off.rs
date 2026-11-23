// The ping switch (PING=off) over a real socket: with a Ping placement stored, nothing is probed, the stream is an empty set
// and says `X-Ping: off`. Its own test binary: the variable is process-wide.

use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::Arc;
use std::time::Duration;

use ips_server::{bind_with_home, ServerConfig};
use serde_json::json;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::{TcpListener, TcpStream};
use tokio::sync::oneshot;

#[tokio::test]
async fn off_probes_nothing_and_streams_an_empty_set() {
    let target = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let open = target.local_addr().unwrap().port();
    let connects = Arc::new(AtomicUsize::new(0));
    let counted = Arc::clone(&connects);
    tokio::spawn(async move {
        while let Ok((_stream, _)) = target.accept().await {
            counted.fetch_add(1, Ordering::SeqCst);
        }
    });
    std::env::set_var("PING", "off");
    let dir = tempfile::tempdir().unwrap();
    std::fs::create_dir_all(dir.path().join("dist")).unwrap();
    let data = dir.path().join("data");
    std::fs::create_dir_all(&data).unwrap();
    std::fs::write(data.join("config.json"), json!({ "profiles": [{ "placements": [{ "module": "Ping", "settings": { "host": "127.0.0.1", "port": open } }] }] }).to_string()).unwrap();
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
        data_dir: data,
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
    tokio::time::sleep(Duration::from_millis(1500)).await;

    let mut stream = TcpStream::connect(("127.0.0.1", port)).await.unwrap();
    stream.write_all(format!("GET /events/ping HTTP/1.1\r\nHost: 127.0.0.1:{port}\r\n\r\n").as_bytes()).await.unwrap();
    let mut raw = Vec::new();
    let mut buf = [0u8; 4096];
    let text = loop {
        let n = tokio::time::timeout(Duration::from_secs(5), stream.read(&mut buf)).await.unwrap().unwrap();
        raw.extend_from_slice(&buf[..n]);
        let text = String::from_utf8_lossy(&raw).into_owned();
        if n == 0 || (text.contains("data: ") && text.contains("\n\n")) {
            break text;
        }
    };
    assert!(text.to_ascii_lowercase().contains("x-ping: off"));
    let data = text.split("data: ").nth(1).unwrap().split("\n\n").next().unwrap();
    assert_eq!(serde_json::from_str::<serde_json::Value>(data).unwrap()["sensors"], json!({}));
    assert_eq!(connects.load(Ordering::SeqCst), 0, "nothing was probed");

    let _ = stop.send(());
    let _ = done.await;
}
