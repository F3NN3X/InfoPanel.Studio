// Ping: how long a host takes to answer, for the Ping widget. The server probes the hosts that stored Ping placements name in
// their own settings (`host`, `port`, `interval`), nothing else: a request never names a host, so no page can make the server
// try one, and the stream only carries readings for what the saved config lists. A probe is a TCP connect (the name is looked up
// first and left out of the time) that sends nothing and reads nothing, so no privilege is needed and no data moves. An address on
// this computer or the LAN is a fair target (a router, a NAS): the person typed it.
//
// How often: each target every `interval` seconds (its setting, `INTERVAL_MIN` to `INTERVAL_MAX`, 5 by default), one probe at a
// time per target with a `CONNECT_TIMEOUT`. At most `TARGETS_MAX` targets are probed, and every probe takes a slot of one global
// cap (`PROBES_PER_MINUTE`). A target no placement references any more stops being probed and its readings go.
//
// What the kiosks get: Data API-shaped readings under `ping.<id>.` (`status`: `ok`, `down` or `waiting`; `ms` of the last probe
// while it answered; `avg`, `jitter` and `loss` over the last `WINDOW` probes; `updated`), on `/events/ping?prefix=...`, the
// Data API's own stream format, so the page's sensor store reads them like any other namespace. `<id>` is the host and port as
// words and hyphens (`target_id`), which the widget works out the same way.
//
// GET /events/ping?prefix=          the readings
//
// The switch: `PING=off` (or `0`) probes nothing; the stream sends an empty set and says `X-Ping: off`.

use std::collections::{HashMap, VecDeque};
use std::net::{IpAddr, SocketAddr};
use std::sync::{Arc, Mutex, PoisonError};
use std::time::Duration;

use axum::body::Body;
use axum::http::{HeaderValue, Response};
use serde_json::{json, Value};
use tokio::net::TcpStream;
use tokio::sync::{watch, Notify};
use tokio::task::JoinHandle;
use tokio::time::Instant;

use crate::config::now_ms;
use crate::http::Req;
use crate::weather::{RateCap, Readings};
use crate::{supervisor, App};

/// The readings' namespace.
pub const NAMESPACE: &str = "ping.";
/// The module id of the widget whose placements name the targets.
const MODULE: &str = "Ping";
/// Targets probed at most, and the slots of the global cap per minute.
pub const TARGETS_MAX: usize = 8;
const PROBES_PER_MINUTE: usize = 240;
/// Seconds between probes of a target: the least, the most and the default.
pub const INTERVAL_MIN: u64 = 2;
pub const INTERVAL_MAX: u64 = 60;
pub const INTERVAL_DEFAULT: u64 = 5;
/// The port tried when a placement names none.
const PORT_DEFAULT: u16 = 443;
const CONNECT_TIMEOUT: Duration = Duration::from_secs(2);
/// Probes kept per target for the average, jitter and loss.
pub const WINDOW: usize = 20;
/// How often the due targets are looked for.
const TICK: Duration = Duration::from_secs(1);

/// A host and port to probe, from one placement's settings.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Target {
    pub id: String,
    pub host: String,
    pub port: u16,
    pub interval: u64,
}

/// The key a target's readings sit under: the host and port as lowercase words and hyphens (`1.1.1.1` and 443 is `1-1-1-1-443`).
/// The widget spells it the same way (`src/widgets/ping/target.ts`).
pub fn target_id(host: &str, port: u16) -> String {
    let mut id = String::new();
    for c in format!("{host} {port}").to_ascii_lowercase().chars() {
        let word = c.is_ascii_alphanumeric();
        if word || !id.ends_with('-') {
            id.push(if word { c } else { '-' });
        }
    }
    id.trim_matches('-').to_string()
}

/// Whether `host` is a name or an address a person could mean: letters, digits, hyphens and dots, or an IPv6 literal. Nothing with
/// a scheme, a path, a port, credentials or a space reaches the connect.
fn host_ok(host: &str) -> bool {
    if host.is_empty() || host.len() > 253 {
        return false;
    }
    if host.contains(':') {
        return host.parse::<std::net::Ipv6Addr>().is_ok();
    }
    host.split('.').all(|label| !label.is_empty() && label.len() <= 63 && !label.starts_with('-') && !label.ends_with('-') && label.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'-'))
}

/// A number from a stored setting, which is a number or numeric text.
fn number(v: Option<&Value>) -> Option<f64> {
    match v? {
        Value::Number(n) => n.as_f64(),
        Value::String(s) => s.trim().parse().ok(),
        _ => None,
    }
}

