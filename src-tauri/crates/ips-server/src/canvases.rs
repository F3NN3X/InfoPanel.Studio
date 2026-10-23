// The canvas store (server/canvases.mjs): each imported canvas is one JSON file in DATA_DIR/canvases, named
// `cnv_<32 hex>`, and a canvas zone in the config holds only its `canvasRef`. This step has what POST /api/config
// checks: the refs a config names, and whether the store has each.

use std::path::{Path, PathBuf};

use serde_json::Value;

use crate::json;

/// `CANVAS_ID_RE`: `^cnv_[a-f0-9]{32}$`.
pub fn is_canvas_id(id: &str) -> bool {
    id.len() == 36 && id.starts_with("cnv_") && id[4..].bytes().all(|b| matches!(b, b'0'..=b'9' | b'a'..=b'f'))
}

/// The canvas ids a config's text references (any `canvasRef` string, wherever it sits) in the order they appear, or
/// `None` when the text is not a config (an object with a `profiles` array).
pub fn referenced_canvas_ids(config_text: &str) -> Option<Vec<String>> {
    let config = json::parse(config_text)?;
    if !config.get("profiles").is_some_and(Value::is_array) {
        return None;
    }
    let mut ids = Vec::new();
    walk(&config, &mut ids);
    Some(ids)
}

fn walk(v: &Value, ids: &mut Vec<String>) {
    match v {
        Value::Array(items) => items.iter().for_each(|item| walk(item, ids)),
        Value::Object(map) => {
            for key in json::keys(map) {
                match (key.as_str(), &map[key]) {
                    ("canvasRef", Value::String(id)) => {
                        if !ids.contains(id) {
                            ids.push(id.clone());
                        }
                    }
                    (_, value) => walk(value, ids),
                }
            }
        }
        _ => {}
    }
}

/// The canvases in `dir`, one JSON file each.
pub struct CanvasStore {
    dir: PathBuf,
}

impl CanvasStore {
    pub fn new(dir: &Path) -> Self {
        Self { dir: dir.to_path_buf() }
    }

    /// Whether the store has a file for `id`.
    pub fn has(&self, id: &str) -> bool {
        is_canvas_id(id) && self.dir.join(format!("{id}.json")).exists()
    }
}
