// Runtime control state for kiosks, the studio and the Stream Deck plugin (server/control.mjs): which page each profile
// shows, a profile override, and page auto-rotation. Not config (no undo, not in config.json): the server holds it,
// persists the durable part to control.json and pushes every change over /events/control. `reduce` is pure (the
// state, an action, the config and the clock in; the next state out); the `Control` store adds the persistence,
// the listeners and the kiosk list (control_store.rs).
//
// The config and the actions are JSON as Node sees them (any shape can arrive), so the reducer reads them as
// `serde_json::Value` with JavaScript's truthiness and property keys. The state's dictionaries keep insertion order,
// which decides the bytes of control.json.
//
use serde_json::{json, Map, Number, Value};

use crate::js;
use crate::json::{parse as parse_json, stringify};

/// A touch or a remote page switch holds rotation at least this long.
pub const ROTATE_PAUSE_MS: f64 = 30_000.0;
/// Dim level when none is asked for, and its bounds.
pub const DIM_DEFAULT: f64 = 0.6;
pub const DIM_MIN: f64 = 0.1;
pub const DIM_MAX: f64 = 0.9;
pub const MUTE_MAX_MINUTES: f64 = 1440.0;
/// A reload bump within this long of the last one is ignored, so a loop of POSTs can't storm the kiosks.
pub const RELOAD_COALESCE_MS: f64 = 2000.0;
/// A display's screen when the studio hasn't chosen one: it follows the app's own rule ("When the app opens").
pub const DISPLAY_FOLLOW: &str = "follow";
/// Known displays are kept up to this many. A new name beyond it takes the place of the least recently seen display
/// that was never assigned a screen; with none of those, it is not remembered.
pub const DISPLAYS_MAX: usize = 64;
/// A display's last-seen time alone is written to control.json at most this often.
pub const DISPLAY_SEEN_SAVE_MS: f64 = 300_000.0;

type Dict = Map<String, Value>;

/// An open kiosk stream.
#[derive(Clone, Debug, PartialEq)]
pub struct Kiosk {
    pub profile: String,
    pub page: Option<String>,
    pub address: Option<String>,
    pub since: f64,
    /// The `?display=` name of the link, when it had a valid one.
    pub display: Option<String>,
    /// The link carried a `?profile=` pin, which beats the display's assignment.
    pub pinned: bool,
}

/// A named display (a kiosk link with `?display=<name>`): the screen the studio assigned (`follow` or a profile id)
/// and when it was first and last seen (epoch ms).
#[derive(Clone, Debug, PartialEq)]
pub struct Display {
    pub screen: String,
    pub first_seen: f64,
    pub last_seen: f64,
}

/// A display name is a short slug: letters, digits, `-` and `_`, 1 to 32 characters.
pub fn valid_display(name: &str) -> bool {
    (1..=32).contains(&name.len())
        && name
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
}

/// The control state. `muted_until`, `dim` (the level while on), `dim_level` (the last one used) and `island_override`
/// are durable, as are `profile`, `pages` and `override_`. The rest is runtime only: `shown` (the profile a kiosk last
/// reported), `next_at`, `alerts`, `kiosks` (by connection id, oldest first) and the reload counters (`reload` starts at
/// the server start time; `reload_at` is when the last bump was taken). `displays` (by name, in the order first seen)
/// is durable and is left out of the JSON forms while empty, so a server without named displays reads and writes
/// what it always did.
#[derive(Clone, Debug, PartialEq)]
pub struct State {
    pub profile: Value,
    pub shown: Value,
    pub pages: Dict,
    pub override_: Dict,
    pub next_at: Dict,
    pub alerts: Value,
    pub muted_until: Option<f64>,
    pub dim: Dict,
    pub dim_level: Dict,
    pub island_override: Dict,
    pub reload: f64,
    pub reloads: Dict,
    pub reload_at: Option<f64>,
    pub kiosks: Vec<(String, Kiosk)>,
    pub displays: Vec<(String, Display)>,
}

impl Default for State {
    fn default() -> Self {
        Self {
            profile: Value::Null,
            shown: Value::Null,
            pages: Dict::new(),
            override_: Dict::new(),
            next_at: Dict::new(),
            alerts: json!([]),
            muted_until: None,
            dim: Dict::new(),
            dim_level: Dict::new(),
            island_override: Dict::new(),
            reload: 0.0,
            reloads: Dict::new(),
            reload_at: None,
            kiosks: Vec::new(),
            displays: Vec::new(),
        }
    }
}

/// A JavaScript number as a JSON value (`NaN` and infinities are `null`, as `JSON.stringify` writes them).
fn num(n: f64) -> Value {
    if n.fract() == 0.0 && n.abs() <= 9_007_199_254_740_992.0 {
        return Value::from(n as i64);
    }
    Number::from_f64(n).map_or(Value::Null, Value::Number)
}

fn opt_num(n: Option<f64>) -> Value {
    n.map_or(Value::Null, num)
}

fn opt_str(s: &Option<String>) -> Value {
    s.as_ref().map_or(Value::Null, |s| Value::String(s.clone()))
}

impl State {
    /// The state as Node's object (every field, in `emptyState`'s order).
    pub fn to_value(&self) -> Value {
        let kiosks: Dict = self
            .kiosks
            .iter()
            .map(|(id, k)| {
                let mut kiosk = json!({ "profile": k.profile, "page": opt_str(&k.page), "address": opt_str(&k.address), "since": num(k.since) });
                if let Some(display) = &k.display {
                    kiosk["display"] = json!(display);
                    kiosk["pinned"] = json!(k.pinned);
                }
                (id.clone(), kiosk)
            })
            .collect();
        let mut value = json!({
            "profile": self.profile, "shown": self.shown, "pages": self.pages, "override": self.override_, "nextAt": self.next_at,
            "alerts": self.alerts, "mutedUntil": opt_num(self.muted_until), "dim": self.dim, "dimLevel": self.dim_level,
            "islandOverride": self.island_override, "reload": num(self.reload), "reloads": self.reloads,
            "reloadAt": opt_num(self.reload_at), "kiosks": kiosks,
        });
        if !self.displays.is_empty() {
            value["displays"] = durable_displays(&self.displays);
        }
        value
    }

