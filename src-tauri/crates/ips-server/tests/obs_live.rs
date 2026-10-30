// OBS control over a real socket against a fake obs-websocket server: Hello without a password, Identify with the event
// subscriptions the mic needs, the scenes, mic, replay and stats read into the extras' `obs`, a scene change made in OBS
// followed, and the actions sent as requests whose answers are matched by id. Never connects to a real OBS.

use std::collections::BTreeMap;
use std::sync::{Arc, Mutex};
use std::time::Duration;

use futures_util::{SinkExt, StreamExt};
use ips_server::integrations::ObsSettings;
use ips_server::obs::Obs;
use ips_server::obs_control::{ActError, ObsAct};
use ips_server::streaming::{ObsStreaming, SceneLook};
use serde_json::{json, Value};
use tokio::net::TcpListener;
use tokio::sync::mpsc;
use tokio_tungstenite::tungstenite::handshake::server::{Request, Response};
use tokio_tungstenite::tungstenite::Message;

const U1: &str = "11111111-aaaa-bbbb-cccc-000000000001";
const U2: &str = "11111111-aaaa-bbbb-cccc-000000000002";

fn text(value: Value) -> Message {
    Message::text(value.to_string())
}

fn ok(id: &str, kind: &str, data: Value) -> Message {
    text(
        json!({ "op": 7, "d": { "requestType": kind, "requestId": id, "requestStatus": { "result": true, "code": 100 }, "responseData": data } }),
    )
}

fn refused(id: &str, kind: &str, code: u32, comment: &str) -> Message {
    text(
        json!({ "op": 7, "d": { "requestType": kind, "requestId": id, "requestStatus": { "result": false, "code": code, "comment": comment } } }),
    )
}

/// One connection: every message OBS gets goes to `seen`. The scenes are listed bottom-up as OBS does; ToggleInputMute is
/// never answered.
#[allow(clippy::result_large_err)]
async fn fake_obs(listener: TcpListener, seen: mpsc::UnboundedSender<Value>) {
    let (stream, _) = listener.accept().await.unwrap();
    let mut socket =
        tokio_tungstenite::accept_hdr_async(stream, |_: &Request, mut response: Response| {
            response.headers_mut().insert(
                "Sec-WebSocket-Protocol",
                "obswebsocket.json".parse().unwrap(),
            );
            Ok(response)
        })
        .await
        .unwrap();
    socket
        .send(text(json!({ "op": 0, "d": { "rpcVersion": 1 } })))
        .await
        .unwrap();
    while let Some(Ok(frame)) = socket.next().await {
        let Ok(message) = serde_json::from_str::<Value>(frame.to_text().unwrap_or("")) else {
            continue;
        };
        let _ = seen.send(message.clone());
        let d = &message["d"];
        match message["op"].as_u64() {
            Some(1) => socket
                .send(text(json!({ "op": 2, "d": { "negotiatedRpcVersion": 1 } })))
                .await
                .unwrap(),
            Some(6) => {
                let (kind, id) = (
                    d["requestType"].as_str().unwrap(),
                    d["requestId"].as_str().unwrap(),
                );
                let reply = match kind {
                    "GetStreamStatus" => ok(id, kind, json!({ "outputActive": false })),
                    "GetRecordStatus" => ok(id, kind, json!({ "outputActive": false })),
                    "GetSceneList" => ok(
                        id,
                        kind,
                        json!({
                            "currentProgramSceneName": "Game", "currentProgramSceneUuid": U2,
                            "scenes": [{ "sceneName": "BRB", "sceneUuid": U1, "sceneIndex": 0 }, { "sceneName": "Game", "sceneUuid": U2, "sceneIndex": 1 }],
                        }),
                    ),
                    "GetInputList" => ok(
                        id,
                        kind,
                        json!({ "inputs": [{ "inputName": "Mic/Aux", "inputKind": "wasapi_input_capture" }, { "inputName": "Cam", "inputKind": "dshow_input" }] }),
                    ),
                    "GetInputMute" => ok(id, kind, json!({ "inputMuted": false })),
                    "GetReplayBufferStatus" => {
                        refused(id, kind, 604, "replay buffer is not configured")
                    }
                    "GetStats" => ok(id, kind, json!({ "activeFps": 29.97 })),
                    "SetCurrentProgramScene" => {
                        let uuid = d["requestData"]["sceneUuid"].as_str().unwrap().to_string();
                        socket.send(ok(id, kind, json!({}))).await.unwrap();
                        socket.send(text(json!({ "op": 5, "d": { "eventType": "CurrentProgramSceneChanged", "eventData": { "sceneName": "?", "sceneUuid": uuid } } }))).await.unwrap();
                        continue;
                    }
                    "SaveReplayBuffer" => refused(id, kind, 604, "replay buffer is not active"),
                    _ => continue,
                };
                socket.send(reply).await.unwrap();
                if kind == "GetInputMute" {
                    // 0.1 is -20 dBFS: 67 on the 0-100 scale. Two readings: only the first is published.
                    let meters = |peak: f64| {
                        text(
                            json!({ "op": 5, "d": { "eventType": "InputVolumeMeters", "eventData": { "inputs": [{ "inputName": "Mic/Aux", "inputLevelsMul": [[0.0, peak, peak]] }] } } }),
                        )
                    };
                    socket.send(meters(0.1)).await.unwrap();
                    socket.send(meters(1.0)).await.unwrap();
                }
            }
            _ => {}
        }
    }
}

