// The Elgato Wave Link 3 connection: its local JSON-RPC 2.0 WebSocket, read for the channels and mixes and written for their
// levels and mutes. Wave Link writes its port to `ws-info.json` while it runs and only accepts the Stream Deck plugin's
// origin. It reconnects with a growing delay while Wave Link is closed. The frame building and parsing are pure.

use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::{Mutex, PoisonError};
use std::time::Duration;

use futures_util::{SinkExt, StreamExt};
use serde_json::{json, Value};
use tokio::sync::mpsc;
use tokio::time::{interval, sleep, sleep_until, Instant};
use tokio_tungstenite::tungstenite::client::IntoClientRequest;
use tokio_tungstenite::tungstenite::http::HeaderValue;
use tokio_tungstenite::tungstenite::Message;

use super::act::WlAct;
use super::state::{WaveLinkState, WlChannel, WlMix, WlRoute, WlStatus};

const RECONNECT_MIN: Duration = Duration::from_secs(5);
const RECONNECT_MAX: Duration = Duration::from_secs(60);
/// Notifications arriving together are read once.
const DEBOUNCE: Duration = Duration::from_millis(50);
/// A full read when no notification asked for one (a missed event).
const SAFETY_REFRESH: Duration = Duration::from_secs(30);
/// Requests waiting for an answer; beyond this Wave Link has stopped answering.
const MAX_PENDING: usize = 256;

/// Where Wave Link leaves its port, under the user's local app data.
pub fn ws_info_path(local_app_data: &Path) -> PathBuf {
    local_app_data
        .join("Packages")
        .join("Elgato.WaveLink_g54w8ztgkx496")
        .join("LocalState")
        .join("ws-info.json")
}

/// The port in `ws-info.json` (`{"port":N}`).
pub fn parse_port(text: &str) -> Option<u16> {
    let port = serde_json::from_str::<Value>(text)
        .ok()?
        .get("port")?
        .as_u64()?;
    u16::try_from(port).ok().filter(|p| *p != 0)
}

/// One JSON-RPC request frame.
pub fn request(id: u64, method: &str, params: Option<Value>) -> String {
    let mut frame = json!({ "jsonrpc": "2.0", "method": method, "id": id });
    if let Some(params) = params {
        frame["params"] = params;
    }
    frame.to_string()
}

/// A frame from Wave Link.
#[derive(Debug, PartialEq)]
pub enum Incoming {
    Response {
        id: u64,
        result: Result<Value, String>,
    },
    Notification(String),
    Other,
}

pub fn classify(text: &str) -> Incoming {
    let Ok(frame) = serde_json::from_str::<Value>(text) else {
        return Incoming::Other;
    };
    if let Some(method) = frame.get("method").and_then(Value::as_str) {
        return Incoming::Notification(method.to_string());
    }
    let Some(id) = frame.get("id").and_then(Value::as_u64) else {
        return Incoming::Other;
    };
    let result = match frame.get("error") {
        Some(error) if !error.is_null() => Err(error
            .get("message")
            .and_then(Value::as_str)
            .unwrap_or("error")
            .to_string()),
        _ => Ok(frame.get("result").cloned().unwrap_or(Value::Null)),
    };
    Incoming::Response { id, result }
}

/// A 0..1 level as a whole percent.
fn percent(v: Option<&Value>) -> u8 {
    (v.and_then(Value::as_f64).unwrap_or(0.0) * 100.0)
        .round()
        .clamp(0.0, 100.0) as u8
}

fn text(v: &Value, key: &str) -> String {
    v.get(key)
        .and_then(Value::as_str)
        .unwrap_or_default()
        .to_string()
}

/// The channels in a `getChannels` result; one without an id is skipped.
pub fn channels_of(result: &Value) -> Vec<WlChannel> {
    let list = result
        .get("channels")
        .and_then(Value::as_array)
        .map_or(&[][..], Vec::as_slice);
    list.iter()
        .filter(|c| !text(c, "id").is_empty())
        .map(|c| WlChannel {
            id: text(c, "id"),
            name: text(c, "name"),
            kind: text(c, "type"),
            level: percent(c.get("level")),
            muted: c.get("isMuted").and_then(Value::as_bool).unwrap_or(false),
            mixes: c
                .get("mixes")
                .and_then(Value::as_array)
                .map_or(&[][..], Vec::as_slice)
                .iter()
                .filter(|m| !text(m, "id").is_empty())
                .map(|m| WlRoute {
                    id: text(m, "id"),
                    level: percent(m.get("level")),
                    muted: m.get("isMuted").and_then(Value::as_bool).unwrap_or(false),
                })
                .collect(),
        })
        .collect()
}

