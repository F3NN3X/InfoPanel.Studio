// User packs (P12b): theme packs a user brought, in DATA_DIR/packs/<id>/, one folder per pack. The server stores and serves
// them and nothing more: the pack validator (src/looks/pack-validate.ts) runs in the studio at import and again in the
// loader before a pack is worn, and it is the only reader of a pack's meaning. What the server does itself is path safety
// and size: an id and a file are matched against strict patterns before any path is built, the file is canonicalised and
// must stay inside its pack folder (a symlink is never followed), a pack over the caps is not served, and an import is
// refused unless every file is one a pack has (`pack.css` is not: it arrives only through the signing route).
//
// A pack's CSS (L94) is served only under a valid signature of every file in the folder (`pack_sign.rs`): the studio's render
// check runs first, then POST .../sign stores the CSS and its signature together. A `pack.css` with no valid signature, however
// it got there, makes the folder not a pack: not listed, not served. A pack with no CSS needs no signature.
//
// GET /api/packs                list: id, name and size of each pack that is within the caps (`X-User-Packs: off` when switched off)
// POST /api/packs               import: `{ "id", "files": [{ "path", "data" (base64) }] }`, replaces a pack of that id
// POST /api/packs/<id>/sign     `{ "css" (base64), "hash" }`: stores the CSS and signs the pack when `hash` is the pack's with that CSS
// GET/HEAD /api/packs/<id>/<file>   one file, typed by its extension, `nosniff`, a CSP that allows nothing (`pack.css` adds `X-Pack-Signature: valid`, and `pack.json` `X-Pack-Css: 1` when it has one)
// DELETE /api/packs/<id>        remove a pack
// .../trust, .../script-consent, .../fx.js and /api/pack-scripts: a pack's effect script (pack_scripts.rs)
//
// Pack signatures (pack_trust.rs): a pack may carry its publisher's signature (`pack.minisig`) and Themely's countersignature
// (`themely.json`). Its trust is worked out from the files as they are now on every read; the list says it (`trust`), and a pack
// that is Modified or Revoked is refused: still listed with the reason, its files 403. An import of one is refused, and an
// import that replaces a signed pack keeps its key and a rising version (`pack_trust::update_refusal`). A script (`assets/*.js`,
// `SCRIPT_MAX_BYTES`, one per pack) is stored like an asset and served only by the script route.
//
// Writes need `X-Dashboard-Pack: 1` and come from this computer unless ALLOW_REMOTE_UPLOAD=1 (the asset store's rule).
// The rollback switch: `USER_PACKS=off` turns the folder read and every route off (the list is empty, a file is 404, a write
// 403), so the built-in packs are unaffected.

use std::path::{Path, PathBuf};
use std::sync::Mutex;

use axum::body::Body;
use axum::http::{HeaderValue, Method, Response};
use base64::engine::general_purpose::STANDARD;
use base64::Engine;
use serde_json::{json, Value};

use crate::asset_types::SVG_CSP;
use crate::http::{self, Req};
use crate::pack_revocation::Revocations;
use crate::pack_scripts::{self, SCRIPT_MAX_BYTES};
use crate::pack_sign::{self, KEY_FILE};
use crate::pack_trust::{self, Entry, Installed, Publisher, Ring, Trust, Withdrawn};
use crate::widget_keys::KeyStore;
use crate::widget_sign::{Key, Signer};
use crate::{js, store, App};

/// A pack folder is at most this many bytes, a file at most `FILE_MAX_BYTES`, a pack at most `FILE_COUNT_MAX` files
/// (the validator's `PACK_CEILING_BYTES`, `FILE_MAX_BYTES` and `FILE_COUNT_MAX`).
pub const PACK_CEILING_BYTES: u64 = 1_024_000;
pub const FILE_MAX_BYTES: u64 = 256_000;
pub const FILE_COUNT_MAX: usize = 64;
/// An import body: the pack as base64 in JSON, with room for the paths.
const IMPORT_BODY_MAX: usize = (PACK_CEILING_BYTES as usize) * 4 / 3 + 64 * 1024;
/// A signing body: one file as base64, and the hash.
const SIGN_BODY_MAX: usize = (FILE_MAX_BYTES as usize) * 4 / 3 + 1024;

/// At most this many packs, and this many bytes of them in all (the packs a user brings are a few hundred kB each).
pub const PACKS_MAX: usize = 32;
pub const PACKS_TOTAL_BYTES: u64 = 16_000_000;

/// The start of a folder an import writes into; a leftover is swept at start.
const TEMP_PREFIX: &str = ".import-";
/// The start of a replaced pack set aside as `.import-old-<id>-<uuid>`; the sweep puts it back when the pack's own folder is gone.
const ASIDE_PREFIX: &str = ".import-old-";
/// The length of the uuid that ends a set-aside name.
const UUID_LEN: usize = 36;
/// The files at the top of a pack folder, by name.
const ROOT_FILES: [&str; 9] = [
    "pack.json",
    "look.json",
    "icons.json",
    "OFL.txt",
    "thumb.png",
    "thumb.jpg",
    "thumb.webp",
    pack_trust::PUBLISHER_SIG,
    pack_trust::COUNTERSIG,
];
/// The extensions an asset may have (`assets/<name>.<ext>`) and their types. A `.js` is a pack's script: stored, never served here.
const ASSET_EXTS: [&str; 7] = ["woff2", "png", "jpg", "webp", "gif", "svg", "js"];
const NO_PACK_CSS: &str = "an import carries no pack.css: a pack's CSS comes with its signature";
/// A pack's CSS and its signature: in a pack folder, and outside the file set an import or a plain read may name.
const CSS_FILE: &str = "pack.css";
const SIG_FILE: &str = "pack.sig";

/// A name Windows keeps for a device (`con`, `nul`, `com1`, ... with or without an extension): never a pack id or a file's stem.
fn is_device_name(s: &str) -> bool {
    let stem = s.split('.').next().unwrap_or("");
    matches!(stem, "con" | "prn" | "aux" | "nul")
        || (stem.len() == 4 && (stem.starts_with("com") || stem.starts_with("lpt")) && matches!(stem.as_bytes()[3], b'1'..=b'9'))
}

/// A pack id: lowercase letters, digits and hyphens, 1 to 48 characters, not starting with a hyphen, not a Windows device name.
pub fn is_pack_id(s: &str) -> bool {
    (1..=48).contains(&s.len())
        && !is_device_name(s)
        && !s.starts_with('-')
        && s.bytes().all(|b| b.is_ascii_lowercase() || b.is_ascii_digit() || b == b'-')
}

/// An asset's own name (before the extension): the same characters as an id, up to 64.
fn is_asset_name(s: &str) -> bool {
    (1..=64).contains(&s.len())
        && !is_device_name(s)
        && !s.starts_with('-')
        && s.bytes().all(|b| b.is_ascii_lowercase() || b.is_ascii_digit() || b == b'-')
}

/// A file of a pack by its path from the pack folder: one of the fixed names, or `assets/<name>.<ext>`. Nothing else is a
/// path: no separator but the one after `assets`, no dot but the extension's, no `%`, no backslash, colon, NUL or non-ASCII.
pub fn is_pack_file(s: &str) -> bool {
    if ROOT_FILES.contains(&s) {
        return true;
    }
    let Some(name) = s.strip_prefix("assets/") else {
        return false;
    };
    name.rsplit_once('.').is_some_and(|(stem, ext)| is_asset_name(stem) && ASSET_EXTS.contains(&ext))
}

/// The `Content-Type` of a pack file, by its extension.
fn mime_of(file: &str) -> Option<&'static str> {
    Some(match file.rsplit_once('.')?.1 {
        "json" => "application/json; charset=utf-8",
        "woff2" => "font/woff2",
        "png" => "image/png",
        "jpg" => "image/jpeg",
        "webp" => "image/webp",
        "gif" => "image/gif",
        "svg" => "image/svg+xml",
        "txt" | "minisig" => "text/plain; charset=utf-8",
        _ => return None,
    })
}

