// The live alert engine (the rest of server/alerts.mjs's `createAlerts`): the Data API subscription for the keys the
// rules need, the once-a-second evaluation, alerts.json (the history), the outputs into the control store (page
// switches) and the routes. The rules themselves are alerts_engine.rs.
//
// GET /api/alerts/history, POST /api/control/alert (routed from control_store.rs).

use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::{Arc, Mutex, MutexGuard, OnceLock, PoisonError, Weak};
use std::time::Duration;

use axum::body::Body;
use axum::http::{Method, Response};
use serde_json::{json, Value};
use tokio::sync::{watch, Notify};
use tokio::time::{interval_at, Instant, MissedTickBehavior};

use crate::alerts_engine::{
    act, evaluate, num, quieten, AlertsState, Env, Event, Readings, HISTORY_MAX,
};
use crate::alerts_rules::{get, is_object, keys_of, prefix_of, take_events, truthy};
use crate::config::now_ms;
use crate::control_store::Control;
use crate::http::{self, Req};
use crate::ical::LocalZone;
use crate::json::{keys as json_keys, parse as parse_json, stringify};
use crate::{js, store, supervisor, App};

const DEFAULT_API: &str = "http://127.0.0.1:3921";
const TICK: Duration = Duration::from_secs(1);
const SAVE_DEBOUNCE: Duration = Duration::from_secs(1);
const RECONNECT_MIN: Duration = Duration::from_secs(1);
const RECONNECT_MAX: Duration = Duration::from_secs(30);
const CONNECT_TIMEOUT: Duration = Duration::from_secs(10);

/// What a stream hands to the engine: each parsed JSON message.
pub type OnMessage = Arc<dyn Fn(Value) + Send + Sync>;
/// Opens one stream for a URL (a fake in tests).
pub type Connector = Arc<dyn Fn(&str, OnMessage) -> StreamHandle + Send + Sync>;

/// An open stream; dropping it closes the stream.
pub struct StreamHandle(Option<Arc<watch::Sender<bool>>>);

impl StreamHandle {
    /// A handle with nothing behind it (a test's fake stream).
    pub fn none() -> Self {
        Self(None)
    }
}

impl Drop for StreamHandle {
    fn drop(&mut self) {
        if let Some(stop) = &self.0 {
            let _ = stop.send(true);
        }
    }
}

/// How the engine is built: tests swap the clock, the zone, the stream and the save delay.
pub struct Options {
    pub file: PathBuf,
    pub control: Arc<Control>,
    pub read_config: Box<dyn Fn() -> Option<Value> + Send + Sync>,
    pub now: Box<dyn Fn() -> f64 + Send + Sync>,
    pub zone: LocalZone,
    pub connect: Connector,
    pub save_after: Duration,
}

impl Options {
    /// The server's own: the wall clock, the system zone, real Data API streams that end with `shutdown`.
    pub fn live(
        file: PathBuf,
        control: Arc<Control>,
        shutdown: watch::Receiver<bool>,
        read_config: impl Fn() -> Option<Value> + Send + Sync + 'static,
    ) -> Self {
        let connect: Connector =
            Arc::new(move |url, on_message| sse_connect(url, on_message, shutdown.clone()));
        Self {
            file,
            control,
            read_config: Box::new(read_config),
            now: Box::new(|| now_ms() as f64),
            zone: LocalZone::System,
            connect,
            save_after: SAVE_DEBOUNCE,
        }
    }
}

/// Where an alert's page output came from, to go back to on clear.
struct Return {
    profile: String,
    from: String,
    to: Value,
}

struct Inner {
    state: AlertsState,
    config: Value,
    readings: Readings,
    /// The active list as last given to the control store.
    published: String,
    /// The history revision alerts.json holds; `None` until the first write.
    saved_rev: Option<u64>,
    save_pending: bool,
    streams: Vec<(String, StreamHandle)>,
    returns: HashMap<String, Return>,
}

pub struct Alerts {
    file: PathBuf,
    control: Arc<Control>,
    read_config: Box<dyn Fn() -> Option<Value> + Send + Sync>,
    now: Box<dyn Fn() -> f64 + Send + Sync>,
    zone: LocalZone,
    connect: Connector,
    save_after: Duration,
    wake_saver: Notify,
    me: Weak<Alerts>,
    inner: Mutex<Inner>,
}

