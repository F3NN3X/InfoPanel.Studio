// The OBS connection (server/obs.mjs): an obs-websocket (protocol 5, OBS 28+) client that keeps whether OBS is streaming
// or recording, for the island's "on air" dot. The password stays here; kiosks get only the state. It reconnects with a
// growing delay while OBS is closed. `obs_auth` and `obs_step` are pure. The same connection also carries the scenes, mic and
// replay buffer, and the actions on them (obs_control.rs).

use std::sync::{Arc, Mutex, PoisonError};
use std::time::{Duration, Instant};

use base64::engine::general_purpose::STANDARD;
use base64::Engine;
use futures_util::{SinkExt, StreamExt};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use tokio::sync::{mpsc, oneshot, watch};
use tokio_tungstenite::tungstenite::client::IntoClientRequest;
use tokio_tungstenite::tungstenite::Message;

use crate::integrations::ObsSettings;
use crate::js;
use crate::obs_control::{act_request, request, subscriptions, ActError, ObsAct, ObsLive, Pending, Reply};
use crate::streaming::ObsStreaming;

const RECONNECT_MIN: Duration = Duration::from_secs(5);
const RECONNECT_MAX: Duration = Duration::from_secs(60);
/// Identify's event subscription: the Outputs category (stream and record state).
const SUBSCRIBE_OUTPUTS: u32 = 1 << 6;

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct ObsState {
    pub configured: bool,
    pub connected: bool,
    pub streaming: bool,
    pub recording: bool,
}

pub const fn empty_obs(configured: bool) -> ObsState {
    ObsState { configured, connected: false, streaming: false, recording: false }
}

impl ObsState {
    pub fn to_json(self) -> Value {
        json!({ "configured": self.configured, "connected": self.connected, "streaming": self.streaming, "recording": self.recording })
    }
}

fn sha256_base64(text: &str) -> String {
    STANDARD.encode(Sha256::digest(text.as_bytes()))
}

/// The Identify authentication string for a Hello's `challenge` and `salt`.
pub fn obs_auth(password: &str, salt: &str, challenge: &str) -> String {
    sha256_base64(&format!("{}{challenge}", sha256_base64(&format!("{password}{salt}"))))
}

/// `String(v)` of a field that may be missing or not a string (which is what the password concatenation sees).
fn text_of(v: Option<&Value>) -> String {
    js::to_property_key(v)
}

/// JavaScript truthiness of a JSON value.
fn truthy(v: Option<&Value>) -> bool {
    match v {
        None | Some(Value::Null) => false,
        Some(Value::Bool(b)) => *b,
        Some(Value::Number(n)) => n.as_f64().is_some_and(|n| n != 0.0 && !n.is_nan()),
        Some(Value::String(s)) => !s.is_empty(),
        Some(_) => true,
    }
}

/// One message from OBS: the next state and the messages to send back.
/// Hello -> Identify; Identified -> ask the stream and record status; their replies and the
/// Stream/RecordStateChanged events -> the state.
pub fn obs_step(state: ObsState, message: &Value, password: &str) -> (ObsState, Vec<Value>) {
    let d = message.get("d").filter(|d| !d.is_null());
    let field = |name: &str| d.and_then(|d| d.get(name));
    let active = |data: Option<&Value>| data.and_then(|data| data.get("outputActive")) == Some(&Value::Bool(true));
    let op = message.get("op").and_then(Value::as_f64);
    match op {
        Some(0.0) => {
            let authentication = field("authentication").filter(|a| truthy(Some(a)));
            let mut identify = json!({ "rpcVersion": 1, "eventSubscriptions": SUBSCRIBE_OUTPUTS });
            if let Some(auth) = authentication {
                let (salt, challenge) = (text_of(auth.get("salt")), text_of(auth.get("challenge")));
                identify["authentication"] = json!(obs_auth(password, &salt, &challenge));
            }
            (state, vec![json!({ "op": 1, "d": identify })])
        }
        Some(2.0) => (
            ObsState { connected: true, ..state },
            vec![
                json!({ "op": 6, "d": { "requestType": "GetStreamStatus", "requestId": "stream" } }),
                json!({ "op": 6, "d": { "requestType": "GetRecordStatus", "requestId": "record" } }),
            ],
        ),
        Some(5.0) => {
            let outputs = active(field("eventData"));
            let next = match field("eventType").and_then(Value::as_str) {
                Some("StreamStateChanged") => ObsState { streaming: outputs, ..state },
                Some("RecordStateChanged") => ObsState { recording: outputs, ..state },
                _ => state,
            };
            (next, vec![])
        }
        Some(7.0) => {
            let succeeded = field("requestStatus").and_then(|s| s.get("result")) == Some(&Value::Bool(true));
            if !succeeded {
                return (state, vec![]);
            }
            let outputs = active(field("responseData"));
            let next = match field("requestId").and_then(Value::as_str) {
                Some("stream") => ObsState { streaming: outputs, ..state },
                Some("record") => ObsState { recording: outputs, ..state },
                _ => state,
            };
            (next, vec![])
        }
        _ => (state, vec![]),
    }
}

