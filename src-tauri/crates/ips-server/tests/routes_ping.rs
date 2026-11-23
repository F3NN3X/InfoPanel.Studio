// Ping over a real socket: a server whose stored config has Ping placements, one aimed at a local listener, and raw HTTP/1.1.
// Checks that the named host is probed and streamed in the Data API's shape under the asked prefix, that the stream names
// no host the config does not (a request never picks a target), and that a write is refused. Nothing here leaves this
// computer.

use std::time::Duration;

use ips_server::{bind_with_home, ServerConfig};
use serde_json::{json, Value};
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::{TcpListener, TcpStream};
use tokio::sync::oneshot;

/// The first event of a stream whose `sensors` satisfy `ready`, parsed, and the stream's head.
async fn event_where(port: u16, path: &str, ready: impl Fn(&Value) -> bool) -> (String, Value) {
    let mut stream = TcpStream::connect(("127.0.0.1", port)).await.unwrap();
    stream.write_all(format!("GET {path} HTTP/1.1\r\nHost: 127.0.0.1:{port}\r\n\r\n").as_bytes()).await.unwrap();
    let mut raw = Vec::new();
    let mut buf = [0u8; 8192];
    let deadline = tokio::time::Instant::now() + Duration::from_secs(10);
    loop {
        let n = tokio::time::timeout_at(deadline, stream.read(&mut buf)).await.expect("no event in time").unwrap();
        raw.extend_from_slice(&buf[..n]);
        let text = String::from_utf8_lossy(&raw).into_owned();
        let head = text.split("\r\n\r\n").next().unwrap().to_ascii_lowercase();
        for data in text.split("data: ").skip(1).filter(|d| d.contains("\n\n")).filter_map(|d| d.split("\n\n").next()) {
            let event: Value = serde_json::from_str(data).unwrap();
            if ready(&event["sensors"]) {
                return (head, event);
            }
        }
        assert!(n > 0, "the stream closed first");
    }
}

async fn status_of(port: u16, method: &str, path: &str) -> u16 {
    let mut stream = TcpStream::connect(("127.0.0.1", port)).await.unwrap();
    let request = format!("{method} {path} HTTP/1.1\r\nConnection: close\r\nHost: 127.0.0.1:{port}\r\nContent-Length: 0\r\n\r\n");
    stream.write_all(request.as_bytes()).await.unwrap();
    let mut raw = Vec::new();
    tokio::time::timeout(Duration::from_secs(5), stream.read_to_end(&mut raw)).await.unwrap().unwrap();
    String::from_utf8_lossy(&raw).split(' ').nth(1).unwrap().parse().unwrap()
}

#[tokio::test]
async fn probes_the_named_host_and_streams_its_readings() {
    // The target: a listener that stays open. The second placement names a port nothing listens on.
    let target = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let open = target.local_addr().unwrap().port();
    let closed = {
        let l = TcpListener::bind("127.0.0.1:0").await.unwrap();
        l.local_addr().unwrap().port()
    };
    let dir = tempfile::tempdir().unwrap();
    std::fs::create_dir_all(dir.path().join("dist")).unwrap();
    let data = dir.path().join("data");
    std::fs::create_dir_all(&data).unwrap();
    let config = json!({ "version": 19, "profiles": [{ "id": "p", "placements": [
        { "id": "a", "module": "Ping", "settings": { "host": "127.0.0.1", "port": open, "interval": 2 } },
        { "id": "b", "module": "Ping", "settings": { "host": "127.0.0.1", "port": closed, "interval": 2 } },
        { "id": "c", "module": "Weather", "settings": { "host": "192.0.2.1" } }
    ] }] });
    std::fs::write(data.join("config.json"), config.to_string()).unwrap();
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

    let up = format!("ping.127-0-0-1-{open}.");
    let down = format!("ping.127-0-0-1-{closed}.");
    let both = |s: &Value| s[format!("{up}status")]["text"] == "ok" && s[format!("{down}status")]["text"] == "down";
    let (head, event) = event_where(port, "/events/ping?prefix=ping.&interval=1000", both).await;
    assert!(head.contains("content-type: text/event-stream") && !head.contains("x-ping"));
    let sensors = event["sensors"].as_object().unwrap();
    assert!(sensors[&format!("{up}ms")]["value"].as_f64().is_some_and(|ms| ms >= 0.0));
    assert_eq!(sensors[&format!("{up}ms")]["unit"], "ms");
    assert_eq!(sensors[&format!("{up}loss")]["value"], 0.0);
    assert_eq!(sensors[&format!("{down}loss")]["value"], 100.0);
    assert!(!sensors.contains_key(&format!("{down}ms")), "no time for a host that did not answer");
    assert!(sensors.keys().all(|k| k.starts_with(&up) || k.starts_with(&down)), "only the hosts a Ping placement names");

    // A prefix narrows the stream; one outside ping. reads the namespace; no endpoint takes a host from a request.
    let only_up = |s: &Value| s[format!("{up}status")]["text"] == "ok";
    let (_, narrow) = event_where(port, &format!("/events/ping?prefix={up}"), only_up).await;
    assert!(narrow["sensors"].as_object().unwrap().keys().all(|k| k.starts_with(&up)));
    let (_, wide) = event_where(port, "/events/ping?prefix=plugins.", both).await;
    assert!(wide["sensors"].as_object().unwrap().len() >= 2);
    assert_eq!(status_of(port, "GET", "/api/ping").await, 404);

    let _ = stop.send(());
    let _ = done.await;
    drop(target);
}