/// A target from a placement's settings, or `None` when its host is not one.
pub fn target_of(settings: &Value) -> Option<Target> {
    let host = settings.get("host")?.as_str()?.trim().to_ascii_lowercase();
    if !host_ok(&host) {
        return None;
    }
    let port = number(settings.get("port")).filter(|p| p.fract() == 0.0 && (1.0..=65535.0).contains(p)).map_or(PORT_DEFAULT, |p| p as u16);
    let interval = number(settings.get("interval")).filter(|i| i.is_finite()).map_or(INTERVAL_DEFAULT, |i| (i.round() as i64).clamp(INTERVAL_MIN as i64, INTERVAL_MAX as i64) as u64);
    Some(Target { id: target_id(&host, port), host, port, interval })
}

/// The targets the config's Ping placements name, in order, once each (the first one's interval), at most `max`.
pub fn referenced_targets(config: &Value, max: usize) -> Vec<Target> {
    let mut found: Vec<Target> = Vec::new();
    let mut stack = vec![config];
    while let Some(v) = stack.pop() {
        match v {
            Value::Array(items) => stack.extend(items.iter().rev()),
            Value::Object(o) => {
                if o.get("module").and_then(Value::as_str) == Some(MODULE) {
                    if let Some(t) = o.get("settings").and_then(target_of).filter(|t| found.len() < max && !found.iter().any(|f| f.id == t.id)) {
                        found.push(t);
                    }
                }
                stack.extend(o.values().rev());
            }
            _ => {}
        }
    }
    found
}

/// The last `WINDOW` probes of a target, in ms; `None` is one that did not answer.
type Window = VecDeque<Option<f64>>;

/// What a window says: the average and jitter (mean change between answers in a row) of the answers, and the share lost, 0 to 100.
pub fn summary(window: &Window) -> (Option<f64>, Option<f64>, f64) {
    let answered: Vec<f64> = window.iter().flatten().copied().collect();
    let avg = (!answered.is_empty()).then(|| answered.iter().sum::<f64>() / answered.len() as f64);
    let steps: Vec<f64> = window.iter().zip(window.iter().skip(1)).filter_map(|(a, b)| Some((a.as_ref()? - b.as_ref()?).abs())).collect();
    let jitter = (!steps.is_empty()).then(|| steps.iter().sum::<f64>() / steps.len() as f64);
    let loss = if window.is_empty() { 0.0 } else { window.iter().filter(|p| p.is_none()).count() as f64 * 100.0 / window.len() as f64 };
    (avg, jitter, loss)
}

fn one_decimal(x: f64) -> f64 {
    (x * 10.0).round() / 10.0
}

struct Entry {
    target: Target,
    window: Window,
    /// Not probed before this (ms).
    next_at: i64,
    updated: Option<i64>,
}

struct State {
    entries: HashMap<String, Entry>,
    wanted: Vec<Target>,
    probes: RateCap,
}

/// The source: `run` is its task, `reconfigure` reads the targets again now (after a config save).
pub struct Ping {
    enabled: bool,
    targets: Box<dyn Fn() -> Vec<Target> + Send + Sync>,
    state: Mutex<State>,
    map: watch::Sender<Arc<Readings>>,
    wake: Notify,
}

/// One probe: the name looked up, then the time a TCP connect takes. `None` when nothing answered in `CONNECT_TIMEOUT`.
async fn probe(host: &str, port: u16) -> Option<f64> {
    let addr: SocketAddr = match host.parse::<IpAddr>() {
        Ok(ip) => SocketAddr::new(ip, port),
        Err(_) => tokio::time::timeout(CONNECT_TIMEOUT, tokio::net::lookup_host((host, port))).await.ok()?.ok()?.next()?,
    };
    let start = Instant::now();
    tokio::time::timeout(CONNECT_TIMEOUT, TcpStream::connect(addr)).await.ok()?.ok()?;
    Some(start.elapsed().as_secs_f64() * 1000.0)
}

impl Ping {
    pub fn new(enabled: bool, targets: impl Fn() -> Vec<Target> + Send + Sync + 'static) -> Arc<Self> {
        let state = State { entries: HashMap::new(), wanted: Vec::new(), probes: RateCap::new(Duration::from_secs(60), PROBES_PER_MINUTE) };
        Arc::new(Self { enabled, targets: Box::new(targets), state: Mutex::new(state), map: watch::channel(Arc::new(Readings::new())).0, wake: Notify::new() })
    }

    /// `PING=off` (or `0`) is the switch.
    pub fn enabled_from_env() -> bool {
        !matches!(std::env::var("PING").ok().as_deref(), Some("off" | "0"))
    }

