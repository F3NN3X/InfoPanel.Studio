// OBS beyond the on-air dot (obs.rs keeps that): the scenes, the mic, the replay buffer and the stream's numbers kept from the
// same obs-websocket connection, and POST /api/obs/act, which switches the scene, toggles the mic's mute and saves the replay.
// There is deliberately no start or stop stream action. The pure parts live here: `ObsLive::step` reads one message from
// OBS into the next state and the requests to send, `parse_act` reads a request body, `Pending` pairs OBS's replies with
// the requests that wait for them. The socket and the session are in obs.rs.

use std::collections::{BTreeMap, HashMap};

use axum::body::Body;
use axum::http::{Method, Response};
use serde_json::{json, Map, Value};
use tokio::sync::oneshot;

use crate::http::{self, Req};
use crate::request_guard::control_write_refusal;
use crate::streaming::SceneLook;
use crate::App;

const MAX_BODY_BYTES: usize = 4 * 1024;

// obs-websocket's EventSubscription bits.
const SUBSCRIBE_GENERAL: u32 = 1 << 0;
const SUBSCRIBE_SCENES: u32 = 1 << 2;
const SUBSCRIBE_INPUTS: u32 = 1 << 3;
const SUBSCRIBE_OUTPUTS: u32 = 1 << 6;
/// High volume (about 50 a second), so only asked for while a mic is set.
const SUBSCRIBE_METERS: u32 = 1 << 16;

/// The meter's quietest level: -60 dBFS reads 0, 0 dBFS reads 100.
const METER_FLOOR_DB: f64 = 60.0;
/// The least time between two published levels.
const LEVEL_EVERY_MS: u64 = 100;

/// Identify's event subscriptions.
pub fn subscriptions(meters: bool) -> u32 {
    let base = SUBSCRIBE_GENERAL | SUBSCRIBE_SCENES | SUBSCRIBE_INPUTS | SUBSCRIBE_OUTPUTS;
    if meters {
        base | SUBSCRIBE_METERS
    } else {
        base
    }
}

#[derive(Debug, Clone, PartialEq)]
pub struct Scene {
    /// Its uuid, or its name on an OBS that sends none.
    pub id: String,
    pub name: String,
}

#[derive(Debug, Clone, PartialEq)]
pub struct Mic {
    pub name: String,
    pub muted: bool,
    /// 0-100.
    pub level: u8,
}

/// What the connection knows besides whether OBS is streaming or recording (that is `ObsState`).
#[derive(Debug, Clone, Default, PartialEq)]
pub struct ObsLive {
    /// As OBS's own scene list shows them, top to bottom.
    pub scenes: Vec<Scene>,
    /// The program scene's id.
    pub current: String,
    /// Seconds on air; 0 while not streaming.
    pub uptime: u64,
    pub kbps: u32,
    pub fps: u32,
    /// None: no mic is set, or OBS has no such input.
    pub mic: Option<Mic>,
    /// None: the replay buffer isn't set up in OBS.
    pub replay: Option<bool>,
    /// The audio inputs, for the settings' mic picker.
    pub inputs: Vec<String>,
    /// The stream's output bytes and its duration in ms at the last status, to get the bit rate from.
    sample: Option<(u64, u64)>,
    level_at: Option<u64>,
}

/// An obs-websocket request (op 6).
pub fn request(id: &str, kind: &str, data: Option<Value>) -> Value {
    let mut d = json!({ "requestType": kind, "requestId": id });
    if let Some(data) = data {
        d["requestData"] = data;
    }
    json!({ "op": 6, "d": d })
}

fn text<'a>(v: &'a Value, key: &str) -> &'a str {
    v.get(key).and_then(Value::as_str).unwrap_or("")
}

fn flag(v: &Value, key: &str) -> bool {
    v.get(key).and_then(Value::as_bool).unwrap_or(false)
}

/// A scene's id: its uuid when OBS sends one, else its name.
fn scene_id(v: &Value, uuid_key: &str, name: &str) -> String {
    Some(text(v, uuid_key))
        .filter(|u| !u.is_empty())
        .unwrap_or(name)
        .to_string()
}

