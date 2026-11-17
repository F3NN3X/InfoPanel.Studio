// The live control store (the rest of server/control.mjs's `createControl`): the state behind a lock, control.json, the
// listeners and the kiosk streams, the once-a-second tick, and the routes.
//
// GET /api/control, POST /api/control/<action>, POST /api/control/preview, /events/control.

use std::collections::BTreeMap;
use std::path::PathBuf;
use std::sync::{Arc, Mutex, MutexGuard, PoisonError};
use std::time::Duration;

use axum::body::{Body, Bytes};
use axum::http::{Method, Response};
use serde_json::{json, Value};
use tokio::sync::{mpsc, watch};
use tokio::task::JoinHandle;
use tokio::time::{interval_at, Instant, MissedTickBehavior};

use crate::alerts;
use crate::config::now_ms;
use crate::control::{durable, durable_shape, load, public_state, reduce, reduce_config, State, DISPLAY_SEEN_SAVE_MS};
use crate::http::{self, Req};
use crate::json::{parse as parse_json, stringify};
use crate::request_guard::control_write_refusal;
use crate::{js, sse, store, supervisor, App};

const TICK: Duration = Duration::from_secs(1);
const MAX_CONTROL_BYTES: usize = 4096;
/// The action types a POST may name (`alert` is the alerts module's).
const CONTROL_ACTIONS: [&str; 8] = ["page", "profile", "rotate", "touch", "alert", "kiosk", "display", "auto"];
/// How long a studio's theme preview shows on the kiosks before the server drops it.
pub const THEME_PREVIEW_MS: f64 = 60_000.0;
/// A preview carries a whole theme (its tokens, style and background), so it may be larger than an action.
const MAX_PREVIEW_BYTES: usize = 32 * 1024;

/// A theme a studio shows on the kiosks without saving it (the Theme view's "Show on the kiosks too"). Memory only: never
/// in control.json or the config. It goes when its studio takes it back, when `until` passes, or when the studio's control
/// stream (its session) closes.
struct ThemePreview {
    session: String,
    preview: Value,
    until: f64,
}

/// A studio's session id (`?session=` on its control stream): a short slug, 8 to 64 characters.
pub fn valid_session(id: &str) -> bool {
    (8..=64).contains(&id.len()) && id.chars().all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
}

struct Inner {
    state: State,
    config: Value,
    listeners: BTreeMap<u64, mpsc::UnboundedSender<Bytes>>,
    next_listener: u64,
    kiosk_seq: u64,
    /// When control.json was last written (epoch ms).
    saved_at: f64,
    preview: Option<ThemePreview>,
    /// The studio sessions with an open control stream, and how many streams each has open.
    studios: BTreeMap<String, usize>,
}

/// What a kiosk's control stream says about itself (its link's `?profile=`, `?page=`, `?display=`).
#[derive(Clone, Copy, Default)]
pub struct KioskLink<'a> {
    /// The profile it shows.
    pub profile: &'a str,
    pub page: Option<&'a str>,
    pub address: Option<&'a str>,
    /// The display name from the link (checked by the reducer).
    pub display: Option<&'a str>,
    /// The link pins its profile.
    pub pinned: bool,
}

/// The live control store: `dispatch` applies an action and returns the public state or an error; listeners get the
/// public state on every visible change.
pub struct Control {
    file: PathBuf,
    read_config: Box<dyn Fn() -> Option<Value> + Send + Sync>,
    inner: Mutex<Inner>,
}

fn lock<T>(m: &Mutex<T>) -> MutexGuard<'_, T> {
    m.lock().unwrap_or_else(PoisonError::into_inner)
}

fn view_event(view: &Value) -> Bytes {
    sse::event(&stringify(view))
}

