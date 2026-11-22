// Device batteries (#365): the battery levels of wireless peripherals — mice, keyboards, headsets,
// controllers, phones — read by the poll core ported verbatim from the batterymon-proto prototype
// (crates/ips-battery: 55 vendor drivers plus the Bluetooth, HID Battery Strength and XInput
// fallbacks, all read-only).
//
// Where it runs: a supervised task polls the core on the blocking pool, then every
// `interval` seconds (the timer starts after the poll returns, as in the prototype), plus soon
// after a device arrival/removal (WM_DEVICECHANGE, 2.5 s) and after resume
// (PBT_APMRESUMEAUTOMATIC, 5 s) — the prototype's worker triggers, via a hidden top-level window
// on a watcher thread. Polls never overlap: the loop is sequential and some drivers keep HID
// handles open across polls. A cold poll can take seconds (receiver waits, BLE adverts); the
// stream never touches the poll path, it reads the watch channel.
//
// What kiosks get: Data API-shaped readings under `battery.<id>.` (`name`, `percent`, `charging`,
// `kind`, `via`, `low`, `connected`, `asleep`, `detail`, `source`, `updated`) and `battery.status`,
// on `/events/devices?prefix=`, the weather feed's format: a full set on connect, then the changed
// and removed keys. `<id>` is the prototype's own FNV-1a hash of the device key (`stable_id`),
// stable across re-plugs. The grace/asleep bookkeeping is the tray code's (`on_results`), hosted
// here: a device that stops answering keeps its last value, marked asleep, for its `grace_sec`
// (Logitech receivers drop sleeping devices; they keep theirs 30 min).
//
// The switch: the integrations' `peripherals.enabled` (`peripherals.rs`), read live by the task before every round,
// over the hard off switch `DEVICE_BATTERIES=off` (or `0`); nothing polls while either says off, the stream sends an
// empty set and every answer says `X-Devices: off`. A server bound with `bind_with_home` (a test) reports the switch
// but never reads this PC's devices.
//
// GET /api/devices/battery        the source's state: every device seen, hidden ones included
// GET /events/devices?prefix=     the readings (all of `battery.` when no prefix)

use std::collections::BTreeMap;
use std::convert::Infallible;
use std::sync::{Arc, Mutex, PoisonError};
use std::time::Duration;

use axum::body::{Body, Bytes};
use axum::http::{HeaderValue, Method, Response};
use serde_json::{json, Map, Value};
use tokio::sync::{watch, Notify};
use tokio::task::JoinHandle;
use tokio::time::interval_at;

use crate::config::now_ms;
use crate::http::{self, Req};
use crate::json as jsonc;
use crate::{sse, supervisor, App};

/// The readings' namespace.
pub const NAMESPACE: &str = "battery.";
/// The default poll interval and its range (the prototype polls every 60 s).
pub const INTERVAL_DEFAULT: u32 = 60;
pub const INTERVAL_MIN: u32 = 30;
pub const INTERVAL_MAX: u32 = 300;
/// How soon the task looks at the switch again while the source is off.
pub const OFF_RECHECK: Duration = Duration::from_secs(5);
/// The default low threshold (the prototype's LOW_BATTERY).
pub const LOW_DEFAULT: u32 = 15;

/// The poll options, re-read before every poll: the master switch, the interval, the low threshold, the devices
/// hidden from the readings (still polled), and the owner's renames. Read live from the integrations file
/// (`peripherals.rs`) before every round, so a save takes effect without a restart.
#[derive(Clone, Debug, Default, PartialEq)]
pub struct Opts {
    /// The master switch: off means nothing polls and kiosks get an empty reading set.
    pub enabled: bool,
    pub interval_sec: u32,
    pub low_percent: u32,
    pub hidden: Vec<String>,
    pub names: BTreeMap<String, String>,
}

impl Opts {
    pub fn interval(&self) -> u32 {
        clamp_interval(self.interval_sec)
    }

    pub fn low(&self) -> u32 {
        if self.low_percent == 0 {
            LOW_DEFAULT
        } else {
            self.low_percent.min(100)
        }
    }
}

