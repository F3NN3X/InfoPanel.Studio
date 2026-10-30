// The alert rules' pure parts (server/alerts.mjs): which rules are usable and which Data API keys they need, how a
// reading is read as a number or text, whether a condition holds, the alert text, the quiet hours, and the SSE framing
// of the Data API stream. Rules and readings arrive as stored JSON, so they are read as tolerantly as the Node code does.

use chrono::{DateTime, Local, TimeZone, Timelike};
use serde_json::Value;

use crate::ical::LocalZone;
use crate::js;

/// The Notifications plugin (2.0+) publishes the newest Windows notification here as JSON.
pub const NOTIFICATION_KEY: &str = "plugins.InfoPanel.Notifications.windows.latest";

/// `obj[key]` of an object; `None` is `undefined` (also for anything that is not an object).
pub fn get<'a>(v: &'a Value, key: &str) -> Option<&'a Value> {
    v.as_object().and_then(|o| o.get(key))
}

/// `v?.[key]` along an optional chain.
pub fn get_in<'a>(v: Option<&'a Value>, key: &str) -> Option<&'a Value> {
    v.and_then(|v| get(v, key))
}

pub fn is_object(v: &Value) -> bool {
    v.is_object()
}

/// JavaScript truthiness of a JSON value.
pub fn truthy(v: Option<&Value>) -> bool {
    match v {
        None | Some(Value::Null) => false,
        Some(Value::Bool(b)) => *b,
        Some(Value::Number(n)) => n.as_f64().is_some_and(|n| n != 0.0),
        Some(Value::String(s)) => !s.is_empty(),
        Some(_) => true,
    }
}

/// `Number.isFinite(v)`: only a number counts, never a string that reads as one.
pub fn finite(v: Option<&Value>) -> Option<f64> {
    v.and_then(Value::as_f64).filter(|n| n.is_finite())
}

fn str_of(v: Option<&Value>) -> Option<&str> {
    v.and_then(Value::as_str)
}

/// A sensor source's conditions: its list, or the one key / op / value of a rule saved before v11.
pub fn conditions_of(source: &Value) -> Vec<&Value> {
    if let Some(list) = get(source, "conditions").and_then(Value::as_array) {
        return list
            .iter()
            .filter(|c| is_object(c) && get(c, "key").is_some_and(Value::is_string))
            .collect();
    }
    if get(source, "key").is_some_and(Value::is_string) {
        vec![source]
    } else {
        vec![]
    }
}

/// The usable rules of a stored `alerts` value.
pub fn rules_of(alerts: Option<&Value>) -> Vec<&Value> {
    let Some(list) = get_in(alerts, "rules").and_then(Value::as_array) else {
        return vec![];
    };
    list.iter()
        .filter(|r| {
            let Some(source) = get(r, "source").filter(|s| is_object(s)) else {
                return false;
            };
            get(r, "id").is_some_and(Value::is_string)
                && match str_of(get(source, "kind")) {
                    Some("sensor") => !conditions_of(source).is_empty(),
                    Some("notification") => true,
                    _ => false,
                }
        })
        .collect()
}

pub fn is_sensor_rule(rule: &Value) -> bool {
    str_of(get_in(get(rule, "source"), "kind")) == Some("sensor")
}

/// Data API keys the engine needs: those of the enabled sensor rules, plus the notification feed.
pub fn keys_of(alerts: Option<&Value>) -> Vec<String> {
    if alerts.is_none() || get_in(alerts, "enabled") == Some(&Value::Bool(false)) {
        return vec![];
    }
    let mut keys: Vec<String> = vec![];
    let mut add = |key: &str| {
        if !keys.iter().any(|k| k == key) {
            keys.push(key.to_string());
        }
    };
    for rule in rules_of(alerts) {
        if get(rule, "enabled") == Some(&Value::Bool(false)) {
            continue;
        }
        if !is_sensor_rule(rule) {
            add(NOTIFICATION_KEY);
            continue;
        }
        // A condition without a sensor yet subscribes to nothing (an empty prefix would be the whole stream).
        for cond in conditions_of(&rule["source"]) {
            let key = str_of(get(cond, "key")).unwrap_or_default();
            if !js::trim(key).is_empty() {
                add(key);
            }
        }
    }
    keys
}

