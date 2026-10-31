// Twitch's HTTP side: the device-code sign-in (a public client, so no secret), token refresh, and the two Helix reads (who
// the token is, whether a channel is live). Every call goes through the guarded client; the base URLs are the caller's, so a
// test points them at a fake server. Tokens are only ever sent to Twitch and never put in an error text.

use std::time::Duration;

use serde_json::Value;
use url::Url;

use crate::guarded_net::GuardedClient;

/// The app's public client id (a public client has no secret).
pub const CLIENT_ID: &str = "grn0umkmldaj8vv0km93vvo6cqxeo6";
pub const SCOPES: &str = "chat:read chat:edit";
const MAX_REPLY: usize = 64 * 1024;

/// Where Twitch is, and the pacing; the defaults are the real service.
#[derive(Debug, Clone)]
pub struct Endpoints {
    /// `https://id.twitch.tv`
    pub id: String,
    /// `https://api.twitch.tv`
    pub api: String,
    /// `wss://irc-ws.chat.twitch.tv:443`
    pub irc: String,
    pub client_id: String,
    /// The least time between two polls of the sign-in, whatever Twitch's `interval` says.
    pub poll_floor: Duration,
    /// What a `slow_down` adds to the poll interval.
    pub slow_down_step: Duration,
    pub viewers_every: Duration,
}

impl Endpoints {
    pub fn twitch() -> Self {
        Self {
            id: "https://id.twitch.tv".into(),
            api: "https://api.twitch.tv".into(),
            irc: "wss://irc-ws.chat.twitch.tv:443".into(),
            client_id: CLIENT_ID.into(),
            poll_floor: Duration::from_secs(1),
            slow_down_step: Duration::from_secs(5),
            viewers_every: Duration::from_secs(30),
        }
    }

    /// Endpoints nothing answers on (a refused address, which the guard blocks): for a server that must never reach Twitch.
    pub fn offline() -> Self {
        Self {
            id: "http://127.0.0.1:9".into(),
            api: "http://127.0.0.1:9".into(),
            irc: "ws://127.0.0.1:9".into(),
            ..Self::twitch()
        }
    }
}

/// What the device endpoint hands out for the user to approve.
#[derive(Debug, Clone, PartialEq)]
pub struct Device {
    pub device_code: String,
    pub user_code: String,
    pub verification_uri: String,
    pub expires_in: u64,
    pub interval: u64,
}

#[derive(Debug, Clone, PartialEq)]
pub struct Tokens {
    pub access_token: String,
    pub refresh_token: String,
    /// Ms since the epoch.
    pub expires_at: i64,
}

/// One poll of the token endpoint.
#[derive(Debug, Clone, PartialEq)]
pub enum Poll {
    Pending,
    SlowDown,
    /// Twitch had trouble (a 5xx): ask again.
    Retry,
    Done(Tokens),
    /// The sign-in is over, for this reason.
    Failed(String),
}

/// Why a refresh did not give new tokens.
#[derive(Debug, Clone, PartialEq)]
pub enum RefreshError {
    /// Twitch refuses the refresh token: the user has to sign in again.
    Rejected(String),
    /// Twitch could not be asked; the tokens may still be good.
    Unreachable(String),
}

/// Why a Helix read failed.
#[derive(Debug, Clone, PartialEq)]
pub enum ApiError {
    /// 401: the access token is no good (any more).
    Unauthorized,
    Failed(String),
}

fn url_of(base: &str, path: &str) -> Result<Url, String> {
    Url::parse(&format!("{base}{path}")).map_err(|_| "bad Twitch address".to_string())
}

async fn reach(client: &GuardedClient, url: &Url) -> Result<(), String> {
    client
        .check_target(url)
        .await
        .map_err(|e| format!("couldn't reach Twitch ({e})"))
}

async fn form(
    client: &GuardedClient,
    url: &Url,
    fields: &[(&str, &str)],
) -> Result<(u16, Value), String> {
    reach(client, url).await?;
    let reply = client
        .post_form(url, &[("Accept", "application/json")], fields, MAX_REPLY)
        .await
        .map_err(|e| format!("couldn't reach Twitch ({e})"))?;
    Ok((
        reply.status,
        serde_json::from_slice(&reply.body).unwrap_or(Value::Null),
    ))
}

