// The commands of Settings › Touch: read touch.json and the panels' state, change one key, list the touchscreens and
// give one back to Windows. Edits change one key in the file (`null` deletes it, back to its default) and are refused
// before anything is written when the result would not apply; the engine then applies the file at once.

use super::config::{self, Issue, Level, TouchConfig};
use super::{driver, PanelState, Touch};
use serde::Serialize;
use serde_json::Value;
use std::path::Path;
use tauri::{AppHandle, Manager, State};

#[derive(Serialize)]
pub struct TouchView {
    /// The `experimentalTouch` setting.
    enabled: bool,
    /// touch.json as written, or null if it is missing or doesn't parse (`file_error` says which).
    file: Value,
    file_error: Option<String>,
    /// The config in effect: the file's if it applied, else the previous one.
    effective: TouchConfig,
    defaults: TouchConfig,
    /// Problems found the last time the file was read.
    issues: Vec<Issue>,
    /// The running panels, real and virtual.
    panels: Vec<PanelState>,
    path: String,
}

#[tauri::command]
pub fn touch_view(touch: State<'_, Touch>) -> TouchView {
    log::debug!("ipc: touch_view");
    let snapshot = touch.snapshot();
    let (file, file_error) = match std::fs::read_to_string(touch.path()) {
        Ok(text) => match serde_json::from_str::<Value>(&text) {
            Ok(v) => (v, None),
            Err(e) => (Value::Null, Some(e.to_string())),
        },
        Err(_) => (Value::Null, None),
    };
    TouchView {
        enabled: snapshot.enabled,
        file,
        file_error,
        effective: snapshot.config,
        defaults: TouchConfig::default(),
        issues: snapshot.issues,
        panels: snapshot.panels,
        path: touch.path().display().to_string(),
    }
}

/// Sets `key` (dotted, array indices as numbers: `panels.0.panel.rotation`) to `value`, or deletes it when `value` is
/// null. Refused, with the reasons, if the file would not apply.
#[tauri::command]
pub fn touch_set(touch: State<'_, Touch>, key: String, value: Value) -> Result<(), Vec<String>> {
    log::debug!("ipc: touch_set {key}");
    edit(touch.path(), &key, (!value.is_null()).then_some(value))?;
    touch.reload();
    Ok(())
}