/// What clients see: the public state, and a studio's theme preview while there is one (without its session).
fn view(inner: &Inner) -> Value {
    let mut state = public_state(&inner.state, &inner.config);
    if let (Some(p), Value::Object(map)) = (&inner.preview, &mut state) {
        let mut preview = p.preview.clone();
        if let Value::Object(fields) = &mut preview {
            fields.insert("until".into(), json!(p.until));
        }
        map.insert("themePreview".into(), preview);
    }
    state
}

impl Control {
    /// The store for `file` at time `now` (the reload counters start there); `read_config` returns the parsed config.
    pub fn new(file: PathBuf, now: i64, read_config: impl Fn() -> Option<Value> + Send + Sync + 'static) -> Arc<Self> {
        let state = State { reload: now as f64, ..load(store::read_text(&file).ok().as_deref(), now as f64) };
        let config = read_config().unwrap_or(Value::Null);
        let inner = Inner {
            state,
            config,
            listeners: BTreeMap::new(),
            next_listener: 0,
            kiosk_seq: 0,
            saved_at: now_ms() as f64,
            preview: None,
            studios: BTreeMap::new(),
        };
        Arc::new(Self { file, read_config: Box::new(read_config), inner: Mutex::new(inner) })
    }

    pub fn get(&self) -> Value {
        view(&lock(&self.inner))
    }

    /// Whether a profile has auto-switch rules, so the program in front is worth reading (foreground.rs).
    pub fn wants_front(&self) -> bool {
        crate::control_auto::has_rules(&lock(&self.inner).config)
    }

    /// The alert mute deadline (epoch ms) or `None`.
    pub fn muted_until(&self) -> Option<f64> {
        lock(&self.inner).state.muted_until
    }

    /// Persists what changed, logs a mute change and tells the listeners.
    fn commit(&self, inner: &mut Inner, next: State) {
        if next == inner.state {
            return;
        }
        // Connecting and disconnecting only move a display's last-seen time: that waits for another durable write, or
        // for DISPLAY_SEEN_SAVE_MS, so a flood of connections can't churn the file.
        let now = now_ms() as f64;
        let seen_due = now - inner.saved_at >= DISPLAY_SEEN_SAVE_MS && stringify(&durable(&next)) != stringify(&durable(&inner.state));
        let persist = seen_due || stringify(&durable_shape(&next)) != stringify(&durable_shape(&inner.state));
        let was_muted = inner.state.muted_until;
        inner.state = next;
        if inner.state.muted_until != was_muted {
            match inner.state.muted_until {
                None => log::info!(target: "server", "alerts unmuted"),
                Some(until) => log::info!(target: "server", "alerts muted until {}", js::iso_string(until as i64)),
            }
        }
        if persist {
            inner.saved_at = now;
            if let Err(e) = store::write_atomic(&self.file, stringify(&durable(&inner.state)).as_bytes()) {
                log::error!(target: "server", "control.json save failed: {e}");
            }
        }
        Self::notify(inner);
    }

    fn notify(inner: &mut Inner) {
        let event = view_event(&view(inner));
        inner.listeners.retain(|_, tx| tx.send(event.clone()).is_ok());
    }