    /// The inverse of `to_value`, for a state written as Node's object.
    pub fn from_value(v: &Value) -> Self {
        let dict = |key: &str| {
            v.get(key)
                .and_then(Value::as_object)
                .cloned()
                .unwrap_or_default()
        };
        let kiosk = |k: &Value| Kiosk {
            profile: k["profile"].as_str().unwrap_or_default().to_string(),
            page: k["page"].as_str().map(String::from),
            address: k["address"].as_str().map(String::from),
            since: k["since"].as_f64().unwrap_or(0.0),
            display: k["display"].as_str().map(String::from),
            pinned: k["pinned"].as_bool().unwrap_or(false),
        };
        Self {
            profile: v.get("profile").cloned().unwrap_or(Value::Null),
            shown: v.get("shown").cloned().unwrap_or(Value::Null),
            pages: dict("pages"),
            override_: dict("override"),
            next_at: dict("nextAt"),
            alerts: v.get("alerts").cloned().unwrap_or_else(|| json!([])),
            muted_until: v.get("mutedUntil").and_then(Value::as_f64),
            dim: dict("dim"),
            dim_level: dict("dimLevel"),
            island_override: dict("islandOverride"),
            reload: v.get("reload").and_then(Value::as_f64).unwrap_or(0.0),
            reloads: dict("reloads"),
            reload_at: v.get("reloadAt").and_then(Value::as_f64),
            kiosks: dict("kiosks")
                .iter()
                .map(|(id, k)| (id.clone(), kiosk(k)))
                .collect(),
            displays: read_displays(v),
        }
    }
}

/// The displays as control.json holds them: `{ name: { screen, firstSeen, lastSeen } }`.
fn durable_displays(displays: &[(String, Display)]) -> Value {
    let map: Dict = displays
        .iter()
        .map(|(name, d)| (name.clone(), json!({ "screen": d.screen, "firstSeen": num(d.first_seen), "lastSeen": num(d.last_seen) })))
        .collect();
    Value::Object(map)
}

/// The displays in a saved state: bad names, and entries without a screen, are dropped.
fn read_displays(v: &Value) -> Vec<(String, Display)> {
    let Some(saved) = v.get("displays").and_then(Value::as_object) else {
        return Vec::new();
    };
    let seen = |d: &Value, key: &str| {
        d.get(key)
            .and_then(Value::as_f64)
            .filter(|n| n.is_finite())
            .unwrap_or(0.0)
    };
    saved
        .iter()
        .filter(|(name, _)| valid_display(name))
        .filter_map(|(name, d)| {
            let screen = d
                .get("screen")
                .and_then(Value::as_str)
                .filter(|s| !s.is_empty())?;
            Some((
                name.clone(),
                Display {
                    screen: screen.to_string(),
                    first_seen: seen(d, "firstSeen"),
                    last_seen: seen(d, "lastSeen"),
                },
            ))
        })
        .take(DISPLAYS_MAX)
        .collect()
}

/* ---------------- reading the config and the actions as JavaScript does ---------------- */

fn truthy(v: &Value) -> bool {
    match v {
        Value::Null => false,
        Value::Bool(b) => *b,
        Value::Number(n) => n.as_f64().is_some_and(|f| f != 0.0 && !f.is_nan()),
        Value::String(s) => !s.is_empty(),
        Value::Array(_) | Value::Object(_) => true,
    }
}

/// `a === b` for the values a profile id can be (an object or array is never equal to anything here).
fn id_eq(a: &Value, b: &Value) -> bool {
    match (a, b) {
        (Value::String(x), Value::String(y)) => x == y,
        (Value::Number(x), Value::Number(y)) => x.as_f64() == y.as_f64(),
        (Value::Bool(x), Value::Bool(y)) => x == y,
        (Value::Null, Value::Null) => true,
        _ => false,
    }
}

/// `obj[id]`'s key.
fn key_of(id: &Value) -> String {
    js::to_property_key(Some(id))
}

fn profiles_of(config: &Value) -> &[Value] {
    config
        .get("profiles")
        .and_then(Value::as_array)
        .map_or(&[], Vec::as_slice)
}

fn find_profile<'a>(config: &'a Value, id: &Value) -> Option<&'a Value> {
    profiles_of(config)
        .iter()
        .find(|p| truthy(p) && p.get("id").is_some_and(|pid| id_eq(pid, id)))
}

fn page_ids(profile: Option<&Value>) -> Vec<String> {
    let pages = profile
        .and_then(|p| p.get("pages"))
        .and_then(Value::as_array);
    pages.map_or_else(Vec::new, |pages| {
        pages
            .iter()
            .filter_map(|p| p.get("id")?.as_str().map(String::from))
            .collect()
    })
}

/// The profile an action without one means: the override, the shown one, the config's pin, the first.
pub fn target_profile(state: &State, config: &Value, id: Option<&Value>) -> Value {
    let pinned = config
        .get("activeProfile")
        .filter(|a| truthy(a) && a.as_str() != Some("auto"));
    for candidate in [id, Some(&state.profile), Some(&state.shown), pinned]
        .into_iter()
        .flatten()
    {
        if truthy(candidate) && find_profile(config, candidate).is_some() {
            return candidate.clone();
        }
    }
    profiles_of(config)
        .first()
        .and_then(|p| p.get("id"))
        .cloned()
        .unwrap_or(Value::Null)
}

/// The page a profile shows: the stored choice when it still exists, else its first page.
pub fn current_page(state: &State, config: &Value, profile_id: &Value) -> Option<String> {
    let ids = page_ids(find_profile(config, profile_id));
    match state.pages.get(&key_of(profile_id)).and_then(Value::as_str) {
        Some(chosen) if !chosen.is_empty() && ids.iter().any(|i| i == chosen) => {
            Some(chosen.to_string())
        }
        _ => ids.into_iter().next(),
    }
}

fn rotation_pages(profile: Option<&Value>) -> Vec<String> {
    let all = page_ids(profile);
    let listed = profile.and_then(|p| p.get("rotate")?.get("pages")?.as_array());
    let listed: Vec<String> = listed
        .map(|l| {
            l.iter()
                .filter_map(Value::as_str)
                .filter(|id| all.iter().any(|a| a == id))
                .map(String::from)
                .collect()
        })
        .unwrap_or_default();
    if listed.is_empty() {
        all
    } else {
        listed
    }
}

/// Whether a profile rotates: the runtime override, else its saved `rotate.enabled`, and only with 2+ pages.
pub fn is_rotating(state: &State, config: &Value, profile_id: &Value) -> bool {
    let profile = find_profile(config, profile_id);
    if rotation_pages(profile).len() < 2 {
        return false;
    }
    match state
        .override_
        .get(&key_of(profile_id))
        .filter(|o| truthy(o))
    {
        Some(o) => o.as_str() == Some("on"),
        None => profile.and_then(|p| p.get("rotate")?.get("enabled")) == Some(&Value::Bool(true)),
    }
}

