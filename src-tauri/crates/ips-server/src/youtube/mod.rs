// YouTube for the Stream Chat widget and the Streaming chip: the user's own Google client signs in through the browser (OAuth
// with PKCE on a loopback redirect, auth.rs), then one loop finds the live broadcast, reads its viewers and its chat within
// the project's daily quota (quota.rs, messages.rs). The sign-in's tokens and the client secret are kept in the integrations
// file (streaming.youtube) and nowhere else: not in the studio's view, the extras, the chat stream or the log. The status
// kiosks get is in `status`; the chat window is read by the chat hub (`chat_parts`), which merges it with Twitch's.

pub mod auth;
pub mod messages;
pub mod quota;
pub mod routes;
#[cfg(test)]
mod tests;

use std::collections::HashMap;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex, MutexGuard, OnceLock, PoisonError};
use std::time::{Duration, Instant};

use serde_json::{json, Value};
use tokio::sync::watch;
use tokio::task::JoinHandle;
use tokio::time::Instant as Tick;

use crate::config::now_ms;
use crate::guarded_net::GuardedClient;
use crate::streaming::{YoutubeAuth, YoutubeSettings};
use crate::supervisor;
use crate::twitch::chat::Window;
use crate::twitch::irc::{Entry, Message};
use auth::{ApiError, Endpoints, RefreshError};
use messages::Event;
use quota::Quota;

/// A token this close to running out is refreshed before it is used.
const REFRESH_AHEAD_MS: i64 = 5 * 60 * 1000;
/// How long the sign-in page Google was asked for stays good.
const PENDING_MS: i64 = 10 * 60 * 1000;
pub const QUOTA_MESSAGE: &str =
    "YouTube's daily API quota is used up; it resets at midnight Pacific.";
/// Units each call costs.
const COST_LIST: u64 = 1;
const COST_CHAT_LIST: u64 = 5;
const COST_CHAT_INSERT: u64 = 50;

/// A sign-in page waiting for Google to send the user back.
#[derive(Debug, Clone)]
struct Pending {
    id: u64,
    state: String,
    verifier: String,
    redirect_uri: String,
    auth_url: String,
    /// Ms since the epoch.
    expires_at: i64,
    /// A callback with the right state came; a second one is refused.
    used: bool,
}

/// The broadcast being watched.
#[derive(Debug, Clone, PartialEq)]
struct Live {
    video_id: String,
    /// "" = the broadcast has no chat.
    chat_id: String,
}

#[derive(Default)]
struct Inner {
    settings: YoutubeSettings,
    pending: Option<Pending>,
    /// Bumped by every sign-out or cancel, so a sign-in started before it can tell.
    generation: u64,
    error: Option<String>,
    live: Option<Live>,
    viewers: u64,
    /// The chat is being read.
    connected: bool,
    window: Window,
    quota: Quota,
}

impl Inner {
    fn signed_in(&self) -> bool {
        !self.settings.auth.access_token.is_empty()
    }

    fn configured(&self) -> bool {
        !self.settings.client_id.is_empty() && !self.settings.client_secret.is_empty()
    }

    fn pending_open(&self, now: i64) -> bool {
        self.pending.as_ref().is_some_and(|p| p.expires_at > now)
    }
}

/// Why a sign-in could not start.
#[derive(Debug, PartialEq)]
pub enum SigninError {
    /// The Google client is not entered yet.
    NotConfigured,
    /// One is under way.
    Busy,
    Failed(String),
}

/// How a callback from Google's sign-in page ended, when not in a sign-in.
#[derive(Debug, PartialEq)]
pub enum CallbackError {
    /// Not the sign-in we are waiting for (wrong or used state, expired, none under way).
    Invalid,
    /// The user said no on Google's page.
    Declined(String),
    Failed(String),
}

/// Why a message was not sent.
#[derive(Debug, PartialEq)]
pub enum SendError {
    Invalid(String),
    /// Not signed in, or no live chat to write to.
    NotLive,
    Failed(String),
}

#[derive(Clone, Copy)]
enum Call<'a> {
    Get(&'a str),
    Post(&'a str, &'a Value),
}