/// The interval, clamped into its range (0 = unset, the default).
pub fn clamp_interval(sec: u32) -> u32 {
    if sec == 0 {
        return INTERVAL_DEFAULT;
    }
    sec.clamp(INTERVAL_MIN, INTERVAL_MAX)
}

/// One polled device, carried across the platform seam: the fields of the core's `DeviceStatus`
/// the server uses, with `kind` already a word. The portable tests drive this, so the
/// aggregation runs (and is tested) on every platform.
#[derive(Clone, Debug, PartialEq)]
pub struct Sample {
    pub key: String,
    pub name: String,
    pub via: String,
    pub kind: String,
    pub percent: i32,
    pub detail: String,
    pub level_text: String,
    pub charging: bool,
    pub asleep: bool,
    pub connected: bool,
    pub millivolts: i32,
    pub grace_sec: i32,
}

/// One device's state between polls (the tray code's `TrayEntry`, without its icon fields).
/// Public because `aggregate`'s signature carries it; the fields are the poll's memory.
#[derive(Clone, Debug, Default)]
pub struct Entry {
    sample: Sample,
    /// The last percent that was actually reported (never -1), for the grace display.
    last_pct: i32,
    /// The last poll that saw this device (ms).
    last_seen: i64,
}

impl Default for Sample {
    fn default() -> Self {
        Self {
            key: String::new(),
            name: String::new(),
            via: String::new(),
            kind: "other".into(),
            percent: -1,
            detail: String::new(),
            level_text: String::new(),
            charging: false,
            asleep: false,
            connected: true,
            millivolts: 0,
            grace_sec: 0,
        }
    }
}

/// The state between polls: one entry per device ever seen, plus the poll bookkeeping.
#[derive(Default)]
struct State {
    entries: BTreeMap<String, Entry>,
    last_poll: Option<i64>,
    last_error: Option<String>,
}

/// The readings, by key.
pub type Readings = BTreeMap<String, Value>;

/// The source: `run` is its task, `reconfigure` polls again soon (after the options change).
pub struct Devices {
    /// Whether `DEVICE_BATTERIES` allows the source at all (the hard off switch); `opts.enabled` is the rest.
    env_ok: bool,
    /// Whether this process may read this PC's devices: `bind` may, `bind_with_home` (a test) may not.
    live: bool,
    opts: Box<dyn Fn() -> Opts + Send + Sync>,
    state: Mutex<State>,
    map: watch::Sender<Arc<Readings>>,
    wake: Notify,
}

impl Devices {
    pub fn new(env_ok: bool, live: bool, opts: impl Fn() -> Opts + Send + Sync + 'static) -> Arc<Self> {
        Arc::new(Self {
            env_ok,
            live,
            opts: Box::new(opts),
            state: Mutex::new(State::default()),
            map: watch::channel(Arc::new(Readings::new())).0,
            wake: Notify::new(),
        })
    }

    /// `DEVICE_BATTERIES=off` (or `0`) forces the source off for good: the privacy kill switch, `WEATHER=off` style.
    /// Otherwise the switch is the integrations' `peripherals.enabled`.
    pub fn enabled_from_env() -> bool {
        !matches!(crate::env::non_empty("DEVICE_BATTERIES").as_deref(), Some("off" | "0"))
    }

    /// Whether the source is on now: the env does not force it off and the integrations say on (read live).
    pub fn enabled(&self) -> bool {
        self.env_ok && (self.opts)().enabled
    }

