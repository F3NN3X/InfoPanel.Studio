// The Stream Deck routes over a real socket (/api/streamdeck, /events/streamdeck, /api/streamdeck/icon,
// /api/streamdeck/act): a server on a free port with a temp data folder. `bind_with_home` gives it no Stream Deck app
// to reach, so nothing here contacts the real one: with the connection on, every device reports the app absent. The
// sessions themselves are tested against a fake app in src/streamdeck/tests.rs.

use std::path::Path;
use std::time::Duration;

use ips_server::{bind_with_home, ServerConfig};
use serde_json::{json, Value};
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
    head: String,
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
    let head = String::from_utf8_lossy(&raw[..split]).to_ascii_lowercase();
    let status = head.split(' ').nth(1).unwrap().parse().unwrap();
    let rest = &raw[split + 4..];
    let body = if head.contains("transfer-encoding: chunked") {
        dechunk(rest)
    } else {
        rest.to_vec()
    };
    Reply { status, head, body }
}

const WRITE: [(&str, &str); 2] = [
    ("Content-Type", "application/json"),
    ("X-Dashboard-Control", "1"),
];

async fn act(port: u16, body: &str) -> Reply {
    send(port, "POST", "/api/streamdeck/act", &WRITE, body).await
}

async fn state(port: u16) -> Value {
    let reply = send(port, "GET", "/api/streamdeck", &[], "").await;
    assert_eq!(reply.status, 200);
    serde_json::from_slice(&reply.body).unwrap()
}

async fn set_enabled(port: u16, on: bool) {
    let headers = [
        ("Content-Type", "application/json"),
        ("X-Dashboard-Config", "1"),
    ];
    let body = json!({ "streaming": { "streamdeck": { "enabled": on } } }).to_string();
    assert_eq!(
        send(port, "PUT", "/api/integrations", &headers, &body)
            .await
            .status,
        200
    );
}