/// Whether the island shows on a profile: the runtime override, else its saved `island.enabled`.
pub fn is_island_shown(state: &State, config: &Value, profile_id: &Value) -> bool {
    match state
        .island_override
        .get(&key_of(profile_id))
        .filter(|o| truthy(o))
    {
        Some(o) => o.as_str() == Some("on"),
        None => {
            find_profile(config, profile_id).and_then(|p| p.get("island")?.get("enabled"))
                == Some(&Value::Bool(true))
        }
    }
}

fn rotate_ms(profile: Option<&Value>) -> f64 {
    let s = js::value_to_number(profile.and_then(|p| p.get("rotate")?.get("seconds")));
    (if s.is_finite() {
        s.clamp(3.0, 3600.0)
    } else {
        15.0
    }) * 1000.0
}

fn step(ids: &[String], current: Option<&str>, delta: i64) -> Option<String> {
    if ids.is_empty() {
        return None;
    }
    let at = current.and_then(|c| ids.iter().position(|i| i == c));
    let index = at.map_or(0, |i| {
        (i as i64 + delta).rem_euclid(ids.len() as i64) as usize
    });
    Some(ids[index].clone())
}

/// `{...obj, [key]: value}`, or without the key for `None`.
fn with_key(obj: &Dict, key: &str, value: Option<Value>) -> Dict {
    match value {
        Some(v) => {
            let mut next = obj.clone();
            next.insert(key.to_string(), v);
            next
        }
        None => obj
            .iter()
            .filter(|(k, _)| k.as_str() != key)
            .map(|(k, v)| (k.clone(), v.clone()))
            .collect(),
    }
}

fn str_value(s: Option<&str>) -> Option<Value> {
    s.map(|s| Value::String(s.to_string()))
}

/// Hold rotation after a manual switch or touch: the new state, or `None` when the profile does not rotate.
fn hold(state: &State, config: &Value, id: &Value, now: f64) -> Option<State> {
    if !is_rotating(state, config, id) {
        return None;
    }
    let until = now + ROTATE_PAUSE_MS.max(rotate_ms(find_profile(config, id)));
    Some(State {
        next_at: with_key(&state.next_at, &key_of(id), Some(num(until))),
        ..state.clone()
    })
}

fn valid_dim(v: &Value) -> bool {
    v.as_f64().is_some_and(|f| (DIM_MIN..=DIM_MAX).contains(&f))
}

/// `toggled(want, was)`: "toggle" flips `was`; anything else stands.
fn toggled(want: &str, was: bool) -> &str {
    match (want, was) {
        ("toggle", true) => "off",
        ("toggle", false) => "on",
        _ => want,
    }
}

/* ---------------- the reducer ---------------- */

/// The next state for an action, `None` when nothing changes, or the error text for a bad request.
pub type Reduced = Result<Option<State>, &'static str>;

/// Actions: `{ type: "page", profile?, page: id | "next" | "prev" }`, `{ type: "profile", profile: id | null }`,
/// `{ type: "rotate", profile?, state: "on" | "off" | "toggle" | "saved" }`, `{ type: "touch", profile? }`,
/// `{ type: "shown", profile }`, `{ type: "tick" }`, `{ type: "config", previous }`, `{ type: "mute", minutes }` (0 unmutes),
/// `{ type: "kiosk", action: "reload" | "dim" | "island", profile?, state?, level? }`,
/// `{ type: "display", action: "assign" | "forget", display, screen? }` (`screen`: a profile id or "follow");
/// internal only (never a POST): `{ type: "connect", id, profile, page?, address?, display?, pinned? }` and
/// `{ type: "disconnect", id }` for a kiosk stream.
pub fn reduce(state: &State, action: &Value, config: &Value, now: f64) -> Reduced {
    match action.get("type").and_then(Value::as_str) {
        Some("page") => reduce_page(state, action, config, now),
        Some("profile") => reduce_profile(state, action, config),
        Some("rotate") => reduce_rotate(state, action, config, now),
        Some("touch") => {
            let id = target_profile(state, config, action.get("profile"));
            Ok(if truthy(&id) {
                hold(state, config, &id, now)
            } else {
                None
            })
        }
        Some("shown") => {
            let profile = action.get("profile").unwrap_or(&Value::Null);
            if find_profile(config, profile).is_none() || id_eq(&state.shown, profile) {
                return Ok(None);
            }
            Ok(Some(State {
                shown: profile.clone(),
                ..state.clone()
            }))
        }
        Some("mute") => reduce_mute(state, action, now),
        Some("kiosk") => reduce_kiosk(state, action, config, now),
        Some("display") => reduce_display(state, action, config),
        Some("connect") => reduce_connect(state, action, now),
        Some("disconnect") => {
            let id = key_of(action.get("id").unwrap_or(&Value::Null));
            let Some((_, gone)) = state.kiosks.iter().find(|(k, _)| *k == id) else {
                return Ok(None);
            };
            let displays = gone.display.as_deref().map_or_else(
                || state.displays.clone(),
                |name| seen_display(&state.displays, name, now),
            );
            Ok(Some(State {
                kiosks: state
                    .kiosks
                    .iter()
                    .filter(|(k, _)| *k != id)
                    .cloned()
                    .collect(),
                displays,
                ..state.clone()
            }))
        }
        Some("tick") => Ok(reduce_tick(state, config, now)),
        Some("config") => Ok(reduce_config(
            state,
            action.get("previous").unwrap_or(&Value::Null),
            config,
        )),
        _ => Err("unknown action"),
    }
}

fn reduce_page(state: &State, action: &Value, config: &Value, now: f64) -> Reduced {
    let id = target_profile(state, config, action.get("profile"));
    if !truthy(&id) {
        return Err("no profile");
    }
    let ids = page_ids(find_profile(config, &id));
    let current = current_page(state, config, &id);
    let wanted = action.get("page").and_then(Value::as_str);
    let page = match wanted {
        Some("next") => step(&ids, current.as_deref(), 1),
        Some("prev") => step(&ids, current.as_deref(), -1),
        other => other.map(String::from),
    };
    let Some(page) = page.filter(|p| ids.contains(p)) else {
        return Err("unknown page");
    };
    let set = State {
        pages: with_key(&state.pages, &key_of(&id), Some(Value::String(page))),
        ..state.clone()
    };
    Ok(Some(hold(&set, config, &id, now).unwrap_or(set)))
}

fn reduce_profile(state: &State, action: &Value, config: &Value) -> Reduced {
    let profile = action.get("profile");
    if matches!(profile, Some(Value::Null)) || profile.and_then(Value::as_str) == Some("auto") {
        return Ok((!state.profile.is_null()).then(|| State {
            profile: Value::Null,
            ..state.clone()
        }));
    }
    let Some(profile) = profile.filter(|p| find_profile(config, p).is_some()) else {
        return Err("unknown profile");
    };
    Ok((!id_eq(&state.profile, profile)).then(|| State {
        profile: profile.clone(),
        ..state.clone()
    }))
}