    fn lock(&self) -> std::sync::MutexGuard<'_, State> {
        self.state.lock().unwrap_or_else(PoisonError::into_inner)
    }

    /// Polls again soon (after the options change).
    pub fn reconfigure(&self) {
        self.wake.notify_one();
    }

    /// The readings now.
    pub fn readings(&self) -> Arc<Readings> {
        self.map.borrow().clone()
    }

    /// One round: polls the core on the blocking pool, folds the results into the entries and
    /// publishes. `opts` was read by the caller (the task re-reads it every round).
    async fn poll_once(&self, now: i64, opts: &Opts) {
        let result = tokio::task::spawn_blocking(poll_now).await;
        let results = match result {
            Ok(Ok(results)) => {
                let mut st = self.lock();
                st.last_poll = Some(now);
                st.last_error = None;
                results
            }
            Ok(Err(message)) => {
                log::warn!(target: "server", "Devices: {message}");
                let mut st = self.lock();
                st.last_poll = Some(now);
                st.last_error = Some(message);
                Vec::new()
            }
            Err(join) => {
                let message = format!("the poll task failed: {join}");
                log::warn!(target: "server", "Devices: {message}");
                let mut st = self.lock();
                st.last_poll = Some(now);
                st.last_error = Some(message);
                Vec::new()
            }
        };
        let readings = {
            let mut st = self.lock();
            let (entries, readings) = aggregate(&st.entries, &results, now, opts);
            st.entries = entries;
            readings
        };
        self.publish(readings);
    }

    /// Publishes `readings` when they changed.
    fn publish(&self, readings: Readings) {
        self.map.send_if_modified(|map| {
            if **map == readings {
                return false;
            }
            *map = Arc::new(readings);
            true
        });
    }

    /// The source's state for GET /api/devices/battery: every device seen (hidden ones included,
    /// so the settings can unhide them), plus the bookkeeping.
    pub fn status(&self) -> Value {
        let st = self.lock();
        let opts = (self.opts)();
        let devices: Vec<Value> = st
            .entries
            .values()
            .map(|e| {
                let percent = if e.sample.percent >= 0 { e.sample.percent } else { e.last_pct };
                json!({
                    "id": device_id(&e.sample.key),
                    "key": e.sample.key,
                    "name": e.sample.name,
                    "via": e.sample.via,
                    "kind": e.sample.kind,
                    "percent": if percent >= 0 { json!(percent) } else { Value::Null },
                    "charging": e.sample.charging,
                    "asleep": e.sample.asleep,
                    "connected": e.sample.connected,
                    "detail": e.sample.detail,
                    "hidden": opts.hidden.contains(&e.sample.key),
                    "renamed": opts.names.contains_key(&e.sample.key),
                    "updated": e.last_seen / 1000,
                    "graceSec": e.sample.grace_sec,
                })
            })
            .collect();
        json!({
            "enabled": self.enabled(),
            "platform": platform_support(),
            "intervalSec": opts.interval(),
            "lowPercent": opts.low(),
            "lastPoll": st.last_poll.map(|t| t / 1000),
            "error": st.last_error,
            "devices": devices,
        })
    }

    /// While the source is off it publishes an empty set (so a kiosk that was showing levels sees them go) and looks
    /// at the switch again every `OFF_RECHECK`, instead of polling. Polls at once when it is on, then every `interval`
    /// (re-read each round) and after each `reconfigure` or device-arrival wake. Never returns.
    pub async fn run(&self) {
        loop {
            let opts = (self.opts)();
            if !self.env_ok || !self.live || !opts.enabled {
                self.publish(Readings::new());
                tokio::select! {
                    _ = tokio::time::sleep(OFF_RECHECK) => {}
                    _ = self.wake.notified() => {}
                }
                continue;
            }
            self.poll_once(now_ms(), &opts).await;
            tokio::select! {
                _ = tokio::time::sleep(Duration::from_secs(opts.interval() as u64)) => {}
                _ = self.wake.notified() => {}
            }
        }
    }

    /// Starts the supervised task, and Windows' device watcher (its arrival and resume wakes make the task look
    /// again at once, a re-check while the source is off included).
    pub fn start(self: &Arc<Self>, shutdown: &watch::Receiver<bool>) -> JoinHandle<()> {
        #[cfg(windows)]
        spawn_watcher();
        let me = Arc::clone(self);
        supervisor::spawn("devices", shutdown.clone(), move || {
            let me = Arc::clone(&me);
            async move { me.run().await }
        })
    }
}

