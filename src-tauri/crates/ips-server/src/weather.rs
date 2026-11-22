// Weather by place (Phase 5c): the weather for the places recipe widgets show, from Open-Meteo (keyless, CC BY 4.0; Gate 0
// answer 1), fetched here so a kiosk never calls the provider and a place goes to that provider only. Studio's first weather of
// its own: the plugins' weather (`plugins.yr-weather-plugin.`) is a separate thing and is left alone.
//
// Which places: those the stored placements reference, nothing else. A recipe placement (`module: "recipe:<id>"`) names its
// places in its `place-list` options (the placement's value, stored as JSON text, else the recipe's default), so the config and
// the recipes on this server are read on every tick and after every config save. A place is `{ name, lat, lon }`; its cache key and
// id come from its coordinates rounded to 0.01 degree (about 1 km), so two names for one spot share one fetch:
// `n5991e1075` is 59.91 N 10.75 E.
//
// How often: each place is fetched when it is first wanted, then every `POLL` (15 min; `POLL_FLOOR`, 10 min, is the fastest
// any place is ever asked for again). A failed fetch backs off from `POLL_FLOOR`, doubling up to `BACKOFF_MAX`, and keeps the
// last good answer. Every call to the provider, forecast or place search, takes a slot of one global cap (`CALLS_PER_HOUR`,
// about 7 200 a day at most, under the free tier's 10 000) and at most `PLACES_MAX` places are polled. A place no placement
// references any more stops being fetched; its answer stays cached for `CACHE_KEEP` in case it comes back.
//
// What the kiosks get: Data API-shaped readings under `weather.place.<id>.` (`temp`, `feels`, `humidity`, `wind`, `precip`,
// `code`, `condition`, `is_day`, `high`, `low`, `hourly.<n>.{temp,code,precip,time}` for 24 hours, `daily.<n>.{high,low,code,
// condition}` for 7 days, and `updated`, `age` (minutes), `status` (`ok`, `stale`, `error`, `waiting`) and `error`), on
// `/events/weather?prefix=...`, the Data API's own stream format (a full set on connect, then the changed and removed keys), so
// the page's sensor store reads them like any other namespace. Errors and stale data are readings too; the source never stops.
//
// GET /api/weather                  the source's state: the places, their age and error, the provider calls made
// GET /api/weather/places?q=&lang=  place search (Open-Meteo geocoding), for the studio's place lists; this computer only unless
//                                   ALLOW_REMOTE_EDIT=1; `SEARCHES_PER_MINUTE`, cached a day per query
// GET /events/weather?prefix=       the readings
//
// The switch: `WEATHER=off` (or `0`) fetches nothing; the stream sends an empty set, search is 403, and every answer says
// `X-Weather: off`. A debug build reads `WEATHER_BASE_URL` (a local fake provider for the tests and the screenshots); a release
// build never does, and reaches only the two Open-Meteo hosts (`guarded_net::check_listed`).

use std::collections::{BTreeMap, HashMap, VecDeque};
use std::convert::Infallible;
use std::sync::{Arc, Mutex, PoisonError};
use std::time::Duration;

use axum::body::{Body, Bytes};
use axum::http::{HeaderValue, Method, Response};
use serde_json::{json, Map, Value};
use tokio::sync::{watch, Notify};
use tokio::task::JoinHandle;
use tokio::time::{interval_at, Instant};

use crate::config::now_ms;
use crate::guarded_net::GuardedClient;
use crate::http::{self, Req};
use crate::json as jsonc;
use crate::{sse, supervisor, App};

