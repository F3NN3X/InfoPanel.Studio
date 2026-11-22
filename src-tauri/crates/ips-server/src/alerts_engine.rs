// The alert engine (server/alerts.mjs `evaluate`, `act`, `quieten`): rules and readings in, active alerts, history and
// events for the outputs out, with the clock passed in. Runtime state, not config; the live wrapper is alerts.rs.

use std::collections::HashMap;

use serde_json::{json, Map, Number, Value};

use crate::alerts_rules::{
    change_key, clears, conditions_of, fill, finite, fmt_number, get, get_in, holds, is_object, is_quiet, is_sensor_rule, numeric, readout,
    rules_of, sensor_name, text_of, Last, Vars, NOTIFICATION_KEY,
};
use crate::ical::LocalZone;
use crate::js;

pub const HISTORY_MAX: usize = 200;
/// How long a test with Show for 0 stays, ms: it holds its rule's place, so it can't wait for an acknowledgement forever.
const TEST_LIFE_MS: f64 = 30_000.0;

/// `{ [key]: reading }`, the latest Data API entries.
pub type Readings = Map<String, Value>;

/// A JSON number (null for NaN or infinity, as `JSON.stringify` writes them).
pub fn num(n: f64) -> Value {
    Number::from_f64(n).map_or(Value::Null, Value::Number)
}

/// What one pass runs at: the clock, the zone quiet hours are read in, and whether alerts are muted.
#[derive(Clone, Copy)]
pub struct Env {
    pub now: f64,
    pub muted: bool,
    pub zone: LocalZone,
}

/// A condition's runtime in a sensor rule, matched by its index in the rule.
#[derive(Debug, Clone, Default)]
pub struct CondState {
    pub seeded: bool,
    pub last: Option<Last>,
    pub seen: bool,
    pub on: bool,
    pub since: Option<f64>,
}

/// A rule's runtime. `active` is the instance id of its open level alert.
#[derive(Debug, Clone, Default)]
pub struct RuleState {
    pub conds: Vec<CondState>,
    pub active: Option<String>,
    pub dismissed: bool,
    pub cleared_at: Option<f64>,
    pub seeded: bool,
    pub last_id: Option<String>,
}

/// An open alert: what clients see, with its expiry kept beside it.
#[derive(Debug, Clone)]
pub struct Entry {
    pub alert: Value,
    pub one_shot: bool,
    pub expires_at: Option<f64>,
}

impl Entry {
    fn id(&self) -> &str {
        self.alert["id"].as_str().unwrap_or_default()
    }

    fn is_test(&self) -> bool {
        self.alert.get("test").is_some()
    }

    fn rule_id(&self) -> &str {
        self.alert["ruleId"].as_str().unwrap_or_default()
    }
}

#[derive(Debug, Clone, Default)]
pub struct AlertsState {
    pub rules: HashMap<String, RuleState>,
    pub active: Vec<Entry>,
    pub history: Vec<Value>,
    pub seq: u64,
    /// Bumped whenever the history changes, so the writer knows what is unsaved.
    pub history_rev: u64,
    /// The running server (`Alerts::start`): a test replaces what its rule shows, an alert follows its rule's display, and a
    /// history row carries the value, the style and the screens. Off in the frozen parity runs, which pin the Node server's shape.
    pub live: bool,
}

impl AlertsState {
    pub fn with_history(history: Vec<Value>) -> Self {
        Self { history, ..Self::default() }
    }

    /// The alerts clients see.
    pub fn active_alerts(&self) -> Vec<Value> {
        self.active.iter().map(|e| e.alert.clone()).collect()
    }

    fn patch(&mut self, id: &str, f: impl FnOnce(&mut RuleState)) {
        f(self.rules.entry(id.to_string()).or_default());
    }

    fn touch_history(&mut self, f: impl FnOnce(&mut Vec<Value>)) {
        f(&mut self.history);
        self.history_rev += 1;
    }
}

/// What the outputs run on: a started or an ended alert.
#[derive(Debug, Clone)]
pub enum Event {
    Fire(Value),
    Clear { alert: Value, reason: &'static str },
}

impl Event {
    pub fn to_json(&self) -> Value {
        match self {
            Self::Fire(alert) => json!({ "type": "fire", "alert": alert }),
            Self::Clear { alert, reason } => json!({ "type": "clear", "alert": alert, "reason": reason }),
        }
    }
}

/// A sensor condition that fired, with its reading.
#[derive(Clone, Copy)]
struct Hit<'a> {
    cond: &'a Value,
    reading: Option<&'a Value>,
}

fn cond_key(cond: &Value) -> &str {
    cond["key"].as_str().unwrap_or_default()
}

/* ---------------- state transitions ---------------- */

struct Start<'a> {
    rule: &'a Value,
    alerts: Option<&'a Value>,
    env: Env,
    hits: &'a [Hit<'a>],
    notification: Option<&'a Value>,
    one_shot: bool,
    test: bool,
}