fn lock<T>(m: &Mutex<T>) -> MutexGuard<'_, T> {
    m.lock().unwrap_or_else(PoisonError::into_inner)
}

/// alerts.json's history: entries with a string id, the ones still open when the server stopped closed now.
fn load_history(file: &std::path::Path, now: f64) -> Vec<Value> {
    let raw = store::read_json(file);
    let list = raw
        .as_ref()
        .and_then(|r| get(r, "history"))
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();
    list.into_iter()
        .filter(|h| is_object(h) && h["id"].is_string())
        .map(|mut h| {
            if h.get("endedAt").is_none() {
                h["endedAt"] = num(now);
            }
            h
        })
        .take(HISTORY_MAX)
        .collect()
}

/// The Data API's base URL from the config: its `dataApiUrl` when that is an http(s) URL, else the default.
fn api_base(config: &Value) -> String {
    let text = match get(config, "dataApiUrl") {
        None | Some(Value::Null) => String::new(),
        v => js::to_property_key(v),
    };
    match url::Url::parse(&text) {
        Ok(u) if u.scheme() == "http" || u.scheme() == "https" => {
            u.as_str().trim_end_matches('/').to_string()
        }
        _ => DEFAULT_API.to_string(),
    }
}

/// `encodeURIComponent`.
fn encode_component(s: &str) -> String {
    let mut out = String::new();
    for b in s.bytes() {
        if b.is_ascii_alphanumeric() || b"-_.!~*'()".contains(&b) {
            out.push(b as char);
        } else {
            out.push_str(&format!("%{b:02X}"));
        }
    }
    out
}

/// The stream URLs the rules need: one per distinct key prefix.
pub fn stream_urls(config: &Value) -> Vec<String> {
    let base = api_base(config);
    let mut urls: Vec<String> = vec![];
    for key in keys_of(get(config, "alerts")) {
        let url = format!(
            "{base}/events?prefix={}&interval=1000",
            encode_component(prefix_of(&key))
        );
        if !urls.contains(&url) {
            urls.push(url);
        }
    }
    urls
}

impl Alerts {
    pub fn new(options: Options) -> Arc<Self> {
        let Options {
            file,
            control,
            read_config,
            now,
            zone,
            connect,
            save_after,
        } = options;
        let history = load_history(&file, now());
        let config = read_config().unwrap_or(Value::Null);
        let inner = Inner {
            state: AlertsState::with_history(history),
            config,
            readings: Readings::new(),
            published: "[]".into(),
            saved_rev: None,
            save_pending: false,
            streams: vec![],
            returns: HashMap::new(),
        };
        let alerts = Arc::new_cyclic(|me| Self {
            file,
            control,
            read_config,
            now,
            zone,
            connect,
            save_after,
            wake_saver: Notify::new(),
            me: me.clone(),
            inner: Mutex::new(inner),
        });
        alerts.subscribe(&mut lock(&alerts.inner));
        alerts
    }

    /// The tick and the history writer, until `shutdown`.
    pub fn start(self: &Arc<Self>, shutdown: &watch::Receiver<bool>) {
        let alerts = Arc::clone(self);
        supervisor::spawn("alerts tick", shutdown.clone(), move || {
            let alerts = Arc::clone(&alerts);
            async move {
                let mut ticks = interval_at(Instant::now() + TICK, TICK);
                ticks.set_missed_tick_behavior(MissedTickBehavior::Delay);
                loop {
                    ticks.tick().await;
                    alerts.tick();
                }
            }
        });
        let alerts = Arc::clone(self);
        supervisor::spawn("alerts history writer", shutdown.clone(), move || {
            let alerts = Arc::clone(&alerts);
            async move {
                loop {
                    alerts.wake_saver.notified().await;
                    tokio::time::sleep(alerts.save_after).await;
                    alerts.save();
                }
            }
        });
    }

    fn env(&self) -> Env {
        let now = (self.now)();
        let muted = self.control.muted_until().is_some_and(|until| now < until);
        Env {
            now,
            muted,
            zone: self.zone,
        }
    }

    /// One evaluation pass at the current time (the once-a-second tick).
    pub fn tick(&self) {
        let mut inner = lock(&self.inner);
        self.run(&mut inner);
    }

