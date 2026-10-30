// The Twitch module against fake servers: an HTTP one standing in for id.twitch.tv and api.twitch.tv, a WebSocket one for
// the chat. Nothing here reaches the real Twitch.

use std::future::Future;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Duration;

use futures_util::{SinkExt, StreamExt};
use serde_json::{json, Value};
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::{TcpListener, TcpStream};
use tokio_tungstenite::tungstenite::Message as Ws;
use tokio_tungstenite::WebSocketStream;

use super::auth::Endpoints;
use super::*;
use crate::config::now_ms;

// ---- fakes ----

struct Request {
    path: String,
    head: String,
    body: String,
}

type Script = Arc<dyn Fn(&Request, usize) -> (u16, String) + Send + Sync>;

/// A fake HTTP server: `script(request, how many requests this path has had)` answers each one.
async fn http_fake(
    script: impl Fn(&Request, usize) -> (u16, String) + Send + Sync + 'static,
) -> (String, Arc<Mutex<Vec<Request>>>) {
    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let base = format!("http://{}", listener.local_addr().unwrap());
    let seen: Arc<Mutex<Vec<Request>>> = Arc::default();
    let script: Script = Arc::new(script);
    let log = Arc::clone(&seen);
    tokio::spawn(async move {
        loop {
            let Ok((mut stream, _)) = listener.accept().await else {
                return;
            };
            let (script, log) = (Arc::clone(&script), Arc::clone(&log));
            tokio::spawn(async move {
                let mut raw = Vec::new();
                let mut chunk = [0u8; 4096];
                let split = loop {
                    let n = stream.read(&mut chunk).await.unwrap_or(0);
                    if n == 0 {
                        return;
                    }
                    raw.extend_from_slice(&chunk[..n]);
                    if let Some(at) = raw.windows(4).position(|w| w == b"\r\n\r\n") {
                        break at;
                    }
                };
                let head = String::from_utf8_lossy(&raw[..split]).to_string();
                let length: usize = head
                    .to_ascii_lowercase()
                    .lines()
                    .find_map(|l| {
                        l.strip_prefix("content-length:")
                            .map(|v| v.trim().parse().unwrap_or(0))
                    })
                    .unwrap_or(0);
                while raw.len() < split + 4 + length {
                    let n = stream.read(&mut chunk).await.unwrap_or(0);
                    if n == 0 {
                        break;
                    }
                    raw.extend_from_slice(&chunk[..n]);
                }
                let body = String::from_utf8_lossy(&raw[(split + 4).min(raw.len())..]).to_string();
                let path = head.split(' ').nth(1).unwrap_or("").to_string();
                let request = Request {
                    path: path.clone(),
                    head,
                    body,
                };
                let (status, reply) = {
                    let mut log = log.lock().unwrap();
                    let nth = log.iter().filter(|r| r.path == path).count();
                    let answer = script(&request, nth);
                    log.push(request);
                    answer
                };
                let response = format!("HTTP/1.1 {status} X\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{reply}", reply.len());
                let _ = stream.write_all(response.as_bytes()).await;
            });
        }
    });
    (base, seen)
}

/// A fake chat server: `handler(connection number, socket)` runs for each connection.
async fn irc_fake<F, Fut>(handler: F) -> String
where
    F: Fn(usize, WebSocketStream<TcpStream>) -> Fut + Send + Sync + 'static,
    Fut: Future<Output = ()> + Send + 'static,
{
    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let url = format!("ws://{}", listener.local_addr().unwrap());
    tokio::spawn(async move {
        for n in 0.. {
            let Ok((stream, _)) = listener.accept().await else {
                return;
            };
            let Ok(socket) = tokio_tungstenite::accept_async(stream).await else {
                continue;
            };
            tokio::spawn(handler(n, socket));
        }
    });
    url
}