/// The display settings: the defaults, then the alerts' defaults, then the rule's (strings for the four, a number of seconds).
fn display_of(rule: &Value, alerts: Option<&Value>) -> Value {
    let defaults = get_in(alerts, "defaults");
    let own = get_in(get(rule, "outputs"), "display");
    let mut display = json!({ "style": "toast", "position": "top-right", "backdrop": "none", "size": "m", "seconds": 8 });
    for source in [defaults, own].into_iter().flatten().filter(|d| is_object(d)) {
        for key in ["style", "position", "backdrop", "size"] {
            if let Some(v) = get(source, key).filter(|v| v.is_string()) {
                display[key] = v.clone();
            }
        }
    }
    let seconds = [get_in(own, "seconds"), get_in(defaults, "seconds")].into_iter().find(|s| finite(*s).is_some()).flatten();
    if let Some(seconds) = seconds {
        display["seconds"] = seconds.clone();
    }
    // Auto picks by severity; the screen's island decides on the kiosk (from-alerts.ts). Info is the quiet one.
    if display["style"] == "auto" && get(rule, "severity").and_then(Value::as_str) == Some("info") {
        display["size"] = json!("s");
    }
    display
}

/// The text template; `None` for a rule with several conditions, whose text names the sensors that fired.
fn template_of(rule: &Value, hits: &[Hit]) -> Option<String> {
    let custom =
        get_in(get_in(Some(rule), "outputs"), "display").and_then(|d| get(d, "text")).and_then(Value::as_str).filter(|t| !t.is_empty());
    if let Some(custom) = custom {
        return Some(custom.to_string());
    }
    if !is_sensor_rule(rule) {
        return Some("{title}\n{body}".into()); // the source app is the alert's title
    }
    if conditions_of(&rule["source"]).len() > 1 {
        return None;
    }
    let missing = hits.first().is_some_and(|h| get(h.cond, "op").and_then(Value::as_str) == Some("missing"));
    Some(if missing { "Stopped reporting" } else { "{value}{unit}" }.into())
}

fn string_of(v: Option<&Value>) -> String {
    match v {
        None | Some(Value::Null) => String::new(),
        v => js::to_property_key(v),
    }
}

fn highlight_of(rule: &Value, hits: &[Hit], display: &Value) -> Option<Value> {
    let highlight = get_in(get(rule, "outputs"), "highlight").filter(|h| is_object(h));
    // Auto rings the widgets of a critical alert without being asked.
    let auto = display["style"] == "auto" && get(rule, "severity").and_then(Value::as_str) == Some("critical");
    if highlight.is_none() && !auto {
        return None;
    }
    let mut out = Map::new();
    if let Some(zones) = highlight.and_then(|h| get(h, "zones")).filter(|z| z.as_array().is_some_and(|a| !a.is_empty())) {
        out.insert("zones".into(), zones.clone());
    }
    if let (true, Some(hit)) = (is_sensor_rule(rule), hits.first()) {
        out.insert("key".into(), hit.cond["key"].clone());
    }
    Some(Value::Object(out))
}

