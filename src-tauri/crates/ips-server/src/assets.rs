// Uploaded media (server/assets.mjs): backgrounds, imported InfoPanel assets, library files and fonts, in
// DATA_DIR/assets, named by content (the SHA-256 of the bytes plus the extension of the sniffed type), so the same file
// uploaded twice is stored once and a URL never changes meaning. A path is only ever built from an id matching the id
// pattern. Uploads and deletes need `X-Dashboard-Asset: 1` and come from this computer unless ALLOW_REMOTE_UPLOAD=1.
//
// GET/POST /api/assets, GET/HEAD/DELETE /api/assets/<id>.

use std::convert::Infallible;
use std::io::SeekFrom;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicUsize, Ordering};

use axum::body::{Body, Bytes};
use axum::http::{Method, Response};
use futures_util::StreamExt;
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use tokio::io::{AsyncReadExt, AsyncSeekExt, AsyncWriteExt};

use crate::asset_types::{
    by_ext, declared_type, hash_of, is_asset_id, limit_of, parse_range, referenced_hashes, sniff_type, upload_quota_refusal, AssetType, Range,
    DEFAULT_MAX_BYTES, HEAD_BYTES, MAX_IN_FLIGHT, SVG_CSP,
};
use crate::http::{self, Req};
use crate::{js, App};

const TEMP_PREFIX: &str = ".upload-";
const CHUNK: usize = 64 * 1024;
const UNSUPPORTED: &str = "unsupported type: png, jpeg, gif, webp, avif, bmp, ico, svg, mp4, webm, mkv, ttf, otf, ttc, woff or woff2";

/// The asset store: its folder, the quota and the uploads running.
pub struct Assets {
    dir: PathBuf,
    max_bytes: f64,
    allow_remote: bool,
    in_flight: AtomicUsize,
}

/// An upload that ended in a refusal: sent with the connection closed.
struct Refused(u16, String);

/// One of the `MAX_IN_FLIGHT` upload slots; given back when dropped.
struct Slot<'a>(&'a AtomicUsize);

impl Drop for Slot<'_> {
    fn drop(&mut self) {
        self.0.fetch_sub(1, Ordering::SeqCst);
    }
}

impl Assets {
    /// The store in `dir`, with the leftovers of uploads a restart cut off removed. `ASSETS_MAX_BYTES` (when above 0)
    /// caps the stored media.
    pub fn new(dir: PathBuf, allow_remote: bool) -> Self {
        let max = std::env::var("ASSETS_MAX_BYTES").map_or(f64::NAN, |v| js::string_to_number(&v));
        let max_bytes = if max > 0.0 { max } else { DEFAULT_MAX_BYTES };
        Self::with_max_bytes(dir, allow_remote, max_bytes)
    }

    fn with_max_bytes(dir: PathBuf, allow_remote: bool, max_bytes: f64) -> Self {
        for name in names(&dir).into_iter().filter(|n| n.starts_with(TEMP_PREFIX)) {
            let _ = std::fs::remove_file(dir.join(name));
        }
        Self { dir, max_bytes, allow_remote, in_flight: AtomicUsize::new(0) }
    }

    /// The file of an asset id, or `None` for anything not an id.
    pub fn path_of(&self, id: &str) -> Option<PathBuf> {
        is_asset_id(id).then(|| self.dir.join(id))
    }

    /// The reason a write (upload / delete) is refused, or `None`.
    fn write_refusal(&self, req: &Req) -> Option<&'static str> {
        if req.header("x-dashboard-asset").as_deref() != Some("1") {
            return Some("missing X-Dashboard-Asset header");
        }
        (!self.allow_remote && !req.is_loopback()).then_some("uploads are accepted from this computer only")
    }

    /// The total size of the entries in the folder (temp files of running uploads included).
    fn dir_bytes(&self) -> u64 {
        names(&self.dir).iter().filter_map(|n| std::fs::metadata(self.dir.join(n)).ok()).map(|m| m.len()).sum()
    }
}

/// The entries of `dir` by name, in the order a directory listing gives on NTFS; empty when it is missing.
pub fn names(dir: &Path) -> Vec<String> {
    let Ok(entries) = std::fs::read_dir(dir) else {
        return Vec::new();
    };
    let mut names: Vec<String> = entries.filter_map(Result::ok).map(|e| e.file_name().to_string_lossy().into_owned()).collect();
    names.sort();
    names
}

fn json_of(id: &str, t: &AssetType, size: u64, mtime: Option<i64>) -> Value {
    match mtime {
        Some(mtime) => json!({ "id": id, "url": format!("/api/assets/{id}"), "type": t.mime, "kind": t.kind, "size": size, "mtime": mtime }),
        None => json!({ "id": id, "url": format!("/api/assets/{id}"), "type": t.mime, "size": size }),
    }
}

