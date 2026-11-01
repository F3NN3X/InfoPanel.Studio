// The sessions against a fake Stream Deck app over a real socket: a WebSocket server on a free port that speaks VSD2 as
// the app does (plain hellos, then boxed frames with its own keypair) and hands each connection to the test, which reads
// what the client sent and answers. Nothing here reaches the real app.

use std::sync::Arc;
use std::time::Duration;

use futures_util::{SinkExt, StreamExt};
use prost::Message as _;
use serde_json::{json, Value};
use tokio::net::TcpListener;
use tokio::sync::{mpsc, watch};
use tokio_tungstenite::tungstenite::Message as Ws;

use super::client::{open_frame, seal_message, CLIENT_NAME, PROTOCOL_VERSION};
use super::crypto::{self, Channel};
use super::proto::{
    self, client_message::Payload as C, server_message::Payload as S, ClientMessage, ServerMessage,
};
use super::session::Cmd;
use super::{routes, ActError, Endpoint, Forgot, PageTo, StreamDeck};
use crate::integrations::IntegrationsStore;

const WAIT: Duration = Duration::from_secs(5);

/// One connection to the fake app.
struct FakeConn {
    hello: proto::HelloFromClient,
    from_client: mpsc::UnboundedReceiver<C>,
    /// Dropping it closes the connection.
    to_client: mpsc::UnboundedSender<ServerMessage>,
}

impl FakeConn {
    /// The client's next message, or `None` once the connection is closed.
    async fn next(&mut self) -> Option<C> {
        tokio::time::timeout(WAIT, self.from_client.recv())
            .await
            .expect("a client message in time")
    }

    async fn expect(&mut self) -> C {
        self.next().await.expect("the connection is open")
    }

    /// The next message if one comes within `wait`.
    async fn within(&mut self, wait: Duration) -> Option<C> {
        tokio::time::timeout(wait, self.from_client.recv())
            .await
            .ok()
            .flatten()
    }

    fn send(&self, payload: S) {
        self.to_client
            .send(ServerMessage {
                payload: Some(payload),
            })
            .unwrap();
    }
}

struct FakeApp {
    port: u16,
    conns: mpsc::UnboundedReceiver<FakeConn>,
}

impl FakeApp {
    async fn conn(&mut self) -> FakeConn {
        tokio::time::timeout(WAIT, self.conns.recv())
            .await
            .expect("a connection in time")
            .unwrap()
    }
}

/// A fake app whose hello says whether the client must authenticate.
async fn fake_app(needs_auth: bool) -> FakeApp {
    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let port = listener.local_addr().unwrap().port();
    let (conns_tx, conns) = mpsc::unbounded_channel();
    tokio::spawn(async move {
        while let Ok((stream, _)) = listener.accept().await {
            let conns_tx = conns_tx.clone();
            tokio::spawn(async move {
                let Ok(mut ws) = tokio_tungstenite::accept_async(stream).await else {
                    return;
                };
                let Some(Ok(Ws::Binary(frame))) = ws.next().await else {
                    return;
                };
                let Some(C::Hello(hello)) = ClientMessage::decode(&frame[..]).unwrap().payload
                else {
                    panic!("the first frame is a plain hello")
                };
                let secret = crypto::secret_key(&crypto::new_secret().unwrap()).unwrap();
                let reply = ServerMessage {
                    payload: Some(S::Hello(proto::HelloFromServer {
                        public_key: crypto::public_key(&secret).to_vec(),
                        client_needs_authentication: needs_auth,
                    })),
                };
                ws.send(Ws::binary(reply.encode_to_vec())).await.unwrap();
                let channel = Channel::new(&hello.public_key, &secret).unwrap();
                let (from_tx, from_client) = mpsc::unbounded_channel();
                let (to_client, mut to_rx) = mpsc::unbounded_channel::<ServerMessage>();
                let _ = conns_tx.send(FakeConn {
                    hello,
                    from_client,
                    to_client,
                });
                loop {
                    tokio::select! {
                        frame = ws.next() => match frame {
                            Some(Ok(Ws::Binary(frame))) => {
                                let message = open_frame(&channel, &frame).expect("a boxed client message");
                                let _ = from_tx.send(message.payload.unwrap());
                            }
                            Some(Ok(_)) => {}
                            _ => return,
                        },
                        out = to_rx.recv() => match out {
                            Some(message) => {
                                if ws.send(Ws::binary(seal_message(&channel, &message))).await.is_err() {
                                    return;
                                }
                            }
                            None => {
                                let _ = ws.close(None).await;
                                return;
                            }
                        },
                    }
                }
            });
        }
    });
    FakeApp { port, conns }
}