    fn run(&self, inner: &mut Inner) {
        let env = self.env();
        let events = evaluate(
            &mut inner.state,
            get(&inner.config, "alerts"),
            &inner.readings,
            env,
        );
        self.apply(inner, &events);
    }

    /// The profile a page action without one means, as control resolves it.
    fn profile_for(&self, inner: &Inner, id: Option<&Value>) -> Option<String> {
        let state = self.control.get();
        let profiles = state["profiles"].as_object()?;
        let pinned = get(&inner.config, "activeProfile")
            .filter(|p| truthy(Some(*p)) && p.as_str() != Some("auto"));
        let found = [id, Some(&state["profile"]), Some(&state["shown"]), pinned]
            .into_iter()
            .flatten()
            .filter(|p| truthy(Some(*p)))
            .map(|p| js::to_property_key(Some(p)))
            .find(|p| profiles.contains_key(p));
        found.or_else(|| json_keys(profiles).first().map(|k| (*k).clone()))
    }

    fn page_of(&self, profile: &str) -> Value {
        self.control.get()["profiles"][profile]["page"].clone()
    }

    /// Page switches: a fired alert with a page output (not a quiet one) goes there; on clear it goes back if nobody moved.
    fn run_outputs(&self, inner: &mut Inner, events: &[Event]) {
        for event in events {
            match event {
                Event::Fire(alert)
                    if alert.get("page").is_some() && alert.get("quiet").is_none() =>
                {
                    let page = &alert["page"];
                    let Some(profile) = self.profile_for(inner, get(page, "profile")) else {
                        continue;
                    };
                    let from = self.page_of(&profile);
                    if self
                        .control
                        .dispatch(
                            &json!({ "type": "page", "profile": profile, "page": page["page"] }),
                        )
                        .is_err()
                    {
                        continue;
                    }
                    if let (true, Some(from)) = (
                        truthy(get(page, "returnAfter")),
                        from.as_str().filter(|f| !f.is_empty()),
                    ) {
                        let id = alert["id"].as_str().unwrap_or_default().to_string();
                        inner.returns.insert(
                            id,
                            Return {
                                profile,
                                from: from.to_string(),
                                to: page["page"].clone(),
                            },
                        );
                    }
                }
                Event::Clear { alert, .. } => {
                    let Some(back) = alert["id"].as_str().and_then(|id| inner.returns.remove(id))
                    else {
                        continue;
                    };
                    // Only go back if nobody moved the profile off the alert's page meanwhile.
                    if self.page_of(&back.profile) == back.to {
                        let _ = self.control.dispatch(
                            &json!({ "type": "page", "profile": back.profile, "page": back.from }),
                        );
                    }
                }
                Event::Fire(_) => {}
            }
        }
    }

    /// Adopt a pass: run the outputs, publish the active list when it changed, and schedule the history write.
    fn apply(&self, inner: &mut Inner, events: &[Event]) {
        self.run_outputs(inner, events);
        let list = Value::Array(inner.state.active_alerts());
        let text = stringify(&list);
        if text != inner.published {
            inner.published = text;
            self.control.set_alerts(list);
        }
        if inner.saved_rev != Some(inner.state.history_rev) && !inner.save_pending {
            inner.save_pending = true;
            self.wake_saver.notify_one();
        }
    }

    /// Writes alerts.json (compact, through the tmp file).
    pub fn save(&self) {
        let mut inner = lock(&self.inner);
        inner.save_pending = false;
        let text = stringify(&json!({ "history": inner.state.history }));
        match store::write_atomic(&self.file, text.as_bytes()) {
            Ok(()) => inner.saved_rev = Some(inner.state.history_rev),
            Err(e) => log::error!(target: "server", "alerts.json save failed: {e}"),
        }
    }

    /// A reading batch from a stream: merge, drop the removed keys, evaluate.
    pub fn feed(&self, message: &Value) {
        if !is_object(message) {
            return;
        }
        let mut inner = lock(&self.inner);
        if let Some(sensors) = get(message, "sensors").and_then(Value::as_object) {
            for (key, reading) in sensors {
                inner.readings.insert(key.clone(), reading.clone());
            }
        }
        if let Some(removed) = get(message, "removed").and_then(Value::as_array) {
            for key in removed {
                inner.readings.remove(&js::to_property_key(Some(key)));
            }
        }
        self.run(&mut inner);
    }