/// The mixes in a `getMixes` result.
pub fn mixes_of(result: &Value) -> Vec<WlMix> {
    let list = result
        .get("mixes")
        .and_then(Value::as_array)
        .map_or(&[][..], Vec::as_slice);
    list.iter()
        .filter(|m| !text(m, "id").is_empty())
        .map(|m| WlMix {
            id: text(m, "id"),
            name: text(m, "name"),
            level: percent(m.get("level")),
            muted: m.get("isMuted").and_then(Value::as_bool).unwrap_or(false),
        })
        .collect()
}

/// The requests (method and params) a write takes: the level and the mute go as two, as Elgato's own plugin sends them.
pub fn writes_of(act: &WlAct) -> Vec<(&'static str, Value)> {
    let level = |l: u8| f64::from(l) / 100.0;
    let mut out = Vec::new();
    match act {
        WlAct::Channel {
            id,
            mix: None,
            level: l,
            muted,
        } => {
            if let Some(l) = l {
                out.push(("setChannel", json!({ "id": id, "level": level(*l) })));
            }
            if let Some(m) = muted {
                out.push(("setChannel", json!({ "id": id, "isMuted": m })));
            }
        }
        WlAct::Channel {
            id,
            mix: Some(mix),
            level: l,
            muted,
        } => {
            if let Some(l) = l {
                out.push((
                    "setChannel",
                    json!({ "id": id, "mixes": [{ "id": mix, "level": level(*l) }] }),
                ));
            }
            if let Some(m) = muted {
                out.push((
                    "setChannel",
                    json!({ "id": id, "mixes": [{ "id": mix, "isMuted": m }] }),
                ));
            }
        }
        WlAct::Mix {
            id,
            level: l,
            muted,
        } => {
            if let Some(l) = l {
                out.push(("setMix", json!({ "id": id, "level": level(*l) })));
            }
            if let Some(m) = muted {
                out.push(("setMix", json!({ "id": id, "isMuted": m })));
            }
        }
    }
    out
}

/// What a request in flight asked for.
enum Pending {
    Channels,
    Mixes,
    Write,
}

/// The connection: `run` is the supervised task, `send` queues a write.
pub struct WaveLink {
    ws_info: Option<PathBuf>,
    state: Mutex<WaveLinkState>,
    on_change: Box<dyn Fn() + Send + Sync>,
    commands: mpsc::UnboundedSender<WlAct>,
    inbox: tokio::sync::Mutex<mpsc::UnboundedReceiver<WlAct>>,
}

impl WaveLink {
    /// `ws_info` is Wave Link's `ws-info.json` (None: there is no Wave Link on this machine); `on_change` runs on every change of the state.
    pub fn new(ws_info: Option<PathBuf>, on_change: impl Fn() + Send + Sync + 'static) -> Self {
        let (commands, inbox) = mpsc::unbounded_channel();
        Self {
            ws_info,
            state: Mutex::new(WaveLinkState::new(WlStatus::Absent)),
            on_change: Box::new(on_change),
            commands,
            inbox: tokio::sync::Mutex::new(inbox),
        }
    }

    pub fn state(&self) -> WaveLinkState {
        self.state
            .lock()
            .unwrap_or_else(PoisonError::into_inner)
            .clone()
    }

    /// Queues a write; false when Wave Link isn't connected.
    pub fn send(&self, act: WlAct) -> bool {
        self.state().status == WlStatus::Up && self.commands.send(act).is_ok()
    }

    fn update(&self, change: impl FnOnce(&mut WaveLinkState)) {
        {
            let mut state = self.state.lock().unwrap_or_else(PoisonError::into_inner);
            let mut next = state.clone();
            change(&mut next);
            if next == *state {
                return;
            }
            *state = next;
        }
        (self.on_change)();
    }

    fn port(&self) -> Option<u16> {
        parse_port(&std::fs::read_to_string(self.ws_info.as_deref()?).ok()?)
    }