/// The stream prefix of a key: up to and including its last ".".
pub fn prefix_of(key: &str) -> &str {
    match key.rfind('.') {
        Some(i) => &key[..=i],
        None => key,
    }
}

/* ---------------- readings ---------------- */

/// The number a reading holds: its finite value, else its text when that reads as a finite number.
pub fn numeric(reading: Option<&Value>) -> Option<f64> {
    if let Some(n) = finite(get_in(reading, "value")) {
        return Some(n);
    }
    let text = str_of(get_in(reading, "text"))?;
    if js::trim(text).is_empty() {
        return None;
    }
    Some(js::string_to_number(text)).filter(|n| n.is_finite())
}

/// The reading's text, or its numeric value as text.
pub fn text_of(reading: Option<&Value>) -> Option<String> {
    if let Some(text) = str_of(get_in(reading, "text")) {
        return Some(text.to_string());
    }
    get_in(reading, "value")
        .and_then(Value::as_f64)
        .map(js::number_to_string)
}

/// What a `changes` condition compares.
#[derive(Debug, Clone, PartialEq)]
pub enum Last {
    Num(f64),
    Text(String),
}

/// The value a `changes` rule compares: the number, else the text.
pub fn change_key(reading: Option<&Value>) -> Option<Last> {
    numeric(reading)
        .map(Last::Num)
        .or_else(|| text_of(reading).map(Last::Text))
}

/// Whether a non-`changes` condition holds: `None` when the sensor has no reading.
pub fn holds(source: &Value, reading: Option<&Value>) -> Option<bool> {
    if !truthy(reading) {
        return None;
    }
    let op = str_of(get(source, "op"));
    let value = get(source, "value");
    let wanted = || js::to_property_key(value).to_lowercase();
    match op {
        Some("contains") => text_of(reading).map(|text| text.to_lowercase().contains(&wanted())),
        Some(op @ ("=" | "!=" | "≠")) => {
            let equal = match value {
                Some(Value::Number(want)) => {
                    numeric(reading).is_some_and(|n| Some(n) == want.as_f64())
                }
                _ => text_of(reading).unwrap_or_default().to_lowercase() == wanted(),
            };
            Some(if op == "=" { equal } else { !equal })
        }
        _ => {
            let n = numeric(reading)?;
            let limit = js::value_to_number(value);
            if !limit.is_finite() {
                return None;
            }
            Some(match op {
                Some(">=") => n >= limit,
                Some("<") => n < limit,
                Some("<=") => n <= limit,
                _ => n > limit,
            })
        }
    }
}

/// Whether an active threshold alert clears. With `clearBelow` (hysteresis) a `>` / `>=` rule clears once the value is
/// at or below it and a `<` / `<=` rule once it is at or above it; otherwise it clears as soon as the condition stops.
pub fn clears(source: &Value, reading: Option<&Value>, cond: bool) -> bool {
    if let (Some(level), Some(n)) = (
        get(source, "clearBelow").and_then(Value::as_f64),
        numeric(reading),
    ) {
        match str_of(get(source, "op")) {
            Some(">" | ">=") => return n <= level,
            Some("<" | "<=") => return n >= level,
            _ => {}
        }
    }
    !cond
}

/* ---------------- text, quiet hours ---------------- */

/// `Math.round`: halves go up.
fn js_round(x: f64) -> f64 {
    let floor = x.floor();
    if x - floor >= 0.5 {
        floor + 1.0
    } else {
        floor
    }
}

/// `String(Math.round(v * 10) / 10)`.
pub fn fmt_number(v: f64) -> String {
    js::number_to_string(js_round(v * 10.0) / 10.0)
}

/// The template variables of an alert's text.
#[derive(Default)]
pub struct Vars {
    pub name: String,
    pub value: String,
    pub unit: String,
    pub sensor: String,
    pub app: String,
    pub title: String,
    pub body: String,
}