fn reduce_rotate(state: &State, action: &Value, config: &Value, now: f64) -> Reduced {
    let id = target_profile(state, config, action.get("profile"));
    if !truthy(&id) {
        return Err("no profile");
    }
    // `undefined` counts as "saved".
    let want = match action.get("state") {
        None => None,
        Some(Value::String(s)) if s == "toggle" => Some(if is_rotating(state, config, &id) {
            "off"
        } else {
            "on"
        }),
        Some(Value::String(s)) if s == "saved" => None,
        Some(Value::String(s)) if s == "on" || s == "off" => Some(s.as_str()),
        Some(_) => return Err("bad rotate state"),
    };
    let key = key_of(&id);
    let mut next = State {
        override_: with_key(&state.override_, &key, str_value(want)),
        ..state.clone()
    };
    let at =
        is_rotating(&next, config, &id).then(|| num(now + rotate_ms(find_profile(config, &id))));
    next.next_at = with_key(&next.next_at, &key, at);
    Ok(Some(next))
}

fn reduce_mute(state: &State, action: &Value, now: f64) -> Reduced {
    let minutes = action
        .get("minutes")
        .and_then(Value::as_f64)
        .filter(|m| m.fract() == 0.0 && (0.0..=MUTE_MAX_MINUTES).contains(m));
    let Some(minutes) = minutes else {
        return Err("bad mute minutes");
    };
    let until = (minutes != 0.0).then_some(now + minutes * 60_000.0);
    Ok((state.muted_until != until).then(|| State {
        muted_until: until,
        ..state.clone()
    }))
}

fn reduce_kiosk(state: &State, action: &Value, config: &Value, now: f64) -> Reduced {
    let named = action.get("profile").filter(|p| !p.is_null());
    if named.is_some_and(|p| find_profile(config, p).is_none()) {
        return Err("unknown profile");
    }
    let kind = action.get("action").and_then(Value::as_str);
    if kind == Some("reload") {
        return Ok(reduce_reload(state, named, now));
    }
    let id = named
        .cloned()
        .unwrap_or_else(|| target_profile(state, config, None));
    if !truthy(&id) {
        return Err("no profile");
    }
    let want = action
        .get("state")
        .filter(|s| !s.is_null())
        .map_or(Some("toggle"), Value::as_str);
    match kind {
        Some("dim") => reduce_dim(state, action, &id, want),
        Some("island") => reduce_island(state, config, &id, want),
        _ => Err("unknown kiosk action"),
    }
}

fn reduce_reload(state: &State, named: Option<&Value>, now: f64) -> Option<State> {
    if state
        .reload_at
        .is_some_and(|at| now - at < RELOAD_COALESCE_MS)
    {
        return None;
    }
    // One above every counter, so a bump always grows what a kiosk compares.
    let top = state
        .reloads
        .values()
        .filter_map(Value::as_f64)
        .fold(state.reload, f64::max)
        + 1.0;
    Some(match named {
        Some(p) => State {
            reloads: with_key(&state.reloads, &key_of(p), Some(num(top))),
            reload_at: Some(now),
            ..state.clone()
        },
        None => State {
            reload: top,
            reload_at: Some(now),
            ..state.clone()
        },
    })
}

fn reduce_dim(state: &State, action: &Value, id: &Value, want: Option<&str>) -> Reduced {
    let Some(want @ ("on" | "off" | "toggle")) = want else {
        return Err("bad dim state");
    };
    let key = key_of(id);
    let was_on = state.dim.contains_key(&key);
    if toggled(want, was_on) == "off" {
        return Ok(was_on.then(|| State {
            dim: with_key(&state.dim, &key, None),
            ..state.clone()
        }));
    }
    let given = action.get("level").filter(|l| !l.is_null());
    if given.is_some_and(|g| !valid_dim(g)) {
        return Err("bad dim level");
    }
    let remembered = state.dim_level.get(&key).and_then(Value::as_f64);
    let level = given
        .and_then(Value::as_f64)
        .or(remembered)
        .unwrap_or(DIM_DEFAULT);
    if state.dim.get(&key).and_then(Value::as_f64) == Some(level) && remembered == Some(level) {
        return Ok(None);
    }
    Ok(Some(State {
        dim: with_key(&state.dim, &key, Some(num(level))),
        dim_level: with_key(&state.dim_level, &key, Some(num(level))),
        ..state.clone()
    }))
}

fn reduce_island(state: &State, config: &Value, id: &Value, want: Option<&str>) -> Reduced {
    let Some(want @ ("on" | "off" | "toggle" | "saved")) = want else {
        return Err("bad island state");
    };
    let key = key_of(id);
    let override_ = (want != "saved").then(|| toggled(want, is_island_shown(state, config, id)));
    if state.island_override.get(&key).and_then(Value::as_str) == override_ {
        return Ok(None);
    }
    Ok(Some(State {
        island_override: with_key(&state.island_override, &key, str_value(override_)),
        ..state.clone()
    }))
}

/// The displays with `name` seen at `now`.
fn seen_display(displays: &[(String, Display)], name: &str, now: f64) -> Vec<(String, Display)> {
    displays
        .iter()
        .map(|(n, d)| {
            (
                n.clone(),
                if n == name {
                    Display {
                        last_seen: now,
                        ..d.clone()
                    }
                } else {
                    d.clone()
                },
            )
        })
        .collect()
}

/// Drops the least recently seen display that still follows (was never assigned a screen); false when there is none.
fn evict_idle_display(displays: &mut Vec<(String, Display)>) -> bool {
    let idle = displays
        .iter()
        .enumerate()
        .filter(|(_, (_, d))| d.screen == DISPLAY_FOLLOW)
        .min_by(|a, b| a.1 .1.last_seen.total_cmp(&b.1 .1.last_seen));
    match idle.map(|(at, _)| at) {
        Some(at) => {
            displays.remove(at);
            true
        }
        None => false,
    }
}

