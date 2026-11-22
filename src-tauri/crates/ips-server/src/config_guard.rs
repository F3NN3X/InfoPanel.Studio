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
    Some(Refusal::new(409, "a newer dashboard version saved this config; reload"))
}

/// Whether a saved config is older than this build's (`CONFIG_VERSION`) and so needs the studio to update it. A config
/// that doesn't parse, or holds no screens, has nothing to update.
pub fn needs_update(stored_text: &str) -> bool {
    json::parse(stored_text)
        .is_some_and(|stored| stored.get("profiles").is_some_and(Value::is_array) && version_of(&stored) < f64::from(crate::CONFIG_VERSION))
}

/// The backup file the stored config is copied to before `incoming` raises its version: `config.backup-before-v<N>.json`
/// for a whole-number incoming version above the stored one; `None` otherwise (an unreadable stored config included).
pub fn version_backup_name(stored_text: &str, incoming: &Value) -> Option<String> {
    let stored = json::parse(stored_text)?;
    let next = version_of(incoming);
    (next > version_of(&stored) && next.fract() == 0.0 && next < 1e9).then(|| format!("config.backup-before-v{}.json", next as i64))
}

#[cfg(test)]
mod tests {
    use super::*;

    // v14 (Free pages, Studio widgets in a canvas): a v13 build would drop them on its next save.
    #[test]
    fn refuses_a_v13_save_over_a_v14_config() {
        assert!(version_refusal(r#"{"version":14}"#, &serde_json::json!({ "version": 13 })).is_some());
        assert!(version_refusal(r#"{"version":13}"#, &serde_json::json!({ "version": 14 })).is_none());
        assert!(version_refusal(r#"{"version":14}"#, &serde_json::json!({ "version": 14 })).is_none());
    }

    // v15 (Edit v3: item placements, page groups, a canvas's cells): a v14 build would drop them on its next save.
    #[test]
    fn refuses_a_v14_save_over_a_v15_config() {
        assert!(version_refusal(r#"{"version":15}"#, &serde_json::json!({ "version": 14 })).is_some());
        assert!(version_refusal(r#"{"version":15}"#, &serde_json::json!({ "version": 13 })).is_some());
        assert!(version_refusal(r#"{"version":14}"#, &serde_json::json!({ "version": 15 })).is_none());
        assert!(version_refusal(r#"{"version":15}"#, &serde_json::json!({ "version": 15 })).is_none());
    }

    // v16 (screens own their look): a v15 build would show every screen in the built-in look on its next save.
    #[test]
    fn refuses_a_v15_save_over_a_v16_config() {
        assert!(version_refusal(r#"{"version":16}"#, &serde_json::json!({ "version": 15 })).is_some());
        assert!(version_refusal(r#"{"version":15}"#, &serde_json::json!({ "version": 16 })).is_none());
        assert!(version_refusal(r#"{"version":16}"#, &serde_json::json!({ "version": 16 })).is_none());
    }

    // v17 (each level stores a Look id): a v16 build would drop `lookId` on its next save.
    #[test]
    fn refuses_a_v16_save_over_a_v17_config() {
        assert!(version_refusal(r#"{"version":17}"#, &serde_json::json!({ "version": 16 })).is_some());
        assert!(version_refusal(r#"{"version":16}"#, &serde_json::json!({ "version": 17 })).is_none());
        assert!(version_refusal(r#"{"version":17}"#, &serde_json::json!({ "version": 17 })).is_none());
        assert!(needs_update(r#"{"version":16,"profiles":[]}"#));
    }

    // v18 (a level stores no card of its own Look's): a v17 build would read the migrated page as before, but its save is refused as any older one's is.
    #[test]
    fn refuses_a_v17_save_over_a_v18_config() {
        assert!(version_refusal(r#"{"version":18}"#, &serde_json::json!({ "version": 17 })).is_some());
        assert!(version_refusal(r#"{"version":17}"#, &serde_json::json!({ "version": 18 })).is_none());
        assert!(version_refusal(r#"{"version":18}"#, &serde_json::json!({ "version": 18 })).is_none());
        assert!(needs_update(r#"{"version":17,"profiles":[]}"#));
    }

    // v19 (the widget merges: a merged-away widget is its survivor's view): a v18 build would not know the survivor's new values, so its save is refused as any older one's is.
    #[test]
    fn refuses_a_v18_save_over_a_v19_config() {
        assert!(version_refusal(r#"{"version":19}"#, &serde_json::json!({ "version": 18 })).is_some());
        assert!(version_refusal(r#"{"version":18}"#, &serde_json::json!({ "version": 19 })).is_none());
        assert!(version_refusal(r#"{"version":19}"#, &serde_json::json!({ "version": 19 })).is_none());
        assert!(needs_update(r#"{"version":18,"profiles":[]}"#));
    }

    // v20 (the pinned layer, a page's hidePinned, a widget's touch actions, a profile's autoSwitch): a v19 build would draw no pinned layer, so its save is refused as any older one's is.
    #[test]
    fn refuses_a_v19_save_over_a_v20_config() {
        assert!(version_refusal(r#"{"version":20}"#, &serde_json::json!({ "version": 19 })).is_some());
        assert!(version_refusal(r#"{"version":20}"#, &serde_json::json!({ "version": 16 })).is_some());
        assert!(version_refusal(r#"{"version":19}"#, &serde_json::json!({ "version": 20 })).is_none());
        assert!(version_refusal(r#"{"version":20}"#, &serde_json::json!({ "version": 20 })).is_none());
        assert!(needs_update(r#"{"version":19,"profiles":[]}"#));
    }

    // v21 (a widget pinned in place, a pinned item with `at` and no edge): a v20 build would drop the item, so its save is refused as any older one's is.
    #[test]
    fn refuses_a_v20_save_over_a_v21_config() {
        assert!(version_refusal(r#"{"version":21}"#, &serde_json::json!({ "version": 20 })).is_some());
        assert!(version_refusal(r#"{"version":21}"#, &serde_json::json!({ "version": 19 })).is_some());
        assert!(version_refusal(r#"{"version":20}"#, &serde_json::json!({ "version": 21 })).is_none());
        assert!(version_refusal(r#"{"version":21}"#, &serde_json::json!({ "version": 21 })).is_none());
        assert!(needs_update(r#"{"version":20,"profiles":[]}"#));
    }

    #[test]
    fn a_saved_config_needs_an_update_below_this_builds_version_only() {
        let below = format!(r#"{{"version":{},"profiles":[]}}"#, crate::CONFIG_VERSION - 1);
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
        assert_eq!(version_backup_name(r#"{"version":15}"#, &v16).as_deref(), Some("config.backup-before-v16.json"));
        assert_eq!(version_backup_name(r#"{"profiles":[]}"#, &v16).as_deref(), Some("config.backup-before-v16.json"));
        assert_eq!(version_backup_name(r#"{"version":16}"#, &v16), None);
        assert_eq!(version_backup_name(r#"{"version":17}"#, &v16), None);
        assert_eq!(version_backup_name("not json", &v16), None);
        assert_eq!(version_backup_name(r#"{"version":15}"#, &serde_json::json!({ "version": 15.5 })), None);
        assert_eq!(version_backup_name(r#"{"version":15}"#, &serde_json::json!({ "profiles": [] })), None);
        let v17 = serde_json::json!({ "version": 17 });
        assert_eq!(version_backup_name(r#"{"version":16}"#, &v17).as_deref(), Some("config.backup-before-v17.json"));
        let v18 = serde_json::json!({ "version": 18 });
        assert_eq!(version_backup_name(r#"{"version":17}"#, &v18).as_deref(), Some("config.backup-before-v18.json"));
        let v19 = serde_json::json!({ "version": 19 });
        assert_eq!(version_backup_name(r#"{"version":18}"#, &v19).as_deref(), Some("config.backup-before-v19.json"));
        let v20 = serde_json::json!({ "version": 20 });
        assert_eq!(version_backup_name(r#"{"version":19}"#, &v20).as_deref(), Some("config.backup-before-v20.json"));
        let v21 = serde_json::json!({ "version": 21 });
        assert_eq!(version_backup_name(r#"{"version":20}"#, &v21).as_deref(), Some("config.backup-before-v21.json"));
    }
}