/// GetSceneList's scenes and current scene. OBS lists scenes from the bottom of its panel up, so they are turned around to
/// match what the user sees in OBS.
pub fn parse_scene_list(data: &Value) -> (Vec<Scene>, String) {
    let scenes = data
        .get("scenes")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .filter_map(|s| {
            let name = s.get("sceneName").and_then(Value::as_str)?;
            Some(Scene {
                id: scene_id(s, "sceneUuid", name),
                name: name.to_string(),
            })
        })
        .rev()
        .collect();
    (
        scenes,
        scene_id(
            data,
            "currentProgramSceneUuid",
            text(data, "currentProgramSceneName"),
        ),
    )
}

/// Whether an input kind carries audio (OBS's capture sources for devices, outputs and apps).
fn is_audio_kind(kind: &str) -> bool {
    [
        "wasapi",
        "coreaudio",
        "pulse",
        "alsa",
        "jack",
        "sndio",
        "audio",
    ]
    .iter()
    .any(|k| kind.contains(k))
}

/// The names of the audio inputs in GetInputList's answer.
fn audio_inputs(data: &Value) -> Vec<String> {
    let mut names: Vec<String> = data
        .get("inputs")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .filter(|i| is_audio_kind(text(i, "inputKind")))
        .map(|i| text(i, "inputName").to_string())
        .filter(|n| !n.is_empty())
        .collect();
    names.sort_by_key(|n| n.to_lowercase());
    names
}

/// A meter reading (`inputLevelsMul`: per channel [magnitude, peak, input peak], linear 0-1) as 0-100 on a dB scale, from the
/// loudest channel's peak.
pub fn meter_level(channels: &Value) -> u8 {
    let peak = channels
        .as_array()
        .into_iter()
        .flatten()
        .filter_map(|c| c.get(1).or_else(|| c.get(0)).and_then(Value::as_f64))
        .fold(0.0_f64, f64::max);
    if peak <= 0.0 {
        return 0;
    }
    ((20.0 * peak.log10() + METER_FLOOR_DB) / METER_FLOOR_DB * 100.0)
        .clamp(0.0, 100.0)
        .round() as u8
}

impl ObsLive {
    /// The requests to send once OBS has identified us (the stream and record status come from `obs_step`).
    pub fn initial_requests(mic: &str) -> Vec<Value> {
        let mut send = vec![
            request("scenes", "GetSceneList", None),
            request("inputs", "GetInputList", None),
        ];
        if !mic.is_empty() {
            send.push(Self::mic_request(mic));
        }
        send.push(request("replay", "GetReplayBufferStatus", None));
        send.push(request("stats", "GetStats", None));
        send
    }

    pub fn mic_request(mic: &str) -> Value {
        request("mic", "GetInputMute", Some(json!({ "inputName": mic })))
    }

    /// Whether `other` is this state with only the mic's level different.
    pub fn only_level_differs(&self, other: &Self) -> bool {
        match (&self.mic, &other.mic) {
            (Some(a), Some(b)) if a.level != b.level => {
                let mut same = other.clone();
                if let Some(m) = same.mic.as_mut() {
                    m.level = a.level;
                }
                same.level_at = self.level_at;
                same == *self
            }
            _ => false,
        }
    }

    /// One message from OBS: the next state and the requests to send. `mic` is the configured input ("" = none); `now_ms` is
    /// any steadily increasing clock.
    pub fn step(&self, message: &Value, mic: &str, now_ms: u64) -> (Self, Vec<Value>) {
        let mut next = self.clone();
        let Some(d) = message.get("d").filter(|d| d.is_object()) else {
            return (next, vec![]);
        };
        let send = match message.get("op").and_then(Value::as_u64) {
            Some(5) => next.event(
                text(d, "eventType"),
                d.get("eventData").unwrap_or(&Value::Null),
                mic,
                now_ms,
            ),
            Some(7) => {
                let ok = d.get("requestStatus").is_some_and(|s| flag(s, "result"));
                next.response(
                    text(d, "requestId"),
                    ok.then(|| d.get("responseData").unwrap_or(&Value::Null)),
                    mic,
                );
                vec![]
            }
            _ => vec![],
        };
        (next, send)
    }