async fn until(what: &str, mut done: impl FnMut() -> bool) {
    for _ in 0..200 {
        if done() {
            return;
        }
        tokio::time::sleep(Duration::from_millis(25)).await;
    }
    panic!("timed out waiting for {what}");
}

#[tokio::test]
async fn follows_scenes_mic_and_replay_and_takes_actions() {
    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let port = listener.local_addr().unwrap().port();
    let (seen_tx, mut seen) = mpsc::unbounded_channel();
    let server = tokio::spawn(fake_obs(listener, seen_tx));
    let settings = Arc::new(Mutex::new(ObsSettings {
        host: "127.0.0.1".into(),
        port,
        password: String::new(),
    }));
    let streaming = ObsStreaming {
        mic: "Mic/Aux".into(),
        scenes: BTreeMap::from([(
            U1.to_string(),
            SceneLook {
                sub: "Be right back".into(),
                icon: "coffee".into(),
            },
        )]),
    };
    let obs = Obs::with_streaming(
        {
            let settings = Arc::clone(&settings);
            move || settings.lock().unwrap().clone()
        },
        streaming,
        || {},
    );
    let task = tokio::spawn({
        let obs = Arc::clone(&obs);
        async move { obs.run().await }
    });

    // Not connected yet: nothing to act on.
    assert_eq!(obs.act(ObsAct::Replay).await, Err(ActError::NotConnected));
    until("the scenes", || {
        obs.json()["scenes"]
            .as_array()
            .is_some_and(|s| s.len() == 2)
            && obs.json()["mic"]["level"] == 67
    })
    .await;
    let json = obs.json();
    assert_eq!(json["connected"], true);
    assert_eq!(
        json["scenes"][0],
        json!({ "id": U2, "name": "Game", "sub": "", "icon": "" })
    );
    assert_eq!(
        json["scenes"][1],
        json!({ "id": U1, "name": "BRB", "sub": "Be right back", "icon": "coffee" })
    );
    assert_eq!(json["currentScene"], U2);
    assert_eq!(
        json["mic"],
        json!({ "name": "Mic/Aux", "muted": false, "level": 67 })
    );
    assert_eq!(json["replay"], Value::Null);
    assert_eq!(json["inputs"], json!(["Mic/Aux"]));
    assert_eq!(json["fps"], 30);

    // Hello had no password to answer, and the Identify subscribes to the meters because a mic is set.
    let identify = seen.recv().await.unwrap();
    assert_eq!(identify["op"], 1);
    assert_eq!(identify["d"]["eventSubscriptions"], 1 | 4 | 8 | 64 | 65536);
    assert!(identify["d"].get("authentication").is_none());

    // A scene tap is a request by uuid; OBS's event moves the program scene.
    assert_eq!(obs.act(ObsAct::Scene(U1.into())).await, Ok(()));
    until("the scene change", || obs.json()["currentScene"] == U1).await;
    let mut requests = Vec::new();
    while let Ok(message) = seen.try_recv() {
        requests.push(message);
    }
    let set = requests
        .iter()
        .find(|m| m["d"]["requestType"] == "SetCurrentProgramScene")
        .expect("the scene request");
    assert_eq!(set["d"]["requestData"], json!({ "sceneUuid": U1 }));
    assert_eq!(
        obs.act(ObsAct::Scene("nope".into())).await,
        Err(ActError::Refused("no such scene".into()))
    );

    // OBS's refusal comes back as its comment; a request it never answers times out.
    assert_eq!(
        obs.act(ObsAct::Replay).await,
        Err(ActError::Failed("replay buffer is not active".into()))
    );
    assert_eq!(
        obs.act_within(ObsAct::Mic, Duration::from_millis(200))
            .await,
        Err(ActError::Failed("OBS didn't answer".into()))
    );

    // Clearing the host closes the connection: the extras go back to the four on-air fields and actions are turned away.
    settings.lock().unwrap().host.clear();
    obs.reconfigure();
    until("the disconnect", || obs.json().get("scenes").is_none()).await;
    assert_eq!(obs.act(ObsAct::Mic).await, Err(ActError::NotConnected));
    task.abort();
    server.abort();
}

#[tokio::test]
async fn leaves_the_meters_alone_and_refuses_a_mic_action_while_no_mic_is_set() {
    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let port = listener.local_addr().unwrap().port();
    let (seen_tx, mut seen) = mpsc::unbounded_channel();
    let server = tokio::spawn(fake_obs(listener, seen_tx));
    let obs = Obs::new(
        move || ObsSettings {
            host: "127.0.0.1".into(),
            port,
            password: String::new(),
        },
        || {},
    );
    let task = tokio::spawn({
        let obs = Arc::clone(&obs);
        async move { obs.run().await }
    });
    until("the scenes", || {
        obs.json()["scenes"]
            .as_array()
            .is_some_and(|s| s.len() == 2)
    })
    .await;
    let identify = seen.recv().await.unwrap();
    assert_eq!(identify["d"]["eventSubscriptions"], 1 | 4 | 8 | 64);
    assert_eq!(obs.json()["mic"], Value::Null);
    assert_eq!(
        obs.act(ObsAct::Mic).await,
        Err(ActError::Refused("no mic is set".into()))
    );
    task.abort();
    server.abort();
}
