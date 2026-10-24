// My library (server/library.mjs): the user's reusable content (images, videos, fonts, SVG templates, gauges, saved
// panels, style presets, imported canvases), kept apart from any profile. Each item is one JSON file in
// DATA_DIR/library, named by its id; its bytes live in the asset store and are named by asset id in `files`.
// Writes need `X-Dashboard-Library: 1` and JSON, and come from this computer unless ALLOW_REMOTE_UPLOAD=1.
//
// GET/POST /api/library, GET/PUT/DELETE /api/library/<id>.

use std::path::{Path, PathBuf};

use axum::body::Body;
use axum::http::{Method, Response};
use serde_json::{Map, Value};

use crate::asset_types::is_asset_id;
use crate::http::{self, Req};
use crate::request_guard::{is_loopback, Refusal};
use crate::{js, json, App};

pub const KINDS: [&str; 8] = ["image", "video", "font", "svg", "gauge", "panel", "style", "canvas"];
/// The largest item file (an imported canvas holds a whole profile).
pub const MAX_ITEM_BYTES: usize = 8 * 1024 * 1024;
/// The largest `meta` (tags, sizes, colours: what the grid filters and sorts by).
pub const MAX_META_BYTES: usize = 64 * 1024;
/// Larger `data` is left out of the list; GET /api/library/<id> has it.
pub const LIST_DATA_BYTES: usize = 256 * 1024;
const MAX_FILES: usize = 4096;
const MAX_COPIES: usize = 1000;
const MAX_NAME: usize = 200;
const BODY_REFUSED: &str = "expected a JSON body under 8 MB";

/// `ITEM_ID_RE`: `^lib_[a-z0-9]{12}$`.
pub fn is_item_id(id: &str) -> bool {
    id.len() == 16 && id.starts_with("lib_") && id[4..].bytes().all(|b| matches!(b, b'0'..=b'9' | b'a'..=b'z'))
}

/// A new item id: `lib_` and 12 characters from 9 random bytes (base64url, lowercased, anything else a zero).
pub fn new_item_id() -> String {
    use base64::engine::general_purpose::URL_SAFE_NO_PAD;
    use base64::Engine;
    let random = uuid::Uuid::new_v4();
    let text: String = URL_SAFE_NO_PAD.encode(&random.as_bytes()[..9]).to_lowercase().chars().map(|c| if c.is_ascii_alphanumeric() { c } else { '0' }).collect();
    format!("lib_{}", &text[..12])
}

/// `JSON.stringify(v).length`: UTF-16 code units, as the caps count them.
fn json_len(v: &Value) -> usize {
    json::stringify(v).encode_utf16().count()
}

/// `text(v, max)`: a string cut to `max` UTF-16 units, else "". A cut through a surrogate pair leaves U+FFFD where
/// JavaScript would keep a lone surrogate.
fn text(v: Option<&Value>, max: usize) -> String {
    let Some(s) = v.and_then(Value::as_str) else {
        return String::new();
    };
    let units: Vec<u16> = s.encode_utf16().collect();
    if units.len() <= max {
        return s.to_string();
    }
    String::from_utf16_lossy(&units[..max])
}

/// One placed copy: where it went.
fn normalize_copy(raw: &Value) -> Option<Value> {
    raw.as_object()?;
    let profile_id = text(raw.get("profileId"), 100);
    if profile_id.is_empty() {
        return None;
    }
    let mut copy = Map::new();
    copy.insert("profileId".into(), Value::String(profile_id));
    for (key, max) in [("pageId", 100), ("zoneId", 100), ("itemPath", 100), ("label", MAX_NAME), ("at", 40)] {
        if raw.get(key).is_some_and(Value::is_string) {
            copy.insert(key.into(), Value::String(text(raw.get(key), max)));
        }
    }
    Some(Value::Object(copy))
}

/// `key in raw ? raw[key] : existing ? existing[key] : fallback`, with `None` for undefined.
fn pick<'a>(raw: &'a Value, existing: Option<&'a Value>, key: &str, fallback: Option<&'a Value>) -> Option<&'a Value> {
    if raw.as_object().is_some_and(|fields| fields.contains_key(key)) {
        raw.get(key)
    } else if let Some(e) = existing {
        e.get(key)
    } else {
        fallback
    }
}