/// Every stored asset, newest first.
fn list(assets: &Assets) -> std::io::Result<Vec<Value>> {
    let mut found = Vec::new();
    for id in names(&assets.dir).into_iter().filter(|n| is_asset_id(n)) {
        let meta = std::fs::metadata(assets.dir.join(&id))?;
        let mtime = meta.modified().ok().and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok()).map_or(0, |d| d.as_millis() as i64);
        let t = by_ext(&id[65..]).unwrap_or(&crate::asset_types::TYPES[0]);
        found.push((mtime, json_of(&id, t, meta.len(), Some(mtime))));
    }
    found.sort_by_key(|f| std::cmp::Reverse(f.0));
    Ok(found.into_iter().map(|(_, v)| v).collect())
}

fn handle_list(app: &App, req: &Req) -> std::io::Result<Response<Body>> {
    let mut assets = list(&app.assets)?;
    if req.query("unused").as_deref() == Some("1") {
        let config = &app.cfg.config_file();
        let mut texts = vec![if config.exists() { crate::store::read_text(config)? } else { String::new() }];
        texts.extend(app.library.texts());
        texts.extend(app.canvases.texts());
        let used = referenced_hashes(&texts.join("\n"));
        assets.retain(|a| !used.iter().any(|h| h == hash_of(a["id"].as_str().unwrap_or(""))));
    }
    Ok(http::json(200, &Value::Array(assets)))
}

/// Streams the body into `tmp` while hashing it, refusing it once it passes `limit` or once its first bytes are not
/// the `expected` type. Returns the size and the SHA-256 in hex; the caller deletes `tmp` on a refusal.
async fn receive(mut req: Req, tmp: &Path, limit: u64, expected: &str) -> Result<(u64, String), Refused> {
    let refuse = |status: u16, message: &str| Refused(status, message.to_string());
    let mismatch = || refuse(415, "file content does not match its type");
    let matches_head = |head: &[u8]| sniff_type(head).is_some_and(|t| t.ext == expected);
    let mut file = tokio::fs::OpenOptions::new().write(true).create_new(true).open(tmp).await.map_err(|_| refuse(500, ""))?;
    let mut stream = std::mem::take(&mut req.body).into_data_stream();
    let mut hash = Sha256::new();
    let mut head: Vec<u8> = Vec::new();
    let mut size: u64 = 0;
    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|_| refuse(400, "upload aborted"))?;
        size += chunk.len() as u64;
        if size > limit {
            return Err(refuse(413, ""));
        }
        if head.len() < HEAD_BYTES {
            head.extend_from_slice(&chunk[..chunk.len().min(HEAD_BYTES - head.len())]);
            if head.len() == HEAD_BYTES && !matches_head(&head) {
                return Err(mismatch());
            }
        }
        hash.update(&chunk);
        file.write_all(&chunk).await.map_err(|_| refuse(500, ""))?;
    }
    if size == 0 {
        return Err(refuse(400, "empty body"));
    }
    if !matches_head(&head) {
        return Err(mismatch());
    }
    file.flush().await.map_err(|_| refuse(500, ""))?;
    let digest: String = hash.finalize().iter().map(|b| format!("{b:02x}")).collect();
    Ok((size, digest))
}

async fn handle_upload(app: &App, req: Req) -> std::io::Result<Response<Body>> {
    let assets = &app.assets;
    if let Some(refusal) = assets.write_refusal(&req) {
        return Ok(http::text(403, refusal));
    }
    let Some(declared) = declared_type(req.header("content-type").as_deref()) else {
        return Ok(http::text(415, UNSUPPORTED));
    };
    let limit = limit_of(declared);
    // Close the connection after an early answer instead of reading the rest.
    let length = req.header("content-length").map_or(f64::NAN, |v| js::string_to_number(&v));
    if length > limit as f64 {
        return Ok(http::closing(http::empty(413)));
    }
    // A slot is taken before the size check so two racing uploads can't both pass the in-flight cap.
    let taken = assets.in_flight.fetch_add(1, Ordering::SeqCst);
    let slot = Slot(&assets.in_flight);
    let incoming = if length > 0.0 { length } else { limit as f64 };
    if let Some((status, message)) = upload_quota_refusal(taken, MAX_IN_FLIGHT, assets.dir_bytes() as f64, incoming, assets.max_bytes) {
        return Ok(http::closing(http::text(status, message)));
    }
    std::fs::create_dir_all(&assets.dir)?;
    let tmp = assets.dir.join(format!("{TEMP_PREFIX}{}.tmp", uuid::Uuid::new_v4()));
    let received = receive(req, &tmp, limit, declared.ext).await;
    drop(slot);
    let (size, digest) = match received {
        Ok(done) => done,
        Err(Refused(status, message)) => {
            let _ = std::fs::remove_file(&tmp);
            return Ok(http::closing(http::text(status, message)));
        }
    };
    let id = format!("{digest}.{}", declared.ext);
    let file = assets.dir.join(&id);
    let stored = if file.exists() { std::fs::remove_file(&tmp) } else { std::fs::rename(&tmp, &file) };
    if let Err(e) = stored {
        let _ = std::fs::remove_file(&tmp);
        // A concurrent upload of the same bytes got there first.
        if !file.exists() {
            return Err(e);
        }
    }
    Ok(http::json(200, &json_of(&id, declared, size, None)))
}