/// A named display assigned a screen, or forgotten.
fn reduce_display(state: &State, action: &Value, config: &Value) -> Reduced {
    let name = action
        .get("display")
        .and_then(Value::as_str)
        .filter(|n| valid_display(n))
        .ok_or("bad display")?;
    let at = state
        .displays
        .iter()
        .position(|(n, _)| n == name)
        .ok_or("unknown display")?;
    let displays = match action.get("action").and_then(Value::as_str) {
        Some("forget") => state
            .displays
            .iter()
            .filter(|(n, _)| n != name)
            .cloned()
            .collect(),
        Some("assign") => {
            let screen = action
                .get("screen")
                .and_then(Value::as_str)
                .ok_or("bad screen")?;
            if screen != DISPLAY_FOLLOW
                && find_profile(config, &Value::String(screen.to_string())).is_none()
            {
                return Err("unknown profile");
            }
            if state.displays[at].1.screen == screen {
                return Ok(None);
            }
            let mut next = state.displays.clone();
            next[at].1.screen = screen.to_string();
            next
        }
        _ => return Err("unknown display action"),
    };
    Ok(Some(State {
        displays,
        ..state.clone()
    }))
}

fn reduce_connect(state: &State, action: &Value, now: f64) -> Reduced {
    let (Some(id), Some(profile)) = (
        action.get("id").and_then(Value::as_str),
        action.get("profile").and_then(Value::as_str),
    ) else {
        return Err("bad kiosk");
    };
    if profile.is_empty() {
        return Err("bad kiosk");
    }
    let kiosk = Kiosk {
        profile: profile.to_string(),
        // A `?page=` pin; otherwise the kiosk shows the profile's page.
        page: action
            .get("page")
            .and_then(Value::as_str)
            .filter(|p| !p.is_empty())
            .map(String::from),
        address: action
            .get("address")
            .and_then(Value::as_str)
            .map(|a| a.strip_prefix("::ffff:").unwrap_or(a).to_string()),
        since: now,
        display: action
            .get("display")
            .and_then(Value::as_str)
            .filter(|n| valid_display(n))
            .map(String::from),
        pinned: action
            .get("pinned")
            .and_then(Value::as_bool)
            .unwrap_or(false),
    };
    let mut displays = state.displays.clone();
    if let Some(name) = &kiosk.display {
        if displays.iter().any(|(n, _)| n == name) {
            displays = seen_display(&displays, name, now);
        } else if displays.len() < DISPLAYS_MAX || evict_idle_display(&mut displays) {
            displays.push((
                name.clone(),
                Display {
                    screen: DISPLAY_FOLLOW.to_string(),
                    first_seen: now,
                    last_seen: now,
                },
            ));
        }
    }
    let mut kiosks = state.kiosks.clone();
    match kiosks.iter_mut().find(|(k, _)| k == id) {
        Some(slot) => slot.1 = kiosk,
        None => kiosks.push((id.to_string(), kiosk)),
    }
    Ok(Some(State {
        kiosks,
        displays,
        ..state.clone()
    }))
}

fn reduce_tick(state: &State, config: &Value, now: f64) -> Option<State> {
    let mut next = state.clone();
    let mut changed = false;
    if next.muted_until.is_some_and(|until| now >= until) {
        next.muted_until = None;
        changed = true;
    }
    for profile in profiles_of(config) {
        let Some(id) = profile.get("id").filter(|id| truthy(id)) else {
            continue;
        };
        let key = key_of(id);
        if !is_rotating(&next, config, id) {
            if next.next_at.contains_key(&key) {
                next.next_at = with_key(&next.next_at, &key, None);
                changed = true;
            }
            continue;
        }
        match next.next_at.get(&key).and_then(Value::as_f64) {
            None => {
                next.next_at = with_key(
                    &next.next_at,
                    &key,
                    Some(num(now + rotate_ms(Some(profile)))),
                );
                changed = true;
            }
            Some(due) if now >= due => {
                let page = step(
                    &rotation_pages(Some(profile)),
                    current_page(&next, config, id).as_deref(),
                    1,
                );
                next.pages = with_key(&next.pages, &key, str_value(page.as_deref()));
                next.next_at = with_key(
                    &next.next_at,
                    &key,
                    Some(num(now + rotate_ms(Some(profile)))),
                );
                changed = true;
            }
            Some(_) => {}
        }
    }
    changed.then_some(next)
}

/// Whether the saved `field` of the profile named `id` differs between two configs, or the profile is gone.
fn field_changed(previous: &Value, config: &Value, id: &str, field: &str) -> bool {
    let id = Value::String(id.to_string());
    let text = |c: &Value| {
        stringify(
            find_profile(c, &id)
                .and_then(|p| p.get(field))
                .unwrap_or(&Value::Null),
        )
    };
    text(previous) != text(config) || find_profile(config, &id).is_none()
}

/// A saved config change: a profile's rotate or island option replaces its runtime override, a deleted profile's
/// dim goes with it, and a display assigned to a deleted profile goes back to following. `pages`, `profile` and `shown` keep stale ids (reads tolerate them).
pub(crate) fn reduce_config(state: &State, previous: &Value, config: &Value) -> Option<State> {
    let mut next = state.clone();
    for id in state
        .override_
        .keys()
        .filter(|id| field_changed(previous, config, id, "rotate"))
    {
        next.override_ = with_key(&next.override_, id, None);
    }
    for id in state
        .island_override
        .keys()
        .filter(|id| field_changed(previous, config, id, "island"))
    {
        next.island_override = with_key(&next.island_override, id, None);
    }
    for id in state
        .dim
        .keys()
        .filter(|id| find_profile(config, &Value::String((*id).clone())).is_none())
    {
        next.dim = with_key(&next.dim, id, None);
    }
    for id in state
        .dim_level
        .keys()
        .filter(|id| find_profile(config, &Value::String((*id).clone())).is_none())
    {
        next.dim_level = with_key(&next.dim_level, id, None);
    }
    for (name, d) in &state.displays {
        if d.screen != DISPLAY_FOLLOW
            && find_profile(config, &Value::String(d.screen.clone())).is_none()
        {
            next.displays = with_screen(&next.displays, name, DISPLAY_FOLLOW);
        }
    }
    (next != *state).then_some(next)
}

/// The displays with `name` assigned `screen`.
fn with_screen(displays: &[(String, Display)], name: &str, screen: &str) -> Vec<(String, Display)> {
    displays
        .iter()
        .map(|(n, d)| {
            (
                n.clone(),
                if n == name {
                    Display {
                        screen: screen.to_string(),
                        ..d.clone()
                    }
                } else {
                    d.clone()
                },
            )
        })
        .collect()
}

/* ---------------- what clients see ---------------- */