    /// Open the streams the rules need and close the rest; only changed URLs reconnect.
    fn subscribe(&self, inner: &mut Inner) {
        let wanted = stream_urls(&inner.config);
        inner.streams.retain(|(url, _)| wanted.contains(url));
        for url in wanted {
            if inner.streams.iter().any(|(open, _)| *open == url) {
                continue;
            }
            let me = self.me.clone();
            let on_message: OnMessage = Arc::new(move |message| {
                if let Some(alerts) = me.upgrade() {
                    alerts.feed(&message);
                }
            });
            let handle = (self.connect)(&url, on_message);
            inner.streams.push((url, handle));
        }
    }

    /// The config was saved: re-read the rules, resubscribe if the keys changed, evaluate.
    pub fn config_changed(&self) {
        let mut inner = lock(&self.inner);
        inner.config = (self.read_config)().unwrap_or(Value::Null);
        self.subscribe(&mut inner);
        self.run(&mut inner);
    }

    /// Apply a client action; `{ alerts, mutedUntil }` (the active list and the mute deadline) or the error text.
    /// `{ action: "mute", minutes }` mutes for 1-1440 minutes (0 unmutes) and quietens what is active.
    pub fn act(&self, action: &Value) -> Result<Value, &'static str> {
        let mut guard = lock(&self.inner);
        let inner = &mut *guard;
        if get(action, "action").and_then(Value::as_str) == Some("mute") {
            let mut mute = json!({ "type": "mute" });
            if let Some(minutes) = get(action, "minutes") {
                mute["minutes"] = minutes.clone();
            }
            let done = self.control.dispatch(&mute)?;
            if !done["mutedUntil"].is_null() {
                quieten(&mut inner.state);
                self.apply(inner, &[]);
            }
            return Ok(
                json!({ "alerts": inner.state.active_alerts(), "mutedUntil": done["mutedUntil"] }),
            );
        }
        let env = self.env();
        let events = act(
            &mut inner.state,
            action,
            get(&inner.config, "alerts"),
            &inner.readings,
            env,
        )?;
        self.apply(inner, &events);
        Ok(
            json!({ "alerts": inner.state.active_alerts(), "mutedUntil": self.control.get()["mutedUntil"] }),
        )
    }

    /// The history, newest first.
    pub fn history(&self) -> Value {
        Value::Array(lock(&self.inner).state.history.clone())
    }

    /// The active alerts.
    pub fn alerts(&self) -> Value {
        Value::Array(lock(&self.inner).state.active_alerts())
    }

    /// Closes the streams and writes a pending history.
    pub fn stop(&self) {
        let pending = {
            let mut inner = lock(&self.inner);
            inner.streams.clear();
            inner.save_pending
        };
        if pending {
            self.save();
        }
    }
}

/* ---------------- Data API stream ---------------- */

/// The wait before the next connection: 1 s doubling to 30 s, back to 1 s only after a successful response (not after data).
pub struct Backoff {
    delay: Duration,
}

impl Backoff {
    pub const fn new() -> Self {
        Self {
            delay: RECONNECT_MIN,
        }
    }

    pub fn connected(&mut self) {
        self.delay = RECONNECT_MIN;
    }

    /// The time to wait now; the next wait is twice as long.
    pub fn next_wait(&mut self) -> Duration {
        let wait = self.delay;
        self.delay = (self.delay * 2).min(RECONNECT_MAX);
        wait
    }
}

impl Default for Backoff {
    fn default() -> Self {
        Self::new()
    }
}

fn http_client() -> Result<&'static reqwest::Client, String> {
    static CLIENT: OnceLock<Result<reqwest::Client, String>> = OnceLock::new();
    CLIENT
        .get_or_init(|| {
            // The same TLS setup as the updater: rustls on ring. A second install is refused.
            let _ = rustls::crypto::ring::default_provider().install_default();
            reqwest::Client::builder()
                .no_proxy()
                .connect_timeout(CONNECT_TIMEOUT)
                .build()
                .map_err(|e| e.without_url().to_string())
        })
        .as_ref()
        .map_err(Clone::clone)
}