/// The user-pack store: its folder, whether the folder is read at all, who may write, and what signatures are checked against.
pub struct Packs {
    dir: PathBuf,
    enabled: bool,
    allow_remote: bool,
    /// Held across an import's cap checks and write, and a remove, so two at once cannot both pass the caps.
    write: Mutex<()>,
    /// The publisher keys the user added (Settings › Widget publishers) and the revoke list that ships with the app.
    keys: KeyStore,
    /// Themely's pinned pack key (pack_trust.rs).
    themely: Option<Key>,
    /// Themely's revoke list, fetched (pack_revocation.rs).
    pub revocations: std::sync::Arc<Revocations>,
    /// `PACK_SCRIPTS=off` turns every pack script off.
    scripts_env: bool,
}

impl Packs {
    /// The store in `dir` (DATA_DIR/packs), its signatures checked against `keys`. `USER_PACKS=off` (or `0`) is the rollback switch.
    pub fn new(dir: PathBuf, allow_remote: bool, keys: KeyStore) -> Self {
        let off = |name: &str| matches!(std::env::var(name).ok().as_deref(), Some("off" | "0"));
        let themely = pack_trust::themely_key();
        let revocations = std::sync::Arc::new(Revocations::new(dir.parent().unwrap_or(&dir), themely.clone()));
        let (enabled, scripts_env) = (!off("USER_PACKS"), !off("PACK_SCRIPTS"));
        let packs = Self { dir, enabled, allow_remote, write: Mutex::new(()), keys, themely, revocations, scripts_env };
        packs.sweep();
        packs
    }

    /// Recovers from a crash in an import. A pack set aside whose own folder is gone is put back (the replace died between
    /// its two renames), the newest first when there are several for an id; one whose folder is there is the old copy of a
    /// finished replace and goes. The half-written folders go last, so the only copy of a pack is never deleted.
    fn sweep(&self) {
        if !self.enabled {
            return;
        }
        let Ok(entries) = std::fs::read_dir(&self.dir) else {
            return;
        };
        let (mut asides, mut temps) = (Vec::new(), Vec::new());
        for entry in entries.filter_map(Result::ok) {
            let name = entry.file_name().to_string_lossy().into_owned();
            if !entry.file_type().is_ok_and(|t| t.is_dir()) || !name.starts_with(TEMP_PREFIX) {
                continue;
            }
            match name.strip_prefix(ASIDE_PREFIX) {
                Some(rest) => asides.push((aside_id(&entry.path(), rest), entry.path())),
                None => temps.push(entry.path()),
            }
        }
        asides.sort_by_key(|(_, path)| {
            std::cmp::Reverse((std::fs::metadata(path.join("pack.json")).and_then(|m| m.modified()).ok(), path.clone()))
        });
        let mut kept = false;
        for (id, path) in asides {
            let dest = id.map(|id| self.dir.join(id));
            match dest {
                Some(dest) if std::fs::symlink_metadata(&dest).is_err() => kept |= crate::fs_retry::rename(&path, &dest).is_err(),
                _ => {
                    let _ = std::fs::remove_dir_all(&path);
                }
            }
        }
        if !kept {
            for path in temps {
                let _ = std::fs::remove_dir_all(path);
            }
        }
    }

    /// Stores a checked import: the caps are checked and the pack written under the write lock. The pack is written beside
    /// its place under a name no id has, then moved in, so a half-written pack is never a pack; a replaced pack is set aside
    /// (`.import-old-<id>-<uuid>`, which the sweep puts back after a crash) until the new one is in place.
    #[cfg(test)]
    fn store(&self, id: &str, files: &Files) -> std::io::Result<Result<(), Refused>> {
        self.store_checked(id, files, || None)
    }

    /// `store`, with `check` run under the lock first: it refuses the write when it says why (the update rule, which reads the
    /// pack stored now).
    fn store_checked(&self, id: &str, files: &Files, check: impl FnOnce() -> Option<Refused>) -> std::io::Result<Result<(), Refused>> {
        let _held = self.write.lock().unwrap_or_else(|e| e.into_inner());
        if let Some(refused) = check() {
            return Ok(Err(refused));
        }
        let others: Vec<u64> = listed(self).into_iter().filter(|(other, _)| other != id).map(|(_, bytes)| bytes).collect();
        if others.len() + 1 > PACKS_MAX {
            return Ok(Err(refuse(413, format!("{PACKS_MAX} packs are stored; remove one first"))));
        }
        if others.iter().sum::<u64>() + files.iter().map(|(_, b)| b.len() as u64).sum::<u64>() > PACKS_TOTAL_BYTES {
            return Ok(Err(refuse(413, format!("the packs would take over {PACKS_TOTAL_BYTES} bytes in all; remove one first"))));
        }
        std::fs::create_dir_all(&self.dir)?;
        let temp = self.dir.join(format!("{TEMP_PREFIX}{}", uuid::Uuid::new_v4()));
        let written = (|| -> std::io::Result<()> {
            for (path, bytes) in files {
                let target = temp.join(path);
                if let Some(parent) = target.parent() {
                    std::fs::create_dir_all(parent)?;
                }
                std::fs::write(target, bytes)?;
            }
            let dest = self.dir.join(id);
            let aside = self.dir.join(format!("{ASIDE_PREFIX}{id}-{}", uuid::Uuid::new_v4()));
            let had = std::fs::symlink_metadata(&dest).is_ok();
            if had {
                crate::fs_retry::rename(&dest, &aside)?;
            }
            if let Err(e) = crate::fs_retry::rename(&temp, &dest) {
                if had {
                    let _ = crate::fs_retry::rename(&aside, &dest);
                }
                return Err(e);
            }
            if had {
                let _ = std::fs::remove_dir_all(&aside);
            }
            Ok(())
        })();
        if let Err(e) = written {
            let _ = std::fs::remove_dir_all(&temp);
            return Err(e);
        }
        Ok(Ok(()))
    }

    #[cfg(test)]
    fn with(dir: PathBuf, enabled: bool) -> Self {
        let keys = KeyStore::with(&dir, None, "{}");
        let revocations = std::sync::Arc::new(Revocations::with(&dir, None, None));
        Self { dir, enabled, allow_remote: false, write: Mutex::new(()), keys, themely: None, revocations, scripts_env: true }
    }

    /// The packs folder (the scripts' files sit in it, under names no pack id has).
    pub(crate) fn dir(&self) -> &Path {
        &self.dir
    }