/// What clients see: per profile its page, rotation, dim level, island and reload counter, plus the override, the
/// shown profile, the active alerts, the alert mute, the global reload counter and the open kiosks (oldest first).
pub fn public_state(state: &State, config: &Value) -> Value {
    let mut profiles = Dict::new();
    for id in profiles_of(config)
        .iter()
        .filter_map(|p| p.get("id"))
        .filter(|id| truthy(id))
    {
        let key = key_of(id);
        let entry = json!({
            "page": current_page(state, config, id).map_or(Value::Null, Value::String),
            "rotating": is_rotating(state, config, id),
            "override": state.override_.get(&key).filter(|v| !v.is_null()).cloned().unwrap_or(Value::Null),
            "dim": state.dim.get(&key).filter(|v| !v.is_null()).cloned().unwrap_or(json!(0)),
            "island": is_island_shown(state, config, id),
            "islandOverride": state.island_override.get(&key).filter(|v| !v.is_null()).cloned().unwrap_or(Value::Null),
            "reload": state.reloads.get(&key).filter(|v| !v.is_null()).cloned().unwrap_or_else(|| num(state.reload)),
        });
        profiles.insert(key, entry);
    }
    let kiosks: Vec<Value> = state
        .kiosks
        .iter()
        .map(|(id, k)| public_kiosk(state, config, id, k))
        .collect();
    let mut view = json!({
        "profile": state.profile, "shown": state.shown, "profiles": profiles, "alerts": state.alerts,
        "mutedUntil": opt_num(state.muted_until), "reload": num(state.reload), "kiosks": kiosks,
    });
    if !state.displays.is_empty() {
        view["displays"] = Value::Array(
            state
                .displays
                .iter()
                .map(|(name, d)| public_display(state, config, name, d))
                .collect(),
        );
    }
    view
}

/// The screen a display shows: its link's `?profile=` pin, then the screen the studio assigned (while it exists),
/// then the global override, then the startup rule (`activeProfile`). With none of them, "Best fit" decides on the
/// kiosk itself, so an online display shows what it reported, and an offline one has no known screen.
pub fn display_screen(
    state: &State,
    config: &Value,
    display: &Display,
    kiosk: Option<&Kiosk>,
) -> Option<String> {
    let exists = |id: &str| find_profile(config, &Value::String(id.to_string())).is_some();
    if let Some(k) = kiosk.filter(|k| k.pinned) {
        return Some(k.profile.clone());
    }
    let startup = config
        .get("activeProfile")
        .and_then(Value::as_str)
        .filter(|a| *a != "auto");
    let candidates = [
        Some(display.screen.as_str()).filter(|s| *s != DISPLAY_FOLLOW),
        state.profile.as_str(),
        startup,
    ];
    candidates
        .into_iter()
        .flatten()
        .find(|id| exists(id))
        .map(String::from)
        .or_else(|| kiosk.map(|k| k.profile.clone()))
}

/// A display as clients see it: `screen` is the assignment (a profile id that still exists, else "follow"), `shows`
/// the screen it resolves to, `address` the newest open kiosk's.
fn public_display(state: &State, config: &Value, name: &str, display: &Display) -> Value {
    let kiosk = state
        .kiosks
        .iter()
        .rev()
        .map(|(_, k)| k)
        .find(|k| k.display.as_deref() == Some(name));
    let assigned = display.screen != DISPLAY_FOLLOW
        && find_profile(config, &Value::String(display.screen.clone())).is_some();
    json!({
        "name": name,
        "screen": if assigned { display.screen.as_str() } else { DISPLAY_FOLLOW },
        "firstSeen": num(display.first_seen),
        "lastSeen": num(display.last_seen),
        "online": kiosk.is_some(),
        "address": kiosk.map_or(Value::Null, |k| opt_str(&k.address)),
        "shows": display_screen(state, config, display, kiosk).map_or(Value::Null, Value::String),
    })
}

/// A kiosk as clients see it: the page it shows is its pin while the profile has that page, else the profile's.
fn public_kiosk(state: &State, config: &Value, id: &str, kiosk: &Kiosk) -> Value {
    let profile = Value::String(kiosk.profile.clone());
    let ids = page_ids(find_profile(config, &profile));
    let page = match &kiosk.page {
        Some(pin) if ids.contains(pin) => Some(pin.clone()),
        _ => current_page(state, config, &profile),
    };
    let mut view = json!({ "id": id, "profile": kiosk.profile, "page": page, "address": opt_str(&kiosk.address), "since": num(kiosk.since) });
    if let Some(display) = &kiosk.display {
        view["display"] = json!(display);
    }
    view
}

/// The durable part, as saved to control.json.
pub(crate) fn durable(state: &State) -> Value {
    let mut saved = json!({
        "profile": state.profile, "pages": state.pages, "override": state.override_, "mutedUntil": opt_num(state.muted_until),
        "dim": state.dim, "dimLevel": state.dim_level, "islandOverride": state.island_override,
    });
    if !state.displays.is_empty() {
        saved["displays"] = durable_displays(&state.displays);
    }
    saved
}

/// The durable part without the displays' last-seen times: a change to this alone is what rewrites control.json.
pub(crate) fn durable_shape(state: &State) -> Value {
    let mut shape = state.clone();
    for (_, d) in &mut shape.displays {
        d.last_seen = 0.0;
    }
    durable(&shape)
}