fn text<'a>(v: &'a Value, key: &str) -> &'a str {
    v.get(key).and_then(Value::as_str).unwrap_or("")
}

/// Asks Twitch for a code to approve.
pub async fn start_device(client: &GuardedClient, ep: &Endpoints) -> Result<Device, String> {
    let url = url_of(&ep.id, "/oauth2/device")?;
    let (status, body) = form(
        client,
        &url,
        &[("client_id", &ep.client_id), ("scopes", SCOPES)],
    )
    .await?;
    let device = Device {
        device_code: text(&body, "device_code").to_string(),
        user_code: text(&body, "user_code").to_string(),
        verification_uri: text(&body, "verification_uri").to_string(),
        expires_in: body.get("expires_in").and_then(Value::as_u64).unwrap_or(0),
        interval: body.get("interval").and_then(Value::as_u64).unwrap_or(5),
    };
    if status != 200
        || device.device_code.is_empty()
        || device.user_code.is_empty()
        || device.verification_uri.is_empty()
        || device.expires_in == 0
    {
        return Err(format!("Twitch wouldn't start a sign-in ({status})"));
    }
    Ok(device)
}

/// What a token reply means for the sign-in, given when it arrived.
pub fn classify_poll(status: u16, body: &Value, now_ms: i64) -> Poll {
    if status == 200 && !text(body, "access_token").is_empty() {
        return Poll::Done(tokens_of(body, now_ms));
    }
    if status >= 500 {
        return Poll::Retry;
    }
    let message = [text(body, "message"), text(body, "error")]
        .join(" ")
        .to_ascii_lowercase();
    if message.contains("authorization_pending") {
        Poll::Pending
    } else if message.contains("slow_down") {
        Poll::SlowDown
    } else if message.contains("access_denied") {
        Poll::Failed("Sign-in was declined on Twitch.".into())
    } else if message.contains("expired") || message.contains("invalid device code") {
        Poll::Failed("The code expired. Start again.".into())
    } else {
        Poll::Failed(format!("Twitch refused the sign-in ({status})."))
    }
}

fn tokens_of(body: &Value, now_ms: i64) -> Tokens {
    let seconds = body
        .get("expires_in")
        .and_then(Value::as_i64)
        .unwrap_or(3600);
    Tokens {
        access_token: text(body, "access_token").to_string(),
        refresh_token: text(body, "refresh_token").to_string(),
        expires_at: now_ms + seconds * 1000,
    }
}

/// One poll of the token endpoint; `Err` when Twitch could not be asked (the caller tries again).
pub async fn poll_device(
    client: &GuardedClient,
    ep: &Endpoints,
    device: &Device,
    now_ms: i64,
) -> Result<Poll, String> {
    let url = url_of(&ep.id, "/oauth2/token")?;
    let fields = [
        ("client_id", ep.client_id.as_str()),
        ("device_code", device.device_code.as_str()),
        ("scopes", SCOPES),
        ("grant_type", "urn:ietf:params:oauth:grant-type:device_code"),
    ];
    let (status, body) = form(client, &url, &fields).await?;
    Ok(classify_poll(status, &body, now_ms))
}

/// New tokens for a refresh token (a public client needs no secret).
pub async fn refresh(
    client: &GuardedClient,
    ep: &Endpoints,
    refresh_token: &str,
    now_ms: i64,
) -> Result<Tokens, RefreshError> {
    let url = url_of(&ep.id, "/oauth2/token").map_err(RefreshError::Unreachable)?;
    let fields = [
        ("grant_type", "refresh_token"),
        ("refresh_token", refresh_token),
        ("client_id", ep.client_id.as_str()),
    ];
    let (status, body) = form(client, &url, &fields)
        .await
        .map_err(RefreshError::Unreachable)?;
    if status == 200 && !text(&body, "access_token").is_empty() {
        let mut tokens = tokens_of(&body, now_ms);
        if tokens.refresh_token.is_empty() {
            tokens.refresh_token = refresh_token.to_string();
        }
        return Ok(tokens);
    }
    match status {
        400 | 401 => Err(RefreshError::Rejected(text(&body, "message").to_string())),
        _ => Err(RefreshError::Unreachable(format!(
            "Twitch answered {status}"
        ))),
    }
}