/// `template.replace(/\{(name|value|unit|sensor|app|title|body)\}/g, ...)`.
pub fn fill(template: &str, vars: &Vars) -> String {
    let mut out = String::new();
    let mut rest = template;
    while let Some(open) = rest.find('{') {
        out.push_str(&rest[..open]);
        let tail = &rest[open + 1..];
        let known = tail.find('}').and_then(|close| {
            let value = match &tail[..close] {
                "name" => &vars.name,
                "value" => &vars.value,
                "unit" => &vars.unit,
                "sensor" => &vars.sensor,
                "app" => &vars.app,
                "title" => &vars.title,
                "body" => &vars.body,
                _ => return None,
            };
            Some((value, close))
        });
        match known {
            Some((value, close)) => {
                out.push_str(value);
                rest = &tail[close + 1..];
            }
            None => {
                out.push('{');
                rest = tail;
            }
        }
    }
    out.push_str(rest);
    out
}

fn last_segment(key: &str) -> &str {
    key.rfind('.').map_or(key, |i| &key[i + 1..])
}

/// The sensor a hit names: the reading's own name, else the last segment of its key.
pub fn sensor_name(cond: &Value, reading: Option<&Value>) -> String {
    match str_of(get_in(reading, "name")) {
        Some(name) if !name.is_empty() => name.to_string(),
        _ => last_segment(str_of(get(cond, "key")).unwrap_or_default()).to_string(),
    }
}

/// `reading.unit ?? ""` as text.
pub fn unit_text(reading: Option<&Value>) -> String {
    match get_in(reading, "unit") {
        None | Some(Value::Null) => String::new(),
        unit => js::to_property_key(unit),
    }
}

/// A hit's reading for the several-conditions text.
pub fn readout(cond: &Value, reading: Option<&Value>) -> String {
    if str_of(get(cond, "op")) == Some("missing") {
        return "stopped reporting".into();
    }
    match numeric(reading) {
        Some(n) => format!("{}{}", fmt_number(n), unit_text(reading)),
        None => text_of(reading).unwrap_or_default(),
    }
}

/// The severity's rank, if it is one of the three.
pub fn rank(v: Option<&Value>) -> Option<u8> {
    match str_of(v) {
        Some("info") => Some(0),
        Some("warning") => Some(1),
        Some("critical") => Some(2),
        _ => None,
    }
}

/// `HH:MM` as minutes of the day; any two digits count (no range check).
fn minutes(hhmm: Option<&Value>) -> Option<i64> {
    let text = js::to_property_key(hhmm);
    let b = text.as_bytes();
    let digit = |i: usize| i64::from(b[i] - b'0');
    if b.len() != 5 || b[2] != b':' || ![0, 1, 3, 4].iter().all(|&i| b[i].is_ascii_digit()) {
        return None;
    }
    Some((digit(0) * 10 + digit(1)) * 60 + digit(3) * 10 + digit(4))
}

/// The local clock's minutes of the day at `now` (ms).
fn local_minutes(now: f64, zone: LocalZone) -> Option<i64> {
    let at = DateTime::from_timestamp_millis(now as i64)?;
    let time = match zone {
        LocalZone::Pinned(tz) => tz.from_utc_datetime(&at.naive_utc()).time(),
        LocalZone::System => Local.from_utc_datetime(&at.naive_utc()).time(),
    };
    Some(i64::from(time.hour()) * 60 + i64::from(time.minute()))
}

/// Whether `now` (local time) is inside the quiet window and `severity` is below its minimum.
pub fn is_quiet(
    quiet_hours: Option<&Value>,
    severity: Option<&Value>,
    now: f64,
    zone: LocalZone,
) -> bool {
    let Some(hours) = quiet_hours.filter(|q| is_object(q)) else {
        return false;
    };
    let (Some(from), Some(to)) = (minutes(get(hours, "from")), minutes(get(hours, "to"))) else {
        return false;
    };
    if from == to {
        return false;
    }
    let Some(at) = local_minutes(now, zone) else {
        return false;
    };
    let inside = if from < to {
        at >= from && at < to
    } else {
        at >= from || at < to
    };
    inside && rank(severity).unwrap_or(1) < rank(get(hours, "minSeverity")).unwrap_or(2)
}

