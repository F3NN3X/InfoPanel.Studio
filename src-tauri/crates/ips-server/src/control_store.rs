// The live control store (the rest of server/control.mjs's `createControl`): the state behind a lock, control.json, the
// listeners and the kiosk streams, the once-a-second tick, and the routes.
//
// GET /api/control, POST /api/control/<action>, /events/control.

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

use crate::config::now_ms;
use crate::control::{durable, load, public_state, reduce, reduce_config, State};
use crate::http::{self, Req};
use crate::json::{parse as parse_json, stringify};
use crate::request_guard::control_write_refusal;
use crate::{js, sse, store, supervisor, App};

const TICK: Duration = Duration::from_secs(1);
const MAX_CONTROL_BYTES: usize = 4096;
/// The action types a POST may name (`alert` is the alerts module's).
const CONTROL_ACTIONS: [&str; 6] = ["page", "profile", "rotate", "touch", "alert", "kiosk"];

struct Inner {
    state: State,
    config: Value,
    listeners: BTreeMap<u64, mpsc::UnboundedSender<Bytes>>,
    next_listener: u64,
    kiosk_seq: u64,
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

impl Control {
    /// The store for `file` at time `now` (the reload counters start there); `read_config` returns the parsed config.
    pub fn new(file: PathBuf, now: i64, read_config: impl Fn() -> Option<Value> + Send + Sync + 'static) -> Arc<Self> {
        let state = State { reload: now as f64, ..load(store::read_text(&file).ok().as_deref(), now as f64) };
        let config = read_config().unwrap_or(Value::Null);
        let inner = Inner { state, config, listeners: BTreeMap::new(), next_listener: 0, kiosk_seq: 0 };
        Arc::new(Self { file, read_config: Box::new(read_config), inner: Mutex::new(inner) })
    }

    pub fn get(&self) -> Value {
        let inner = lock(&self.inner);
        public_state(&inner.state, &inner.config)
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
        let persist = stringify(&durable(&next)) != stringify(&durable(&inner.state));
        let was_muted = inner.state.muted_until;
        inner.state = next;
        if inner.state.muted_until != was_muted {
            match inner.state.muted_until {
                None => log::info!(target: "server", "alerts unmuted"),
                Some(until) => log::info!(target: "server", "alerts muted until {}", js::iso_string(until as i64)),
            }
        }
        if persist {
            if let Err(e) = store::write_atomic(&self.file, stringify(&durable(&inner.state)).as_bytes()) {
                log::error!(target: "server", "control.json save failed: {e}");
            }
        }
        Self::notify(inner);
    }

