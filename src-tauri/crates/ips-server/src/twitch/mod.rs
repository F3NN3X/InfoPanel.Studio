// Twitch for the Stream Chat widget and the Streaming chip: the device-code sign-in (auth.rs), the chat over IRC on a
// WebSocket (session.rs, irc.rs, chat.rs) and the channel's viewers. The sign-in's tokens are kept in the integrations file
// (streaming.twitch) and nowhere else: not in the studio's view, the extras, the chat stream or the log. The status kiosks
// get is in `status`; the chat has its own latest-wins stream (`chat_json`).

pub mod auth;
pub mod chat;
pub mod irc;
pub mod routes;
mod session;
#[cfg(test)]
pub(crate) mod tests;

use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex, MutexGuard, OnceLock, PoisonError};
use std::time::{Duration, Instant};

use axum::body::Bytes;
use serde_json::{json, Value};
use tokio::sync::{mpsc, watch};
use tokio::task::{AbortHandle, JoinHandle};

use crate::config::now_ms;
use crate::guarded_net::GuardedClient;
use crate::streaming::{TwitchAuth, TwitchSettings};
use crate::{sse, supervisor};
use auth::{ApiError, Device, Endpoints, Poll, RefreshError};
use chat::{SendLimiter, Window};
use irc::{Entry, Me, Message};

/// A token this close to running out is refreshed before it is used.
const REFRESH_AHEAD_MS: i64 = 5 * 60 * 1000;

/// A sign-in waiting for the user to approve the code.
#[derive(Debug, Clone)]
struct Pending {
    id: u64,
    user_code: String,
    verification_uri: String,
    /// Ms since the epoch.
    expires_at: i64,
}

#[derive(Default)]
struct Inner {
    channel: String,
    auth: TwitchAuth,
    pending: Option<Pending>,
    /// A sign-in is being asked for (the device request is out).
    starting: bool,
    /// Bumped by every sign-out or cancel, so a sign-in started before it can tell.
    generation: u64,
    error: Option<String>,
    connected: bool,
    live: bool,
    viewers: u64,
    window: Window,
    limiter: SendLimiter,
    me: Me,
}

impl Inner {
    fn signed_in(&self) -> bool {
        !self.auth.access_token.is_empty()
    }

    /// The chat being read: the chosen one, else the user's own.
    fn channel(&self) -> String {
        if self.channel.is_empty() {
            self.auth.login.clone()
        } else {
            self.channel.clone()
        }
    }
}

/// Why a sign-in could not start.
#[derive(Debug, PartialEq)]
pub enum SigninError {
    /// One is under way.
    Busy,
    /// Cancelled or signed out while the code was being asked for.
    Cancelled,
    Failed(String),
}

/// Why a message was not sent.
#[derive(Debug, PartialEq)]
pub enum SendError {
    Invalid(String),
    NotConnected,
    RateLimited,
}

/// What a started sign-in shows the user.
#[derive(Debug, Clone, PartialEq)]
pub struct Code {
    pub user_code: String,
    pub verification_uri: String,
    pub expires_in: u64,
}

pub struct Twitch {
    ep: Endpoints,
    client: GuardedClient,
    inner: Mutex<Inner>,
    /// Stores the sign-in. Called with no lock held (the store tells its listeners, which come back here).
    persist: Box<dyn Fn(TwitchAuth) + Send + Sync>,
    /// Tells the extras the status changed.
    on_change: Box<dyn Fn() + Send + Sync>,
    refresh_lock: tokio::sync::Mutex<()>,
    /// Bumped when the chat or viewers must look again: a sign-in or -out, a new channel.
    kick: watch::Sender<u64>,
    flow: Mutex<Option<AbortHandle>>,
    next_flow: AtomicU64,
    /// The open chat session's way to send; none between sessions.
    outgoing: Mutex<Option<mpsc::Sender<String>>>,
    /// The chat as an event; a stream only ever needs the newest.
    latest: watch::Sender<Bytes>,
    /// Tells the chat hub (which merges the platforms' chats) the window changed; set once.
    on_chat: OnceLock<Box<dyn Fn() + Send + Sync>>,
    /// When each repeating failure was last logged.
    warned: Mutex<std::collections::HashMap<&'static str, Instant>>,
}