    fn event(&mut self, kind: &str, data: &Value, mic: &str, now_ms: u64) -> Vec<Value> {
        match kind {
            "CurrentProgramSceneChanged" => {
                self.current = scene_id(data, "sceneUuid", text(data, "sceneName"));
                vec![]
            }
            "SceneListChanged" | "SceneNameChanged" | "SceneCreated" | "SceneRemoved" => {
                vec![request("scenes", "GetSceneList", None)]
            }
            "InputMuteStateChanged" => {
                if !mic.is_empty() && text(data, "inputName") == mic {
                    let level = self.mic.as_ref().map_or(0, |m| m.level);
                    self.mic = Some(Mic {
                        name: mic.to_string(),
                        muted: flag(data, "inputMuted"),
                        level,
                    });
                }
                vec![]
            }
            "InputNameChanged" | "InputCreated" | "InputRemoved" => {
                let mut send = vec![request("inputs", "GetInputList", None)];
                if !mic.is_empty() {
                    send.push(Self::mic_request(mic));
                }
                send
            }
            "StreamStateChanged" => {
                if !flag(data, "outputActive") {
                    self.stop_stream();
                }
                vec![request("stream", "GetStreamStatus", None)]
            }
            "ReplayBufferStateChanged" => {
                self.replay = Some(flag(data, "outputActive"));
                vec![]
            }
            "InputVolumeMeters" => {
                let meters = data
                    .get("inputs")
                    .and_then(Value::as_array)
                    .into_iter()
                    .flatten();
                let reading = meters
                    .into_iter()
                    .find(|i| !mic.is_empty() && text(i, "inputName") == mic);
                if let (Some(m), Some(reading)) = (self.mic.as_mut(), reading) {
                    let level = meter_level(reading.get("inputLevelsMul").unwrap_or(&Value::Null));
                    let due = self
                        .level_at
                        .is_none_or(|at| now_ms.saturating_sub(at) >= LEVEL_EVERY_MS);
                    if level.abs_diff(m.level) >= 1 && due {
                        m.level = level;
                        self.level_at = Some(now_ms);
                    }
                }
                vec![]
            }
            _ => vec![],
        }
    }

    fn stop_stream(&mut self) {
        self.uptime = 0;
        self.kbps = 0;
        self.sample = None;
    }

    /// The answer to one of our requests; `data` is None when OBS refused it.
    fn response(&mut self, id: &str, data: Option<&Value>, mic: &str) {
        match (id, data) {
            ("scenes", Some(data)) => (self.scenes, self.current) = parse_scene_list(data),
            ("inputs", Some(data)) => self.inputs = audio_inputs(data),
            ("mic", Some(data)) => {
                let level = self.mic.as_ref().map_or(0, |m| m.level);
                self.mic = Some(Mic {
                    name: mic.to_string(),
                    muted: flag(data, "inputMuted"),
                    level,
                });
            }
            ("mic", None) => self.mic = None,
            ("replay", Some(data)) => self.replay = Some(flag(data, "outputActive")),
            ("replay", None) => self.replay = None,
            ("stats", Some(data)) => {
                self.fps = data
                    .get("activeFps")
                    .and_then(Value::as_f64)
                    .map_or(0, |f| f.max(0.0).round() as u32)
            }
            ("stream", Some(data)) if flag(data, "outputActive") => {
                let ms = data
                    .get("outputDuration")
                    .and_then(Value::as_u64)
                    .unwrap_or(0);
                let bytes = data.get("outputBytes").and_then(Value::as_u64).unwrap_or(0);
                self.uptime = ms / 1000;
                // Bytes * 8 bits per millisecond is kilobits per second.
                if let Some((was_bytes, was_ms)) =
                    self.sample.filter(|(b, t)| bytes >= *b && ms > *t)
                {
                    self.kbps =
                        ((bytes - was_bytes) * 8 / (ms - was_ms)).min(u64::from(u32::MAX)) as u32;
                }
                self.sample = Some((bytes, ms));
            }
            ("stream", Some(_)) => self.stop_stream(),
            _ => {}
        }
    }