pub struct Youtube {
    ep: Endpoints,
    client: GuardedClient,
    /// Ms since the epoch; a test holds it.
    now: Box<dyn Fn() -> i64 + Send + Sync>,
    inner: Mutex<Inner>,
    /// Stores the sign-in. Called with no lock held (the store tells its listeners, which come back here).
    persist: Box<dyn Fn(YoutubeAuth) + Send + Sync>,
    /// Tells the extras the status changed.
    on_change: Box<dyn Fn() + Send + Sync>,
    /// Tells the chat hub the window changed; set once.
    on_chat: OnceLock<Box<dyn Fn() + Send + Sync>>,
    refresh_lock: tokio::sync::Mutex<()>,
    /// Bumped when the loop must look again: a sign-in or -out, a new client.
    kick: watch::Sender<u64>,
    next_id: AtomicU64,
    /// When each repeating failure was last logged.
    warned: Mutex<HashMap<&'static str, Instant>>,
}

fn locked<T>(m: &Mutex<T>) -> MutexGuard<'_, T> {
    m.lock().unwrap_or_else(PoisonError::into_inner)
}

/// A value for a query string.
fn enc(value: &str) -> String {
    url::form_urlencoded::byte_serialize(value.as_bytes()).collect()
}

fn per_hour(every: Duration) -> u64 {
    (3600.0 / every.as_secs_f64().max(0.001)).round() as u64
}

impl Youtube {
    pub fn new(
        ep: Endpoints,
        client: GuardedClient,
        settings: YoutubeSettings,
        persist: impl Fn(YoutubeAuth) + Send + Sync + 'static,
        on_change: impl Fn() + Send + Sync + 'static,
    ) -> Arc<Self> {
        Self::with_clock(ep, client, settings, now_ms, persist, on_change)
    }

    /// `new` on the given clock (ms since the epoch).
    pub fn with_clock(
        ep: Endpoints,
        client: GuardedClient,
        settings: YoutubeSettings,
        now: impl Fn() -> i64 + Send + Sync + 'static,
        persist: impl Fn(YoutubeAuth) + Send + Sync + 'static,
        on_change: impl Fn() + Send + Sync + 'static,
    ) -> Arc<Self> {
        Arc::new(Self {
            ep,
            client,
            now: Box::new(now),
            inner: Mutex::new(Inner {
                settings,
                ..Inner::default()
            }),
            persist: Box::new(persist),
            on_change: Box::new(on_change),
            on_chat: OnceLock::new(),
            refresh_lock: tokio::sync::Mutex::new(()),
            kick: watch::channel(0).0,
            next_id: AtomicU64::new(1),
            warned: Mutex::default(),
        })
    }

    /// Runs `f` after every change to the chat window (once; a second call is ignored).
    pub fn set_chat_hook(&self, f: impl Fn() + Send + Sync + 'static) {
        let _ = self.on_chat.set(Box::new(f));
    }

    fn now(&self) -> i64 {
        (self.now)()
    }

    /// The units an hour the current polling costs: the broadcast search while off air, the viewers and the chat while live.
    fn estimate(&self, i: &Inner, blocked: bool) -> u64 {
        if !i.signed_in() || !i.configured() || blocked {
            return 0;
        }
        if i.live.is_none() {
            return per_hour(self.ep.find_every) * COST_LIST;
        }
        per_hour(self.chat_every(i)) * COST_CHAT_LIST + per_hour(self.ep.viewers_every) * COST_LIST
    }

    /// The wait the user chose between two reads of the chat.
    fn chat_every(&self, i: &Inner) -> Duration {
        self.ep
            .chat_every
            .unwrap_or(Duration::from_secs(i.settings.chat_interval))
    }

    /// The status in the extras. It carries no secret.
    pub fn status(&self) -> Value {
        let now = self.now();
        let mut i = locked(&self.inner);
        let used = i.quota.used(now);
        let blocked = i.quota.blocked_until(now).is_some();
        json!({
            "clientConfigured": i.configured(),
            "signedIn": i.signed_in(),
            "channel": i.settings.auth.channel,
            "live": i.live.is_some(),
            "viewers": i.viewers,
            "connected": i.connected,
            "error": i.error,
            "pending": i.pending_open(now),
            "quota": { "used": used, "estimatePerHour": self.estimate(&i, blocked) },
        })
    }

