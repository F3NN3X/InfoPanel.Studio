// The YouTube module against a fake HTTP server standing in for accounts.google.com, oauth2.googleapis.com and the Data API.
// Nothing here reaches Google. The clock is the test's, so the quota's midnight and the token expiries are held still.

use std::sync::atomic::{AtomicI64, AtomicUsize, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Duration;

use serde_json::{json, Value};
use url::Url;

use super::auth::Endpoints;
use super::*;
use crate::twitch::tests::{field, http_fake, http_fake_slow, until, Request};

/// 2026-07-15 12:00 UTC (05:00 in Los Angeles).
const NOON: i64 = 1_784_116_800_000;
const HOUR: i64 = 3600 * 1000;
const REDIRECT: &str = "http://127.0.0.1:3922/api/youtube/callback";

fn endpoints(base: &str) -> Endpoints {
    Endpoints {
        accounts: base.into(),
        token: base.into(),
        api: base.into(),
        find_every: Duration::from_millis(40),
        viewers_every: Duration::from_millis(40),
        retry_every: Duration::from_millis(40),
        chat_every: Some(Duration::from_millis(15)),
    }
}

struct Rig {
    youtube: Arc<Youtube>,
    saved: Arc<Mutex<Vec<YoutubeAuth>>>,
    changes: Arc<AtomicUsize>,
    clock: Arc<AtomicI64>,
}

impl Rig {
    fn now(&self) -> i64 {
        self.clock.load(Ordering::SeqCst)
    }
}

fn rig(ep: Endpoints, settings: YoutubeSettings) -> Rig {
    let saved: Arc<Mutex<Vec<YoutubeAuth>>> = Arc::default();
    let changes = Arc::new(AtomicUsize::new(0));
    let clock = Arc::new(AtomicI64::new(NOON));
    let youtube = Youtube::with_clock(
        ep,
        GuardedClient::open(),
        settings,
        {
            let clock = Arc::clone(&clock);
            move || clock.load(Ordering::SeqCst)
        },
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
        youtube,
        saved,
        changes,
        clock,
    }
}

/// A client entered, nobody signed in.
fn configured() -> YoutubeSettings {
    YoutubeSettings {
        client_id: "cid.apps".into(),
        client_secret: "csecret".into(),
        ..YoutubeSettings::default()
    }
}

/// A client entered and a sign-in whose access token runs out in `expires_in_ms`.
fn signed_in(expires_in_ms: i64) -> YoutubeSettings {
    YoutubeSettings {
        auth: YoutubeAuth {
            access_token: "old-access".into(),
            refresh_token: "old-refresh".into(),
            expires_at: NOON + expires_in_ms,
            channel: "My Channel".into(),
            channel_id: "UC9".into(),
        },
        ..configured()
    }
}

fn no_secrets(value: &Value) {
    let text = value.to_string();
    for secret in [
        "old-access",
        "old-refresh",
        "new-access",
        "new-refresh",
        "csecret",
        "cid.apps",
        "code-1",
    ] {
        assert!(!text.contains(secret), "{secret} leaked into {text}");
    }
}

const TOKENS: &str = r#"{"access_token":"new-access","refresh_token":"new-refresh","expires_in":3599,"token_type":"Bearer"}"#;
const CHANNEL: &str = r#"{"items":[{"id":"UC9","snippet":{"title":"My Channel"}}]}"#;

fn query_of(url: &str) -> std::collections::HashMap<String, String> {
    Url::parse(url)
        .unwrap()
        .query_pairs()
        .into_owned()
        .collect()
}

fn bearer(r: &Request) -> String {
    r.head.to_ascii_lowercase()
}

// ---- sign-in ----

#[tokio::test]
async fn signs_in_through_the_browser_with_pkce_and_keeps_the_secrets_out_of_the_status() {
    let (base, seen) = http_fake(|r, _| match r.path.as_str() {
        "/token" => (200, TOKENS.into()),
        p if p.starts_with("/youtube/v3/channels") => (200, CHANNEL.into()),
        _ => (404, "{}".into()),
    })
    .await;
    let rig = rig(endpoints(&base), configured());
    let url = rig.youtube.signin(3922).unwrap();
    let q = query_of(&url);
    assert_eq!(q["redirect_uri"], REDIRECT);
    assert_eq!(
        (
            q["client_id"].as_str(),
            q["code_challenge_method"].as_str(),
            q["access_type"].as_str()
        ),
        ("cid.apps", "S256", "offline")
    );
    assert_eq!(
        rig.youtube.signin(3922),
        Err(SigninError::Busy),
        "one sign-in at a time"
    );
    assert_eq!(rig.youtube.status()["pending"], true);
    // The pending route shows the address; the extras status does not.
    assert_eq!(rig.youtube.pending_json()["pending"]["auth_url"], url);
    no_secrets(&rig.youtube.status());

    // A callback with another state is refused and leaves the sign-in alone.
    assert_eq!(
        rig.youtube
            .callback(Some("code-1"), Some("not-the-state"), None)
            .await,
        Err(CallbackError::Invalid)
    );
    assert_eq!(
        rig.youtube.callback(Some("code-1"), None, None).await,
        Err(CallbackError::Invalid)
    );
    assert!(
        seen.lock().unwrap().is_empty(),
        "nothing was sent to Google for them"
    );
    assert_eq!(rig.youtube.status()["pending"], true);

    assert_eq!(
        rig.youtube
            .callback(Some("code-1"), Some(&q["state"]), None)
            .await,
        Ok(())
    );
    let exchange = seen
        .lock()
        .unwrap()
        .iter()
        .find(|r| r.path == "/token")
        .map(|r| r.body.clone())
        .unwrap();
    for (key, want) in [
        ("code", "code-1"),
        ("client_id", "cid.apps"),
        ("client_secret", "csecret"),
        ("redirect_uri", REDIRECT),
        ("grant_type", "authorization_code"),
    ] {
        assert_eq!(field(&exchange, key), want, "{key}");
    }
    assert_eq!(
        auth::challenge_of(&field(&exchange, "code_verifier")),
        q["code_challenge"],
        "the verifier answers the challenge"
    );
    assert!(seen
        .lock()
        .unwrap()
        .iter()
        .any(|r| r.path.starts_with("/youtube/v3/channels")
            && bearer(r).contains("bearer new-access")));

    let status = rig.youtube.status();
    assert_eq!(
        (
            status["signedIn"].as_bool(),
            status["channel"].as_str(),
            status["pending"].as_bool(),
            status["quota"]["used"].as_u64()
        ),
        (Some(true), Some("My Channel"), Some(false), Some(1))
    );
    no_secrets(&status);
    no_secrets(&rig.youtube.pending_json());
    let saved = rig.saved.lock().unwrap().clone();
    assert_eq!(saved.len(), 1);
    assert_eq!(
        (
            saved[0].access_token.as_str(),
            saved[0].refresh_token.as_str(),
            saved[0].channel_id.as_str(),
            saved[0].expires_at
        ),
        ("new-access", "new-refresh", "UC9", NOON + 3_599_000)
    );
    // The state works once.
    assert_eq!(
        rig.youtube
            .callback(Some("code-1"), Some(&q["state"]), None)
            .await,
        Err(CallbackError::Invalid)
    );
    assert!(rig.changes.load(Ordering::SeqCst) > 0);
}

#[tokio::test]
async fn refuses_a_sign_in_without_a_client_and_a_stale_or_declined_callback() {
    let rig = rig(
        endpoints("http://127.0.0.1:9"),
        YoutubeSettings {
            client_id: "only-id".into(),
            ..YoutubeSettings::default()
        },
    );
    assert_eq!(rig.youtube.signin(3922), Err(SigninError::NotConfigured));
    let rig = self::rig(endpoints("http://127.0.0.1:9"), configured());
    assert_eq!(
        rig.youtube.callback(Some("c"), Some("s"), None).await,
        Err(CallbackError::Invalid),
        "none under way"
    );

    // Ten minutes on, the state is no good and the pending route says so.
    let state = query_of(&rig.youtube.signin(3922).unwrap())["state"].clone();
    rig.clock.store(NOON + 10 * 60 * 1000 + 1, Ordering::SeqCst);
    assert_eq!(rig.youtube.status()["pending"], false);
    assert_eq!(
        rig.youtube.callback(Some("c"), Some(&state), None).await,
        Err(CallbackError::Invalid)
    );
    let pending = rig.youtube.pending_json();
    assert_eq!(
        (pending["pending"].is_null(), pending["error"].as_str()),
        (true, Some("The sign-in took too long. Start again."))
    );
    // A new one can start.
    let url = rig.youtube.signin(3922).unwrap();

    // Declined on Google's page: the pending sign-in ends with a message.
    let state = query_of(&url)["state"].clone();
    let declined = rig
        .youtube
        .callback(None, Some(&state), Some("access_denied"))
        .await;
    assert!(
        matches!(&declined, Err(CallbackError::Declined(m)) if m.contains("access_denied")),
        "{declined:?}"
    );
    let status = rig.youtube.status();
    assert_eq!(
        (status["pending"].as_bool(), status["signedIn"].as_bool()),
        (Some(false), Some(false))
    );
    assert!(status["error"].as_str().unwrap().contains("not completed"));
}

#[tokio::test]
async fn a_refused_code_exchange_leaves_nobody_signed_in() {
    let (base, _) = http_fake(|r, _| match r.path.as_str() {
        "/token" => (400, r#"{"error":"invalid_grant"}"#.into()),
        _ => (404, "{}".into()),
    })
    .await;
    let rig = rig(endpoints(&base), configured());
    let state = query_of(&rig.youtube.signin(3922).unwrap())["state"].clone();
    let result = rig
        .youtube
        .callback(Some("code-1"), Some(&state), None)
        .await;
    assert!(
        matches!(&result, Err(CallbackError::Failed(m)) if m.contains("invalid_grant")),
        "{result:?}"
    );
    assert!(rig.saved.lock().unwrap().is_empty());
    let status = rig.youtube.status();
    assert_eq!(
        (status["signedIn"].as_bool(), status["pending"].as_bool()),
        (Some(false), Some(false))
    );
    assert!(status["error"].as_str().unwrap().contains("invalid_grant"));
    no_secrets(&status);
}

#[tokio::test]
async fn a_sign_out_while_google_answers_cancels_the_sign_in_and_revokes_the_new_tokens() {
    let (base, seen) = http_fake_slow("/token", Duration::from_millis(250), |r, _| {
        match r.path.as_str() {
            "/token" => (200, TOKENS.into()),
            p if p.starts_with("/youtube/v3/channels") => (200, CHANNEL.into()),
            _ => (200, "{}".into()),
        }
    })
    .await;
    let rig = rig(endpoints(&base), configured());
    let state = query_of(&rig.youtube.signin(3922).unwrap())["state"].clone();
    let youtube = Arc::clone(&rig.youtube);
    let callback =
        tokio::spawn(async move { youtube.callback(Some("code-1"), Some(&state), None).await });
    tokio::time::sleep(Duration::from_millis(60)).await;
    rig.youtube.signout();
    assert!(
        matches!(callback.await.unwrap(), Err(CallbackError::Failed(m)) if m.contains("cancelled"))
    );
    assert_eq!(rig.youtube.status()["signedIn"], false);
    assert!(
        rig.saved
            .lock()
            .unwrap()
            .iter()
            .all(|a| a.access_token.is_empty()),
        "the new tokens were never stored"
    );
    until("the new refresh token to be revoked", || {
        seen.lock()
            .unwrap()
            .iter()
            .any(|r| r.path == "/revoke" && field(&r.body, "token") == "new-refresh")
    })
    .await;
}

#[tokio::test]
async fn signing_out_forgets_the_tokens_and_tells_google() {
    let (base, seen) = http_fake(|_, _| (200, "{}".into())).await;
    let rig = rig(endpoints(&base), signed_in(HOUR));
    rig.youtube.signout();
    let status = rig.youtube.status();
    assert_eq!(
        (status["signedIn"].as_bool(), status["channel"].as_str()),
        (Some(false), Some(""))
    );
    assert_eq!(
        rig.saved.lock().unwrap().as_slice(),
        [YoutubeAuth::default()]
    );
    until("the revoke", || {
        seen.lock()
            .unwrap()
            .iter()
            .any(|r| r.path == "/revoke" && field(&r.body, "token") == "old-refresh")
    })
    .await;
    // Signing out again is harmless and sends nothing more.
    rig.youtube.signout();
    tokio::time::sleep(Duration::from_millis(60)).await;
    assert_eq!(
        seen.lock()
            .unwrap()
            .iter()
            .filter(|r| r.path == "/revoke")
            .count(),
        1
    );
}

#[tokio::test]
async fn a_new_client_ends_the_sign_in_without_writing_the_file() {
    let rig = rig(endpoints("http://127.0.0.1:9"), signed_in(HOUR));
    let mut next = signed_in(HOUR);
    next.chat_interval = 20;
    next.auth = YoutubeAuth::default();
    // Same client: the interval changes, the sign-in stays.
    rig.youtube.sync(&next);
    assert_eq!(rig.youtube.status()["signedIn"], true);
    next.client_secret = "another".into();
    rig.youtube.sync(&next);
    assert_eq!(rig.youtube.status()["signedIn"], false);
    assert!(
        rig.saved.lock().unwrap().is_empty(),
        "the save that changed the client already dropped the tokens"
    );
}

// ---- tokens ----

#[tokio::test]
async fn refreshes_the_token_on_a_401_and_asks_again() {
    let (base, seen) = http_fake(|r, _| match r.path.as_str() {
        "/token" => (
            200,
            r#"{"access_token":"new-access","expires_in":3599}"#.into(),
        ),
        _ if bearer(r).contains("bearer old-access") => (401, "{}".into()),
        _ => (200, r#"{"items":[]}"#.into()),
    })
    .await;
    let rig = rig(endpoints(&base), signed_in(HOUR));
    let answer = rig
        .youtube
        .call(Call::Get("/youtube/v3/videos?id=v"), 1)
        .await;
    assert_eq!(answer, Ok(json!({ "items": [] })));
    let refresh = seen
        .lock()
        .unwrap()
        .iter()
        .find(|r| r.path == "/token")
        .map(|r| r.body.clone())
        .unwrap();
    for (key, want) in [
        ("grant_type", "refresh_token"),
        ("refresh_token", "old-refresh"),
        ("client_id", "cid.apps"),
        ("client_secret", "csecret"),
    ] {
        assert_eq!(field(&refresh, key), want, "{key}");
    }
    // Google does not send the refresh token again: the old one is kept.
    let saved = rig.saved.lock().unwrap().clone();
    assert_eq!(
        (
            saved.len(),
            saved[0].access_token.as_str(),
            saved[0].refresh_token.as_str(),
            saved[0].channel_id.as_str()
        ),
        (1, "new-access", "old-refresh", "UC9")
    );
    assert_eq!(
        rig.youtube.status()["quota"]["used"],
        2,
        "both asks are counted"
    );
}

#[tokio::test]
async fn refreshes_ahead_of_expiry_and_keeps_the_old_token_when_google_cannot_be_asked() {
    let (base, seen) = http_fake(|r, _| match r.path.as_str() {
        "/token" => (200, TOKENS.into()),
        _ => (404, "{}".into()),
    })
    .await;
    let rig = rig(endpoints(&base), signed_in(2 * 60 * 1000));
    assert_eq!(
        rig.youtube.access_token().await,
        Ok("new-access".to_string())
    );
    assert_eq!(seen.lock().unwrap().len(), 1);
    // Plenty of time left: no refresh.
    assert_eq!(
        rig.youtube.access_token().await,
        Ok("new-access".to_string())
    );
    assert_eq!(seen.lock().unwrap().len(), 1);
    // Google can't be reached and the token has not run out yet: it is used.
    let rig = self::rig(endpoints("http://127.0.0.1:9"), signed_in(2 * 60 * 1000));
    assert_eq!(
        rig.youtube.access_token().await,
        Ok("old-access".to_string())
    );
    assert_eq!(rig.youtube.status()["signedIn"], true);
}

#[tokio::test]
async fn a_refresh_google_refuses_signs_the_user_out_with_a_reason() {
    let (base, _) = http_fake(|_, _| (400, r#"{"error":"invalid_grant"}"#.into())).await;
    let rig = rig(endpoints(&base), signed_in(0));
    assert!(rig.youtube.access_token().await.is_err());
    let status = rig.youtube.status();
    assert_eq!(
        (status["signedIn"].as_bool(), status["error"].as_str()),
        (
            Some(false),
            Some("Your Google sign-in ran out. Sign in again.")
        )
    );
    assert_eq!(
        rig.saved.lock().unwrap().as_slice(),
        [YoutubeAuth::default()]
    );
}

#[tokio::test]
async fn a_refresh_in_flight_cannot_undo_a_sign_out() {
    let (base, seen) = http_fake_slow("/token", Duration::from_millis(250), |r, _| {
        match r.path.as_str() {
            "/token" => (200, TOKENS.into()),
            _ => (200, "{}".into()),
        }
    })
    .await;
    let rig = rig(endpoints(&base), signed_in(0));
    let youtube = Arc::clone(&rig.youtube);
    let refresh = tokio::spawn(async move { youtube.access_token().await });
    tokio::time::sleep(Duration::from_millis(60)).await;
    rig.youtube.signout();
    assert!(refresh.await.unwrap().is_err());
    assert_eq!(rig.youtube.status()["signedIn"], false);
    assert_eq!(
        rig.saved.lock().unwrap().as_slice(),
        [YoutubeAuth::default()],
        "the refreshed tokens were not stored"
    );
    until("the refreshed access token to be revoked", || {
        seen.lock()
            .unwrap()
            .iter()
            .any(|r| r.path == "/revoke" && field(&r.body, "token") == "new-access")
    })
    .await;
}

#[tokio::test]
async fn a_refresh_for_an_older_sign_in_is_not_applied_to_a_newer_one() {
    let (base, seen) = http_fake_slow("/token", Duration::from_millis(250), |r, _| {
        match r.path.as_str() {
            "/token" => (200, TOKENS.into()),
            _ => (200, "{}".into()),
        }
    })
    .await;
    let rig = rig(endpoints(&base), signed_in(0));
    let youtube = Arc::clone(&rig.youtube);
    let refresh = tokio::spawn(async move { youtube.access_token().await });
    tokio::time::sleep(Duration::from_millis(60)).await;
    // A newer sign-in replaces the one being refreshed.
    {
        let mut i = locked(&rig.youtube.inner);
        i.settings.auth = YoutubeAuth {
            access_token: "newer-access".into(),
            refresh_token: "newer-refresh".into(),
            expires_at: NOON + HOUR,
            channel: "N".into(),
            channel_id: "UC2".into(),
        };
    }
    assert!(refresh.await.unwrap().is_err());
    assert_eq!(
        locked(&rig.youtube.inner).settings.auth.access_token,
        "newer-access"
    );
    assert!(rig.saved.lock().unwrap().is_empty());
    until("the unwanted token to be revoked", || {
        seen.lock().unwrap().iter().any(|r| r.path == "/revoke")
    })
    .await;
}

// ---- live, viewers and chat ----

fn chat_message(id: &str, name: &str, channel: &str, flags: Value, at: &str) -> Value {
    json!({ "id": id, "snippet": { "type": "textMessageEvent", "publishedAt": at, "displayMessage": format!("{id} says hi") },
        "authorDetails": { "channelId": channel, "displayName": name, "isChatOwner": flags["owner"], "isChatModerator": flags["mod"] } })
}

fn page(items: Vec<Value>, next: &str) -> String {
    json!({ "nextPageToken": next, "pollingIntervalMillis": 5, "items": items }).to_string()
}

fn ids(youtube: &Youtube) -> Vec<String> {
    youtube.chat_parts().0.into_iter().map(|m| m.id).collect()
}

#[tokio::test]
async fn follows_the_live_broadcast_its_viewers_and_its_chat_to_the_end() {
    let a = chat_message(
        "a",
        "Owner",
        "UC-o",
        json!({ "owner": true }),
        "2026-07-15T12:00:00Z",
    );
    let b = chat_message("b", "Plain", "UC-p", json!({}), "2026-07-15T12:00:01Z");
    let c = chat_message(
        "c",
        "Mod",
        "UC-m",
        json!({ "mod": true }),
        "2026-07-15T12:00:02Z",
    );
    let delete_a = json!({ "id": "d1", "snippet": { "type": "messageDeletedEvent", "messageDeletedDetails": { "deletedMessageId": "a" } } });
    let ban_c = json!({ "id": "d2", "snippet": { "type": "userBannedEvent", "userBannedDetails": { "bannedUserDetails": { "channelId": "UC-m" } } } });
    let (base, seen) = http_fake(move |r, nth| {
        let (a, b, c, delete_a, ban_c) = (
            a.clone(),
            b.clone(),
            c.clone(),
            delete_a.clone(),
            ban_c.clone(),
        );
        if r.path.starts_with("/youtube/v3/liveBroadcasts") {
            let items = if nth == 0 {
                vec![json!({ "id": "vid-1", "snippet": { "liveChatId": "chat-1" } })]
            } else {
                vec![]
            };
            return (200, json!({ "items": items }).to_string());
        }
        if r.path.starts_with("/youtube/v3/videos") {
            let details = if nth < 12 {
                json!({ "concurrentViewers": "42" })
            } else {
                json!({ "concurrentViewers": "42", "actualEndTime": "2026-07-15T13:00:00Z" })
            };
            return (
                200,
                json!({ "items": [{ "liveStreamingDetails": details }] }).to_string(),
            );
        }
        if r.path.starts_with("/youtube/v3/liveChat/messages") {
            let token = r.path.split("pageToken=").nth(1).unwrap_or("");
            return match (token, nth) {
                // The request for P2 fails once: the chat starts over from the newest page and sees the first ones again.
                ("P2", 0) => (500, "{}".into()),
                ("P2", _) => (200, page(vec![ban_c], "P3")),
                ("P1", _) => (200, page(vec![b, c, delete_a], "P2")),
                ("", _) => (200, page(vec![a, b], "P1")),
                _ => (200, page(vec![], token)),
            };
        }
        (404, "{}".into())
    })
    .await;
    let rig = rig(endpoints(&base), signed_in(HOUR));
    let (stop, shutdown) = tokio::sync::watch::channel(false);
    let task = rig.youtube.start(&shutdown);

    until("the broadcast and its viewers", || {
        let s = rig.youtube.status();
        s["live"] == true && s["viewers"] == 42
    })
    .await;
    // What the chat showed on the way never repeated a message.
    until("the chat to settle", || {
        let seen_ids = ids(&rig.youtube);
        let mut unique = seen_ids.clone();
        unique.dedup();
        assert_eq!(seen_ids, unique, "no message twice");
        seen_ids == ["b"] && rig.youtube.status()["connected"] == true
    })
    .await;
    // The broadcast ended: no live, no viewers, no chat connection.
    until("the end of the broadcast", || {
        let s = rig.youtube.status();
        s["live"] == false && s["viewers"] == 0 && s["connected"] == false
    })
    .await;

    let requests: Vec<String> = seen
        .lock()
        .unwrap()
        .iter()
        .map(|r| r.path.clone())
        .collect();
    let first_chat = requests
        .iter()
        .find(|p| p.starts_with("/youtube/v3/liveChat/messages"))
        .unwrap();
    assert!(
        first_chat.contains("liveChatId=chat-1")
            && first_chat.contains("part=snippet,authorDetails")
            && first_chat.contains("maxResults=200")
            && !first_chat.contains("pageToken"),
        "{first_chat}"
    );
    assert!(requests.iter().any(|p| p.starts_with("/youtube/v3/videos")
        && p.contains("id=vid-1")
        && p.contains("liveStreamingDetails")));
    assert!(
        requests
            .iter()
            .filter(|p| p.starts_with("/youtube/v3/liveChat/messages") && !p.contains("pageToken"))
            .count()
            >= 2,
        "started over after the failure"
    );
    assert!(seen
        .lock()
        .unwrap()
        .iter()
        .all(|r| bearer(r).contains("bearer old-access")));
    let status = rig.youtube.status();
    assert!(status["quota"]["used"].as_u64().unwrap() > 5 + 1);
    no_secrets(&status);

    // The lines stay up after the stream ends.
    assert_eq!(ids(&rig.youtube), ["b"]);
    assert_eq!(rig.youtube.chat_parts().1.unwrap()["channel"], "My Channel");
    stop.send(true).unwrap();
    task.await.unwrap();
}

#[tokio::test]
async fn keeps_the_viewers_going_when_the_chat_is_over() {
    let (base, seen) = http_fake(|r, _| {
        if r.path.starts_with("/youtube/v3/liveBroadcasts") {
            return (
                200,
                json!({ "items": [{ "id": "vid-1", "snippet": { "liveChatId": "chat-1" } }] })
                    .to_string(),
            );
        }
        if r.path.starts_with("/youtube/v3/videos") {
            return (
                200,
                r#"{"items":[{"liveStreamingDetails":{"concurrentViewers":"7"}}]}"#.into(),
            );
        }
        (
            403,
            r#"{"error":{"errors":[{"reason":"liveChatEnded"}]}}"#.into(),
        )
    })
    .await;
    let rig = rig(endpoints(&base), signed_in(HOUR));
    let (stop, shutdown) = tokio::sync::watch::channel(false);
    let task = rig.youtube.start(&shutdown);
    until("the viewers", || rig.youtube.status()["viewers"] == 7).await;
    tokio::time::sleep(Duration::from_millis(150)).await;
    let status = rig.youtube.status();
    assert_eq!(
        (
            status["live"].as_bool(),
            status["connected"].as_bool(),
            status["error"].is_null()
        ),
        (Some(true), Some(false), true)
    );
    assert_eq!(
        seen.lock()
            .unwrap()
            .iter()
            .filter(|r| r.path.starts_with("/youtube/v3/liveChat/messages"))
            .count(),
        1,
        "the ended chat is not asked again"
    );
    stop.send(true).unwrap();
    task.await.unwrap();
}

#[tokio::test]
async fn searches_slowly_while_off_air_and_not_at_all_signed_out() {
    let (base, seen) = http_fake(|_, _| (200, r#"{"items":[]}"#.into())).await;
    let signed_out = rig(endpoints(&base), configured());
    let (stop, shutdown) = tokio::sync::watch::channel(false);
    let task = signed_out.youtube.start(&shutdown);
    tokio::time::sleep(Duration::from_millis(150)).await;
    assert!(
        seen.lock().unwrap().is_empty(),
        "signed out: nothing is asked"
    );
    stop.send(true).unwrap();
    task.await.unwrap();

    let rig = self::rig(endpoints(&base), signed_in(HOUR));
    let (stop, shutdown) = tokio::sync::watch::channel(false);
    let task = rig.youtube.start(&shutdown);
    until("a few searches", || seen.lock().unwrap().len() >= 3).await;
    let status = rig.youtube.status();
    assert_eq!(
        (status["live"].as_bool(), status["viewers"].as_u64()),
        (Some(false), Some(0))
    );
    stop.send(true).unwrap();
    task.await.unwrap();
}

// ---- send ----

fn live_chat(rig: &Rig) {
    rig.youtube.set_live(Some(Live {
        video_id: "vid-1".into(),
        chat_id: "chat-1".into(),
    }));
}

#[tokio::test]
async fn sends_to_the_live_chat_and_does_not_show_the_echo_twice() {
    let (base, seen) = http_fake(|r, _| match r.path.as_str() {
        "/youtube/v3/liveChat/messages?part=snippet" => (200, r#"{"id":"msg-1","snippet":{"publishedAt":"2026-07-15T12:00:03Z","displayMessage":"hello there"}}"#.into()),
        _ => (404, "{}".into()),
    })
    .await;
    let rig = rig(endpoints(&base), signed_in(HOUR));
    // Not live: refused before anything is sent. Bad text too.
    assert_eq!(
        rig.youtube.send("hello there").await,
        Err(SendError::NotLive)
    );
    live_chat(&rig);
    for bad in ["", "   ", "a\nb", &"x".repeat(201)] {
        assert!(
            matches!(rig.youtube.send(bad).await, Err(SendError::Invalid(_))),
            "{bad:?}"
        );
    }
    assert!(seen.lock().unwrap().is_empty());

    assert_eq!(rig.youtube.send("  hello there ").await, Ok(()));
    let sent = seen
        .lock()
        .unwrap()
        .iter()
        .map(|r| (r.head.to_ascii_lowercase(), r.body.clone()))
        .next()
        .unwrap();
    assert!(sent.0.starts_with("post ") && sent.0.contains("bearer old-access"));
    assert_eq!(
        serde_json::from_str::<Value>(&sent.1).unwrap(),
        json!({ "snippet": { "liveChatId": "chat-1", "type": "textMessageEvent", "textMessageDetails": { "messageText": "hello there" } } })
    );
    let (messages, _) = rig.youtube.chat_parts();
    assert_eq!(
        (
            messages.len(),
            messages[0].id.as_str(),
            messages[0].user.as_str(),
            messages[0].badge,
            messages[0].ts
        ),
        (1, "msg-1", "My Channel", "broadcaster", NOON + 3000)
    );
    assert_eq!(rig.youtube.status()["quota"]["used"], 50);

    // YouTube lists the message in its next page: same id, so no second line.
    let echo = chat_message(
        "msg-1",
        "My Channel",
        "UC9",
        json!({ "owner": true }),
        "2026-07-15T12:00:03Z",
    );
    rig.youtube
        .apply(messages::parse_page(&json!({ "items": [echo] }), NOON).events);
    assert_eq!(ids(&rig.youtube), ["msg-1"]);
}

#[tokio::test]
async fn a_send_youtube_refuses_is_reported() {
    let (base, _) = http_fake(|_, _| {
        (
            403,
            r#"{"error":{"errors":[{"reason":"forbidden"}]}}"#.into(),
        )
    })
    .await;
    let rig = rig(endpoints(&base), signed_in(HOUR));
    live_chat(&rig);
    assert_eq!(
        rig.youtube.send("hi").await,
        Err(SendError::Failed("YouTube answered 403 (forbidden)".into()))
    );
    assert!(ids(&rig.youtube).is_empty());
}

// ---- quota ----

#[tokio::test]
async fn stops_everything_when_the_quota_is_used_up_until_midnight_pacific() {
    let (base, seen) = http_fake(|r, nth| {
        if r.path.starts_with("/youtube/v3/liveBroadcasts") && nth == 0 {
            return (403, r#"{"error":{"code":403,"errors":[{"reason":"quotaExceeded"}],"status":"PERMISSION_DENIED"}}"#.into());
        }
        (200, r#"{"items":[]}"#.into())
    })
    .await;
    let rig = rig(endpoints(&base), signed_in(48 * HOUR));
    let (stop, shutdown) = tokio::sync::watch::channel(false);
    let task = rig.youtube.start(&shutdown);
    until("the quota message", || {
        rig.youtube.status()["error"] == QUOTA_MESSAGE
    })
    .await;
    let status = rig.youtube.status();
    assert_eq!(
        status["quota"],
        json!({ "used": 10_000, "estimatePerHour": 0 })
    );
    // Nothing more is asked, and the send box has nothing to write to.
    let asked = seen.lock().unwrap().len();
    tokio::time::sleep(Duration::from_millis(250)).await;
    assert_eq!(seen.lock().unwrap().len(), asked);
    assert_eq!(
        rig.youtube
            .call(Call::Get("/youtube/v3/videos?id=v"), 1)
            .await,
        Err(ApiError::Quota)
    );
    assert_eq!(seen.lock().unwrap().len(), asked);

    // Just before midnight Pacific it is still stopped; after it the day is new and the search resumes.
    rig.clock.store(NOON + 19 * HOUR - 1, Ordering::SeqCst);
    tokio::time::sleep(Duration::from_millis(150)).await;
    assert_eq!(seen.lock().unwrap().len(), asked);
    rig.clock.store(NOON + 19 * HOUR, Ordering::SeqCst);
    until("the search to resume", || {
        seen.lock().unwrap().len() > asked
    })
    .await;
    let status = rig.youtube.status();
    assert!(status["error"].is_null(), "{status}");
    assert!(status["quota"]["used"].as_u64().unwrap() < 100);
    stop.send(true).unwrap();
    task.await.unwrap();
}

#[test]
fn estimates_the_units_an_hour_from_what_is_polled() {
    let rig = rig(Endpoints::google(), signed_in(HOUR));
    let per_hour = |rig: &Rig| {
        rig.youtube.status()["quota"]["estimatePerHour"]
            .as_u64()
            .unwrap()
    };
    // Off air: a search a minute.
    assert_eq!(per_hour(&rig), 60);
    // Live at the default 10 s: 360 chat reads x 5 + 120 viewer reads.
    live_chat(&rig);
    assert_eq!(per_hour(&rig), 1920);
    rig.youtube.sync(&YoutubeSettings {
        chat_interval: 20,
        ..signed_in(HOUR)
    });
    assert_eq!(per_hour(&rig), 900 + 120);
    rig.youtube.sync(&YoutubeSettings {
        chat_interval: 5,
        ..signed_in(HOUR)
    });
    assert_eq!(per_hour(&rig), 3600 + 120);
    // Not signed in: nothing is polled.
    let signed_out = self::rig(Endpoints::google(), configured());
    assert_eq!(
        signed_out.youtube.status()["quota"],
        json!({ "used": 0, "estimatePerHour": 0 })
    );
    assert_eq!(rig.now(), NOON);
}
