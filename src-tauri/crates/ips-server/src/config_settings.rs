// PATCH /api/config/settings (server/config-settings.mjs): the Settings window's instant writes. A patch names only
// the dashboard-wide settings it changes and the saved config keeps everything else:
//
//   { general?: { <key>: value | null }, style?: { clock: "12" | "24" | null }, activeProfile?: "auto" | <screen id> | null,
//     profiles?: { <id>: { performance: { maxFps?, motion?, ringGlide?, blurLimit?, innerBlur?, liveGlow? } | null } } }
//
// Since config v16 the 12 / 24 h clock is `general.clock` and a screen's performance holds the rendering switches;
// `style.clock` and the dashboard performance keys in `general` stay accepted for a Settings window built before (and
// the frozen parity cases). null puts a key back to its default. Every value is checked the way the studio reads it; a patch with anything else
// is refused whole. Keys move as JavaScript moves them (a replaced `general` goes to the end of the config), so the
// saved file matches Node's byte for byte.

use serde_json::{Map, Value};

use crate::request_guard::Refusal;
use crate::{js, json, locale};

const FPS: [f64; 5] = [5.0, 15.0, 30.0, 60.0, 0.0];
const MOTIONS: [&str; 3] = ["system", "reduce", "full"];

/// A check of one settings value.
type Check = fn(&Value) -> bool;

fn is_bool(v: &Value) -> bool {
    v.is_boolean()
}

fn is_fps(v: &Value) -> bool {
    v.as_f64().is_some_and(|n| FPS.contains(&n))
}

fn is_motion(v: &Value) -> bool {
    v.as_str().is_some_and(|s| MOTIONS.contains(&s))
}

fn is_kiosk_refresh(v: &Value) -> bool {
    matches!(v.as_str(), Some("daily" | "off"))
}

fn is_locale(v: &Value) -> bool {
    v.as_str().is_some_and(locale::is_locale)
}

fn is_clock(v: &Value) -> bool {
    matches!(v.as_str(), Some("12" | "24"))
}

/// The `general` keys Settings › Dashboard edits (the performance ones: a pre-v16 Settings window's). The page font is Theme's.
fn general_check(key: &str) -> Option<Check> {
    Some(match key {
        "showSeconds" | "hideCursor" | "kioskPageNav" | "ringGlide" | "blurLimit" | "innerBlur" | "liveGlow" => is_bool,
        "clock" => is_clock,
        "locale" => is_locale,
        "motion" => is_motion,
        "maxFps" => is_fps,
        "kioskRefresh" => is_kiosk_refresh,
        _ => return None,
    })
}

fn style_check(key: &str) -> Option<Check> {
    (key == "clock").then_some(is_clock as Check)
}

fn performance_check(key: &str) -> Option<Check> {
    Some(match key {
        "maxFps" => is_fps,
        "motion" => is_motion,
        "ringGlide" | "blurLimit" | "innerBlur" | "liveGlow" => is_bool,
        _ => return None,
    })
}

fn bad(message: String) -> Refusal {
    Refusal::new(400, message)
}

/// `target` with each key of `patch` set, or removed when null; `None` when nothing is left.
fn merge_keys(target: Option<&Value>, patch: &Map<String, Value>) -> Option<Value> {
    let mut out = target.and_then(Value::as_object).cloned().unwrap_or_default();
    for key in json::keys(patch) {
        match &patch[key] {
            Value::Null => {
                out.shift_remove(key);
            }
            value => {
                out.insert(key.clone(), value.clone());
            }
        }
    }
    (!out.is_empty()).then_some(Value::Object(out))
}

/// The first key of `patch` that `checks` does not know, or whose value (other than null) fails its check.
fn invalid_key(patch: &Map<String, Value>, checks: fn(&str) -> Option<Check>) -> Option<&String> {
    json::keys(patch).into_iter().find(|key| match checks(key) {
        None => true,
        Some(check) => !patch[*key].is_null() && !check(&patch[*key]),
    })
}

/// `config` with `key` moved to the end and set to `value`, or without it when `None`.
fn with_key(config: &Map<String, Value>, key: &str, value: Option<Value>) -> Map<String, Value> {
    let mut out = config.clone();
    out.shift_remove(key);
    if let Some(value) = value {
        out.insert(key.to_string(), value);
    }
    out
}