    fn dispatch_locked(&self, inner: &mut Inner, action: &Value, now: f64) -> Result<Value, &'static str> {
        if let Some(next) = reduce(&inner.state, action, &inner.config, now)? {
            // Only publish when what clients see (or the durable part) changed; `next_at` moves silently.
            let visible = stringify(&public_state(&next, &inner.config)) != stringify(&public_state(&inner.state, &inner.config));
            if visible || stringify(&durable(&next)) != stringify(&durable(&inner.state)) {
                self.commit(inner, next);
            } else {
                inner.state = next;
            }
        }
        Ok(view(inner))
    }

    /// Applies `action` at time `now` (ms).
    pub fn dispatch_at(&self, action: &Value, now: f64) -> Result<Value, &'static str> {
        self.dispatch_locked(&mut lock(&self.inner), action, now)
    }

    pub fn dispatch(&self, action: &Value) -> Result<Value, &'static str> {
        self.dispatch_at(action, now_ms() as f64)
    }

    /// Publish the active alerts (from the alerts module); listeners fire only when the list changed.
    pub fn set_alerts(&self, list: Value) {
        let mut inner = lock(&self.inner);
        if stringify(&list) != stringify(&inner.state.alerts) {
            let next = State { alerts: list, ..inner.state.clone() };
            self.commit(&mut inner, next);
        }
    }

    /// The config was saved: re-read it, drop stale overrides, publish.
    pub fn config_changed(&self) {
        let mut inner = lock(&self.inner);
        let previous = std::mem::replace(&mut inner.config, (self.read_config)().unwrap_or(Value::Null));
        match reduce_config(&inner.state, &previous, &inner.config) {
            Some(next) => self.commit(&mut inner, next),
            // Same state, but pages may have been added or removed: publish anyway.
            None => Self::notify(&mut inner),
        }
    }

    /// A kiosk stream opened: its id for `disconnect`.
    pub fn connect(&self, link: KioskLink) -> Option<String> {
        self.connect_locked(&mut lock(&self.inner), link)
    }

    fn connect_locked(&self, inner: &mut Inner, link: KioskLink) -> Option<String> {
        inner.kiosk_seq += 1;
        let id = format!("k{}", inner.kiosk_seq);
        let action = json!({
            "type": "connect", "id": id, "profile": link.profile, "page": link.page, "address": link.address,
            "display": link.display, "pinned": link.pinned,
        });
        self.dispatch_locked(inner, &action, now_ms() as f64).ok().map(|_| id)
    }

    pub fn disconnect(&self, id: &str) {
        let _ = self.dispatch(&json!({ "type": "disconnect", "id": id }));
    }

    /// A studio shows `preview` on the kiosks for THEME_PREVIEW_MS from `now`, or takes its own back (`None`). Only a
    /// session with an open control stream may show one, so its stream closing always takes the preview with it.
    pub fn set_preview_at(&self, session: &str, preview: Option<Value>, now: f64) -> Result<Value, &'static str> {
        let mut inner = lock(&self.inner);
        if !inner.studios.contains_key(session) {
            return Err("no open studio session");
        }
        match preview {
            Some(preview) => inner.preview = Some(ThemePreview { session: session.to_string(), preview, until: now + THEME_PREVIEW_MS }),
            None if inner.preview.as_ref().is_some_and(|p| p.session == session) => inner.preview = None,
            None => return Ok(view(&inner)),
        }
        Self::notify(&mut inner);
        Ok(view(&inner))
    }

    /// Drops a preview whose time is up at `now` (the tick).
    pub fn expire_preview_at(&self, now: f64) {
        let mut inner = lock(&self.inner);
        if inner.preview.as_ref().is_some_and(|p| p.until <= now) {
            inner.preview = None;
            Self::notify(&mut inner);
        }
    }

    /// A studio's control stream closed: its last open one takes its preview with it.
    fn studio_closed(&self, session: &str) {
        let mut inner = lock(&self.inner);
        let open = inner.studios.get(session).map_or(0, |n| n.saturating_sub(1));
        if open > 0 {
            inner.studios.insert(session.to_string(), open);
            return;
        }
        inner.studios.remove(session);
        if inner.preview.as_ref().is_some_and(|p| p.session == session) {
            inner.preview = None;
            Self::notify(&mut inner);
        }
    }

    /// A listener's receiver, and the registration to drop.
    pub fn subscribe(self: &Arc<Self>) -> (mpsc::UnboundedReceiver<Bytes>, Stream) {
        let (tx, rx) = mpsc::unbounded_channel();
        let mut inner = lock(&self.inner);
        (rx, self.register(&mut inner, tx, None, None))
    }

    fn register(self: &Arc<Self>, inner: &mut Inner, tx: mpsc::UnboundedSender<Bytes>, kiosk: Option<String>, studio: Option<String>) -> Stream {
        let id = inner.next_listener;
        inner.next_listener += 1;
        inner.listeners.insert(id, tx);
        if let Some(session) = &studio {
            *inner.studios.entry(session.clone()).or_insert(0) += 1;
        }
        Stream { control: Arc::clone(self), listener: id, kiosk, studio }
    }

    /// A control event stream: a kiosk (`profile` given) is reported as shown and listed until the stream closes; a
    /// studio's (`studio`, its session) holds the session open. The current state is queued first, then every change.
    fn open_stream(self: &Arc<Self>, kiosk: Option<KioskLink>, studio: Option<String>) -> (mpsc::UnboundedReceiver<Bytes>, Stream) {
        let (tx, rx) = mpsc::unbounded_channel();
        let mut inner = lock(&self.inner);
        let mut id = None;
        if let Some(link) = kiosk {
            let _ = self.dispatch_locked(&mut inner, &json!({ "type": "shown", "profile": link.profile }), now_ms() as f64);
            id = self.connect_locked(&mut inner, link);
        }
        let _ = tx.send(view_event(&view(&inner)));
        (rx, self.register(&mut inner, tx, id, studio))
    }
}