/// How often a place is fetched, and the fastest it is ever fetched again.
pub const POLL: Duration = Duration::from_secs(15 * 60);
pub const POLL_FLOOR: Duration = Duration::from_secs(10 * 60);
/// The longest wait after failures.
pub const BACKOFF_MAX: Duration = Duration::from_secs(2 * 60 * 60);
/// How often the places are read again and the ages brought up to date.
const TICK: Duration = Duration::from_secs(60);
/// An unreferenced place's answer is kept this long.
const CACHE_KEEP: Duration = Duration::from_secs(60 * 60);
/// Data older than this reads `stale`.
const STALE_AFTER: Duration = Duration::from_secs(2 * 15 * 60);
const FETCH_TIMEOUT: Duration = Duration::from_secs(15);
const FORECAST_MAX_BYTES: usize = 256 * 1024;
const SEARCH_MAX_BYTES: usize = 64 * 1024;
/// Hours and days of forecast per place.
pub const HOURS: usize = 24;
pub const DAYS: usize = 7;
/// Place search: results per query, cached queries, how long. 20, not fewer: a common name's small town ranks late (Brevik in
/// Telemark is the 14th Brevik, after twelve Swedish ones), and the provider has no country filter in the query text.
const SEARCH_RESULTS: usize = 20;
const SEARCH_CACHE_MAX: usize = 200;
const SEARCH_CACHE_KEEP: Duration = Duration::from_secs(24 * 60 * 60);
/// The readings' namespace and each place's prefix in it.
pub const NAMESPACE: &str = "weather.";
pub const PREFIX: &str = "weather.place.";
/// What the widget shows under the data (the provider's terms, CC BY 4.0).
pub const ATTRIBUTION: &str = "Weather data by Open-Meteo.com";

/// The caps: provider calls per hour (all kinds), searches per minute, places polled.
#[derive(Clone, Copy, Debug)]
pub struct Limits {
    pub calls_per_hour: usize,
    pub searches_per_minute: usize,
    pub places_max: usize,
}

impl Default for Limits {
    fn default() -> Self {
        Self { calls_per_hour: 300, searches_per_minute: 20, places_max: 48 }
    }
}

/// A place as the source keys it: its coordinates rounded to 0.01 degree and the id they make.
#[derive(Clone, Debug, PartialEq)]
pub struct Place {
    pub id: String,
    pub lat: f64,
    pub lon: f64,
}

/// Hundredths of a degree.
fn hundredths(x: f64) -> i64 {
    (x * 100.0).round() as i64
}

/// The id of a rounded coordinate pair: `n`/`s` and the latitude in hundredths, `e`/`w` and the longitude (`n5991e1075`).
pub fn place_id(lat: f64, lon: f64) -> String {
    let (la, lo) = (hundredths(lat), hundredths(lon));
    format!("{}{}{}{}", if la < 0 { 's' } else { 'n' }, la.abs(), if lo < 0 { 'w' } else { 'e' }, lo.abs())
}

/// A place from coordinates, rounded, or `None` outside the globe.
pub fn place_of(lat: f64, lon: f64) -> Option<Place> {
    if !lat.is_finite() || !lon.is_finite() || lat.abs() > 90.0 || lon.abs() > 180.0 {
        return None;
    }
    let (la, lo) = (hundredths(lat), hundredths(lon));
    Some(Place { id: place_id(lat, lon), lat: la as f64 / 100.0, lon: lo as f64 / 100.0 })
}

/// The places of a stored place list, JSON text (a placement's setting) or an array (a recipe's default); `None` when it is not a
/// list at all (the renderer then takes the recipe's default too).
fn places_in(value: &Value) -> Option<Vec<Place>> {
    let parsed = match value {
        Value::String(text) => jsonc::parse(text)?,
        other => other.clone(),
    };
    Some(parsed.as_array()?.iter().filter_map(|p| place_of(p.get("lat")?.as_f64()?, p.get("lon")?.as_f64()?)).collect())
}