struct Deck {
    deck: Arc<StreamDeck>,
    store: Arc<IntegrationsStore>,
    _dir: tempfile::TempDir,
    _stop: watch::Sender<bool>,
}

/// A started connection over an integrations file holding `streamdeck`, talking to `endpoint`.
fn deck_with(endpoint: Endpoint, streamdeck: Value) -> Deck {
    let dir = tempfile::tempdir().unwrap();
    let file = dir.path().join("integrations.json");
    std::fs::write(
        &file,
        json!({ "streaming": { "streamdeck": streamdeck } }).to_string(),
    )
    .unwrap();
    let store = Arc::new(IntegrationsStore::load(&file));
    let deck = StreamDeck::new(Arc::clone(&store), endpoint);
    let (stop, shutdown) = watch::channel(false);
    deck.start(&shutdown);
    Deck {
        deck,
        store,
        _dir: dir,
        _stop: stop,
    }
}

fn one_device(app_id: &str) -> Value {
    json!({ "enabled": true, "devices": [{ "id": "d1", "name": "IPStudio", "cols": 5, "rows": 3, "app_id": app_id }] })
}

/// The state once `f` holds for it.
async fn until(deck: &StreamDeck, f: impl Fn(&Value) -> bool) -> Value {
    let deadline = tokio::time::Instant::now() + WAIT;
    loop {
        let state = deck.json();
        if f(&state) {
            return state;
        }
        assert!(
            tokio::time::Instant::now() < deadline,
            "timed out; state: {state}"
        );
        tokio::time::sleep(Duration::from_millis(10)).await;
    }
}

fn status_is(status: &'static str) -> impl Fn(&Value) -> bool {
    move |s| s["devices"][0]["status"] == status
}

fn app_id(d: &Deck) -> String {
    d.store.get().streaming.streamdeck.devices[0].app_id.clone()
}

fn layout(keypad: Option<&proto::KeypadConfig>) -> (u32, u32) {
    let crop = keypad.and_then(|k| k.layout_crop.as_ref()).unwrap();
    (crop.width, crop.height)
}

fn update_layout(c: C) -> (u32, u32) {
    let C::UpdateKeypadConfig(update) = c else {
        panic!("expected UpdateKeypadConfig, got {c:?}")
    };
    let crop = update.layout_crop.unwrap();
    (crop.width, crop.height)
}

fn opened(request_id: u32, id: &str, name: &str) -> S {
    S::VirtualDeviceOpened(proto::VirtualDeviceOpened {
        request_id,
        device: Some(proto::VirtualDevice {
            id: id.into(),
            name: name.into(),
        }),
    })
}

fn device_list(devices: &[(&str, &str)]) -> S {
    S::VirtualDeviceList(proto::VirtualDeviceList {
        devices: devices
            .iter()
            .map(|(id, name)| proto::VirtualDevice {
                id: (*id).into(),
                name: (*name).into(),
            })
            .collect(),
    })
}

const CAPS: C = C::ClientCapabilities(proto::ClientCapabilities { is_user_pro: false });

/// Pairs (auto or not, as the fake app needs), then creates the device as the app's `app_id`.
async fn open_new(c: &mut FakeConn, d: &Deck, app_id: &str) {
    c.send(device_list(&[("other", "Other")]));
    let C::CreateVirtualDevice(create) = c.expect().await else {
        panic!("expected a create")
    };
    assert_eq!(
        (
            create.name.as_str(),
            create.skip_uniqueness_of_name_validation
        ),
        ("IPStudio", true)
    );
    assert_eq!(layout(create.keypad_config.as_ref()), (5, 3));
    c.send(opened(create.request_id, app_id, "IPStudio"));
    until(&d.deck, status_is("ready")).await;
}