    /// The chat window, oldest first, and this platform's connection (null until signed in).
    pub fn chat_parts(&self) -> (Vec<Message>, Option<Value>) {
        let i = locked(&self.inner);
        let platform = i
            .signed_in()
            .then(|| json!({ "connected": i.connected, "channel": i.settings.auth.channel }));
        (i.window.messages(), platform)
    }

    fn publish_status(&self) {
        (self.on_change)();
    }

    fn publish_chat(&self) {
        if let Some(hook) = self.on_chat.get() {
            hook();
        }
    }

    fn publish_all(&self) {
        self.publish_chat();
        self.publish_status();
    }

    fn kick(&self) {
        self.kick.send_modify(|n| *n += 1);
    }

    // ---- sign-in ----

    /// Starts a sign-in: the address on Google where the user approves, which comes back to this server on `port`.
    pub fn signin(&self, port: u16) -> Result<String, SigninError> {
        let now = self.now();
        let url = {
            let mut i = locked(&self.inner);
            if !i.configured() {
                return Err(SigninError::NotConfigured);
            }
            if i.pending_open(now) {
                return Err(SigninError::Busy);
            }
            let (state, verifier) = (auth::random_token(32), auth::random_token(32));
            let redirect_uri = format!("http://127.0.0.1:{port}/api/youtube/callback");
            let auth_url = auth::authorize_url(
                &self.ep,
                &i.settings.client_id,
                &redirect_uri,
                &state,
                &auth::challenge_of(&verifier),
            )
            .map_err(SigninError::Failed)?;
            i.error = None;
            i.pending = Some(Pending {
                id: self.next_id.fetch_add(1, Ordering::SeqCst),
                state,
                verifier,
                redirect_uri,
                auth_url: auth_url.clone(),
                expires_at: now + PENDING_MS,
                used: false,
            });
            auth_url
        };
        self.publish_status();
        Ok(url)
    }

    /// Google sent the user back: checks it is the sign-in asked for, trades the code for tokens and finishes.
    pub async fn callback(
        &self,
        code: Option<&str>,
        state: Option<&str>,
        error: Option<&str>,
    ) -> Result<(), CallbackError> {
        let now = self.now();
        let (id, verifier, redirect_uri, generation, client_id, client_secret) = {
            let mut i = locked(&self.inner);
            let (client_id, client_secret, generation) = (
                i.settings.client_id.clone(),
                i.settings.client_secret.clone(),
                i.generation,
            );
            // A stray or stale request leaves a real sign-in alone.
            let Some(p) = i.pending.as_mut().filter(|p| {
                !p.used
                    && p.expires_at > now
                    && state.is_some_and(|s| auth::same_secret(&p.state, s))
            }) else {
                return Err(CallbackError::Invalid);
            };
            p.used = true;
            let (id, verifier, redirect_uri) = (p.id, p.verifier.clone(), p.redirect_uri.clone());
            let refused = match (
                error.filter(|e| !e.is_empty()),
                code.filter(|c| !c.is_empty()),
            ) {
                (Some(why), _) => {
                    Some((format!("Google sign-in was not completed ({why})."), true))
                }
                (None, None) => Some(("Google sent no code.".to_string(), false)),
                (None, Some(_)) => None,
            };
            if let Some((message, declined)) = refused {
                i.error = Some(message.clone());
                i.pending = None;
                drop(i);
                self.publish_status();
                return Err(if declined {
                    CallbackError::Declined(message)
                } else {
                    CallbackError::Failed(message)
                });
            }
            (
                id,
                verifier,
                redirect_uri,
                generation,
                client_id,
                client_secret,
            )
        };
        let code = code.unwrap_or_default();
        let tokens = auth::exchange_code(
            &self.client,
            &self.ep,
            &auth::Exchange {
                client_id: &client_id,
                client_secret: &client_secret,
                code,
                redirect_uri: &redirect_uri,
                verifier: &verifier,
            },
            self.now(),
        )
        .await;
        let result = match tokens {
            Ok(tokens) => {
                self.spend(COST_LIST);
                auth::identity(&self.client, &self.ep, &tokens.access_token)
                    .await
                    .map(|who| (tokens, who))
                    .map_err(|e| match e {
                        ApiError::Unauthorized => {
                            "Google didn't accept the new sign-in.".to_string()
                        }
                        ApiError::Quota => QUOTA_MESSAGE.to_string(),
                        ApiError::ChatGone => "YouTube didn't say who you are.".to_string(),
                        ApiError::Failed(message) => format!("Signed in, but {message}."),
                    })
            }
            Err(message) => Err(message),
        };
        match result {
            Ok((tokens, (channel, channel_id))) => {
                let auth = YoutubeAuth {
                    access_token: tokens.access_token.clone(),
                    refresh_token: tokens.refresh_token,
                    expires_at: tokens.expires_at,
                    channel,
                    channel_id,
                };
                if self.finish_signin(id, generation, auth.clone()) {
                    return Ok(());
                }
                // Signed out or cancelled while Google was answering: the new tokens are not wanted.
                let (client, ep) = (self.client.clone(), self.ep.clone());
                tokio::spawn(async move { auth::revoke(&client, &ep, &auth.refresh_token).await });
                Err(CallbackError::Failed("The sign-in was cancelled.".into()))
            }
            Err(message) => {
                {
                    let mut i = locked(&self.inner);
                    if i.pending.as_ref().is_some_and(|p| p.id == id) {
                        i.pending = None;
                        i.error = Some(message.clone());
                    }
                }
                self.publish_status();
                Err(CallbackError::Failed(message))
            }
        }
    }