/// The places the config's recipe placements reference, in order, once each, at most `max`: each place-list option's stored value,
/// else the recipe's default. `recipe_of` reads a recipe by id (none: the placement references nothing).
pub fn referenced_places(config: &Value, recipe_of: &dyn Fn(&str) -> Option<Value>, max: usize) -> Vec<Place> {
    let mut recipes: HashMap<String, Option<Value>> = HashMap::new();
    let mut found: Vec<Place> = Vec::new();
    let mut stack = vec![config];
    while let Some(v) = stack.pop() {
        match v {
            Value::Array(items) => stack.extend(items.iter().rev()),
            Value::Object(o) => {
                if let Some(id) = o.get("module").and_then(Value::as_str).filter(|id| id.starts_with("recipe:")) {
                    let recipe = recipes.entry(id.to_string()).or_insert_with(|| recipe_of(id));
                    let options = recipe.as_ref().and_then(|r| r.get("options")).and_then(Value::as_array);
                    for option in options.into_iter().flatten().filter(|o| o.get("type").and_then(Value::as_str) == Some("place-list")) {
                        let key = option.get("key").and_then(Value::as_str).unwrap_or("");
                        let stored = o.get("settings").and_then(|s| s.get(key)).and_then(places_in);
                        for place in stored.or_else(|| option.get("default").and_then(places_in)).unwrap_or_default() {
                            if found.len() < max && !found.iter().any(|f| f.id == place.id) {
                                found.push(place);
                            }
                        }
                    }
                }
                stack.extend(o.values().rev());
            }
            _ => {}
        }
    }
    found
}

/// At most `max` events in any `window`.
#[derive(Debug)]
pub struct RateCap {
    window_ms: i64,
    max: usize,
    stamps: VecDeque<i64>,
}

impl RateCap {
    pub fn new(window: Duration, max: usize) -> Self {
        Self { window_ms: window.as_millis() as i64, max, stamps: VecDeque::new() }
    }

    /// Takes a slot at `now`, or says there is none left in the window.
    pub fn take(&mut self, now: i64) -> bool {
        self.trim(now);
        if self.stamps.len() >= self.max {
            return false;
        }
        self.stamps.push_back(now);
        true
    }

    /// The slots taken in the window ending at `now`.
    pub fn used(&mut self, now: i64) -> usize {
        self.trim(now);
        self.stamps.len()
    }

    fn trim(&mut self, now: i64) {
        while self.stamps.front().is_some_and(|t| *t <= now - self.window_ms) {
            self.stamps.pop_front();
        }
    }
}

/// The wait after `failures` failed fetches in a row: `POLL_FLOOR`, doubling, at most `BACKOFF_MAX`.
pub fn backoff(failures: u32) -> Duration {
    POLL_FLOOR.saturating_mul(1 << failures.saturating_sub(1).min(16)).min(BACKOFF_MAX)
}

/// The words for a WMO weather code (Open-Meteo's `weather_code`), in the words the widgets' icons read.
pub fn condition_of(code: i64) -> &'static str {
    match code {
        0 => "Clear",
        1 => "Mainly clear",
        2 => "Partly cloudy",
        3 => "Overcast",
        45 | 48 => "Fog",
        51 | 53 | 55 => "Drizzle",
        56 | 57 => "Freezing drizzle",
        61 => "Light rain",
        63 => "Rain",
        65 => "Heavy rain",
        66 | 67 => "Freezing rain",
        71 => "Light snow",
        73 => "Snow",
        75 => "Heavy snow",
        77 => "Snow grains",
        80 | 81 => "Rain showers",
        82 => "Heavy rain showers",
        85 | 86 => "Snow showers",
        95 => "Thunderstorm",
        96 | 99 => "Thunderstorm with hail",
        _ => "Unknown",
    }
}

fn reading(value: f64, unit: &str) -> Value {
    json!({ "value": (value * 10.0).round() / 10.0, "unit": unit })
}

fn text(t: &str) -> Value {
    json!({ "text": t, "unit": "" })
}