#[tokio::test]
async fn pairs_creates_the_device_and_follows_its_keys() {
    let mut app = fake_app(true).await;
    let d = deck_with(Endpoint::Fixed(app.port), one_device(""));
    let mut c = app.conn().await;
    // Our hello: the stored key's public half and who we are.
    let secret = crypto::secret_key(&d.store.get().streaming.streamdeck.secret_key).unwrap();
    assert_eq!(c.hello.public_key, crypto::public_key(&secret));
    let info = c.hello.client_information.clone().unwrap();
    assert_eq!(
        (info.name.as_str(), info.protocol_version),
        (CLIENT_NAME, PROTOCOL_VERSION)
    );
    // Pairing: the code is shown, and the first session after turning the connection on asks by itself.
    let state = until(&d.deck, status_is("pairing")).await;
    assert_eq!(
        state["pairingCode"],
        crypto::pairing_code(&c.hello.public_key)
    );
    assert_eq!(
        c.expect().await,
        C::Authenticate(proto::Authenticate { request_id: 0 })
    );
    c.send(S::Ok(proto::Ok { request_id: 0 }));
    assert_eq!(c.expect().await, CAPS);
    open_new(&mut c, &d, "app-1").await;
    assert_eq!(app_id(&d), "app-1");

    // The context's titles (a key past the largest grid is dropped) and an LZ4 icon.
    let actions = vec![
        proto::Action {
            index: 0,
            title: "Mute".into(),
            ..Default::default()
        },
        proto::Action {
            index: 70,
            title: "far".into(),
            ..Default::default()
        },
    ];
    c.send(S::Context(proto::Context {
        profile_id: "p".into(),
        total_pages: 2,
        current_page: 0,
        actions,
    }));
    let pixels = vec![9u8; 144 * 144 * 4];
    let image = proto::Image {
        format: proto::ImageFormat::Lz4 as i32,
        r#type: 0,
        size: Some(proto::Size {
            width: 144,
            height: 144,
        }),
        row_bytes: 576,
        image: lz4_flex::block::compress(&pixels),
    };
    c.send(S::Icon(proto::Icon {
        index: 0,
        image: Some(image),
    }));
    let state = until(&d.deck, |s| s["devices"][0]["keys"][0]["icon"].is_string()).await;
    let version = state["devices"][0]["keys"][0]["icon"]
        .as_str()
        .unwrap()
        .to_string();
    assert_eq!(
        state["devices"][0]["page"],
        json!({ "current": 0, "total": 2 })
    );
    assert_eq!(
        state["devices"][0]["keys"],
        json!([{ "index": 0, "title": "Mute", "icon": version }])
    );
    // The icon is served for its version only, and cached for good then.
    let icon = d.deck.icon("d1", 0).unwrap();
    assert_eq!(icon.content_type, "image/png");
    assert!(icon.bytes.starts_with(b"\x89PNG"));
    let cached = routes::icon_response(Some(icon.clone()), Some(&version));
    assert_eq!(cached.status(), 200);
    assert_eq!(
        cached.headers()["cache-control"],
        "public, max-age=31536000, immutable"
    );
    assert_eq!(cached.headers()["content-type"], "image/png");
    let stale = routes::icon_response(Some(icon), Some("old"));
    assert_eq!(
        (
            stale.status().as_u16(),
            stale.headers()["cache-control"].to_str().unwrap()
        ),
        (404, "no-store")
    );
    assert_eq!(routes::icon_response(None, Some(&version)).status(), 404);

    // A context update replaces and removes titles.
    c.send(S::ContextUpdate(proto::ContextUpdate {
        profile_id: "p".into(),
        replace: vec![proto::Action {
            index: 1,
            title: "Cam".into(),
            ..Default::default()
        }],
        remove: vec![0],
    }));
    until(&d.deck, |s| s["devices"][0]["keys"] == json!([{ "index": 0, "title": "", "icon": version }, { "index": 1, "title": "Cam", "icon": null }])).await;

    // Presses and pages.
    d.deck.press("d1", 1, true).await.unwrap();
    assert_eq!(
        c.expect().await,
        C::KeyPress(proto::KeyPress {
            index: 1,
            pressed: true
        })
    );
    d.deck.press("d1", 1, false).await.unwrap();
    assert_eq!(
        c.expect().await,
        C::KeyPress(proto::KeyPress {
            index: 1,
            pressed: false
        })
    );
    for (to, want) in [
        (PageTo::Next, C::NextPage(proto::NextPage {})),
        (PageTo::Prev, C::PreviousPage(proto::PreviousPage {})),
        (
            PageTo::Index(1),
            C::PageByIndex(proto::PageByIndex { index: 1 }),
        ),
    ] {
        d.deck.page("d1", to).unwrap();
        assert_eq!(c.expect().await, want);
    }
    assert_eq!(d.deck.press("nope", 0, true).await, Err(ActError::NoDevice));

    // Turning the connection off ends the session and the state.
    d.store
        .apply(&json!({ "streaming": { "streamdeck": { "enabled": false } } }))
        .unwrap()
        .unwrap();
    assert_eq!(c.next().await, None, "the connection is closed");
    let state = until(&d.deck, status_is("off")).await;
    assert_eq!(state["devices"][0]["keys"], json!([]));
    assert_eq!(d.deck.press("d1", 1, true).await, Err(ActError::Off));
    assert_eq!(d.deck.pair(), Err(ActError::Off));
    assert!(d.deck.icon("d1", 0).is_none());
}