    /// Takes the new sign-in unless it was cancelled or signed out meanwhile.
    fn finish_signin(&self, id: u64, generation: u64, auth: YoutubeAuth) -> bool {
        {
            let mut i = locked(&self.inner);
            if i.generation != generation || i.pending.as_ref().is_none_or(|p| p.id != id) {
                return false;
            }
            i.pending = None;
            i.error = None;
            i.settings.auth = auth.clone();
            i.window.clear_all();
            i.live = None;
            i.viewers = 0;
            i.connected = false;
        }
        (self.persist)(auth);
        self.kick();
        self.publish_all();
        true
    }

    /// The sign-in under way, for the Settings page: the address that was opened and when it runs out.
    pub fn pending_json(&self) -> Value {
        let now = self.now();
        let expired = {
            let mut i = locked(&self.inner);
            let expired = i.pending.as_ref().is_some_and(|p| p.expires_at <= now);
            if expired {
                i.pending = None;
                i.error = Some("The sign-in took too long. Start again.".into());
            }
            expired
        };
        if expired {
            self.publish_status();
        }
        let i = locked(&self.inner);
        let pending = i
            .pending
            .as_ref()
            .map(|p| json!({ "auth_url": p.auth_url, "expires_at": p.expires_at }));
        json!({ "pending": pending, "error": i.error })
    }

    /// Ends a sign-in under way, or signs out: the tokens are forgotten here and in the file, and Google is told (best effort).
    pub fn signout(&self) {
        let old = self.clear(None, true);
        let token = if old.refresh_token.is_empty() {
            old.access_token
        } else {
            old.refresh_token
        };
        if !token.is_empty() {
            let (client, ep) = (self.client.clone(), self.ep.clone());
            tokio::spawn(async move { auth::revoke(&client, &ep, &token).await });
        }
    }

    /// Signs out for a reason the user is shown (their sign-in no longer works).
    fn signed_out(&self, reason: &str) {
        self.clear(Some(reason.to_string()), true);
    }

    /// Forgets the sign-in and everything it fetched. `persist` says whether the file is told (a save of the client already
    /// dropped the tokens from it).
    fn clear(&self, reason: Option<String>, persist: bool) -> YoutubeAuth {
        let old = {
            let mut i = locked(&self.inner);
            let old = std::mem::take(&mut i.settings.auth);
            i.generation += 1;
            i.pending = None;
            i.error = reason;
            i.live = None;
            i.viewers = 0;
            i.connected = false;
            i.window.clear_all();
            old
        };
        if persist {
            (self.persist)(YoutubeAuth::default());
        }
        self.kick();
        self.publish_all();
        old
    }