/// The word for how much of the source this platform can run.
fn platform_support() -> &'static str {
    #[cfg(windows)]
    {
        "full"
    }
    #[cfg(not(windows))]
    {
        "none"
    }
}

/// The device id the sensor keys use: the prototype's own FNV-1a of the stable key.
pub fn device_id(key: &str) -> String {
    ips_battery_hash(key).to_string()
}

/// The FNV-1a hash of the key's UTF-16 units, mapped to a stable positive id — the same value
/// the prototype's tray code derived for its icon id (`stable_id`, copied into the port).
fn ips_battery_hash(key: &str) -> u32 {
    let mut h: u32 = 2166136261;
    for c in key.encode_utf16() {
        h ^= c as u32;
        h = h.wrapping_mul(16777619);
    }
    (h & 0x7FFFFFFF) | 0x100
}

/// Folds one poll's results into the entries and builds the readings. Pure, so the tests drive
/// it on a fake clock; the semantics are the tray code's `on_results`.
///
/// - A reported device updates its entry (`last_seen` = now; a real percent refreshes
///   `last_pct`). Its readings show the reported percent, or the last one known when the device
///   answered without a level (asleep) — the prototype dims those.
/// - A device that stopped answering keeps its last value, marked asleep, for its `grace_sec`
///   (some receivers drop sleeping devices from the link); after that it is gone.
/// - A hidden device is polled and tracked but contributes no readings.
pub fn aggregate(prev: &BTreeMap<String, Entry>, results: &[Sample], now: i64, opts: &Opts) -> (BTreeMap<String, Entry>, Readings) {
    let mut entries: BTreeMap<String, Entry> = BTreeMap::new();
    let mut readings = Readings::new();
    let low = opts.low() as i32;
    for s in results {
        let mut e = prev.get(&s.key).cloned().unwrap_or_default();
        e.sample = s.clone();
        if s.percent >= 0 {
            e.last_pct = s.percent;
        }
        e.last_seen = now;
        let (device, _) = one_entry(&e, now, low, opts);
        merge(&mut readings, &device);
        entries.insert(s.key.clone(), e);
    }
    for (key, e) in prev {
        if entries.contains_key(key) {
            continue;
        }
        // Some receivers drop sleeping devices from the link; keep the last value for a while.
        let in_grace = e.sample.connected && e.sample.grace_sec > 0 && now.saturating_sub(e.last_seen) < (e.sample.grace_sec as i64) * 1000;
        if in_grace {
            let mut kept = e.clone();
            kept.sample.percent = -1;
            kept.sample.asleep = true;
            let (device, _) = one_entry(&kept, now, low, opts);
            merge(&mut readings, &device);
            entries.insert(key.clone(), kept);
        }
    }
    (entries, readings)
}

/// One entry's readings under `battery.<id>.`, when the device is not hidden.
fn one_entry(e: &Entry, now: i64, low: i32, opts: &Opts) -> (Readings, bool) {
    if opts.hidden.contains(&e.sample.key) {
        return (Readings::new(), false);
    }
    let s = &e.sample;
    // The display percent: what this poll reported, else the last one known.
    let percent = if s.percent >= 0 { s.percent } else { e.last_pct };
    let asleep = s.asleep || s.percent < 0;
    let low_now = !s.charging && percent >= 0 && percent <= low;
    let prefix = format!("{NAMESPACE}{}.", device_id(&s.key));
    let mut out = Readings::new();
    out.insert(format!("{prefix}name"), text(opts.names.get(&s.key).map(String::as_str).unwrap_or(&s.name)));
    out.insert(format!("{prefix}via"), text(&s.via));
    out.insert(format!("{prefix}kind"), text(&s.kind));
    out.insert(format!("{prefix}source"), text(s.key.split(':').next().unwrap_or("")));
    out.insert(format!("{prefix}charging"), text(if s.charging { "yes" } else { "no" }));
    out.insert(format!("{prefix}connected"), text(if s.connected { "yes" } else { "no" }));
    out.insert(format!("{prefix}asleep"), text(if asleep { "yes" } else { "no" }));
    out.insert(format!("{prefix}low"), text(if low_now { "yes" } else { "no" }));
    if percent >= 0 {
        out.insert(format!("{prefix}percent"), json!({ "value": percent, "unit": "%" }));
    }
    if !s.detail.is_empty() {
        out.insert(format!("{prefix}detail"), text(&s.detail));
    }
    if !s.level_text.is_empty() {
        out.insert(format!("{prefix}level"), text(&s.level_text));
    }
    out.insert(format!("{prefix}updated"), json!({ "value": now / 1000, "unit": "" }));
    (out, true)
}

