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

use crate::json::{parse as parse_json, stringify};
use crate::js;

/// A touch or a remote page switch holds rotation at least this long.
pub const ROTATE_PAUSE_MS: f64 = 30_000.0;
/// Dim level when none is asked for, and its bounds.
pub const DIM_DEFAULT: f64 = 0.6;
pub const DIM_MIN: f64 = 0.1;
pub const DIM_MAX: f64 = 0.9;
pub const MUTE_MAX_MINUTES: f64 = 1440.0;
/// A reload bump within this long of the last one is ignored, so a loop of POSTs can't storm the kiosks.
pub const RELOAD_COALESCE_MS: f64 = 2000.0;

type Dict = Map<String, Value>;

/// An open kiosk stream.
#[derive(Clone, Debug, PartialEq)]
pub struct Kiosk {
    pub profile: String,
    pub page: Option<String>,
    pub address: Option<String>,
    pub since: f64,
}

/// The control state. `muted_until`, `dim` (the level while on), `dim_level` (the last one used) and `island_override`
/// are durable, as are `profile`, `pages` and `override_`. The rest is runtime only: `shown` (the profile a kiosk last
/// reported), `next_at`, `alerts`, `kiosks` (by connection id, oldest first) and the reload counters (`reload` starts at
/// the server start time; `reload_at` is when the last bump was taken).
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
                let kiosk = json!({ "profile": k.profile, "page": opt_str(&k.page), "address": opt_str(&k.address), "since": num(k.since) });
                (id.clone(), kiosk)
            })
            .collect();
        json!({
            "profile": self.profile, "shown": self.shown, "pages": self.pages, "override": self.override_, "nextAt": self.next_at,
            "alerts": self.alerts, "mutedUntil": opt_num(self.muted_until), "dim": self.dim, "dimLevel": self.dim_level,
            "islandOverride": self.island_override, "reload": num(self.reload), "reloads": self.reloads,
            "reloadAt": opt_num(self.reload_at), "kiosks": kiosks,
        })
    }

    /// The inverse of `to_value`, for a state written as Node's object.
    pub fn from_value(v: &Value) -> Self {
        let dict = |key: &str| v.get(key).and_then(Value::as_object).cloned().unwrap_or_default();
        let kiosk = |k: &Value| Kiosk {
            profile: k["profile"].as_str().unwrap_or_default().to_string(),
            page: k["page"].as_str().map(String::from),
            address: k["address"].as_str().map(String::from),
            since: k["since"].as_f64().unwrap_or(0.0),
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
            kiosks: dict("kiosks").iter().map(|(id, k)| (id.clone(), kiosk(k))).collect(),
        }
    }
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
    config.get("profiles").and_then(Value::as_array).map_or(&[], Vec::as_slice)
}

fn find_profile<'a>(config: &'a Value, id: &Value) -> Option<&'a Value> {
    profiles_of(config).iter().find(|p| truthy(p) && p.get("id").is_some_and(|pid| id_eq(pid, id)))
}

fn page_ids(profile: Option<&Value>) -> Vec<String> {
    let pages = profile.and_then(|p| p.get("pages")).and_then(Value::as_array);
    pages.map_or_else(Vec::new, |pages| pages.iter().filter_map(|p| p.get("id")?.as_str().map(String::from)).collect())
}

/// The profile an action without one means: the override, the shown one, the config's pin, the first.
pub fn target_profile(state: &State, config: &Value, id: Option<&Value>) -> Value {
    let pinned = config.get("activeProfile").filter(|a| truthy(a) && a.as_str() != Some("auto"));
    for candidate in [id, Some(&state.profile), Some(&state.shown), pinned].into_iter().flatten() {
        if truthy(candidate) && find_profile(config, candidate).is_some() {
            return candidate.clone();
        }
    }
    profiles_of(config).first().and_then(|p| p.get("id")).cloned().unwrap_or(Value::Null)
}

/// The page a profile shows: the stored choice when it still exists, else its first page.
pub fn current_page(state: &State, config: &Value, profile_id: &Value) -> Option<String> {
    let ids = page_ids(find_profile(config, profile_id));
    match state.pages.get(&key_of(profile_id)).and_then(Value::as_str) {
        Some(chosen) if !chosen.is_empty() && ids.iter().any(|i| i == chosen) => Some(chosen.to_string()),
        _ => ids.into_iter().next(),
    }
}

