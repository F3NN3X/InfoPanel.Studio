// The canvas store (server/canvases.mjs): the stored form of each imported canvas, kept out of the config. Each is one
// JSON file in DATA_DIR/canvases, named `cnv_<first 32 hex of the SHA-256 of its bytes>`, and a canvas zone in the
// config holds only its `canvasRef`. A file never changes once written; there is no delete route, but `sweep` deletes
// the files the stored config no longer references once they are an hour old.
//
// POST /api/canvases, GET /api/canvases/<id>.

use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use std::time::{SystemTime, UNIX_EPOCH};

use axum::body::Body;
use axum::http::{Method, Response};
use serde_json::Value;
use sha2::{Digest, Sha256};

use crate::config::now_ms;
use crate::http::{self, Req};
use crate::request_guard::Refusal;
use crate::{json, App};

pub const CANVAS_FORMAT: &str = "infopanel-canvas";
/// The largest canvas (as the library's largest item: a whole imported profile).
pub const MAX_CANVAS_BYTES: usize = 8 * 1024 * 1024;
/// How long an unreferenced file is kept: a studio's save of a canvas and of its config never races the sweep.
pub const SWEEP_GRACE_MS: f64 = 60.0 * 60.0 * 1000.0;
/// The sweep runs at most this often (at start and after config saves).
pub const SWEEP_EVERY_MS: i64 = 10 * 60 * 1000;

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

/// `put`'s temporary file: `<id>.json.<uuid>.tmp`.
fn is_tmp_name(name: &str) -> bool {
    let Some(rest) = name.strip_suffix(".tmp") else { return false };
    let Some((id, uuid)) = rest.split_once(".json.") else { return false };
    let hex = |s: &str, n: usize| s.len() == n && s.bytes().all(|b| matches!(b, b'0'..=b'9' | b'a'..=b'f'));
    let parts: Vec<&str> = uuid.split('-').collect();
    is_canvas_id(id) && parts.len() == 5 && [8, 4, 4, 4, 12].iter().zip(&parts).all(|(n, p)| hex(p, *n))
}

/// The id of a canvas's bytes.
pub fn canvas_id_of(text: &str) -> String {
    let digest: String = Sha256::digest(text.as_bytes()).iter().take(16).map(|b| format!("{b:02x}")).collect();
    format!("cnv_{digest}")
}

/// The reason `text` is not a stored canvas, or `None`.
pub fn canvas_refusal(text: &str) -> Option<&'static str> {
    if text.len() > MAX_CANVAS_BYTES {
        return Some("canvas is too large");
    }
    let Some(parsed) = json::parse(text) else {
        return Some("expected JSON");
    };
    (parsed.get("format").and_then(Value::as_str) != Some(CANVAS_FORMAT) || !parsed.is_object())
        .then_some("expected a canvas (format \"infopanel-canvas\")")
}

/// The reason a canvas write is refused, or `None`: the header, then this computer, then JSON.
pub fn canvas_write_refusal(content_type: Option<&str>, header: Option<&str>, peer: Option<&str>, allow_remote: bool) -> Option<Refusal> {
    if header != Some("1") {
        return Some(Refusal::new(403, "missing X-Dashboard-Canvas header"));
    }
    if !allow_remote && !crate::request_guard::is_loopback(peer) {
        return Some(Refusal::new(403, "canvas changes are accepted from this computer only"));
    }
    let kind = crate::js::trim(content_type.unwrap_or("").split(';').next().unwrap_or("")).to_lowercase();
    (kind != "application/json").then(|| Refusal::new(415, "expected application/json"))
}

/// The canvases in `dir`, one JSON file each.
pub struct CanvasStore {
    dir: PathBuf,
}

impl CanvasStore {
    pub fn new(dir: &Path) -> Self {
        Self { dir: dir.to_path_buf() }
    }

    fn file_of(&self, id: &str) -> Option<PathBuf> {
        is_canvas_id(id).then(|| self.dir.join(format!("{id}.json")))
    }

    /// Whether the store has a file for `id`.
    pub fn has(&self, id: &str) -> bool {
        self.file_of(id).is_some_and(|f| f.exists())
    }

    /// The canvas's JSON text, or `None`.
    pub fn get(&self, id: &str) -> Option<String> {
        crate::store::read_text(&self.file_of(id)?).ok()
    }

