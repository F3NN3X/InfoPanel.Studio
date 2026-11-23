// The weather switch (WEATHER=off) over a real socket: with places referenced and a fake provider named, nothing is fetched, the
// stream is an empty set, place search is refused, and every answer says `X-Weather: off`. Its own test binary: the variables
// are process-wide.

use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::Arc;
use std::time::Duration;

use ips_server::{bind_with_home, ServerConfig};
use serde_json::json;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::{TcpListener, TcpStream};
use tokio::sync::oneshot;

async fn ask(port: u16, path: &str, until_data: bool) -> (u16, String) {
    let mut stream = TcpStream::connect(("127.0.0.1", port)).await.unwrap();
    let close = if until_data { "" } else { "Connection: close\r\n" };
    stream.write_all(format!("GET {path} HTTP/1.1\r\n{close}Host: 127.0.0.1:{port}\r\n\r\n").as_bytes()).await.unwrap();
    let mut raw = Vec::new();
    let mut buf = [0u8; 4096];
    loop {
        let n = tokio::time::timeout(Duration::from_secs(5), stream.read(&mut buf)).await.unwrap().unwrap();
        raw.extend_from_slice(&buf[..n]);
        let text = String::from_utf8_lossy(&raw).into_owned();
        if n == 0 || (until_data && text.contains("\n\n") && text.contains("data: ")) {
            return (text.split(' ').nth(1).unwrap().parse().unwrap(), text);
        }
    }
}

#[tokio::test]
async fn off_fetches_nothing_streams_an_empty_set_and_refuses_search() {
    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let base = format!("http://127.0.0.1:{}", listener.local_addr().unwrap().port());
    let calls = Arc::new(AtomicUsize::new(0));
    let counted = Arc::clone(&calls);
    tokio::spawn(async move {
        while let Ok((_stream, _)) = listener.accept().await {
            counted.fetch_add(1, Ordering::SeqCst);
        }
    });
    std::env::set_var("WEATHER", "off");
    std::env::set_var("WEATHER_BASE_URL", &base);
    let dir = tempfile::tempdir().unwrap();
    std::fs::create_dir_all(dir.path().join("dist")).unwrap();
    let data = dir.path().join("data");
    std::fs::create_dir_all(data.join("widgets").join("recipe.wx")).unwrap();
    std::fs::write(
        data.join("widgets/recipe.wx/recipe.json"),
        json!({ "options": [{ "key": "places", "type": "place-list", "default": [{ "name": "Oslo", "lat": 59.91, "lon": 10.75 }] }] })
            .to_string(),
    )
    .unwrap();
    std::fs::write(data.join("config.json"), json!({ "profiles": [{ "placements": [{ "module": "recipe:wx" }] }] }).to_string()).unwrap();
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

    let (code, text) = ask(port, "/api/weather", false).await;
    assert_eq!(code, 200);
    assert!(text.to_ascii_lowercase().contains("x-weather: off") && text.contains(r#""enabled":false"#) && text.contains(r#""places":[]"#));
    let (code, text) = ask(port, "/api/weather/places?q=Oslo", false).await;
    assert_eq!(code, 403);
    assert!(text.to_ascii_lowercase().contains("x-weather: off"));
    let (code, text) = ask(port, "/events/weather?prefix=weather.", true).await;
    assert_eq!(code, 200);
    assert!(text.to_ascii_lowercase().contains("x-weather: off"));
    assert!(text.contains(r#""sensors":{}"#), "an empty set: {text}");
    tokio::time::sleep(Duration::from_millis(200)).await;
    assert_eq!(calls.load(Ordering::SeqCst), 0, "the provider was never asked");

    let _ = stop.send(());
    tokio::time::timeout(Duration::from_secs(5), done).await.unwrap().unwrap();
}