/// A forecast answer as readings by key under the place's prefix (`temp`, `hourly.0.temp`, ...), or why it is not one.
pub fn parse_forecast(v: &Value) -> Result<BTreeMap<String, Value>, String> {
    let current = v.get("current").filter(|c| c.is_object()).ok_or("the answer has no current conditions")?;
    let num = |o: &Value, k: &str| o.get(k).and_then(Value::as_f64);
    let temp = num(current, "temperature_2m").ok_or("the answer has no temperature")?;
    let mut out = BTreeMap::new();
    out.insert("temp".to_string(), reading(temp, "°C"));
    for (key, field, unit) in [
        ("feels", "apparent_temperature", "°C"),
        ("humidity", "relative_humidity_2m", "%"),
        ("wind", "wind_speed_10m", "km/h"),
        ("precip", "precipitation", "mm"),
        ("is_day", "is_day", ""),
    ] {
        if let Some(x) = num(current, field) {
            out.insert(key.to_string(), reading(x, unit));
        }
    }
    if let Some(code) = num(current, "weather_code") {
        out.insert("code".to_string(), reading(code, ""));
        out.insert("condition".to_string(), text(condition_of(code as i64)));
    }
    let series = |block: &str, field: &str| -> Vec<Option<f64>> {
        v.get(block).and_then(|b| b.get(field)).and_then(Value::as_array).map_or_else(Vec::new, |a| a.iter().map(Value::as_f64).collect())
    };
    let offset = num(v, "utc_offset_seconds").unwrap_or(0.0) as i64;
    let (times, temps, codes, chances) = (
        series("hourly", "time"),
        series("hourly", "temperature_2m"),
        series("hourly", "weather_code"),
        series("hourly", "precipitation_probability"),
    );
    for n in 0..temps.len().min(HOURS) {
        let at = |list: &[Option<f64>]| list.get(n).copied().flatten();
        if let Some(t) = at(&temps) {
            out.insert(format!("hourly.{n}.temp"), reading(t, "°C"));
        }
        if let Some(c) = at(&codes) {
            out.insert(format!("hourly.{n}.code"), reading(c, ""));
        }
        if let Some(p) = at(&chances) {
            out.insert(format!("hourly.{n}.precip"), reading(p, "%"));
        }
        if let Some(t) = at(&times) {
            out.insert(format!("hourly.{n}.time"), text(&format!("{:02}:00", ((t as i64 + offset).rem_euclid(86_400)) / 3600)));
        }
    }
    let (highs, lows, day_codes) =
        (series("daily", "temperature_2m_max"), series("daily", "temperature_2m_min"), series("daily", "weather_code"));
    for n in 0..highs.len().min(DAYS) {
        let at = |list: &[Option<f64>]| list.get(n).copied().flatten();
        for (key, value, unit) in [("high", at(&highs), "°C"), ("low", at(&lows), "°C"), ("code", at(&day_codes), "")] {
            if let Some(x) = value {
                out.insert(format!("daily.{n}.{key}"), reading(x, unit));
                if n == 0 && key != "code" {
                    out.insert(key.to_string(), reading(x, unit));
                }
            }
        }
        if let Some(c) = at(&day_codes) {
            out.insert(format!("daily.{n}.condition"), text(condition_of(c as i64)));
        }
    }
    Ok(out)
}

/// Where the source fetches: the two Open-Meteo endpoints and the client that may reach only their hosts.
#[derive(Clone)]
pub struct Endpoints {
    pub forecast: url::Url,
    pub search: url::Url,
    pub hosts: Vec<String>,
    pub client: GuardedClient,
}

impl Endpoints {
    /// Open-Meteo, over https, through a client that refuses this machine and the LAN.
    pub fn open_meteo() -> Result<Self, String> {
        Ok(Self {
            forecast: url::Url::parse("https://api.open-meteo.com/v1/forecast").map_err(|e| e.to_string())?,
            search: url::Url::parse("https://geocoding-api.open-meteo.com/v1/search").map_err(|e| e.to_string())?,
            hosts: vec!["api.open-meteo.com".into(), "geocoding-api.open-meteo.com".into()],
            client: GuardedClient::new(true)?,
        })
    }

    /// Endpoints nothing answers on (a loopback address the guard refuses): for a server that must never reach the provider.
    pub fn offline() -> Result<Self, String> {
        Ok(Self {
            forecast: url::Url::parse("http://127.0.0.1:9/v1/forecast").map_err(|e| e.to_string())?,
            search: url::Url::parse("http://127.0.0.1:9/v1/search").map_err(|e| e.to_string())?,
            hosts: vec!["127.0.0.1".into()],
            client: GuardedClient::new(true)?,
        })
    }