/// What a caller of `Obs::act` hands to the session: the request and where the answer goes.
struct Command {
    kind: &'static str,
    data: Option<Value>,
    reply: oneshot::Sender<Reply>,
}

type Outgoing = mpsc::Sender<Command>;

/// Actions waiting for the session; past this a caller is turned away (503) instead of queueing without end.
const QUEUED_ACTIONS: usize = 32;
/// The least time between two publishes that only carry a new mic level.
const LEVEL_PUBLISH_EVERY: Duration = Duration::from_millis(250);

/// How long an action waits for OBS's answer.
const REQUEST_TIMEOUT: Duration = Duration::from_secs(3);
/// How often the stream's numbers (uptime, bit rate, frame rate) are asked for while connected.
const POLL_EVERY: Duration = Duration::from_secs(2);

fn locked<T>(m: &Mutex<T>) -> std::sync::MutexGuard<'_, T> {
    m.lock().unwrap_or_else(PoisonError::into_inner)
}

/// Sends the messages in order; false when the socket is gone.
async fn send_all<S: futures_util::Sink<Message> + Unpin>(socket: &mut S, messages: Vec<Value>) -> bool {
    for message in messages {
        if socket.send(Message::text(message.to_string())).await.is_err() {
            return false;
        }
    }
    true
}

/// The live connection: `run` is the supervised task, `reconfigure` makes it reconnect with the settings as they are
/// now, and `on_change` runs on every change of the state.
pub struct Obs {
    state: Mutex<ObsState>,
    live: Mutex<ObsLive>,
    /// The saved Streaming settings: the mic to follow and the scenes' looks. Kept here (not read from the integrations
    /// store) because the store tells its listeners while it holds its lock.
    streaming: Mutex<ObsStreaming>,
    settings: Box<dyn Fn() -> ObsSettings + Send + Sync>,
    on_change: Box<dyn Fn() + Send + Sync>,
    reconfigure: watch::Sender<u64>,
    /// The open session's inbox for actions; none between sessions.
    commands: Mutex<Option<Outgoing>>,
    /// Bumped when the mic changes; the open session subscribes to the meters again over its open socket.
    mic_changes: watch::Sender<u64>,
    /// When a publish last went out for a mic level alone.
    level_published: Mutex<Option<Instant>>,
}

impl Obs {
    pub fn new(settings: impl Fn() -> ObsSettings + Send + Sync + 'static, on_change: impl Fn() + Send + Sync + 'static) -> Arc<Self> {
        Self::with_streaming(settings, ObsStreaming::default(), on_change)
    }

    /// Like `new`, with the Streaming settings as they are saved now.
    pub fn with_streaming(settings: impl Fn() -> ObsSettings + Send + Sync + 'static, streaming: ObsStreaming, on_change: impl Fn() + Send + Sync + 'static) -> Arc<Self> {
        let state = empty_obs(!settings().host.is_empty());
        Arc::new(Self {
            state: Mutex::new(state),
            live: Mutex::new(ObsLive::default()),
            streaming: Mutex::new(streaming),
            settings: Box::new(settings),
            on_change: Box::new(on_change),
            reconfigure: watch::channel(0).0,
            commands: Mutex::new(None),
            mic_changes: watch::channel(0).0,
            level_published: Mutex::new(None),
        })
    }