fn rotation_pages(profile: Option<&Value>) -> Vec<String> {
    let all = page_ids(profile);
    let listed = profile.and_then(|p| p.get("rotate")?.get("pages")?.as_array());
    let listed: Vec<String> = listed
        .map(|l| l.iter().filter_map(Value::as_str).filter(|id| all.iter().any(|a| a == id)).map(String::from).collect())
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
    match state.override_.get(&key_of(profile_id)).filter(|o| truthy(o)) {
        Some(o) => o.as_str() == Some("on"),
        None => profile.and_then(|p| p.get("rotate")?.get("enabled")) == Some(&Value::Bool(true)),
    }
}

/// Whether the island shows on a profile: the runtime override, else its saved `island.enabled`.
pub fn is_island_shown(state: &State, config: &Value, profile_id: &Value) -> bool {
    match state.island_override.get(&key_of(profile_id)).filter(|o| truthy(o)) {
        Some(o) => o.as_str() == Some("on"),
        None => find_profile(config, profile_id).and_then(|p| p.get("island")?.get("enabled")) == Some(&Value::Bool(true)),
    }
}

fn rotate_ms(profile: Option<&Value>) -> f64 {
    let s = js::value_to_number(profile.and_then(|p| p.get("rotate")?.get("seconds")));
    (if s.is_finite() { s.clamp(3.0, 3600.0) } else { 15.0 }) * 1000.0
}