fn locked<T>(m: &Mutex<T>) -> MutexGuard<'_, T> {
    m.lock().unwrap_or_else(PoisonError::into_inner)
}

impl Twitch {
    pub fn new(
        ep: Endpoints,
        client: GuardedClient,
        settings: TwitchSettings,
        persist: impl Fn(TwitchAuth) + Send + Sync + 'static,
        on_change: impl Fn() + Send + Sync + 'static,
    ) -> Arc<Self> {
        let twitch = Arc::new(Self {
            ep,
            client,
            inner: Mutex::new(Inner {
                channel: settings.channel,
                auth: settings.auth,
                ..Inner::default()
            }),
            persist: Box::new(persist),
            on_change: Box::new(on_change),
            refresh_lock: tokio::sync::Mutex::new(()),
            kick: watch::channel(0).0,
            flow: Mutex::new(None),
            next_flow: AtomicU64::new(1),
            outgoing: Mutex::new(None),
            latest: watch::channel(Bytes::new()).0,
            on_chat: OnceLock::new(),
            warned: Mutex::default(),
        });
        twitch.publish_chat();
        twitch
    }

    /// The status in the extras.
    pub fn status(&self) -> Value {
        let i = locked(&self.inner);
        json!({
            "configured": !self.ep.client_id.is_empty(),
            "signedIn": i.signed_in(),
            "login": i.auth.login,
            "channel": i.channel(),
            "pending": i.pending.is_some(),
            "error": i.error,
            "connected": i.connected,
            "live": i.live,
            "viewers": i.viewers,
        })
    }

    /// The chat stream's event data: the window, oldest first, and each platform's connection.
    pub fn chat_json(&self) -> Value {
        let (messages, twitch) = self.chat_parts();
        json!({ "messages": messages, "platforms": { "twitch": twitch } })
    }

    /// The window, oldest first, and this platform's connection.
    pub fn chat_parts(&self) -> (Vec<Message>, Value) {
        let i = locked(&self.inner);
        (i.window.messages(), json!({ "connected": i.connected, "channel": i.channel() }))
    }

    /// Runs `f` after every change to the chat window (once; a second call is ignored).
    pub fn set_chat_hook(&self, f: impl Fn() + Send + Sync + 'static) {
        let _ = self.on_chat.set(Box::new(f));
    }

    fn publish_status(&self) {
        (self.on_change)();
    }

    /// Makes the chat the one every open stream sends next. It is read inside the channel's lock, so of two publishes the
    /// later reader wins.
    fn publish_chat(&self) {
        self.latest
            .send_modify(|event| *event = sse::event(&crate::json::stringify(&self.chat_json())));
        if let Some(hook) = self.on_chat.get() {
            hook();
        }
    }

    fn publish_all(&self) {
        self.publish_chat();
        self.publish_status();
    }

    /// A chat stream's receiver, holding the chat as of now.
    pub fn listen(&self) -> watch::Receiver<Bytes> {
        self.publish_chat();
        self.latest.subscribe()
    }

    fn kick(&self) {
        self.kick.send_modify(|n| *n += 1);
    }

    /// The chat to read changed (a studio save): reads that one from now on.
    pub fn set_channel(&self, channel: &str) {
        {
            let mut i = locked(&self.inner);
            if i.channel == channel {
                return;
            }
            i.channel = channel.to_string();
            i.window.clear_all();
            i.live = false;
            i.viewers = 0;
        }
        self.kick();
        self.publish_all();
    }

    // ---- sign-in ----

