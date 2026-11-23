// The Peripherals settings: the `peripherals` section of integrations.json, beside `obs`, `calendar` and `streaming`.
// It is the device-batteries master switch and the way the polled devices are read out: the seconds between polls,
// the low-battery threshold, the devices hidden from the readings (still polled, so Settings can unhide them) and the
// owner's renames, which win over the device's own name. The device engine (`devices.rs`) re-reads it before every
// poll, so a save takes effect without a restart; `DEVICE_BATTERIES=off` stays the hard switch. Nothing in it is
// secret, so the studio reads it back whole. Absent from the file (and from every output) until something is set.

use std::collections::BTreeMap;

use serde_json::{json, Map, Value};

use crate::devices::{self, Opts};
use crate::integrations::text;
use crate::js;

/// Most hidden devices, and most renames.
pub const MAX_ENTRIES: usize = 32;
/// A device key (`<source>:<vid>:<pid>:<iface>`) is at most this long.
pub const MAX_KEY: usize = 128;
/// A rename is at most this long.
pub const MAX_RENAME: usize = 40;

#[derive(Debug, Clone, Default, PartialEq)]
pub struct Peripherals {
    /// The master switch the poll task reads every round.
    pub enabled: bool,
    /// The seconds between polls; 0 = unset (the device engine's default).
    pub interval_sec: u32,
    /// The low-battery threshold percent; 0 = unset (the device engine's default).
    pub low_percent: u32,
    /// The devices still polled but not read out.
    pub hidden: Vec<String>,
    /// A device key's name in the readings, over the device's own; "" is not stored (no rename).
    pub names: BTreeMap<String, String>,
}

impl Peripherals {
    fn is_empty(&self) -> bool {
        *self == Self::default()
    }

    /// The options the device engine polls with: 0 reads as the engine's default there.
    pub fn opts(&self) -> Opts {
        Opts {
            enabled: self.enabled,
            interval_sec: self.interval_sec,
            low_percent: self.low_percent,
            hidden: self.hidden.clone(),
            names: self.names.clone(),
        }
    }
}

/// The UTF-16 units a text is cut and measured in, as JSON and JavaScript count them.
fn units(s: &str) -> usize {
    s.encode_utf16().count()
}

/// A device key: trimmed, 1 to 128 characters; "" when the value is not one.
fn clean_key(v: &Value) -> String {
    let key = text(Some(v), MAX_KEY + 1);
    if key.is_empty() || units(&key) > MAX_KEY {
        return String::new();
    }
    key
}

/// A key that arrived as a JSON object's own key (already a string).
fn clean_name_key(key: &str) -> Option<String> {
    let key = js::trim(key);
    (!key.is_empty() && units(key) <= MAX_KEY).then(|| key.to_string())
}

/// `intervalSec`: 0 = unset, else the engine's 30..=300 (`devices::clamp_interval`).
fn clean_interval(sec: u64) -> u32 {
    if sec == 0 {
        return 0;
    }
    devices::clamp_interval(sec.min(u64::from(u32::MAX)) as u32)
}

/// `lowPercent`: 0 = unset, else 1..=100.
fn clean_low(percent: u64) -> u32 {
    if percent == 0 {
        return 0;
    }
    (percent.min(u64::from(u32::MAX)) as u32).min(100)
}

/// Tolerant read of the stored section: keys that are not ones, texts past their cap and entries past the caps are
/// dropped (or cut, for a rename), a repeated key is kept once.
pub fn normalize(raw: Option<&Value>) -> Peripherals {
    let Some(raw) = raw.and_then(Value::as_object) else {
        return Peripherals::default();
    };
    let mut hidden: Vec<String> = Vec::new();
    for key in raw.get("hidden").and_then(Value::as_array).into_iter().flatten().map(clean_key) {
        if !key.is_empty() && hidden.len() < MAX_ENTRIES && !hidden.contains(&key) {
            hidden.push(key);
        }
    }
    Peripherals {
        enabled: raw.get("enabled").and_then(Value::as_bool).unwrap_or(false),
        interval_sec: raw.get("intervalSec").and_then(Value::as_u64).map_or(0, clean_interval),
        low_percent: raw.get("lowPercent").and_then(Value::as_u64).map_or(0, clean_low),
        hidden,
        names: read_names(raw.get("names")),
    }
}

fn read_names(raw: Option<&Value>) -> BTreeMap<String, String> {
    let mut names = BTreeMap::new();
    for (key, value) in raw.and_then(Value::as_object).into_iter().flatten() {
        let Some(key) = clean_name_key(key) else { continue };
        let name = text(Some(value), MAX_RENAME);
        if !name.is_empty() && names.len() < MAX_ENTRIES {
            names.insert(key, name);
        }
    }
    names
}

/// The section as the studio sees it — nothing in it is secret — or `None` while nothing is set.
pub fn to_json(s: &Peripherals) -> Option<Value> {
    if s.is_empty() {
        return None;
    }
    let names: Map<String, Value> = s.names.iter().map(|(key, name)| (key.clone(), json!(name))).collect();
    Some(json!({
        "enabled": s.enabled,
        "intervalSec": s.interval_sec,
        "lowPercent": s.low_percent,
        "hidden": s.hidden,
        "names": names,
    }))
}