    /// The saved settings changed (a studio save): takes the client and the chat refresh. Another client ends the sign-in,
    /// whose tokens belong to the old one.
    pub fn sync(&self, next: &YoutubeSettings) {
        let client_changed = {
            let mut i = locked(&self.inner);
            let changed = i.settings.client_id != next.client_id
                || i.settings.client_secret != next.client_secret;
            i.settings.client_id = next.client_id.clone();
            i.settings.client_secret = next.client_secret.clone();
            i.settings.chat_interval = next.chat_interval;
            changed
        };
        if client_changed {
            self.clear(None, false);
        } else {
            self.publish_status();
        }
    }

    // ---- tokens ----

    /// An access token that is good now: refreshed first when it is about to run out.
    async fn access_token(&self) -> Result<String, String> {
        let (token, expires_at) = {
            let i = locked(&self.inner);
            (
                i.settings.auth.access_token.clone(),
                i.settings.auth.expires_at,
            )
        };
        if token.is_empty() {
            return Err("not signed in".into());
        }
        if expires_at - self.now() > REFRESH_AHEAD_MS {
            return Ok(token);
        }
        match self.refresh_stale(&token).await {
            // Google could not be asked and the token still works; a refused refresh has signed the user out instead.
            Err(_)
                if expires_at > self.now()
                    && locked(&self.inner).settings.auth.access_token == token =>
            {
                Ok(token)
            }
            other => other,
        }
    }

    /// New tokens in place of `stale`, unless someone already got them. A refresh Google refuses is a sign-out.
    async fn refresh_stale(&self, stale: &str) -> Result<String, String> {
        let _one_at_a_time = self.refresh_lock.lock().await;
        let (refresh_token, client_id, client_secret) = {
            let i = locked(&self.inner);
            if !i.signed_in() {
                return Err("not signed in".into());
            }
            if i.settings.auth.access_token != stale {
                return Ok(i.settings.auth.access_token.clone());
            }
            (
                i.settings.auth.refresh_token.clone(),
                i.settings.client_id.clone(),
                i.settings.client_secret.clone(),
            )
        };
        match auth::refresh(
            &self.client,
            &self.ep,
            &client_id,
            &client_secret,
            &refresh_token,
            self.now(),
        )
        .await
        {
            Ok(tokens) => {
                // A sign-out or a newer sign-in may have come while Google was answering; then these tokens are not wanted.
                let next = {
                    let mut i = locked(&self.inner);
                    if !i.signed_in() || i.settings.auth.refresh_token != refresh_token {
                        None
                    } else {
                        i.settings.auth.access_token = tokens.access_token.clone();
                        i.settings.auth.refresh_token = tokens.refresh_token.clone();
                        i.settings.auth.expires_at = tokens.expires_at;
                        Some(i.settings.auth.clone())
                    }
                };
                let Some(next) = next else {
                    let (client, ep) = (self.client.clone(), self.ep.clone());
                    tokio::spawn(
                        async move { auth::revoke(&client, &ep, &tokens.access_token).await },
                    );
                    return Err("signed out".into());
                };
                (self.persist)(next);
                Ok(tokens.access_token)
            }
            Err(RefreshError::Rejected(_)) => {
                // Only the sign-in that was refreshed is ended, not a newer one.
                if locked(&self.inner).settings.auth.refresh_token == refresh_token {
                    self.signed_out("Your Google sign-in ran out. Sign in again.");
                }
                Err("sign-in ran out".into())
            }
            Err(RefreshError::Unreachable(message)) => Err(message),
        }
    }

    // ---- quota and calls ----

    fn spend(&self, cost: u64) {
        let now = self.now();
        locked(&self.inner).quota.spend(now, cost);
    }

    fn blocked(&self) -> bool {
        let now = self.now();
        locked(&self.inner).quota.blocked_until(now).is_some()
    }

    /// Google said the day's quota is used up: nothing is asked until the next midnight Pacific.
    fn exhaust(&self) {
        let now = self.now();
        let reset = {
            let mut i = locked(&self.inner);
            let reset = i.quota.exhaust(now);
            i.error = Some(QUOTA_MESSAGE.into());
            i.connected = false;
            reset
        };
        log::warn!(target: "server", "youtube: the daily quota is used up; asking again at {reset} (ms since the epoch)");
        self.publish_status();
    }