    /// Starts a sign-in: asks Twitch for a code and waits for the user to approve it in the background.
    pub async fn signin(self: &Arc<Self>) -> Result<Code, SigninError> {
        let generation = {
            let mut i = locked(&self.inner);
            if i.pending.is_some() || i.starting {
                return Err(SigninError::Busy);
            }
            i.starting = true;
            i.generation
        };
        let device = auth::start_device(&self.client, &self.ep).await;
        let device = match device {
            Ok(device) => device,
            Err(message) => {
                let mut i = locked(&self.inner);
                if i.generation == generation {
                    i.starting = false;
                }
                return Err(SigninError::Failed(message));
            }
        };
        let id = self.next_flow.fetch_add(1, Ordering::SeqCst);
        let code = Code {
            user_code: device.user_code.clone(),
            verification_uri: device.verification_uri.clone(),
            expires_in: device.expires_in,
        };
        {
            let mut i = locked(&self.inner);
            if i.generation != generation {
                return Err(SigninError::Cancelled);
            }
            i.starting = false;
            i.error = None;
            i.pending = Some(Pending {
                id,
                user_code: code.user_code.clone(),
                verification_uri: code.verification_uri.clone(),
                expires_at: now_ms() + device.expires_in as i64 * 1000,
            });
        }
        let this = Arc::clone(self);
        *locked(&self.flow) =
            Some(tokio::spawn(async move { this.flow(id, device).await }).abort_handle());
        self.publish_status();
        Ok(code)
    }

    /// Polls for the user's approval until it comes, is refused or the code runs out.
    async fn flow(self: Arc<Self>, id: u64, device: Device) {
        let deadline = Instant::now() + Duration::from_secs(device.expires_in);
        let mut interval = Duration::from_secs(device.interval).max(self.ep.poll_floor);
        let outcome = loop {
            tokio::time::sleep(interval).await;
            if Instant::now() >= deadline {
                break Err("The code expired. Start again.".to_string());
            }
            match auth::poll_device(&self.client, &self.ep, &device, now_ms()).await {
                Ok(Poll::Pending) => self.recovered("signin"),
                Ok(Poll::SlowDown) => interval += self.ep.slow_down_step,
                Ok(Poll::Retry) => self.warn_throttled("signin", "Twitch had trouble answering"),
                Ok(Poll::Done(tokens)) => break Ok(tokens),
                Ok(Poll::Failed(message)) => break Err(message),
                // Twitch couldn't be asked just now; the code is still good, so ask again.
                Err(message) => self.warn_throttled("signin", &message),
            }
        };
        let result = match outcome {
            Ok(tokens) => auth::identity(&self.client, &self.ep, &tokens.access_token)
                .await
                .map(|who| (tokens, who))
                .map_err(|e| match e {
                    ApiError::Unauthorized => "Twitch didn't accept the new sign-in.".to_string(),
                    ApiError::Failed(message) => format!("Signed in, but {message}."),
                }),
            Err(message) => Err(message),
        };
        match result {
            Ok((tokens, (login, user_id))) => self.finish_signin(
                id,
                TwitchAuth {
                    access_token: tokens.access_token,
                    refresh_token: tokens.refresh_token,
                    expires_at: tokens.expires_at,
                    login,
                    user_id,
                },
            ),
            Err(message) => {
                {
                    let mut i = locked(&self.inner);
                    if i.pending.as_ref().is_some_and(|p| p.id == id) {
                        i.pending = None;
                        i.error = Some(message);
                    }
                }
                self.publish_status();
            }
        }
    }

    fn finish_signin(&self, id: u64, auth: TwitchAuth) {
        {
            let mut i = locked(&self.inner);
            if i.pending.as_ref().is_none_or(|p| p.id != id) {
                return;
            }
            i.pending = None;
            i.error = None;
            i.auth = auth.clone();
            i.window.clear_all();
            i.live = false;
            i.viewers = 0;
        }
        (self.persist)(auth);
        self.kick();
        self.publish_all();
    }