/// A listener's place in the store, its kiosk and its studio session; all go when it is dropped.
pub struct Stream {
    control: Arc<Control>,
    listener: u64,
    kiosk: Option<String>,
    studio: Option<String>,
}

impl Drop for Stream {
    fn drop(&mut self) {
        lock(&self.control.inner).listeners.remove(&self.listener);
        if let Some(id) = &self.kiosk {
            self.control.disconnect(id);
        }
        if let Some(session) = &self.studio {
            self.control.studio_closed(session);
        }
    }
}

/// The once-a-second tick: expires the alert mute and the theme preview, and rotates the profiles that are due.
pub fn start_tick(control: Arc<Control>, shutdown: watch::Receiver<bool>) -> JoinHandle<()> {
    supervisor::spawn("control tick", shutdown, move || {
        let control = Arc::clone(&control);
        async move {
            let mut ticks = interval_at(Instant::now() + TICK, TICK);
            ticks.set_missed_tick_behavior(MissedTickBehavior::Delay);
            loop {
                ticks.tick().await;
                let _ = control.dispatch(&json!({ "type": "tick" }));
                control.expire_preview_at(now_ms() as f64);
            }
        }
    })
}

/* ---------------- routes ---------------- */

/// GET /api/control → the state; POST /api/control/<action> with a JSON body → the new state.
pub async fn handle(app: &App, mut req: Req) -> Response<Body> {
    if req.path == "/api/control" {
        if req.method != Method::GET {
            return http::empty(405);
        }
        return http::json(200, &app.control.get());
    }
    let kind = req.path.strip_prefix("/api/control/").unwrap_or_default().to_string();
    if kind == "preview" {
        return handle_preview(app, req).await;
    }
    if !CONTROL_ACTIONS.contains(&kind.as_str()) {
        return http::empty(404);
    }
    if req.method != Method::POST {
        return http::empty(405);
    }
    if let Some(refusal) = control_write_refusal(req.header("content-type").as_deref(), req.header("x-dashboard-control").as_deref()) {
        return http::text(refusal.status, refusal.message);
    }
    let body = match req.read_body(MAX_CONTROL_BYTES).await {
        Ok(text) if text.is_empty() => Some(json!({})),
        Ok(text) => parse_json(&text),
        Err(http::BodyRefused) => return http::closing(http::text(400, "expected a JSON object")),
    };
    let Some(Value::Object(mut action)) = body else {
        return http::text(400, "expected a JSON object");
    };
    if kind == "alert" {
        return alerts::handle_act(app, &Value::Object(action));
    }
    action.insert("type".into(), Value::String(kind));
    match app.control.dispatch(&Value::Object(action)) {
        Ok(state) => http::json(200, &state),
        Err(error) => http::text(400, error),
    }
}