    fn notify(inner: &mut Inner) {
        let event = view_event(&public_state(&inner.state, &inner.config));
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
        Ok(public_state(&inner.state, &inner.config))
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

    /// A kiosk stream opened (`profile` from `?profile=`, `page` from `?page=`): its id for `disconnect`.
    pub fn connect(&self, profile: &str, page: Option<&str>, address: Option<&str>) -> Option<String> {
        self.connect_locked(&mut lock(&self.inner), profile, page, address)
    }

    fn connect_locked(&self, inner: &mut Inner, profile: &str, page: Option<&str>, address: Option<&str>) -> Option<String> {
        inner.kiosk_seq += 1;
        let id = format!("k{}", inner.kiosk_seq);
        let action = json!({ "type": "connect", "id": id, "profile": profile, "page": page, "address": address });
        self.dispatch_locked(inner, &action, now_ms() as f64).ok().map(|_| id)
    }

    pub fn disconnect(&self, id: &str) {
        let _ = self.dispatch(&json!({ "type": "disconnect", "id": id }));
    }

    /// A listener's receiver, and the registration to drop.
    pub fn subscribe(self: &Arc<Self>) -> (mpsc::UnboundedReceiver<Bytes>, Stream) {
        let (tx, rx) = mpsc::unbounded_channel();
        let mut inner = lock(&self.inner);
        (rx, self.register(&mut inner, tx, None))
    }

    fn register(self: &Arc<Self>, inner: &mut Inner, tx: mpsc::UnboundedSender<Bytes>, kiosk: Option<String>) -> Stream {
        let id = inner.next_listener;
        inner.next_listener += 1;
        inner.listeners.insert(id, tx);
        Stream { control: Arc::clone(self), listener: id, kiosk }
    }

    /// A control event stream: a kiosk (`profile` given) is reported as shown and listed until the stream closes. The
    /// current state is queued first, then every change.
    fn open_stream(self: &Arc<Self>, kiosk: Option<(&str, Option<&str>, Option<&str>)>) -> (mpsc::UnboundedReceiver<Bytes>, Stream) {
        let (tx, rx) = mpsc::unbounded_channel();
        let mut inner = lock(&self.inner);
        let mut id = None;
        if let Some((profile, page, address)) = kiosk {
            let _ = self.dispatch_locked(&mut inner, &json!({ "type": "shown", "profile": profile }), now_ms() as f64);
            id = self.connect_locked(&mut inner, profile, page, address);
        }
        let _ = tx.send(view_event(&public_state(&inner.state, &inner.config)));
        (rx, self.register(&mut inner, tx, id))
    }
}

/// A listener's place in the store, and its kiosk; both go when it is dropped.
pub struct Stream {
    control: Arc<Control>,
    listener: u64,
    kiosk: Option<String>,
}

impl Drop for Stream {
    fn drop(&mut self) {
        lock(&self.control.inner).listeners.remove(&self.listener);
        if let Some(id) = &self.kiosk {
            self.control.disconnect(id);
        }
    }
}

/// The once-a-second tick: expires the alert mute and rotates the profiles that are due.
pub fn start_tick(control: Arc<Control>, shutdown: watch::Receiver<bool>) -> JoinHandle<()> {
    supervisor::spawn("control tick", shutdown, move || {
        let control = Arc::clone(&control);
        async move {
            let mut ticks = interval_at(Instant::now() + TICK, TICK);
            ticks.set_missed_tick_behavior(MissedTickBehavior::Delay);
            loop {
                ticks.tick().await;
                let _ = control.dispatch(&json!({ "type": "tick" }));
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
        Err(()) => return http::closing(http::text(400, "expected a JSON object")),
    };
    let Some(Value::Object(mut action)) = body else {
        return http::text(400, "expected a JSON object");
    };
    if kind == "alert" {
        return http::text(501, "not ported to ips-server yet");
    }
    action.insert("type".into(), Value::String(kind));
    match app.control.dispatch(&Value::Object(action)) {
        Ok(state) => http::json(200, &state),
        Err(error) => http::text(400, error),
    }
}

/// The control stream. `?profile=<id>` reports the profile this kiosk shows (and `?page=<id>` its page pin), which
/// lists the stream as a kiosk in the state until it closes. Only a kiosk on this machine has its address listed: the
/// state is public. `?client=studio` from this machine counts the stream as an open studio (/api/server/stats).
pub fn handle_events(app: &App, req: &Req) -> Response<Body> {
    let shown = req.query("profile").filter(|p| !p.is_empty());
    let page = req.query("page");
    let address = req.is_loopback().then_some(req.peer.as_str());
    let (rx, stream) = app.control.open_stream(shown.as_deref().map(|profile| (profile, page.as_deref(), address)));
    let studio = shown.is_none() && req.query("client").as_deref() == Some("studio") && req.is_loopback();
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
        let (mut rx, stream) = control.open_stream(Some(("desk", None, Some("::ffff:10.0.0.2"))));
        let first: Value = serde_json::from_str(std::str::from_utf8(&rx.try_recv().unwrap()).unwrap().trim_start_matches("data: ").trim()).unwrap();
        assert_eq!(first["kiosks"][0]["address"], "10.0.0.2");
        assert_eq!(first["shown"], "desk");
        // `shown` changed (not yet a kiosk), then the kiosk joined.
        assert!(watcher.try_recv().is_ok() && watcher.try_recv().is_ok());
        drop(stream);
        assert!(watcher.try_recv().is_ok());
        assert_eq!(control.get()["kiosks"], json!([]));
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