#[tokio::test]
async fn changes_the_grid_renames_reconnects_and_forgets() {
    let mut app = fake_app(false).await;
    let d = deck_with(Endpoint::Fixed(app.port), one_device(""));
    let mut c = app.conn().await;
    // No pairing needed: the capabilities come first.
    assert_eq!(c.expect().await, CAPS);
    open_new(&mut c, &d, "app-1").await;

    // A grid past 8 x 8 is clamped, stored and sent as a keypad update.
    d.deck.grid("d1", 9, 0).unwrap().unwrap();
    assert_eq!(update_layout(c.expect().await), (8, 1));
    let stored = &d.store.get().streaming.streamdeck.devices[0];
    assert_eq!((stored.cols, stored.rows), (8, 1));

    // A rename deletes the app's device (the one open), then creates the new name; our id stays.
    d.deck.rename("d1", "Desk".into()).unwrap().unwrap();
    assert_eq!(
        c.expect().await,
        C::DeleteVirtualDevice(proto::DeleteVirtualDevice {})
    );
    let C::CreateVirtualDevice(create) = c.expect().await else {
        panic!("expected a create")
    };
    assert_eq!(
        (create.name.as_str(), layout(create.keypad_config.as_ref())),
        ("Desk", (8, 1))
    );
    assert_eq!(app_id(&d), "");
    c.send(opened(create.request_id, "app-2", "Desk"));
    until(&d.deck, status_is("ready")).await;
    assert_eq!(
        (
            app_id(&d).as_str(),
            d.store.get().streaming.streamdeck.devices[0].id.as_str()
        ),
        ("app-2", "d1")
    );

    // A dropped connection comes back and opens the device by its app id (before a name match), then applies the grid.
    drop(c);
    until(&d.deck, |s| s["devices"][0]["status"] != "ready").await;
    let mut c = app.conn().await;
    assert_eq!(c.expect().await, CAPS);
    c.send(device_list(&[("app-x", "Desk"), ("app-2", "Old name")]));
    let C::OpenVirtualDevice(open) = c.expect().await else {
        panic!("expected an open")
    };
    assert_eq!(
        (
            open.request_id,
            open.device_id.as_str(),
            layout(open.keypad_config.as_ref())
        ),
        (1, "app-2", (8, 1))
    );
    c.send(opened(1, "app-2", "Desk"));
    assert_eq!(
        update_layout(c.expect().await),
        (8, 1),
        "re-opening doesn't apply the layout by itself"
    );
    until(&d.deck, status_is("ready")).await;

    // Forget deletes the app's device and drops ours.
    let (forgot, sent) = tokio::join!(d.deck.forget("d1"), c.expect());
    assert_eq!(forgot.unwrap().unwrap(), Forgot::Deleted);
    assert_eq!(sent, C::DeleteVirtualDevice(proto::DeleteVirtualDevice {}));
    assert_eq!(d.deck.json()["devices"], json!([]));
    assert!(d.store.get().streaming.streamdeck.devices.is_empty());
    assert_eq!(d.deck.forget("d1").await.unwrap(), Err(ActError::NoDevice));
}