fn endpoints(base: &str, irc: &str) -> Endpoints {
    Endpoints {
        id: base.into(),
        api: base.into(),
        irc: irc.into(),
        poll_floor: Duration::from_millis(5),
        slow_down_step: Duration::from_millis(10),
        viewers_every: Duration::from_millis(40),
        ..Endpoints::twitch()
    }
}

struct Rig {
    twitch: Arc<Twitch>,
    saved: Arc<Mutex<Vec<TwitchAuth>>>,
    changes: Arc<AtomicUsize>,
}

fn rig(ep: Endpoints, settings: TwitchSettings) -> Rig {
    let saved: Arc<Mutex<Vec<TwitchAuth>>> = Arc::default();
    let changes = Arc::new(AtomicUsize::new(0));
    let twitch = Twitch::new(
        ep,
        GuardedClient::open(),
        settings,
        {
            let saved = Arc::clone(&saved);
            move |auth| saved.lock().unwrap().push(auth)
        },
        {
            let changes = Arc::clone(&changes);
            move || {
                changes.fetch_add(1, Ordering::SeqCst);
            }
        },
    );
    Rig {
        twitch,
        saved,
        changes,
    }
}

fn signed_in(login: &str, expires_in_ms: i64) -> TwitchSettings {
    TwitchSettings {
        channel: String::new(),
        auth: TwitchAuth {
            access_token: "old-access".into(),
            refresh_token: "old-refresh".into(),
            expires_at: now_ms() + expires_in_ms,
            login: login.into(),
            user_id: "7".into(),
        },
    }
}

async fn until(what: &str, mut cond: impl FnMut() -> bool) {
    for _ in 0..500 {
        if cond() {
            return;
        }
        tokio::time::sleep(Duration::from_millis(10)).await;
    }
    panic!("timed out waiting for {what}");
}

fn form_of(body: &str) -> Vec<(String, String)> {
    url::form_urlencoded::parse(body.as_bytes())
        .into_owned()
        .collect()
}

fn field(body: &str, key: &str) -> String {
    form_of(body)
        .into_iter()
        .find(|(k, _)| k == key)
        .map(|(_, v)| v)
        .unwrap_or_default()
}

fn device_reply(expires_in: u64) -> String {
    json!({ "device_code": "dev-1", "user_code": "ABCD-EFGH", "verification_uri": "https://www.twitch.tv/activate?public=true", "expires_in": expires_in, "interval": 0 }).to_string()
}

const TOKENS: &str = r#"{"access_token":"new-access","refresh_token":"new-refresh","expires_in":14000,"scope":["chat:read","chat:edit"],"token_type":"bearer"}"#;

fn no_secrets(value: &Value) {
    let text = value.to_string();
    for secret in [
        "old-access",
        "old-refresh",
        "new-access",
        "new-refresh",
        "dev-1",
    ] {
        assert!(!text.contains(secret), "{secret} leaked into {text}");
    }
}

// ---- sign-in ----