fn handle_delete(app: &App, req: &Req, file: &Path) -> std::io::Result<Response<Body>> {
    if let Some(refusal) = app.assets.write_refusal(req) {
        return Ok(http::text(403, refusal));
    }
    if !file.exists() {
        return Ok(http::empty(404));
    }
    std::fs::remove_file(file)?;
    Ok(http::empty(204))
}

/// The bytes `start..start + len` of `file`; a read error ends the response mid-way, as Node destroys it.
fn range_body(file: PathBuf, start: u64, len: u64) -> Body {
    let stream = futures_util::stream::unfold(Some((file, None::<tokio::fs::File>, len)), move |state| async move {
        let (path, open, left) = state?;
        if left == 0 {
            return None;
        }
        let mut handle = match open {
            Some(handle) => handle,
            None => {
                let opened = async {
                    let mut handle = tokio::fs::File::open(&path).await?;
                    handle.seek(SeekFrom::Start(start)).await?;
                    Ok::<_, std::io::Error>(handle)
                };
                match opened.await {
                    Ok(handle) => handle,
                    Err(e) => return Some((Err(e), None)),
                }
            }
        };
        let mut buf = vec![0; CHUNK.min(left as usize)];
        match handle.read(&mut buf).await {
            Ok(0) => None,
            Ok(n) => {
                buf.truncate(n);
                Some((Ok(Bytes::from(buf)), Some((path, Some(handle), left - n as u64))))
            }
            Err(e) => Some((Err(e), None)),
        }
    });
    Body::from_stream(stream)
}

fn serve_asset(req: &Req, file: PathBuf) -> Response<Body> {
    let Ok(meta) = std::fs::metadata(&file) else {
        return http::empty(404);
    };
    let size = meta.len();
    let ext = file.extension().and_then(|e| e.to_str()).unwrap_or("");
    let mut builder = Response::builder()
        .header("Content-Type", by_ext(ext).map_or("application/octet-stream", |t| t.mime))
        .header("Cache-Control", "public, max-age=31536000, immutable")
        .header("X-Content-Type-Options", "nosniff");
    if ext == "svg" {
        builder = builder.header("Content-Security-Policy", SVG_CSP);
    }
    builder = builder.header("Accept-Ranges", "bytes");
    let range = parse_range(req.header("range").as_deref(), size);
    let (status, start, end) = match range {
        Range::Unsatisfiable => {
            let response = builder.status(416).header("Content-Range", format!("bytes */{size}")).header("Content-Length", "0").body(Body::empty());
            return response.unwrap_or_default();
        }
        Range::Span(start, end) => (206, start, end),
        Range::Whole => (200, 0, size.saturating_sub(1)),
    };
    // A zero-size file has no bytes to read: its length is 1 - 0 by the formula, 0 here.
    let len = if size == 0 { 0 } else { end - start + 1 };
    builder = builder.status(status).header("Content-Length", len.to_string());
    if status == 206 {
        builder = builder.header("Content-Range", format!("bytes {start}-{end}/{size}"));
    }
    let body = if req.method == Method::HEAD || size == 0 {
        Body::from_stream(futures_util::stream::empty::<Result<Bytes, Infallible>>())
    } else {
        range_body(file, start, len)
    };
    builder.body(body).unwrap_or_default()
}

/// /api/assets and /api/assets/<id>.
pub async fn handle(app: &App, req: Req) -> std::io::Result<Response<Body>> {
    if req.path == "/api/assets" {
        return match req.method {
            Method::GET => handle_list(app, &req),
            Method::POST => handle_upload(app, req).await,
            _ => Ok(http::empty(405)),
        };
    }
    let Some(file) = app.assets.path_of(&req.path["/api/assets/".len()..]) else {
        return Ok(http::empty(404));
    };
    match req.method {
        Method::GET | Method::HEAD => Ok(serve_asset(&req, file)),
        Method::DELETE => handle_delete(app, &req, &file),
        _ => Ok(http::empty(405)),
    }
}