#[tokio::test]
async fn adopts_a_device_by_name_and_creates_one_when_the_app_lost_it() {
    let mut app = fake_app(false).await;
    let d = deck_with(Endpoint::Fixed(app.port), one_device("app-gone"));
    let mut c = app.conn().await;
    assert_eq!(c.expect().await, CAPS);
    // The stored app id isn't on the list; the user's own "IPStudio" is, and is adopted.
    c.send(device_list(&[("users", "IPStudio")]));
    let C::OpenVirtualDevice(open) = c.expect().await else {
        panic!("expected an open")
    };
    assert_eq!(open.device_id, "users");
    // The app refuses the open: the device is created instead.
    c.send(S::Error(proto::Error {
        request_id: open.request_id,
        code: 0,
        reason: "not found".into(),
    }));
    let C::CreateVirtualDevice(create) = c.expect().await else {
        panic!("expected a create")
    };
    assert_eq!(
        (create.request_id, create.name.as_str()),
        (open.request_id + 1, "IPStudio")
    );
    // Refusing the create too is an error the state shows.
    c.send(S::Error(proto::Error {
        request_id: create.request_id,
        code: 2,
        reason: "too many".into(),
    }));
    let state = until(&d.deck, status_is("error")).await;
    assert!(
        state["devices"][0]["error"]
            .as_str()
            .unwrap()
            .contains("too many"),
        "{state}"
    );
}

#[tokio::test]
async fn asks_to_pair_again_only_when_pair_is_pressed_after_a_refusal() {
    let mut app = fake_app(true).await;
    let d = deck_with(Endpoint::Fixed(app.port), one_device(""));
    let mut c = app.conn().await;
    assert_eq!(
        c.expect().await,
        C::Authenticate(proto::Authenticate { request_id: 0 })
    );
    c.send(S::Error(proto::Error {
        request_id: 0,
        code: 3,
        reason: "rejected".into(),
    }));
    let state = until(&d.deck, status_is("error")).await;
    assert!(
        state["devices"][0]["error"]
            .as_str()
            .unwrap()
            .contains("Press Pair"),
        "{state}"
    );
    // The next connection waits in pairing until Pair is pressed, then asks once.
    let mut c = app.conn().await;
    until(&d.deck, status_is("pairing")).await;
    assert_eq!(
        c.within(Duration::from_millis(300)).await,
        None,
        "no ask without Pair"
    );
    d.deck.pair().unwrap();
    assert_eq!(
        c.expect().await,
        C::Authenticate(proto::Authenticate { request_id: 0 })
    );
    assert!(d.deck.press("d1", 0, true).await == Err(ActError::NotReady));
}

#[tokio::test]
async fn reports_the_app_absent_when_nothing_listens() {
    let closed = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let port = closed.local_addr().unwrap().port();
    drop(closed);
    let d = deck_with(Endpoint::Fixed(port), one_device(""));
    until(&d.deck, status_is("absent")).await;
    let offline = deck_with(Endpoint::Offline, one_device(""));
    until(&offline.deck, status_is("absent")).await;
    assert_eq!(
        offline.deck.press("d1", 0, true).await,
        Err(ActError::NotReady)
    );
}

#[tokio::test]
async fn keeps_the_key_secret_and_names_new_devices() {
    let d = deck_with(Endpoint::Offline, json!({ "enabled": false }));
    // Off without a key: none is made; turning it on makes and stores one.
    assert_eq!(d.store.get().streaming.streamdeck.secret_key, "");
    assert_eq!(d.deck.json()["pairingCode"], "");
    d.store
        .apply(&json!({ "streaming": { "streamdeck": { "enabled": true } } }))
        .unwrap()
        .unwrap();
    let key = d.store.get().streaming.streamdeck.secret_key;
    assert_eq!(key.len(), 64);
    let first = d.deck.create(None, 5, 3).unwrap().unwrap();
    let second = d.deck.create(None, 20, 0).unwrap().unwrap();
    assert_eq!(
        d.deck.create(Some("IPStudio".into()), 5, 3).unwrap(),
        Err(ActError::Invalid(
            "name: another device has that name".into()
        ))
    );
    assert_eq!(
        d.deck.rename(&second, "IPStudio".into()).unwrap(),
        Err(ActError::Invalid(
            "name: another device has that name".into()
        ))
    );
    let state = d.deck.json();
    assert_eq!(state["devices"][0]["id"], first);
    assert_eq!(
        (
            &state["devices"][1]["name"],
            &state["devices"][1]["cols"],
            &state["devices"][1]["rows"]
        ),
        (&json!("IPStudio 2"), &json!(8), &json!(1))
    );
    // The key is in the file only: not in the state, the events or the studio's view.
    let public = d.store.public().to_string();
    let events = String::from_utf8(d.deck.listen().borrow().to_vec()).unwrap();
    for shown in [state.to_string(), public, events] {
        assert!(!shown.contains(&key), "{shown}");
    }
    assert!(
        std::fs::read_to_string(d._dir.path().join("integrations.json"))
            .unwrap()
            .contains(&key)
    );
    // The same key after a reload.
    assert_eq!(
        IntegrationsStore::load(&d._dir.path().join("integrations.json"))
            .get()
            .streaming
            .streamdeck
            .secret_key,
        key
    );
}