    /// Ends a sign-in under way, or signs out: the tokens are forgotten here and in the file, and Twitch is told (best effort).
    pub fn signout(self: &Arc<Self>) {
        let old = self.clear(None);
        if !old.access_token.is_empty() {
            let this = Arc::clone(self);
            tokio::spawn(
                async move { auth::revoke(&this.client, &this.ep, &old.access_token).await },
            );
        }
    }

    /// Signs out for a reason the user is shown (their sign-in no longer works).
    fn signed_out(&self, reason: &str) {
        self.clear(Some(reason.to_string()));
    }

    fn clear(&self, reason: Option<String>) -> TwitchAuth {
        if let Some(flow) = locked(&self.flow).take() {
            flow.abort();
        }
        let old = {
            let mut i = locked(&self.inner);
            let old = std::mem::take(&mut i.auth);
            i.generation += 1;
            i.starting = false;
            i.pending = None;
            i.error = reason;
            i.connected = false;
            i.live = false;
            i.viewers = 0;
            i.me = Me::default();
            i.window.clear_all();
            old
        };
        (self.persist)(TwitchAuth::default());
        self.kick();
        self.publish_all();
        old
    }

    // ---- tokens ----

    /// An access token that is good now: refreshed first when it is about to run out.
    async fn access_token(&self) -> Result<String, String> {
        let (token, expires_at) = {
            let i = locked(&self.inner);
            (i.auth.access_token.clone(), i.auth.expires_at)
        };
        if token.is_empty() {
            return Err("not signed in".into());
        }
        if expires_at - now_ms() > REFRESH_AHEAD_MS {
            return Ok(token);
        }
        match self.refresh_stale(&token).await {
            // Twitch could not be asked and the token still works; a refused refresh has signed the user out instead.
            Err(_) if expires_at > now_ms() && locked(&self.inner).auth.access_token == token => {
                Ok(token)
            }
            other => other,
        }
    }