    /// The write lock, for a write beside the packs (a consent, the switch).
    pub(crate) fn lock(&self) -> std::sync::MutexGuard<'_, ()> {
        self.write.lock().unwrap_or_else(|e| e.into_inner())
    }

    /// Whether `PACK_SCRIPTS` leaves scripts on.
    pub(crate) fn scripts_env(&self) -> bool {
        self.scripts_env
    }

    /// What a pack's signatures are checked against now: Themely's key, the keys the user trusts (the owner's included), each
    /// with its "Allow pack scripts", and the revoke lists (the one that ships with the app and Themely's, fetched).
    fn ring(&self) -> Ring {
        let keyring = self.keys.keyring();
        let fetched = self.revocations.list();
        let publishers = keyring
            .trusted
            .iter()
            .filter_map(|t| {
                let name = match &t.signer {
                    Signer::Owner => "InfoPanel Studio".to_string(),
                    Signer::User(name) => name.clone(),
                    Signer::Themely => return None,
                };
                Some(Publisher { name, key: t.key.clone(), scripts: self.keys.allows_pack_scripts(&t.key) })
            })
            .collect();
        let shipped = serde_json::from_str::<Value>(crate::widget_keys::REVOKED).unwrap_or(Value::Null);
        Ring {
            themely: self.themely.clone(),
            publishers,
            revoked_keys: keyring.revoked.into_iter().map(|k| (k, "on the app's revoke list".to_string())).chain(fetched.keys).collect(),
            revoked_packs: Withdrawn::list(shipped.get("packs")).into_iter().chain(fetched.packs).collect(),
        }
    }

    /// The trust of pack `id` as stored now, every file hashed again, with its files; `None` for no such pack.
    pub(crate) fn trust_now(&self, id: &str) -> Option<(Trust, Files)> {
        if !self.enabled || !is_pack_id(id) {
            return None;
        }
        let root = self.pack_dir(id)?;
        self.measured(id, &root)?;
        let files = stored_files(&root)?;
        Some((pack_trust::evaluate(id, &files, &[], &self.ring()), files))
    }

    /// The trust of a stored pack for the list and the file route: an unsigned pack is Unverified without being read, unless a
    /// revoke list names manifests.
    fn trust_of(&self, id: &str, root: &Path) -> Trust {
        let signed = [pack_trust::PUBLISHER_SIG, pack_trust::COUNTERSIG].iter().any(|f| root.join(f).is_file());
        let ring = self.ring();
        let files = (signed || ring.names_manifests()).then(|| stored_files(root)).flatten().unwrap_or_default();
        pack_trust::evaluate(id, &files, &[], &ring)
    }

    /// Why a stored pack is refused (Modified or Revoked), or `None`.
    fn refusal(&self, id: &str, root: &Path) -> Option<String> {
        let trust = self.trust_of(id, root);
        trust.state.refused().then(|| {
            let why = trust.reason.unwrap_or_default();
            if trust.state == pack_trust::State::Revoked {
                format!("withdrawn: {why}")
            } else {
                format!("changed since it was signed: {why}")
            }
        })
    }

    /// The file of `file` in pack `id`, or `None` for anything not a pack file inside its pack folder: the names are
    /// matched first, then the path is canonicalised (links resolved) and must stay under the canonical `packs/<id>/`; a
    /// folder or a file that is a link is refused whatever it points at.
    pub fn path_of(&self, id: &str, file: &str) -> Option<PathBuf> {
        if !self.enabled || !is_pack_id(id) || !is_pack_file(file) {
            return None;
        }
        let root = self.pack_dir(id)?;
        let path = root.join(file);
        if std::fs::symlink_metadata(&path).ok()?.file_type().is_symlink() {
            return None;
        }
        let real = std::fs::canonicalize(&path).ok()?;
        (real.starts_with(&root) && real.is_file()).then_some(real)
    }

    /// Removes a pack under the write lock, so that of two removes at once the second finds it gone. `false`: no such pack.
    fn remove(&self, id: &str) -> std::io::Result<bool> {
        let _held = self.write.lock().unwrap_or_else(|e| e.into_inner());
        let Some(root) = is_pack_id(id).then(|| self.pack_dir(id)).flatten() else {
            return Ok(false);
        };
        std::fs::remove_dir_all(root)?;
        Ok(true)
    }

    /// The canonical folder of pack `id` under the canonical packs folder, when it is a real folder (not a link).
    fn pack_dir(&self, id: &str) -> Option<PathBuf> {
        let base = std::fs::canonicalize(&self.dir).ok()?;
        let dir = base.join(id);
        if std::fs::symlink_metadata(&dir).ok()?.file_type().is_symlink() {
            return None;
        }
        let real = std::fs::canonicalize(&dir).ok()?;
        (real.parent() == Some(base.as_path()) && real.is_dir()).then_some(real)
    }

    /// The folder's file count and bytes when it is a pack that may be served: within the caps and with nothing stray, and
    /// with any `pack.css` under a valid signature (the hash is taken from the files as they are now, on every read).
    fn measured(&self, id: &str, root: &Path) -> Option<(usize, u64)> {
        if std::fs::symlink_metadata(root.join(CSS_FILE)).is_err() {
            return measure(root);
        }
        let done = measure_files(root, true)?;
        self.signed(id, root).then_some(done)
    }

    fn key_file(&self) -> PathBuf {
        self.dir.with_file_name(KEY_FILE)
    }

    fn signed(&self, id: &str, root: &Path) -> bool {
        let (Some(key), Some(files), Ok(signature)) =
            (pack_sign::load_key(&self.key_file()), stored_files(root), std::fs::read(root.join(SIG_FILE)))
        else {
            return false;
        };
        pack_sign::verify(&key, id, &pack_sign::content_hash(&files), &signature)
    }

    /// The bytes of a pack's `pack.css`, when the pack may be served and has one.
    fn signed_css(&self, id: &str) -> Option<Vec<u8>> {
        if !self.enabled || !is_pack_id(id) {
            return None;
        }
        let root = self.pack_dir(id)?;
        self.measured(id, &root)?;
        std::fs::read(root.join(CSS_FILE)).ok()
    }

    /// Stores `css` beside a stored pack and signs the whole, under the write lock, when `claimed` is the hash of what would
    /// then be there: the studio hashed the bytes it checked, so a file that changed since is refused. The signature goes first:
    /// a signature with no `pack.css` beside it means nothing, while a `pack.css` with none would refuse the pack.
    fn sign(&self, id: &str, css: &[u8], claimed: &str) -> std::io::Result<Result<(), Refused>> {
        let _held = self.write.lock().unwrap_or_else(|e| e.into_inner());
        let Some(root) = is_pack_id(id).then(|| self.pack_dir(id)).flatten() else {
            return Ok(Err(refuse(404, "no such pack")));
        };
        if css.is_empty() || css.len() as u64 > FILE_MAX_BYTES {
            return Ok(Err(refuse(413, format!("{CSS_FILE} is empty or over {FILE_MAX_BYTES} bytes"))));
        }
        if let Some(why) = css_deny(css) {
            return Ok(Err(refuse(400, format!("{CSS_FILE} {why}"))));
        }
        // under the lock no writer of ours is mid-way, so a temp file here is a crash's leftover: it counts toward no cap and nothing reads it
        for tmp in [SIG_FILE, CSS_FILE] {
            let _ = std::fs::remove_file(root.join(format!("{tmp}.tmp")));
        }
        let Some(mut files) = stored_files(&root) else {
            return Ok(Err(refuse(409, "the folder is not a pack this server wrote")));
        };
        files.retain(|(path, _)| path != CSS_FILE);
        files.push((CSS_FILE.to_string(), css.to_vec()));
        let size: u64 = files.iter().map(|(_, b)| b.len() as u64).sum();
        let others: u64 = listed(self).into_iter().filter(|(other, _)| other != id).map(|(_, bytes)| bytes).sum();
        if size > PACK_CEILING_BYTES || others + size > PACKS_TOTAL_BYTES {
            return Ok(Err(refuse(
                413,
                format!("the pack is over {PACK_CEILING_BYTES} bytes, or the packs over {PACKS_TOTAL_BYTES} in all"),
            )));
        }
        let hash = pack_sign::content_hash(&files);
        if hash != claimed {
            return Ok(Err(refuse(409, "the stored pack is not the pack that was checked")));
        }
        let key = pack_sign::signing_key(&self.key_file())?;
        store::write_atomic(&root.join(SIG_FILE), &pack_sign::sign(&key, id, &hash))?;
        store::write_atomic(&root.join(CSS_FILE), css)?;
        Ok(Ok(()))
    }

    /// Whether the store is read at all (`USER_PACKS=off`): the render check's page goes with it.
    pub fn enabled(&self) -> bool {
        self.enabled
    }

    /// The reason a write is refused, or `None`.
    pub(crate) fn write_refusal(&self, req: &Req) -> Option<&'static str> {
        if !self.enabled {
            return Some("user packs are off");
        }
        if req.header("x-dashboard-pack").as_deref() != Some("1") {
            return Some("missing X-Dashboard-Pack header");
        }
        (!self.allow_remote && !req.is_loopback()).then_some("packs are accepted from this computer only")
    }
}