#[tokio::test]
async fn applies_a_grid_changed_while_the_device_was_being_created() {
    let mut app = fake_app(false).await;
    let d = deck_with(Endpoint::Fixed(app.port), one_device(""));
    let mut c = app.conn().await;
    assert_eq!(c.expect().await, CAPS);
    c.send(device_list(&[]));
    let C::CreateVirtualDevice(create) = c.expect().await else {
        panic!("expected a create")
    };
    assert_eq!(layout(create.keypad_config.as_ref()), (5, 3));
    d.deck.grid("d1", 4, 4).unwrap().unwrap();
    c.send(opened(create.request_id, "app-1", "IPStudio"));
    assert_eq!(update_layout(c.expect().await), (4, 4));
    until(&d.deck, status_is("ready")).await;
}

const AUTH: C = C::Authenticate(proto::Authenticate { request_id: 0 });

fn set_enabled(d: &Deck, on: bool) {
    d.store
        .apply(&json!({ "streaming": { "streamdeck": { "enabled": on } } }))
        .unwrap()
        .unwrap();
}

#[tokio::test]
async fn a_session_stopped_while_asking_to_pair_gives_the_ask_back() {
    let mut app = fake_app(true).await;
    let d = deck_with(Endpoint::Fixed(app.port), one_device(""));
    let mut c = app.conn().await;
    assert_eq!(c.expect().await, AUTH);
    // Turned off while the app's dialog is up: the task is aborted mid-wait, without an answer.
    set_enabled(&d, false);
    assert_eq!(c.next().await, None);
    set_enabled(&d, true);
    let mut c = app.conn().await;
    assert_eq!(c.expect().await, AUTH, "the next session may ask again");
}

#[tokio::test]
async fn asks_from_one_session_at_a_time_and_needs_pair_once_the_trust_is_gone() {
    let mut app = fake_app(true).await;
    let two = json!({ "enabled": true, "devices": [{ "id": "d1", "name": "A" }, { "id": "d2", "name": "B" }] });
    let d = deck_with(Endpoint::Fixed(app.port), two);
    let (mut a, mut b) = (app.conn().await, app.conn().await);
    let asks = (
        a.within(Duration::from_millis(400)).await,
        b.within(Duration::from_millis(400)).await,
    );
    let (asker, other) = match asks {
        (Some(AUTH), None) => (&mut a, &mut b),
        (None, Some(AUTH)) => (&mut b, &mut a),
        other => panic!("expected one ask, got {other:?}"),
    };
    // Once the app trusts us, the other session asks in turn.
    asker.send(S::Ok(proto::Ok { request_id: 0 }));
    assert_eq!(asker.expect().await, CAPS);
    assert_eq!(other.expect().await, AUTH);
    other.send(S::Ok(proto::Ok { request_id: 0 }));
    assert_eq!(other.expect().await, CAPS);
    // A later hello that asks for authentication again means the trust was taken back: nothing asks until Pair.
    drop(a);
    let mut again = app.conn().await;
    assert_eq!(again.within(Duration::from_millis(300)).await, None);
    d.deck.pair().unwrap();
    assert_eq!(again.expect().await, AUTH);
    drop(b);
}