/// Merges one device's readings into the map (the same id from two keys is a collision; the
/// later wins — two devices of one model sharing an id is not known to happen).
fn merge(into: &mut Readings, device: &Readings) {
    for (k, v) in device {
        into.insert(k.clone(), v.clone());
    }
}

fn text(t: &str) -> Value {
    json!({ "text": t, "unit": "" })
}

// ---- Windows: the poll core and the device watcher ---------------------------------------------

/// One poll of the ported core, on a worker thread (it can take seconds).
#[cfg(windows)]
fn poll_now() -> Result<Vec<Sample>, String> {
    let results = ips_battery::devices::poll_all_devices_blocked(&[]);
    Ok(results
        .iter()
        .map(|s| Sample {
            key: s.key.clone(),
            name: s.name.clone(),
            via: s.via.clone(),
            kind: match s.kind {
                ips_battery::devices::DeviceKind::Mouse => "mouse",
                ips_battery::devices::DeviceKind::Keyboard => "keyboard",
                ips_battery::devices::DeviceKind::Headset => "headset",
                ips_battery::devices::DeviceKind::Gamepad => "controller",
                ips_battery::devices::DeviceKind::Phone => "phone",
                ips_battery::devices::DeviceKind::Other => "other",
            }
            .to_string(),
            percent: s.percent,
            detail: s.detail.clone(),
            level_text: s.level_text.clone(),
            charging: s.charging,
            asleep: s.asleep,
            connected: s.connected,
            millivolts: s.millivolts,
            grace_sec: s.grace_sec,
        })
        .collect())
}

#[cfg(not(windows))]
fn poll_now() -> Result<Vec<Sample>, String> {
    Err("device batteries need Windows".to_string())
}

/// When the next device-event wake is due (ms; 0 = none), bumped by the watcher's wnd_proc.
#[cfg(windows)]
static WAKE_AT: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);
#[cfg(windows)]
static WATCHER: std::sync::OnceLock<()> = std::sync::OnceLock::new();

/// Starts the watcher thread once: a hidden top-level window that receives WM_DEVICECHANGE
/// (a device arrived or left: poll again in 2.5 s) and WM_POWERBROADCAST (resume: 5 s). The
/// message loop's timer fires the due wake into the poll task's `Notify`.
#[cfg(windows)]
fn spawn_watcher() {
    WATCHER.get_or_init(|| {
        let _ = std::thread::Builder::new().name("ips-devices-watcher".into()).spawn(|| unsafe { watcher_thread() });
    });
}