/// Why the server will not sign `css`, or `None`: a deny-list behind the loader's allow-list (`user-css.ts`), so a signing request that
/// skipped the studio still cannot carry an escape, an at-rule other than `@keyframes`, markup, a url-like function or a url that leaves
/// the pack. Comments are dropped first, as the grammar drops them, so a note that mentions one of these is no reason to refuse.
fn css_deny(css: &[u8]) -> Option<&'static str> {
    let Ok(text) = std::str::from_utf8(css) else {
        return Some("is not UTF-8");
    };
    let plain = strip_comments(text).to_ascii_lowercase();
    if plain.contains('\\') || plain.contains('<') {
        return Some("holds a backslash or markup");
    }
    if plain.match_indices('@').any(|(at, _)| !is_keyframes_at(&plain[at + 1..])) {
        return Some("holds an at-rule other than @keyframes");
    }
    if ["image-set(", "src("].iter().any(|f| plain.contains(f)) {
        return Some("holds a url-like function");
    }
    plain
        .match_indices("url(")
        .any(|(at, _)| !url_arg(&plain[at + 4..]).is_some_and(is_pack_relative_url))
        .then_some("holds a url that is not a file of the pack")
}

/// Whether what follows an `@` is `keyframes`, white space and the start of a name.
fn is_keyframes_at(rest: &str) -> bool {
    let Some(after) = rest.strip_prefix("keyframes") else {
        return false;
    };
    let name = after.trim_start_matches([' ', '\t', '\n', '\r', '\x0c']);
    name.len() < after.len() && name.starts_with(|c: char| c.is_ascii_alphabetic() || c == '_' || c == '-')
}

/// The argument of a `url(` (`rest` starts after the parenthesis): a quoted string up to its closing quote, or the bare text up to
/// the `)`, white space at either end dropped. `None` when it never closes, or a bare one holds white space or a quote inside.
fn url_arg(rest: &str) -> Option<&str> {
    let ws = [' ', '\t', '\n', '\r', '\x0c'];
    let open = rest.trim_start_matches(ws);
    if let Some(quote) = open.chars().next().filter(|c| *c == '"' || *c == '\'') {
        let body = &open[1..];
        let end = body.find(quote)?;
        return body[end + 1..].trim_start_matches(ws).starts_with(')').then_some(&body[..end]);
    }
    let end = open.find(')')?;
    let arg = open[..end].trim_end_matches(ws);
    (!arg.contains(ws) && !arg.contains(['"', '\'', '('])).then_some(arg)
}

/// One spelling of a url: no control character or backslash, no scheme (a drive letter is one) or root path, no `..` step.
fn plain_relative(u: &str) -> bool {
    if u.is_empty() || u.chars().any(|c| c.is_control() || c == '\\') || u.starts_with('/') {
        return false;
    }
    let scheme = u.find(':').is_some_and(|colon| {
        let s = &u[..colon];
        s.starts_with(|c: char| c.is_ascii_alphabetic()) && s.chars().all(|c| c.is_ascii_alphanumeric() || matches!(c, '+' | '.' | '-'))
    });
    !scheme && !u.split(['/', '?', '#']).any(|step| step == "..")
}

/// `u` with its percent escapes decoded, or `None` for an escape that is not two hex digits or bytes that are not UTF-8.
fn percent_decoded(u: &str) -> Option<String> {
    let bytes = u.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut k = 0;
    while k < bytes.len() {
        if bytes[k] == b'%' {
            let hex = u.get(k + 1..k + 3).filter(|h| h.bytes().all(|b| b.is_ascii_hexdigit()))?;
            out.push(u8::from_str_radix(hex, 16).ok()?);
            k += 3;
        } else {
            out.push(bytes[k]);
            k += 1;
        }
    }
    String::from_utf8(out).ok()
}

/// A url inside the pack, as `isPackRelativeUrl` (`pack-urls.ts`) reads it: relative as written and after each round of
/// percent-decoding, stable within 5 rounds (a server that decodes before it joins the path finds no way out).
fn is_pack_relative_url(url: &str) -> bool {
    let mut u = url.trim().to_string();
    for _ in 0..5 {
        if !plain_relative(&u) {
            return false;
        }
        let Some(next) = percent_decoded(&u) else {
            return false;
        };
        if next == u {
            return true;
        }
        u = next;
    }
    false
}

/// `text` without its comments, read as the CSS tokenizer reads it: a quote opens a string that runs to its closing quote (or the line's
/// end), and a `/*` inside one is text, not a comment, so `"/*" url(//x) "*/"` keeps its `url(`. An unterminated comment is kept as it is.
fn strip_comments(text: &str) -> String {
    let mut plain = String::with_capacity(text.len());
    let mut rest = text;
    while let Some(at) = rest.find(['/', '"', '\'']) {
        let (kept, here) = rest.split_at(at);
        plain.push_str(kept);
        if let Some(body) = here.strip_prefix("/*") {
            match body.find("*/") {
                Some(close) => rest = &body[close + 2..],
                None => {
                    rest = here;
                    break;
                }
            }
            continue;
        }
        let quote = here.as_bytes()[0];
        if quote == b'/' {
            plain.push('/');
            rest = &here[1..];
            continue;
        }
        let end = here[1..].find(|c: char| c == char::from(quote) || c == '\n').map_or(here.len(), |n| n + 2);
        plain.push_str(&here[..end]);
        rest = &here[end..];
    }
    plain.push_str(rest);
    plain
}

/// The pack a set-aside folder holds, from what follows `.import-old-` in its name: the `<id>-<uuid>` an import writes, else
/// (an old-format `<uuid>`, or a name no import wrote) the id in the folder's own `pack.json`.
fn aside_id(path: &Path, rest: &str) -> Option<String> {
    let named = rest.len().checked_sub(UUID_LEN + 1).and_then(|n| {
        let uuid = rest.get(n..)?.strip_prefix('-')?;
        uuid::Uuid::try_parse(uuid).ok()?;
        rest.get(..n)
    });
    let own = || {
        let text = std::fs::read_to_string(path.join("pack.json")).ok()?;
        serde_json::from_str::<Value>(&text).ok()?.get("id")?.as_str().map(str::to_string)
    };
    named.map(str::to_string).or_else(own).filter(|id| is_pack_id(id))
}

/// The file count and total bytes of a pack folder: every file at its top and in `assets/`. A folder with anything else in it
/// (a sub-folder, a link, a stray name, a `pack.css`), a file over its cap or a pack over its caps is `None`: not a pack this server wrote.
fn measure(root: &Path) -> Option<(usize, u64)> {
    measure_files(root, false)
}

/// `measure`, `css` saying whether a `pack.css` belongs. A signature with no CSS beside it is a leftover of no meaning.
fn measure_files(root: &Path, css: bool) -> Option<(usize, u64)> {
    let mut count = 0;
    let mut total = 0;
    for (dir, prefix) in [(root.to_path_buf(), ""), (root.join("assets"), "assets/")] {
        let Ok(entries) = std::fs::read_dir(&dir) else {
            if prefix.is_empty() {
                return None;
            }
            continue;
        };
        for entry in entries.filter_map(Result::ok) {
            let meta = std::fs::symlink_metadata(entry.path()).ok()?;
            let name = entry.file_name().to_string_lossy().into_owned();
            if meta.is_dir() && prefix.is_empty() && name == "assets" {
                continue;
            }
            if prefix.is_empty() && is_writer_tmp(&name) && meta.is_file() {
                continue;
            }
            let top = prefix.is_empty() && (name == SIG_FILE || (css && name == CSS_FILE));
            if !meta.is_file() || !(top || is_pack_file(&format!("{prefix}{name}"))) {
                return None;
            }
            count += 1;
            total += meta.len();
            if meta.len() > FILE_MAX_BYTES {
                return None;
            }
        }
    }
    (count <= FILE_COUNT_MAX && total <= PACK_CEILING_BYTES).then_some((count, total))
}

/// A temp file the signing writer leaves while it works or after a crash (`store::write_atomic`): it belongs to no pack and is no reason
/// to refuse the folder, so a read in that moment still sees the pack.
fn is_writer_tmp(name: &str) -> bool {
    name == format!("{SIG_FILE}.tmp") || name == format!("{CSS_FILE}.tmp")
}