#[tokio::test]
async fn answers_the_empty_state_and_streams_it_first() {
    let s = start().await;
    assert_eq!(
        state(s.port).await,
        json!({ "enabled": false, "pairingCode": "", "devices": [] })
    );
    assert_eq!(
        send(s.port, "POST", "/api/streamdeck", &WRITE, "{}")
            .await
            .status,
        405
    );
    let mut stream = TcpStream::connect(("127.0.0.1", s.port)).await.unwrap();
    stream
        .write_all(
            format!(
                "GET /events/streamdeck HTTP/1.1\r\nHost: localhost:{}\r\n\r\n",
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
    assert!(
        seen.to_ascii_lowercase()
            .contains("content-type: text/event-stream\r\n"),
        "{seen}"
    );
    assert!(
        seen.contains(r#"data: {"enabled":false,"pairingCode":"","devices":[]}"#),
        "{seen}"
    );
    s.stop().await;
}

#[tokio::test]
async fn guards_and_validates_an_action() {
    let s = start().await;
    let pair = r#"{"op":"pair"}"#;
    assert_eq!(
        send(s.port, "GET", "/api/streamdeck/act", &[], "")
            .await
            .status,
        405
    );
    assert_eq!(
        send(s.port, "PUT", "/api/streamdeck/act", &WRITE, pair)
            .await
            .status,
        405
    );
    assert_eq!(
        send(
            s.port,
            "POST",
            "/api/streamdeck/act",
            &[("X-Dashboard-Control", "1")],
            pair
        )
        .await
        .status,
        415
    );
    assert_eq!(
        send(
            s.port,
            "POST",
            "/api/streamdeck/act",
            &[("Content-Type", "application/json")],
            pair
        )
        .await
        .status,
        403
    );
    for bad in [
        "",
        "nope",
        "[]",
        r#"{"op":"explode"}"#,
        r#"{"op":"press","device":"d","index":64,"down":true}"#,
        r#"{"op":"rename","device":"d","name":""}"#,
    ] {
        assert_eq!(act(s.port, bad).await.status, 400, "{bad}");
    }
    assert_eq!(
        act(
            s.port,
            &format!(r#"{{"op":"create","name":"{}"}}"#, "x".repeat(8000))
        )
        .await
        .status,
        400,
        "too large"
    );
    // A device that isn't in the registry, and a connection that is off.
    assert_eq!(
        act(
            s.port,
            r#"{"op":"press","device":"nope","index":0,"down":true}"#
        )
        .await
        .status,
        404
    );
    assert_eq!(
        act(s.port, r#"{"op":"forget","device":"nope"}"#)
            .await
            .status,
        404
    );
    assert_eq!(act(s.port, pair).await.status, 503);
    s.stop().await;
}

#[tokio::test]
async fn keeps_a_registry_of_devices_and_never_shows_the_key() {
    let s = start().await;
    // Devices can be added while the connection is off; they show as off.
    let created = act(s.port, r#"{"op":"create"}"#).await;
    assert_eq!(created.status, 200);
    let id = serde_json::from_slice::<Value>(&created.body).unwrap()["id"]
        .as_str()
        .unwrap()
        .to_string();
    let press = format!(r#"{{"op":"press","device":"{id}","index":0,"down":true}}"#);
    assert_eq!(act(s.port, &press).await.status, 503);
    // A key off the device's 5 x 3 grid is refused whatever the connection does.
    let off_grid = format!(r#"{{"op":"press","device":"{id}","index":15,"down":true}}"#);
    assert_eq!(act(s.port, &off_grid).await.status, 400);
    let off = state(s.port).await;
    assert_eq!(
        off["devices"],
        json!([{ "id": id, "name": "IPStudio", "cols": 5, "rows": 3, "status": "off", "page": { "current": 0, "total": 0 }, "keys": [] }])
    );

    // On: a key is made and the pairing code shown; with no app to reach, the device reports it absent.
    set_enabled(s.port, true).await;
    let mut on = state(s.port).await;
    for _ in 0..100 {
        if on["devices"][0]["status"] == "absent" {
            break;
        }
        tokio::time::sleep(Duration::from_millis(20)).await;
        on = state(s.port).await;
    }
    assert_eq!(
        (&on["enabled"], &on["devices"][0]["status"]),
        (&json!(true), &json!("absent")),
        "{on}"
    );
    let code = on["pairingCode"].as_str().unwrap();
    assert!(
        code.len() == 6 && code.bytes().all(|b| b.is_ascii_hexdigit()),
        "{code}"
    );
    assert_eq!(act(s.port, &press).await.status, 503, "not open in the app");
    assert_eq!(
        act(
            s.port,
            &format!(r#"{{"op":"page","device":"{id}","to":"next"}}"#)
        )
        .await
        .status,
        503
    );
    assert_eq!(act(s.port, r#"{"op":"pair"}"#).await.status, 204);

    // The grid is clamped, a rename keeps the id, a second device gets the next free name.
    assert_eq!(
        act(
            s.port,
            &format!(r#"{{"op":"grid","device":"{id}","cols":12,"rows":0}}"#)
        )
        .await
        .status,
        204
    );
    assert_eq!(
        act(
            s.port,
            &format!(r#"{{"op":"rename","device":"{id}","name":"  Desk "}}"#)
        )
        .await
        .status,
        204
    );
    let second = act(s.port, r#"{"op":"create","cols":2,"rows":2}"#).await;
    let second = serde_json::from_slice::<Value>(&second.body).unwrap()["id"]
        .as_str()
        .unwrap()
        .to_string();
    assert_eq!(
        act(
            s.port,
            &format!(r#"{{"op":"rename","device":"{second}","name":"Desk"}}"#)
        )
        .await
        .status,
        400,
        "names stay unique"
    );
    let devices = state(s.port).await["devices"].clone();
    assert_eq!(
        (
            &devices[0]["id"],
            &devices[0]["name"],
            &devices[0]["cols"],
            &devices[0]["rows"]
        ),
        (&json!(id), &json!("Desk"), &json!(8), &json!(1))
    );
    assert_eq!(devices[1]["name"], "IPStudio");

    // The key is in the file only, not in the studio's view of the integrations or the state.
    let file =
        std::fs::read_to_string(s.dir.path().join("data").join("integrations.json")).unwrap();
    let stored: Value = serde_json::from_str(&file).unwrap();
    let key = stored["streaming"]["streamdeck"]["secret_key"]
        .as_str()
        .unwrap()
        .to_string();
    assert_eq!(key.len(), 64);
    let view = send(s.port, "GET", "/api/integrations", &[], "").await;
    let view_text = String::from_utf8(view.body).unwrap();
    assert!(
        !view_text.contains(&key) && view_text.contains(code),
        "{view_text}"
    );
    assert!(!state(s.port).await.to_string().contains(&key));
    // The studio can't write the key or the devices through the integrations patch.
    let headers = [
        ("Content-Type", "application/json"),
        ("X-Dashboard-Config", "1"),
    ];
    let evil =
        json!({ "streaming": { "streamdeck": { "secret_key": "0".repeat(64), "devices": [] } } })
            .to_string();
    assert_eq!(
        send(s.port, "PUT", "/api/integrations", &headers, &evil)
            .await
            .status,
        200
    );
    assert_eq!(state(s.port).await["devices"].as_array().unwrap().len(), 2);
    assert!(
        std::fs::read_to_string(s.dir.path().join("data").join("integrations.json"))
            .unwrap()
            .contains(&key)
    );
    let bad = json!({ "streaming": { "streamdeck": { "enabled": "yes" } } }).to_string();
    assert_eq!(
        send(s.port, "PUT", "/api/integrations", &headers, &bad)
            .await
            .status,
        400
    );

    // Forget drops a device (the app never had one for it); off again, the rest show as off.
    let forgot = act(s.port, &format!(r#"{{"op":"forget","device":"{second}"}}"#)).await;
    assert_eq!(forgot.status, 200);
    assert_eq!(
        serde_json::from_slice::<Value>(&forgot.body).unwrap(),
        json!({ "appDevice": "none" })
    );
    set_enabled(s.port, false).await;
    let after = state(s.port).await;
    assert_eq!(after["devices"].as_array().unwrap().len(), 1);
    assert_eq!(after["devices"][0]["status"], "off");
    s.stop().await;
}

#[tokio::test]
async fn serves_no_icon_it_does_not_have_and_never_caches_a_miss() {
    let s = start().await;
    for path in [
        "/api/streamdeck/icon",
        "/api/streamdeck/icon?device=d&index=0&v=abc",
        "/api/streamdeck/icon?device=d&index=x",
    ] {
        let reply = send(s.port, "GET", path, &[], "").await;
        assert_eq!(reply.status, 404, "{path}");
        assert!(
            reply.head.contains("cache-control: no-store"),
            "{path}: {}",
            reply.head
        );
    }
    assert_eq!(
        send(
            s.port,
            "POST",
            "/api/streamdeck/icon?device=d&index=0",
            &WRITE,
            "{}"
        )
        .await
        .status,
        405
    );
    s.stop().await;
}