/// Tells Twitch the token is no longer wanted; the answer is not looked at.
pub async fn revoke(client: &GuardedClient, ep: &Endpoints, token: &str) {
    if let Ok(url) = url_of(&ep.id, "/oauth2/revoke") {
        let _ = form(
            client,
            &url,
            &[("client_id", &ep.client_id), ("token", token)],
        )
        .await;
    }
}

/// A Helix GET as JSON.
pub async fn helix(
    client: &GuardedClient,
    ep: &Endpoints,
    path_and_query: &str,
    token: &str,
) -> Result<Value, ApiError> {
    let url = url_of(&ep.api, path_and_query).map_err(ApiError::Failed)?;
    reach(client, &url).await.map_err(ApiError::Failed)?;
    let bearer = format!("Bearer {token}");
    let headers = [
        ("Client-Id", ep.client_id.as_str()),
        ("Authorization", bearer.as_str()),
        ("Accept", "application/json"),
    ];
    let reply = client
        .get(&url, &headers, MAX_REPLY)
        .await
        .map_err(|e| ApiError::Failed(format!("couldn't reach Twitch ({e})")))?;
    match reply.status {
        200 => serde_json::from_slice(&reply.body)
            .map_err(|_| ApiError::Failed("Twitch sent something unreadable".into())),
        401 => Err(ApiError::Unauthorized),
        status => Err(ApiError::Failed(format!("Twitch answered {status}"))),
    }
}

/// Who a token belongs to: (login, user id).
pub async fn identity(
    client: &GuardedClient,
    ep: &Endpoints,
    token: &str,
) -> Result<(String, String), ApiError> {
    let body = helix(client, ep, "/helix/users", token).await?;
    let user = body.get("data").and_then(|d| d.get(0));
    let (login, id) = (
        user.map_or("", |u| text(u, "login")),
        user.map_or("", |u| text(u, "id")),
    );
    if login.is_empty() || id.is_empty() {
        return Err(ApiError::Failed("Twitch didn't say who you are".into()));
    }
    Ok((login.to_string(), id.to_string()))
}

/// Whether a channel is live, and its viewers.
pub async fn stream_info(
    client: &GuardedClient,
    ep: &Endpoints,
    token: &str,
    channel: &str,
) -> Result<(bool, u64), ApiError> {
    let query: String = url::form_urlencoded::Serializer::new(String::new())
        .append_pair("user_login", channel)
        .finish();
    let body = helix(client, ep, &format!("/helix/streams?{query}"), token).await?;
    let stream = body.get("data").and_then(|d| d.get(0));
    Ok((
        stream.is_some(),
        stream
            .and_then(|s| s.get("viewer_count"))
            .and_then(Value::as_u64)
            .unwrap_or(0),
    ))
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn classifies_the_token_endpoints_answers() {
        let pending = json!({ "status": 400, "message": "authorization_pending" });
        assert_eq!(classify_poll(400, &pending, 0), Poll::Pending);
        assert_eq!(
            classify_poll(400, &json!({ "message": "slow_down" }), 0),
            Poll::SlowDown
        );
        assert!(
            matches!(classify_poll(400, &json!({ "message": "access_denied" }), 0), Poll::Failed(m) if m.contains("declined"))
        );
        assert!(
            matches!(classify_poll(400, &json!({ "message": "invalid device code" }), 0), Poll::Failed(m) if m.contains("expired"))
        );
        assert!(classify_poll(500, &Value::Null, 0) == Poll::Retry);
        let done = json!({ "access_token": "a", "refresh_token": "r", "expires_in": 100, "scope": ["chat:read"] });
        assert_eq!(
            classify_poll(200, &done, 5000),
            Poll::Done(Tokens {
                access_token: "a".into(),
                refresh_token: "r".into(),
                expires_at: 105_000
            })
        );
    }
}