    /// Follows Wave Link while it runs, and looks for it again after a growing delay. Never returns.
    pub async fn run(&self) {
        let mut delay = RECONNECT_MIN;
        loop {
            match self.port() {
                None => self.update(|s| *s = WaveLinkState::new(WlStatus::Absent)),
                Some(port) => {
                    self.update(|s| *s = WaveLinkState::new(WlStatus::Down));
                    self.session(port, &mut delay).await;
                    self.update(|s| *s = WaveLinkState::new(WlStatus::Down));
                }
            }
            sleep(delay).await;
            delay = (delay * 2).min(RECONNECT_MAX);
        }
    }

    /// One connection, until it closes or fails. `delay` goes back to its minimum once Wave Link has answered.
    async fn session(&self, port: u16, delay: &mut Duration) {
        let Ok(mut upgrade) = format!("ws://127.0.0.1:{port}").into_client_request() else {
            return;
        };
        // Wave Link answers only the Stream Deck plugin's origin.
        upgrade
            .headers_mut()
            .insert("Origin", HeaderValue::from_static("streamdeck://"));
        let Ok((mut socket, _)) = tokio_tungstenite::connect_async(upgrade).await else {
            return;
        };
        let mut inbox = self.inbox.lock().await;
        let mut pending: HashMap<u64, Pending> = HashMap::new();
        let mut next_id = 0u64;
        let (mut channels_due, mut mixes_due) = (true, true);
        let mut due = Some(Instant::now());
        let mut refresh = interval(SAFETY_REFRESH);
        refresh.tick().await;
        loop {
            tokio::select! {
                frame = socket.next() => {
                    let Some(Ok(frame)) = frame else { return };
                    let Message::Text(data) = frame else {
                        if matches!(frame, Message::Close(_)) {
                            return;
                        }
                        continue;
                    };
                    match classify(data.as_str()) {
                        Incoming::Response { id, result } => match (pending.remove(&id), result) {
                            (Some(Pending::Channels), Ok(result)) => {
                                *delay = RECONNECT_MIN;
                                self.update(|s| {
                                    s.status = WlStatus::Up;
                                    s.channels = channels_of(&result);
                                });
                            }
                            (Some(Pending::Mixes), Ok(result)) => {
                                *delay = RECONNECT_MIN;
                                self.update(|s| {
                                    s.status = WlStatus::Up;
                                    s.mixes = mixes_of(&result);
                                });
                            }
                            (Some(Pending::Write), Err(message)) => log::debug!(target: "server", "Wave Link refused a write: {message}"),
                            _ => {}
                        },
                        Incoming::Notification(method) => {
                            match method.as_str() {
                                "channelsChanged" | "channelChanged" => channels_due = true,
                                "mixesChanged" | "mixChanged" => mixes_due = true,
                                _ => continue,
                            }
                            due.get_or_insert(Instant::now() + DEBOUNCE);
                        }
                        Incoming::Other => {}
                    }
                }
                act = inbox.recv() => {
                    let Some(act) = act else { return };
                    for (method, params) in writes_of(&act) {
                        next_id += 1;
                        pending.insert(next_id, Pending::Write);
                        if socket.send(Message::text(request(next_id, method, Some(params)))).await.is_err() {
                            return;
                        }
                    }
                }
                () = async { match due { Some(at) => sleep_until(at).await, None => std::future::pending().await } } => {
                    due = None;
                    if pending.len() > MAX_PENDING {
                        return;
                    }
                    for (wanted, method, kind) in [(&mut channels_due, "getChannels", Pending::Channels), (&mut mixes_due, "getMixes", Pending::Mixes)] {
                        if !std::mem::take(wanted) {
                            continue;
                        }
                        next_id += 1;
                        pending.insert(next_id, kind);
                        if socket.send(Message::text(request(next_id, method, None))).await.is_err() {
                            return;
                        }
                    }
                }
                _ = refresh.tick() => {
                    (channels_due, mixes_due) = (true, true);
                    due.get_or_insert(Instant::now());
                }
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicUsize, Ordering};
    use std::sync::Arc;
    use tokio::net::TcpListener;

    #[test]
    fn reads_the_port_from_ws_info() {
        assert_eq!(parse_port(r#"{"port":1884}"#), Some(1884));
        assert_eq!(parse_port(r#"{"port":1884,"other":true}"#), Some(1884));
        for bad in [
            "",
            "{}",
            r#"{"port":"1884"}"#,
            r#"{"port":0}"#,
            r#"{"port":70000}"#,
            "1884",
        ] {
            assert_eq!(parse_port(bad), None, "{bad}");
        }
    }

    #[test]
    fn builds_requests_and_reads_frames() {
        let frame: Value = serde_json::from_str(&request(7, "getMixes", None)).unwrap();
        assert_eq!(
            frame,
            json!({ "jsonrpc": "2.0", "method": "getMixes", "id": 7 })
        );
        let frame: Value =
            serde_json::from_str(&request(8, "setMix", Some(json!({ "id": "m" })))).unwrap();
        assert_eq!(frame["params"], json!({ "id": "m" }));

        assert_eq!(
            classify(r#"{"jsonrpc":"2.0","method":"channelChanged","params":{}}"#),
            Incoming::Notification("channelChanged".into())
        );
        assert_eq!(
            classify(r#"{"jsonrpc":"2.0","id":3,"result":{"mixes":[]}}"#),
            Incoming::Response {
                id: 3,
                result: Ok(json!({ "mixes": [] }))
            }
        );
        assert_eq!(
            classify(r#"{"jsonrpc":"2.0","id":4,"error":{"code":-1,"message":"nope"}}"#),
            Incoming::Response {
                id: 4,
                result: Err("nope".into())
            }
        );
        assert_eq!(classify("not json"), Incoming::Other);
        assert_eq!(classify(r#"{"jsonrpc":"2.0"}"#), Incoming::Other);
    }

    #[test]
    fn reads_channels_and_mixes_in_percent() {
        let channels = channels_of(&json!({ "channels": [
            { "id": "c1", "name": "Music", "type": "Channel", "level": 0.504, "isMuted": true, "mixes": [{ "id": "m1", "level": 1, "isMuted": false }, { "level": 0.3 }] },
            { "name": "no id" },
            { "id": "c2" }
        ] }));
        assert_eq!(channels.len(), 2);
        assert_eq!(
            channels[0],
            WlChannel {
                id: "c1".into(),
                name: "Music".into(),
                kind: "Channel".into(),
                level: 50,
                muted: true,
                mixes: vec![WlRoute {
                    id: "m1".into(),
                    level: 100,
                    muted: false
                }]
            }
        );
        assert_eq!(
            (
                channels[1].level,
                channels[1].muted,
                channels[1].mixes.len()
            ),
            (0, false, 0)
        );
        let mixes = mixes_of(
            &json!({ "mixes": [{ "id": "m1", "name": "Stream", "level": 0.25, "isMuted": true }, { "name": "x" }] }),
        );
        assert_eq!(
            mixes,
            vec![WlMix {
                id: "m1".into(),
                name: "Stream".into(),
                level: 25,
                muted: true
            }]
        );
        assert!(channels_of(&json!({})).is_empty() && mixes_of(&Value::Null).is_empty());
    }

    #[test]
    fn builds_the_writes_elgatos_plugin_sends() {
        let channel = |mix: Option<&str>, level, muted| WlAct::Channel {
            id: "c".into(),
            mix: mix.map(String::from),
            level,
            muted,
        };
        assert_eq!(
            writes_of(&channel(None, Some(50), None)),
            vec![("setChannel", json!({ "id": "c", "level": 0.5 }))]
        );
        assert_eq!(
            writes_of(&channel(None, None, Some(true))),
            vec![("setChannel", json!({ "id": "c", "isMuted": true }))]
        );
        assert_eq!(
            writes_of(&channel(Some("m"), Some(100), Some(false))),
            vec![
                (
                    "setChannel",
                    json!({ "id": "c", "mixes": [{ "id": "m", "level": 1.0 }] })
                ),
                (
                    "setChannel",
                    json!({ "id": "c", "mixes": [{ "id": "m", "isMuted": false }] })
                ),
            ]
        );
        assert_eq!(
            writes_of(&WlAct::Mix {
                id: "m".into(),
                level: Some(0),
                muted: None
            }),
            vec![("setMix", json!({ "id": "m", "level": 0.0 }))]
        );
        assert_eq!(
            writes_of(&WlAct::Mix {
                id: "m".into(),
                level: None,
                muted: Some(true)
            }),
            vec![("setMix", json!({ "id": "m", "isMuted": true }))]
        );
    }

    /// A one-connection Wave Link: checks the origin, answers the two reads, announces a channel change, and reports the first write it gets.
    #[allow(clippy::result_large_err)]
    async fn fake_wave_link(listener: TcpListener, writes: mpsc::UnboundedSender<Value>) {
        let (stream, _) = listener.accept().await.unwrap();
        let mut socket = tokio_tungstenite::accept_hdr_async(
            stream,
            |request: &tokio_tungstenite::tungstenite::handshake::server::Request,
             response: tokio_tungstenite::tungstenite::handshake::server::Response| {
                assert_eq!(request.headers().get("origin").unwrap(), "streamdeck://");
                Ok(response)
            },
        )
        .await
        .unwrap();
        let mut level = 0.5;
        while let Some(Ok(Message::Text(data))) = socket.next().await {
            let frame: Value = serde_json::from_str(data.as_str()).unwrap();
            let id = frame["id"].clone();
            let result = match frame["method"].as_str().unwrap() {
                "getChannels" => {
                    json!({ "channels": [{ "id": "c1", "name": "Music", "type": "Channel", "level": level, "isMuted": false, "mixes": [] }] })
                }
                "getMixes" => {
                    json!({ "mixes": [{ "id": "m1", "name": "Stream", "level": 1, "isMuted": false }] })
                }
                _ => {
                    level = frame["params"]["level"].as_f64().unwrap();
                    writes.send(frame).unwrap();
                    socket
                        .send(Message::text(
                            json!({ "jsonrpc": "2.0", "id": id, "result": {} }).to_string(),
                        ))
                        .await
                        .unwrap();
                    socket
                        .send(Message::text(
                            json!({ "jsonrpc": "2.0", "method": "channelChanged", "params": {} })
                                .to_string(),
                        ))
                        .await
                        .unwrap();
                    continue;
                }
            };
            socket
                .send(Message::text(
                    json!({ "jsonrpc": "2.0", "id": id, "result": result }).to_string(),
                ))
                .await
                .unwrap();
        }
    }

    #[tokio::test]
    async fn follows_wave_link_and_writes_through_it_then_reports_it_gone() {
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let port = listener.local_addr().unwrap().port();
        let dir = tempfile::tempdir().unwrap();
        let info = dir.path().join("ws-info.json");
        let (writes, mut written) = mpsc::unbounded_channel();
        let server = tokio::spawn(fake_wave_link(listener, writes));

        let changes = Arc::new(AtomicUsize::new(0));
        let link = Arc::new(WaveLink::new(Some(info.clone()), {
            let changes = Arc::clone(&changes);
            move || {
                changes.fetch_add(1, Ordering::SeqCst);
            }
        }));
        // No ws-info.json: Wave Link is absent, and a write has nowhere to go.
        assert_eq!(link.state().status, WlStatus::Absent);
        assert!(!link.send(WlAct::Mix {
            id: "m1".into(),
            level: Some(10),
            muted: None
        }));
        std::fs::write(&info, format!(r#"{{"port":{port}}}"#)).unwrap();
        let task = tokio::spawn({
            let link = Arc::clone(&link);
            async move { link.run().await }
        });

        let wait = |want: fn(&WaveLinkState) -> bool| {
            let link = Arc::clone(&link);
            async move {
                for _ in 0..400 {
                    if want(&link.state()) {
                        return;
                    }
                    tokio::time::sleep(Duration::from_millis(25)).await;
                }
                panic!("not reached: {:?}", link.state());
            }
        };
        tokio::time::timeout(
            Duration::from_secs(5),
            wait(|s| s.status == WlStatus::Up && !s.channels.is_empty() && !s.mixes.is_empty()),
        )
        .await
        .expect("connects");
        let state = link.state();
        assert_eq!(
            (
                state.channels[0].name.as_str(),
                state.channels[0].level,
                state.mixes[0].name.as_str()
            ),
            ("Music", 50, "Stream")
        );

        assert!(link.send(WlAct::Channel {
            id: "c1".into(),
            mix: None,
            level: Some(80),
            muted: None
        }));
        let frame = tokio::time::timeout(Duration::from_secs(5), written.recv())
            .await
            .unwrap()
            .unwrap();
        assert_eq!(
            (frame["method"].as_str(), frame["params"]["id"].as_str()),
            (Some("setChannel"), Some("c1"))
        );
        // The channelChanged that follows makes it read the channels again.
        tokio::time::timeout(
            Duration::from_secs(5),
            wait(|s| s.channels.first().is_some_and(|c| c.level == 80)),
        )
        .await
        .expect("follows the change");
        assert!(changes.load(Ordering::SeqCst) >= 3);

        server.abort();
        tokio::time::timeout(Duration::from_secs(5), wait(|s| s.status == WlStatus::Down))
            .await
            .expect("down once the socket closes");
        task.abort();
    }
}