    /// One Data API call as the signed-in user, counted against the quota. A 401 refreshes the token once and asks again; a
    /// day's quota used up stops all calls (`exhaust`).
    async fn call(&self, call: Call<'_>, cost: u64) -> Result<Value, ApiError> {
        if self.blocked() {
            return Err(ApiError::Quota);
        }
        let mut token = self.access_token().await.map_err(ApiError::Failed)?;
        for attempt in 0..2 {
            self.spend(cost);
            let answer = match call {
                Call::Get(path) => auth::api_get(&self.client, &self.ep, path, &token).await,
                Call::Post(path, body) => {
                    auth::api_post(&self.client, &self.ep, path, &token, body).await
                }
            };
            match answer {
                Err(ApiError::Unauthorized) if attempt == 0 => {
                    token = self.refresh_stale(&token).await.map_err(ApiError::Failed)?
                }
                Err(ApiError::Unauthorized) => break,
                Err(ApiError::Quota) => {
                    self.exhaust();
                    return Err(ApiError::Quota);
                }
                other => return other,
            }
        }
        Err(ApiError::Failed("YouTube didn't accept the sign-in".into()))
    }

    /// Logs a failure that repeats: the first time, then at most once a minute while it goes on.
    fn warn_throttled(&self, key: &'static str, message: &str) {
        let mut warned = locked(&self.warned);
        if warned
            .get(key)
            .is_some_and(|at| at.elapsed() < Duration::from_secs(60))
        {
            return;
        }
        warned.insert(key, Instant::now());
        log::warn!(target: "server", "youtube {key}: {message}");
    }

    /// A repeating failure stopped: the next one is logged at once.
    fn recovered(&self, key: &'static str) {
        locked(&self.warned).remove(key);
    }

    // ---- chat ----

    /// Sends a chat message as the signed-in user to the live chat.
    pub async fn send(&self, text: &str) -> Result<(), SendError> {
        let text = messages::validate_send(text).map_err(SendError::Invalid)?;
        let (chat_id, name, channel_id) = {
            let i = locked(&self.inner);
            let chat_id = i
                .live
                .as_ref()
                .map(|l| l.chat_id.clone())
                .filter(|c| !c.is_empty());
            match chat_id {
                Some(chat_id) if i.signed_in() => (
                    chat_id,
                    i.settings.auth.channel.clone(),
                    i.settings.auth.channel_id.clone(),
                ),
                _ => return Err(SendError::NotLive),
            }
        };
        let body = json!({ "snippet": { "liveChatId": chat_id, "type": "textMessageEvent", "textMessageDetails": { "messageText": text } } });
        let sent = self
            .call(
                Call::Post("/youtube/v3/liveChat/messages?part=snippet", &body),
                COST_CHAT_INSERT,
            )
            .await;
        match sent {
            Ok(reply) => {
                // YouTube lists our message in the next page too: the same id keeps it from showing twice.
                let id = reply
                    .get("id")
                    .and_then(Value::as_str)
                    .filter(|id| !id.is_empty())
                    .map_or_else(|| format!("local-{}", uuid::Uuid::new_v4()), str::to_string);
                self.add(Entry {
                    message: Message {
                        id,
                        platform: "youtube",
                        user: name,
                        text,
                        color: String::new(),
                        badge: "broadcaster",
                        ts: messages::published_ms(reply.get("snippet"), self.now()),
                    },
                    login: channel_id,
                });
                Ok(())
            }
            Err(ApiError::Quota) => Err(SendError::Failed(QUOTA_MESSAGE.into())),
            Err(ApiError::ChatGone) => Err(SendError::NotLive),
            Err(ApiError::Unauthorized) => Err(SendError::Failed(
                "YouTube didn't accept the sign-in.".into(),
            )),
            Err(ApiError::Failed(message)) => Err(SendError::Failed(message)),
        }
    }

    /// Adds a message to the window and publishes the chat.
    fn add(&self, entry: Entry) {
        locked(&self.inner).window.push(entry);
        self.publish_chat();
    }

    /// Puts a page's events in the window, in order; the chat is connected once a page has come.
    fn apply(&self, events: Vec<Event>) {
        let was_connected = {
            let mut i = locked(&self.inner);
            for event in events {
                match event {
                    Event::Message(entry) => i.window.push(entry),
                    Event::Deleted(id) => i.window.remove(&id),
                    Event::Banned(channel_id) => i.window.clear_user(&channel_id),
                }
            }
            std::mem::replace(&mut i.connected, true)
        };
        self.publish_chat();
        if !was_connected {
            self.publish_status();
        }
    }