/// Open an alert instance. `hits` are the sensor conditions that fired. `one_shot` ones expire after the display seconds
/// (0 = when acknowledged).
fn start(s: &mut AlertsState, events: &mut Vec<Event>, p: Start) -> String {
    let Start { rule, alerts, env, hits, notification, one_shot, test } = p;
    let now = env.now;
    let display = display_of(rule, alerts);
    let sensor = is_sensor_rule(rule);
    let reading = hits.first().and_then(|h| h.reading);
    let value: Option<Value> = if sensor { numeric(reading).map(num).or_else(|| text_of(reading).map(Value::String)) } else { None };
    let unit = if sensor { Some(get_in(reading, "unit").filter(|u| !u.is_null()).cloned().unwrap_or_else(|| json!(""))) } else { None };
    let name = get(rule, "name").filter(|n| !n.is_null()).unwrap_or(&rule["id"]).clone();
    let vars = Vars {
        name: js::to_property_key(Some(&name)),
        value: match &value {
            Some(Value::Number(n)) => fmt_number(n.as_f64().unwrap_or(f64::NAN)),
            other => string_of(other.as_ref()),
        },
        unit: string_of(unit.as_ref()),
        sensor: hits.first().map(|h| sensor_name(h.cond, h.reading)).unwrap_or_default(),
        app: notification.map(|n| string_of(get(n, "app"))).unwrap_or_default(),
        title: notification.map(|n| string_of(get(n, "title"))).unwrap_or_default(),
        body: notification.map(|n| string_of(get(n, "body"))).unwrap_or_default(),
    };
    let quiet = !test && (env.muted || is_quiet(get_in(alerts, "quietHours"), get(rule, "severity"), now, env.zone));

    s.seq += 1;
    let id = format!("{}-{}", base36(now as u64), s.seq);
    if s.live {
        // A test takes the place of whatever its rule shows; a real alert takes the place of a test.
        let rule_id = rule["id"].as_str().unwrap_or_default();
        let replaced: Vec<String> =
            s.active.iter().filter(|e| e.rule_id() == rule_id && (test || e.is_test())).map(|e| e.id().to_string()).collect();
        for old in &replaced {
            end(s, events, old, now, false, "replaced");
        }
        s.touch_history(|history| {
            for h in history.iter_mut().filter(|h| h["id"].as_str().is_some_and(|i| replaced.iter().any(|old| old == i))) {
                h["replacedBy"] = json!(id);
            }
        });
    }
    let severity =
        ["info", "warning", "critical"].into_iter().find(|s| get(rule, "severity").and_then(Value::as_str) == Some(s)).unwrap_or("warning");
    let text = match template_of(rule, hits) {
        Some(template) => fill(&template, &vars),
        None => {
            hits.iter().map(|h| format!("{} {}", sensor_name(h.cond, h.reading), readout(h.cond, h.reading))).collect::<Vec<_>>().join(", ")
        }
    };
    let text = js::trim(&text).to_string();
    let mut alert = Map::new();
    alert.insert("id".into(), json!(id));
    alert.insert("ruleId".into(), rule["id"].clone());
    alert.insert("name".into(), name.clone());
    alert.insert("title".into(), if notification.is_some() && !vars.app.is_empty() { json!(vars.app) } else { name.clone() });
    alert.insert("severity".into(), json!(severity));
    alert.insert("text".into(), json!(text));
    if let Some(value) = value {
        alert.insert("value".into(), value);
    }
    if let Some(unit) = unit.filter(|u| u != &json!("")) {
        alert.insert("unit".into(), unit);
    }
    if notification.is_some() {
        alert.insert("app".into(), json!(vars.app));
    }
    alert.insert("startedAt".into(), num(now));
    alert.insert("acknowledged".into(), json!(false));
    alert.insert("display".into(), display.clone());
    if let Some(page) = get_in(get(rule, "outputs"), "page").filter(|p| is_object(p) && get(p, "page").is_some_and(Value::is_string)) {
        alert.insert("page".into(), page.clone());
    }
    if let Some(highlight) = highlight_of(rule, hits, &display) {
        alert.insert("highlight".into(), highlight);
    }
    if let Some(profiles) = get(rule, "profiles").filter(|p| p.as_array().is_some_and(|a| !a.is_empty())) {
        alert.insert("profiles".into(), profiles.clone());
    }
    if test {
        alert.insert("test".into(), json!(true));
    }
    if quiet {
        alert.insert("quiet".into(), json!(true));
    }
    let mut alert = Value::Object(alert);
    let seconds = display["seconds"].as_f64().unwrap_or(0.0);
    let life = if s.live && test && seconds <= 0.0 { TEST_LIFE_MS } else { seconds * 1000.0 };
    let mut expires_at = (one_shot && life > 0.0).then_some(now + life);
    if let (true, Some(_)) = (s.live, expires_at) {
        // The clock of a queued alert starts when the ones ahead of it are done; the kiosk's countdown starts there too.
        let from = queue_end(s, &alert, now);
        if from > now {
            alert["queuedMs"] = num(from - now);
            expires_at = Some(from + life);
        }
    }
    s.active.push(Entry { alert: alert.clone(), one_shot, expires_at });
    let mut entry = Map::new();
    for (key, value) in [
        ("id", &alert["id"]),
        ("ruleId", &alert["ruleId"]),
        ("name", &alert["name"]),
        ("severity", &alert["severity"]),
        ("text", &alert["text"]),
        ("startedAt", &alert["startedAt"]),
    ] {
        entry.insert(key.into(), value.clone());
    }
    for (flag, on) in [("test", test), ("quiet", quiet)] {
        if on {
            entry.insert(flag.into(), json!(true));
        }
    }
    if s.live {
        entry.insert("shownAs".into(), display["style"].clone());
        for key in ["value", "unit", "profiles"] {
            if let Some(v) = alert.get(key) {
                entry.insert(key.into(), v.clone());
            }
        }
    }
    s.touch_history(|h| {
        h.insert(0, Value::Object(entry));
        h.truncate(HISTORY_MAX);
    });
    events.push(Event::Fire(alert));
    id
}

/// Whether a kiosk shows this alert in its one-at-a-time queue: overlays stand apart, quiet and acknowledged ones don't show.
fn queues(alert: &Value) -> bool {
    alert["display"]["style"] != "overlay" && alert.get("quiet").is_none() && alert["acknowledged"] != json!(true)
}

/// Whether two alerts can land on one screen (no `profiles` = every screen).
fn share_screen(a: &Value, b: &Value) -> bool {
    match (a["profiles"].as_array(), b["profiles"].as_array()) {
        (Some(a), Some(b)) => a.iter().any(|p| b.contains(p)),
        _ => true,
    }
}

/// When the timed one-shots ahead of `alert` on its screens are done, so its own time starts when it can show.
fn queue_end(s: &AlertsState, alert: &Value, now: f64) -> f64 {
    if !queues(alert) {
        return now;
    }
    let ahead = s.active.iter().filter(|e| queues(&e.alert) && share_screen(&e.alert, alert));
    ahead.filter_map(|e| e.expires_at).fold(now, f64::max)
}

fn base36(mut n: u64) -> String {
    if n == 0 {
        return "0".into();
    }
    let mut digits = vec![];
    while n > 0 {
        digits.push(char::from_digit((n % 36) as u32, 36).unwrap_or('0'));
        n /= 36;
    }
    digits.iter().rev().collect()
}