fn step(ids: &[String], current: Option<&str>, delta: i64) -> Option<String> {
    if ids.is_empty() {
        return None;
    }
    let at = current.and_then(|c| ids.iter().position(|i| i == c));
    let index = at.map_or(0, |i| (i as i64 + delta).rem_euclid(ids.len() as i64) as usize);
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
        None => obj.iter().filter(|(k, _)| k.as_str() != key).map(|(k, v)| (k.clone(), v.clone())).collect(),
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
    Some(State { next_at: with_key(&state.next_at, &key_of(id), Some(num(until))), ..state.clone() })
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
/// `{ type: "kiosk", action: "reload" | "dim" | "island", profile?, state?, level? }`; internal only (never a POST):
/// `{ type: "connect", id, profile, page?, address? }` and `{ type: "disconnect", id }` for a kiosk stream.
pub fn reduce(state: &State, action: &Value, config: &Value, now: f64) -> Reduced {
    match action.get("type").and_then(Value::as_str) {
        Some("page") => reduce_page(state, action, config, now),
        Some("profile") => reduce_profile(state, action, config),
        Some("rotate") => reduce_rotate(state, action, config, now),
        Some("touch") => {
            let id = target_profile(state, config, action.get("profile"));
            Ok(if truthy(&id) { hold(state, config, &id, now) } else { None })
        }
        Some("shown") => {
            let profile = action.get("profile").unwrap_or(&Value::Null);
            if find_profile(config, profile).is_none() || id_eq(&state.shown, profile) {
                return Ok(None);
            }
            Ok(Some(State { shown: profile.clone(), ..state.clone() }))
        }
        Some("mute") => reduce_mute(state, action, now),
        Some("kiosk") => reduce_kiosk(state, action, config, now),
        Some("connect") => reduce_connect(state, action, now),
        Some("disconnect") => {
            let id = key_of(action.get("id").unwrap_or(&Value::Null));
            let known = state.kiosks.iter().any(|(k, _)| *k == id);
            Ok(known.then(|| State { kiosks: state.kiosks.iter().filter(|(k, _)| *k != id).cloned().collect(), ..state.clone() }))
        }
        Some("tick") => Ok(reduce_tick(state, config, now)),
        Some("config") => Ok(reduce_config(state, action.get("previous").unwrap_or(&Value::Null), config)),
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
    let set = State { pages: with_key(&state.pages, &key_of(&id), Some(Value::String(page))), ..state.clone() };
    Ok(Some(hold(&set, config, &id, now).unwrap_or(set)))
}

fn reduce_profile(state: &State, action: &Value, config: &Value) -> Reduced {
    let profile = action.get("profile");
    if matches!(profile, Some(Value::Null)) || profile.and_then(Value::as_str) == Some("auto") {
        return Ok((!state.profile.is_null()).then(|| State { profile: Value::Null, ..state.clone() }));
    }
    let Some(profile) = profile.filter(|p| find_profile(config, p).is_some()) else {
        return Err("unknown profile");
    };
    Ok((!id_eq(&state.profile, profile)).then(|| State { profile: profile.clone(), ..state.clone() }))
}

fn reduce_rotate(state: &State, action: &Value, config: &Value, now: f64) -> Reduced {
    let id = target_profile(state, config, action.get("profile"));
    if !truthy(&id) {
        return Err("no profile");
    }
    // `undefined` counts as "saved".
    let want = match action.get("state") {
        None => None,
        Some(Value::String(s)) if s == "toggle" => Some(if is_rotating(state, config, &id) { "off" } else { "on" }),
        Some(Value::String(s)) if s == "saved" => None,
        Some(Value::String(s)) if s == "on" || s == "off" => Some(s.as_str()),
        Some(_) => return Err("bad rotate state"),
    };
    let key = key_of(&id);
    let mut next = State { override_: with_key(&state.override_, &key, str_value(want)), ..state.clone() };
    let at = is_rotating(&next, config, &id).then(|| num(now + rotate_ms(find_profile(config, &id))));
    next.next_at = with_key(&next.next_at, &key, at);
    Ok(Some(next))
}

fn reduce_mute(state: &State, action: &Value, now: f64) -> Reduced {
    let minutes = action.get("minutes").and_then(Value::as_f64).filter(|m| m.fract() == 0.0 && (0.0..=MUTE_MAX_MINUTES).contains(m));
    let Some(minutes) = minutes else {
        return Err("bad mute minutes");
    };
    let until = (minutes != 0.0).then_some(now + minutes * 60_000.0);
    Ok((state.muted_until != until).then(|| State { muted_until: until, ..state.clone() }))
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
    let id = named.cloned().unwrap_or_else(|| target_profile(state, config, None));
    if !truthy(&id) {
        return Err("no profile");
    }
    let want = action.get("state").filter(|s| !s.is_null()).map_or(Some("toggle"), Value::as_str);
    match kind {
        Some("dim") => reduce_dim(state, action, &id, want),
        Some("island") => reduce_island(state, config, &id, want),
        _ => Err("unknown kiosk action"),
    }
}

fn reduce_reload(state: &State, named: Option<&Value>, now: f64) -> Option<State> {
    if state.reload_at.is_some_and(|at| now - at < RELOAD_COALESCE_MS) {
        return None;
    }
    // One above every counter, so a bump always grows what a kiosk compares.
    let top = state.reloads.values().filter_map(Value::as_f64).fold(state.reload, f64::max) + 1.0;
    Some(match named {
        Some(p) => State { reloads: with_key(&state.reloads, &key_of(p), Some(num(top))), reload_at: Some(now), ..state.clone() },
        None => State { reload: top, reload_at: Some(now), ..state.clone() },
    })
}

fn reduce_dim(state: &State, action: &Value, id: &Value, want: Option<&str>) -> Reduced {
    let Some(want @ ("on" | "off" | "toggle")) = want else {
        return Err("bad dim state");
    };
    let key = key_of(id);
    let was_on = state.dim.contains_key(&key);
    if toggled(want, was_on) == "off" {
        return Ok(was_on.then(|| State { dim: with_key(&state.dim, &key, None), ..state.clone() }));
    }
    let given = action.get("level").filter(|l| !l.is_null());
    if given.is_some_and(|g| !valid_dim(g)) {
        return Err("bad dim level");
    }
    let remembered = state.dim_level.get(&key).and_then(Value::as_f64);
    let level = given.and_then(Value::as_f64).or(remembered).unwrap_or(DIM_DEFAULT);
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
    Ok(Some(State { island_override: with_key(&state.island_override, &key, str_value(override_)), ..state.clone() }))
}

fn reduce_connect(state: &State, action: &Value, now: f64) -> Reduced {
    let (Some(id), Some(profile)) = (action.get("id").and_then(Value::as_str), action.get("profile").and_then(Value::as_str)) else {
        return Err("bad kiosk");
    };
    if profile.is_empty() {
        return Err("bad kiosk");
    }
    let kiosk = Kiosk {
        profile: profile.to_string(),
        // A `?page=` pin; otherwise the kiosk shows the profile's page.
        page: action.get("page").and_then(Value::as_str).filter(|p| !p.is_empty()).map(String::from),
        address: action.get("address").and_then(Value::as_str).map(|a| a.strip_prefix("::ffff:").unwrap_or(a).to_string()),
        since: now,
    };
    let mut kiosks = state.kiosks.clone();
    match kiosks.iter_mut().find(|(k, _)| k == id) {
        Some(slot) => slot.1 = kiosk,
        None => kiosks.push((id.to_string(), kiosk)),
    }
    Ok(Some(State { kiosks, ..state.clone() }))
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
                next.next_at = with_key(&next.next_at, &key, Some(num(now + rotate_ms(Some(profile)))));
                changed = true;
            }
            Some(due) if now >= due => {
                let page = step(&rotation_pages(Some(profile)), current_page(&next, config, id).as_deref(), 1);
                next.pages = with_key(&next.pages, &key, str_value(page.as_deref()));
                next.next_at = with_key(&next.next_at, &key, Some(num(now + rotate_ms(Some(profile)))));
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
    let text = |c: &Value| stringify(find_profile(c, &id).and_then(|p| p.get(field)).unwrap_or(&Value::Null));
    text(previous) != text(config) || find_profile(config, &id).is_none()
}

/// A saved config change: a profile's rotate or island option replaces its runtime override, and a deleted profile's
/// dim goes with it. `pages`, `profile` and `shown` keep stale ids (reads tolerate them).
pub(crate) fn reduce_config(state: &State, previous: &Value, config: &Value) -> Option<State> {
    let mut next = state.clone();
    for id in state.override_.keys().filter(|id| field_changed(previous, config, id, "rotate")) {
        next.override_ = with_key(&next.override_, id, None);
    }
    for id in state.island_override.keys().filter(|id| field_changed(previous, config, id, "island")) {
        next.island_override = with_key(&next.island_override, id, None);
    }
    for id in state.dim.keys().filter(|id| find_profile(config, &Value::String((*id).clone())).is_none()) {
        next.dim = with_key(&next.dim, id, None);
    }
    for id in state.dim_level.keys().filter(|id| find_profile(config, &Value::String((*id).clone())).is_none()) {
        next.dim_level = with_key(&next.dim_level, id, None);
    }
    (next != *state).then_some(next)
}

/* ---------------- what clients see ---------------- */

/// What clients see: per profile its page, rotation, dim level, island and reload counter, plus the override, the
/// shown profile, the active alerts, the alert mute, the global reload counter and the open kiosks (oldest first).
pub fn public_state(state: &State, config: &Value) -> Value {
    let mut profiles = Dict::new();
    for id in profiles_of(config).iter().filter_map(|p| p.get("id")).filter(|id| truthy(id)) {
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
    let kiosks: Vec<Value> = state.kiosks.iter().map(|(id, k)| public_kiosk(state, config, id, k)).collect();
    json!({
        "profile": state.profile, "shown": state.shown, "profiles": profiles, "alerts": state.alerts,
        "mutedUntil": opt_num(state.muted_until), "reload": num(state.reload), "kiosks": kiosks,
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
    json!({ "id": id, "profile": kiosk.profile, "page": page, "address": opt_str(&kiosk.address), "since": num(kiosk.since) })
}

/// The durable part, as saved to control.json.
pub(crate) fn durable(state: &State) -> Value {
    json!({
        "profile": state.profile, "pages": state.pages, "override": state.override_, "mutedUntil": opt_num(state.muted_until),
        "dim": state.dim, "dimLevel": state.dim_level, "islandOverride": state.island_override,
    })
}

/// The state saved in `text` (control.json), or the empty one when it is not JSON.
pub fn load(text: Option<&str>, now: f64) -> State {
    let Some(raw) = text.and_then(parse_json) else {
        return State::default();
    };
    // JSON `null` is the one value Node throws on (`raw.profile`), which gives the empty state too.
    let dict = |key: &str| raw.get(key).and_then(Value::as_object).cloned().unwrap_or_default();
    let pick = |key: &str, ok: &dyn Fn(&Value) -> bool| -> Dict { dict(key).into_iter().filter(|(_, v)| ok(v)).collect() };
    let muted = raw.get("mutedUntil").and_then(Value::as_f64).filter(|m| *m > now && *m <= now + MUTE_MAX_MINUTES * 60_000.0);
    State {
        profile: raw.get("profile").filter(|p| p.is_string()).cloned().unwrap_or(Value::Null),
        pages: dict("pages"),
        override_: dict("override"),
        muted_until: muted,
        dim: pick("dim", &valid_dim),
        dim_level: pick("dimLevel", &valid_dim),
        island_override: pick("islandOverride", &|v| matches!(v.as_str(), Some("on" | "off"))),
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
        assert_eq!(stringify(&Value::Object(with_key(&obj, "b", Some(json!(9))))), r#"{"b":9,"a":2,"c":3}"#);
        assert_eq!(stringify(&Value::Object(with_key(&obj, "b", None))), r#"{"a":2,"c":3}"#);
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
        assert_eq!(stringify(&Value::Object(s.island_override)), r#"{"strip":"off"}"#);
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
        assert_eq!(stringify(&Value::Object(next.dim.clone())), r#"{"desk":0.3}"#);
        assert!(next.dim_level.is_empty());
        assert!(reduce_config(&next, &after, &after).is_none());
    }
}