/// The state saved in `text` (control.json), or the empty one when it is not JSON.
pub fn load(text: Option<&str>, now: f64) -> State {
    let Some(raw) = text.and_then(parse_json) else {
        return State::default();
    };
    // JSON `null` is the one value Node throws on (`raw.profile`), which gives the empty state too.
    let dict = |key: &str| {
        raw.get(key)
            .and_then(Value::as_object)
            .cloned()
            .unwrap_or_default()
    };
    let pick = |key: &str, ok: &dyn Fn(&Value) -> bool| -> Dict {
        dict(key).into_iter().filter(|(_, v)| ok(v)).collect()
    };
    let muted = raw
        .get("mutedUntil")
        .and_then(Value::as_f64)
        .filter(|m| *m > now && *m <= now + MUTE_MAX_MINUTES * 60_000.0);
    State {
        profile: raw
            .get("profile")
            .filter(|p| p.is_string())
            .cloned()
            .unwrap_or(Value::Null),
        pages: dict("pages"),
        override_: dict("override"),
        muted_until: muted,
        dim: pick("dim", &valid_dim),
        dim_level: pick("dimLevel", &valid_dim),
        island_override: pick("islandOverride", &|v| {
            matches!(v.as_str(), Some("on" | "off"))
        }),
        displays: read_displays(&raw),
        ..State::default()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn steps_through_ids_with_wrap_and_restarts_from_the_first_when_lost() {
        let ids: Vec<String> = ["a", "b", "c"].map(String::from).to_vec();
        assert_eq!(step(&ids, Some("c"), 1).as_deref(), Some("a"));
        assert_eq!(step(&ids, Some("a"), -1).as_deref(), Some("c"));
        assert_eq!(step(&ids, Some("gone"), -1).as_deref(), Some("a"));
        assert_eq!(step(&ids, None, 1).as_deref(), Some("a"));
        assert_eq!(step(&[], Some("a"), 1), None);
    }

    #[test]
    fn with_key_keeps_a_key_in_place_and_removes_without_reordering() {
        let obj: Dict = serde_json::from_str(r#"{"b":1,"a":2,"c":3}"#).unwrap();
        assert_eq!(
            stringify(&Value::Object(with_key(&obj, "b", Some(json!(9))))),
            r#"{"b":9,"a":2,"c":3}"#
        );
        assert_eq!(
            stringify(&Value::Object(with_key(&obj, "b", None))),
            r#"{"a":2,"c":3}"#
        );
    }

    #[test]
    fn a_missing_or_broken_control_json_loads_the_empty_state() {
        assert_eq!(load(None, 5000.0), State::default());
        assert_eq!(load(Some("{broken"), 5000.0), State::default());
    }

    #[test]
    fn control_json_drops_bad_values_on_load() {
        let text = json!({
            "mutedUntil": 1000.0 + 1441.0 * 60_000.0,
            "dim": { "desk": 5, "strip": 0.5, "x": "a", "y": null },
            "dimLevel": { "desk": 99, "strip": 0.2 },
            "islandOverride": { "desk": "yes", "strip": "off" },
        })
        .to_string();
        let s = load(Some(&text), 1000.0);
        assert_eq!(s.muted_until, None);
        assert_eq!(stringify(&Value::Object(s.dim)), r#"{"strip":0.5}"#);
        assert_eq!(stringify(&Value::Object(s.dim_level)), r#"{"strip":0.2}"#);
        assert_eq!(
            stringify(&Value::Object(s.island_override)),
            r#"{"strip":"off"}"#
        );
    }

    #[test]
    fn a_saved_mute_loads_only_while_it_lasts() {
        let text = json!({ "mutedUntil": 60_000 }).to_string();
        assert_eq!(load(Some(&text), 59_999.0).muted_until, Some(60_000.0));
        assert_eq!(load(Some(&text), 60_000.0).muted_until, None);
    }

    #[test]
    fn a_saved_config_drops_a_deleted_profiles_dim() {
        let profile = |id: &str| json!({ "id": id, "pages": [{ "id": "main" }] });
        let before = json!({ "profiles": [profile("desk"), profile("strip")] });
        let after = json!({ "profiles": [profile("desk")] });
        let state = State {
            dim: serde_json::from_str(r#"{"strip":0.5,"desk":0.3}"#).unwrap(),
            dim_level: serde_json::from_str(r#"{"strip":0.5}"#).unwrap(),
            ..State::default()
        };
        let next = reduce_config(&state, &before, &after).expect("changed");
        assert_eq!(
            stringify(&Value::Object(next.dim.clone())),
            r#"{"desk":0.3}"#
        );
        assert!(next.dim_level.is_empty());
        assert!(reduce_config(&next, &after, &after).is_none());
    }

    fn three_screens() -> Value {
        let profile = |id: &str| json!({ "id": id, "pages": [{ "id": "main" }] });
        json!({ "activeProfile": "auto", "profiles": [profile("desk"), profile("strip"), profile("wall")] })
    }

    fn connect(state: &State, id: &str, extra: Value, now: f64) -> State {
        let mut action = json!({ "type": "connect", "id": id, "profile": "desk" });
        action
            .as_object_mut()
            .unwrap()
            .extend(extra.as_object().unwrap().clone());
        reduce(state, &action, &three_screens(), now)
            .unwrap()
            .unwrap()
    }

    fn display_action(state: &State, action: Value) -> Reduced {
        let mut full = json!({ "type": "display" });
        full.as_object_mut()
            .unwrap()
            .extend(action.as_object().unwrap().clone());
        reduce(state, &full, &three_screens(), 0.0)
    }

    #[test]
    fn display_names_are_short_slugs() {
        for ok in ["desk", "Hall_1", "a-b", &"x".repeat(32)] {
            assert!(valid_display(ok), "{ok}");
        }
        for bad in ["", "has space", "a/b", "ünï", "a.b", &"x".repeat(33)] {
            assert!(!valid_display(bad), "{bad}");
        }
    }

    #[test]
    fn a_kiosk_with_a_display_name_registers_it_and_a_bad_name_does_not() {
        let state = connect(
            &State::default(),
            "k1",
            json!({ "display": "hall" }),
            1000.0,
        );
        assert_eq!(
            state.displays,
            vec![(
                "hall".into(),
                Display {
                    screen: "follow".into(),
                    first_seen: 1000.0,
                    last_seen: 1000.0
                }
            )]
        );
        let bad = connect(
            &State::default(),
            "k1",
            json!({ "display": "no good" }),
            1000.0,
        );
        assert!(bad.displays.is_empty() && bad.kiosks[0].1.display.is_none());
        // Seen again later: first seen stays, last seen moves, on connect and on disconnect.
        let later = connect(&state, "k2", json!({ "display": "hall" }), 5000.0);
        assert_eq!(
            (
                later.displays[0].1.first_seen,
                later.displays[0].1.last_seen
            ),
            (1000.0, 5000.0)
        );
        let gone = reduce(
            &later,
            &json!({ "type": "disconnect", "id": "k2" }),
            &three_screens(),
            9000.0,
        )
        .unwrap()
        .unwrap();
        assert_eq!(gone.displays[0].1.last_seen, 9000.0);
        // No display, no registry: the JSON forms stay as they were.
        assert!(connect(&State::default(), "k1", json!({}), 1.0)
            .to_value()
            .get("displays")
            .is_none());
        assert!(public_state(&State::default(), &three_screens())
            .get("displays")
            .is_none());
        assert!(durable(&State::default()).get("displays").is_none());
    }

    #[test]
    fn assign_and_forget_change_a_known_display_only() {
        let state = connect(
            &State::default(),
            "k1",
            json!({ "display": "hall" }),
            1000.0,
        );
        let assign =
            |screen: &str| json!({ "action": "assign", "display": "hall", "screen": screen });
        let assigned = display_action(&state, assign("strip")).unwrap().unwrap();
        assert_eq!(assigned.displays[0].1.screen, "strip");
        assert_eq!(display_action(&assigned, assign("strip")).unwrap(), None);
        let followed = display_action(&assigned, assign("follow"))
            .unwrap()
            .unwrap();
        assert_eq!(followed.displays[0].1.screen, "follow");
        assert_eq!(
            display_action(&state, assign("gone")),
            Err("unknown profile")
        );
        assert_eq!(
            display_action(
                &state,
                json!({ "action": "assign", "display": "nobody", "screen": "desk" })
            ),
            Err("unknown display")
        );
        assert_eq!(
            display_action(
                &state,
                json!({ "action": "assign", "display": "bad name", "screen": "desk" })
            ),
            Err("bad display")
        );
        assert_eq!(
            display_action(&state, json!({ "action": "assign", "display": "hall" })),
            Err("bad screen")
        );
        assert_eq!(
            display_action(&state, json!({ "action": "dance", "display": "hall" })),
            Err("unknown display action")
        );
        let forgotten = display_action(&assigned, json!({ "action": "forget", "display": "hall" }))
            .unwrap()
            .unwrap();
        assert!(forgotten.displays.is_empty());
    }

    #[test]
    fn a_display_shows_the_pin_then_its_assignment_then_the_override_then_the_startup_rule() {
        let registered = connect(
            &State::default(),
            "k1",
            json!({ "display": "hall", "profile": "wall" }),
            1000.0,
        );
        let shows = |s: &State, config: &Value| {
            public_state(s, config)["displays"][0]["shows"]
                .as_str()
                .map(String::from)
        };
        // Nothing decides: an online display shows what its kiosk reported (Best fit is the kiosk's call).
        assert_eq!(
            shows(&registered, &three_screens()).as_deref(),
            Some("wall")
        );
        let offline = reduce(
            &registered,
            &json!({ "type": "disconnect", "id": "k1" }),
            &three_screens(),
            2000.0,
        )
        .unwrap()
        .unwrap();
        assert_eq!(shows(&offline, &three_screens()), None);
        // The startup rule, the override over it, the assignment over both.
        let mut config = three_screens();
        config["activeProfile"] = json!("strip");
        assert_eq!(shows(&offline, &config).as_deref(), Some("strip"));
        let overridden = State {
            profile: json!("desk"),
            ..offline
        };
        assert_eq!(shows(&overridden, &config).as_deref(), Some("desk"));
        let mut assigned = overridden;
        assigned.displays[0].1.screen = "wall".into();
        assert_eq!(shows(&assigned, &config).as_deref(), Some("wall"));
        // A link's pin beats the assignment.
        let pinned = connect(
            &assigned,
            "k2",
            json!({ "display": "hall", "profile": "desk", "pinned": true }),
            3000.0,
        );
        assert_eq!(shows(&pinned, &config).as_deref(), Some("desk"));
    }

    #[test]
    fn a_screen_that_no_longer_exists_means_follow() {
        let mut state = connect(
            &State::default(),
            "k1",
            json!({ "display": "hall" }),
            1000.0,
        );
        state.displays[0].1.screen = "wall".into();
        let before = three_screens();
        let mut after = three_screens();
        after["profiles"]
            .as_array_mut()
            .unwrap()
            .retain(|p| p["id"] != "wall");
        // Read straight away, the stale assignment already counts as follow ...
        assert_eq!(
            public_state(&state, &after)["displays"][0]["screen"],
            "follow"
        );
        // ... and the saved config change puts it back for good.
        let next = reduce_config(&state, &before, &after).expect("changed");
        assert_eq!(next.displays[0].1.screen, "follow");
        assert!(reduce_config(&next, &after, &after).is_none());
    }

    #[test]
    fn displays_round_trip_through_control_json_and_bad_entries_are_dropped() {
        let mut state = connect(
            &State::default(),
            "k1",
            json!({ "display": "hall" }),
            1000.0,
        );
        state.displays[0].1.screen = "strip".into();
        let state = connect(&state, "k2", json!({ "display": "desk_2" }), 2000.0);
        let text = stringify(&durable(&state));
        let loaded = load(Some(&text), 5000.0);
        assert_eq!(loaded.displays, state.displays);
        assert_eq!(stringify(&durable(&loaded)), text);
        // The kiosks stay runtime only.
        assert!(!text.contains("kiosks") && !text.contains("k1"));
        let messy = json!({ "displays": { "ok": { "screen": "desk", "firstSeen": 1, "lastSeen": 2 }, "bad name": { "screen": "desk" }, "noscreen": {}, "t": { "screen": "" } } });
        let loaded = load(Some(&messy.to_string()), 0.0);
        assert_eq!(
            loaded
                .displays
                .iter()
                .map(|(n, _)| n.as_str())
                .collect::<Vec<_>>(),
            ["ok"]
        );
    }

    #[test]
    fn only_so_many_displays_are_remembered() {
        let mut state = State::default();
        for i in 0..=DISPLAYS_MAX {
            state = connect(
                &state,
                &format!("k{i}"),
                json!({ "display": format!("d{i}") }),
                i as f64,
            );
        }
        assert_eq!(state.displays.len(), DISPLAYS_MAX);
    }

    fn full_registry() -> State {
        let mut state = State::default();
        for i in 0..DISPLAYS_MAX {
            // d0 was seen last, d1 first, and so on up.
            state = connect(
                &state,
                &format!("k{i}"),
                json!({ "display": format!("d{i}") }),
                (1000 + i) as f64,
            );
        }
        state
    }

    #[test]
    fn a_full_registry_makes_room_by_dropping_the_least_recently_seen_unassigned_display() {
        let mut state = full_registry();
        // d0 is the oldest but assigned, so d1 goes instead.
        state.displays[0].1.screen = "desk".into();
        let next = connect(&state, "new", json!({ "display": "fresh" }), 9000.0);
        let names: Vec<&str> = next.displays.iter().map(|(n, _)| n.as_str()).collect();
        assert_eq!(names.len(), DISPLAYS_MAX);
        assert!(names.contains(&"d0") && names.contains(&"fresh") && !names.contains(&"d1"));
        // Seen again, a display is no longer the oldest.
        let mut seen = full_registry();
        seen.displays = seen_display(&seen.displays, "d1", 5000.0);
        let next = connect(&seen, "new", json!({ "display": "fresh" }), 9000.0);
        assert!(
            next.displays.iter().all(|(n, _)| n != "d0")
                && next.displays.iter().any(|(n, _)| n == "d1")
        );
    }

    #[test]
    fn a_full_registry_of_assigned_displays_refuses_a_new_name() {
        let mut state = full_registry();
        for (_, d) in &mut state.displays {
            d.screen = "desk".into();
        }
        let next = connect(&state, "new", json!({ "display": "fresh" }), 9000.0);
        assert_eq!(next.displays, state.displays);
        // The kiosk itself still connects.
        assert_eq!(next.kiosks.last().map(|(id, _)| id.as_str()), Some("new"));
    }
}