/// Close an instance: out of the active list, into the history, and the rule's runtime reset.
fn end(s: &mut AlertsState, events: &mut Vec<Event>, id: &str, now: f64, dismissed: bool, reason: &'static str) {
    let Some(at) = s.active.iter().position(|e| e.id() == id) else { return };
    let entry = s.active.remove(at);
    s.touch_history(|history| {
        for h in history.iter_mut().filter(|h| h["id"].as_str() == Some(id)) {
            if let Some(map) = h.as_object_mut() {
                map.insert("endedAt".into(), num(now));
                if dismissed {
                    map.insert("dismissed".into(), json!(true));
                }
            }
        }
    });
    if !entry.is_test() {
        let owns = s.rules.get(entry.rule_id()).and_then(|rs| rs.active.as_deref()) == Some(id);
        s.patch(entry.rule_id(), |rs| {
            // A replaced alert did not clear: the wait before firing again has not started.
            if reason != "replaced" {
                rs.cleared_at = Some(now);
            }
            if owns {
                rs.active = None;
                rs.dismissed |= dismissed;
            }
        });
    }
    events.push(Event::Clear { alert: entry.alert, reason: if dismissed { "dismissed" } else { reason } });
}

/// No refire within the cooldown after a clear (and, for one-shots, while one is still showing).
fn blocked(s: &AlertsState, rule: &Value, now: f64) -> bool {
    let cooldown = finite(get(rule, "cooldownSeconds")).map_or(0.0, |c| c * 1000.0);
    if cooldown <= 0.0 {
        return false;
    }
    let id = rule["id"].as_str().unwrap_or_default();
    if s.active.iter().any(|e| !e.is_test() && e.rule_id() == id && e.one_shot) {
        return true;
    }
    s.rules.get(id).and_then(|rs| rs.cleared_at).is_some_and(|cleared| now - cleared < cooldown)
}

/* ---------------- evaluate ---------------- */

fn parse_notification(reading: Option<&Value>) -> Option<Value> {
    let text = match get_in(reading, "text") {
        None | Some(Value::Null) => String::new(),
        Some(v) => js::to_property_key(Some(v)),
    };
    let n = crate::json::parse(&text)?;
    (is_object(&n) && get(&n, "id").is_some_and(|id| !id.is_null())).then_some(n)
}

fn lower(list: Option<&Value>) -> Vec<String> {
    list.and_then(Value::as_array).map(|a| a.iter().filter_map(Value::as_str).map(str::to_lowercase).collect()).unwrap_or_default()
}

/// Whether a notification passes a rule's `apps` (include), `exclude` and `match` filters.
fn passes(source: &Value, n: &Value) -> bool {
    let app = string_of(get(n, "app")).to_lowercase();
    let apps = lower(get(source, "apps"));
    if !apps.is_empty() && !apps.contains(&app) {
        return false;
    }
    if lower(get(source, "exclude")).contains(&app) {
        return false;
    }
    match get(source, "match").and_then(Value::as_str).filter(|m| !m.is_empty()) {
        Some(m) => format!("{} {}", string_of(get(n, "title")), string_of(get(n, "body"))).to_lowercase().contains(&m.to_lowercase()),
        None => true,
    }
}

/// One evaluation pass over `alerts` (the stored `config.alerts`) and the latest readings. Sensor rules fire after the
/// condition has held `forSeconds`, clear per `clears`, and refire only after `cooldownSeconds`. `changes`, notification
/// and test alerts are one-shots that expire after the display seconds (0 = until acknowledged). Disabled rules, and
/// everything while `alerts.enabled === false`, fire nothing and clear what is active. While muted, every new alert is quiet.
pub fn evaluate(s: &mut AlertsState, alerts: Option<&Value>, readings: &Readings, env: Env) -> Vec<Event> {
    let mut events = vec![];
    let enabled = get_in(alerts, "enabled") != Some(&Value::Bool(false));
    let mut live: Vec<(&str, &Value)> = vec![];
    for rule in rules_of(alerts).into_iter().filter(|r| enabled && get(r, "enabled") != Some(&Value::Bool(false))) {
        let id = rule["id"].as_str().unwrap_or_default();
        match live.iter_mut().find(|(known, _)| *known == id) {
            Some(slot) => slot.1 = rule,
            None => live.push((id, rule)),
        }
    }
    let gone: Vec<String> =
        s.active.iter().filter(|e| !e.is_test() && !live.iter().any(|(id, _)| *id == e.rule_id())).map(|e| e.id().to_string()).collect();
    for id in gone {
        end(s, &mut events, &id, env.now, false, "cleared");
    }
    let expired: Vec<String> =
        s.active.iter().filter(|e| e.expires_at.is_some_and(|at| env.now >= at)).map(|e| e.id().to_string()).collect();
    for id in expired {
        end(s, &mut events, &id, env.now, false, "expired");
    }
    for (_, rule) in live {
        if is_sensor_rule(rule) {
            sensor_pass(s, &mut events, alerts, rule, readings, env);
        } else {
            notification_pass(s, &mut events, alerts, rule, readings, env);
        }
    }
    events
}