    /// The fields added to the extras' `obs` while connected; each scene carries the look saved for it.
    pub fn to_json(&self, looks: &BTreeMap<String, SceneLook>) -> Map<String, Value> {
        let scenes: Vec<Value> = self
            .scenes
            .iter()
            .map(|s| {
                let look = looks.get(&s.id).cloned().unwrap_or_default();
                json!({ "id": s.id, "name": s.name, "sub": look.sub, "icon": look.icon })
            })
            .collect();
        let fields = json!({
            "scenes": scenes,
            "currentScene": self.current,
            "uptime": self.uptime,
            "kbps": self.kbps,
            "fps": self.fps,
            "mic": self.mic.as_ref().map(|m| json!({ "name": m.name, "muted": m.muted, "level": m.level })),
            "replay": self.replay.map(|active| json!({ "active": active })),
            "inputs": self.inputs,
        });
        match fields {
            Value::Object(map) => map,
            _ => Map::new(),
        }
    }
}

/// What POST /api/obs/act can ask.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ObsAct {
    /// Make the scene with this id the program scene.
    Scene(String),
    /// Toggle the configured mic's mute.
    Mic,
    /// Save the replay buffer.
    Replay,
}

/// The action a request body asks for, or why it isn't one.
pub fn parse_act(body: &str) -> Result<ObsAct, String> {
    let body: Value =
        serde_json::from_str(body).map_err(|_| "expected a JSON object".to_string())?;
    if !body.is_object() {
        return Err("expected a JSON object".into());
    }
    match body.get("op").and_then(Value::as_str) {
        Some("scene") => match body.get("id") {
            Some(Value::String(id)) if !id.is_empty() && id.len() <= 512 => {
                Ok(ObsAct::Scene(id.clone()))
            }
            _ => Err("\"id\" must be a non-empty string".into()),
        },
        Some("mic") => Ok(ObsAct::Mic),
        Some("replay") => Ok(ObsAct::Replay),
        _ => Err("\"op\" must be scene, mic or replay".into()),
    }
}

/// Whether text is a uuid (8-4-4-4-12 hex digits).
fn is_uuid(s: &str) -> bool {
    s.len() == 36
        && s.bytes().enumerate().all(|(i, b)| {
            if matches!(i, 8 | 13 | 18 | 23) {
                b == b'-'
            } else {
                b.is_ascii_hexdigit()
            }
        })
}

/// The obs-websocket request an action comes to, or why it can't be made (a message for the 400).
pub fn act_request(
    act: &ObsAct,
    live: &ObsLive,
    mic: &str,
) -> Result<(&'static str, Option<Value>), String> {
    match act {
        ObsAct::Scene(id) => {
            let scene = live
                .scenes
                .iter()
                .find(|s| s.id == *id)
                .ok_or("no such scene")?;
            let data = if is_uuid(&scene.id) {
                json!({ "sceneUuid": scene.id })
            } else {
                json!({ "sceneName": scene.name })
            };
            Ok(("SetCurrentProgramScene", Some(data)))
        }
        ObsAct::Mic if mic.is_empty() => Err("no mic is set".into()),
        ObsAct::Mic => Ok(("ToggleInputMute", Some(json!({ "inputName": mic })))),
        ObsAct::Replay => Ok(("SaveReplayBuffer", None)),
    }
}

/// OBS's answer to a request: its response data, or the comment it gave for refusing.
pub type Reply = Result<Value, String>;

/// The requests sent for a caller that waits for OBS's reply, by request id.
#[derive(Default)]
pub struct Pending {
    next: u64,
    waiting: HashMap<String, oneshot::Sender<Reply>>,
}

impl Pending {
    /// Registers a waiter; the request to send carries the id this returns.
    pub fn insert(&mut self, reply: oneshot::Sender<Reply>) -> String {
        self.next += 1;
        let id = format!("act{}", self.next);
        self.waiting.insert(id.clone(), reply);
        id
    }

