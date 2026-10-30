// The studio's own preferences that follow the user between the app window and a browser studio
// (server/studio-prefs.mjs): kept in studio-prefs.json beside the config, never in config.json, so kiosks never see
// them. Only known keys with known values are kept.

use std::path::{Path, PathBuf};
use std::sync::Mutex;

use serde_json::{Map, Value};

use crate::{json, store};

/// Each preference and the values it takes.
pub const STUDIO_PREFS: [(&str, &[&str]); 1] = [("studio.previewData", &["live", "frozen", "frozenWhenUnfocused"])];

fn values_of(key: &str) -> Option<&'static [&'static str]> {
    STUDIO_PREFS.iter().find(|(k, _)| *k == key).map(|(_, values)| *values)
}

/// The known keys of `raw` with a known value; anything else is dropped.
pub fn normalize_prefs(raw: &Value) -> Map<String, Value> {
    let Some(raw) = raw.as_object() else { return Map::new() };
    STUDIO_PREFS
        .iter()
        .filter_map(|(key, values)| match raw.get(*key) {
            Some(Value::String(v)) if values.contains(&v.as_str()) => Some((key.to_string(), Value::String(v.clone()))),
            _ => None,
        })
        .collect()
}

/// `prefs` with `patch` merged in, or an error naming the first key or value that isn't known.
pub fn apply_prefs(prefs: &Value, patch: &Value) -> Result<Map<String, Value>, String> {
    let Some(patch) = patch.as_object() else {
        return Err("expected a JSON object".into());
    };
    for key in json::keys(patch) {
        let Some(values) = values_of(key) else {
            return Err(format!("unknown preference {key}"));
        };
        if !patch[key].as_str().is_some_and(|v| values.contains(&v)) {
            return Err(format!("{key} takes {}", values.join(", ")));
        }
    }
    let mut merged = normalize_prefs(prefs);
    for key in json::keys(patch) {
        merged.insert(key.clone(), patch[key].clone());
    }
    Ok(merged)
}

/// The preferences in their file (none when it is missing or unreadable) and the writer that replaces it whole.
pub struct StudioPrefs {
    file: PathBuf,
    prefs: Mutex<Value>,
}

impl StudioPrefs {
    pub fn load(file: &Path) -> Self {
        let prefs = store::read_json(file).map(|raw| Value::Object(normalize_prefs(&raw))).unwrap_or_else(|| Value::Object(Map::new()));
        Self { file: file.to_path_buf(), prefs: Mutex::new(prefs) }
    }

    pub fn get(&self) -> Value {
        self.prefs.lock().unwrap().clone()
    }

    /// Validates and merges `patch`, writes the file and returns the new preferences.
    pub fn apply(&self, patch: &Value) -> std::io::Result<Result<Value, String>> {
        let mut prefs = self.prefs.lock().unwrap();
        let merged = match apply_prefs(&prefs, patch) {
            Ok(merged) => Value::Object(merged),
            Err(error) => return Ok(Err(error)),
        };
        store::write_atomic(&self.file, json::stringify(&merged).as_bytes())?;
        *prefs = merged.clone();
        Ok(Ok(merged))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn a_broken_file_is_no_preferences_replaced_by_the_next_write_and_a_refused_patch_leaves_it() {
        let dir = tempfile::tempdir().unwrap();
        let file = dir.path().join("studio-prefs.json");
        std::fs::write(&file, "{not json").unwrap();
        let prefs = StudioPrefs::load(&file);
        assert_eq!(prefs.get(), json!({}));
        let frozen = json!({ "studio.previewData": "frozenWhenUnfocused" });
        assert_eq!(prefs.apply(&frozen).unwrap().unwrap(), frozen);
        assert_eq!(StudioPrefs::load(&file).get(), frozen);
        assert!(prefs.apply(&json!({ "studio.previewData": "x" })).unwrap().is_err());
        assert_eq!(StudioPrefs::load(&file).get(), frozen);
    }
}