    /// Stores a canvas's JSON text: its id (the same for the same bytes), or the reason it is refused.
    pub fn put(&self, text: &str) -> std::io::Result<Result<String, &'static str>> {
        if let Some(error) = canvas_refusal(text) {
            return Ok(Err(error));
        }
        let id = canvas_id_of(text);
        let file = self.dir.join(format!("{id}.json"));
        if file.exists() {
            // Sent again: young again, so the sweep leaves it until a config can reference it.
            std::fs::OpenOptions::new().write(true).open(&file)?.set_modified(SystemTime::now())?;
        } else {
            std::fs::create_dir_all(&self.dir)?;
            let tmp = self.dir.join(format!("{id}.json.{}.tmp", uuid::Uuid::new_v4()));
            std::fs::write(&tmp, text)?;
            std::fs::rename(&tmp, &file)?;
        }
        Ok(Ok(id))
    }

    /// Deletes the canvas files `config_text` does not reference that were last written over `grace_ms` ago (a studio
    /// saves a canvas, then the config that references it), and the leftovers of writes that never finished. A text
    /// that is not a config deletes nothing. Returns the ids (the names, for a leftover) deleted.
    pub fn sweep(&self, config_text: &str, now: f64, grace_ms: f64) -> Vec<String> {
        let Some(keep) = referenced_canvas_ids(config_text) else {
            return Vec::new();
        };
        let mut deleted = Vec::new();
        for name in crate::assets::names(&self.dir) {
            let tmp = is_tmp_name(&name);
            let id = name.strip_suffix(".json").unwrap_or("");
            if !tmp && (!is_canvas_id(id) || keep.iter().any(|k| k == id)) {
                continue;
            }
            let file = self.dir.join(&name);
            // Gone or locked: the next sweep tries again.
            let Some(mtime) = std::fs::metadata(&file).ok().and_then(|m| m.modified().ok()).and_then(|t| t.duration_since(UNIX_EPOCH).ok()) else {
                continue;
            };
            if now - mtime.as_secs_f64() * 1000.0 <= grace_ms || std::fs::remove_file(&file).is_err() {
                continue;
            }
            deleted.push(if tmp { name } else { id.to_string() });
        }
        deleted
    }

    /// The raw canvas files, for the asset store's unused scan.
    pub fn texts(&self) -> Vec<String> {
        crate::assets::names(&self.dir)
            .into_iter()
            .filter(|n| n.strip_suffix(".json").is_some_and(is_canvas_id))
            .map(|n| crate::store::read_text(&self.dir.join(n)).unwrap_or_default())
            .collect()
    }
}

/// The sweep's schedule: at start and after config saves, at most every `SWEEP_EVERY_MS`, off the request that
/// triggered it.
pub struct Sweeper {
    store: Arc<CanvasStore>,
    config_file: PathBuf,
    last: Mutex<Option<i64>>,
}

impl Sweeper {
    pub fn new(store: Arc<CanvasStore>, config_file: PathBuf) -> Arc<Self> {
        Arc::new(Self { store, config_file, last: Mutex::new(None) })
    }

    pub fn trigger(&self) {
        let now = now_ms();
        {
            let mut last = self.last.lock().unwrap();
            if last.is_some_and(|at| now - at < SWEEP_EVERY_MS) {
                return;
            }
            *last = Some(now);
        }
        let (store, config_file) = (Arc::clone(&self.store), self.config_file.clone());
        let Ok(runtime) = tokio::runtime::Handle::try_current() else { return };
        runtime.spawn_blocking(move || {
            if !config_file.exists() {
                return;
            }
            match crate::store::read_text(&config_file) {
                Ok(text) => {
                    store.sweep(&text, now as f64, SWEEP_GRACE_MS);
                }
                Err(e) => log::error!(target: "server", "canvas sweep failed: {e}"),
            }
        });
    }
}