    pub fn state(&self) -> ObsState {
        *locked(&self.state)
    }

    pub fn live(&self) -> ObsLive {
        locked(&self.live).clone()
    }

    /// What kiosks get as `obs`: the four on-air fields and, while connected, the scenes, mic, replay and stream numbers.
    pub fn json(&self) -> Value {
        let state = self.state();
        let mut json = state.to_json();
        if state.connected {
            let looks = locked(&self.streaming).scenes.clone();
            if let Value::Object(fields) = &mut json {
                fields.extend(self.live().to_json(&looks));
            }
        }
        json
    }

    /// The ids of OBS's scenes now; None while not connected or when it lists none.
    pub fn scene_ids(&self) -> Option<Vec<String>> {
        let ids: Vec<String> = self.live().scenes.into_iter().map(|s| s.id).collect();
        (self.state().connected && !ids.is_empty()).then_some(ids)
    }

    /// Call after the settings change: closes the connection and connects again at once.
    pub fn reconfigure(&self) {
        self.reconfigure.send_modify(|generation| *generation += 1);
    }

    /// Call after the Streaming settings change: a new mic makes the open session subscribe to the meters again (no new
    /// connection), anything else only changes what is published.
    pub fn set_streaming(&self, next: ObsStreaming) {
        let prev = std::mem::replace(&mut *locked(&self.streaming), next.clone());
        if prev.mic != next.mic {
            self.mic_changes.send_modify(|generation| *generation += 1);
        } else if prev != next {
            (self.on_change)();
        }
    }

    /// Sets both halves of the state and tells `on_change` once if either changed.
    fn commit(&self, next: ObsState, live: ObsLive) {
        // A new mic level alone is published at most every 250 ms (it comes ten times a second and a publish sends the whole
        // extras); the level that was held back is not stored, so the next reading brings it again.
        if next == self.state() && locked(&self.live).only_level_differs(&live) {
            let mut last = locked(&self.level_published);
            if last.is_some_and(|at| at.elapsed() < LEVEL_PUBLISH_EVERY) {
                return;
            }
            *last = Some(Instant::now());
        }
        let mut changed = false;
        {
            let mut state = locked(&self.state);
            if *state != next {
                *state = next;
                changed = true;
            }
        }
        {
            let mut current = locked(&self.live);
            if *current != live {
                *current = live;
                changed = true;
            }
        }
        if changed {
            (self.on_change)();
        }
    }

    /// Nothing known: not connected (and OBS set up or not).
    fn reset(&self, configured: bool) {
        self.commit(empty_obs(configured), ObsLive::default());
    }

    /// Does an action in OBS and waits for its answer (3 s).
    pub async fn act(&self, act: ObsAct) -> Result<(), ActError> {
        self.act_within(act, REQUEST_TIMEOUT).await
    }

    pub async fn act_within(&self, act: ObsAct, timeout: Duration) -> Result<(), ActError> {
        let inbox = locked(&self.commands).clone().filter(|_| self.state().connected).ok_or(ActError::NotConnected)?;
        let mic = locked(&self.streaming).mic.clone();
        let (kind, data) = act_request(&act, &self.live(), &mic).map_err(ActError::Refused)?;
        let (reply, answer) = oneshot::channel();
        inbox.try_send(Command { kind, data, reply }).map_err(|e| match e {
            mpsc::error::TrySendError::Full(_) => ActError::Busy,
            mpsc::error::TrySendError::Closed(_) => ActError::NotConnected,
        })?;
        match tokio::time::timeout(timeout, answer).await {
            Ok(Ok(Ok(_))) => Ok(()),
            Ok(Ok(Err(comment))) => Err(ActError::Failed(comment)),
            Ok(Err(_)) => Err(ActError::NotConnected),
            Err(_) => Err(ActError::Failed("OBS didn't answer".into())),
        }
    }