    fn lock(&self) -> std::sync::MutexGuard<'_, State> {
        self.state.lock().unwrap_or_else(PoisonError::into_inner)
    }

    /// Reads the targets again now.
    pub fn reconfigure(&self) {
        self.wake.notify_one();
    }

    /// The readings now.
    pub fn readings(&self) -> Arc<Readings> {
        self.map.borrow().clone()
    }

    /// Reads the targets from the config: new ones start waiting, ones no placement names any more go.
    fn refresh(&self, now: i64) {
        let wanted: Vec<Target> = if self.enabled { (self.targets)().into_iter().take(TARGETS_MAX).collect() } else { Vec::new() };
        let mut st = self.lock();
        st.entries.retain(|id, _| wanted.iter().any(|t| &t.id == id));
        for t in &wanted {
            let entry = st.entries.entry(t.id.clone()).or_insert_with(|| Entry { target: t.clone(), window: VecDeque::new(), next_at: now, updated: None });
            entry.target = t.clone();
        }
        st.wanted = wanted;
    }

    /// One round: probes the targets that are due (while the cap allows), then publishes. `now` is ms.
    pub async fn poll_once(&self, now: i64) {
        let due: Vec<Target> = {
            let mut st = self.lock();
            let due: Vec<Target> = st.wanted.iter().filter(|t| st.entries.get(&t.id).is_some_and(|e| e.next_at <= now)).cloned().collect();
            let mut taken = Vec::new();
            for t in due {
                if !st.probes.take(now) {
                    break;
                }
                if let Some(e) = st.entries.get_mut(&t.id) {
                    e.next_at = now + t.interval as i64 * 1000;
                }
                taken.push(t);
            }
            taken
        };
        let results = futures_util::future::join_all(due.iter().map(|t| async move { (t.id.clone(), probe(&t.host, t.port).await) })).await;
        {
            let mut st = self.lock();
            for (id, ms) in results {
                if let Some(e) = st.entries.get_mut(&id) {
                    e.window.push_back(ms);
                    while e.window.len() > WINDOW {
                        e.window.pop_front();
                    }
                    e.updated = Some(now);
                }
            }
        }
        self.publish();
    }

    /// Every wanted target's readings, sent to the streams when they changed.
    fn publish(&self) {
        let mut all = Readings::new();
        {
            let st = self.lock();
            for t in &st.wanted {
                let Some(e) = st.entries.get(&t.id) else { continue };
                let prefix = format!("{NAMESPACE}{}.", t.id);
                let last = e.window.back().copied();
                let status = match last {
                    None => "waiting",
                    Some(None) => "down",
                    Some(Some(_)) => "ok",
                };
                all.insert(format!("{prefix}status"), json!({ "text": status, "unit": "" }));
                if let Some(Some(ms)) = last {
                    all.insert(format!("{prefix}ms"), json!({ "value": one_decimal(ms), "unit": "ms" }));
                }
                if !e.window.is_empty() {
                    let (avg, jitter, loss) = summary(&e.window);
                    if let Some(x) = avg {
                        all.insert(format!("{prefix}avg"), json!({ "value": one_decimal(x), "unit": "ms" }));
                    }
                    if let Some(x) = jitter {
                        all.insert(format!("{prefix}jitter"), json!({ "value": one_decimal(x), "unit": "ms" }));
                    }
                    all.insert(format!("{prefix}loss"), json!({ "value": one_decimal(loss), "unit": "%" }));
                }
                if let Some(at) = e.updated {
                    all.insert(format!("{prefix}updated"), json!({ "value": at / 1000, "unit": "" }));
                }
            }
        }
        self.map.send_if_modified(|map| {
            if **map == all {
                return false;
            }
            *map = Arc::new(all);
            true
        });
    }

    /// Reads the targets at once and after each `reconfigure`, and probes the due ones every `TICK`. Never returns.
    pub async fn run(&self) {
        self.refresh(now_ms());
        loop {
            self.poll_once(now_ms()).await;
            tokio::select! {
                _ = tokio::time::sleep(TICK) => {}
                _ = self.wake.notified() => self.refresh(now_ms()),
            }
        }
    }

    /// Starts the supervised task (none when the source is off).
    pub fn start(self: &Arc<Self>, shutdown: &watch::Receiver<bool>) -> Option<JoinHandle<()>> {
        let me = Arc::clone(self);
        self.enabled.then(|| {
            supervisor::spawn("ping", shutdown.clone(), move || {
                let me = Arc::clone(&me);
                async move { me.run().await }
            })
        })
    }
}

/// GET /events/ping?prefix=...: the readings under the prefix (all of `ping.` when none), then what changes.
pub fn handle_events(app: &App, req: &Req) -> Response<Body> {
    let mut reply = crate::weather::events(app, app.ping.map.subscribe(), req, NAMESPACE, "ping");
    if !app.ping.enabled {
        reply.headers_mut().insert("X-Ping", HeaderValue::from_static("off"));
    }
    reply
}

#[cfg(test)]
#[path = "ping_tests.rs"]
mod tests;