/// The section as stored: the same as the studio's view, since none of it is secret.
pub fn to_stored_json(s: &Peripherals) -> Option<Value> {
    to_json(s)
}

/// The section with a studio patch applied, or the error to answer with:
/// - `enabled`: the master switch (true or false); absent keeps it.
/// - `intervalSec`: seconds between polls, 0 = the default; stored 30..=300. Absent keeps it.
/// - `lowPercent`: the low threshold, 0 = the default; stored 1..=100. Absent keeps it.
/// - `hidden`: the full list of device keys (1 to 128 characters each, at most 32); replaced whole when present.
/// - `names`: the full map of key → rename (each rename cut to 40 characters, at most 32 entries); replaced whole
///   when present, and a rename of "" drops that entry.
pub fn apply(s: &Peripherals, patch: &Value) -> Result<Peripherals, String> {
    let Some(patch) = patch.as_object() else {
        return Err("peripherals: expected an object".into());
    };
    let mut next = s.clone();
    match patch.get("enabled") {
        None => {}
        Some(Value::Bool(on)) => next.enabled = *on,
        Some(_) => return Err("peripherals.enabled: expected true or false".into()),
    }
    if let Some(v) = patch.get("intervalSec") {
        next.interval_sec = clean_interval(whole(v, "peripherals.intervalSec")?);
    }
    if let Some(v) = patch.get("lowPercent") {
        next.low_percent = clean_low(whole(v, "peripherals.lowPercent")?);
    }
    if let Some(hidden) = patch.get("hidden") {
        next.hidden = apply_hidden(hidden)?;
    }
    if let Some(names) = patch.get("names") {
        let Some(names) = names.as_object() else {
            return Err("peripherals.names: expected an object".into());
        };
        if names.len() > MAX_ENTRIES {
            return Err(format!("peripherals.names: at most {MAX_ENTRIES}"));
        }
        let mut out = BTreeMap::new();
        for (key, value) in names {
            let key = clean_name_key(key).ok_or("peripherals.names: a device key is 1 to 128 characters")?;
            let name = text(Some(value), MAX_RENAME);
            if !name.is_empty() {
                out.insert(key, name);
            }
        }
        next.names = out;
    }
    Ok(next)
}

/// A whole number from a patch.
fn whole(v: &Value, field: &str) -> Result<u64, String> {
    v.as_u64().ok_or_else(|| format!("{field}: a whole number"))
}