    /// Connects, follows the state while the socket is open, and connects again after a growing delay. Never returns.
    pub async fn run(&self) {
        let mut changes = self.reconfigure.subscribe();
        let mut delay = RECONNECT_MIN;
        loop {
            let settings = (self.settings)();
            if settings.host.is_empty() {
                self.reset(false);
                let _ = changes.changed().await;
                delay = RECONNECT_MIN;
                continue;
            }
            self.reset(true);
            tokio::select! {
                _ = changes.changed() => {
                    delay = RECONNECT_MIN;
                    continue;
                }
                _ = self.session(&settings, &mut delay) => {}
            }
            self.reset(true);
            tokio::select! {
                _ = changes.changed() => {
                    delay = RECONNECT_MIN;
                    continue;
                }
                _ = tokio::time::sleep(delay) => {}
            }
            delay = (delay * 2).min(RECONNECT_MAX);
        }
    }

    /// One connection, until it closes or fails. Actions are taken only while it is open.
    async fn session(&self, settings: &ObsSettings, delay: &mut Duration) {
        let (outgoing, mut inbox) = mpsc::channel(QUEUED_ACTIONS);
        *locked(&self.commands) = Some(outgoing);
        self.talk(settings, delay, &mut inbox).await;
        *locked(&self.commands) = None;
    }