fn notification_pass(s: &mut AlertsState, events: &mut Vec<Event>, alerts: Option<&Value>, rule: &Value, readings: &Readings, env: Env) {
    let id = rule["id"].as_str().unwrap_or_default();
    let rs = s.rules.get(id).cloned().unwrap_or_default();
    let n = parse_notification(readings.get(NOTIFICATION_KEY));
    let n_id = n.as_ref().map(|n| js::to_property_key(get(n, "id")));
    if let Some(n) = &n {
        if rs.seeded && n_id != rs.last_id && passes(&rule["source"], n) && !blocked(s, rule, env.now) {
            start(s, events, Start { rule, alerts, env, hits: &[], notification: Some(n), one_shot: true, test: false });
        }
    }
    // Baseline the latest notification once data has arrived, so an old one never fires.
    if n.is_some() || !readings.is_empty() {
        s.patch(id, |rs| {
            rs.seeded = true;
            if n_id.is_some() {
                rs.last_id = n_id;
            }
        });
    }
}

/// A condition's pass: its runtime updated, and whether it holds / is unknown / a level one.
struct Pass<'a> {
    states: Vec<CondState>,
    changed: Vec<Hit<'a>>,
    met: Vec<Hit<'a>>,
    level: Vec<usize>,
    holding: bool,
    unknown: bool,
}

fn condition_pass<'a>(conds: &[&'a Value], rs: &RuleState, readings: &'a Readings, for_ms: f64, now: f64) -> Pass<'a> {
    let mut pass = Pass {
        states: conds.iter().enumerate().map(|(i, _)| rs.conds.get(i).cloned().unwrap_or_default()).collect(),
        changed: vec![],
        met: vec![],
        level: vec![],
        holding: false,
        unknown: false,
    };
    for (i, &cond) in conds.iter().enumerate() {
        let reading = readings.get(cond_key(cond));
        let st = &mut pass.states[i];
        let op = get(cond, "op").and_then(Value::as_str);
        if op == Some("changes") {
            let Some(current) = change_key(reading) else { continue };
            if st.seeded && st.last.as_ref().is_some_and(|last| *last != current) {
                pass.changed.push(Hit { cond, reading });
            }
            st.seeded = true;
            st.last = Some(current);
            continue;
        }
        pass.level.push(i);
        let holds_now = if op == Some("missing") {
            st.seen |= reading.is_some();
            Some(reading.is_none() && st.seen)
        } else {
            holds(cond, reading)
        };
        let Some(holds_now) = holds_now else {
            pass.unknown = true;
            continue;
        };
        st.on = if st.on { !clears(cond, reading, holds_now) } else { holds_now };
        if holds_now {
            pass.holding = true;
            let since = *st.since.get_or_insert(now);
            if now - since >= for_ms {
                pass.met.push(Hit { cond, reading });
            }
        } else {
            st.since = None;
        }
    }
    pass
}

/// A sensor rule's pass over its conditions, each with its own timing. The rule fires once any level condition (everything
/// but `changes`) has held `forSeconds`, naming those that did, and clears when none is still on. A `missing` condition holds
/// while its key is absent, but only after the rule has seen the key. A `changes` condition is a one-shot on its own. A
/// dismissed alert waits for every condition to stop holding before it can fire again.
fn sensor_pass(s: &mut AlertsState, events: &mut Vec<Event>, alerts: Option<&Value>, rule: &Value, readings: &Readings, env: Env) {
    let id = rule["id"].as_str().unwrap_or_default();
    let rs = s.rules.get(id).cloned().unwrap_or_default();
    let conds = conditions_of(&rule["source"]);
    let for_ms = finite(get_in(get(rule, "source"), "forSeconds")).unwrap_or(0.0) * 1000.0;
    let pass = condition_pass(&conds, &rs, readings, for_ms, env.now);
    let any_on = pass.level.iter().any(|&i| pass.states[i].on);
    let has_level = !pass.level.is_empty();
    let (holding, unknown) = (pass.holding, pass.unknown);
    s.patch(id, |r| r.conds = pass.states);

    let active_id = rs.active.as_deref().filter(|a| s.active.iter().any(|e| e.id() == *a)).map(str::to_string);
    if let Some(active) = active_id {
        // A test holding the rule's place runs out on its own: its rule may not be firing at all.
        let testing = s.active.iter().any(|e| e.id() == active && e.is_test());
        if has_level && !any_on && !testing {
            end(s, events, &active, env.now, false, "cleared");
        }
    } else if !holding {
        if !unknown && rs.dismissed {
            s.patch(id, |r| r.dismissed = false);
        }
    } else if !rs.dismissed && !pass.met.is_empty() && !blocked(s, rule, env.now) {
        let started = start(s, events, Start { rule, alerts, env, hits: &pass.met, notification: None, one_shot: false, test: false });
        s.patch(id, |r| r.active = Some(started));
    }
    if !pass.changed.is_empty() && !blocked(s, rule, env.now) {
        start(s, events, Start { rule, alerts, env, hits: &pass.changed, notification: None, one_shot: true, test: false });
    }
}