/// The hidden window and its message pump. Runs for the life of the process; it holds no HID
/// handles, so it never conflicts with the polls.
#[cfg(windows)]
unsafe fn watcher_thread() {
    use windows_sys::Win32::System::LibraryLoader::GetModuleHandleW;
    use windows_sys::Win32::UI::WindowsAndMessaging::{
        CreateWindowExW, DefWindowProcW, DestroyWindow, DispatchMessageW, GetMessageW, RegisterClassExW, TranslateMessage, CW_USEDEFAULT,
        MSG, PBT_APMRESUMEAUTOMATIC, WM_DEVICECHANGE, WM_POWERBROADCAST, WM_TIMER, WNDCLASSEXW,
    };
    // Debounce windows, in seconds: the prototype's refresh_soon delays.
    const ARRIVAL_DELAY_MS: u64 = 2500;
    const RESUME_DELAY_MS: u64 = 5000;
    const TIMER_MS: u32 = 250;

    unsafe extern "system" fn wnd_proc(hwnd: *mut core::ffi::c_void, msg: u32, wp: usize, lp: isize) -> isize {
        use windows_sys::Win32::UI::WindowsAndMessaging::{PostQuitMessage, WM_DESTROY};
        match msg {
            WM_DEVICECHANGE => {
                // Any device tree change: an arrival or a removal. Debounced below.
                bump_wake(ARRIVAL_DELAY_MS);
                1
            }
            WM_POWERBROADCAST if wp == PBT_APMRESUMEAUTOMATIC as usize => {
                bump_wake(RESUME_DELAY_MS);
                1
            }
            WM_TIMER => {
                let now = now_ms() as u64;
                let at = WAKE_AT.load(std::sync::atomic::Ordering::Relaxed);
                if at != 0 && now >= at {
                    WAKE_AT.store(0, std::sync::atomic::Ordering::Relaxed);
                    if let Some(n) = NOTIFY.get() {
                        n.wake.notify_one();
                    }
                }
                0
            }
            WM_DESTROY => {
                PostQuitMessage(0);
                0
            }
            _ => DefWindowProcW(hwnd, msg, wp, lp),
        }
    }

    let class = ips_battery::win::to_wide("ips-server-device-watcher");
    let title = ips_battery::win::to_wide("InfoPanel device watcher");
    let mut wc: WNDCLASSEXW = std::mem::zeroed();
    wc.cbSize = std::mem::size_of::<WNDCLASSEXW>() as u32;
    wc.lpfnWndProc = Some(wnd_proc);
    wc.hInstance = GetModuleHandleW(std::ptr::null());
    wc.lpszClassName = class.as_ptr();
    if RegisterClassExW(&wc) == 0 {
        log::warn!(target: "server", "Devices: the device watcher window class failed to register");
        return;
    }
    // A hidden top-level window (never shown): broadcast WM_DEVICECHANGE reaches top-level
    // windows, not message-only ones.
    let hwnd = CreateWindowExW(
        0,
        class.as_ptr(),
        title.as_ptr(),
        0,
        CW_USEDEFAULT,
        CW_USEDEFAULT,
        CW_USEDEFAULT,
        CW_USEDEFAULT,
        std::ptr::null_mut(),
        std::ptr::null_mut(),
        wc.hInstance,
        std::ptr::null(),
    );
    if hwnd.is_null() {
        log::warn!(target: "server", "Devices: the device watcher window failed to create");
        return;
    }
    windows_sys::Win32::UI::WindowsAndMessaging::SetTimer(hwnd, 1, TIMER_MS, None);
    let mut msg: MSG = std::mem::zeroed();
    loop {
        if GetMessageW(&mut msg, std::ptr::null_mut(), 0, 0) <= 0 {
            let _ = DestroyWindow(hwnd);
            break;
        }
        TranslateMessage(&msg);
        DispatchMessageW(&msg);
    }
}

/// The watcher's Notify, set before the thread starts (spawn_watcher initialises it).
#[cfg(windows)]
struct WatcherNotify {
    wake: Notify,
}
#[cfg(windows)]
static NOTIFY: std::sync::OnceLock<WatcherNotify> = std::sync::OnceLock::new();

/// Schedules the earliest wake `delay_ms` from now (an arrival's 2.5 s wins over a resume's 5 s).
#[cfg(windows)]
fn bump_wake(delay_ms: u64) {
    NOTIFY.get_or_init(|| WatcherNotify { wake: Notify::new() });
    let at = (now_ms() as u64).saturating_add(delay_ms);
    WAKE_AT.fetch_min(at, std::sync::atomic::Ordering::Relaxed);
}

// ---- The stream and the state route ------------------------------------------------------------

/// The readings under `prefix`.
fn under(map: &Readings, prefix: &str) -> Readings {
    map.range(prefix.to_string()..).take_while(|(k, _)| k.starts_with(prefix)).map(|(k, v)| (k.clone(), v.clone())).collect()
}