/// Appends `chunk` to the undecoded `tail` and moves what is complete UTF-8 to `out` (a broken sequence reads as U+FFFD).
fn decode_utf8(tail: &mut Vec<u8>, chunk: &[u8], out: &mut String) {
    tail.extend_from_slice(chunk);
    loop {
        match std::str::from_utf8(tail) {
            Ok(text) => {
                out.push_str(text);
                tail.clear();
                return;
            }
            Err(e) => {
                let valid = e.valid_up_to();
                out.push_str(&String::from_utf8_lossy(&tail[..valid]));
                match e.error_len() {
                    None => {
                        tail.drain(..valid);
                        return;
                    }
                    Some(bad) => {
                        out.push('\u{fffd}');
                        tail.drain(..valid + bad);
                    }
                }
            }
        }
    }
}

/// One connection: until the stream ends or fails. Every parsed message goes to `on_message`; a malformed one is skipped.
async fn read_once(url: &str, on_message: &OnMessage, backoff: &mut Backoff) -> Result<(), String> {
    let mut response = http_client()?
        .get(url)
        .header("Accept", "text/event-stream")
        .send()
        .await
        .map_err(|e| e.without_url().to_string())?;
    if !response.status().is_success() {
        return Err(format!("HTTP {}", response.status().as_u16()));
    }
    backoff.connected();
    let (mut tail, mut buffer) = (Vec::new(), String::new());
    while let Some(chunk) = response
        .chunk()
        .await
        .map_err(|e| e.without_url().to_string())?
    {
        decode_utf8(&mut tail, &chunk, &mut buffer);
        let (data, rest) = take_events(&buffer);
        buffer = rest;
        for payload in data {
            if let Some(message) = parse_json(&payload) {
                on_message(message);
            }
        }
    }
    Ok(())
}

/// Reads a Data API stream, reconnecting with a 1 to 30 s backoff, until `stop` is set.
pub fn sse_connect(
    url: &str,
    on_message: OnMessage,
    shutdown: watch::Receiver<bool>,
) -> StreamHandle {
    let (stop, closed) = watch::channel(false);
    let stop = Arc::new(stop);
    // The stream ends with the server too.
    tokio::spawn({
        let (stop, mut closed, mut shutdown) = (Arc::clone(&stop), closed.clone(), shutdown);
        async move {
            tokio::select! {
                _ = shutdown.wait_for(|s| *s) => { let _ = stop.send(true); }
                _ = closed.wait_for(|s| *s) => {}
            }
        }
    });
    let url = url.to_string();
    supervisor::spawn("alerts data stream", closed, move || {
        let (url, on_message) = (url.clone(), Arc::clone(&on_message));
        async move {
            let mut backoff = Backoff::new();
            loop {
                let _ = read_once(&url, &on_message, &mut backoff).await;
                tokio::time::sleep(backoff.next_wait()).await;
            }
        }
    });
    StreamHandle(Some(stop))
}

/* ---------------- routes ---------------- */

/// GET /api/alerts/history → the history, newest first.
pub fn handle_history(app: &App, req: &Req) -> Response<Body> {
    if req.method != Method::GET {
        return http::empty(405);
    }
    http::json(200, &app.alerts.history())
}