    fn set_connected(&self, connected: bool) {
        {
            let mut i = locked(&self.inner);
            if i.connected == connected {
                return;
            }
            i.connected = connected;
        }
        self.publish_status();
    }

    fn set_viewers(&self, viewers: u64) {
        {
            let mut i = locked(&self.inner);
            if i.viewers == viewers {
                return;
            }
            i.viewers = viewers;
        }
        self.publish_status();
    }

    /// A broadcast started (a fresh chat) or ended (no viewers, no chat connection).
    fn set_live(&self, live: Option<Live>) {
        let started = {
            let mut i = locked(&self.inner);
            if i.live == live {
                return;
            }
            let started = i.live.is_none() && live.is_some();
            if live.is_none() {
                i.viewers = 0;
                i.connected = false;
            }
            if started {
                i.window.clear_all();
            }
            i.live = live;
            started
        };
        if started {
            self.publish_chat();
        }
        self.publish_status();
    }

    // ---- the loop ----

    /// Starts the live search, viewers and chat loop under the supervisor.
    pub fn start(self: &Arc<Self>, shutdown: &watch::Receiver<bool>) -> JoinHandle<()> {
        let youtube = Arc::clone(self);
        supervisor::spawn("youtube", shutdown.clone(), move || {
            let youtube = Arc::clone(&youtube);
            async move { youtube.run().await }
        })
    }

    /// What the loop should do now.
    fn stage(&self) -> Stage {
        let now = self.now();
        let (stage, lifted) = {
            let mut i = locked(&self.inner);
            if !i.signed_in() || !i.configured() {
                (Stage::Idle, false)
            } else if let Some(until) = i.quota.blocked_until(now) {
                (Stage::Blocked(until), false)
            } else {
                let lifted = i.error.as_deref() == Some(QUOTA_MESSAGE);
                if lifted {
                    i.error = None;
                }
                (i.live.clone().map_or(Stage::Searching, Stage::Live), lifted)
            }
        };
        if lifted {
            self.publish_status();
        }
        stage
    }

    /// Nothing is fetched now: no live broadcast, no viewers, no chat connection.
    fn go_offline(&self) {
        let changed = {
            let mut i = locked(&self.inner);
            let changed = i.live.is_some() || i.connected || i.viewers != 0;
            i.live = None;
            i.viewers = 0;
            i.connected = false;
            changed
        };
        if changed {
            self.publish_status();
        }
    }

    async fn run(self: Arc<Self>) {
        let mut kick = self.kick.subscribe();
        loop {
            match self.stage() {
                Stage::Idle => {
                    self.go_offline();
                    let _ = kick.changed().await;
                }
                Stage::Blocked(until) => {
                    self.go_offline();
                    // The reset is looked for at least as often as a broadcast is.
                    let left = Duration::from_millis((until - self.now()).max(50) as u64)
                        .min(self.ep.find_every);
                    nap(&mut kick, left).await;
                }
                Stage::Searching => {
                    let wait = self.find().await;
                    nap(&mut kick, wait).await;
                }
                Stage::Live(live) => self.watch(&mut kick, live).await,
            }
        }
    }

    /// Looks for the user's live broadcast; the time to wait before looking again.
    async fn find(&self) -> Duration {
        match self
            .call(
                Call::Get("/youtube/v3/liveBroadcasts?part=snippet&broadcastStatus=active"),
                COST_LIST,
            )
            .await
        {
            Ok(body) => {
                self.recovered("find");
                match body.pointer("/items/0") {
                    Some(item) => {
                        let text = |p: &str| {
                            item.pointer(p)
                                .and_then(Value::as_str)
                                .unwrap_or("")
                                .to_string()
                        };
                        self.set_live(Some(Live {
                            video_id: text("/id"),
                            chat_id: text("/snippet/liveChatId"),
                        }));
                        Duration::ZERO
                    }
                    None => self.ep.find_every,
                }
            }
            // The loop sees the block and waits for the reset.
            Err(ApiError::Quota) => Duration::ZERO,
            Err(e) => {
                self.warn_throttled("find", &format!("{e:?}"));
                self.ep.retry_every
            }
        }
    }

