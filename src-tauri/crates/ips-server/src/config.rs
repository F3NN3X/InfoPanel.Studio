// The config store (server.mjs): DATA_DIR/config.json, stored as the studio sends it; its version, which open pages
// compare to decide when to reload; the Settings patches (PATCH /api/config/settings), numbered so a Studio push built
// before one landed gets it applied again; and the config event stream.
//
// GET/POST /api/config, GET/PATCH /api/config/settings, /events/config.

use std::collections::BTreeMap;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use std::time::{SystemTime, UNIX_EPOCH};

use axum::body::{Body, Bytes};
use axum::http::{Method, Response};
use serde_json::Value;
use tokio::sync::mpsc;

use crate::canvases::{referenced_canvas_ids, CanvasStore};
use crate::config_guard::version_refusal;
use crate::config_settings::{apply_settings_patch, reapply_settings, SettingsEntry};
use crate::http::{self, Req};
use crate::request_guard::{config_write_refusal, Refusal};
use crate::{js, json, sse, store, App};

pub const MAX_CONFIG_BYTES: usize = 5 * 1024 * 1024;
/// A Settings window patch: a few keys.
pub const MAX_SETTINGS_BYTES: usize = 16 * 1024;
const SETTINGS_LOG_MAX: usize = 50;

pub fn now_ms() -> i64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map_or(0, |d| d.as_millis() as i64)
}

struct State {
    /// Bumped on every save: a ms clock value, the file's mtime at start.
    version: i64,
    /// The newest Settings patch's revision; starts at the clock so a restart never numbers below what a still-open
    /// Studio saw.
    settings_rev: i64,
    settings_log: Vec<SettingsEntry>,
    listeners: BTreeMap<u64, mpsc::UnboundedSender<Bytes>>,
    next_listener: u64,
}

pub struct ConfigStore {
    file: PathBuf,
    state: Mutex<State>,
}

impl ConfigStore {
    pub fn load(file: &Path) -> Arc<Self> {
        let version = std::fs::metadata(file)
            .and_then(|m| m.modified())
            .ok()
            .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
            .map_or(0, |d| d.as_millis() as i64);
        let state = State { version, settings_rev: now_ms(), settings_log: Vec::new(), listeners: BTreeMap::new(), next_listener: 0 };
        Arc::new(Self { file: file.to_path_buf(), state: Mutex::new(state) })
    }

    pub fn file(&self) -> &Path {
        &self.file
    }

    pub fn version(&self) -> i64 {
        self.state.lock().unwrap().version
    }

    /// The parsed config, or `None` when it is missing or unreadable.
    pub fn read(&self) -> Option<Value> {
        store::read_json(&self.file)
    }

    fn event(state: &State) -> Bytes {
        sse::event(&json::stringify(&serde_json::json!({ "version": state.version, "settingsRev": state.settings_rev })))
    }

    /// Writes `text` as the config, bumps the version and tells every config stream.
    fn save(&self, state: &mut State, text: &str) -> std::io::Result<()> {
        store::write_atomic(&self.file, text.as_bytes())?;
        state.version = now_ms().max(state.version + 1);
        let event = Self::event(state);
        state.listeners.retain(|_, tx| tx.send(event.clone()).is_ok());
        Ok(())
    }

    /// A config stream's receiver, its first event (the version now) already queued, and the registration to drop.
    fn listen(self: &Arc<Self>) -> (mpsc::UnboundedReceiver<Bytes>, Listener) {
        let (tx, rx) = mpsc::unbounded_channel();
        let mut state = self.state.lock().unwrap();
        let _ = tx.send(Self::event(&state));
        let id = state.next_listener;
        state.next_listener += 1;
        state.listeners.insert(id, tx);
        (rx, Listener { store: Arc::clone(self), id })
    }
}

/// A config stream's place in the listeners; dropped with the stream.
struct Listener {
    store: Arc<ConfigStore>,
    id: u64,
}

impl Drop for Listener {
    fn drop(&mut self) {
        self.store.state.lock().unwrap().listeners.remove(&self.id);
    }
}

fn refused(refusal: Refusal) -> Response<Body> {
    http::text(refusal.status, refusal.message)
}