/// One stream message: `{ timestamp, sensors, removed? }`, the Data API's shape.
fn message(sensors: &Readings, removed: &[String]) -> Bytes {
    let mut m = Map::new();
    m.insert("timestamp".into(), json!(now_ms()));
    m.insert("sensors".into(), Value::Object(sensors.iter().map(|(k, v)| (k.clone(), v.clone())).collect()));
    if !removed.is_empty() {
        m.insert("removed".into(), json!(removed));
    }
    sse::event(&jsonc::stringify(&Value::Object(m)))
}

/// What changed from `last` to `now`: the new or changed readings and the keys gone.
pub fn diff(last: &Readings, now: &Readings) -> (Readings, Vec<String>) {
    let changed = now.iter().filter(|(k, v)| last.get(*k) != Some(*v)).map(|(k, v)| (k.clone(), v.clone())).collect();
    let removed = last.keys().filter(|k| !now.contains_key(*k)).cloned().collect();
    (changed, removed)
}

fn off(mut reply: Response<Body>) -> Response<Body> {
    reply.headers_mut().insert("X-Devices", HeaderValue::from_static("off"));
    reply
}

struct Feed {
    rx: watch::Receiver<Arc<Readings>>,
    prefix: String,
    last: Option<Readings>,
    keep_alive: tokio::time::Interval,
    shutdown: watch::Receiver<bool>,
    _client: Box<dyn std::any::Any + Send>,
}

/// GET /events/devices?prefix=...: the readings under the prefix (all of `battery.` when none),
/// then what changes.
pub fn handle_events(app: &App, req: &Req) -> Response<Body> {
    let prefix = req.query("prefix").filter(|p| p.starts_with(NAMESPACE)).unwrap_or_else(|| NAMESPACE.into());
    let keep = Duration::from_secs(15);
    let feed = Feed {
        rx: app.devices.map.subscribe(),
        prefix,
        last: None,
        keep_alive: interval_at(tokio::time::Instant::now() + keep, keep),
        shutdown: app.shutdown.clone(),
        _client: Box::new(app.debug.sse_open("devices")),
    };
    let body = futures_util::stream::unfold(feed, |mut f| async move {
        loop {
            if f.last.is_none() {
                let now = under(&f.rx.borrow_and_update(), &f.prefix);
                let bytes = message(&now, &[]);
                f.last = Some(now);
                return Some((Ok::<_, Infallible>(bytes), f));
            }
            enum Next {
                Stop,
                Changed,
                KeepAlive,
            }
            let next = tokio::select! {
                _ = f.shutdown.wait_for(|stop| *stop) => Next::Stop,
                changed = f.rx.changed() => if changed.is_ok() { Next::Changed } else { Next::Stop },
                _ = f.keep_alive.tick() => Next::KeepAlive,
            };
            match next {
                Next::Stop => return None,
                Next::KeepAlive => return Some((Ok(Bytes::from_static(b": keep-alive\n\n")), f)),
                Next::Changed => {
                    let now = under(&f.rx.borrow_and_update(), &f.prefix);
                    let (changed, removed) = diff(f.last.as_ref().unwrap_or(&Readings::new()), &now);
                    f.last = Some(now);
                    if !changed.is_empty() || !removed.is_empty() {
                        return Some((Ok(message(&changed, &removed)), f));
                    }
                }
            }
        }
    });
    let reply = Response::builder()
        .status(200)
        .header("Content-Type", "text/event-stream")
        .header("Cache-Control", "no-store")
        .header("Connection", "keep-alive")
        .body(Body::from_stream(body))
        .unwrap_or_default();
    if app.devices.enabled() {
        reply
    } else {
        off(reply)
    }
}

/// /api/devices/battery.
pub async fn handle(app: &App, req: Req) -> std::io::Result<Response<Body>> {
    let devices = &app.devices;
    let reply = match req.path.as_str() {
        "/api/devices/battery" if req.method == Method::GET => http::json(200, &devices.status()),
        "/api/devices/battery" => http::empty(405),
        _ => http::empty(404),
    };
    Ok(if devices.enabled() { reply } else { off(reply) })
}

#[cfg(test)]
#[path = "devices_tests.rs"]
mod tests;
