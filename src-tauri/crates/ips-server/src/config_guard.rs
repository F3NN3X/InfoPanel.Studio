// Downgrade guard for POST /api/config (server/config-guard.mjs): an older build that loads a newer config can drop
// what it does not know and push that copy back, so a save whose `version` is below the stored config's is refused.

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
}