/// An item from untrusted JSON, merged over `existing` for an update (its id, kind and createdAt stay), as
/// `normalizeItem` does; `now` is in ms. Returns the item or the 400 message.
pub fn normalize_item(raw: &Value, existing: Option<&Value>, now: i64) -> Result<Value, String> {
    if !raw.is_object() {
        return Err("expected an object".into());
    }
    let kind_value = if let Some(e) = existing { e.get("kind") } else { raw.get("kind") };
    let Some(kind) = kind_value.and_then(Value::as_str).filter(|k| KINDS.contains(k)) else {
        return Err(format!("kind must be one of {}", KINDS.join(", ")));
    };
    if let (Some(e), Some(raw_kind)) = (existing, raw.get("kind")) {
        if e.get("kind") != Some(raw_kind) {
            return Err("kind cannot change".into());
        }
    }
    let (empty_text, empty_list, empty_object) = (Value::String(String::new()), Value::Array(Vec::new()), Value::Object(Map::new()));
    let name = js::trim(&text(pick(raw, existing, "name", Some(&empty_text)), MAX_NAME)).to_string();
    if name.is_empty() {
        return Err("name is required".into());
    }
    let files = pick(raw, existing, "files", Some(&empty_list)).and_then(Value::as_array);
    let Some(files) = files.filter(|f| f.len() <= MAX_FILES && f.iter().all(|f| f.as_str().is_some_and(is_asset_id))) else {
        return Err("files must be asset ids".into());
    };
    let Some(meta) = pick(raw, existing, "meta", Some(&empty_object)).filter(|m| m.is_object()) else {
        return Err("meta must be an object".into());
    };
    if json_len(meta) > MAX_META_BYTES {
        return Err("meta is too large".into());
    }
    let Some(copies) = pick(raw, existing, "copies", Some(&empty_list)).and_then(Value::as_array).filter(|c| c.len() <= MAX_COPIES) else {
        return Err("copies must be a list".into());
    };
    let mut unique: Vec<Value> = Vec::new();
    for file in files {
        if !unique.contains(file) {
            unique.push(file.clone());
        }
    }
    let stamp = Value::String(js::iso_string(now));
    let mut item = Map::new();
    item.insert("id".into(), existing.map_or_else(|| Value::String(new_item_id()), |e| e["id"].clone()));
    item.insert("kind".into(), Value::String(kind.to_string()));
    item.insert("name".into(), Value::String(name));
    if let Some(created) = existing.map_or(Some(&stamp), |e| e.get("createdAt")) {
        item.insert("createdAt".into(), created.clone());
    }
    item.insert("updatedAt".into(), stamp);
    item.insert("files".into(), Value::Array(unique));
    item.insert("meta".into(), meta.clone());
    item.insert("copies".into(), Value::Array(copies.iter().filter_map(normalize_copy).collect()));
    if let Some(data) = pick(raw, existing, "data", None) {
        item.insert("data".into(), data.clone());
    }
    let item = Value::Object(item);
    if json_len(&item) > MAX_ITEM_BYTES {
        return Err("item is too large".into());
    }
    Ok(item)
}

/// The item as the list shows it: large `data` left out, with its size.
pub fn summary_of(item: &Value) -> Value {
    let Some(data) = item.get("data") else {
        return item.clone();
    };
    let size = json_len(data);
    if size <= LIST_DATA_BYTES {
        return item.clone();
    }
    let mut rest = item.as_object().cloned().unwrap_or_default();
    rest.remove("data");
    rest.insert("dataSize".into(), Value::from(size));
    Value::Object(rest)
}

/// The reason a library write is refused, or `None` (`body`: the write sends JSON): the header, then this computer,
/// then the type.
pub fn library_write_refusal(content_type: Option<&str>, header: Option<&str>, peer: Option<&str>, allow_remote: bool, body: bool) -> Option<Refusal> {
    if header != Some("1") {
        return Some(Refusal::new(403, "missing X-Dashboard-Library header"));
    }
    if !allow_remote && !is_loopback(peer) {
        return Some(Refusal::new(403, "library changes are accepted from this computer only"));
    }
    let kind = js::trim(content_type.unwrap_or("").split(';').next().unwrap_or("")).to_lowercase();
    (body && kind != "application/json").then(|| Refusal::new(415, "expected application/json"))
}

/// The items in `dir`, one JSON file each.
pub struct LibraryStore {
    dir: PathBuf,
}

impl LibraryStore {
    pub fn new(dir: PathBuf) -> Self {
        Self { dir }
    }

    fn file_of(&self, id: &str) -> Option<PathBuf> {
        is_item_id(id).then(|| self.dir.join(format!("{id}.json")))
    }

    fn read(file: &Path) -> Option<Value> {
        let item = crate::store::read_json(file)?;
        let valid = item.is_object() && is_item_id(&js::to_property_key(item.get("id"))) && item.get("kind").and_then(Value::as_str).is_some_and(|k| KINDS.contains(&k));
        valid.then_some(item)
    }

    fn write(&self, item: &Value) -> std::io::Result<()> {
        std::fs::create_dir_all(&self.dir)?;
        let file = self.dir.join(format!("{}.json", item["id"].as_str().unwrap_or("")));
        let tmp = self.dir.join(format!("{}.json.{}.tmp", item["id"].as_str().unwrap_or(""), uuid::Uuid::new_v4()));
        std::fs::write(&tmp, json::stringify(item))?;
        std::fs::rename(&tmp, &file)
    }