/* ---------------- Data API stream ---------------- */

/// The first match of `\r?\n\r?\n` in `s`: its start and end.
fn event_break(s: &[u8]) -> Option<(usize, usize)> {
    let newline = |i: usize| match (s.get(i), s.get(i + 1)) {
        (Some(b'\n'), _) => Some(i + 1),
        (Some(b'\r'), Some(b'\n')) => Some(i + 2),
        _ => None,
    };
    (0..s.len()).find_map(|i| newline(i).and_then(newline).map(|end| (i, end)))
}

/// Split an SSE buffer into the `data:` payloads of its complete events and the unfinished rest.
pub fn take_events(buffer: &str) -> (Vec<String>, String) {
    let mut data = vec![];
    let mut rest = buffer;
    while let Some((start, end)) = event_break(rest.as_bytes()) {
        let part = &rest[..start];
        rest = &rest[end..];
        let pieces: Vec<&str> = part.split('\n').collect();
        let last = pieces.len() - 1;
        let lines: Vec<&str> = pieces
            .iter()
            .enumerate()
            .map(|(i, l)| {
                if i < last {
                    l.strip_suffix('\r').unwrap_or(l)
                } else {
                    l
                }
            })
            .filter_map(|l| l.strip_prefix("data:"))
            .map(|l| l.strip_prefix(' ').unwrap_or(l))
            .collect();
        if !lines.is_empty() {
            data.push(lines.join("\n"));
        }
    }
    (data, rest.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn splits_events_and_keeps_the_unfinished_rest() {
        let (data, rest) =
            take_events("data: {\"a\":1}\r\n\r\n: keep\n\ndata:x\ndata: y\n\ndata: part");
        assert_eq!(data, ["{\"a\":1}", "x\ny"]);
        assert_eq!(rest, "data: part");
        let (data, rest) = take_events("data: a\r\n\r");
        assert!(data.is_empty());
        assert_eq!(rest, "data: a\r\n\r");
    }

    #[test]
    fn prefixes_end_at_the_last_dot() {
        assert_eq!(prefix_of("gpu.temp"), "gpu.");
        assert_eq!(prefix_of("nodot"), "nodot");
        assert_eq!(prefix_of(".x"), ".");
    }

    #[test]
    fn a_blank_value_compares_against_zero_and_an_unknown_op_means_greater() {
        let reading = json!({ "value": 5 });
        assert_eq!(
            holds(&json!({ "op": ">", "value": "" }), Some(&reading)),
            Some(true)
        );
        assert_eq!(
            holds(&json!({ "op": "weird", "value": 9 }), Some(&reading)),
            Some(false)
        );
        assert_eq!(
            holds(
                &json!({ "op": "=", "value": "5" }),
                Some(&json!({ "text": "5" }))
            ),
            Some(true)
        );
        assert_eq!(
            holds(
                &json!({ "op": "=", "value": 5 }),
                Some(&json!({ "text": "five" }))
            ),
            Some(false)
        );
        assert_eq!(holds(&json!({ "op": ">", "value": 1 }), None), None);
    }

    #[test]
    fn rounds_halves_up_and_prints_like_javascript() {
        assert_eq!(fmt_number(80.04), "80");
        assert_eq!(fmt_number(-0.04), "0");
        assert_eq!(fmt_number(0.25), "0.3");
        assert_eq!(fmt_number(-0.25), "-0.2");
    }

    #[test]
    fn fills_only_the_known_variables() {
        let vars = Vars {
            name: "N".into(),
            value: "1".into(),
            ..Vars::default()
        };
        assert_eq!(
            fill("{name}={value}{unit} {x} {{name}", &vars),
            "N=1 {x} {N"
        );
    }
}