    /// Hands a RequestResponse (op 7) to the waiter with its id; anything else is not for a waiter.
    pub fn complete(&mut self, message: &Value) {
        if message.get("op").and_then(Value::as_u64) != Some(7) {
            return;
        }
        let Some(d) = message.get("d") else { return };
        let Some(waiter) = self.waiting.remove(text(d, "requestId")) else {
            return;
        };
        let status = d.get("requestStatus").unwrap_or(&Value::Null);
        let reply = if flag(status, "result") {
            Ok(d.get("responseData").cloned().unwrap_or(Value::Null))
        } else {
            Err(Some(text(status, "comment"))
                .filter(|c| !c.is_empty())
                .unwrap_or("OBS refused")
                .to_string())
        };
        let _ = waiter.send(reply);
    }

    /// Forgets the waiters nobody listens to any more (they gave up).
    pub fn sweep(&mut self) {
        self.waiting.retain(|_, waiter| !waiter.is_closed());
    }

    pub fn len(&self) -> usize {
        self.waiting.len()
    }

    pub fn is_empty(&self) -> bool {
        self.waiting.is_empty()
    }
}

/// Why an action wasn't done.
#[derive(Debug, PartialEq, Eq)]
pub enum ActError {
    /// No OBS connection: 503.
    NotConnected,
    /// The action doesn't fit what OBS has: 400.
    Refused(String),
    /// OBS refused the request or didn't answer: 502.
    Failed(String),
    /// Too many actions are waiting for OBS: 503.
    Busy,
}