#[tokio::test]
async fn presses_only_keys_on_the_grid_and_never_loses_a_release_to_a_full_queue() {
    let d = deck_with(Endpoint::Offline, one_device(""));
    until(&d.deck, status_is("absent")).await;
    // A 5 x 3 grid has keys 0 to 14.
    assert!(matches!(
        d.deck.press("d1", 15, true).await,
        Err(ActError::Invalid(_))
    ));
    // A session whose queue holds one command and is not being read.
    let (cmds, mut rx) = mpsc::channel(1);
    {
        let mut inner = super::locked(&d.deck.inner);
        let stop = watch::channel(false).0;
        inner
            .sessions
            .insert("d1".into(), super::Session { cmds, stop });
        inner.states.entry("d1".into()).or_default().status = super::Status::Ready;
    }
    d.deck.press("d1", 2, true).await.unwrap();
    assert_eq!(
        d.deck.press("d1", 3, true).await,
        Err(ActError::NotReady),
        "a press is refused while the queue is full"
    );
    let deck = Arc::clone(&d.deck);
    let release = tokio::spawn(async move { deck.press("d1", 2, false).await });
    tokio::time::sleep(Duration::from_millis(50)).await;
    assert!(matches!(
        rx.recv().await,
        Some(Cmd::Press {
            index: 2,
            down: true
        })
    ));
    release.await.unwrap().unwrap();
    assert!(matches!(
        rx.recv().await,
        Some(Cmd::Press {
            index: 2,
            down: false
        })
    ));
}

#[tokio::test]
async fn keeps_icons_across_a_page_change_each_replaced_as_it_comes() {
    let mut app = fake_app(false).await;
    let d = deck_with(Endpoint::Fixed(app.port), one_device(""));
    let mut c = app.conn().await;
    assert_eq!(c.expect().await, CAPS);
    open_new(&mut c, &d, "app-1").await;
    let context = |page: u32, title: &str| {
        S::Context(proto::Context {
            profile_id: "p".into(),
            total_pages: 2,
            current_page: page,
            actions: vec![proto::Action {
                index: 0,
                title: title.into(),
                ..Default::default()
            }],
        })
    };
    c.send(context(0, "One"));
    let image = proto::Image {
        format: proto::ImageFormat::Png as i32,
        r#type: 0,
        size: None,
        row_bytes: 0,
        image: vec![1, 2, 3],
    };
    c.send(S::Icon(proto::Icon {
        index: 0,
        image: Some(image.clone()),
    }));
    until(&d.deck, |s| s["devices"][0]["keys"][0]["icon"].is_string()).await;
    let first = d.deck.icon("d1", 0).unwrap().version;
    // Another page: the app sends the new page's icons, some before its context; an icon that came first is kept.
    c.send(S::Icon(proto::Icon {
        index: 0,
        image: Some(proto::Image {
            image: vec![4, 5, 6],
            ..image.clone()
        }),
    }));
    c.send(context(1, "Two"));
    until(&d.deck, |s| {
        s["devices"][0]["keys"][0]["title"] == "Two" && s["devices"][0]["page"]["current"] == 1
    })
    .await;
    let second = d.deck.icon("d1", 0).unwrap().version;
    assert_ne!(first, second);
    // An empty icon clears the key.
    c.send(S::Icon(proto::Icon {
        index: 0,
        image: None,
    }));
    until(&d.deck, |s| s["devices"][0]["keys"][0]["icon"].is_null()).await;
    // A smaller grid hides the keys outside it; the app only crops, so it sends nothing for them.
    c.send(S::Icon(proto::Icon {
        index: 3,
        image: Some(image),
    }));
    until(&d.deck, |s| s["devices"][0]["keys"][1]["index"] == 3).await;
    d.deck.grid("d1", 1, 1).unwrap().unwrap();
    assert_eq!(update_layout(c.expect().await), (1, 1));
    until(&d.deck, |s| {
        s["devices"][0]["keys"] == json!([{ "index": 0, "title": "Two", "icon": null }])
    })
    .await;
}