/* ---------------- act, quieten ---------------- */

/// A test shows the conditions with a reading (the first one when none has).
fn test_hits<'a>(rule: &'a Value, readings: &'a Readings) -> Vec<Hit<'a>> {
    let all: Vec<Hit> =
        conditions_of(&rule["source"]).into_iter().map(|cond| Hit { cond, reading: readings.get(cond_key(cond)) }).collect();
    let live: Vec<Hit> = all.iter().copied().filter(|h| h.reading.is_some()).collect();
    if live.is_empty() {
        all.into_iter().take(1).collect()
    } else {
        live
    }
}

fn test_notification() -> Value {
    json!({ "app": "Test", "title": "Test notification", "body": "" })
}

/// Apply a client action: `{ id, action: "ack" | "dismiss" }` or `{ ruleId, action: "test" }`. Acknowledge hides the
/// alert on kiosks until it clears (a one-shot that stays until acknowledged ends); dismiss removes it now; test fires a
/// one-shot of the rule's output, and on the live server it holds the rule's place while it shows. The events, or the error text.
pub fn act(s: &mut AlertsState, action: &Value, alerts: Option<&Value>, readings: &Readings, env: Env) -> Result<Vec<Event>, &'static str> {
    let mut events = vec![];
    let kind = get(action, "action").and_then(Value::as_str);
    if kind == Some("test") {
        let wanted = get(action, "ruleId");
        let rule = rules_of(alerts).into_iter().find(|r| wanted.is_some() && get(r, "id") == wanted).ok_or("unknown rule")?;
        let sensor = is_sensor_rule(rule);
        let hits = if sensor { test_hits(rule, readings) } else { vec![] };
        let notification = (!sensor).then(test_notification);
        let started = start(
            s,
            &mut events,
            Start { rule, alerts, env, hits: &hits, notification: notification.as_ref(), one_shot: true, test: true },
        );
        if s.live {
            s.patch(rule["id"].as_str().unwrap_or_default(), |r| r.active = Some(started));
        }
        return Ok(events);
    }
    if kind != Some("ack") && kind != Some("dismiss") {
        return Err("unknown action");
    }
    let wanted = get(action, "id");
    let entry = s.active.iter().find(|e| wanted.is_some() && Some(&e.alert["id"]) == wanted).cloned().ok_or("unknown alert")?;
    let id = entry.id().to_string();
    if kind == Some("dismiss") {
        end(s, &mut events, &id, env.now, true, "cleared");
        return Ok(events);
    }
    if entry.alert["acknowledged"] != json!(true) {
        for e in s.active.iter_mut().filter(|e| e.id() == id) {
            e.alert["acknowledged"] = json!(true);
        }
        s.touch_history(|history| {
            for h in history.iter_mut().filter(|h| h["id"].as_str() == Some(id.as_str())) {
                if let Some(map) = h.as_object_mut() {
                    map.insert("acknowledgedAt".into(), num(env.now));
                }
            }
        });
        if entry.one_shot && entry.expires_at.is_none() {
            end(s, &mut events, &id, env.now, false, "cleared");
        }
    }
    Ok(events)
}

/// The rules were saved: an alert already showing takes its rule's display and highlight now (B1), keeping its expiry. A rule
/// that was switched from a toast to the island moves there instead of showing beside the next alert.
pub fn reroute(s: &mut AlertsState, alerts: Option<&Value>) {
    let rules = rules_of(alerts);
    let mut moved: Vec<(String, Value)> = vec![];
    for e in &mut s.active {
        let Some(rule) = rules.iter().rev().find(|r| r["id"].as_str() == Some(e.rule_id())) else { continue };
        let display = display_of(rule, alerts);
        let conds = if is_sensor_rule(rule) { conditions_of(&rule["source"]) } else { vec![] };
        let fired = conds.iter().find(|c| e.alert["highlight"]["key"].as_str() == Some(cond_key(c))).or(conds.first());
        let hits: Vec<Hit> = fired.map(|&cond| Hit { cond, reading: None }).into_iter().collect();
        let highlight = highlight_of(rule, &hits, &display);
        if e.alert.get("highlight") != highlight.as_ref() {
            match highlight {
                Some(highlight) => e.alert["highlight"] = highlight,
                None => {
                    e.alert.as_object_mut().map(|a| a.remove("highlight"));
                }
            }
        }
        if e.alert["display"] != display {
            moved.push((e.id().to_string(), display["style"].clone()));
            e.alert["display"] = display;
        }
    }
    if moved.is_empty() {
        return;
    }
    s.touch_history(|history| {
        for (id, style) in &moved {
            for h in history.iter_mut().filter(|h| h["id"].as_str() == Some(id.as_str())) {
                h["shownAs"] = style.clone();
            }
        }
    });
}

