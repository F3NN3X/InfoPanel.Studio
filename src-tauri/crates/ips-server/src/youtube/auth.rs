// YouTube's HTTP side: Google's OAuth for installed apps (the sign-in page the user opens, the code exchange, refresh and
// revoke; PKCE on a loopback redirect) and the YouTube Data API reads and writes. Every call goes through the guarded
// client; the base URLs are the caller's, so a test points them at a fake server. The client secret and the tokens are only
// ever sent to Google and never put in an error text.

use std::time::Duration;

use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use base64::Engine;
use serde_json::Value;
use sha2::{Digest, Sha256};
use url::Url;

use crate::guarded_net::GuardedClient;

pub const SCOPE: &str = "https://www.googleapis.com/auth/youtube.force-ssl";
const MAX_REPLY: usize = 256 * 1024;

/// Where Google is, and the pacing; the defaults are the real service.
#[derive(Debug, Clone)]
pub struct Endpoints {
    /// `https://accounts.google.com`
    pub accounts: String,
    /// `https://oauth2.googleapis.com`
    pub token: String,
    /// `https://www.googleapis.com`
    pub api: String,
    /// How often to look for a live broadcast while there is none.
    pub find_every: Duration,
    /// How often the viewers are read while live.
    pub viewers_every: Duration,
    /// The wait after a call that failed.
    pub retry_every: Duration,
    /// Replaces the user's chat refresh (a test's); `None` = the setting.
    pub chat_every: Option<Duration>,
}

impl Endpoints {
    pub fn google() -> Self {
        Self {
            accounts: "https://accounts.google.com".into(),
            token: "https://oauth2.googleapis.com".into(),
            api: "https://www.googleapis.com".into(),
            find_every: Duration::from_secs(60),
            viewers_every: Duration::from_secs(30),
            retry_every: Duration::from_secs(30),
            chat_every: None,
        }
    }

    /// Endpoints nothing answers on (a refused address, which the guard blocks): for a server that must never reach Google.
    pub fn offline() -> Self {
        Self {
            accounts: "http://127.0.0.1:9".into(),
            token: "http://127.0.0.1:9".into(),
            api: "http://127.0.0.1:9".into(),
            ..Self::google()
        }
    }
}

#[derive(Debug, Clone, PartialEq)]
pub struct Tokens {
    pub access_token: String,
    pub refresh_token: String,
    /// Ms since the epoch.
    pub expires_at: i64,
}

/// Why a refresh did not give new tokens.
#[derive(Debug, Clone, PartialEq)]
pub enum RefreshError {
    /// Google refuses the refresh token or the client: the user has to sign in again.
    Rejected(String),
    /// Google could not be asked; the tokens may still be good.
    Unreachable(String),
}

/// Why an API call failed.
#[derive(Debug, Clone, PartialEq)]
pub enum ApiError {
    /// 401: the access token is no good (any more).
    Unauthorized,
    /// 403 `quotaExceeded` / `dailyLimitExceeded`: the project's day is used up.
    Quota,
    /// The live chat is over, off or gone.
    ChatGone,
    Failed(String),
}

/// `n` random bytes as base64url, no padding (a v4 UUID is 16 bytes from the OS's random source).
pub fn random_token(n: usize) -> String {
    let mut bytes = Vec::with_capacity(n + 16);
    while bytes.len() < n {
        bytes.extend_from_slice(uuid::Uuid::new_v4().as_bytes());
    }
    URL_SAFE_NO_PAD.encode(&bytes[..n])
}

/// The PKCE challenge (S256) for a verifier.
pub fn challenge_of(verifier: &str) -> String {
    URL_SAFE_NO_PAD.encode(Sha256::digest(verifier.as_bytes()))
}

/// Whether two texts are equal, in time that does not depend on where they differ.
pub fn same_secret(a: &str, b: &str) -> bool {
    let (a, b) = (a.as_bytes(), b.as_bytes());
    let mut diff = a.len() ^ b.len();
    for i in 0..a.len().max(b.len()) {
        diff |= usize::from(a.get(i).copied().unwrap_or(0) ^ b.get(i).copied().unwrap_or(0));
    }
    diff == 0
}

/// The page Google asks the user to approve us on.
pub fn authorize_url(
    ep: &Endpoints,
    client_id: &str,
    redirect_uri: &str,
    state: &str,
    challenge: &str,
) -> Result<String, String> {
    let mut url = Url::parse(&format!("{}/o/oauth2/v2/auth", ep.accounts))
        .map_err(|_| "bad Google address".to_string())?;
    url.query_pairs_mut()
        .append_pair("client_id", client_id)
        .append_pair("redirect_uri", redirect_uri)
        .append_pair("response_type", "code")
        .append_pair("scope", SCOPE)
        .append_pair("state", state)
        .append_pair("code_challenge", challenge)
        .append_pair("code_challenge_method", "S256")
        .append_pair("access_type", "offline")
        .append_pair("prompt", "consent");
    Ok(url.into())
}