/// POST /api/control/preview `{ session, preview }`: a studio shows a theme on the kiosks for a while (`preview`, an object
/// with the `preset` to draw), or takes its own back (`preview: null`). The control write headers, and from this machine
/// only unless editing from other devices is on, as for a config write.
async fn handle_preview(app: &App, mut req: Req) -> Response<Body> {
    if req.method != Method::POST {
        return http::empty(405);
    }
    if let Some(refusal) = control_write_refusal(req.header("content-type").as_deref(), req.header("x-dashboard-control").as_deref()) {
        return http::text(refusal.status, refusal.message);
    }
    if let Some(response) = app.refuse_remote_edit(&req) {
        return response;
    }
    let body = match req.read_body(MAX_PREVIEW_BYTES).await {
        Ok(text) => parse_json(&text),
        Err(http::BodyRefused) => return http::closing(http::text(400, "expected a JSON object")),
    };
    let Some(Value::Object(body)) = body else {
        return http::text(400, "expected a JSON object");
    };
    let Some(session) = body.get("session").and_then(Value::as_str).filter(|s| valid_session(s)) else {
        return http::text(400, "bad session");
    };
    let preview = match body.get("preview") {
        Some(Value::Null) | None => None,
        Some(p @ Value::Object(fields)) if fields.get("preset").is_some_and(Value::is_object) => Some(p.clone()),
        Some(_) => return http::text(400, "expected a preview with a preset, or null"),
    };
    match app.control.set_preview_at(session, preview, now_ms() as f64) {
        Ok(state) => http::json(200, &state),
        Err(error) => http::text(409, error),
    }
}