/// POST /api/canvases with a canvas -> `{ id }`, GET /api/canvases/<id> -> the canvas.
pub async fn handle(app: &App, mut req: Req) -> std::io::Result<Response<Body>> {
    if req.path == "/api/canvases" {
        if req.method != Method::POST {
            return Ok(http::empty(405));
        }
        let guard = canvas_write_refusal(
            req.header("content-type").as_deref(),
            req.header("x-dashboard-canvas").as_deref(),
            Some(&req.peer),
            app.cfg.allow_remote_upload,
        );
        if let Some(refusal) = guard {
            return Ok(http::text(refusal.status, refusal.message));
        }
        let Ok(text) = req.read_body(MAX_CANVAS_BYTES).await else {
            return Ok(http::closing(http::empty(413)));
        };
        return Ok(match app.canvases.put(&text)? {
            Ok(id) => http::json(200, &serde_json::json!({ "id": id })),
            Err(error) => http::text(400, error),
        });
    }
    let id = &req.path["/api/canvases/".len()..];
    if !is_canvas_id(id) {
        return Ok(http::empty(404));
    }
    if req.method != Method::GET {
        return Ok(http::empty(405));
    }
    Ok(app.canvases.get(id).map_or_else(|| http::empty(404), |text| http::send(200, text, http::JSON_TYPE)))
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    const HOUR: f64 = SWEEP_GRACE_MS;

    fn canvas(name: &str) -> String {
        format!(r#"{{"format":"infopanel-canvas","version":1,"source":{{"name":"{name}"}},"items":[]}}"#)
    }

    fn config_of(refs: &[&str]) -> String {
        let placements: Vec<Value> = refs.iter().map(|r| json!({ "canvasRef": r })).collect();
        json!({ "profiles": [{ "pages": [{ "placements": placements }] }] }).to_string()
    }

    fn age(dir: &Path, name: &str, ms: f64) {
        let file = std::fs::OpenOptions::new().write(true).open(dir.join(name)).unwrap();
        file.set_modified(SystemTime::now() - std::time::Duration::from_millis(ms as u64)).unwrap();
    }

    #[test]
    fn stores_by_content_and_refuses_what_is_not_a_canvas() {
        let dir = tempfile::tempdir().unwrap();
        let store = CanvasStore::new(&dir.path().join("canvases"));
        let text = canvas("A");
        let id = store.put(&text).unwrap().unwrap();
        assert_eq!(id, canvas_id_of(&text));
        assert!(is_canvas_id(&id));
        assert_eq!(store.get(&id).as_deref(), Some(text.as_str()));
        assert_eq!(store.put(&text).unwrap().unwrap(), id);
        assert_eq!(store.texts(), vec![text]);
        assert_eq!(store.put("{}").unwrap(), Err("expected a canvas (format \"infopanel-canvas\")"));
        assert_eq!(store.put("[]").unwrap(), Err("expected a canvas (format \"infopanel-canvas\")"));
        assert_eq!(store.put("{broken").unwrap(), Err("expected JSON"));
        assert!(store.get("../config").is_none());
        assert!(store.get("cnv_0123456789abcdef0123456789abcdef").is_none());
    }

    #[test]
    fn sweeps_only_unreferenced_files_past_the_grace_period() {
        let dir = tempfile::tempdir().unwrap();
        let canvases = dir.path().join("canvases");
        let store = CanvasStore::new(&canvases);
        let [kept, young, old] = ["referenced", "young", "old"].map(|n| store.put(&canvas(n)).unwrap().unwrap());
        age(&canvases, &format!("{kept}.json"), 48.0 * HOUR);
        age(&canvases, &format!("{young}.json"), HOUR / 2.0);
        age(&canvases, &format!("{old}.json"), 2.0 * HOUR);
        let leftover = |uuid: &str, ms: f64| {
            let name = format!("cnv_{}.json.{uuid}.tmp", "b".repeat(32));
            std::fs::write(canvases.join(&name), "{").unwrap();
            age(&canvases, &name, ms);
            name
        };
        let old_tmp = leftover("0f8e2a1c-3b4d-4e5f-8a9b-0c1d2e3f4a5b", 2.0 * HOUR);
        let young_tmp = leftover("1f8e2a1c-3b4d-4e5f-8a9b-0c1d2e3f4a5b", HOUR / 2.0);
        let now = now_ms() as f64;
        assert_eq!(store.sweep("{broken", now, SWEEP_GRACE_MS), Vec::<String>::new());
        assert_eq!(store.sweep("{}", now, SWEEP_GRACE_MS), Vec::<String>::new());
        let mut deleted = store.sweep(&config_of(&[&kept]), now, SWEEP_GRACE_MS);
        deleted.sort();
        let mut want = vec![old.clone(), old_tmp];
        want.sort();
        assert_eq!(deleted, want);
        assert!(store.has(&kept) && store.has(&young) && !store.has(&old));
        assert!(canvases.join(young_tmp).exists());
    }

    #[test]
    fn never_touches_files_that_are_not_canvas_ids_and_renews_a_resent_file() {
        let dir = tempfile::tempdir().unwrap();
        let canvases = dir.path().join("canvases");
        let store = CanvasStore::new(&canvases);
        let id = store.put(&canvas("x")).unwrap().unwrap();
        let others = ["notes.json", "cnv_short.json", &format!("cnv_{}.json.1234.tmp", "a".repeat(32))];
        for name in others {
            std::fs::write(canvases.join(name), "{}").unwrap();
        }
        let far = now_ms() as f64 + 48.0 * HOUR;
        assert_eq!(store.sweep(&config_of(&[]), far, SWEEP_GRACE_MS), vec![id.clone()]);
        let id = store.put(&canvas("again")).unwrap().unwrap();
        age(&canvases, &format!("{id}.json"), 2.0 * HOUR);
        store.put(&canvas("again")).unwrap().unwrap();
        assert!(store.sweep(&config_of(&[]), now_ms() as f64, SWEEP_GRACE_MS).is_empty());
    }

    #[test]
    fn guards_canvas_writes_in_order() {
        let ok = Some("application/json");
        assert!(canvas_write_refusal(ok, Some("1"), Some("127.0.0.1"), false).is_none());
        assert_eq!(canvas_write_refusal(ok, None, Some("127.0.0.1"), false).unwrap().status, 403);
        assert_eq!(canvas_write_refusal(Some("text/plain"), Some("1"), Some("::1"), false).unwrap().status, 415);
        assert_eq!(canvas_write_refusal(ok, Some("1"), Some("192.168.1.5"), false).unwrap().status, 403);
        assert!(canvas_write_refusal(ok, Some("1"), Some("192.168.1.5"), true).is_none());
    }
}
