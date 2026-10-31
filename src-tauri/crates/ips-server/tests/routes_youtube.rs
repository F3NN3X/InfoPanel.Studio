// The YouTube routes over a real socket (/api/youtube/signin, /signout and /callback, and a YouTube chat send): a server on a
// free port with a temp data folder. `bind_with_home` gives it a Google it cannot reach, so nothing here contacts Google: the
// code exchange of a sign-in fails with 502. The exchange, the refresh and the live chat themselves are tested against fake
// servers in src/youtube/tests.rs.

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
    /// The status line and headers.
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
    let head = String::from_utf8_lossy(&raw[..split]).into_owned();
    let status = head.split(' ').nth(1).unwrap().parse().unwrap();
    let chunked = head
        .to_ascii_lowercase()
        .contains("transfer-encoding: chunked");
    let rest = &raw[split + 4..];
    Reply {
        status,
        head: head.clone(),
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

const CONFIG: [(&str, &str); 2] = [
    ("Content-Type", "application/json"),
    ("X-Dashboard-Config", "1"),
];

async fn put_integrations(port: u16, body: &str) -> Reply {
    send(port, "PUT", "/api/integrations", &CONFIG, body).await
}

fn text_of(reply: &Reply) -> String {
    String::from_utf8_lossy(&reply.body).into_owned()
}

/// A server whose integrations hold a Google client.
async fn with_client() -> Server {
    let s = start().await;
    assert_eq!(
        put_integrations(
            s.port,
            r#"{"streaming":{"youtube":{"client_id":"cid.apps","client_secret":"SECRET-CS"}}}"#
        )
        .await
        .status,
        200
    );
    s
}

fn query_of(url: &str) -> std::collections::HashMap<String, String> {
    url::Url::parse(url)
        .unwrap()
        .query_pairs()
        .into_owned()
        .collect()
}

/// What a sign-in's address says (`authUrl` of its POST answer).
fn auth_url(reply: &Reply) -> String {
    json_of(reply)["authUrl"].as_str().unwrap().to_string()
}

#[tokio::test]
async fn guards_the_writes_the_same_way_as_the_other_control_routes() {
    let s = start().await;
    for path in ["/api/youtube/signin", "/api/youtube/signout"] {
        // The sign-in's GET is the pending sign-in, for this machine.
        if path != "/api/youtube/signin" {
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
    assert_eq!(
        send(s.port, "POST", "/api/youtube/callback", &WRITE, "{}")
            .await
            .status,
        405
    );
    s.stop().await;
}

#[tokio::test]
async fn starts_a_sign_in_on_the_servers_own_port_once_a_client_is_entered() {
    let s = start().await;
    let reply = post(s.port, "/api/youtube/signin", "{}").await;
    assert_eq!(
        (reply.status, text_of(&reply).as_str()),
        (400, "Enter the Client ID and the client secret first.")
    );

    // Saving the client: the studio sees only that it is set.
    let saved = put_integrations(s.port, r#"{"streaming":{"youtube":{"client_id":"cid.apps","client_secret":"SECRET-CS","chat_interval":20}}}"#).await;
    assert_eq!(saved.status, 200);
    assert_eq!(
        json_of(&saved)["streaming"]["youtube"],
        serde_json::json!({ "clientConfigured": true, "channel": "", "chatInterval": 20 })
    );
    assert!(!text_of(&saved).contains("cid.apps") && !text_of(&saved).contains("SECRET"));
    assert_eq!(
        put_integrations(s.port, r#"{"streaming":{"youtube":{"chat_interval":7}}}"#)
            .await
            .status,
        400
    );

    let reply = post(s.port, "/api/youtube/signin", "{}").await;
    assert_eq!(reply.status, 200);
    let url = auth_url(&reply);
    let q = query_of(&url);
    assert!(
        url.starts_with("http://127.0.0.1:9/"),
        "a server with no backends is pointed at an address nothing answers on: {url}"
    );
    assert_eq!(
        q["redirect_uri"],
        format!("http://127.0.0.1:{}/api/youtube/callback", s.port)
    );
    assert_eq!(
        (
            q["client_id"].as_str(),
            q["code_challenge_method"].as_str(),
            q["response_type"].as_str()
        ),
        ("cid.apps", "S256", "code")
    );
    assert_eq!(
        q["scope"],
        "https://www.googleapis.com/auth/youtube.force-ssl"
    );
    assert!(q["state"].len() >= 43 && q["code_challenge"].len() == 43);
    assert_eq!(
        post(s.port, "/api/youtube/signin", "{}").await.status,
        409,
        "one at a time"
    );

    // The pending address is for this machine; the extras (every kiosk reads them) say only that one is pending.
    let pending = json_of(&send(s.port, "GET", "/api/youtube/signin", &[], "").await);
    assert_eq!(pending["pending"]["auth_url"], url);
    let extras = send(s.port, "GET", "/api/extras", &[], "").await;
    assert_eq!(json_of(&extras)["youtube"]["pending"], true);
    assert!(!text_of(&extras).contains(&q["state"]) && !text_of(&extras).contains("cid.apps"));

    // Cancelling ends it, and a new one can start.
    assert_eq!(post(s.port, "/api/youtube/signout", "{}").await.status, 204);
    assert_eq!(
        json_of(&send(s.port, "GET", "/api/youtube/signin", &[], "").await)["pending"],
        serde_json::Value::Null
    );
    assert_eq!(post(s.port, "/api/youtube/signin", "{}").await.status, 200);
    s.stop().await;
}

#[tokio::test]
async fn the_callback_takes_only_the_state_it_issued_and_answers_with_a_safe_page() {
    let s = with_client().await;
    let state =
        query_of(&auth_url(&post(s.port, "/api/youtube/signin", "{}").await))["state"].clone();

    for bad in [
        "/api/youtube/callback",
        "/api/youtube/callback?code=c",
        "/api/youtube/callback?code=c&state=wrong",
        "/api/youtube/callback?error=access_denied&state=wrong",
    ] {
        let reply = send(s.port, "GET", bad, &[], "").await;
        assert_eq!(reply.status, 400, "{bad}");
        assert!(
            text_of(&reply).contains("isn&#39;t valid") || text_of(&reply).contains("isn't valid")
        );
    }
    // The wrong ones left the real sign-in alone.
    assert_eq!(
        json_of(&send(s.port, "GET", "/api/extras", &[], "").await)["youtube"]["pending"],
        true
    );

    // The page is self-contained and carries this server's security headers.
    let declined = send(
        s.port,
        "GET",
        &format!("/api/youtube/callback?error=access_denied&state={state}"),
        &[],
        "",
    )
    .await;
    assert_eq!(declined.status, 200);
    let head = declined.head.to_ascii_lowercase();
    assert!(head.contains("content-type: text/html"), "{head}");
    assert!(
        head.contains("content-security-policy: default-src 'self'")
            && head.contains("x-content-type-options: nosniff")
            && head.contains("cache-control: no-store"),
        "{head}"
    );
    let html = text_of(&declined);
    assert!(
        html.contains("access_denied")
            && !html.contains("<script")
            && !html.contains("http://")
            && !html.contains("https://"),
        "{html}"
    );
    assert_eq!(
        json_of(&send(s.port, "GET", "/api/extras", &[], "").await)["youtube"]["pending"],
        false
    );
    // The state works once: it is gone now.
    let again = send(
        s.port,
        "GET",
        &format!("/api/youtube/callback?error=access_denied&state={state}"),
        &[],
        "",
    )
    .await;
    assert_eq!(again.status, 400);

    // A good state with a code goes on to Google, which this server can't reach: the page says so.
    let state =
        query_of(&auth_url(&post(s.port, "/api/youtube/signin", "{}").await))["state"].clone();
    let failed = send(
        s.port,
        "GET",
        &format!("/api/youtube/callback?code=c&state={state}"),
        &[],
        "",
    )
    .await;
    assert_eq!(failed.status, 502);
    assert!(
        text_of(&failed).contains("reach Google"),
        "{}",
        text_of(&failed)
    );
    let status = json_of(&send(s.port, "GET", "/api/extras", &[], "").await)["youtube"].clone();
    assert_eq!(
        (status["signedIn"].as_bool(), status["pending"].as_bool()),
        (Some(false), Some(false))
    );
    assert!(status["error"].as_str().unwrap().contains("reach Google"));
    s.stop().await;
}

#[tokio::test]
async fn validates_a_chat_send_to_youtube_before_it_looks_for_a_live_chat() {
    let s = start().await;
    for bad in [
        r#"{"platform":"youtube"}"#.to_string(),
        r#"{"platform":"youtube","text":5}"#.into(),
        r#"{"platform":"youtube","text":"   "}"#.into(),
        r#"{"platform":"youtube","text":"a\nb"}"#.into(),
        format!(r#"{{"platform":"youtube","text":"{}"}}"#, "x".repeat(201)),
        r#"{"platform":"mixer","text":"hi"}"#.into(),
    ] {
        assert_eq!(
            post(s.port, "/api/chat/send", &bad).await.status,
            400,
            "{}",
            &bad[..bad.len().min(60)]
        );
    }
    // Twitch allows 500 characters; YouTube 200.
    let long = format!(r#"{{"platform":"twitch","text":"{}"}}"#, "x".repeat(201));
    assert_eq!(
        post(s.port, "/api/chat/send", &long).await.status,
        503,
        "past 200 it is only Twitch's missing connection that refuses"
    );
    let reply = post(
        s.port,
        "/api/chat/send",
        r#"{"platform":"youtube","text":"hello"}"#,
    )
    .await;
    assert_eq!(
        (reply.status, text_of(&reply).as_str()),
        (503, "YouTube chat isn't live.")
    );
    s.stop().await;
}

#[tokio::test]
async fn never_shows_a_stored_client_or_sign_in_to_the_studio_a_kiosk_or_a_stream() {
    let seed = r#"{"obs":{"host":"","port":4455,"password":""},"calendar":{"links":[]},"streaming":{"obs":{"mic":"","scenes":{}},"youtube":{"client_id":"SECRET-ID","client_secret":"SECRET-CS","chat_interval":10,"access_token":"SECRET-ACCESS","refresh_token":"SECRET-REFRESH","expires_at":4102444800000,"channel":"My Channel","channel_id":"UC1"}}}"#;
    let s = start_with(Some(seed)).await;
    let integrations = send(s.port, "GET", "/api/integrations", &[], "").await;
    assert_eq!(
        json_of(&integrations)["streaming"]["youtube"],
        serde_json::json!({ "clientConfigured": true, "channel": "My Channel", "chatInterval": 10 })
    );
    let extras = send(s.port, "GET", "/api/extras", &[], "").await;
    let youtube = json_of(&extras)["youtube"].clone();
    assert_eq!(
        (
            youtube["clientConfigured"].as_bool(),
            youtube["signedIn"].as_bool(),
            youtube["channel"].as_str()
        ),
        (Some(true), Some(true), Some("My Channel"))
    );
    let chat = send(s.port, "GET", "/api/chat", &[], "").await;
    assert_eq!(
        json_of(&chat)["platforms"]["youtube"],
        serde_json::json!({ "connected": false, "channel": "My Channel" })
    );
    let streams = [
        first_event(s.port, "/events/chat").await,
        first_event(s.port, "/events/extras").await,
    ];
    // A patch that tries the tokens moves nothing but the interval.
    let saved = put_integrations(
        s.port,
        r#"{"streaming":{"youtube":{"chat_interval":20,"access_token":"EVIL","channel":"EVIL"}}}"#,
    )
    .await;
    assert_eq!(saved.status, 200);
    for body in [
        integrations.body,
        extras.body,
        chat.body,
        saved.body,
        streams[0].clone().into_bytes(),
        streams[1].clone().into_bytes(),
    ] {
        let text = String::from_utf8_lossy(&body);
        assert!(!text.contains("SECRET") && !text.contains("EVIL"), "{text}");
    }
    let file =
        std::fs::read_to_string(s.dir.path().join("data").join("integrations.json")).unwrap();
    assert!(
        file.contains("SECRET-ACCESS")
            && file.contains("SECRET-CS")
            && file.contains("\"chat_interval\": 20")
            && !file.contains("EVIL"),
        "{file}"
    );

    // Another client ends the sign-in: its tokens leave the file and the status.
    assert_eq!(
        put_integrations(
            s.port,
            r#"{"streaming":{"youtube":{"client_id":"other","client_secret":"other-secret"}}}"#
        )
        .await
        .status,
        200
    );
    let file =
        std::fs::read_to_string(s.dir.path().join("data").join("integrations.json")).unwrap();
    assert!(
        !file.contains("SECRET-ACCESS") && !file.contains("SECRET-REFRESH"),
        "{file}"
    );
    let youtube = json_of(&send(s.port, "GET", "/api/extras", &[], "").await)["youtube"].clone();
    assert_eq!(
        (youtube["signedIn"].as_bool(), youtube["channel"].as_str()),
        (Some(false), Some(""))
    );
    s.stop().await;
}