/// Every touchscreen plugged in, with its driver: whether this app can read it or Windows still owns it.
#[tauri::command]
pub async fn touch_screens() -> Result<Vec<touch_core::discover::Touchscreen>, String> {
    log::debug!("ipc: touch_screens");
    tauri::async_runtime::spawn_blocking(|| {
        touch_core::discover::touchscreens().map_err(|e| e.to_string())
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Gives the touchscreen `vid`:`pid` back to Windows (one admin prompt), with the devices closed meanwhile.
#[tauri::command]
pub async fn touch_uninstall_driver(
    app: AppHandle,
    vid: u16,
    pid: u16,
) -> Result<driver::Uninstalled, String> {
    log::debug!("ipc: touch_uninstall_driver {vid:04x}:{pid:04x}");
    let dir = app.path().app_local_data_dir().map_err(|e| e.to_string())?;
    tauri::async_runtime::spawn_blocking(move || {
        app.state::<Touch>()
            .while_stopped(|| driver::uninstall(&dir, vid, pid))
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Applies one edit to touch.json (a missing file counts as `{}`) in one write. Nothing is written if the result would
/// not apply; its errors come back instead.
pub fn edit(path: &Path, key: &str, value: Option<Value>) -> Result<(), Vec<String>> {
    let text = match std::fs::read_to_string(path) {
        Ok(text) => text,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => "{}".into(),
        Err(e) => return Err(vec![format!("reading touch.json: {e}")]),
    };
    let mut root: Value = serde_json::from_str(&text)
        .map_err(|e| vec![format!("touch.json doesn't parse ({e}); fix it first")])?;
    set_path(&mut root, key, value).map_err(|e| vec![e])?;
    let next = serde_json::to_string_pretty(&root).expect("a Value serialises") + "\n";
    let loaded = config::check(&next);
    if loaded.config.is_none() {
        return Err(loaded
            .issues
            .into_iter()
            .filter(|i| i.level == Level::Error)
            .map(|i| i.message)
            .collect());
    }
    if let Some(dir) = path.parent() {
        std::fs::create_dir_all(dir).map_err(|e| vec![format!("writing touch.json: {e}")])?;
    }
    // Write-then-rename, so the reload never reads a half-written file.
    let tmp = path.with_extension("json.tmp");
    std::fs::write(&tmp, next)
        .and_then(|()| std::fs::rename(&tmp, path))
        .map_err(|e| vec![format!("writing touch.json: {e}")])?;
    log::info!("touch: {key} changed");
    Ok(())
}

/// Sets (or with `None` deletes) a dotted path in a JSON document, creating objects on the way.
pub fn set_path(root: &mut Value, path: &str, value: Option<Value>) -> Result<(), String> {
    let parts: Vec<&str> = path.split('.').collect();
    let (last, parents) = parts.split_last().ok_or("empty key")?;
    let mut node = root;
    for p in parents {
        node = match node {
            Value::Array(items) => {
                let i: usize = p
                    .parse()
                    .map_err(|_| format!("\"{p}\" in {path} is not an index"))?;
                items.get_mut(i).ok_or(format!("{path}: no element {i}"))?
            }
            _ => {
                if !node.is_object() {
                    *node = Value::Object(Default::default());
                }
                node.as_object_mut()
                    .expect("an object")
                    .entry(p.to_string())
                    .or_insert_with(|| Value::Object(Default::default()))
            }
        };
    }
    match (node, value) {
        (Value::Array(items), v) => {
            let i: usize = last
                .parse()
                .map_err(|_| format!("\"{last}\" in {path} is not an index"))?;
            let slot = items.get_mut(i).ok_or(format!("{path}: no element {i}"))?;
            *slot = v.ok_or("array elements can't be deleted by key; set the whole array")?;
        }
        (node, Some(v)) => {
            if !node.is_object() {
                *node = Value::Object(Default::default());
            }
            node.as_object_mut()
                .expect("an object")
                .insert(last.to_string(), v);
        }
        (Value::Object(map), None) => {
            map.remove(*last);
        }
        (_, None) => {}
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn sets_creates_and_deletes_only_the_named_key() {
        let mut v = json!({"touch_dots": false, "panels": [{"name": "A"}]});
        set_path(&mut v, "gestures.slop_px", Some(json!(14))).unwrap();
        set_path(&mut v, "panels.0.panel.rotation", Some(json!("90"))).unwrap();
        set_path(&mut v, "panels.0.name", None).unwrap();
        set_path(&mut v, "touch_dots", None).unwrap();
        assert_eq!(
            v,
            json!({"gestures": {"slop_px": 14}, "panels": [{"panel": {"rotation": "90"}}]})
        );
        set_path(&mut v, "gestures.nope", None).unwrap();
        assert!(set_path(&mut v, "panels.3.name", Some(json!("x"))).is_err());
        assert!(set_path(&mut v, "panels.x.name", Some(json!("x"))).is_err());
    }

    #[test]
    fn an_edit_that_would_not_apply_writes_nothing() {
        let dir = std::env::temp_dir().join(format!("ips-touch-edit-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        let path = dir.join("touch.json");

        edit(&path, "touch_dots", Some(json!(true))).unwrap();
        assert_eq!(
            serde_json::from_str::<Value>(&std::fs::read_to_string(&path).unwrap()).unwrap(),
            json!({"touch_dots": true}),
            "a missing file starts empty"
        );

        let before = std::fs::read_to_string(&path).unwrap();
        let errors = edit(&path, "gestures.slop_px", Some(json!(0))).unwrap_err();
        assert_eq!(errors, ["gestures: slop_px must be > 0"]);
        assert_eq!(std::fs::read_to_string(&path).unwrap(), before);

        edit(&path, "touch_dots", None).unwrap();
        assert_eq!(std::fs::read_to_string(&path).unwrap(), "{}\n");

        std::fs::write(&path, "{").unwrap();
        assert!(
            edit(&path, "touch_dots", Some(json!(true))).unwrap_err()[0].contains("doesn't parse")
        );
        let _ = std::fs::remove_dir_all(&dir);
    }
}