    /// New tokens in place of `stale`, unless someone already got them. A refresh Twitch refuses is a sign-out.
    async fn refresh_stale(&self, stale: &str) -> Result<String, String> {
        let _one_at_a_time = self.refresh_lock.lock().await;
        let refresh_token = {
            let i = locked(&self.inner);
            if !i.signed_in() {
                return Err("not signed in".into());
            }
            if i.auth.access_token != stale {
                return Ok(i.auth.access_token.clone());
            }
            i.auth.refresh_token.clone()
        };
        match auth::refresh(&self.client, &self.ep, &refresh_token, now_ms()).await {
            Ok(tokens) => {
                // A sign-out or a newer sign-in may have come while Twitch was answering; then these tokens are not wanted.
                let next = {
                    let mut i = locked(&self.inner);
                    if !i.signed_in() || i.auth.refresh_token != refresh_token {
                        None
                    } else {
                        i.auth.access_token = tokens.access_token.clone();
                        i.auth.refresh_token = tokens.refresh_token.clone();
                        i.auth.expires_at = tokens.expires_at;
                        Some(i.auth.clone())
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
                if locked(&self.inner).auth.refresh_token == refresh_token {
                    self.signed_out("Your Twitch sign-in ran out. Sign in again.");
                }
                Err("sign-in ran out".into())
            }
            Err(RefreshError::Unreachable(message)) => Err(message),
        }
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
        log::warn!(target: "server", "twitch {key}: {message}");
    }

    /// A repeating failure stopped: the next one is logged at once.
    fn recovered(&self, key: &'static str) {
        locked(&self.warned).remove(key);
    }

    /// The sign-in under way, for the Settings page: the code to approve and when it runs out.
    pub fn pending_json(&self) -> Value {
        let i = locked(&self.inner);
        let pending = i.pending.as_ref().map(|p| json!({ "user_code": p.user_code, "verification_uri": p.verification_uri, "expires_at": p.expires_at }));
        json!({ "pending": pending, "error": i.error })
    }

    /// Whether a channel is live and its viewers, with the signed-in token; a 401 refreshes the token once and asks again.
    async fn stream_info(&self, channel: &str) -> Result<(bool, u64), String> {
        let mut token = self.access_token().await?;
        for attempt in 0..2 {
            match auth::stream_info(&self.client, &self.ep, &token, channel).await {
                Ok(found) => return Ok(found),
                Err(ApiError::Unauthorized) if attempt == 0 => {
                    token = self.refresh_stale(&token).await?
                }
                Err(ApiError::Unauthorized) => break,
                Err(ApiError::Failed(message)) => return Err(message),
            }
        }
        Err("Twitch didn't accept the sign-in".into())
    }

    // ---- chat and viewers ----

    /// Sends a chat message as the signed-in user.
    pub fn send(&self, text: &str) -> Result<(), SendError> {
        let text = chat::validate_send(text).map_err(SendError::Invalid)?;
        let outgoing = locked(&self.outgoing)
            .clone()
            .ok_or(SendError::NotConnected)?;
        {
            let mut i = locked(&self.inner);
            if !i.connected {
                return Err(SendError::NotConnected);
            }
            if !i.limiter.allow(Instant::now()) {
                return Err(SendError::RateLimited);
            }
        }
        outgoing.try_send(text).map_err(|_| SendError::NotConnected)
    }

    /// Adds a message to the window and publishes the chat.
    fn add(&self, entry: Entry) {
        locked(&self.inner).window.push(entry);
        self.publish_chat();
    }

    /// Our own message, which Twitch does not send back to us.
    fn echo(&self, text: &str) {
        let entry = {
            let i = locked(&self.inner);
            let user = if i.me.display.is_empty() {
                i.auth.login.clone()
            } else {
                i.me.display.clone()
            };
            let ts = now_ms();
            Entry {
                message: Message {
                    id: format!("local-{}", uuid::Uuid::new_v4()),
                    platform: "twitch",
                    user,
                    text: text.to_string(),
                    color: i.me.color.clone(),
                    badge: i.me.badge,
                    ts,
                },
                login: i.auth.login.clone(),
            }
        };
        self.add(entry);
    }

    fn set_connected(&self, connected: bool) {
        {
            let mut i = locked(&self.inner);
            if i.connected == connected {
                return;
            }
            i.connected = connected;
        }
        if !connected {
            *locked(&self.outgoing) = None;
        }
        self.publish_all();
    }

    /// Polls the channel's live state while signed in.
    async fn viewers_loop(self: Arc<Self>) {
        let mut kick = self.kick.subscribe();
        loop {
            let (signed_in, channel) = {
                let i = locked(&self.inner);
                (i.signed_in(), i.channel())
            };
            if signed_in && !channel.is_empty() {
                let found = self.stream_info(&channel).await;
                match found {
                    Ok((live, viewers)) => {
                        self.recovered("viewers");
                        self.set_live(live, viewers);
                    }
                    Err(message) => self.warn_throttled("viewers", &message),
                }
            } else {
                self.set_live(false, 0);
            }
            tokio::select! {
                _ = tokio::time::sleep(self.ep.viewers_every) => {}
                _ = kick.changed() => {}
            }
        }
    }

    fn set_live(&self, live: bool, viewers: u64) {
        {
            let mut i = locked(&self.inner);
            if (i.live, i.viewers) == (live, viewers) {
                return;
            }
            (i.live, i.viewers) = (live, viewers);
        }
        self.publish_status();
    }

    /// Starts the chat connection and the viewers poll, each under the supervisor.
    pub fn start(self: &Arc<Self>, shutdown: &watch::Receiver<bool>) -> [JoinHandle<()>; 2] {
        let (chat, viewers) = (Arc::clone(self), Arc::clone(self));
        [
            supervisor::spawn("twitch-chat", shutdown.clone(), move || {
                let twitch = Arc::clone(&chat);
                async move { twitch.chat_loop().await }
            }),
            supervisor::spawn("twitch-viewers", shutdown.clone(), move || {
                let twitch = Arc::clone(&viewers);
                async move { twitch.viewers_loop().await }
            }),
        ]
    }
}