    /// A local fake provider at `base` (`http://127.0.0.1:<port>`): its host only, any address. Test and debug builds only.
    #[cfg(any(test, debug_assertions))]
    pub fn at(base: &str) -> Result<Self, String> {
        let base = url::Url::parse(base).map_err(|e| e.to_string())?;
        let host = base.host_str().ok_or("WEATHER_BASE_URL has no host")?.to_string();
        Ok(Self {
            forecast: base.join("/v1/forecast").map_err(|e| e.to_string())?,
            search: base.join("/v1/search").map_err(|e| e.to_string())?,
            hosts: vec![host],
            client: GuardedClient::with(crate::guarded_net::os_lookup(), Arc::new(|_| false))?,
        })
    }

    /// The live endpoints (`live`) or the offline ones; a debug build takes `WEATHER_BASE_URL` over both.
    pub fn from_env(live: bool) -> Result<Self, String> {
        #[cfg(debug_assertions)]
        if let Some(base) = crate::env::non_empty("WEATHER_BASE_URL") {
            return Self::at(&base);
        }
        if live {
            Self::open_meteo()
        } else {
            Self::offline()
        }
    }
}

/// One place's cache entry.
struct Entry {
    place: Place,
    /// The last good answer as readings, and when it came (ms).
    readings: Option<BTreeMap<String, Value>>,
    fetched: Option<i64>,
    error: Option<String>,
    failures: u32,
    /// Not fetched before this (ms).
    next_at: i64,
    /// Last referenced (ms).
    wanted_at: i64,
}

struct State {
    cache: HashMap<String, Entry>,
    wanted: Vec<Place>,
    calls: RateCap,
    searches: RateCap,
    found: HashMap<String, (i64, Value)>,
    /// Calls made: in all, and today (UTC day number, count).
    total: u64,
    today: (i64, u64),
}

/// The readings, by key.
pub type Readings = BTreeMap<String, Value>;

/// The source: `run` is its task, `reconfigure` reads the places again now (after a config save).
pub struct Weather {
    enabled: bool,
    endpoints: Endpoints,
    limits: Limits,
    places: Box<dyn Fn() -> Vec<Place> + Send + Sync>,
    state: Mutex<State>,
    map: watch::Sender<Arc<Readings>>,
    wake: Notify,
}

impl Weather {
    pub fn new(enabled: bool, endpoints: Endpoints, limits: Limits, places: impl Fn() -> Vec<Place> + Send + Sync + 'static) -> Arc<Self> {
        let state = State {
            cache: HashMap::new(),
            wanted: Vec::new(),
            calls: RateCap::new(Duration::from_secs(3600), limits.calls_per_hour),
            searches: RateCap::new(Duration::from_secs(60), limits.searches_per_minute),
            found: HashMap::new(),
            total: 0,
            today: (0, 0),
        };
        Arc::new(Self {
            enabled,
            endpoints,
            limits,
            places: Box::new(places),
            state: Mutex::new(state),
            map: watch::channel(Arc::new(Readings::new())).0,
            wake: Notify::new(),
        })
    }

    /// `WEATHER=off` (or `0`) is the switch.
    pub fn enabled_from_env() -> bool {
        !matches!(std::env::var("WEATHER").ok().as_deref(), Some("off" | "0"))
    }

    pub fn enabled(&self) -> bool {
        self.enabled
    }

    pub fn limits(&self) -> Limits {
        self.limits
    }