/// POST /api/obs/act → 204 once OBS has done it. Needs a JSON body and `X-Dashboard-Control: 1`; 403 from another machine
/// while remote editing is off; 400 for a body that is not an action, an unknown scene or no mic set; 503 while OBS isn't
/// connected; 502 when OBS refuses or doesn't answer.
pub async fn handle_act(app: &App, mut req: Req) -> std::io::Result<Response<Body>> {
    if req.method != Method::POST {
        return Ok(http::empty(405));
    }
    if let Some(response) = app.refuse_remote_edit(&req) {
        return Ok(response);
    }
    if let Some(refusal) = control_write_refusal(
        req.header("content-type").as_deref(),
        req.header("x-dashboard-control").as_deref(),
    ) {
        return Ok(http::text(refusal.status, refusal.message));
    }
    let body = match req.read_body(MAX_BODY_BYTES).await {
        Ok(body) => body,
        Err(http::BodyRefused) => {
            return Ok(http::closing(http::text(400, "expected a JSON object")))
        }
    };
    let act = match parse_act(&body) {
        Ok(act) => act,
        Err(message) => return Ok(http::text(400, message)),
    };
    Ok(match app.extras.obs().act(act).await {
        Ok(()) => http::empty(204),
        Err(ActError::NotConnected) => http::text(503, "OBS isn't connected"),
        Err(ActError::Refused(message)) => http::text(400, message),
        Err(ActError::Failed(message)) => http::text(502, message),
        Err(ActError::Busy) => http::text(503, "OBS is busy"),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    const U1: &str = "11111111-aaaa-bbbb-cccc-000000000001";
    const U2: &str = "11111111-aaaa-bbbb-cccc-000000000002";

    fn response(id: &str, data: Value) -> Value {
        json!({ "op": 7, "d": { "requestId": id, "requestStatus": { "result": true, "code": 100 }, "responseData": data } })
    }

    fn failure(id: &str, comment: &str) -> Value {
        json!({ "op": 7, "d": { "requestId": id, "requestStatus": { "result": false, "code": 604, "comment": comment } } })
    }

    fn event(kind: &str, data: Value) -> Value {
        json!({ "op": 5, "d": { "eventType": kind, "eventData": data } })
    }

    fn live_with_scenes() -> ObsLive {
        let list = json!({
            "currentProgramSceneName": "Game", "currentProgramSceneUuid": U2,
            "scenes": [{ "sceneName": "BRB", "sceneUuid": U1, "sceneIndex": 0 }, { "sceneName": "Game", "sceneUuid": U2, "sceneIndex": 1 }],
        });
        ObsLive::default().step(&response("scenes", list), "", 0).0
    }

    #[test]
    fn asks_for_the_mic_and_the_meters_only_when_one_is_set() {
        let kinds = |mic: &str| {
            ObsLive::initial_requests(mic)
                .iter()
                .map(|m| m["d"]["requestType"].as_str().unwrap().to_string())
                .collect::<Vec<_>>()
        };
        assert_eq!(
            kinds(""),
            [
                "GetSceneList",
                "GetInputList",
                "GetReplayBufferStatus",
                "GetStats"
            ]
        );
        assert_eq!(
            kinds("Mic/Aux"),
            [
                "GetSceneList",
                "GetInputList",
                "GetInputMute",
                "GetReplayBufferStatus",
                "GetStats"
            ]
        );
        assert_eq!(subscriptions(false), 1 | 4 | 8 | 64);
        assert_eq!(subscriptions(true), 1 | 4 | 8 | 64 | 65536);
    }

    #[test]
    fn lists_scenes_top_down_with_the_current_one() {
        let live = live_with_scenes();
        // OBS lists them bottom-up.
        assert_eq!(
            live.scenes
                .iter()
                .map(|s| s.name.as_str())
                .collect::<Vec<_>>(),
            ["Game", "BRB"]
        );
        assert_eq!(live.current, U2);
        // Without uuids the name is the id.
        let (scenes, current) = parse_scene_list(
            &json!({ "currentProgramSceneName": "A", "scenes": [{ "sceneName": "A" }, { "sceneName": 5 }] }),
        );
        assert_eq!(
            (scenes, current),
            (
                vec![Scene {
                    id: "A".into(),
                    name: "A".into()
                }],
                "A".to_string()
            )
        );
    }

    #[test]
    fn follows_scene_changes_and_refetches_the_list() {
        let live = live_with_scenes();
        let (live, send) = live.step(
            &event(
                "CurrentProgramSceneChanged",
                json!({ "sceneName": "BRB", "sceneUuid": U1 }),
            ),
            "",
            0,
        );
        assert!(send.is_empty());
        assert_eq!(live.current, U1);
        for kind in [
            "SceneListChanged",
            "SceneNameChanged",
            "SceneCreated",
            "SceneRemoved",
        ] {
            let (_, send) = live.step(&event(kind, json!({})), "", 0);
            assert_eq!(send[0]["d"]["requestType"], "GetSceneList", "{kind}");
        }
        // A failed list leaves the scenes as they were.
        assert_eq!(live.step(&failure("scenes", "x"), "", 0).0, live);
    }

    #[test]
    fn keeps_the_mic_mute_and_a_throttled_level() {
        let live = ObsLive::default()
            .step(&response("mic", json!({ "inputMuted": false })), "Mic", 0)
            .0;
        assert_eq!(
            live.mic,
            Some(Mic {
                name: "Mic".into(),
                muted: false,
                level: 0
            })
        );
        let (live, _) = live.step(
            &event(
                "InputMuteStateChanged",
                json!({ "inputName": "Mic", "inputMuted": true }),
            ),
            "Mic",
            0,
        );
        assert!(live.mic.as_ref().unwrap().muted);
        // Another input's mute is not the mic's.
        assert_eq!(
            live.step(
                &event(
                    "InputMuteStateChanged",
                    json!({ "inputName": "Desktop", "inputMuted": false })
                ),
                "Mic",
                0
            )
            .0,
            live
        );
        let meters = |peak: f64| {
            event(
                "InputVolumeMeters",
                json!({ "inputs": [{ "inputName": "Desktop", "inputLevelsMul": [[1.0, 1.0, 1.0]] }, { "inputName": "Mic", "inputLevelsMul": [[0.0, peak, peak]] }] }),
            )
        };
        let (live, _) = live.step(&meters(0.1), "Mic", 1000);
        assert_eq!(live.mic.as_ref().unwrap().level, 67);
        // Inside 100 ms nothing is published; later it is.
        assert_eq!(live.step(&meters(1.0), "Mic", 1050).0, live);
        assert_eq!(
            live.step(&meters(1.0), "Mic", 1100).0.mic.unwrap().level,
            100
        );
        // A change under one step is not worth a publish.
        assert_eq!(live.step(&meters(0.1), "Mic", 5000).0, live);
        // A mic that OBS doesn't have is none.
        assert_eq!(live.step(&failure("mic", "no input"), "Mic", 0).0.mic, None);
    }

    #[test]
    fn maps_peaks_onto_the_db_scale() {
        assert_eq!(meter_level(&json!([[0.0, 1.0, 1.0]])), 100);
        assert_eq!(meter_level(&json!([[0.0, 0.001, 0.0]])), 0);
        assert_eq!(meter_level(&json!([[0.0, 0.0, 0.0]])), 0);
        assert_eq!(meter_level(&json!([[0.0, 0.0316, 0.0]])), 50);
        // The loudest channel counts; a missing peak falls back to the magnitude; junk is silence.
        assert_eq!(meter_level(&json!([[0.0, 0.01, 0.0], [0.0, 0.1, 0.0]])), 67);
        assert_eq!(meter_level(&json!([[0.1]])), 67);
        assert_eq!(meter_level(&json!(null)), 0);
        assert_eq!(meter_level(&json!([[0.0, 2.0, 0.0]])), 100);
    }

    #[test]
    fn works_out_the_bit_rate_from_two_statuses() {
        let status = |active: bool, ms: u64, bytes: u64| {
            response(
                "stream",
                json!({ "outputActive": active, "outputDuration": ms, "outputBytes": bytes }),
            )
        };
        let (live, _) = ObsLive::default().step(&status(true, 10_000, 1_000_000), "", 0);
        assert_eq!((live.uptime, live.kbps), (10, 0));
        // 750 000 bytes in 2 s = 3 000 kbit/s.
        let (live, _) = live.step(&status(true, 12_000, 1_750_000), "", 0);
        assert_eq!((live.uptime, live.kbps), (12, 3000));
        // Not streaming (a status, or the event) clears the numbers; the event also asks for the status.
        let (stopped, send) = live.step(
            &event("StreamStateChanged", json!({ "outputActive": false })),
            "",
            0,
        );
        assert_eq!((stopped.uptime, stopped.kbps), (0, 0));
        assert_eq!(send[0]["d"]["requestId"], "stream");
        assert_eq!(live.step(&status(false, 0, 0), "", 0).0.uptime, 0);
        let (live, _) =
            ObsLive::default().step(&response("stats", json!({ "activeFps": 59.94 })), "", 0);
        assert_eq!(live.fps, 60);
    }

    #[test]
    fn tells_a_change_of_the_mic_level_alone_from_any_other() {
        let with = |level: u8, muted: bool| ObsLive { mic: Some(Mic { name: "M".into(), muted, level }), ..ObsLive::default() };
        assert!(with(10, false).only_level_differs(&with(40, false)));
        assert!(!with(10, false).only_level_differs(&with(10, false)));
        assert!(!with(10, false).only_level_differs(&with(40, true)));
        assert!(!with(10, false).only_level_differs(&ObsLive::default()));
        let moved = ObsLive { current: "s".into(), ..with(40, false) };
        assert!(!with(10, false).only_level_differs(&moved));
    }

    #[test]
    fn knows_whether_the_replay_buffer_exists() {
        let (live, _) =
            ObsLive::default().step(&response("replay", json!({ "outputActive": true })), "", 0);
        assert_eq!(live.replay, Some(true));
        assert_eq!(
            live.step(
                &event("ReplayBufferStateChanged", json!({ "outputActive": false })),
                "",
                0
            )
            .0
            .replay,
            Some(false)
        );
        assert_eq!(
            live.step(&failure("replay", "not configured"), "", 0)
                .0
                .replay,
            None
        );
    }

    #[test]
    fn lists_only_audio_inputs() {
        let list = json!({ "inputs": [
            { "inputName": "Webcam", "inputKind": "dshow_input" },
            { "inputName": "mic", "inputKind": "wasapi_input_capture" },
            { "inputName": "Desktop", "inputKind": "wasapi_output_capture" },
            { "inputName": "", "inputKind": "wasapi_input_capture" },
        ] });
        let (live, _) = ObsLive::default().step(&response("inputs", list), "", 0);
        assert_eq!(live.inputs, ["Desktop", "mic"]);
    }

    #[test]
    fn publishes_scenes_with_their_saved_look() {
        let live = live_with_scenes();
        let looks = BTreeMap::from([(
            U1.to_string(),
            SceneLook {
                sub: "Be right back".into(),
                icon: "coffee".into(),
            },
        )]);
        let json = Value::Object(live.to_json(&looks));
        assert_eq!(
            json["scenes"][1],
            json!({ "id": U1, "name": "BRB", "sub": "Be right back", "icon": "coffee" })
        );
        assert_eq!(json["scenes"][0]["sub"], "");
        assert_eq!(json["currentScene"], U2);
        assert_eq!(
            (json["mic"].clone(), json["replay"].clone()),
            (Value::Null, Value::Null)
        );
    }

    #[test]
    fn reads_an_action_body() {
        assert_eq!(
            parse_act(r#"{"op":"scene","id":"abc"}"#),
            Ok(ObsAct::Scene("abc".into()))
        );
        assert_eq!(parse_act(r#"{"op":"mic"}"#), Ok(ObsAct::Mic));
        assert_eq!(parse_act(r#"{"op":"replay"}"#), Ok(ObsAct::Replay));
        for bad in [
            "",
            "nope",
            "[]",
            r#"{}"#,
            r#"{"op":"stream"}"#,
            r#"{"op":"scene"}"#,
            r#"{"op":"scene","id":""}"#,
            r#"{"op":"scene","id":5}"#,
        ] {
            assert!(parse_act(bad).is_err(), "{bad}");
        }
        assert!(parse_act(&format!(r#"{{"op":"scene","id":"{}"}}"#, "x".repeat(600))).is_err());
    }

    #[test]
    fn turns_an_action_into_a_request_or_refuses_it() {
        let live = live_with_scenes();
        let (kind, data) = act_request(&ObsAct::Scene(U1.into()), &live, "").unwrap();
        assert_eq!(
            (kind, data),
            ("SetCurrentProgramScene", Some(json!({ "sceneUuid": U1 })))
        );
        // A scene without a uuid goes by name.
        let named = ObsLive {
            scenes: vec![Scene {
                id: "Intro".into(),
                name: "Intro".into(),
            }],
            ..ObsLive::default()
        };
        assert_eq!(
            act_request(&ObsAct::Scene("Intro".into()), &named, "")
                .unwrap()
                .1,
            Some(json!({ "sceneName": "Intro" }))
        );
        assert_eq!(
            act_request(&ObsAct::Scene("nope".into()), &live, ""),
            Err("no such scene".into())
        );
        assert_eq!(
            act_request(&ObsAct::Mic, &live, ""),
            Err("no mic is set".into())
        );
        assert_eq!(
            act_request(&ObsAct::Mic, &live, "Mic/Aux").unwrap(),
            ("ToggleInputMute", Some(json!({ "inputName": "Mic/Aux" })))
        );
        assert_eq!(
            act_request(&ObsAct::Replay, &live, "").unwrap(),
            ("SaveReplayBuffer", None)
        );
    }

    #[test]
    fn hands_each_reply_to_the_request_with_its_id() {
        let mut pending = Pending::default();
        let ((tx1, mut rx1), (tx2, mut rx2)) = (oneshot::channel(), oneshot::channel());
        let (a, b) = (pending.insert(tx1), pending.insert(tx2));
        assert_ne!(a, b);
        // Our own polls, events and unknown ids are not for a waiter.
        pending.complete(&response("stream", json!({})));
        pending.complete(&event("StreamStateChanged", json!({})));
        pending.complete(&response("act99", json!({})));
        assert!(rx1.try_recv().is_err() && rx2.try_recv().is_err());
        pending.complete(&failure(&b, "replay buffer is not active"));
        pending.complete(&response(&a, json!({ "ok": 1 })));
        assert_eq!(rx1.try_recv().unwrap(), Ok(json!({ "ok": 1 })));
        assert_eq!(
            rx2.try_recv().unwrap(),
            Err("replay buffer is not active".to_string())
        );
        assert!(pending.is_empty());
        // One that gave up is swept.
        let (tx, rx) = oneshot::channel();
        pending.insert(tx);
        assert_eq!(pending.len(), 1);
        drop(rx);
        pending.sweep();
        assert!(pending.is_empty());
    }
}