#[tokio::test]
async fn signs_in_through_pending_and_slow_down_and_keeps_the_tokens_out_of_what_kiosks_see() {
    let (base, seen) = http_fake(|r, nth| match r.path.as_str() {
        "/oauth2/device" => (200, device_reply(600)),
        "/oauth2/token" => match nth {
            0 => (
                400,
                r#"{"status":400,"message":"authorization_pending"}"#.into(),
            ),
            1 => (400, r#"{"status":400,"message":"slow_down"}"#.into()),
            _ => (200, TOKENS.into()),
        },
        "/helix/users" => (
            200,
            r#"{"data":[{"id":"99","login":"streamer","display_name":"Streamer"}]}"#.into(),
        ),
        _ => (404, "{}".into()),
    })
    .await;
    let rig = rig(
        endpoints(&base, "ws://127.0.0.1:9"),
        TwitchSettings::default(),
    );
    let code = rig.twitch.signin().await.unwrap();
    assert_eq!(
        (code.user_code.as_str(), code.expires_in),
        ("ABCD-EFGH", 600)
    );
    assert_eq!(
        rig.twitch.signin().await,
        Err(SigninError::Busy),
        "one flow at a time"
    );
    let status = rig.twitch.status();
    assert_eq!(status["pending"]["userCode"], "ABCD-EFGH");
    assert_eq!(status["signedIn"], false);

    until("the sign-in", || rig.twitch.status()["signedIn"] == true).await;
    let status = rig.twitch.status();
    assert_eq!(
        (
            status["login"].as_str(),
            status["channel"].as_str(),
            status["pending"].is_null(),
            status["error"].is_null()
        ),
        (Some("streamer"), Some("streamer"), true, true)
    );
    no_secrets(&status);
    no_secrets(&rig.twitch.chat_json());

    let saved = rig.saved.lock().unwrap().clone();
    assert_eq!(saved.len(), 1);
    assert_eq!(
        (
            saved[0].access_token.as_str(),
            saved[0].refresh_token.as_str(),
            saved[0].login.as_str(),
            saved[0].user_id.as_str()
        ),
        ("new-access", "new-refresh", "streamer", "99")
    );

    let seen = seen.lock().unwrap();
    let device = seen.iter().find(|r| r.path == "/oauth2/device").unwrap();
    assert_eq!(
        (
            field(&device.body, "client_id").as_str(),
            field(&device.body, "scopes").as_str()
        ),
        (auth::CLIENT_ID, "chat:read chat:edit")
    );
    let polls: Vec<_> = seen.iter().filter(|r| r.path == "/oauth2/token").collect();
    assert_eq!(polls.len(), 3);
    assert_eq!(
        field(&polls[0].body, "grant_type"),
        "urn:ietf:params:oauth:grant-type:device_code"
    );
    assert_eq!(field(&polls[0].body, "device_code"), "dev-1");
    let users = seen.iter().find(|r| r.path == "/helix/users").unwrap();
    assert!(
        users
            .head
            .to_ascii_lowercase()
            .contains("authorization: bearer new-access")
            && users
                .head
                .to_ascii_lowercase()
                .contains(&format!("client-id: {}", auth::CLIENT_ID))
    );
}

#[tokio::test]
async fn stops_with_a_message_when_the_code_is_declined_or_runs_out() {
    let (base, _) = http_fake(|r, _| match r.path.as_str() {
        "/oauth2/device" => (200, device_reply(600)),
        _ => (400, r#"{"status":400,"message":"access_denied"}"#.into()),
    })
    .await;
    let rig = rig(
        endpoints(&base, "ws://127.0.0.1:9"),
        TwitchSettings::default(),
    );
    rig.twitch.signin().await.unwrap();
    until("the refusal", || !rig.twitch.status()["error"].is_null()).await;
    let status = rig.twitch.status();
    assert!(status["error"].as_str().unwrap().contains("declined"));
    assert!(status["pending"].is_null() && status["signedIn"] == false);
    assert!(rig.saved.lock().unwrap().is_empty());

    // A code that never gets approved runs out on its own clock.
    let (base, _) = http_fake(|r, _| match r.path.as_str() {
        "/oauth2/device" => (200, device_reply(1)),
        _ => (
            400,
            r#"{"status":400,"message":"authorization_pending"}"#.into(),
        ),
    })
    .await;
    let rig = self::rig(
        endpoints(&base, "ws://127.0.0.1:9"),
        TwitchSettings::default(),
    );
    rig.twitch.signin().await.unwrap();
    until("the expiry", || !rig.twitch.status()["error"].is_null()).await;
    assert!(rig.twitch.status()["error"]
        .as_str()
        .unwrap()
        .contains("expired"));
    // Another try is allowed afterwards.
    assert!(rig.twitch.signin().await.is_ok());
}

#[tokio::test]
async fn cancel_ends_a_pending_sign_in_and_a_failed_start_is_reported() {
    let (base, _) = http_fake(|r, _| match r.path.as_str() {
        "/oauth2/device" => (200, device_reply(600)),
        _ => (400, r#"{"message":"authorization_pending"}"#.into()),
    })
    .await;
    let rig = rig(
        endpoints(&base, "ws://127.0.0.1:9"),
        TwitchSettings::default(),
    );
    rig.twitch.signin().await.unwrap();
    rig.twitch.signout();
    let status = rig.twitch.status();
    assert!(
        status["pending"].is_null() && status["error"].is_null() && status["signedIn"] == false
    );
    assert!(
        rig.twitch.signin().await.is_ok(),
        "a new flow can start after a cancel"
    );

    let (base, _) = http_fake(|_, _| (400, r#"{"message":"invalid client"}"#.into())).await;
    let rig = self::rig(
        endpoints(&base, "ws://127.0.0.1:9"),
        TwitchSettings::default(),
    );
    assert!(matches!(rig.twitch.signin().await, Err(SigninError::Failed(m)) if m.contains("400")));
    assert!(rig.twitch.status()["pending"].is_null());
    // Nothing is left half-started: the next try gets as far as Twitch again.
    assert!(matches!(
        rig.twitch.signin().await,
        Err(SigninError::Failed(_))
    ));
}

#[tokio::test]
async fn signing_out_forgets_the_tokens_and_tells_twitch() {
    let (base, seen) = http_fake(|_, _| (200, "{}".into())).await;
    let rig = rig(
        endpoints(&base, "ws://127.0.0.1:9"),
        signed_in("streamer", 3_600_000),
    );
    rig.twitch.signout();
    let status = rig.twitch.status();
    assert_eq!(
        (status["signedIn"].as_bool(), status["login"].as_str()),
        (Some(false), Some(""))
    );
    assert_eq!(
        rig.saved.lock().unwrap().last().unwrap(),
        &TwitchAuth::default()
    );
    until("the revoke", || {
        seen.lock()
            .unwrap()
            .iter()
            .any(|r| r.path == "/oauth2/revoke")
    })
    .await;
    let revoke = seen
        .lock()
        .unwrap()
        .iter()
        .find(|r| r.path == "/oauth2/revoke")
        .map(|r| r.body.clone())
        .unwrap();
    assert_eq!(
        (
            field(&revoke, "token").as_str(),
            field(&revoke, "client_id").as_str()
        ),
        ("old-access", auth::CLIENT_ID)
    );
}

// ---- tokens ----

#[tokio::test]
async fn refreshes_the_token_on_a_401_and_asks_again() {
    let (base, seen) = http_fake(|r, _| match r.path.as_str() {
        "/oauth2/token" => (200, TOKENS.into()),
        p if p.starts_with("/helix/streams") => {
            if r.head.to_ascii_lowercase().contains("bearer new-access") {
                (
                    200,
                    r#"{"data":[{"viewer_count":42,"type":"live"}]}"#.into(),
                )
            } else {
                (
                    401,
                    r#"{"status":401,"message":"Invalid OAuth token"}"#.into(),
                )
            }
        }
        _ => (404, "{}".into()),
    })
    .await;
    let rig = rig(
        endpoints(&base, "ws://127.0.0.1:9"),
        signed_in("streamer", 3_600_000),
    );
    assert_eq!(rig.twitch.stream_info("somechannel").await, Ok((true, 42)));
    let refresh = seen
        .lock()
        .unwrap()
        .iter()
        .find(|r| r.path == "/oauth2/token")
        .map(|r| r.body.clone())
        .unwrap();
    assert_eq!(
        (
            field(&refresh, "grant_type").as_str(),
            field(&refresh, "refresh_token").as_str(),
            field(&refresh, "client_id").as_str()
        ),
        ("refresh_token", "old-refresh", auth::CLIENT_ID)
    );
    assert!(!refresh.contains("client_secret"));
    let saved = rig.saved.lock().unwrap().clone();
    assert_eq!(
        (
            saved[0].access_token.as_str(),
            saved[0].refresh_token.as_str(),
            saved[0].login.as_str()
        ),
        ("new-access", "new-refresh", "streamer")
    );
    assert!(saved[0].expires_at > now_ms() + 3_600_000 * 3);
}

#[tokio::test]
async fn refreshes_ahead_of_expiry_and_keeps_the_old_token_when_twitch_cannot_be_asked() {
    let (base, seen) = http_fake(|r, _| match r.path.as_str() {
        "/oauth2/token" => (200, TOKENS.into()),
        _ => (404, "{}".into()),
    })
    .await;
    let rig = rig(
        endpoints(&base, "ws://127.0.0.1:9"),
        signed_in("streamer", 60_000),
    );
    assert_eq!(rig.twitch.access_token().await.unwrap(), "new-access");
    assert_eq!(seen.lock().unwrap().len(), 1);
    // A token with plenty of time is used as it is.
    assert_eq!(rig.twitch.access_token().await.unwrap(), "new-access");
    assert_eq!(seen.lock().unwrap().len(), 1);

    let (base, _) = http_fake(|_, _| (503, "{}".into())).await;
    let rig = self::rig(
        endpoints(&base, "ws://127.0.0.1:9"),
        signed_in("streamer", 60_000),
    );
    assert_eq!(
        rig.twitch.access_token().await.unwrap(),
        "old-access",
        "still valid, so still used"
    );
    assert!(rig.twitch.status()["signedIn"] == true);
}

#[tokio::test]
async fn a_refresh_twitch_refuses_signs_the_user_out_with_a_reason() {
    let (base, _) = http_fake(|_, _| {
        (
            400,
            r#"{"status":400,"message":"Invalid refresh token"}"#.into(),
        )
    })
    .await;
    let rig = rig(
        endpoints(&base, "ws://127.0.0.1:9"),
        signed_in("streamer", -1000),
    );
    assert!(rig.twitch.access_token().await.is_err());
    let status = rig.twitch.status();
    assert_eq!(status["signedIn"], false);
    assert!(status["error"].as_str().unwrap().contains("Sign in again"));
    assert_eq!(
        rig.saved.lock().unwrap().last().unwrap(),
        &TwitchAuth::default()
    );
}

// ---- sending ----

#[tokio::test]
async fn refuses_what_cannot_be_sent_before_it_reaches_the_connection() {
    let rig = rig(Endpoints::offline(), signed_in("streamer", 3_600_000));
    let twitch = &rig.twitch;
    assert_eq!(twitch.send("hello"), Err(SendError::NotConnected));
    assert!(matches!(twitch.send("   "), Err(SendError::Invalid(_))));
    assert!(matches!(twitch.send("a\nb"), Err(SendError::Invalid(_))));
    assert!(matches!(
        twitch.send(&"x".repeat(501)),
        Err(SendError::Invalid(_))
    ));

    let (tx, mut sent) = mpsc::channel(64);
    *locked(&twitch.outgoing) = Some(tx);
    locked(&twitch.inner).connected = true;
    for i in 0..20 {
        assert_eq!(twitch.send(&format!("m{i}")), Ok(()));
    }
    assert_eq!(twitch.send("one too many"), Err(SendError::RateLimited));
    assert_eq!(sent.recv().await.as_deref(), Some("m0"));
}

// ---- chat ----

#[tokio::test]
async fn reads_the_chat_answers_pings_sends_and_clears() {
    let received: Arc<Mutex<Vec<String>>> = Arc::default();
    let log = Arc::clone(&received);
    let irc = irc_fake(move |_, mut socket| {
        let log = Arc::clone(&log);
        async move {
            // The login: four lines, then the welcome and some chat.
            for _ in 0..4 {
                let Some(Ok(Ws::Text(line))) = socket.next().await else { return };
                log.lock().unwrap().push(line.to_string());
            }
            let lines = [
                ":tmi.twitch.tv 001 streamer :Welcome, GLHF!",
                "@badges=moderator/1;color=#FF0000;display-name=Alice;id=m1;tmi-sent-ts=1700000000001 :alice!alice@alice.tmi.twitch.tv PRIVMSG #streamer :hello @streamer",
                "@badges=;display-name=Bob;id=m2;tmi-sent-ts=1700000000002 :bob!bob@bob.tmi.twitch.tv PRIVMSG #streamer :\u{1}ACTION waves\u{1}",
                "@badges=;display-name=Carol;id=m3;tmi-sent-ts=1700000000003 :carol!carol@carol.tmi.twitch.tv PRIVMSG #streamer :spam",
                "PING :tmi.twitch.tv",
                "@display-name=Streamer;color=#00FF00;badges=broadcaster/1 :tmi.twitch.tv USERSTATE #streamer",
            ];
            socket.send(Ws::text(lines.join("\r\n"))).await.unwrap();
            while let Some(Ok(Ws::Text(line))) = socket.next().await {
                let line = line.to_string();
                log.lock().unwrap().push(line.clone());
                if line.starts_with("PRIVMSG") {
                    socket.send(Ws::text(":tmi.twitch.tv CLEARCHAT #streamer :alice")).await.unwrap();
                    socket.send(Ws::text("@target-msg-id=m2 :tmi.twitch.tv CLEARMSG #streamer :waves")).await.unwrap();
                }
            }
        }
    })
    .await;
    let rig = rig(
        endpoints("http://127.0.0.1:9", &irc),
        signed_in("streamer", 3_600_000),
    );
    let (stop, shutdown) = watch::channel(false);
    let tasks = rig.twitch.start(&shutdown);
    let ids = |twitch: &Twitch| {
        twitch.chat_json()["messages"]
            .as_array()
            .unwrap()
            .iter()
            .map(|m| m["id"].as_str().unwrap().to_string())
            .collect::<Vec<_>>()
    };

    until("the three messages", || ids(&rig.twitch).len() == 3).await;
    let chat = rig.twitch.chat_json();
    assert_eq!(
        chat["platforms"]["twitch"],
        json!({ "connected": true, "channel": "streamer" })
    );
    assert_eq!(
        chat["messages"][0],
        json!({ "id": "m1", "platform": "twitch", "user": "Alice", "text": "hello @streamer", "color": "#FF0000", "badge": "mod", "ts": 1_700_000_000_001i64 })
    );
    assert_eq!(chat["messages"][1]["text"], "waves");
    no_secrets(&chat);
    assert_eq!(
        &received.lock().unwrap()[..4],
        [
            "CAP REQ :twitch.tv/tags twitch.tv/commands",
            "PASS oauth:old-access",
            "NICK streamer",
            "JOIN #streamer"
        ]
    );
    until("the PONG", || {
        received
            .lock()
            .unwrap()
            .iter()
            .any(|l| l == "PONG :tmi.twitch.tv")
    })
    .await;

    // Our own line goes out and into the window (Twitch does not echo it); the server then clears Alice and Bob's m2.
    until("the userstate", || {
        locked(&rig.twitch.inner).me.display == "Streamer"
    })
    .await;
    rig.twitch.send("  my message ").unwrap();
    until("the send", || {
        received
            .lock()
            .unwrap()
            .iter()
            .any(|l| l == "PRIVMSG #streamer :my message")
    })
    .await;
    until("the clears", || ids(&rig.twitch).len() == 2).await;
    let chat = rig.twitch.chat_json();
    assert_eq!(chat["messages"][0]["id"], "m3");
    let mine = &chat["messages"][1];
    assert_eq!(
        (
            mine["user"].as_str(),
            mine["text"].as_str(),
            mine["badge"].as_str(),
            mine["color"].as_str()
        ),
        (
            Some("Streamer"),
            Some("my message"),
            Some("broadcaster"),
            Some("#00FF00")
        )
    );
    assert!(mine["id"].as_str().unwrap().starts_with("local-"));
    // The status moved with it, and a stream's first event is this chat.
    assert!(rig.changes.load(Ordering::SeqCst) > 0);
    let first = rig.twitch.listen().borrow().clone();
    assert!(std::str::from_utf8(&first)
        .unwrap()
        .starts_with("data: {\"messages\":"));

    // A new channel clears the window and joins the other chat.
    rig.twitch.set_channel("other");
    assert!(ids(&rig.twitch).is_empty());
    until("the new join", || {
        received.lock().unwrap().iter().any(|l| l == "JOIN #other")
    })
    .await;

    // Signing out ends the connection.
    rig.twitch.signout();
    until("the disconnect", || {
        rig.twitch.chat_json()["platforms"]["twitch"]["connected"] == false
    })
    .await;
    assert_eq!(rig.twitch.send("late"), Err(SendError::NotConnected));
    stop.send(true).unwrap();
    for task in tasks {
        let _ = task.await;
    }
}

#[tokio::test]
async fn a_refused_login_refreshes_the_token_once_then_signs_out() {
    let connections = Arc::new(AtomicUsize::new(0));
    let count = Arc::clone(&connections);
    let irc = irc_fake(move |n, mut socket| {
        count.fetch_max(n + 1, Ordering::SeqCst);
        async move {
            for _ in 0..4 {
                let Some(Ok(Ws::Text(_))) = socket.next().await else {
                    return;
                };
            }
            socket
                .send(Ws::text(
                    ":tmi.twitch.tv NOTICE * :Login authentication failed",
                ))
                .await
                .unwrap();
            let _ = socket.next().await;
        }
    })
    .await;
    let (base, seen) = http_fake(|r, _| match r.path.as_str() {
        "/oauth2/token" => (200, TOKENS.into()),
        _ => (404, "{}".into()),
    })
    .await;
    let rig = rig(endpoints(&base, &irc), signed_in("streamer", 3_600_000));
    let (stop, shutdown) = watch::channel(false);
    let tasks = rig.twitch.start(&shutdown);
    until("the sign-out", || rig.twitch.status()["signedIn"] == false).await;
    assert!(rig.twitch.status()["error"]
        .as_str()
        .unwrap()
        .contains("Sign in again"));
    assert_eq!(
        connections.load(Ordering::SeqCst),
        2,
        "the refused login, then one try with the new token"
    );
    assert_eq!(
        seen.lock()
            .unwrap()
            .iter()
            .filter(|r| r.path == "/oauth2/token")
            .count(),
        1
    );
    stop.send(true).unwrap();
    for task in tasks {
        let _ = task.await;
    }
}

#[tokio::test]
async fn follows_the_channels_viewers_while_signed_in() {
    let (base, _) = http_fake(|r, nth| match r.path.as_str() {
        p if p.starts_with("/helix/streams") => {
            assert!(p.contains("user_login=streamer"));
            if nth == 0 {
                (200, r#"{"data":[{"viewer_count":12}]}"#.into())
            } else {
                (200, r#"{"data":[]}"#.into())
            }
        }
        _ => (404, "{}".into()),
    })
    .await;
    let rig = rig(
        endpoints(&base, "ws://127.0.0.1:9"),
        signed_in("streamer", 3_600_000),
    );
    let (stop, shutdown) = watch::channel(false);
    let tasks = rig.twitch.start(&shutdown);
    until("live", || rig.twitch.status()["live"] == true).await;
    assert_eq!(rig.twitch.status()["viewers"], 12);
    until("offline", || rig.twitch.status()["live"] == false).await;
    assert_eq!(rig.twitch.status()["viewers"], 0);
    stop.send(true).unwrap();
    for task in tasks {
        let _ = task.await;
    }
}