/// Every file of a pack folder but its signature, as the hash reads them: `None` for a folder `measure_files` refuses.
pub(crate) fn stored_files(root: &Path) -> Option<Files> {
    measure_files(root, true)?;
    let mut files = Vec::new();
    for (dir, prefix) in [(root.to_path_buf(), ""), (root.join("assets"), "assets/")] {
        let Ok(entries) = std::fs::read_dir(&dir) else {
            continue;
        };
        for entry in entries.filter_map(Result::ok) {
            let name = entry.file_name().to_string_lossy().into_owned();
            if entry.file_type().ok()?.is_file() && !(prefix.is_empty() && (name == SIG_FILE || is_writer_tmp(&name))) {
                files.push((format!("{prefix}{name}"), std::fs::read(entry.path()).ok()?));
            }
        }
    }
    Some(files)
}

/// The pack ids that are folders in the packs folder and within the caps, sorted.
fn listed(packs: &Packs) -> Vec<(String, u64)> {
    let mut found = Vec::new();
    if !packs.enabled {
        return found;
    }
    let Ok(entries) = std::fs::read_dir(&packs.dir) else {
        return found;
    };
    for entry in entries.filter_map(Result::ok) {
        let id = entry.file_name().to_string_lossy().into_owned();
        let Some(root) = packs.pack_dir(&id).filter(|_| is_pack_id(&id)) else {
            continue;
        };
        if let Some((_, bytes)) = packs.measured(&id, &root).filter(|_| root.join("pack.json").is_file()) {
            found.push((id, bytes));
        }
    }
    found.sort();
    found
}

/// The `name` of a pack's `pack.json` (80 characters at most), else its id.
fn name_of(root: &Path, id: &str) -> String {
    let name = std::fs::read_to_string(root.join("pack.json"))
        .ok()
        .and_then(|t| serde_json::from_str::<Value>(&t).ok())
        .and_then(|v| v.get("name")?.as_str().map(str::to_string));
    name.map_or_else(|| id.to_string(), |n| n.chars().take(80).collect())
}

fn handle_list(app: &App) -> Response<Body> {
    let packs = &app.packs;
    let items: Vec<Value> = listed(packs)
        .into_iter()
        .map(|(id, size)| {
            let root = packs.pack_dir(&id);
            let name = root.as_deref().map_or_else(|| id.clone(), |root| name_of(root, &id));
            let trust = root.as_deref().map(|root| packs.trust_of(&id, root).view());
            json!({ "id": id, "name": name, "size": size, "trust": trust })
        })
        .collect();
    let mut reply = http::json(200, &Value::Array(items));
    if !packs.enabled {
        reply.headers_mut().insert("X-User-Packs", HeaderValue::from_static("off"));
    }
    reply
}

/// The decoded files of an import: path and bytes.
pub(crate) type Files = Vec<(String, Vec<u8>)>;

/// A refused import: its status and message.
struct Refused(u16, String);

fn refuse(status: u16, message: impl Into<String>) -> Refused {
    Refused(status, message.into())
}

/// An import's files checked against the pack's shape: every path one a pack has, no repeat, the caps, `pack.json` and
/// `look.json` there as JSON objects naming the folder's id. Returns the decoded files.
fn checked_import(body: &Value) -> Result<(String, Files), Refused> {
    let id = body.get("id").and_then(Value::as_str).unwrap_or("");
    if !is_pack_id(id) {
        return Err(refuse(400, "the pack id is not lowercase letters, digits and hyphens (48 at most)"));
    }
    let list = body.get("files").and_then(Value::as_array).ok_or_else(|| refuse(400, "no files"))?;
    if list.len() > FILE_COUNT_MAX {
        return Err(refuse(413, format!("{} files, at most {FILE_COUNT_MAX}", list.len())));
    }
    let mut files: Files = Vec::new();
    let mut total = 0u64;
    for f in list {
        let path = f.get("path").and_then(Value::as_str).unwrap_or("");
        if path == "pack.css" {
            return Err(refuse(400, NO_PACK_CSS));
        }
        if !is_pack_file(path) {
            return Err(refuse(400, format!("{} is not a file a pack has", path.chars().take(60).collect::<String>())));
        }
        if files.iter().any(|(p, _)| p == path) {
            return Err(refuse(400, format!("{path} is given twice")));
        }
        let bytes = STANDARD
            .decode(f.get("data").and_then(Value::as_str).unwrap_or(""))
            .map_err(|_| refuse(400, format!("{path} is not base64")))?;
        if bytes.len() as u64 > FILE_MAX_BYTES {
            return Err(refuse(413, format!("{path} is over {FILE_MAX_BYTES} bytes")));
        }
        if path.ends_with(".js") && bytes.len() as u64 > SCRIPT_MAX_BYTES {
            return Err(refuse(413, format!("{path} is over {SCRIPT_MAX_BYTES} bytes, a script's cap")));
        }
        if path.ends_with(".js") && files.iter().any(|(p, _)| p.ends_with(".js")) {
            return Err(refuse(400, "a pack has one script"));
        }
        total += bytes.len() as u64;
        files.push((path.to_string(), bytes));
    }
    if total > PACK_CEILING_BYTES {
        return Err(refuse(413, format!("the pack is over {PACK_CEILING_BYTES} bytes")));
    }
    for name in ["pack.json", "look.json"] {
        let bytes = files.iter().find(|(p, _)| p == name).map(|(_, b)| b).ok_or_else(|| refuse(400, format!("{name} is missing")))?;
        let parsed: Value = serde_json::from_slice(bytes).map_err(|_| refuse(400, format!("{name} is not JSON")))?;
        if parsed.get("id").and_then(Value::as_str) != Some(id) {
            return Err(refuse(400, format!("{name} names another id than {id}")));
        }
    }
    for (path, bytes) in &files {
        if path.ends_with(".json") && serde_json::from_slice::<Value>(bytes).is_err() {
            return Err(refuse(400, format!("{path} is not JSON")));
        }
    }
    Ok((id.to_string(), files))
}

async fn handle_import(app: &App, mut req: Req) -> std::io::Result<Response<Body>> {
    let packs = &app.packs;
    if let Some(refusal) = packs.write_refusal(&req) {
        return Ok(http::text(403, refusal));
    }
    let length = req.header("content-length").map_or(f64::NAN, |v| js::string_to_number(&v));
    if length > IMPORT_BODY_MAX as f64 {
        return Ok(http::closing(http::empty(413)));
    }
    let Ok(text) = req.read_body(IMPORT_BODY_MAX).await else {
        return Ok(http::closing(http::text(413, "the pack is too large")));
    };
    let Ok(body) = serde_json::from_str::<Value>(&text) else {
        return Ok(http::text(400, "the body is not JSON"));
    };
    let (id, files) = match checked_import(&body) {
        Ok(done) => done,
        Err(Refused(status, message)) => return Ok(http::text(status, message)),
    };
    // the CSS the signing route stores next, by its size and hash: the publisher's signature covers it
    let css = body.get("css").and_then(|c| {
        let sha256 = c.get("sha256")?.as_str().filter(|h| h.len() == 64 && h.bytes().all(|b| b.is_ascii_hexdigit()))?;
        Some(Entry { path: CSS_FILE.into(), size: c.get("size")?.as_u64()?, sha256: sha256.to_ascii_lowercase() })
    });
    let next = pack_trust::evaluate(&id, &files, css.as_slice(), &packs.ring());
    let check = || {
        let stored = packs.trust_now(&id).map(|(t, _)| t);
        let why = pack_trust::update_refusal(&next, stored.as_ref(), pack_scripts::installed(packs, &id).as_ref())?;
        Some(refuse(409, why))
    };
    if let Err(Refused(status, message)) = packs.store_checked(&id, &files, check)? {
        return Ok(http::text(status, message));
    }
    if let Some(done) = Installed::after(&next) {
        let _held = packs.lock();
        pack_scripts::record(packs, &id, &done)?;
    }
    let size: u64 = files.iter().map(|(_, b)| b.len() as u64).sum();
    let name = packs.pack_dir(&id).map_or_else(|| id.clone(), |root| name_of(&root, &id));
    Ok(http::json(200, &json!({ "id": id, "name": name, "size": size, "trust": next.view() })))
}

