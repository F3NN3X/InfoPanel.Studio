// Downgrade guard for POST /api/config (server/config-guard.mjs): an older build that loads a newer config can drop
// what it does not know and push that copy back, so a save whose `version` is below the stored config's is refused.
// A save that raises the version (a migration the studio ran on load) first keeps the stored file as a backup, since
// the older build can no longer save over the new one.

use serde_json::Value;

use crate::json;
use crate::request_guard::Refusal;

fn version_of(config: &Value) -> f64 {
    config.get("version").and_then(Value::as_f64).unwrap_or(0.0)
}

/// `None` to accept, or the 409 when the stored config is newer than the incoming one. Unreadable stored text accepts.
pub fn version_refusal(stored_text: &str, incoming: &Value) -> Option<Refusal> {
    let stored = json::parse(stored_text)?;
    if version_of(&stored) <= version_of(incoming) {
        return None;
    }
    Some(Refusal::new(
        409,
        "a newer dashboard version saved this config; reload",
    ))
}

/// Whether a saved config is older than this build's (`CONFIG_VERSION`) and so needs the studio to update it. A config
/// that doesn't parse, or holds no screens, has nothing to update.
pub fn needs_update(stored_text: &str) -> bool {
    json::parse(stored_text).is_some_and(|stored| {
        stored.get("profiles").is_some_and(Value::is_array)
            && version_of(&stored) < f64::from(crate::CONFIG_VERSION)
    })
}

/// The backup file the stored config is copied to before `incoming` raises its version: `config.backup-before-v<N>.json`
/// for a whole-number incoming version above the stored one; `None` otherwise (an unreadable stored config included).
pub fn version_backup_name(stored_text: &str, incoming: &Value) -> Option<String> {
    let stored = json::parse(stored_text)?;
    let next = version_of(incoming);
    (next > version_of(&stored) && next.fract() == 0.0 && next < 1e9)
        .then(|| format!("config.backup-before-v{}.json", next as i64))
}

#[cfg(test)]
mod tests {
    use super::*;

    // v14 (Free pages, Studio widgets in a canvas): a v13 build would drop them on its next save.
    #[test]
    fn refuses_a_v13_save_over_a_v14_config() {
        assert!(
            version_refusal(r#"{"version":14}"#, &serde_json::json!({ "version": 13 })).is_some()
        );
        assert!(
            version_refusal(r#"{"version":13}"#, &serde_json::json!({ "version": 14 })).is_none()
        );
        assert!(
            version_refusal(r#"{"version":14}"#, &serde_json::json!({ "version": 14 })).is_none()
        );
    }

    // v15 (Edit v3: item placements, page groups, a canvas's cells): a v14 build would drop them on its next save.
    #[test]
    fn refuses_a_v14_save_over_a_v15_config() {
        assert!(
            version_refusal(r#"{"version":15}"#, &serde_json::json!({ "version": 14 })).is_some()
        );
        assert!(
            version_refusal(r#"{"version":15}"#, &serde_json::json!({ "version": 13 })).is_some()
        );
        assert!(
            version_refusal(r#"{"version":14}"#, &serde_json::json!({ "version": 15 })).is_none()
        );
        assert!(
            version_refusal(r#"{"version":15}"#, &serde_json::json!({ "version": 15 })).is_none()
        );
    }

    // v16 (screens own their look): a v15 build would show every screen in the built-in look on its next save.
    #[test]
    fn refuses_a_v15_save_over_a_v16_config() {
        assert!(
            version_refusal(r#"{"version":16}"#, &serde_json::json!({ "version": 15 })).is_some()
        );
        assert!(
            version_refusal(r#"{"version":15}"#, &serde_json::json!({ "version": 16 })).is_none()
        );
        assert!(
            version_refusal(r#"{"version":16}"#, &serde_json::json!({ "version": 16 })).is_none()
        );
    }

    #[test]
    fn a_saved_config_needs_an_update_below_this_builds_version_only() {
        let below = format!(
            r#"{{"version":{},"profiles":[]}}"#,
            crate::CONFIG_VERSION - 1
        );
        let current = format!(r#"{{"version":{},"profiles":[]}}"#, crate::CONFIG_VERSION);
        assert!(needs_update(&below));
        assert!(needs_update(r#"{"profiles":[]}"#));
        assert!(!needs_update(&current));
        assert!(!needs_update(r#"{"version":99,"profiles":[]}"#));
        assert!(!needs_update(r#"{"version":3}"#));
        assert!(!needs_update("not json"));
    }

    #[test]
    fn names_a_backup_only_when_a_save_raises_the_version() {
        let v16 = serde_json::json!({ "version": 16 });
        assert_eq!(
            version_backup_name(r#"{"version":15}"#, &v16).as_deref(),
            Some("config.backup-before-v16.json")
        );
        assert_eq!(
            version_backup_name(r#"{"profiles":[]}"#, &v16).as_deref(),
            Some("config.backup-before-v16.json")
        );
        assert_eq!(version_backup_name(r#"{"version":16}"#, &v16), None);
        assert_eq!(version_backup_name(r#"{"version":17}"#, &v16), None);
        assert_eq!(version_backup_name("not json", &v16), None);
        assert_eq!(
            version_backup_name(r#"{"version":15}"#, &serde_json::json!({ "version": 15.5 })),
            None
        );
        assert_eq!(
            version_backup_name(r#"{"version":15}"#, &serde_json::json!({ "profiles": [] })),
            None
        );
    }
}