    /// Every item, newest first.
    pub fn list(&self) -> Vec<Value> {
        let mut items: Vec<Value> = crate::assets::names(&self.dir)
            .into_iter()
            .filter(|n| n.strip_suffix(".json").is_some_and(is_item_id))
            .filter_map(|n| Self::read(&self.dir.join(n)))
            .collect();
        let created = |item: &Value| js::to_property_key(item.get("createdAt"));
        items.sort_by_key(|i| std::cmp::Reverse(created(i)));
        items
    }

    pub fn get(&self, id: &str) -> Option<Value> {
        Self::read(&self.file_of(id)?)
    }

    pub fn create(&self, raw: &Value, now: i64) -> std::io::Result<Result<Value, String>> {
        let made = normalize_item(raw, None, now);
        if let Ok(item) = &made {
            self.write(item)?;
        }
        Ok(made)
    }

    /// `None` when there is no such item (checked before the validation).
    pub fn update(&self, id: &str, raw: &Value, now: i64) -> std::io::Result<Option<Result<Value, String>>> {
        let Some(existing) = self.get(id) else {
            return Ok(None);
        };
        let made = normalize_item(raw, Some(&existing), now);
        if let Ok(item) = &made {
            self.write(item)?;
        }
        Ok(Some(made))
    }

    pub fn remove(&self, id: &str) -> std::io::Result<bool> {
        match self.file_of(id).filter(|f| f.exists()) {
            Some(file) => std::fs::remove_file(file).map(|()| true),
            None => Ok(false),
        }
    }

    /// The raw item files, for the asset store's unused scan.
    pub fn texts(&self) -> Vec<String> {
        crate::assets::names(&self.dir)
            .into_iter()
            .filter(|n| n.ends_with(".json"))
            .map(|n| crate::store::read_text(&self.dir.join(n)).unwrap_or_default())
            .collect()
    }
}

/// A write's JSON body, or the answer that refuses it.
async fn body(app: &App, req: &mut Req) -> Result<Value, Response<Body>> {
    let guard = library_write_refusal(
        req.header("content-type").as_deref(),
        req.header("x-dashboard-library").as_deref(),
        Some(&req.peer),
        app.cfg.allow_remote_upload,
        true,
    );
    if let Some(refusal) = guard {
        return Err(http::text(refusal.status, refusal.message));
    }
    let text = req.read_body(MAX_ITEM_BYTES + 1024).await.map_err(|()| http::closing(http::text(400, BODY_REFUSED)))?;
    json::parse(&text).ok_or_else(|| http::text(400, BODY_REFUSED))
}

fn answer(status: u16, made: Result<Value, String>) -> Response<Body> {
    match made {
        Ok(item) => http::json(status, &item),
        Err(error) => http::text(400, error),
    }
}