async fn handle_sign(app: &App, mut req: Req, id: &str) -> std::io::Result<Response<Body>> {
    let packs = &app.packs;
    if let Some(refusal) = packs.write_refusal(&req) {
        return Ok(http::text(403, refusal));
    }
    let length = req.header("content-length").map_or(f64::NAN, |v| js::string_to_number(&v));
    if length > SIGN_BODY_MAX as f64 {
        return Ok(http::closing(http::empty(413)));
    }
    let Ok(text) = req.read_body(SIGN_BODY_MAX).await else {
        return Ok(http::closing(http::text(413, "the stylesheet is too large")));
    };
    let Ok(body) = serde_json::from_str::<Value>(&text) else {
        return Ok(http::text(400, "the body is not JSON"));
    };
    let Some(hash) = body.get("hash").and_then(Value::as_str) else {
        return Ok(http::text(400, "no hash"));
    };
    let Ok(css) = STANDARD.decode(body.get("css").and_then(Value::as_str).unwrap_or("")) else {
        return Ok(http::text(400, "css is not base64"));
    };
    if let Err(Refused(status, message)) = packs.sign(id, &css, hash)? {
        return Ok(http::text(status, message));
    }
    Ok(http::json(200, &json!({ "id": id, "signed": true })))
}

fn handle_delete(app: &App, req: &Req, id: &str) -> std::io::Result<Response<Body>> {
    let packs = &app.packs;
    if let Some(refusal) = packs.write_refusal(req) {
        return Ok(http::text(403, refusal));
    }
    Ok(http::empty(if packs.remove(id)? { 204 } else { 404 }))
}

/// One file of a pack: refused whole (413) when the pack is over the caps, typed by its extension.
fn serve_file(app: &App, req: &Req, id: &str, file: &str) -> Response<Body> {
    let packs = &app.packs;
    let Some(path) = packs.path_of(id, file).filter(|_| !file.ends_with(".js")) else {
        return http::empty(404);
    };
    let Some(root) = packs.pack_dir(id).filter(|root| packs.measured(id, root).is_some()) else {
        return http::empty(413);
    };
    if let Some(why) = packs.refusal(id, &root) {
        return http::text(403, why);
    }
    let (Some(mime), Ok(bytes)) = (mime_of(file), std::fs::read(&path)) else {
        return http::empty(404);
    };
    let csp = if file.ends_with(".svg") { SVG_CSP } else { "default-src 'none'; sandbox" };
    let mut reply = file_response(req, mime, csp, bytes);
    // the loader asks for `pack.css` on this word, so a pack with none makes no request that fails
    if file == "pack.json" && path.with_file_name(CSS_FILE).is_file() {
        reply.headers_mut().insert("X-Pack-Css", HeaderValue::from_static("1"));
    }
    reply
}

fn file_response(req: &Req, mime: &str, csp: &str, bytes: Vec<u8>) -> Response<Body> {
    let length = bytes.len();
    Response::builder()
        .status(200)
        .header("Content-Type", mime)
        .header("Content-Length", length.to_string())
        .header("Cache-Control", "no-cache")
        .header("X-Content-Type-Options", "nosniff")
        .header("Content-Security-Policy", csp)
        .body(if req.method == Method::HEAD { Body::empty() } else { Body::from(bytes) })
        .unwrap_or_default()
}

/// A pack's `pack.css`, under its signature: anything else is 404, as for a pack with none. The header is what the loader reads.
fn serve_css(app: &App, req: &Req, id: &str) -> Response<Body> {
    let Some(bytes) = app.packs.signed_css(id) else {
        return http::empty(404);
    };
    if let Some(why) = app.packs.pack_dir(id).and_then(|root| app.packs.refusal(id, &root)) {
        return http::text(403, why);
    }
    let mut reply = file_response(req, "text/css; charset=utf-8", "default-src 'none'; sandbox", bytes);
    reply.headers_mut().insert("X-Pack-Signature", HeaderValue::from_static("valid"));
    reply
}