    /// `delay` goes back to its minimum once OBS has identified us.
    async fn talk(&self, settings: &ObsSettings, delay: &mut Duration, inbox: &mut mpsc::Receiver<Command>) {
        let upgrade = format!("ws://{}:{}", settings.host, settings.port).into_client_request().map(|mut upgrade| {
            upgrade.headers_mut().insert("Sec-WebSocket-Protocol", "obswebsocket.json".parse().expect("a header value"));
            upgrade
        });
        let upgrade = match upgrade {
            Ok(upgrade) => upgrade,
            Err(e) => {
                log::warn!(target: "server", "OBS: {e}");
                return;
            }
        };
        let Ok((mut socket, _)) = tokio_tungstenite::connect_async(upgrade).await else { return };
        let mut mic_changes = self.mic_changes.subscribe();
        let mut mic = locked(&self.streaming).mic.clone();
        let (started, mut pending) = (Instant::now(), Pending::default());
        let mut poll = tokio::time::interval_at(tokio::time::Instant::now() + POLL_EVERY, POLL_EVERY);
        loop {
            let frame = tokio::select! {
                frame = socket.next() => match frame {
                    Some(Ok(frame)) => frame,
                    _ => return,
                },
                Some(command) = inbox.recv() => {
                    let id = pending.insert(command.reply);
                    if !send_all(&mut socket, vec![request(&id, command.kind, command.data)]).await {
                        return;
                    }
                    continue;
                }
                Ok(()) = mic_changes.changed() => {
                    mic = locked(&self.streaming).mic.clone();
                    if self.state().connected {
                        // Subscribe to the meters (or stop) on the open socket and read the new mic's mute.
                        let mut send = vec![json!({ "op": 3, "d": { "eventSubscriptions": subscriptions(!mic.is_empty()) } })];
                        if mic.is_empty() {
                            let mut live = self.live();
                            live.mic = None;
                            self.commit(self.state(), live);
                        } else {
                            send.push(ObsLive::mic_request(&mic));
                        }
                        if !send_all(&mut socket, send).await {
                            return;
                        }
                    }
                    continue;
                }
                _ = poll.tick() => {
                    pending.sweep();
                    if self.state().connected
                        && !send_all(&mut socket, vec![request("stream", "GetStreamStatus", None), request("stats", "GetStats", None)]).await
                    {
                        return;
                    }
                    continue;
                }
            };
            let Message::Text(data) = frame else {
                if matches!(frame, Message::Close(_)) {
                    return;
                }
                continue;
            };
            let Ok(message) = serde_json::from_str::<Value>(data.as_str()) else { continue };
            let before = self.state();
            let (next, mut send) = obs_step(before, &message, &settings.password);
            // The Identify asks for more than the on-air dot needs.
            for reply in &mut send {
                if reply["op"] == 1 {
                    reply["d"]["eventSubscriptions"] = json!(subscriptions(!mic.is_empty()));
                }
            }
            let (live, more) = self.live().step(&message, &mic, started.elapsed().as_millis() as u64);
            send.extend(more);
            if next.connected && !before.connected {
                send.extend(ObsLive::initial_requests(&mic));
                *delay = RECONNECT_MIN;
            }
            pending.complete(&message);
            if !send_all(&mut socket, send).await {
                return;
            }
            self.commit(next, live);
        }
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    use tokio::net::TcpListener;

    #[test]
    fn answers_hello_with_identify_authenticated_when_obs_asks() {
        let hello = json!({ "op": 0, "d": { "rpcVersion": 1, "authentication": { "salt": "s", "challenge": "c" } } });
        let (_, send) = obs_step(empty_obs(true), &hello, "pw");
        assert_eq!(send, [json!({ "op": 1, "d": { "rpcVersion": 1, "eventSubscriptions": 64, "authentication": obs_auth("pw", "s", "c") } })]);
        let (_, send) = obs_step(empty_obs(true), &json!({ "op": 0, "d": { "rpcVersion": 1 } }), "");
        assert!(send[0]["d"].get("authentication").is_none());
    }

    #[test]
    fn computes_the_documented_authentication_string() {
        // obs-websocket 5 protocol: base64(sha256(base64(sha256(password + salt)) + challenge)).
        let auth = obs_auth("supersecretpassword", "lM1GncleQOaCu9lT1yeUZhFYnqhsLLP1G5lAGo3ixaI=", "+IxH4CnCiqpX1rM9scsNynZzbOe4KhDeYcTNS3PDaeY=");
        assert_eq!(auth, "1Ct943GAT+6YQUUX47Ia/ncufilbe6+oD6lY+5kaCu4=");
    }

    #[test]
    fn asks_the_status_once_identified_and_follows_the_output_events() {
        let (identified, send) = obs_step(empty_obs(true), &json!({ "op": 2, "d": {} }), "");
        assert!(identified.connected);
        assert_eq!(send.iter().map(|m| m["d"]["requestType"].as_str().unwrap()).collect::<Vec<_>>(), ["GetStreamStatus", "GetRecordStatus"]);
        let reply = json!({ "op": 7, "d": { "requestId": "stream", "requestStatus": { "result": true }, "responseData": { "outputActive": true } } });
        let (streaming, _) = obs_step(identified, &reply, "");
        assert!(streaming.streaming);
        let event = json!({ "op": 5, "d": { "eventType": "RecordStateChanged", "eventData": { "outputActive": true } } });
        let (both, _) = obs_step(streaming, &event, "");
        assert_eq!(both, ObsState { configured: true, connected: true, streaming: true, recording: true });
        let off = json!({ "op": 5, "d": { "eventType": "StreamStateChanged", "eventData": { "outputActive": false } } });
        assert!(!obs_step(both, &off, "").0.streaming);
        // A failed request, an unknown message and a message without a body change nothing.
        let failed = json!({ "op": 7, "d": { "requestId": "record", "requestStatus": { "result": false }, "responseData": { "outputActive": true } } });
        assert_eq!(obs_step(identified, &failed, "").0, identified);
        assert_eq!(obs_step(identified, &json!({ "op": 9 }), "").0, identified);
        assert_eq!(obs_step(identified, &json!({ "op": 5, "d": null }), "").0, identified);
    }

    /// A one-connection obs-websocket server: Hello, then Identify, Identified, then the status replies and an event.
    #[allow(clippy::result_large_err)]
    async fn fake_obs(listener: TcpListener) {
        let (stream, _) = listener.accept().await.unwrap();
        let mut socket = tokio_tungstenite::accept_hdr_async(stream, |request: &tokio_tungstenite::tungstenite::handshake::server::Request, mut response: tokio_tungstenite::tungstenite::handshake::server::Response| {
            assert_eq!(request.headers().get("sec-websocket-protocol").unwrap(), "obswebsocket.json");
            response.headers_mut().insert("Sec-WebSocket-Protocol", "obswebsocket.json".parse().unwrap());
            Ok(response)
        })
        .await
        .unwrap();
        socket.send(Message::text(json!({ "op": 0, "d": { "rpcVersion": 1, "authentication": { "salt": "s", "challenge": "c" } } }).to_string())).await.unwrap();
        let identify: Value = serde_json::from_str(socket.next().await.unwrap().unwrap().to_text().unwrap()).unwrap();
        assert_eq!(identify["d"]["authentication"], obs_auth("pw", "s", "c"));
        socket.send(Message::text(json!({ "op": 2, "d": { "negotiatedRpcVersion": 1 } }).to_string())).await.unwrap();
        socket.next().await.unwrap().unwrap();
        socket.next().await.unwrap().unwrap();
        socket.send(Message::text(json!({ "op": 5, "d": { "eventType": "StreamStateChanged", "eventData": { "outputActive": true } } }).to_string())).await.unwrap();
        // Hold the connection open until the test is done with it (the client sends more than the two status requests).
        while socket.next().await.is_some() {}
    }

    #[tokio::test]
    async fn connects_identifies_and_follows_a_stream_then_reconnects_on_new_settings() {
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let port = listener.local_addr().unwrap().port();
        let server = tokio::spawn(fake_obs(listener));
        let settings = Arc::new(Mutex::new(ObsSettings { host: "127.0.0.1".into(), port, password: "pw".into() }));
        let changes = Arc::new(std::sync::atomic::AtomicUsize::new(0));
        let obs = Obs::new(
            {
                let settings = Arc::clone(&settings);
                move || settings.lock().unwrap().clone()
            },
            {
                let changes = Arc::clone(&changes);
                move || {
                    changes.fetch_add(1, std::sync::atomic::Ordering::SeqCst);
                }
            },
        );
        let task = tokio::spawn({
            let obs = Arc::clone(&obs);
            async move { obs.run().await }
        });
        for _ in 0..200 {
            if obs.state().streaming {
                break;
            }
            tokio::time::sleep(Duration::from_millis(25)).await;
        }
        assert_eq!(obs.state(), ObsState { configured: true, connected: true, streaming: true, recording: false });
        // Clearing the host closes the connection and leaves OBS unconfigured.
        settings.lock().unwrap().host.clear();
        obs.reconfigure();
        for _ in 0..200 {
            if obs.state() == empty_obs(false) {
                break;
            }
            tokio::time::sleep(Duration::from_millis(25)).await;
        }
        assert_eq!(obs.state(), empty_obs(false));
        assert!(changes.load(std::sync::atomic::Ordering::SeqCst) >= 3);
        task.abort();
        server.abort();
    }

    #[tokio::test]
    async fn publishes_a_new_mic_level_alone_at_most_four_times_a_second() {
        use crate::obs_control::Mic;
        let changes = Arc::new(std::sync::atomic::AtomicUsize::new(0));
        let obs = Obs::new(|| ObsSettings { host: "h".into(), port: 1, password: String::new() }, {
            let changes = Arc::clone(&changes);
            move || {
                changes.fetch_add(1, std::sync::atomic::Ordering::SeqCst);
            }
        });
        let connected = ObsState { configured: true, connected: true, streaming: false, recording: false };
        let with_level = |level: u8| {
            let mut live = ObsLive::default();
            live.mic = Some(Mic { name: "M".into(), muted: false, level });
            live
        };
        let seen = || changes.load(std::sync::atomic::Ordering::SeqCst);
        obs.commit(connected, with_level(10));
        assert_eq!(seen(), 1);
        // The first level-only change goes out; the next ones, inside 250 ms, are held back and not stored.
        obs.commit(connected, with_level(20));
        obs.commit(connected, with_level(30));
        assert_eq!((seen(), obs.live().mic.unwrap().level), (2, 20));
        // Anything else is published at once.
        obs.commit(ObsState { streaming: true, ..connected }, with_level(20));
        assert_eq!(seen(), 3);
        tokio::time::sleep(LEVEL_PUBLISH_EVERY + Duration::from_millis(20)).await;
        obs.commit(ObsState { streaming: true, ..connected }, with_level(30));
        assert_eq!((seen(), obs.live().mic.unwrap().level), (4, 30));
    }
}