fn apply_hidden(v: &Value) -> Result<Vec<String>, String> {
    let Some(list) = v.as_array() else {
        return Err("peripherals.hidden: expected a list".into());
    };
    if list.len() > MAX_ENTRIES {
        return Err(format!("peripherals.hidden: at most {MAX_ENTRIES}"));
    }
    let mut hidden = Vec::new();
    for item in list {
        let key = clean_key(item);
        if key.is_empty() {
            return Err("peripherals.hidden: a device key is 1 to 128 characters".into());
        }
        if !hidden.contains(&key) {
            hidden.push(key);
        }
    }
    Ok(hidden)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::devices::{INTERVAL_DEFAULT, INTERVAL_MAX, INTERVAL_MIN, LOW_DEFAULT};

    #[test]
    fn is_absent_until_something_is_set() {
        assert_eq!(normalize(None), Peripherals::default());
        let defaults = json!({ "enabled": false, "intervalSec": 0, "lowPercent": 0, "hidden": [], "names": {} });
        assert_eq!(normalize(Some(&defaults)), Peripherals::default());
        assert_eq!(to_json(&Peripherals::default()), None);
        assert_eq!(to_stored_json(&Peripherals::default()), None);
    }

    #[test]
    fn reads_the_stored_section_tolerantly_and_holds_the_caps() {
        assert_eq!(normalize(Some(&json!("x"))), Peripherals::default());
        assert_eq!(normalize(Some(&json!({ "enabled": "yes" }))), Peripherals::default());
        let long = "k".repeat(MAX_KEY + 1);
        let raw = json!({
            "enabled": true,
            "intervalSec": 500,
            "lowPercent": 200,
            "hidden": ["a", "a", "", "  b  ", 5, long],
            "names": { "a": "  Lounge mouse  ", "b": "x".repeat(41), long.clone(): "gone" },
        });
        let s = normalize(Some(&raw));
        assert!(s.enabled);
        assert_eq!((s.interval_sec, s.low_percent), (INTERVAL_MAX, 100));
        assert_eq!(s.hidden, ["a", "b"]);
        assert_eq!(s.names["a"], "Lounge mouse");
        assert_eq!(s.names["b"].len(), MAX_RENAME);
        assert!(!s.names.contains_key(&long));
        // More entries than the cap are cut to it.
        let many: Vec<Value> = (0..=MAX_ENTRIES).map(|i| json!(format!("k{i}"))).collect();
        assert_eq!(normalize(Some(&json!({ "hidden": many }))).hidden.len(), MAX_ENTRIES);
        let names: Map<String, Value> = (0..=MAX_ENTRIES).map(|i| (format!("k{i}"), json!("n"))).collect();
        assert_eq!(normalize(Some(&json!({ "names": names }))).names.len(), MAX_ENTRIES);
    }

    #[test]
    fn clamps_the_interval_and_the_threshold_with_zero_as_unset() {
        let interval = |n: u32| normalize(Some(&json!({ "intervalSec": n }))).interval_sec;
        assert_eq!(interval(0), 0);
        assert_eq!(interval(10), INTERVAL_MIN);
        assert_eq!(interval(500), INTERVAL_MAX);
        assert_eq!(interval(90), 90);
        let low = |n: u32| normalize(Some(&json!({ "lowPercent": n }))).low_percent;
        assert_eq!(low(0), 0);
        assert_eq!(low(200), 100);
        assert_eq!(low(15), 15);
        // The engine reads the zeros as its defaults.
        let o = Peripherals::default().opts();
        assert_eq!((o.interval(), o.low(), o.enabled), (INTERVAL_DEFAULT, LOW_DEFAULT, false));
        let o = normalize(Some(&json!({ "enabled": true, "intervalSec": 10, "lowPercent": 200 }))).opts();
        assert_eq!((o.interval(), o.low(), o.enabled), (INTERVAL_MIN, 100, true));
    }

    #[test]
    fn a_patch_keeps_absent_fields_and_replaces_the_lists_whole() {
        let first = apply(
            &Peripherals::default(),
            &json!({ "enabled": true, "intervalSec": 90, "lowPercent": 20, "hidden": ["k1"], "names": { "k1": "Mouse" } }),
        )
        .unwrap();
        let names = [("k1".to_string(), "Mouse".to_string())].into();
        assert_eq!(first, Peripherals { enabled: true, interval_sec: 90, low_percent: 20, hidden: vec!["k1".into()], names });
        assert_eq!(apply(&first, &json!({})).unwrap(), first, "absent keeps");
        // A list replaces the whole one, and a rename of "" drops its entry.
        let next = apply(&first, &json!({ "hidden": [], "names": { "k2": "Keyboard", "k1": "" } })).unwrap();
        assert!(next.hidden.is_empty());
        assert_eq!(next.names.keys().collect::<Vec<_>>(), ["k2"]);
        assert!(!apply(&first, &json!({ "enabled": false })).unwrap().enabled);
        // Both forms are the same, and what is written reads back.
        assert_eq!(to_json(&first), to_stored_json(&first));
        assert_eq!(normalize(Some(&to_stored_json(&first).unwrap())), first);
        assert_eq!(to_json(&next).unwrap()["names"], json!({ "k2": "Keyboard" }));
        assert_eq!(
            to_json(&first).unwrap(),
            json!({ "enabled": true, "intervalSec": 90, "lowPercent": 20, "hidden": ["k1"], "names": { "k1": "Mouse" } })
        );
    }

    #[test]
    fn refuses_a_malformed_patch_and_keys_past_the_caps() {
        let e = Peripherals::default();
        let refusal = |patch: Value| apply(&e, &patch).unwrap_err();
        assert_eq!(refusal(json!([])), "peripherals: expected an object");
        assert_eq!(refusal(json!({ "enabled": 1 })), "peripherals.enabled: expected true or false");
        assert_eq!(refusal(json!({ "intervalSec": -1 })), "peripherals.intervalSec: a whole number");
        assert_eq!(refusal(json!({ "intervalSec": 1.5 })), "peripherals.intervalSec: a whole number");
        assert_eq!(refusal(json!({ "lowPercent": "20" })), "peripherals.lowPercent: a whole number");
        assert_eq!(refusal(json!({ "hidden": "k1" })), "peripherals.hidden: expected a list");
        assert_eq!(refusal(json!({ "hidden": [5] })), "peripherals.hidden: a device key is 1 to 128 characters");
        assert_eq!(refusal(json!({ "hidden": [""] })), "peripherals.hidden: a device key is 1 to 128 characters");
        assert_eq!(refusal(json!({ "hidden": ["k".repeat(MAX_KEY + 1)] })), "peripherals.hidden: a device key is 1 to 128 characters");
        let many: Vec<Value> = (0..=MAX_ENTRIES).map(|i| json!(format!("k{i}"))).collect();
        assert_eq!(refusal(json!({ "hidden": many })), "peripherals.hidden: at most 32");
        assert_eq!(refusal(json!({ "names": [] })), "peripherals.names: expected an object");
        assert_eq!(refusal(json!({ "names": { "k".repeat(MAX_KEY + 1): "x" } })), "peripherals.names: a device key is 1 to 128 characters");
        let names: Map<String, Value> = (0..=MAX_ENTRIES).map(|i| (format!("k{i}"), json!("n"))).collect();
        assert_eq!(refusal(json!({ "names": names })), "peripherals.names: at most 32");
        // A rename past its cap is cut, not refused.
        let long = apply(&e, &json!({ "names": { "k1": "n".repeat(41) } })).unwrap();
        assert_eq!(long.names["k1"].len(), MAX_RENAME);
    }
}