/// /api/library and /api/library/<id>.
pub async fn handle(app: &App, mut req: Req) -> std::io::Result<Response<Body>> {
    let now = crate::config::now_ms();
    if req.path == "/api/library" {
        return Ok(match req.method {
            Method::GET => http::json(200, &Value::Array(app.library.list().iter().map(summary_of).collect())),
            Method::POST => match body(app, &mut req).await {
                Ok(raw) => answer(201, app.library.create(&raw, now)?),
                Err(refusal) => refusal,
            },
            _ => http::empty(405),
        });
    }
    let id = req.path["/api/library/".len()..].to_string();
    if !is_item_id(&id) {
        return Ok(http::empty(404));
    }
    Ok(match req.method {
        Method::GET => app.library.get(&id).map_or_else(|| http::empty(404), |item| http::json(200, &item)),
        Method::PUT => match body(app, &mut req).await {
            Ok(raw) => app.library.update(&id, &raw, now)?.map_or_else(|| http::empty(404), |made| answer(200, made)),
            Err(refusal) => refusal,
        },
        Method::DELETE => {
            let guard = library_write_refusal(
                req.header("content-type").as_deref(),
                req.header("x-dashboard-library").as_deref(),
                Some(&req.peer),
                app.cfg.allow_remote_upload,
                false,
            );
            match guard {
                Some(refusal) => http::text(refusal.status, refusal.message),
                None if app.library.remove(&id)? => http::empty(204),
                None => http::empty(404),
            }
        }
        _ => http::empty(405),
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    const NOW: i64 = 1_792_238_400_000;
    fn asset() -> String {
        format!("{}.png", "a".repeat(64))
    }

    #[test]
    fn makes_a_new_item_with_an_id_stamps_and_clean_copies() {
        let raw = json!({ "kind": "image", "name": "  Nebula  ", "files": [asset(), asset()], "meta": { "w": 1920 }, "copies": [{ "profileId": "p", "zoneId": "z", "evil": 1 }, "x"] });
        let item = normalize_item(&raw, None, NOW).unwrap();
        assert!(is_item_id(item["id"].as_str().unwrap()));
        assert_eq!(item["name"], "Nebula");
        assert_eq!(item["createdAt"], js::iso_string(NOW));
        assert_eq!(item["files"], json!([asset()]));
        assert_eq!(item["copies"], json!([{ "profileId": "p", "zoneId": "z" }]));
        assert!(item.get("data").is_none());
    }

    #[test]
    fn refuses_what_is_not_an_item() {
        let error = |raw: Value| normalize_item(&raw, None, NOW).unwrap_err();
        assert_eq!(error(json!([])), "expected an object");
        assert!(error(json!({ "kind": "script", "name": "x" })).starts_with("kind must be one of image, video"));
        assert_eq!(error(json!({ "kind": "gauge", "name": " " })), "name is required");
        assert_eq!(error(json!({ "kind": "image", "name": "x", "files": ["../config.json"] })), "files must be asset ids");
        assert_eq!(error(json!({ "kind": "image", "name": "x", "meta": [] })), "meta must be an object");
        assert_eq!(error(json!({ "kind": "image", "name": "x", "meta": { "s": "x".repeat(70_000) } })), "meta is too large");
        assert_eq!(error(json!({ "kind": "image", "name": "x", "copies": {} })), "copies must be a list");
    }

    #[test]
    fn updates_over_an_existing_item_keeping_its_id_kind_and_creation() {
        let first = normalize_item(&json!({ "kind": "gauge", "name": "Arc", "data": { "shape": "arc" } }), None, NOW).unwrap();
        let later = NOW + 86_400_000;
        let item = normalize_item(&json!({ "name": "Arc copy", "copies": [{ "profileId": "p" }], "id": "lib_other000000" }), Some(&first), later).unwrap();
        assert_eq!(item["id"], first["id"]);
        assert_eq!(item["createdAt"], first["createdAt"]);
        assert_eq!(item["updatedAt"], js::iso_string(later));
        assert_eq!(item["data"], json!({ "shape": "arc" }));
        assert_eq!(normalize_item(&json!({ "kind": "image" }), Some(&first), NOW).unwrap_err(), "kind cannot change");
    }

    #[test]
    fn leaves_large_data_out_of_the_list() {
        let big = normalize_item(&json!({ "kind": "canvas", "name": "c", "data": { "s": "x".repeat(LIST_DATA_BYTES) } }), None, NOW).unwrap();
        let summary = summary_of(&big);
        assert!(summary.get("data").is_none());
        assert!(summary["dataSize"].as_u64().unwrap() > LIST_DATA_BYTES as u64);
        let small = normalize_item(&json!({ "kind": "gauge", "name": "g", "data": { "shape": "arc" } }), None, NOW).unwrap();
        assert_eq!(summary_of(&small), small);
    }

    #[test]
    fn stores_lists_newest_first_and_removes() {
        let dir = tempfile::tempdir().unwrap();
        let store = LibraryStore::new(dir.path().join("library"));
        let a = store.create(&json!({ "kind": "image", "name": "a" }), NOW).unwrap().unwrap();
        let b = store.create(&json!({ "kind": "font", "name": "b" }), NOW + 1000).unwrap().unwrap();
        std::fs::write(dir.path().join("library/lib_broken00000.json"), "{broken").unwrap();
        assert_eq!(store.list().len(), 2);
        assert_eq!(store.list()[0]["id"], b["id"]);
        assert_eq!(store.get(a["id"].as_str().unwrap()).unwrap()["name"], "a");
        assert!(store.update("lib_missing0000", &json!({}), NOW).unwrap().is_none());
        assert_eq!(store.update(a["id"].as_str().unwrap(), &json!({ "name": " " }), NOW).unwrap().unwrap().unwrap_err(), "name is required");
        assert!(store.remove(a["id"].as_str().unwrap()).unwrap());
        assert!(!store.remove(a["id"].as_str().unwrap()).unwrap());
        assert_eq!(store.texts().len(), 2);
    }

    #[test]
    fn guards_library_writes_in_order() {
        let ok = Some("application/json");
        assert!(library_write_refusal(ok, Some("1"), Some("127.0.0.1"), false, true).is_none());
        assert_eq!(library_write_refusal(ok, None, Some("::1"), false, true).unwrap().status, 403);
        assert_eq!(library_write_refusal(Some("text/plain"), Some("1"), Some("::1"), false, true).unwrap().status, 415);
        assert!(library_write_refusal(Some("text/plain"), Some("1"), Some("::1"), false, false).is_none());
        assert_eq!(library_write_refusal(ok, Some("1"), Some("192.168.1.5"), false, true).unwrap().status, 403);
    }
}