/// /api/packs and /api/packs/<id>/<file>.
pub async fn handle(app: &App, req: Req) -> std::io::Result<Response<Body>> {
    if req.path == "/api/packs" {
        return match req.method {
            Method::GET => Ok(handle_list(app)),
            Method::POST => handle_import(app, req).await,
            _ => Ok(http::empty(405)),
        };
    }
    let rest = req.path.strip_prefix("/api/packs/").unwrap_or("");
    let (id, file) = rest.split_once('/').map_or((rest, None), |(id, file)| (id, Some(file)));
    match (&req.method, file) {
        (&Method::DELETE, None) => handle_delete(app, &req, id),
        (&Method::POST, Some("sign")) => {
            let id = id.to_string();
            handle_sign(app, req, &id).await
        }
        (&Method::GET, Some("trust")) => Ok(pack_scripts::handle_trust(app, id)),
        (&Method::PUT, Some("script-consent")) => {
            let id = id.to_string();
            pack_scripts::handle_consent(app, req, &id).await
        }
        (&Method::GET | &Method::HEAD, Some("fx.js")) => Ok(pack_scripts::handle_script(app, &req, id)),
        (&Method::GET | &Method::HEAD, Some(CSS_FILE)) => Ok(serve_css(app, &req, id)),
        (&Method::GET | &Method::HEAD, Some(file)) => Ok(serve_file(app, &req, id, file)),
        (&Method::GET | &Method::HEAD | &Method::DELETE, _) => Ok(http::empty(404)),
        _ => Ok(http::empty(405)),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ids_are_lowercase_names_of_at_most_48() {
        for ok in ["a", "my-pack", "0x", &"a".repeat(48)] {
            assert!(is_pack_id(ok), "{ok}");
        }
        for bad in [
            "nul",
            "con",
            "aux",
            "prn",
            "com1",
            "lpt9",
            "com1.x",
            "",
            "-a",
            "A",
            "a_b",
            "a.b",
            "a/b",
            "a\\b",
            "..",
            ".",
            "a%2eb",
            "a b",
            "é",
            "a\0",
            "C:",
            &"a".repeat(49),
        ] {
            assert!(!is_pack_id(bad), "{bad:?}");
        }
    }

    #[test]
    fn windows_device_names_are_not_ids_or_asset_names() {
        for bad in ["nul", "con", "prn", "aux", "com1", "com9", "lpt1", "lpt9"] {
            assert!(!is_pack_id(bad), "{bad}");
            for ext in ["png", "woff2", "svg"] {
                assert!(!is_pack_file(&format!("assets/{bad}.{ext}")), "{bad}.{ext}");
            }
        }
        for ok in ["com0", "com10", "console", "nully", "lpt", "com-1"] {
            assert!(is_pack_id(ok), "{ok}");
        }
    }

    fn names(dir: &Path) -> Vec<String> {
        let mut left: Vec<String> =
            std::fs::read_dir(dir).unwrap().map(|e| e.unwrap().file_name().to_string_lossy().into_owned()).collect();
        left.sort();
        left
    }

    fn marked(root: &Path, text: &str) {
        std::fs::write(root.join("pack.json"), text).unwrap();
    }

    #[test]
    fn a_crash_leftover_with_no_pack_behind_it_is_swept_and_a_pack_is_not() {
        let dir = tempfile::tempdir().unwrap();
        pack(dir.path(), "mine");
        std::fs::create_dir_all(dir.path().join(".import-1/assets")).unwrap();
        Packs::with(dir.path().to_path_buf(), true).sweep();
        assert_eq!(names(dir.path()), ["mine"]);
    }

    const UUID: &str = "11111111-2222-3333-4444-555555555555";

    #[test]
    fn a_crash_after_the_first_rename_puts_the_old_pack_back() {
        // dest is gone: the old pack sits aside and the new one is still in its temp folder
        let dir = tempfile::tempdir().unwrap();
        marked(&pack(dir.path(), &format!(".import-old-my-pack-{UUID}")), "old");
        marked(&pack(dir.path(), ".import-9"), "new");
        Packs::with(dir.path().to_path_buf(), true).sweep();
        assert_eq!(names(dir.path()), ["my-pack"]);
        assert_eq!(std::fs::read_to_string(dir.path().join("my-pack/pack.json")).unwrap(), "old");
    }

    #[test]
    fn a_crash_after_the_second_rename_keeps_the_new_pack() {
        let dir = tempfile::tempdir().unwrap();
        marked(&pack(dir.path(), "my-pack"), "new");
        marked(&pack(dir.path(), &format!(".import-old-my-pack-{UUID}")), "old");
        Packs::with(dir.path().to_path_buf(), true).sweep();
        assert_eq!(names(dir.path()), ["my-pack"]);
        assert_eq!(std::fs::read_to_string(dir.path().join("my-pack/pack.json")).unwrap(), "new");
    }

    #[test]
    fn a_crash_before_the_cleanup_or_during_the_write_loses_nothing() {
        let dir = tempfile::tempdir().unwrap();
        marked(&pack(dir.path(), "mine"), "kept");
        pack(dir.path(), ".import-3");
        Packs::with(dir.path().to_path_buf(), true).sweep();
        assert_eq!(names(dir.path()), ["mine"]);
        assert_eq!(std::fs::read_to_string(dir.path().join("mine/pack.json")).unwrap(), "kept");
    }

    #[test]
    fn an_old_format_leftover_is_put_back_under_the_id_in_its_pack_json() {
        let dir = tempfile::tempdir().unwrap();
        std::fs::create_dir_all(dir.path().join(format!(".import-old-{UUID}"))).unwrap();
        std::fs::write(dir.path().join(format!(".import-old-{UUID}/pack.json")), r#"{"id":"my-pack"}"#).unwrap();
        Packs::with(dir.path().to_path_buf(), true).sweep();
        assert_eq!(names(dir.path()), ["my-pack"]);
    }

    #[test]
    fn a_set_aside_name_without_its_separator_or_uuid_is_not_read_as_an_id() {
        for name in [format!(".import-old-wrongX{UUID}"), format!(".import-old-wrong-{}", "z".repeat(UUID_LEN))] {
            let dir = tempfile::tempdir().unwrap();
            std::fs::create_dir_all(dir.path().join(&name)).unwrap();
            std::fs::write(dir.path().join(&name).join("pack.json"), r#"{"id":"right"}"#).unwrap();
            Packs::with(dir.path().to_path_buf(), true).sweep();
            assert_eq!(names(dir.path()), ["right"], "{name}");
        }
    }

    #[test]
    fn of_several_asides_for_one_id_the_newest_is_put_back() {
        const LATER: &str = "99999999-2222-3333-4444-555555555555";
        let aged = |root: &Path| {
            let long_ago = std::time::SystemTime::now() - std::time::Duration::from_secs(3600);
            std::fs::File::options().write(true).open(root.join("pack.json")).unwrap().set_modified(long_ago).unwrap();
        };
        let dir = tempfile::tempdir().unwrap();
        // whichever way the folder is read, one of these two pairs has its older copy first
        let (older, newer) =
            (pack(dir.path(), &format!(".import-old-first-{UUID}")), pack(dir.path(), &format!(".import-old-first-{LATER}")));
        marked(&older, "old");
        marked(&newer, "new");
        aged(&older);
        let (newer, older) =
            (pack(dir.path(), &format!(".import-old-second-{UUID}")), pack(dir.path(), &format!(".import-old-second-{LATER}")));
        marked(&older, "old");
        marked(&newer, "new");
        aged(&older);
        Packs::with(dir.path().to_path_buf(), true).sweep();
        assert_eq!(names(dir.path()), ["first", "second"]);
        assert_eq!(std::fs::read_to_string(dir.path().join("first/pack.json")).unwrap(), "new");
        assert_eq!(std::fs::read_to_string(dir.path().join("second/pack.json")).unwrap(), "new");
    }

    #[test]
    fn of_two_removes_at_once_one_removes_and_one_finds_nothing() {
        for round in 0..50 {
            let dir = tempfile::tempdir().unwrap();
            let packs = Packs::with(dir.path().to_path_buf(), true);
            pack(dir.path(), "mine");
            let gate = std::sync::Barrier::new(2);
            let removed = std::thread::scope(|scope| {
                let go = || {
                    let (packs, gate) = (&packs, &gate);
                    scope.spawn(move || {
                        gate.wait();
                        packs.remove("mine").unwrap()
                    })
                };
                let (a, b) = (go(), go());
                [a.join().unwrap(), b.join().unwrap()]
            });
            assert_eq!(removed.iter().filter(|gone| **gone).count(), 1, "round {round}: {removed:?}");
        }
    }

    #[test]
    fn two_imports_at_once_cannot_pass_the_pack_cap_together() {
        let files: Files = vec![("pack.json".into(), b"{\"id\":\"x\"}".to_vec())];
        for round in 0..20 {
            let dir = tempfile::tempdir().unwrap();
            let packs = Packs::with(dir.path().to_path_buf(), true);
            for k in 0..PACKS_MAX - 1 {
                pack(dir.path(), &format!("p{k}"));
            }
            let gate = std::sync::Barrier::new(2);
            let stored = std::thread::scope(|scope| {
                let go = |id: &'static str| {
                    let (packs, files, gate) = (&packs, &files, &gate);
                    scope.spawn(move || {
                        gate.wait();
                        packs.store(id, files).unwrap().is_ok()
                    })
                };
                let (a, b) = (go("a"), go("b"));
                [a.join().unwrap(), b.join().unwrap()]
            });
            assert_eq!(stored.iter().filter(|ok| **ok).count(), 1, "round {round}: {stored:?}");
            assert_eq!(listed(&packs).len(), PACKS_MAX);
        }
    }

    #[test]
    fn files_are_a_fixed_set_or_an_asset_of_a_known_type() {
        for ok in [
            "pack.json",
            "look.json",
            "icons.json",
            "OFL.txt",
            "thumb.png",
            "assets/hazard.svg",
            "assets/geist-400.woff2",
            "assets/a.png",
            "assets/a.jpg",
            "assets/a.webp",
            "assets/a.gif",
            "assets/fx.js",
            "pack.minisig",
            "themely.json",
        ] {
            assert!(is_pack_file(ok), "{ok}");
        }
        for bad in [
            "",
            "pack.css",
            "pack.js",
            "Pack.json",
            "../pack.json",
            "assets/../pack.json",
            "assets/..",
            "assets//a.png",
            "/assets/a.png",
            "assets/",
            "assets/a",
            "assets/.png",
            "assets/a.PNG",
            "assets/a.bmp",
            "assets/a.exe",
            "assets/a.svg.png",
            "assets/a/b.png",
            "assets\\a.png",
            "assets/a%2epng",
            "assets/a.png ",
            "assets/a.png\0",
            "assets/é.png",
            "C:/x.png",
            "//x/y.png",
            "assets/a b.png",
            "assets/-a.png",
            "assets/a:b.png",
            "assets/a.png:stream",
            "assets/CON.png",
            "pack.json.",
            "pack.json/",
            "./pack.json",
            "assets/./a.png",
            "LOOK.md",
        ] {
            assert!(!is_pack_file(bad), "{bad:?}");
        }
    }

    #[test]
    fn types_are_by_extension() {
        assert_eq!(mime_of("assets/a.woff2"), Some("font/woff2"));
        assert_eq!(mime_of("assets/a.svg"), Some("image/svg+xml"));
        assert_eq!(mime_of("OFL.txt"), Some("text/plain; charset=utf-8"));
        assert_eq!(mime_of("assets/a.gif"), Some("image/gif"));
        assert_eq!(mime_of("assets/a.bmp"), None);
    }

    fn pack(dir: &Path, id: &str) -> PathBuf {
        let root = dir.join(id);
        std::fs::create_dir_all(root.join("assets")).unwrap();
        std::fs::write(root.join("pack.json"), format!(r#"{{"id":"{id}","name":"N"}}"#)).unwrap();
        root
    }

    #[test]
    fn a_path_is_inside_its_pack_or_none() {
        let dir = tempfile::tempdir().unwrap();
        let packs = Packs::with(dir.path().join("packs"), true);
        let root = pack(&dir.path().join("packs"), "mine");
        std::fs::write(root.join("assets/a.png"), b"x").unwrap();
        std::fs::write(dir.path().join("secret.json"), b"no").unwrap();
        assert!(packs.path_of("mine", "pack.json").is_some());
        assert!(packs.path_of("mine", "assets/a.png").is_some());
        assert!(packs.path_of("mine", "look.json").is_none(), "missing");
        assert!(packs.path_of("other", "pack.json").is_none(), "no such pack");
        assert!(packs.path_of("mine", "../secret.json").is_none());
        assert!(packs.path_of("..", "secret.json").is_none());
        assert!(Packs::with(dir.path().join("packs"), false).path_of("mine", "pack.json").is_none(), "switched off");
    }

    #[cfg(windows)]
    fn link_file(target: &Path, link: &Path) -> std::io::Result<()> {
        std::os::windows::fs::symlink_file(target, link)
    }

    #[cfg(unix)]
    fn link_file(target: &Path, link: &Path) -> std::io::Result<()> {
        std::os::unix::fs::symlink(target, link)
    }

    #[test]
    fn a_link_out_of_the_pack_is_not_followed() {
        let dir = tempfile::tempdir().unwrap();
        let packs = Packs::with(dir.path().join("packs"), true);
        let root = pack(&dir.path().join("packs"), "mine");
        std::fs::write(dir.path().join("secret.json"), b"no").unwrap();
        let linked = link_file(&dir.path().join("secret.json"), &root.join("look.json"));
        if linked.is_err() {
            eprintln!("no symlink right here: the link case is skipped");
            return;
        }
        assert!(packs.path_of("mine", "look.json").is_none());
    }

    #[test]
    fn a_pack_is_measured_and_a_stray_file_or_an_over_cap_pack_is_not_a_pack() {
        let dir = tempfile::tempdir().unwrap();
        let root = pack(dir.path(), "mine");
        assert_eq!(measure(&root).map(|m| m.0), Some(1));
        std::fs::write(root.join("assets/big.png"), vec![0u8; FILE_MAX_BYTES as usize + 1]).unwrap();
        assert!(measure(&root).is_none(), "a file over its cap");
        std::fs::remove_file(root.join("assets/big.png")).unwrap();
        // files at the per-file cap, one more than the pack's cap holds
        for k in 0..=PACK_CEILING_BYTES / FILE_MAX_BYTES {
            std::fs::write(root.join(format!("assets/f{k}.png")), vec![0u8; FILE_MAX_BYTES as usize]).unwrap();
        }
        assert!(measure(&root).is_none(), "over the pack's cap");
        std::fs::remove_dir_all(root.join("assets")).unwrap();
        std::fs::create_dir_all(&root).unwrap();
        std::fs::write(root.join("pack.css"), b"").unwrap();
        assert!(measure(&root).is_none(), "a stray name");
    }

    fn files(list: &[(&str, &str)]) -> Value {
        let files: Vec<Value> = list.iter().map(|(p, c)| json!({ "path": p, "data": STANDARD.encode(c) })).collect();
        json!({ "id": "mine", "files": files })
    }

    #[test]
    fn the_css_deny_list_lets_keyframes_through_and_no_other_at_rule() {
        let deny = |css: &str| css_deny(css.as_bytes());
        for ok in [
            "@keyframes pack-x { to { opacity: 1; } }",
            "@KEYFRAMES\n\tpack-x { to { opacity: 1; } }",
            "@keyframes _x{}",
            "/* @import url(https://x.test/a.css) */ [data-part=\"num\"] { color: #fff; }",
        ] {
            assert_eq!(deny(ok), None, "{ok}");
        }
        for bad in [
            "@import \"a.css\";",
            "@font-face { font-family: pack-x; }",
            "@media screen { a { color: red; } }",
            "@-webkit-keyframes pack-x {}",
            "@keyframes{}",
            "@keyframes 1x {}",
            "@keyframespack-x {}",
            "a { content: \"@\"; }",
            "a { color: \\72 ed; }",
            "<style>",
        ] {
            assert!(deny(bad).is_some(), "{bad}");
        }
    }

    #[test]
    fn the_css_deny_list_lets_a_url_through_only_when_it_names_a_file_of_the_pack() {
        let deny = |css: &str| css_deny(css.as_bytes());
        for ok in [
            "a { mask-image: url(a.svg); }",
            "a { background: url(\"img/b.png\"); }",
            "a { background: URL( 'assets/c.png' ); }",
            "a { background: url(assets/a%20b.png); }",
        ] {
            assert_eq!(deny(ok), None, "{ok}");
        }
        for bad in [
            "a { background: url(http://x.test/a.png); }",
            "a { background: url(/x); }",
            "a { background: url(../x); }",
            "a { background: url(%2e%2e/x); }",
            "a { background: url(%252e%252e/x); }",
            "a { background: url(c:x); }",
            "a { background: url(//x.test/a.png); }",
            "a { background: url(assets/../../x); }",
            "a { background: url(\"javascript:alert(1)\"); }",
            "a { background: url(a%zz.png); }",
            "a { background: url(a%ff.png); }",
            "a { background: url(\"a.png\" x); }",
            "a { background: url(a b.png); }",
            "a { background: url(); }",
            "a { background: url(a.png; }",
            "a { background: image-set(\"a.png\" 1x); }",
            "@font-face { src(\"a.woff2\"); }",
        ] {
            assert!(deny(bad).is_some(), "{bad}");
        }
    }

    #[test]
    fn an_import_needs_both_json_files_naming_the_id_and_refuses_pack_css() {
        let ok = [("pack.json", r#"{"id":"mine"}"#), ("look.json", r#"{"id":"mine"}"#)];
        assert!(checked_import(&files(&ok)).is_ok());
        let refused = |list: &[(&str, &str)]| checked_import(&files(list)).err().map(|Refused(s, _)| s);
        assert_eq!(refused(&[("pack.json", r#"{"id":"mine"}"#)]), Some(400), "look.json missing");
        assert_eq!(refused(&[("pack.json", r#"{"id":"x"}"#), ("look.json", r#"{"id":"mine"}"#)]), Some(400), "another id");
        assert_eq!(refused(&[ok[0], ok[1], ("pack.css", "a{}")]), Some(400));
        assert_eq!(refused(&[ok[0], ok[1], ("../x.json", "{}")]), Some(400));
        assert_eq!(refused(&[ok[0], ok[1], ("pack.json", "{}")]), Some(400), "twice");
        assert_eq!(refused(&[ok[0], ("look.json", "nope")]), Some(400), "not JSON");
        let big = "a".repeat(FILE_MAX_BYTES as usize + 1);
        assert_eq!(refused(&[ok[0], ok[1], ("OFL.txt", &big)]), Some(413));
        let mut many: Vec<(String, &str)> = (0..FILE_COUNT_MAX).map(|k| (format!("assets/f{k}.png"), "x")).collect();
        many.extend([("pack.json".to_string(), ok[0].1), ("look.json".to_string(), ok[1].1)]);
        let many: Vec<(&str, &str)> = many.iter().map(|(p, c)| (p.as_str(), *c)).collect();
        assert_eq!(refused(&many), Some(413), "over 64 files");
        assert!(checked_import(&json!({ "id": "Bad", "files": [] })).is_err());
    }
}