fn url_of(base: &str, path: &str) -> Result<Url, String> {
    Url::parse(&format!("{base}{path}")).map_err(|_| "bad Google address".to_string())
}

async fn reach(client: &GuardedClient, url: &Url) -> Result<(), String> {
    client
        .check_target(url)
        .await
        .map_err(|e| format!("couldn't reach Google ({e})"))
}

fn text<'a>(v: &'a Value, key: &str) -> &'a str {
    v.get(key).and_then(Value::as_str).unwrap_or("")
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
        .map_err(|e| format!("couldn't reach Google ({e})"))?;
    Ok((
        reply.status,
        serde_json::from_slice(&reply.body).unwrap_or(Value::Null),
    ))
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

/// What the user gave and Google sent back, once, for tokens.
pub struct Exchange<'a> {
    pub client_id: &'a str,
    pub client_secret: &'a str,
    pub code: &'a str,
    pub redirect_uri: &'a str,
    pub verifier: &'a str,
}

/// Trades the approval code for tokens.
pub async fn exchange_code(
    client: &GuardedClient,
    ep: &Endpoints,
    x: &Exchange<'_>,
    now_ms: i64,
) -> Result<Tokens, String> {
    let url = url_of(&ep.token, "/token")?;
    let fields = [
        ("code", x.code),
        ("client_id", x.client_id),
        ("client_secret", x.client_secret),
        ("redirect_uri", x.redirect_uri),
        ("grant_type", "authorization_code"),
        ("code_verifier", x.verifier),
    ];
    let (status, body) = form(client, &url, &fields).await?;
    let tokens = tokens_of(&body, now_ms);
    if status == 200 && !tokens.access_token.is_empty() {
        if tokens.refresh_token.is_empty() {
            return Err("Google gave no refresh token. Remove the app at myaccount.google.com/permissions and sign in again.".into());
        }
        return Ok(tokens);
    }
    let why = text(&body, "error");
    Err(if why.is_empty() {
        format!("Google refused the sign-in ({status}).")
    } else {
        format!("Google refused the sign-in ({status}, {why}).")
    })
}

/// New tokens for a refresh token.
pub async fn refresh(
    client: &GuardedClient,
    ep: &Endpoints,
    client_id: &str,
    client_secret: &str,
    refresh_token: &str,
    now_ms: i64,
) -> Result<Tokens, RefreshError> {
    let url = url_of(&ep.token, "/token").map_err(RefreshError::Unreachable)?;
    let fields = [
        ("grant_type", "refresh_token"),
        ("refresh_token", refresh_token),
        ("client_id", client_id),
        ("client_secret", client_secret),
    ];
    let (status, body) = form(client, &url, &fields)
        .await
        .map_err(RefreshError::Unreachable)?;
    if status == 200 && !text(&body, "access_token").is_empty() {
        let mut tokens = tokens_of(&body, now_ms);
        // Google does not send the refresh token again.
        if tokens.refresh_token.is_empty() {
            tokens.refresh_token = refresh_token.to_string();
        }
        return Ok(tokens);
    }
    match status {
        400 | 401 => Err(RefreshError::Rejected(text(&body, "error").to_string())),
        _ => Err(RefreshError::Unreachable(format!(
            "Google answered {status}"
        ))),
    }
}

/// Tells Google the token is no longer wanted; the answer is not looked at.
pub async fn revoke(client: &GuardedClient, ep: &Endpoints, token: &str) {
    if let Ok(url) = url_of(&ep.token, "/revoke") {
        let _ = form(client, &url, &[("token", token)]).await;
    }
}

/// What a Data API reply means: its JSON, or why not.
fn classify(status: u16, body: &[u8]) -> Result<Value, ApiError> {
    let json: Value = serde_json::from_slice(body).unwrap_or(Value::Null);
    if status == 200 {
        return if json.is_null() {
            Err(ApiError::Failed("YouTube sent something unreadable".into()))
        } else {
            Ok(json)
        };
    }
    if status == 401 {
        return Err(ApiError::Unauthorized);
    }
    let reason = json
        .pointer("/error/errors/0/reason")
        .and_then(Value::as_str)
        .or_else(|| json.pointer("/error/status").and_then(Value::as_str))
        .unwrap_or("");
    Err(match reason {
        "quotaExceeded" | "dailyLimitExceeded" => ApiError::Quota,
        "liveChatEnded" | "liveChatDisabled" | "liveChatNotFound" => ApiError::ChatGone,
        "" => ApiError::Failed(format!("YouTube answered {status}")),
        reason => ApiError::Failed(format!("YouTube answered {status} ({reason})")),
    })
}

/// A Data API GET as JSON.
pub async fn api_get(
    client: &GuardedClient,
    ep: &Endpoints,
    path_and_query: &str,
    token: &str,
) -> Result<Value, ApiError> {
    let url = url_of(&ep.api, path_and_query).map_err(ApiError::Failed)?;
    reach(client, &url).await.map_err(ApiError::Failed)?;
    let bearer = format!("Bearer {token}");
    let reply = client
        .get(
            &url,
            &[
                ("Authorization", bearer.as_str()),
                ("Accept", "application/json"),
            ],
            MAX_REPLY,
        )
        .await
        .map_err(|e| ApiError::Failed(format!("couldn't reach Google ({e})")))?;
    classify(reply.status, &reply.body)
}