    fn lock(&self) -> std::sync::MutexGuard<'_, State> {
        self.state.lock().unwrap_or_else(PoisonError::into_inner)
    }

    /// Reads the places again now.
    pub fn reconfigure(&self) {
        self.wake.notify_one();
    }

    /// The readings now.
    pub fn readings(&self) -> Arc<Readings> {
        self.map.borrow().clone()
    }

    /// Takes a provider call from the global cap, counting it.
    fn take_call(&self, now: i64) -> bool {
        let mut st = self.lock();
        if !st.calls.take(now) {
            return false;
        }
        st.total += 1;
        let day = now.div_euclid(86_400_000);
        st.today = if st.today.0 == day { (day, st.today.1 + 1) } else { (day, 1) };
        true
    }

    /// One round: reads the referenced places, fetches the ones due (while the cap allows), and publishes. `now` is ms.
    pub async fn poll_once(&self, now: i64) {
        let wanted = if self.enabled { (self.places)().into_iter().take(self.limits.places_max).collect() } else { Vec::new() };
        let due: Vec<Place> = {
            let mut st = self.lock();
            for place in &wanted {
                let entry = st.cache.entry(place.id.clone()).or_insert_with(|| Entry {
                    place: place.clone(),
                    readings: None,
                    fetched: None,
                    error: None,
                    failures: 0,
                    next_at: 0,
                    wanted_at: now,
                });
                entry.wanted_at = now;
            }
            let keep = CACHE_KEEP.as_millis() as i64;
            st.cache.retain(|id, e| wanted.iter().any(|p| &p.id == id) || now - e.wanted_at < keep);
            st.wanted = wanted;
            // the longest-waiting first, so a place the cap held back is not passed over again
            let mut due: Vec<(i64, Place)> =
                st.wanted.iter().filter_map(|p| st.cache.get(&p.id).filter(|e| e.next_at <= now).map(|e| (e.next_at, p.clone()))).collect();
            due.sort_by_key(|(at, _)| *at);
            due.into_iter().map(|(_, p)| p).collect()
        };
        for place in due {
            if !self.take_call(now) {
                break;
            }
            let result = self.fetch(&place).await;
            let mut st = self.lock();
            if let Some(entry) = st.cache.get_mut(&place.id) {
                match result {
                    Ok(readings) => {
                        entry.readings = Some(readings);
                        entry.fetched = Some(now);
                        entry.error = None;
                        entry.failures = 0;
                        entry.next_at = now + POLL.as_millis() as i64;
                    }
                    Err(message) => {
                        log::warn!(target: "server", "Weather {}: {message}", place.id);
                        entry.error = Some(message);
                        entry.failures += 1;
                        entry.next_at = now + backoff(entry.failures).as_millis() as i64;
                    }
                }
            }
        }
        self.publish(now);
    }

    /// Every wanted place's readings, with their age and status, sent to the streams when they changed.
    fn publish(&self, now: i64) {
        let mut all = Readings::new();
        {
            let st = self.lock();
            for place in &st.wanted {
                let Some(e) = st.cache.get(&place.id) else { continue };
                let prefix = format!("{PREFIX}{}.", place.id);
                for (key, value) in e.readings.iter().flatten() {
                    all.insert(format!("{prefix}{key}"), value.clone());
                }
                let status = match (e.fetched, &e.error) {
                    (None, None) => "waiting",
                    (None, Some(_)) => "error",
                    (Some(at), error) if error.is_some() || now - at > STALE_AFTER.as_millis() as i64 => "stale",
                    _ => "ok",
                };
                all.insert(format!("{prefix}status"), text(status));
                if let Some(at) = e.fetched {
                    all.insert(format!("{prefix}updated"), json!({ "value": at / 1000, "unit": "" }));
                    all.insert(format!("{prefix}age"), json!({ "value": (now - at).max(0) / 60_000, "unit": "min" }));
                }
                if let Some(error) = &e.error {
                    all.insert(format!("{prefix}error"), text(error));
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

    /// One place's forecast from the provider, as readings.
    async fn fetch(&self, place: &Place) -> Result<Readings, String> {
        let mut url = self.endpoints.forecast.clone();
        url.query_pairs_mut()
            .append_pair("latitude", &format!("{:.2}", place.lat))
            .append_pair("longitude", &format!("{:.2}", place.lon))
            .append_pair(
                "current",
                "temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,wind_speed_10m,is_day,precipitation",
            )
            .append_pair("hourly", "temperature_2m,weather_code,precipitation_probability")
            .append_pair("daily", "temperature_2m_max,temperature_2m_min,weather_code")
            .append_pair("timezone", "auto")
            .append_pair("forecast_hours", &HOURS.to_string())
            .append_pair("forecast_days", &DAYS.to_string())
            .append_pair("timeformat", "unixtime");
        let body = self.get(&url, FORECAST_MAX_BYTES).await?;
        parse_forecast(&body)
    }

    /// A GET to the provider (its hosts only), its JSON.
    async fn get(&self, url: &url::Url, max_bytes: usize) -> Result<Value, String> {
        let ua = format!("InfoPanel-Studio/{}", crate::env::version());
        let call = async {
            self.endpoints.client.check_listed(url, &self.endpoints.hosts).await?;
            let fetched = self.endpoints.client.get(url, &[("Accept", "application/json"), ("User-Agent", &ua)], max_bytes).await?;
            if !(200..300).contains(&fetched.status) {
                return Err(format!("HTTP {}", fetched.status));
            }
            serde_json::from_slice::<Value>(&fetched.body).map_err(|_| "the answer is not JSON".to_string())
        };
        tokio::time::timeout(FETCH_TIMEOUT, call).await.unwrap_or_else(|_| Err("timed out".into()))
    }

    /// Place search: up to `SEARCH_RESULTS` places for `query` (`{ name, admin1, country, lat, lon }`, coordinates to 4 decimals),
    /// from the cache when asked within a day. `Err((status, why))`: 429 when a cap is reached, 502 when the provider failed.
    pub async fn search(&self, query: &str, lang: &str, now: i64) -> Result<Value, (u16, String)> {
        let key = format!("{lang}|{}", query.to_lowercase());
        {
            let mut st = self.lock();
            let keep = SEARCH_CACHE_KEEP.as_millis() as i64;
            st.found.retain(|_, (at, _)| now - *at < keep);
            if let Some((_, hit)) = st.found.get(&key) {
                return Ok(hit.clone());
            }
            if !st.searches.take(now) {
                return Err((429, "too many place searches; try again in a minute".into()));
            }
        }
        if !self.take_call(now) {
            return Err((429, "the weather source has used its calls for this hour; try again later".into()));
        }
        let mut url = self.endpoints.search.clone();
        url.query_pairs_mut()
            .append_pair("name", query)
            .append_pair("count", &SEARCH_RESULTS.to_string())
            .append_pair("language", lang)
            .append_pair("format", "json");
        let body = self.get(&url, SEARCH_MAX_BYTES).await.map_err(|e| (502, format!("place search failed: {e}")))?;
        let four = |x: f64| (x * 10_000.0).round() / 10_000.0;
        let results: Vec<Value> = body
            .get("results")
            .and_then(Value::as_array)
            .into_iter()
            .flatten()
            .filter_map(|r| {
                let (lat, lon) = (r.get("latitude")?.as_f64()?, r.get("longitude")?.as_f64()?);
                place_of(lat, lon)?;
                let words = |k: &str| r.get(k).and_then(Value::as_str).unwrap_or("").chars().take(60).collect::<String>();
                Some(json!({ "name": words("name"), "admin1": words("admin1"), "country": words("country"), "lat": four(lat), "lon": four(lon) }))
            })
            .filter(|r| r["name"] != "")
            .take(SEARCH_RESULTS)
            .collect();
        let found = Value::Array(results);
        let mut st = self.lock();
        if st.found.len() >= SEARCH_CACHE_MAX {
            if let Some(oldest) = st.found.iter().min_by_key(|(_, (at, _))| *at).map(|(k, _)| k.clone()) {
                st.found.remove(&oldest);
            }
        }
        st.found.insert(key, (now, found.clone()));
        Ok(found)
    }

    /// The source's state for GET /api/weather.
    pub fn status(&self, now: i64) -> Value {
        let mut st = self.lock();
        let hour = st.calls.used(now);
        let today = if st.today.0 == now.div_euclid(86_400_000) { st.today.1 } else { 0 };
        let places: Vec<Value> = st
            .wanted
            .iter()
            .filter_map(|p| st.cache.get(&p.id))
            .map(|e| json!({ "id": e.place.id, "lat": e.place.lat, "lon": e.place.lon, "updated": e.fetched.map(|t| t / 1000), "error": e.error, "failures": e.failures }))
            .collect();
        json!({
            "enabled": self.enabled,
            "provider": "Open-Meteo",
            "attribution": ATTRIBUTION,
            "places": places,
            "calls": { "lastHour": hour, "today": today, "total": st.total, "perHour": self.limits.calls_per_hour },
        })
    }

    /// Polls at once, then every `TICK` and after each `reconfigure`. Never returns.
    pub async fn run(&self) {
        loop {
            self.poll_once(now_ms()).await;
            tokio::select! {
                _ = tokio::time::sleep(TICK) => {}
                _ = self.wake.notified() => {}
            }
        }
    }

    /// Starts the supervised task (none when the source is off).
    pub fn start(self: &Arc<Self>, shutdown: &watch::Receiver<bool>) -> Option<JoinHandle<()>> {
        let me = Arc::clone(self);
        self.enabled.then(|| {
            supervisor::spawn("weather", shutdown.clone(), move || {
                let me = Arc::clone(&me);
                async move { me.run().await }
            })
        })
    }
}

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
    reply.headers_mut().insert("X-Weather", HeaderValue::from_static("off"));
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

/// GET /events/weather?prefix=...: the readings under the prefix (all of `weather.` when none), then what changes.
pub fn handle_events(app: &App, req: &Req) -> Response<Body> {
    let prefix = req.query("prefix").filter(|p| p.starts_with(NAMESPACE)).unwrap_or_else(|| NAMESPACE.into());
    let keep = Duration::from_secs(15);
    let feed = Feed {
        rx: app.weather.map.subscribe(),
        prefix,
        last: None,
        keep_alive: interval_at(Instant::now() + keep, keep),
        shutdown: app.shutdown.clone(),
        _client: Box::new(app.debug.sse_open("weather")),
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
                Next::KeepAlive => {
                    return Some((
                        Ok(Bytes::from_static(
                            b": keep-alive

",
                        )),
                        f,
                    ))
                }
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
    if app.weather.enabled {
        reply
    } else {
        off(reply)
    }
}

/// Why a place search is refused before it reaches the provider, or `None`: GET, the source on, this computer (or remote editing
/// on), a query of 2 to 60 characters without control characters, a two-letter language.
pub fn search_refusal(
    method: &Method,
    enabled: bool,
    loopback: bool,
    allow_remote: bool,
    query: &str,
    lang: &str,
) -> Option<(u16, &'static str)> {
    if method != Method::GET {
        return Some((405, ""));
    }
    if !enabled {
        return Some((403, "weather by place is off"));
    }
    if !loopback && !allow_remote {
        return Some((403, "place search is served to this computer only"));
    }
    let n = query.chars().count();
    if !(2..=60).contains(&n) || query.chars().any(char::is_control) {
        return Some((400, "a place search is 2 to 60 characters"));
    }
    (lang.len() != 2 || !lang.bytes().all(|b| b.is_ascii_lowercase())).then_some((400, "lang is a two-letter language code"))
}

/// /api/weather and /api/weather/places.
pub async fn handle(app: &App, req: Req) -> std::io::Result<Response<Body>> {
    let weather = &app.weather;
    let reply = match req.path.as_str() {
        "/api/weather" if req.method == Method::GET => http::json(200, &weather.status(now_ms())),
        "/api/weather" => http::empty(405),
        "/api/weather/places" => {
            let query = req.query("q").unwrap_or_default().trim().to_string();
            let lang = req.query("lang").unwrap_or_else(|| "en".into());
            match search_refusal(&req.method, weather.enabled, req.is_loopback(), app.cfg.allow_remote_edit, &query, &lang) {
                Some((status, why)) => http::text(status, why),
                None => match weather.search(&query, &lang, now_ms()).await {
                    Ok(found) => http::json(200, &found),
                    Err((429, why)) => {
                        let mut reply = http::text(429, why);
                        reply.headers_mut().insert("Retry-After", HeaderValue::from_static("60"));
                        reply
                    }
                    Err((status, why)) => http::text(status, why),
                },
            }
        }
        _ => http::empty(404),
    };
    Ok(if weather.enabled { reply } else { off(reply) })
}

#[cfg(test)]
#[path = "weather_tests.rs"]
mod tests;