/// The stored config with the patch applied, or the refusal: 409 when the stored config is not an object, 400 when
/// the patch is not one, 404 when it names a screen the config does not have. `activeProfile` is "auto" or a screen the
/// config has (400 otherwise); null is "auto".
pub fn apply_settings_patch(stored: &Value, patch: &Value) -> Result<Value, Refusal> {
    let Some(stored) = stored.as_object() else {
        return Err(Refusal::new(409, "the saved config is not readable"));
    };
    let Some(patch) = patch.as_object() else {
        return Err(bad("expected a settings patch".into()));
    };
    if let Some(extra) = json::keys(patch).into_iter().find(|k| !["general", "style", "profiles", "activeProfile"].contains(&k.as_str())) {
        return Err(bad(format!("not a setting: {extra}")));
    }
    let mut config = stored.clone();

    if let Some(launch) = patch.get("activeProfile") {
        let known = |id: &str| {
            config.get("profiles").and_then(Value::as_array).is_some_and(|ps| ps.iter().any(|p| p.get("id").and_then(Value::as_str) == Some(id)))
        };
        let id = match launch {
            Value::Null => "auto",
            Value::String(id) if id == "auto" || known(id) => id,
            _ => return Err(bad("not a valid activeProfile".into())),
        };
        config.insert("activeProfile".into(), Value::String(id.to_string()));
    }

    for (name, checks) in [("general", general_check as fn(&str) -> Option<Check>), ("style", style_check)] {
        let Some(section) = patch.get(name) else { continue };
        let Some(section) = section.as_object() else {
            return Err(bad(format!("{name} must be an object")));
        };
        if let Some(key) = invalid_key(section, checks) {
            return Err(bad(format!("not a valid {name}.{key}")));
        }
        let merged = merge_keys(config.get(name), section);
        config = with_key(&config, name, merged);
    }

    if let Some(changes) = patch.get("profiles") {
        let Some(changes) = changes.as_object() else {
            return Err(bad("profiles must be an object".into()));
        };
        let profiles = config.get("profiles").and_then(Value::as_array).cloned().unwrap_or_default();
        for id in json::keys(changes) {
            let change = &changes[id];
            if !change.as_object().is_some_and(|c| c.keys().all(|k| k == "performance")) {
                return Err(bad(format!("not a valid profiles.{id}")));
            }
            let valid = match change.get("performance") {
                Some(Value::Null) => true,
                Some(Value::Object(perf)) => invalid_key(perf, performance_check).is_none() && !perf.values().any(Value::is_null),
                _ => false,
            };
            if !valid {
                return Err(bad(format!("not a valid profiles.{id}.performance")));
            }
            if !profiles.iter().any(|p| p.get("id").and_then(Value::as_str) == Some(id.as_str())) {
                return Err(Refusal::new(404, format!("no screen {id}")));
            }
        }
        let mapped = profiles
            .into_iter()
            .map(|p| {
                let Some(profile) = p.as_object() else { return p };
                let Some(change) = changes.get(&js::to_property_key(profile.get("id"))) else { return p };
                let performance = change.get("performance").and_then(Value::as_object).and_then(|perf| merge_keys(None, perf));
                Value::Object(with_key(profile, "performance", performance))
            })
            .collect();
        config.insert("profiles".into(), Value::Array(mapped));
    }

    Ok(Value::Object(config))
}

/// One accepted Settings patch and the revision it was given.
#[derive(Debug, Clone)]
pub struct SettingsEntry {
    pub rev: i64,
    pub patch: Value,
}

/// A config pushed by a Studio built before some Settings patches landed (`log` entries newer than `since_rev`, oldest
/// first), with those patches applied again. A patch the config no longer accepts (its screen was deleted) is skipped.
pub fn reapply_settings(config: Value, log: &[SettingsEntry], since_rev: f64) -> Value {
    log.iter()
        .filter(|entry| entry.rev as f64 > since_rev)
        .fold(config, |acc, entry| apply_settings_patch(&acc, &entry.patch).unwrap_or(acc))
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn stored() -> Value {
        json!({ "version": 16, "general": { "locale": "de-DE" }, "profiles": [{ "id": "desk", "pages": [] }] })
    }

    // v16: the app's 12 / 24 h is `general.clock`; a screen's performance holds the rendering switches.
    #[test]
    fn sets_the_app_clock_and_a_screens_full_performance() {
        let out = apply_settings_patch(&stored(), &json!({ "general": { "clock": "12" } })).unwrap();
        assert_eq!(out["general"], json!({ "locale": "de-DE", "clock": "12" }));
        let perf = json!({ "maxFps": 30, "motion": "reduce", "ringGlide": true, "blurLimit": false, "innerBlur": true, "liveGlow": false });
        let out = apply_settings_patch(&stored(), &json!({ "profiles": { "desk": { "performance": perf } } })).unwrap();
        assert_eq!(out["profiles"][0]["performance"], perf);
    }

    #[test]
    fn refuses_a_bad_clock_or_switch() {
        for bad in [json!({ "general": { "clock": "auto" } }), json!({ "profiles": { "desk": { "performance": { "ringGlide": "yes" } } } })] {
            assert_eq!(apply_settings_patch(&stored(), &bad).unwrap_err().status, 400);
        }
    }

    // A Settings window built before v16 still writes `style.clock` and the dashboard performance keys.
    #[test]
    fn still_accepts_a_pre_v16_settings_patch() {
        let out = apply_settings_patch(&stored(), &json!({ "style": { "clock": "24" }, "general": { "maxFps": 15, "liveGlow": true } })).unwrap();
        assert_eq!(out["style"], json!({ "clock": "24" }));
        assert_eq!(out["general"], json!({ "locale": "de-DE", "maxFps": 15, "liveGlow": true }));
    }
}