/// A Data API POST of a JSON body, answered as JSON.
pub async fn api_post(
    client: &GuardedClient,
    ep: &Endpoints,
    path_and_query: &str,
    token: &str,
    body: &Value,
) -> Result<Value, ApiError> {
    let url = url_of(&ep.api, path_and_query).map_err(ApiError::Failed)?;
    reach(client, &url).await.map_err(ApiError::Failed)?;
    let bearer = format!("Bearer {token}");
    let reply = client
        .post_json(
            &url,
            &[
                ("Authorization", bearer.as_str()),
                ("Accept", "application/json"),
            ],
            &body.to_string(),
            MAX_REPLY,
        )
        .await
        .map_err(|e| ApiError::Failed(format!("couldn't reach Google ({e})")))?;
    classify(reply.status, &reply.body)
}

/// Who a token belongs to: (channel title, channel id).
pub async fn identity(
    client: &GuardedClient,
    ep: &Endpoints,
    token: &str,
) -> Result<(String, String), ApiError> {
    let body = api_get(
        client,
        ep,
        "/youtube/v3/channels?part=snippet&mine=true",
        token,
    )
    .await?;
    let channel = body.pointer("/items/0");
    let title = channel
        .and_then(|c| c.pointer("/snippet/title"))
        .and_then(Value::as_str)
        .unwrap_or("");
    let id = channel.map_or("", |c| text(c, "id"));
    if title.is_empty() || id.is_empty() {
        return Err(ApiError::Failed(
            "this Google account has no YouTube channel".into(),
        ));
    }
    Ok((title.to_string(), id.to_string()))
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn makes_url_safe_random_tokens_and_the_s256_challenge() {
        let (a, b) = (random_token(32), random_token(32));
        assert_eq!((a.len(), b.len()), (43, 43));
        assert_ne!(a, b);
        assert!(a
            .bytes()
            .all(|c| c.is_ascii_alphanumeric() || c == b'-' || c == b'_'));
        // RFC 7636 appendix B.
        assert_eq!(
            challenge_of("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk"),
            "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM"
        );
    }

    #[test]
    fn compares_secrets_whole() {
        assert!(same_secret("abc", "abc"));
        assert!(!same_secret("abc", "abd"));
        assert!(!same_secret("abc", "abcd"));
        assert!(!same_secret("", "a"));
        assert!(same_secret("", ""));
    }

    #[test]
    fn builds_the_sign_in_address_with_pkce_and_offline_access() {
        let url = authorize_url(
            &Endpoints::google(),
            "cid.apps",
            "http://127.0.0.1:3922/api/youtube/callback",
            "st",
            "ch",
        )
        .unwrap();
        let url = Url::parse(&url).unwrap();
        assert_eq!(
            (url.host_str(), url.path()),
            (Some("accounts.google.com"), "/o/oauth2/v2/auth")
        );
        let q: std::collections::HashMap<_, _> = url.query_pairs().into_owned().collect();
        for (k, v) in [
            ("client_id", "cid.apps"),
            ("redirect_uri", "http://127.0.0.1:3922/api/youtube/callback"),
            ("response_type", "code"),
            ("scope", SCOPE),
            ("state", "st"),
            ("code_challenge", "ch"),
            ("code_challenge_method", "S256"),
            ("access_type", "offline"),
            ("prompt", "consent"),
        ] {
            assert_eq!(q.get(k).map(String::as_str), Some(v), "{k}");
        }
    }

    #[test]
    fn classifies_what_the_api_answers() {
        let body = |reason: &str| {
            json!({ "error": { "errors": [{ "reason": reason }] } })
                .to_string()
                .into_bytes()
        };
        assert_eq!(
            classify(200, br#"{"items":[]}"#),
            Ok(json!({ "items": [] }))
        );
        assert_eq!(classify(401, b"{}"), Err(ApiError::Unauthorized));
        assert_eq!(classify(403, &body("quotaExceeded")), Err(ApiError::Quota));
        assert_eq!(
            classify(403, &body("dailyLimitExceeded")),
            Err(ApiError::Quota)
        );
        assert_eq!(
            classify(403, &body("liveChatEnded")),
            Err(ApiError::ChatGone)
        );
        assert_eq!(
            classify(404, &body("liveChatNotFound")),
            Err(ApiError::ChatGone)
        );
        assert_eq!(
            classify(403, &body("forbidden")),
            Err(ApiError::Failed("YouTube answered 403 (forbidden)".into()))
        );
        assert_eq!(
            classify(500, b"oops"),
            Err(ApiError::Failed("YouTube answered 500".into()))
        );
        assert!(matches!(classify(200, b"oops"), Err(ApiError::Failed(_))));
    }
}