#[tokio::test]
async fn a_rename_adopts_a_device_the_app_has_with_the_new_name() {
    let mut app = fake_app(false).await;
    let d = deck_with(Endpoint::Fixed(app.port), one_device(""));
    let mut c = app.conn().await;
    assert_eq!(c.expect().await, CAPS);
    open_new(&mut c, &d, "app-1").await;
    c.send(device_list(&[
        ("app-1", "IPStudio"),
        ("users-desk", "Desk"),
    ]));
    tokio::time::sleep(Duration::from_millis(50)).await;
    d.deck.rename("d1", "Desk".into()).unwrap().unwrap();
    assert_eq!(
        c.expect().await,
        C::DeleteVirtualDevice(proto::DeleteVirtualDevice {})
    );
    let C::OpenVirtualDevice(open) = c.expect().await else {
        panic!("expected an open")
    };
    assert_eq!(open.device_id, "users-desk");
    c.send(opened(open.request_id, "users-desk", "Desk"));
    assert_eq!(update_layout(c.expect().await), (5, 3));
    until(&d.deck, status_is("ready")).await;
    assert_eq!(app_id(&d), "users-desk");
}

#[tokio::test]
async fn a_rename_while_disconnected_deletes_the_old_device_on_the_next_connection() {
    let mut app = fake_app(false).await;
    let d = deck_with(Endpoint::Fixed(app.port), one_device(""));
    let mut c = app.conn().await;
    assert_eq!(c.expect().await, CAPS);
    open_new(&mut c, &d, "app-1").await;
    drop(c);
    until(&d.deck, status_is("error")).await;
    d.deck.rename("d1", "Desk".into()).unwrap().unwrap();
    let mut c = app.conn().await;
    assert_eq!(c.expect().await, CAPS);
    c.send(device_list(&[("app-1", "IPStudio")]));
    let C::OpenVirtualDevice(open) = c.expect().await else {
        panic!("expected the old device to be opened")
    };
    assert_eq!(open.device_id, "app-1");
    c.send(opened(open.request_id, "app-1", "IPStudio"));
    assert_eq!(
        c.expect().await,
        C::DeleteVirtualDevice(proto::DeleteVirtualDevice {})
    );
    let C::CreateVirtualDevice(create) = c.expect().await else {
        panic!("expected a create")
    };
    assert_eq!(create.name, "Desk");
}

#[tokio::test]
async fn forgets_a_device_that_is_still_being_opened_and_says_when_it_could_not() {
    let mut app = fake_app(false).await;
    let d = deck_with(Endpoint::Fixed(app.port), one_device("app-9"));
    let mut c = app.conn().await;
    assert_eq!(c.expect().await, CAPS);
    c.send(device_list(&[("app-9", "IPStudio")]));
    let C::OpenVirtualDevice(open) = c.expect().await else {
        panic!("expected an open")
    };
    let deck = Arc::clone(&d.deck);
    let forget = tokio::spawn(async move { deck.forget("d1").await });
    tokio::time::sleep(Duration::from_millis(50)).await;
    c.send(opened(open.request_id, "app-9", "IPStudio"));
    assert_eq!(
        c.expect().await,
        C::DeleteVirtualDevice(proto::DeleteVirtualDevice {})
    );
    assert_eq!(forget.await.unwrap().unwrap(), Ok(Forgot::Deleted));
    // With no app to reach, the app's device stays and the answer says so.
    let offline = deck_with(Endpoint::Offline, one_device("app-9"));
    until(&offline.deck, status_is("absent")).await;
    assert_eq!(offline.deck.forget("d1").await.unwrap(), Ok(Forgot::Kept));
    assert!(offline.store.get().streaming.streamdeck.devices.is_empty());
}

#[tokio::test]
async fn an_open_the_app_never_answers_is_a_failed_attempt() {
    let mut app = fake_app(false).await;
    let d = deck_with(Endpoint::Fixed(app.port), one_device(""));
    let mut c = app.conn().await;
    assert_eq!(c.expect().await, CAPS);
    c.send(device_list(&[]));
    let C::CreateVirtualDevice(_) = c.expect().await else {
        panic!("expected a create")
    };
    let state = until(&d.deck, status_is("error")).await;
    assert!(
        state["devices"][0]["error"]
            .as_str()
            .unwrap()
            .contains("didn't answer"),
        "{state}"
    );
    assert_eq!(c.next().await, None, "the connection is closed");
    let mut c = app.conn().await;
    assert_eq!(c.expect().await, CAPS, "and tried again");
}