/// Mark every active alert (tests excepted) quiet, in the history too.
pub fn quieten(s: &mut AlertsState) {
    let ids: Vec<String> = s.active.iter().filter(|e| !e.is_test() && e.alert.get("quiet").is_none()).map(|e| e.id().to_string()).collect();
    if ids.is_empty() {
        return;
    }
    for e in s.active.iter_mut().filter(|e| ids.iter().any(|id| id == e.id())) {
        e.alert["quiet"] = json!(true);
    }
    s.touch_history(|history| {
        for h in history.iter_mut().filter(|h| h["id"].as_str().is_some_and(|id| ids.iter().any(|i| i == id))) {
            h["quiet"] = json!(true);
        }
    });
}

impl AlertsState {
    /// The state as the parity fixtures compare it: what is open and the history.
    pub fn to_json(&self) -> Value {
        let entry = |e: &Entry| {
            let mut entry = json!({ "alert": e.alert, "oneShot": e.one_shot });
            if let Some(at) = e.expires_at {
                entry["expiresAt"] = num(at);
            }
            entry
        };
        let active: Vec<Value> = self.active.iter().map(entry).collect();
        json!({ "active": active, "history": self.history })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const AT: f64 = 1_000_000.0;

    fn env(now: f64) -> Env {
        Env { now, muted: false, zone: LocalZone::System }
    }

    fn sensor_rule(style: &str, severity: &str, seconds: u32) -> Value {
        json!({
            "id": "r", "name": "GPU temp", "enabled": true, "severity": severity, "cooldownSeconds": 60,
            "source": { "kind": "sensor", "conditions": [{ "key": "gpu.temp", "op": ">", "value": 80 }], "forSeconds": 0 },
            "outputs": { "display": { "style": style, "seconds": seconds } },
        })
    }

    fn rules(rule: Value) -> Value {
        json!({ "enabled": true, "rules": [rule] })
    }

    fn reading(value: i32) -> Readings {
        json!({ "gpu.temp": { "value": value, "unit": "°C" } }).as_object().unwrap().clone()
    }

    fn live() -> AlertsState {
        AlertsState { live: true, ..AlertsState::default() }
    }

    fn test_action() -> Value {
        json!({ "action": "test", "ruleId": "r" })
    }

    #[test]
    fn a_test_replaces_the_rules_live_alert_and_the_rule_refires_when_the_test_ends() {
        let alerts = rules(sensor_rule("toast", "critical", 8));
        let hot = reading(90);
        let mut s = live();
        evaluate(&mut s, Some(&alerts), &hot, env(AT));
        let real = s.active[0].id().to_string();

        let events = act(&mut s, &test_action(), Some(&alerts), &hot, env(AT + 1000.0)).unwrap();
        assert_eq!(s.active.len(), 1);
        assert!(s.active[0].is_test());
        assert!(matches!(&events[0], Event::Clear { reason: "replaced", .. }));
        let row = s.history.iter().find(|h| h["id"] == real.as_str()).unwrap();
        assert_eq!((&row["replacedBy"], &row["shownAs"]), (&s.active[0].alert["id"], &json!("toast")));
        assert_eq!(row["value"].as_f64(), Some(90.0));

        // While the test shows the condition still holds: nothing fires beside it.
        assert!(evaluate(&mut s, Some(&alerts), &hot, env(AT + 2000.0)).is_empty());
        // It runs out and the alert is back, with no cooldown charged for the replacement.
        evaluate(&mut s, Some(&alerts), &hot, env(AT + 9000.0));
        assert_eq!(s.active.len(), 1);
        assert!(!s.active[0].is_test());
    }

    #[test]
    fn a_test_of_a_rule_that_is_not_firing_stays_for_its_seconds() {
        let alerts = rules(sensor_rule("toast", "warning", 8));
        let cold = reading(40);
        let mut s = live();
        evaluate(&mut s, Some(&alerts), &cold, env(AT));
        act(&mut s, &test_action(), Some(&alerts), &cold, env(AT)).unwrap();
        evaluate(&mut s, Some(&alerts), &cold, env(AT + 1000.0));
        assert_eq!(s.active.len(), 1);
        evaluate(&mut s, Some(&alerts), &cold, env(AT + 8000.0));
        assert!(s.active.is_empty());
    }

    #[test]
    fn a_second_test_replaces_the_first_and_a_real_notification_replaces_a_test() {
        let rule = json!({ "id": "r", "enabled": true, "severity": "info", "cooldownSeconds": 0, "source": { "kind": "notification" }, "outputs": {} });
        let alerts = rules(rule);
        let mut s = live();
        let none = Readings::new();
        act(&mut s, &test_action(), Some(&alerts), &none, env(AT)).unwrap();
        act(&mut s, &test_action(), Some(&alerts), &none, env(AT + 1000.0)).unwrap();
        assert_eq!(s.active.len(), 1);
        let note = |id: u32| {
            let mut readings = Readings::new();
            readings.insert(NOTIFICATION_KEY.into(), json!({ "text": json!({ "id": id, "app": "Mail", "title": "t" }).to_string() }));
            readings
        };
        evaluate(&mut s, Some(&alerts), &note(1), env(AT + 2000.0));
        evaluate(&mut s, Some(&alerts), &note(2), env(AT + 3000.0));
        assert_eq!(s.active.len(), 1);
        assert!(!s.active[0].is_test());
        assert_eq!(s.history.iter().filter(|h| h["replacedBy"].is_string()).count(), 2);
    }

    #[test]
    fn a_saved_display_moves_an_alert_already_showing_and_keeps_its_expiry() {
        let hot = reading(90);
        let mut s = live();
        evaluate(&mut s, Some(&rules(sensor_rule("toast", "critical", 8))), &hot, env(AT));
        let island = rules(sensor_rule("island", "critical", 8));
        reroute(&mut s, Some(&island));
        assert_eq!(s.active[0].alert["display"]["style"], "island");
        assert_eq!(s.history[0]["shownAs"], "island");
        let rev = s.history_rev;
        reroute(&mut s, Some(&island));
        assert_eq!(s.history_rev, rev);
    }

    fn notification_rule(id: &str, profiles: &[&str]) -> Value {
        json!({ "id": id, "enabled": true, "severity": "info", "cooldownSeconds": 0, "source": { "kind": "notification" }, "profiles": profiles, "outputs": { "display": { "seconds": 8 } } })
    }

    fn note(id: u32) -> Readings {
        let mut readings = Readings::new();
        readings.insert(NOTIFICATION_KEY.into(), json!({ "text": json!({ "id": id, "app": "Mail", "title": "t" }).to_string() }));
        readings
    }

    #[test]
    fn two_one_shots_started_together_each_get_their_full_time_on_one_screen() {
        let alerts = json!({ "enabled": true, "rules": [notification_rule("a", &[]), notification_rule("b", &[])] });
        let mut s = live();
        evaluate(&mut s, Some(&alerts), &note(1), env(AT));
        evaluate(&mut s, Some(&alerts), &note(2), env(AT + 1000.0));
        assert_eq!(s.active.len(), 2);
        assert_eq!(s.active[1].alert["queuedMs"].as_f64(), Some(8000.0));
        evaluate(&mut s, Some(&alerts), &note(2), env(AT + 9000.0));
        assert_eq!(s.active.len(), 1);
        evaluate(&mut s, Some(&alerts), &note(2), env(AT + 16_900.0));
        assert_eq!(s.active.len(), 1);
        evaluate(&mut s, Some(&alerts), &note(2), env(AT + 17_000.0));
        assert!(s.active.is_empty());
    }

    #[test]
    fn one_shots_on_different_screens_do_not_wait_for_each_other() {
        let alerts = json!({ "enabled": true, "rules": [notification_rule("a", &["desk"]), notification_rule("b", &["bar"])] });
        let mut s = live();
        evaluate(&mut s, Some(&alerts), &note(1), env(AT));
        evaluate(&mut s, Some(&alerts), &note(2), env(AT + 1000.0));
        assert_eq!(s.active.iter().map(|e| e.expires_at).collect::<Vec<_>>(), [Some(AT + 9000.0), Some(AT + 9000.0)]);
        assert!(s.active[1].alert.get("queuedMs").is_none());
    }

    #[test]
    fn a_test_that_stays_until_acknowledged_lets_go_of_its_rule_after_thirty_seconds() {
        let alerts = rules(sensor_rule("toast", "critical", 0));
        let hot = reading(90);
        let mut s = live();
        evaluate(&mut s, Some(&alerts), &hot, env(AT));
        act(&mut s, &test_action(), Some(&alerts), &hot, env(AT + 1000.0)).unwrap();
        evaluate(&mut s, Some(&alerts), &hot, env(AT + 30_000.0));
        assert!(s.active[0].is_test());
        evaluate(&mut s, Some(&alerts), &hot, env(AT + 31_000.0));
        assert_eq!(s.active.len(), 1);
        assert!(!s.active[0].is_test());
    }

    #[test]
    fn a_saved_style_recomputes_the_highlight() {
        let hot = reading(90);
        let mut s = live();
        evaluate(&mut s, Some(&rules(sensor_rule("toast", "critical", 8))), &hot, env(AT));
        assert!(s.active[0].alert.get("highlight").is_none());
        reroute(&mut s, Some(&rules(sensor_rule("auto", "critical", 8))));
        assert_eq!(s.active[0].alert["highlight"], json!({ "key": "gpu.temp" }));
        reroute(&mut s, Some(&rules(sensor_rule("toast", "critical", 8))));
        assert!(s.active[0].alert.get("highlight").is_none());
    }

    #[test]
    fn auto_is_small_for_info_and_rings_the_widgets_for_critical() {
        let hot = reading(90);
        let alert = |severity: &str| {
            let mut s = AlertsState::default();
            evaluate(&mut s, Some(&rules(sensor_rule("auto", severity, 8))), &hot, env(AT));
            s.active[0].alert.clone()
        };
        let (info, warning, critical) = (alert("info"), alert("warning"), alert("critical"));
        assert_eq!((&info["display"]["style"], &info["display"]["size"]), (&json!("auto"), &json!("s")));
        assert_eq!(warning["display"]["size"], "m");
        assert!(warning.get("highlight").is_none());
        assert_eq!(critical["highlight"], json!({ "key": "gpu.temp" }));
    }
}