/// POST /api/control/alert (the body already checked): `{ id, action: "ack" | "dismiss" }`, `{ ruleId, action: "test" }` or
/// `{ action: "mute", minutes }` → `{ alerts, mutedUntil }`.
pub fn handle_act(app: &App, body: &Value) -> Response<Body> {
    match app.alerts.act(body) {
        Ok(done) => http::json(200, &done),
        Err(error) => http::text(400, error),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_wait_doubles_to_thirty_seconds_and_resets_only_on_a_response() {
        let mut backoff = Backoff::new();
        let waits: Vec<u64> = (0..7).map(|_| backoff.next_wait().as_secs()).collect();
        assert_eq!(waits, [1, 2, 4, 8, 16, 30, 30]);
        backoff.connected();
        assert_eq!(backoff.next_wait().as_secs(), 1);
        assert_eq!(backoff.next_wait().as_secs(), 2);
    }

    #[test]
    fn a_multibyte_character_split_across_chunks_decodes_whole() {
        let (mut tail, mut out) = (Vec::new(), String::new());
        let bytes = "a°C".as_bytes();
        decode_utf8(&mut tail, &bytes[..2], &mut out);
        assert_eq!(out, "a");
        decode_utf8(&mut tail, &bytes[2..], &mut out);
        assert_eq!(out, "a°C");
        decode_utf8(&mut tail, &[0xff, b'x'], &mut out);
        assert_eq!(out, "a°C\u{fffd}x");
    }

    #[test]
    fn the_stream_urls_are_one_per_prefix_on_the_configured_base() {
        let config = json!({
            "dataApiUrl": "http://10.0.0.5:3921//",
            "alerts": { "rules": [
                { "id": "a", "source": { "kind": "sensor", "key": "gpu.temp", "op": ">", "value": 1 } },
                { "id": "b", "source": { "kind": "sensor", "conditions": [{ "key": "gpu.power" }, { "key": "  " }, { "key": "cpu.load x" }] } },
                { "id": "c", "source": { "kind": "notification" } },
            ] },
        });
        assert_eq!(
            stream_urls(&config),
            [
                "http://10.0.0.5:3921/events?prefix=gpu.&interval=1000",
                "http://10.0.0.5:3921/events?prefix=cpu.&interval=1000",
                "http://10.0.0.5:3921/events?prefix=plugins.InfoPanel.Notifications.windows.&interval=1000",
            ]
        );
        assert!(api_base(&json!({ "dataApiUrl": "ftp://x" })).ends_with(":3921"));
        assert_eq!(encode_component("a b/é"), "a%20b%2F%C3%A9");
    }

    #[test]
    fn a_stored_history_reloads_with_open_entries_closed() {
        let dir = tempfile::tempdir().unwrap();
        let file = dir.path().join("alerts.json");
        std::fs::write(
            &file,
            r#"{"history":[{"id":"a","startedAt":1},{"id":"b","endedAt":3},{"id":5},7]}"#,
        )
        .unwrap();
        let history = load_history(&file, 99.0);
        assert_eq!(
            stringify(&Value::Array(history)),
            r#"[{"id":"a","startedAt":1,"endedAt":99},{"id":"b","endedAt":3}]"#
        );
        std::fs::write(&file, "{broken").unwrap();
        assert!(load_history(&file, 99.0).is_empty());
    }

    #[test]
    fn a_tick_advances_a_duration_without_new_data() {
        use std::sync::atomic::{AtomicI64, Ordering};
        let dir = tempfile::tempdir().unwrap();
        let config = json!({
            "activeProfile": "auto",
            "profiles": [{ "id": "desk", "pages": [{ "id": "main", "name": "main", "placements": [] }] }],
            "alerts": { "enabled": true, "rules": [{
                "id": "r1", "name": "GPU temp", "enabled": true, "severity": "critical",
                "source": { "kind": "sensor", "key": "gpu.temp", "op": ">", "value": 80, "forSeconds": 3 },
                "cooldownSeconds": 0, "outputs": {},
            }] },
        });
        let read = {
            let config = config.clone();
            move || Some(config.clone())
        };
        let clock = Arc::new(AtomicI64::new(1_000_000));
        let control = Control::new(dir.path().join("control.json"), 1_000_000, read.clone());
        let alerts = Alerts::new(Options {
            file: dir.path().join("alerts.json"),
            control: Arc::clone(&control),
            read_config: Box::new(read),
            now: Box::new({
                let clock = Arc::clone(&clock);
                move || clock.load(Ordering::SeqCst) as f64
            }),
            zone: LocalZone::System,
            connect: Arc::new(|_, _| StreamHandle::none()),
            save_after: Duration::ZERO,
        });
        alerts.feed(&json!({ "sensors": { "gpu.temp": { "value": 90 } }, "removed": [] }));
        assert_eq!(control.get()["alerts"], json!([]));
        clock.store(1_002_000, Ordering::SeqCst);
        alerts.tick();
        assert_eq!(control.get()["alerts"], json!([]));
        clock.store(1_003_000, Ordering::SeqCst);
        alerts.tick();
        assert_eq!(control.get()["alerts"].as_array().unwrap().len(), 1);
        alerts.stop();
    }
}