    /// Reads the viewers and the chat of a live broadcast until it ends, the quota runs out or the sign-in changes.
    async fn watch(&self, kick: &mut watch::Receiver<u64>, live: Live) {
        let mut page_token = String::new();
        let mut chat_on = !live.chat_id.is_empty();
        let (mut next_chat, mut next_viewers) = (Tick::now(), Tick::now());
        loop {
            let due = if chat_on {
                next_chat.min(next_viewers)
            } else {
                next_viewers
            };
            tokio::select! {
                _ = tokio::time::sleep_until(due) => {}
                _ = kick.changed() => return,
            }
            if chat_on && Tick::now() >= next_chat {
                match self.read_chat(&live.chat_id, &page_token).await {
                    Ok((token, wait)) => {
                        self.recovered("chat");
                        (page_token, next_chat) = (token, Tick::now() + wait);
                    }
                    Err(ApiError::Quota) => return,
                    // The chat is over or off; the broadcast may still be on, so the viewers go on.
                    Err(ApiError::ChatGone) => {
                        chat_on = false;
                        self.set_connected(false);
                    }
                    Err(e) => {
                        self.warn_throttled("chat", &format!("{e:?}"));
                        self.set_connected(false);
                        // The next page starts from the latest again; what is seen twice is dropped by its id.
                        (page_token, next_chat) =
                            (String::new(), Tick::now() + self.ep.retry_every);
                    }
                }
            }
            if Tick::now() >= next_viewers {
                match self.read_viewers(&live.video_id).await {
                    Ok(Some(viewers)) => {
                        self.recovered("viewers");
                        self.set_viewers(viewers);
                        next_viewers = Tick::now() + self.ep.viewers_every;
                    }
                    Ok(None) => {
                        self.set_live(None);
                        return;
                    }
                    Err(ApiError::Quota) => return,
                    Err(e) => {
                        self.warn_throttled("viewers", &format!("{e:?}"));
                        next_viewers = Tick::now() + self.ep.retry_every;
                    }
                }
            }
            if locked(&self.inner).live.as_ref() != Some(&live) {
                return;
            }
        }
    }

    /// One page of the chat: the token for the next and how long to wait for it.
    async fn read_chat(&self, chat_id: &str, token: &str) -> Result<(String, Duration), ApiError> {
        let mut path = format!(
            "/youtube/v3/liveChat/messages?part=snippet,authorDetails&maxResults=200&liveChatId={}",
            enc(chat_id)
        );
        if !token.is_empty() {
            path.push_str(&format!("&pageToken={}", enc(token)));
        }
        let body = self.call(Call::Get(&path), COST_CHAT_LIST).await?;
        let page = messages::parse_page(&body, self.now());
        let wait = self
            .chat_every(&locked(&self.inner))
            .max(Duration::from_millis(page.polling_ms));
        self.apply(page.events);
        Ok((page.next_token, wait))
    }

    /// The broadcast's viewers, or `None` once it has ended.
    async fn read_viewers(&self, video_id: &str) -> Result<Option<u64>, ApiError> {
        let body = self
            .call(
                Call::Get(&format!(
                    "/youtube/v3/videos?part=liveStreamingDetails&id={}",
                    enc(video_id)
                )),
                COST_LIST,
            )
            .await?;
        let Some(details) = body.pointer("/items/0/liveStreamingDetails") else {
            return Ok(None);
        };
        if details.get("actualEndTime").is_some() {
            return Ok(None);
        }
        // The count is a string, and absent while the streamer hides it.
        let viewers = match details.get("concurrentViewers") {
            Some(Value::String(n)) => n.parse().unwrap_or(0),
            Some(Value::Number(n)) => n.as_u64().unwrap_or(0),
            _ => 0,
        };
        Ok(Some(viewers))
    }
}

/// What the loop does next.
enum Stage {
    /// Not signed in, or no client.
    Idle,
    /// The day's quota is used up, until this time (ms since the epoch).
    Blocked(i64),
    Searching,
    Live(Live),
}

/// Waits `wait`, or less when kicked.
async fn nap(kick: &mut watch::Receiver<u64>, wait: Duration) {
    tokio::select! {
        _ = tokio::time::sleep(wait) => {}
        _ = kick.changed() => {}
    }
}
