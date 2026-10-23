// The OBS connection (server/obs.mjs): an obs-websocket (protocol 5, OBS 28+) client that keeps whether OBS is streaming
// or recording, for the island's "on air" dot. The password stays here; kiosks get only the state. It reconnects with a
// growing delay while OBS is closed. `obs_auth` and `obs_step` are pure.

use std::sync::{Arc, Mutex, PoisonError};
use std::time::Duration;

use base64::engine::general_purpose::STANDARD;
use base64::Engine;
use futures_util::{SinkExt, StreamExt};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use tokio::sync::watch;
use tokio_tungstenite::tungstenite::client::IntoClientRequest;
use tokio_tungstenite::tungstenite::Message;

use crate::integrations::ObsSettings;
use crate::js;

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

/// The live connection: `run` is the supervised task, `reconfigure` makes it reconnect with the settings as they are
/// now, and `on_change` runs on every change of the state.
pub struct Obs {
    state: Mutex<ObsState>,
    settings: Box<dyn Fn() -> ObsSettings + Send + Sync>,
    on_change: Box<dyn Fn() + Send + Sync>,
    reconfigure: watch::Sender<u64>,
}

impl Obs {
    pub fn new(settings: impl Fn() -> ObsSettings + Send + Sync + 'static, on_change: impl Fn() + Send + Sync + 'static) -> Arc<Self> {
        let state = empty_obs(!settings().host.is_empty());
        Arc::new(Self { state: Mutex::new(state), settings: Box::new(settings), on_change: Box::new(on_change), reconfigure: watch::channel(0).0 })
    }

    pub fn state(&self) -> ObsState {
        *self.state.lock().unwrap_or_else(PoisonError::into_inner)
    }

    /// Call after the settings change: closes the connection and connects again at once.
    pub fn reconfigure(&self) {
        self.reconfigure.send_modify(|generation| *generation += 1);
    }

    fn set(&self, next: ObsState) {
        {
            let mut state = self.state.lock().unwrap_or_else(PoisonError::into_inner);
            if *state == next {
                return;
            }
            *state = next;
        }
        (self.on_change)();
    }

    /// Connects, follows the state while the socket is open, and connects again after a growing delay. Never returns.
    pub async fn run(&self) {
        let mut changes = self.reconfigure.subscribe();
        let mut delay = RECONNECT_MIN;
        loop {
            let settings = (self.settings)();
            if settings.host.is_empty() {
                self.set(empty_obs(false));
                let _ = changes.changed().await;
                delay = RECONNECT_MIN;
                continue;
            }
            self.set(empty_obs(true));
            tokio::select! {
                _ = changes.changed() => {
                    delay = RECONNECT_MIN;
                    continue;
                }
                _ = self.session(&settings, &mut delay) => {}
            }
            self.set(empty_obs(true));
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

    /// One connection, until it closes or fails. `delay` goes back to its minimum once OBS has identified us.
    async fn session(&self, settings: &ObsSettings, delay: &mut Duration) {
        let request = format!("ws://{}:{}", settings.host, settings.port).into_client_request().map(|mut request| {
            request.headers_mut().insert("Sec-WebSocket-Protocol", "obswebsocket.json".parse().expect("a header value"));
            request
        });
        let request = match request {
            Ok(request) => request,
            Err(e) => {
                log::warn!(target: "server", "OBS: {e}");
                return;
            }
        };
        let Ok((mut socket, _)) = tokio_tungstenite::connect_async(request).await else { return };
        while let Some(Ok(frame)) = socket.next().await {
            let Message::Text(data) = frame else {
                if matches!(frame, Message::Close(_)) {
                    return;
                }
                continue;
            };
            let Ok(message) = serde_json::from_str::<Value>(data.as_str()) else { continue };
            let before = self.state();
            let (next, send) = obs_step(before, &message, &settings.password);
            for reply in send {
                if socket.send(Message::text(reply.to_string())).await.is_err() {
                    return;
                }
            }
            if next.connected && !before.connected {
                *delay = RECONNECT_MIN;
            }
            self.set(next);
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
        // Hold the connection open until the test is done with it.
        let _ = socket.next().await;
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
}
