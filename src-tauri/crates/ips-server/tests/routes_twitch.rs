// The Twitch routes over a real socket (/api/twitch/signin and /signout, /api/chat, /events/chat, /api/chat/send): a server on
// a free port with a temp data folder. `bind_with_home` gives it a Twitch it cannot reach, so nothing here contacts Twitch:
// a sign-in is turned away with 502 and a send finds no chat connected with 503. The sign-in and the chat themselves are
// tested against fake servers in src/twitch/tests.rs.

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
    start_with(None).await
}

/// A server whose integrations file already holds `seed`.
async fn start_with(seed: Option<&str>) -> Server {
    let dir = tempfile::tempdir().unwrap();
    let cfg = config(dir.path());
    if let Some(seed) = seed {
        std::fs::create_dir_all(&cfg.data_dir).unwrap();
        std::fs::write(cfg.data_dir.join("integrations.json"), seed).unwrap();
    }
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

async fn post(port: u16, path: &str, body: &str) -> Reply {
    send(port, "POST", path, &WRITE, body).await
}

fn json_of(reply: &Reply) -> serde_json::Value {
    serde_json::from_slice(&reply.body).unwrap()
}

/// What a stream sends first: the text up to the end of its first event.
async fn first_event(port: u16, path: &str) -> String {
    let mut stream = TcpStream::connect(("127.0.0.1", port)).await.unwrap();
    stream
        .write_all(format!("GET {path} HTTP/1.1\r\nHost: localhost:{port}\r\n\r\n").as_bytes())
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
    seen
}

#[tokio::test]
async fn guards_the_writes_the_same_way_as_the_other_control_routes() {
    let s = start().await;
    for path in [
        "/api/twitch/signin",
        "/api/twitch/signout",
        "/api/chat/send",
    ] {
        // The sign-in's GET is the pending code, for this machine.
        if path != "/api/twitch/signin" {
            assert_eq!(
                send(s.port, "GET", path, &[], "").await.status,
                405,
                "{path}"
            );
        }
        assert_eq!(
            send(s.port, "PUT", path, &WRITE, "{}").await.status,
            405,
            "{path}"
        );
        assert_eq!(
            send(s.port, "POST", path, &[("X-Dashboard-Control", "1")], "{}")
                .await
                .status,
            415,
            "{path}"
        );
        assert_eq!(
            send(
                s.port,
                "POST",
                path,
                &[("Content-Type", "application/json")],
                "{}"
            )
            .await
            .status,
            403,
            "{path}"
        );
        let wrong = [
            ("Content-Type", "application/json"),
            ("X-Dashboard-Control", "0"),
        ];
        assert_eq!(
            send(s.port, "POST", path, &wrong, "{}").await.status,
            403,
            "{path}"
        );
    }
    s.stop().await;
}

#[tokio::test]
async fn a_sign_in_that_cannot_reach_twitch_says_so_and_sign_out_always_answers() {
    let s = start().await;
    let reply = post(s.port, "/api/twitch/signin", "{}").await;
    assert_eq!(reply.status, 502);
    assert!(String::from_utf8_lossy(&reply.body).contains("couldn't reach Twitch"));
    // Nothing was left half-started.
    assert_eq!(post(s.port, "/api/twitch/signin", "").await.status, 502);
    assert_eq!(post(s.port, "/api/twitch/signout", "{}").await.status, 204);
    let extras = json_of(&send(s.port, "GET", "/api/extras", &[], "").await);
    assert_eq!(
        extras["twitch"],
        serde_json::json!({ "configured": true, "signedIn": false, "login": "", "channel": "", "pending": false, "error": null, "connected": false, "live": false, "viewers": 0 })
    );
    s.stop().await;
}

#[tokio::test]
async fn validates_a_chat_send_before_it_looks_for_a_connection() {
    let s = start().await;
    for bad in [
        "".to_string(),
        "nope".into(),
        "[]".into(),
        "{}".into(),
        r#"{"text":"hi"}"#.into(),
        r#"{"platform":"mixer","text":"hi"}"#.into(),
        r#"{"platform":"twitch"}"#.into(),
        r#"{"platform":"twitch","text":5}"#.into(),
        r#"{"platform":"twitch","text":"   "}"#.into(),
        r#"{"platform":"twitch","text":"a\nb"}"#.into(),
        format!(r#"{{"platform":"twitch","text":"{}"}}"#, "x".repeat(501)),
        format!(r#"{{"platform":"twitch","text":"{}"}}"#, "x".repeat(8000)),
    ] {
        let reply = post(s.port, "/api/chat/send", &bad).await;
        assert_eq!(reply.status, 400, "{}", &bad[..bad.len().min(60)]);
    }
    let reply = post(
        s.port,
        "/api/chat/send",
        r#"{"platform":"twitch","text":"hello"}"#,
    )
    .await;
    assert_eq!(
        (reply.status, String::from_utf8_lossy(&reply.body).as_ref()),
        (503, "Twitch chat isn't connected.")
    );
    s.stop().await;
}

#[tokio::test]
async fn serves_the_chat_as_json_and_as_a_stream() {
    let s = start().await;
    let reply = send(s.port, "GET", "/api/chat", &[], "").await;
    assert_eq!(reply.status, 200);
    assert_eq!(
        json_of(&reply),
        serde_json::json!({ "messages": [], "platforms": { "twitch": { "connected": false, "channel": "" } } })
    );
    assert_eq!(
        send(s.port, "POST", "/api/chat", &WRITE, "{}").await.status,
        405
    );
    let seen = first_event(s.port, "/events/chat").await;
    assert!(seen.starts_with("HTTP/1.1 200"), "{seen}");
    assert!(seen
        .to_ascii_lowercase()
        .contains("content-type: text/event-stream\r\n"));
    assert!(
        seen.contains(
            r#"data: {"messages":[],"platforms":{"twitch":{"connected":false,"channel":""}}}"#
        ),
        "{seen}"
    );
    s.stop().await;
}

#[tokio::test]
async fn never_shows_a_stored_sign_in_to_the_studio_a_kiosk_or_a_stream() {
    let seed = r#"{"obs":{"host":"","port":4455,"password":""},"calendar":{"links":[]},"streaming":{"obs":{"mic":"","scenes":{}},"twitch":{"channel":"friend","access_token":"SECRET-ACCESS","refresh_token":"SECRET-REFRESH","expires_at":4102444800000,"login":"streamer","user_id":"5"}}}"#;
    let s = start_with(Some(seed)).await;
    let integrations = send(s.port, "GET", "/api/integrations", &[], "").await;
    assert_eq!(
        json_of(&integrations)["streaming"]["twitch"],
        serde_json::json!({ "channel": "friend", "login": "streamer" })
    );
    let extras = send(s.port, "GET", "/api/extras", &[], "").await;
    let twitch = json_of(&extras)["twitch"].clone();
    assert_eq!(
        (
            twitch["signedIn"].as_bool(),
            twitch["login"].as_str(),
            twitch["channel"].as_str()
        ),
        (Some(true), Some("streamer"), Some("friend"))
    );
    let chat = send(s.port, "GET", "/api/chat", &[], "").await;
    let streams = [
        first_event(s.port, "/events/chat").await,
        first_event(s.port, "/events/extras").await,
    ];
    let saved = send(
        s.port,
        "PUT",
        "/api/integrations",
        &[
            ("Content-Type", "application/json"),
            ("X-Dashboard-Config", "1"),
        ],
        r#"{"streaming":{"twitch":{"channel":"other","access_token":"EVIL"}}}"#,
    )
    .await;
    assert_eq!(saved.status, 200);
    let everything = [
        integrations.body,
        extras.body,
        chat.body,
        saved.body,
        streams[0].clone().into_bytes(),
        streams[1].clone().into_bytes(),
    ];
    for body in everything {
        let text = String::from_utf8_lossy(&body);
        assert!(!text.contains("SECRET") && !text.contains("EVIL"), "{text}");
    }
    // The studio's patch moved the channel and not the tokens.
    let file =
        std::fs::read_to_string(s.dir.path().join("data").join("integrations.json")).unwrap();
    assert!(
        file.contains("SECRET-ACCESS")
            && file.contains("\"channel\": \"other\"")
            && !file.contains("EVIL"),
        "{file}"
    );
    s.stop().await;
}

#[tokio::test]
async fn shows_the_pending_sign_in_to_this_machine_only_through_its_own_route() {
    let s = start().await;
    let reply = send(s.port, "GET", "/api/twitch/signin", &[], "").await;
    assert_eq!(reply.status, 200);
    assert_eq!(
        json_of(&reply),
        serde_json::json!({ "pending": null, "error": null })
    );
    // The kiosks' extras say only that one is pending, never its code.
    let extras = json_of(&send(s.port, "GET", "/api/extras", &[], "").await);
    assert_eq!(extras["twitch"]["pending"], false);
    s.stop().await;
}