/// GET → the stored bytes; POST → saved verbatim (the only write), behind the edit guards and the downgrade guard.
pub async fn handle_config(app: &App, mut req: Req) -> std::io::Result<Response<Body>> {
    let config = &app.config;
    if req.method == Method::GET {
        if !config.file.exists() {
            return Ok(http::empty(404));
        }
        let rev = config.state.lock().unwrap().settings_rev;
        let bytes = std::fs::read(&config.file)?;
        // X-Settings-Rev goes first, as Node sets it before the others.
        let response = Response::builder()
            .status(200)
            .header("X-Settings-Rev", rev)
            .header("Content-Type", http::JSON_TYPE)
            .header("Cache-Control", "no-store")
            .body(http::chunked(bytes))
            .unwrap_or_default();
        return Ok(response);
    }
    if req.method != Method::POST {
        return Ok(http::empty(405));
    }
    if let Some(response) = app.refuse_remote_edit(&req) {
        return Ok(response);
    }
    if let Some(refusal) = config_write_refusal(req.header("content-type").as_deref(), req.header("x-dashboard-config").as_deref()) {
        return Ok(refused(refusal));
    }
    let Ok(mut body) = req.read_body(MAX_CONFIG_BYTES).await else {
        return Ok(http::closing(http::empty(413)));
    };
    // Must be the config object itself, so a stray client can't clobber it.
    let Some(parsed) = json::parse(&body).filter(Value::is_object) else {
        return Ok(http::text(400, "expected a config object"));
    };
    let mut state = config.state.lock().unwrap();
    // An older build must not overwrite a config a newer one saved.
    if config.file.exists() {
        if let Some(refusal) = version_refusal(&store::read_text(&config.file)?, &parsed) {
            return Ok(refused(refusal));
        }
    }
    // A push built before a Settings patch landed gets that patch again.
    let known_rev = req.header("x-settings-rev").map_or(f64::NAN, |v| js::string_to_number(&v));
    if known_rev.is_finite() && state.settings_log.iter().any(|entry| entry.rev as f64 > known_rev) {
        body = json::stringify(&reapply_settings(parsed, &state.settings_log, known_rev));
    }
    // Every canvasRef must name a file in the canvas store, or its zone would save blank.
    let canvases = CanvasStore::new(&app.cfg.data_dir.join("canvases"));
    let missing: Vec<String> = referenced_canvas_ids(&body).unwrap_or_default().into_iter().filter(|id| !canvases.has(id)).collect();
    if !missing.is_empty() {
        let first: Vec<&str> = missing.iter().take(5).map(String::as_str).collect();
        return Ok(http::text(422, format!("canvas files missing from the store: {}", first.join(", "))));
    }
    config.save(&mut state, &body)?;
    Ok(http::json(200, &serde_json::json!({ "ok": true, "version": state.version })))
}

/// GET `?since=<rev>` → the Settings patches after that revision; PATCH → a patch merged into the saved config.
pub async fn handle_settings(app: &App, mut req: Req) -> std::io::Result<Response<Body>> {
    let config = &app.config;
    if req.method == Method::GET {
        let since = req.query("since").filter(|s| !s.is_empty()).map_or(f64::NAN, |s| js::string_to_number(&s));
        if !since.is_finite() {
            return Ok(http::text(400, "expected ?since=<revision>"));
        }
        let state = config.state.lock().unwrap();
        let patches: Vec<Value> =
            state.settings_log.iter().filter(|e| e.rev as f64 > since).map(|e| serde_json::json!({ "rev": e.rev, "patch": e.patch })).collect();
        return Ok(http::json(200, &serde_json::json!({ "settingsRev": state.settings_rev, "patches": patches })));
    }
    if req.method.as_str() != "PATCH" {
        return Ok(http::empty(405));
    }
    if let Some(response) = app.refuse_remote_edit(&req) {
        return Ok(response);
    }
    if let Some(refusal) = config_write_refusal(req.header("content-type").as_deref(), req.header("x-dashboard-config").as_deref()) {
        return Ok(refused(refusal));
    }
    let Ok(body) = req.read_body(MAX_SETTINGS_BYTES).await else {
        return Ok(http::closing(http::empty(413)));
    };
    let Some(patch) = json::parse(&body) else {
        return Ok(http::text(400, "expected a settings patch"));
    };
    let mut state = config.state.lock().unwrap();
    if !config.file.exists() {
        return Ok(http::text(404, "no config saved yet"));
    }
    let merged = match apply_settings_patch(&config.read().unwrap_or(Value::Null), &patch) {
        Ok(merged) => merged,
        Err(refusal) => return Ok(refused(refusal)),
    };
    // Numbered before the save, so its config event names this revision.
    state.settings_rev += 1;
    let rev = state.settings_rev;
    state.settings_log.push(SettingsEntry { rev, patch });
    if state.settings_log.len() > SETTINGS_LOG_MAX {
        state.settings_log.remove(0);
    }
    config.save(&mut state, &json::stringify(&merged))?;
    Ok(http::json(200, &serde_json::json!({ "ok": true, "version": state.version, "settingsRev": rev })))
}

/// The config stream: the version and the newest Settings revision now, then after each save.
pub fn handle_events(app: &App) -> Response<Body> {
    let (rx, listener) = app.config.listen();
    let client = app.debug.sse_open("config");
    sse::response(rx, app.shutdown.clone(), Box::new((listener, client)))
}