/// The control stream. `?profile=<id>` reports the profile this kiosk shows (and `?page=<id>` its page pin), which
/// lists the stream as a kiosk in the state until it closes; `?display=<name>` names the display it is, and `pinned=1`
/// says its link pins the profile. Only a kiosk on this machine has its address listed: the
/// state is public. `?client=studio` from this machine counts the stream as an open studio (/api/server/stats), and with
/// `&session=<id>` (from any machine) the stream holds that studio session open for its theme preview.
pub fn handle_events(app: &App, req: &Req) -> Response<Body> {
    let shown = req.query("profile").filter(|p| !p.is_empty());
    let page = req.query("page");
    let address = req.is_loopback().then_some(req.peer.as_str());
    let display = req.query("display");
    let pinned = req.query("pinned").as_deref() == Some("1");
    let link = |profile| KioskLink { profile, page: page.as_deref(), address, display: display.as_deref(), pinned };
    let marked = shown.is_none() && req.query("client").as_deref() == Some("studio");
    let session = req.query("session").filter(|s| marked && valid_session(s));
    let (rx, stream) = app.control.open_stream(shown.as_deref().map(link), session);
    let studio = marked && req.is_loopback();
    let client = app.debug.sse_open(if studio { "studio" } else { "control" });
    sse::response(rx, app.shutdown.clone(), Box::new((stream, client)))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn config() -> Value {
        json!({ "profiles": [{ "id": "desk", "pages": [{ "id": "a" }, { "id": "b" }, { "id": "c" }] }] })
    }

    #[test]
    fn a_kiosk_stream_lists_its_kiosk_until_dropped_and_tells_the_others() {
        let dir = tempfile::tempdir().unwrap();
        let control = Control::new(dir.path().join("control.json"), 1000, || Some(config()));
        let (mut watcher, _guard) = control.subscribe();
        let (mut rx, stream) = control.open_stream(Some(KioskLink { profile: "desk", address: Some("::ffff:10.0.0.2"), ..KioskLink::default() }), None);
        let first: Value = serde_json::from_str(std::str::from_utf8(&rx.try_recv().unwrap()).unwrap().trim_start_matches("data: ").trim()).unwrap();
        assert_eq!(first["kiosks"][0]["address"], "10.0.0.2");
        assert_eq!(first["shown"], "desk");
        // `shown` changed (not yet a kiosk), then the kiosk joined.
        assert!(watcher.try_recv().is_ok() && watcher.try_recv().is_ok());
        // Kiosks are live state: control.json never lists them or their addresses.
        let saved = std::fs::read_to_string(dir.path().join("control.json")).unwrap_or_default();
        assert!(!saved.contains("kiosks") && !saved.contains("10.0.0.2"), "{saved}");
        drop(stream);
        assert!(watcher.try_recv().is_ok());
        assert_eq!(control.get()["kiosks"], json!([]));
    }

    #[test]
    fn a_plain_reconnect_of_a_known_display_does_not_rewrite_control_json() {
        let dir = tempfile::tempdir().unwrap();
        let file = dir.path().join("control.json");
        let control = Control::new(file.clone(), 1000, || Some(config()));
        let link = KioskLink { profile: "desk", display: Some("hall"), ..KioskLink::default() };
        // Registering writes the file.
        let (_rx, stream) = control.open_stream(Some(link), None);
        let saved = std::fs::read_to_string(&file).unwrap();
        assert!(saved.contains("\"hall\""), "{saved}");
        // Going away and coming back moves last seen in memory only.
        drop(stream);
        std::thread::sleep(Duration::from_millis(5));
        let (_rx, _stream) = control.open_stream(Some(link), None);
        assert_eq!(std::fs::read_to_string(&file).unwrap(), saved);
        let seen = control.get()["displays"][0]["lastSeen"].as_f64().unwrap();
        assert!(seen > serde_json::from_str::<Value>(&saved).unwrap()["displays"]["hall"]["lastSeen"].as_f64().unwrap());
        // Assigning is durable and carries the newer last seen along.
        control.dispatch(&json!({ "type": "display", "action": "assign", "display": "hall", "screen": "desk" })).unwrap();
        let after: Value = serde_json::from_str(&std::fs::read_to_string(&file).unwrap()).unwrap();
        assert_eq!(after["displays"]["hall"]["screen"], "desk");
        assert_eq!(after["displays"]["hall"]["lastSeen"].as_f64().unwrap(), seen);
    }

    #[test]
    fn the_program_in_front_switches_and_is_published_only_while_a_rule_exists() {
        let dir = tempfile::tempdir().unwrap();
        let rules = Arc::new(Mutex::new(true));
        let read = Arc::clone(&rules);
        let control = Control::new(dir.path().join("control.json"), 1000, move || {
            let coding = if *lock(&read) { json!({ "exe": ["Code.exe"] }) } else { Value::Null };
            Some(json!({ "profiles": [
                { "id": "main", "width": 1024, "height": 600, "pages": [{ "id": "a" }] },
                { "id": "coding", "width": 1024, "height": 600, "pages": [{ "id": "a" }], "autoSwitch": coding },
            ] }))
        });
        assert!(control.wants_front());
        control.dispatch(&json!({ "type": "shown", "profile": "main" })).unwrap();
        let state = control.dispatch(&json!({ "type": "front", "exe": "Code.exe" })).unwrap();
        assert_eq!((state["profile"].as_str(), state["front"].as_str()), (Some("coding"), Some("Code.exe")));
        // The switch's override is durable, so a restart can still take it back; the program in front is not.
        let saved = std::fs::read_to_string(dir.path().join("control.json")).unwrap();
        assert!(saved.contains(r#""autoProfile":"coding""#) && !saved.contains("Code.exe"), "{saved}");
        // The rule is gone: nothing is read or published, and the switch takes its override back.
        *lock(&rules) = false;
        control.config_changed();
        assert!(!control.wants_front());
        let state = control.get();
        assert!(state.get("front").is_none(), "{state}");
        assert_eq!(state["profile"], Value::Null);
    }

    #[test]
    fn a_theme_preview_needs_an_open_studio_session_and_goes_on_timeout_or_when_its_stream_closes() {
        let dir = tempfile::tempdir().unwrap();
        let file = dir.path().join("control.json");
        let control = Control::new(file.clone(), 1000, || Some(config()));
        let preview = json!({ "preset": { "id": "builtin:look-term", "name": "Term" }, "scope": { "kind": "profile", "profileId": "desk" } });
        // No stream holds the session open: refused, so no preview can outlive its studio.
        assert_eq!(control.set_preview_at("studio-one", Some(preview.clone()), 0.0), Err("no open studio session"));
        let (_rx, studio) = control.open_stream(None, Some("studio-one".into()));
        let (mut watcher, _guard) = control.subscribe();

        let shown = control.set_preview_at("studio-one", Some(preview.clone()), 5_000.0).unwrap();
        assert_eq!(shown["themePreview"]["preset"]["name"], "Term");
        assert_eq!(shown["themePreview"]["until"], json!(5_000.0 + THEME_PREVIEW_MS));
        assert!(shown["themePreview"].get("session").is_none(), "{shown}");
        assert!(watcher.try_recv().is_ok());
        // Memory only: control.json never holds it.
        assert!(!std::fs::read_to_string(&file).unwrap_or_default().contains("themePreview"));

        // Another studio cannot take it back, nor end it by closing; its own can.
        let (_rx2, other) = control.open_stream(None, Some("studio-two".into()));
        assert!(control.set_preview_at("studio-two", None, 6_000.0).unwrap().get("themePreview").is_some());
        drop(other);
        assert!(control.get().get("themePreview").is_some());

        // The timeout: kept until `until`, gone at it, and the listeners are told.
        control.expire_preview_at(5_000.0 + THEME_PREVIEW_MS - 1.0);
        assert!(control.get().get("themePreview").is_some());
        control.expire_preview_at(5_000.0 + THEME_PREVIEW_MS);
        assert!(control.get().get("themePreview").is_none());
        assert!(watcher.try_recv().is_ok());

        // The studio's stream closes (a disconnect): its preview goes with it, and the session can no longer show one.
        control.set_preview_at("studio-one", Some(preview.clone()), 7_000.0).unwrap();
        drop(studio);
        assert!(control.get().get("themePreview").is_none());
        assert_eq!(control.set_preview_at("studio-one", Some(preview), 8_000.0), Err("no open studio session"));
    }

    #[test]
    fn a_studio_with_two_streams_keeps_its_preview_until_the_last_closes() {
        let dir = tempfile::tempdir().unwrap();
        let control = Control::new(dir.path().join("control.json"), 1000, || Some(config()));
        let (_a, first) = control.open_stream(None, Some("studio-one".into()));
        let (_b, second) = control.open_stream(None, Some("studio-one".into()));
        control.set_preview_at("studio-one", Some(json!({ "preset": {} })), 0.0).unwrap();
        drop(first);
        assert!(control.get().get("themePreview").is_some());
        drop(second);
        assert!(control.get().get("themePreview").is_none());
    }

    #[test]
    fn a_session_id_is_a_short_slug() {
        assert!(valid_session("a1b2c3d4") && valid_session(&"x".repeat(64)) && valid_session("studio_one-2"));
        assert!(!valid_session("short") && !valid_session(&"x".repeat(65)) && !valid_session("has space1") && !valid_session("dots.are.out"));
    }

    #[test]
    fn a_save_failure_leaves_the_state_updated() {
        let dir = tempfile::tempdir().unwrap();
        // The file's parent is a file, so every write fails.
        std::fs::write(dir.path().join("blocked"), "").unwrap();
        let control = Control::new(dir.path().join("blocked").join("control.json"), 1000, || Some(config()));
        let state = control.dispatch_at(&json!({ "type": "page", "profile": "desk", "page": "b" }), 0.0).unwrap();
        assert_eq!(state["profiles"]["desk"]["page"], "b");
    }
}
