// User widgets (Phase 5a): widget packages a user brought, in DATA_DIR/widgets/<key>/, one folder per package. The package
// format is one for recipes (now) and code widgets (Phase 6): `manifest.json` lists every other file with its size and SHA-256,
// then the files. The server stores and serves packages and nothing more, as it does packs (packs.rs): the recipe validator
// (src/widgets/recipe/validate.ts) runs in the studio at import and again in the kiosk every time a recipe is loaded, and is the
// only reader of a recipe's meaning. What the server does itself is path safety, size, and the manifest: a key and a file are
// matched against strict patterns before any path is built, a file is canonicalised and must stay inside its folder (a link is
// never followed), and a folder whose files are not exactly the manifest's, byte for byte (the hashes are taken on every read),
// is not a package: not listed, not served.
//
// A package's key is its id with the namespace's colon as a dot (`recipe:cpu-card` is `recipe.cpu-card`, `ext:acme.clock` is
// `ext.acme.clock`), safe in a route and a folder name (Gate 0 answer 5).
//
// Code widgets (Phase 6a: kind `code`, id `ext:<publisher>.<id>`, an ES-module bundle `widget.js`) must carry a publisher signature
// (widget_sign.rs) from a key this app trusts (widget_keys.rs); a recipe may carry one, and is refused when it does not verify.
// The signature is checked on import and on every read (the list, each file): a package whose signature no longer verifies (its key
// removed or revoked) is listed with `trust: "refused:<reason>"` and its files are 403. A code widget's key must hold the id's
// publisher (widget_keys.rs), and an import never replaces a signed package unless the same key signed it (409): no key can take
// over another's namespace or package. Nothing here runs a bundle: the studio and the kiosk import `widget.js` from this route (Phase
// 6b), and only once the list says it verifies. `USER_CODE_WIDGETS=off` hides and refuses every code widget, as `USER_WIDGETS=off`
// does every package.
//
// The Widgets page's switches (Phase 6b) are the server's too, so every page that asks this server obeys them, a kiosk on another
// device included: DATA_DIR/widgets/.code.json `{ "on": bool, "off": [id] }`. With `on` false every code widget is hidden and
// refused as with `USER_CODE_WIDGETS=off`; an id in `off` (Turn this widget off) stays listed with `"off": true`, its files 404.
//
// GET /api/widgets                 list: id, kind, name, version, size, origin and trust (`owner`, `themely`, `user:<name>`,
//                                  `unsigned` for a recipe without a signature, `refused:<reason>`) of each package
//                                  (`X-User-Widgets: off` when off, `X-User-Code-Widgets: off` when code widgets are)
// POST /api/widgets                import: `{ "files": [{ "path", "data" (base64) }], "origin"?: "studio" | "import" }`, replaces
//                                  the package of that id
//
// Where a package came from (Phase 5b: the Widgets page's Yours and Imported) is the server's word, not the package's: the
// studio's builder saves with `origin: "studio"`, a file import is `"import"` (the default). It is kept in `.origin` beside the
// package's files, outside the manifest and its hashes: never a package file, never served, so an export leaves it out. A package
// that replaces a stored one keeps the stored one's origin (the builder audit's Q7): importing your own export leaves it yours.
// A signed package is never replaced by one of the same version with other files (nor a stored one of that version by a signed
// one): a signed package's files change with its version, so two of one version are one package (409).
// GET/HEAD /api/widgets/<key>/<file>   one file, typed by its extension, `nosniff`, a CSP that allows nothing; with `?sha256=<hex>`
//                                  (a page importing a bundle) 409 unless the bytes served are those, so a module the page holds
//                                  under that URL is always the file that verified
// GET /api/widgets/code            the switches: `{ "on", "env": false when USER_CODE_WIDGETS=off, "off": [id] }`
// PUT /api/widgets/code            `{ "on"?: bool, "off"?: [id] }` sets them (a write: the guards below)
// DELETE /api/widgets/<key>        remove a package
// GET /api/widget-keys             the publisher keys (widget_keys.rs `KeyView`s); a write is 403 from anywhere: keys are added and
//                                  removed in the app's Settings window only, through the app's commands, never over HTTP
//
// Writes need `X-Dashboard-Widget: 1` and come from this computer unless ALLOW_REMOTE_UPLOAD=1 (the packs' rule). The rollback
// switch: `USER_WIDGETS=off` turns the folder read and every route off (the list is empty, a file is 404, a write 403); each
// answer then says `X-User-Widgets: off`, which the kiosk reads to draw no user widget at all.

use std::path::{Path, PathBuf};
use std::sync::Mutex;

use axum::body::Body;
use axum::http::{HeaderValue, Method, Response};
use base64::engine::general_purpose::STANDARD;
use base64::Engine;
use serde_json::{json, Value};
use sha2::{Digest, Sha256};

use crate::http::{self, Req};
use crate::widget_keys::KeyStore;
use crate::widget_sign::{self, Keyring};
use crate::{js, App};

/// A package is at most this many bytes, a file at most `FILE_MAX_BYTES`, a package at most `FILE_COUNT_MAX` files (the
/// validator's `PACKAGE_MAX_BYTES`, `FILE_MAX_BYTES` and `FILE_COUNT_MAX`).
pub const PACKAGE_MAX_BYTES: u64 = 512_000;
pub const FILE_MAX_BYTES: u64 = 256_000;
pub const FILE_COUNT_MAX: usize = 32;
/// At most this many packages, and this many bytes of them in all.
pub const WIDGETS_MAX: usize = 64;
pub const WIDGETS_TOTAL_BYTES: u64 = 16_000_000;
/// An import body: the package as base64 in JSON, with room for the paths.
const IMPORT_BODY_MAX: usize = (PACKAGE_MAX_BYTES as usize) * 4 / 3 + 64 * 1024;

const MANIFEST: &str = "manifest.json";
const RECIPE: &str = "recipe.json";
/// A code widget's bundle: its manifest's `entry`, an ES module.
const BUNDLE: &str = "widget.js";
const IMAGES: &str = "images";
/// The Widgets page's switches, in the widgets folder (not a package: no key starts with a dot).
const SWITCHES: &str = ".code.json";
/// At most this many ids are turned off one by one.
const OFF_MAX: usize = 64;
/// The sidecar the server writes beside a package's files: where it came from, one of `ORIGINS`.
const ORIGIN: &str = ".origin";
const ORIGINS: [&str; 2] = ["studio", "import"];
/// The start of a folder an import writes into; a leftover is swept at start.
const TEMP_PREFIX: &str = ".import-";
/// The start of a replaced package set aside as `.import-old-<key>-<uuid>`; the sweep puts it back when the package's own folder is gone.
const ASIDE_PREFIX: &str = ".import-old-";
const UUID_LEN: usize = 36;
/// The extensions an image may have (`images/<name>.<ext>`).
const IMAGE_EXTS: [&str; 3] = ["png", "jpg", "webp"];
const RECIPE_NS: &str = "recipe.";
const EXT_NS: &str = "ext.";

/// A name Windows keeps for a device (`con`, `nul`, `com1`, ... with or without an extension).
fn is_device_name(s: &str) -> bool {
    let stem = s.split('.').next().unwrap_or("");
    matches!(stem, "con" | "prn" | "aux" | "nul")
        || (stem.len() == 4 && (stem.starts_with("com") || stem.starts_with("lpt")) && matches!(stem.as_bytes()[3], b'1'..=b'9'))
}

/// A lowercase name of letters, digits and hyphens, 1 to `max` characters, not starting with a hyphen, not a device name.
fn is_name(s: &str, max: usize) -> bool {
    (1..=max).contains(&s.len())
        && !is_device_name(s)
        && !s.starts_with('-')
        && s.bytes().all(|b| b.is_ascii_lowercase() || b.is_ascii_digit() || b == b'-')
}

/// A package key: `recipe.<name>` with a name of up to 48 (the id `recipe:<name>`), or `ext.<publisher>.<name>` with a publisher
/// of up to 32 and a name of up to 48 (the id `ext:<publisher>.<name>`).
pub fn is_widget_key(s: &str) -> bool {
    if let Some(name) = s.strip_prefix(RECIPE_NS) {
        return is_name(name, 48);
    }
    s.strip_prefix(EXT_NS)
        .and_then(|rest| rest.split_once('.'))
        .is_some_and(|(publisher, name)| is_name(publisher, 32) && is_name(name, 48))
}

/// The key of a package id (`recipe:<name>` -> `recipe.<name>`, `ext:<publisher>.<name>` -> `ext.<publisher>.<name>`).
pub fn key_of(id: &str) -> Option<String> {
    let key = match (id.strip_prefix("recipe:"), id.strip_prefix("ext:")) {
        (Some(name), _) => format!("{RECIPE_NS}{name}"),
        (_, Some(rest)) => format!("{EXT_NS}{rest}"),
        _ => return None,
    };
    is_widget_key(&key).then_some(key)
}

/// A file of a package by its path from the package folder: `manifest.json`, `recipe.json`, `widget.js` or `images/<name>.<ext>`.
/// Nothing else is a path: no separator but the one after `images`, no dot but the extension's, no `%`, backslash, colon, NUL or
/// non-ASCII.
pub fn is_widget_file(s: &str) -> bool {
    if s == MANIFEST || s == RECIPE || s == BUNDLE {
        return true;
    }
    let Some(name) = s.strip_prefix("images/") else {
        return false;
    };
    name.rsplit_once('.').is_some_and(|(stem, ext)| is_name(stem, 64) && IMAGE_EXTS.contains(&ext))
}

/// The `Content-Type` of a package file, by its extension.
fn mime_of(file: &str) -> Option<&'static str> {
    Some(match file.rsplit_once('.')?.1 {
        "json" => "application/json; charset=utf-8",
        "js" => "text/javascript; charset=utf-8",
        "png" => "image/png",
        "jpg" => "image/jpeg",
        "webp" => "image/webp",
        _ => return None,
    })
}

/// The lowercase hex SHA-256 of `bytes`.
pub fn sha256_hex(bytes: &[u8]) -> String {
    Sha256::digest(bytes).iter().map(|b| format!("{b:02x}")).collect()
}

/// The decoded files of a package: path and bytes.
type Files = Vec<(String, Vec<u8>)>;

/// A refused import: its status and message.
struct Refused(u16, String);

fn refuse(status: u16, message: impl Into<String>) -> Refused {
    Refused(status, message.into())
}

/// What a valid manifest says of its package, and the package's trust state (`trust_of`).
#[derive(Debug, PartialEq)]
pub struct Listed {
    pub id: String,
    pub kind: String,
    pub name: String,
    pub version: String,
    pub trust: String,
}

/// The Widgets page's switches (`SWITCHES`): every code widget on or off, and the ids turned off one by one.
#[derive(Debug, PartialEq)]
pub struct Switches {
    pub on: bool,
    pub off: Vec<String>,
}

impl Switches {
    fn of(v: &Value) -> Self {
        let off = v
            .get("off")
            .and_then(Value::as_array)
            .into_iter()
            .flatten()
            .filter_map(Value::as_str)
            .filter(|id| id.starts_with("ext:") && key_of(id).is_some());
        Self { on: v.get("on").and_then(Value::as_bool).unwrap_or(true), off: off.take(OFF_MAX).map(str::to_string).collect() }
    }
}

/// Checks a package's files against its manifest: every file a package has, within the caps, the manifest naming `key`'s id,
/// every other file listed once with its exact size and SHA-256; a recipe's `recipe.json` JSON naming the same id and version, a
/// code widget's `widget.js` its entry and its `publisher` the id's. Its manifest comes back with it, for `trust_of`.
fn checked_files(files: &Files, key: Option<&str>) -> Result<(Listed, Value), Refused> {
    if files.len() > FILE_COUNT_MAX {
        return Err(refuse(413, format!("{} files, at most {FILE_COUNT_MAX}", files.len())));
    }
    let mut total = 0u64;
    for (path, bytes) in files {
        if !is_widget_file(path) {
            return Err(refuse(400, format!("{} is not a file a widget package has", path.chars().take(60).collect::<String>())));
        }
        if files.iter().filter(|(p, _)| p == path).count() > 1 {
            return Err(refuse(400, format!("{path} is given twice")));
        }
        if bytes.len() as u64 > FILE_MAX_BYTES {
            return Err(refuse(413, format!("{path} is over {FILE_MAX_BYTES} bytes")));
        }
        total += bytes.len() as u64;
    }
    if total > PACKAGE_MAX_BYTES {
        return Err(refuse(413, format!("the package is over {PACKAGE_MAX_BYTES} bytes")));
    }
    let json = |name: &str| -> Result<Value, Refused> {
        let bytes = files.iter().find(|(p, _)| p == name).map(|(_, b)| b).ok_or_else(|| refuse(400, format!("{name} is missing")))?;
        serde_json::from_slice::<Value>(bytes)
            .ok()
            .filter(Value::is_object)
            .ok_or_else(|| refuse(400, format!("{name} is not a JSON object")))
    };
    let manifest = json(MANIFEST)?;
    let text = |v: &Value, field: &str| v.get(field).and_then(Value::as_str).map(str::to_string);
    let kind = text(&manifest, "kind").unwrap_or_default();
    let id = text(&manifest, "id").unwrap_or_default();
    let version = text(&manifest, "version").unwrap_or_default();
    let has = |name: &str| files.iter().any(|(p, _)| p == name);
    let recipe = match kind.as_str() {
        "recipe" => {
            if !id.starts_with("recipe:") || key_of(&id).is_none() {
                return Err(refuse(400, "the manifest's id is not recipe:<name> (lowercase letters, digits and hyphens, 48 at most)"));
            }
            if has(BUNDLE) {
                return Err(refuse(400, "a recipe package has no widget.js"));
            }
            let recipe = json(RECIPE)?;
            if text(&recipe, "id").as_deref() != Some(id.as_str()) || text(&recipe, "version").as_deref() != Some(version.as_str()) {
                return Err(refuse(400, "recipe.json names another id or version than the manifest"));
            }
            Some(recipe)
        }
        "code" => {
            let Some(publisher) =
                id.strip_prefix("ext:").and_then(|rest| rest.split_once('.')).map(|(p, _)| p).filter(|_| key_of(&id).is_some())
            else {
                return Err(refuse(
                    400,
                    "the manifest's id is not ext:<publisher>.<name> (lowercase letters, digits and hyphens; 32 and 48 at most)",
                ));
            };
            if text(&manifest, "publisher").as_deref() != Some(publisher) {
                return Err(refuse(400, "the manifest's publisher is not the one its id names"));
            }
            if text(&manifest, "entry").as_deref() != Some(BUNDLE) || !has(BUNDLE) {
                return Err(refuse(400, "a code widget's entry is widget.js, and the package has it"));
            }
            if has(RECIPE) {
                return Err(refuse(400, "a code widget package has no recipe.json"));
            }
            None
        }
        _ => {
            return Err(refuse(400, format!("kind {:?}: a widget package is a recipe or code", kind.chars().take(20).collect::<String>())))
        }
    };
    if key.is_some_and(|k| Some(k) != key_of(&id).as_deref()) {
        return Err(refuse(400, "the manifest names another package than its folder"));
    }
    let list = manifest.get("files").and_then(Value::as_array).ok_or_else(|| refuse(400, "the manifest lists no files"))?;
    let mut listed: Vec<&str> = Vec::new();
    for entry in list {
        let path = entry.get("path").and_then(Value::as_str).unwrap_or("");
        if listed.contains(&path) {
            return Err(refuse(400, format!("{} is listed twice", path.chars().take(60).collect::<String>())));
        }
        listed.push(path);
        let Some((_, bytes)) = files.iter().find(|(p, _)| p == path && p != MANIFEST) else {
            return Err(refuse(400, format!("{} is listed and not in the package", path.chars().take(60).collect::<String>())));
        };
        if entry.get("bytes").and_then(Value::as_u64) != Some(bytes.len() as u64)
            || entry.get("sha256").and_then(Value::as_str) != Some(sha256_hex(bytes).as_str())
        {
            return Err(refuse(400, format!("{path} is not the file the manifest lists (size or SHA-256)")));
        }
    }
    if let Some((path, _)) = files.iter().find(|(p, _)| p != MANIFEST && !listed.contains(&p.as_str())) {
        return Err(refuse(400, format!("{path} is not in the manifest")));
    }
    let name = text(&manifest, "name")
        .or_else(|| recipe.as_ref().and_then(|r| text(r, "name")))
        .unwrap_or_else(|| id.clone())
        .chars()
        .take(80)
        .collect();
    Ok((Listed { id, kind, name, version, trust: String::new() }, manifest))
}

/// The trust state of a package whose files are its manifest's: `owner`, `themely` or `user:<name>` for a signature from a trusted
/// key, `unsigned` for a recipe without one, or why it is refused (a code widget without a signature, an unreadable signature, an
/// unknown or revoked key, a signature that does not match).
fn trust_of(kind: &str, manifest: &Value, ring: &Keyring) -> Result<String, String> {
    match widget_sign::verify(manifest, ring)? {
        Some(verified) => Ok(verified.signer.state()),
        None if kind == "code" => Err("a code widget must be signed, and this one is not".into()),
        None => Ok("unsigned".into()),
    }
}

/// The user-widget store: its folder, whether it is read at all (and its code widgets), the publisher keys, and who may write.
pub struct Widgets {
    dir: PathBuf,
    enabled: bool,
    code_enabled: bool,
    keys: KeyStore,
    allow_remote: bool,
    /// Held across an import's cap checks and write, and a remove, so two at once cannot both pass the caps.
    write: Mutex<()>,
}

impl Widgets {
    /// The store in `dir`, verified against `keys`. `USER_WIDGETS=off` (or `0`) is the rollback switch; `USER_CODE_WIDGETS=off`
    /// turns off the code widgets only.
    pub fn new(dir: PathBuf, keys: KeyStore, allow_remote: bool) -> Self {
        let off = |name: &str| matches!(std::env::var(name).ok().as_deref(), Some("off" | "0"));
        let widgets =
            Self { dir, enabled: !off("USER_WIDGETS"), code_enabled: !off("USER_CODE_WIDGETS"), keys, allow_remote, write: Mutex::new(()) };
        widgets.sweep();
        widgets
    }

    #[cfg(test)]
    fn with(dir: PathBuf, enabled: bool) -> Self {
        let keys = KeyStore::with(&dir, None, "{}");
        Self { dir, enabled, code_enabled: true, keys, allow_remote: false, write: Mutex::new(()) }
    }

    /// Whether `key` names a code widget while code widgets are off (here or on the Widgets page): such a package is not read at all.
    fn hidden(&self, key: &str) -> bool {
        key.starts_with(EXT_NS) && !self.code_on()
    }

    /// Whether code widgets are on: not `USER_CODE_WIDGETS=off`, and not switched off on the Widgets page.
    fn code_on(&self) -> bool {
        self.code_enabled && self.switches().on
    }

    /// The Widgets page's switches as stored (all on when the file is missing or unreadable).
    pub fn switches(&self) -> Switches {
        Switches::of(&crate::store::read_json(&self.dir.join(SWITCHES)).unwrap_or(Value::Null))
    }

    /// Whether the code widget `key` is turned off on its own.
    fn turned_off(&self, key: &str) -> bool {
        key.starts_with(EXT_NS) && self.switches().off.iter().any(|id| key_of(id).as_deref() == Some(key))
    }

    /// Whether the store is read at all.
    pub fn enabled(&self) -> bool {
        self.enabled
    }

    /// Recovers from a crash in an import, as the packs' sweep does: a package set aside whose own folder is gone is put back,
    /// one whose folder is there goes, and the half-written folders go last.
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
                Some(rest) => asides.push((aside_key(rest), entry.path())),
                None => temps.push(entry.path()),
            }
        }
        asides.sort_by_key(|(_, path)| {
            std::cmp::Reverse((std::fs::metadata(path.join(MANIFEST)).and_then(|m| m.modified()).ok(), path.clone()))
        });
        let mut kept = false;
        for (key, path) in asides {
            match key.map(|k| self.dir.join(k)) {
                Some(dest) if std::fs::symlink_metadata(&dest).is_err() => kept |= std::fs::rename(&path, &dest).is_err(),
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

    /// Stores a checked import under the write lock: written beside its place under a name no key has, then moved in, so a
    /// half-written package is never a package; a replaced one is set aside until the new one is in place, and its origin is kept.
    /// `check` runs under the lock first and refuses the write when it says why. The origin written comes back.
    fn store(
        &self,
        key: &str,
        files: &Files,
        origin: &'static str,
        check: impl FnOnce() -> Option<Refused>,
    ) -> std::io::Result<Result<&'static str, Refused>> {
        let _held = self.write.lock().unwrap_or_else(|e| e.into_inner());
        if let Some(refused) = check() {
            return Ok(Err(refused));
        }
        let origin = self.package_dir(key).map_or(origin, |root| origin_of(&root));
        let others: Vec<u64> = listed(self).into_iter().filter(|(other, _)| other != key).map(|(_, (_, bytes))| bytes).collect();
        if others.len() + 1 > WIDGETS_MAX {
            return Ok(Err(refuse(413, format!("{WIDGETS_MAX} widgets are stored; remove one first"))));
        }
        if others.iter().sum::<u64>() + files.iter().map(|(_, b)| b.len() as u64).sum::<u64>() > WIDGETS_TOTAL_BYTES {
            return Ok(Err(refuse(413, format!("the widgets would take over {WIDGETS_TOTAL_BYTES} bytes in all; remove one first"))));
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
            std::fs::write(temp.join(ORIGIN), origin)?;
            let dest = self.dir.join(key);
            let aside = self.dir.join(format!("{ASIDE_PREFIX}{key}-{}", uuid::Uuid::new_v4()));
            let had = std::fs::symlink_metadata(&dest).is_ok();
            if had {
                std::fs::rename(&dest, &aside)?;
            }
            if let Err(e) = std::fs::rename(&temp, &dest) {
                if had {
                    let _ = std::fs::rename(&aside, &dest);
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
        Ok(Ok(origin))
    }

    /// The file `file` of package `key`, or `None` for anything not a package file inside its folder: the names are matched first,
    /// then the path is canonicalised and must stay under the canonical `widgets/<key>/`; a link is refused whatever it points at.
    pub fn path_of(&self, key: &str, file: &str) -> Option<PathBuf> {
        if !self.enabled || !is_widget_key(key) || !is_widget_file(file) || self.hidden(key) {
            return None;
        }
        let root = self.package_dir(key)?;
        let path = root.join(file);
        if std::fs::symlink_metadata(&path).ok()?.file_type().is_symlink() {
            return None;
        }
        let real = std::fs::canonicalize(&path).ok()?;
        (real.starts_with(&root) && real.is_file()).then_some(real)
    }

    /// The `recipe.json` of the package with id `id`, parsed, when it is there (the weather source reads a recipe's place lists; the
    /// validator, not this, decides whether it may be drawn).
    pub fn recipe_json(&self, id: &str) -> Option<Value> {
        crate::store::read_json(&self.path_of(&key_of(id)?, RECIPE)?)
    }

    /// Removes a package under the write lock. `false`: no such package.
    fn remove(&self, key: &str) -> std::io::Result<bool> {
        let _held = self.write.lock().unwrap_or_else(|e| e.into_inner());
        let Some(root) = is_widget_key(key).then(|| self.package_dir(key)).flatten() else {
            return Ok(false);
        };
        std::fs::remove_dir_all(root)?;
        Ok(true)
    }

    /// Package `key`'s folder and files, read under the write lock (B23): a save replaces a package by moving the old folder aside and
    /// the new one in, and a read between the two moves found no folder, so a page reading the recipe while it was saved got a 404 or
    /// an empty answer. `Err(404)`: no such package or file to serve; `Err(413)`: a folder that is not a package this server wrote.
    fn read_package(&self, key: &str, file: &str) -> Result<Files, u16> {
        let _held = self.write.lock().unwrap_or_else(|e| e.into_inner());
        let root = self.path_of(key, file).and_then(|_| self.package_dir(key)).ok_or(404u16)?;
        read_files(&root).ok_or(413)
    }

    /// The canonical folder of package `key` under the canonical widgets folder, when it is a real folder (not a link).
    fn package_dir(&self, key: &str) -> Option<PathBuf> {
        let base = std::fs::canonicalize(&self.dir).ok()?;
        let dir = base.join(key);
        if std::fs::symlink_metadata(&dir).ok()?.file_type().is_symlink() {
            return None;
        }
        let real = std::fs::canonicalize(&dir).ok()?;
        (real.parent() == Some(base.as_path()) && real.is_dir()).then_some(real)
    }

    /// Why `incoming` may not replace the package stored under `key`: that one is signed, and `incoming` is not signed by the same
    /// key (the stored signature must still verify with `ring`, and both with the same key bytes); or either is signed and both are
    /// one version with other files. `None` when nothing is stored there, or neither is signed.
    fn replace_refusal(&self, key: &str, incoming: &Value, ring: &Keyring) -> Option<Refused> {
        let stored: Value = crate::store::read_json(&self.package_dir(key)?.join(MANIFEST))?;
        let name = stored.get("id").and_then(Value::as_str).unwrap_or(key);
        if let Some(id) = widget_sign::signature_key_id(&stored) {
            let old = widget_sign::verify(&stored, ring).ok().flatten();
            let new = widget_sign::verify(incoming, ring).ok().flatten();
            let same = matches!((old, new), (Some(o), Some(n)) if o.key.bytes == n.key.bytes);
            if !same {
                return Some(refuse(
                    409,
                    format!(
                        "{name} is installed, signed with the key {}: only that key may replace it (remove it first to install this one)",
                        widget_sign::fingerprint(&id)
                    ),
                ));
            }
        }
        let signed = stored.get("signature").is_some() || incoming.get("signature").is_some();
        let version = stored.get("version").and_then(Value::as_str).unwrap_or("");
        let same_version = incoming.get("version").and_then(Value::as_str) == Some(version);
        (signed && same_version && listed_files(&stored) != listed_files(incoming)).then(|| {
            refuse(409, format!("{name} {version} is installed and signed: a package of the same version with other files is refused (a signed package changes its version when its files change)"))
        })
    }

    /// The reason a write is refused, or `None`.
    fn write_refusal(&self, req: &Req) -> Option<&'static str> {
        if !self.enabled {
            return Some("user widgets are off");
        }
        if req.header("x-dashboard-widget").as_deref() != Some("1") {
            return Some("missing X-Dashboard-Widget header");
        }
        (!self.allow_remote && !req.is_loopback()).then_some("widgets are accepted from this computer only")
    }
}

/// The package a set-aside folder holds, from what follows `.import-old-` in its name (`<key>-<uuid>`), else its manifest's id.
fn aside_key(rest: &str) -> Option<String> {
    let named = rest.len().checked_sub(UUID_LEN + 1).and_then(|n| {
        let uuid = rest.get(n..)?.strip_prefix('-')?;
        uuid::Uuid::try_parse(uuid).ok()?;
        rest.get(..n)
    });
    named.map(str::to_string).filter(|k| is_widget_key(k))
}

/// A package folder's files: every file at its top and in `images/`. `None` for a folder with anything else in it (a sub-folder,
/// a link, a stray name) or a file over its cap: not a package this server wrote.
fn read_files(root: &Path) -> Option<Files> {
    let mut files = Vec::new();
    for (dir, prefix) in [(root.to_path_buf(), ""), (root.join(IMAGES), "images/")] {
        let Ok(entries) = std::fs::read_dir(&dir) else {
            if prefix.is_empty() {
                return None;
            }
            continue;
        };
        for entry in entries.filter_map(Result::ok) {
            let meta = std::fs::symlink_metadata(entry.path()).ok()?;
            let name = entry.file_name().to_string_lossy().into_owned();
            if prefix.is_empty() && ((meta.is_dir() && name == IMAGES) || (meta.is_file() && name == ORIGIN)) {
                continue;
            }
            let path = format!("{prefix}{name}");
            if !meta.is_file() || !is_widget_file(&path) || meta.len() > FILE_MAX_BYTES || files.len() >= FILE_COUNT_MAX {
                return None;
            }
            files.push((path, std::fs::read(entry.path()).ok()?));
        }
    }
    Some(files)
}

/// What a folder holds when it is a package: its manifest's word, checked against the files as they are now, and its trust state
/// against `ring` now (`refused:<reason>` when the signature does not verify any more: listed, never served).
fn measured(root: &Path, key: &str, ring: &Keyring) -> Option<(Listed, u64)> {
    let files = read_files(root)?;
    let (mut listed, manifest) = checked_files(&files, Some(key)).ok()?;
    listed.trust = trust_of(&listed.kind, &manifest, ring).unwrap_or_else(|reason| format!("refused:{reason}"));
    Some((listed, files.iter().map(|(_, b)| b.len() as u64).sum()))
}

/// A manifest's files as (path, SHA-256), sorted: what two packages of one version must share.
fn listed_files(manifest: &Value) -> Vec<(String, String)> {
    let mut out: Vec<(String, String)> = manifest
        .get("files")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .map(|f| {
            (
                f.get("path").and_then(Value::as_str).unwrap_or("").to_string(),
                f.get("sha256").and_then(Value::as_str).unwrap_or("").to_string(),
            )
        })
        .collect();
    out.sort();
    out
}

/// Where the package in `root` came from: its `.origin`, else `import` (a package from before origins, or one put there by hand).
fn origin_of(root: &Path) -> &'static str {
    let found = std::fs::read_to_string(root.join(ORIGIN)).unwrap_or_default();
    ORIGINS.into_iter().find(|o| *o == found.trim()).unwrap_or("import")
}

/// The packages in the widgets folder that may be served, by key, with their manifest's word and size, sorted.
fn listed(widgets: &Widgets) -> Vec<(String, (Listed, u64))> {
    let mut found = Vec::new();
    if !widgets.enabled {
        return found;
    }
    let Ok(entries) = std::fs::read_dir(&widgets.dir) else {
        return found;
    };
    let ring = widgets.keys.keyring();
    for entry in entries.filter_map(Result::ok) {
        let key = entry.file_name().to_string_lossy().into_owned();
        if widgets.hidden(&key) {
            continue;
        }
        if let Some(done) = is_widget_key(&key).then(|| widgets.package_dir(&key)).flatten().and_then(|root| measured(&root, &key, &ring)) {
            found.push((key, done));
        }
    }
    found.sort_by(|a, b| a.0.cmp(&b.0));
    found
}

/// The answer's word that the store is off, on every route.
fn off(mut reply: Response<Body>) -> Response<Body> {
    reply.headers_mut().insert("X-User-Widgets", HeaderValue::from_static("off"));
    reply
}

fn handle_list(app: &App) -> Response<Body> {
    let widgets = &app.widgets;
    // under the write lock, so a package being replaced is listed as it was or as it is, never missing (B23)
    let _held = widgets.write.lock().unwrap_or_else(|e| e.into_inner());
    let items: Vec<Value> = listed(widgets)
        .into_iter()
        .map(|(key, (l, size))| {
            let origin = widgets.package_dir(&key).map_or("import", |root| origin_of(&root));
            let mut item = json!({ "id": l.id, "kind": l.kind, "name": l.name, "version": l.version, "size": size, "origin": origin, "trust": l.trust });
            if widgets.turned_off(&key) {
                item["off"] = Value::Bool(true);
            }
            item
        })
        .collect();
    let mut reply = http::json(200, &Value::Array(items));
    if !widgets.code_on() {
        reply.headers_mut().insert("X-User-Code-Widgets", HeaderValue::from_static("off"));
    }
    if widgets.enabled {
        reply
    } else {
        off(reply)
    }
}

/// An import's body as files: `{ files: [{ path, data }] }`, each path checked before it is decoded.
fn decoded(body: &Value) -> Result<Files, Refused> {
    let list = body.get("files").and_then(Value::as_array).ok_or_else(|| refuse(400, "no files"))?;
    if list.len() > FILE_COUNT_MAX {
        return Err(refuse(413, format!("{} files, at most {FILE_COUNT_MAX}", list.len())));
    }
    let mut files = Vec::new();
    for f in list {
        let path = f.get("path").and_then(Value::as_str).unwrap_or("");
        if !is_widget_file(path) {
            return Err(refuse(400, format!("{} is not a file a widget package has", path.chars().take(60).collect::<String>())));
        }
        let bytes = STANDARD
            .decode(f.get("data").and_then(Value::as_str).unwrap_or(""))
            .map_err(|_| refuse(400, format!("{path} is not base64")))?;
        files.push((path.to_string(), bytes));
    }
    Ok(files)
}

async fn handle_import(app: &App, mut req: Req) -> std::io::Result<Response<Body>> {
    let widgets = &app.widgets;
    if let Some(refusal) = widgets.write_refusal(&req) {
        let reply = http::text(403, refusal);
        return Ok(if widgets.enabled { reply } else { off(reply) });
    }
    let length = req.header("content-length").map_or(f64::NAN, |v| js::string_to_number(&v));
    if length > IMPORT_BODY_MAX as f64 {
        return Ok(http::closing(http::empty(413)));
    }
    let Ok(text) = req.read_body(IMPORT_BODY_MAX).await else {
        return Ok(http::closing(http::text(413, "the package is too large")));
    };
    let Ok(body) = serde_json::from_str::<Value>(&text) else {
        return Ok(http::text(400, "the body is not JSON"));
    };
    let origin = match body.get("origin") {
        None => "import",
        Some(v) => match ORIGINS.into_iter().find(|o| v.as_str() == Some(*o)) {
            Some(o) => o,
            None => return Ok(http::text(400, "origin is \"studio\" or \"import\"")),
        },
    };
    let checked = decoded(&body).and_then(|files| checked_files(&files, None).map(|l| (files, l)));
    let (files, (mut listed, manifest)) = match checked {
        Ok(done) => done,
        Err(Refused(status, message)) => return Ok(http::text(status, message)),
    };
    if listed.kind == "code" && !widgets.code_enabled {
        return Ok(http::text(403, "code widgets are off (USER_CODE_WIDGETS=off)"));
    }
    if listed.kind == "code" && !widgets.code_on() {
        return Ok(http::text(403, "third-party code widgets are switched off on the Widgets page"));
    }
    let ring = widgets.keys.keyring();
    listed.trust = match trust_of(&listed.kind, &manifest, &ring) {
        Ok(trust) => trust,
        Err(reason) => return Ok(http::text(400, format!("refused: {reason}"))),
    };
    let key = key_of(&listed.id).unwrap_or_default();
    let origin = match widgets.store(&key, &files, origin, || widgets.replace_refusal(&key, &manifest, &ring))? {
        Ok(kept) => kept,
        Err(Refused(status, message)) => return Ok(http::text(status, message)),
    };
    let size: u64 = files.iter().map(|(_, b)| b.len() as u64).sum();
    Ok(http::json(
        200,
        &json!({ "id": listed.id, "kind": listed.kind, "name": listed.name, "version": listed.version, "size": size, "origin": origin, "trust": listed.trust }),
    ))
}

fn handle_delete(app: &App, req: &Req, key: &str) -> std::io::Result<Response<Body>> {
    let widgets = &app.widgets;
    if let Some(refusal) = widgets.write_refusal(req) {
        let reply = http::text(403, refusal);
        return Ok(if widgets.enabled { reply } else { off(reply) });
    }
    Ok(http::empty(if widgets.remove(key)? { 204 } else { 404 }))
}

/// One file of a package: refused whole when the folder is not a package within the caps and its manifest (413) or its signature
/// does not verify now (403), 404 for a code widget turned off; typed by its extension. The bytes served are the ones just checked
/// (the folder is read once), and with `?sha256=` they must be that file (409): a bundle changed on disk after the page read the
/// manifest is never served under the hash the page asked for, so a page imports only bytes that verified.
fn serve_file(app: &App, req: &Req, key: &str, file: &str) -> Response<Body> {
    let widgets = &app.widgets;
    if !widgets.enabled {
        return off(http::empty(404));
    }
    if widgets.turned_off(key) {
        return http::empty(404);
    }
    let files = match widgets.read_package(key, file) {
        Ok(files) => files,
        Err(status) => return http::empty(status),
    };
    let Some(((listed, manifest), files)) = checked_files(&files, Some(key)).ok().map(|checked| (checked, files)) else {
        return http::empty(413);
    };
    if let Err(reason) = trust_of(&listed.kind, &manifest, &widgets.keys.keyring()) {
        return http::text(403, format!("refused:{reason}"));
    }
    let (Some(mime), Some((_, bytes))) = (mime_of(file), files.into_iter().find(|(p, _)| p == file)) else {
        return http::empty(404);
    };
    if req.query("sha256").is_some_and(|want| want != sha256_hex(&bytes)) {
        return http::text(409, "the file is not the one asked for (it changed): read the package again");
    }
    let length = bytes.len();
    Response::builder()
        .status(200)
        .header("Content-Type", mime)
        .header("Content-Length", length.to_string())
        .header("Cache-Control", "no-cache")
        .header("X-Content-Type-Options", "nosniff")
        .header("Content-Security-Policy", "default-src 'none'; sandbox")
        .body(if req.method == Method::HEAD { Body::empty() } else { Body::from(bytes) })
        .unwrap_or_default()
}

/// /api/widgets/code: the Widgets page's switches, read by any page; set under the write guards (this computer, the header).
async fn handle_switches(app: &App, mut req: Req) -> std::io::Result<Response<Body>> {
    let widgets = &app.widgets;
    let view = |w: &Widgets| {
        let s = w.switches();
        json!({ "on": s.on, "env": w.code_enabled, "off": s.off })
    };
    match req.method {
        Method::GET => Ok(http::json(200, &view(widgets))),
        Method::PUT => {
            if let Some(refusal) = widgets.write_refusal(&req) {
                let reply = http::text(403, refusal);
                return Ok(if widgets.enabled { reply } else { off(reply) });
            }
            let Ok(text) = req.read_body(16 * 1024).await else {
                return Ok(http::closing(http::text(413, "the body is too large")));
            };
            let Some(body) = serde_json::from_str::<Value>(&text).ok().filter(Value::is_object) else {
                return Ok(http::text(400, "the body is not a JSON object"));
            };
            if body.get("on").is_some_and(|v| !v.is_boolean()) || body.get("off").is_some_and(|v| !v.is_array()) {
                return Ok(http::text(400, "on is true or false, off a list of code widget ids"));
            }
            let _held = widgets.write.lock().unwrap_or_else(|e| e.into_inner());
            let now = widgets.switches();
            let next = Switches::of(
                &json!({ "on": body.get("on").cloned().unwrap_or(Value::Bool(now.on)), "off": body.get("off").cloned().unwrap_or(json!(now.off)) }),
            );
            std::fs::create_dir_all(&widgets.dir)?;
            crate::store::write_atomic(&widgets.dir.join(SWITCHES), json!({ "on": next.on, "off": next.off }).to_string().as_bytes())?;
            Ok(http::json(200, &view(widgets)))
        }
        _ => Ok(http::empty(405)),
    }
}

/// /api/widget-keys: the publisher keys, read only. Adding or removing one is the Settings window's alone (the app's commands).
pub fn handle_keys(app: &App, req: &Req) -> Response<Body> {
    match req.method {
        Method::GET => http::json(200, &json!({ "keys": app.widgets.keys.list() })),
        Method::POST | Method::PUT | Method::PATCH | Method::DELETE => {
            http::text(403, "publisher keys are added and removed in the app's Settings window only")
        }
        _ => http::empty(405),
    }
}

/// /api/widgets and /api/widgets/<key>/<file>.
pub async fn handle(app: &App, req: Req) -> std::io::Result<Response<Body>> {
    if req.path == "/api/widgets" {
        return match req.method {
            Method::GET => Ok(handle_list(app)),
            Method::POST => handle_import(app, req).await,
            _ => Ok(http::empty(405)),
        };
    }
    if req.path == "/api/widgets/code" {
        return handle_switches(app, req).await;
    }
    let rest = req.path.strip_prefix("/api/widgets/").unwrap_or("");
    let (key, file) = rest.split_once('/').map_or((rest, None), |(key, file)| (key, Some(file)));
    match (&req.method, file) {
        (&Method::DELETE, None) => handle_delete(app, &req, key),
        (&Method::GET | &Method::HEAD, Some(file)) => Ok(serve_file(app, &req, key, file)),
        (&Method::GET | &Method::HEAD | &Method::DELETE, _) => Ok(http::empty(404)),
        _ => Ok(http::empty(405)),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn keys_are_recipe_names_of_at_most_48_or_publisher_and_name() {
        for ok in [
            "recipe.a",
            "recipe.cpu-card",
            "recipe.0x",
            &format!("recipe.{}", "a".repeat(48)),
            "ext.me.a",
            "ext.acme-co.cpu-card",
            &format!("ext.{}.{}", "p".repeat(32), "a".repeat(48)),
        ] {
            assert!(is_widget_key(ok), "{ok}");
        }
        for bad in [
            "recipe.",
            "recipe.nul",
            "recipe.com1",
            "recipe.-a",
            "recipe.A",
            "recipe.a_b",
            "recipe.a.b",
            "recipe.a/b",
            "recipe:a",
            "Recipe.a",
            "a",
            "..",
            "",
            "recipe.é",
            &format!("recipe.{}", "a".repeat(49)),
        ] {
            assert!(!is_widget_key(bad), "{bad:?}");
        }
        for bad in [
            "ext.",
            "ext.me",
            "ext.me.",
            "ext..a",
            "ext.me.a.b",
            "ext.me.nul",
            "ext.Me.a",
            "ext.me/a",
            "ext:me.a",
            "ext.-me.a",
            &format!("ext.{}.a", "p".repeat(33)),
            &format!("ext.p.{}", "a".repeat(49)),
        ] {
            assert!(!is_widget_key(bad), "{bad:?}");
        }
        assert_eq!(key_of("recipe:cpu-card").as_deref(), Some("recipe.cpu-card"));
        assert_eq!(key_of("ext:me.card").as_deref(), Some("ext.me.card"));
        assert_eq!(key_of("ext:me"), None);
        assert_eq!(key_of("recipe:../x"), None);
        assert_eq!(key_of("ext:me.../x"), None);
    }

    #[test]
    fn files_are_the_two_json_files_or_an_image_of_a_known_type() {
        for ok in ["manifest.json", "recipe.json", "widget.js", "images/logo.png", "images/a.jpg", "images/a-b.webp"] {
            assert!(is_widget_file(ok), "{ok}");
        }
        for bad in [
            "",
            "pack.json",
            "Manifest.json",
            "../recipe.json",
            "images/../recipe.json",
            "images/",
            "images/a",
            "images/a.svg",
            "images/a.gif",
            "images/a.PNG",
            "images/a/b.png",
            "images\\a.png",
            "images/a%2epng",
            "images/a.png ",
            "images/a.png\0",
            "images/é.png",
            "C:/x.png",
            "//x/y.png",
            "images/con.png",
            "images/-a.png",
            "recipe.json/",
            "./recipe.json",
            "bundle.js",
            "images/a.png:stream",
            "widget.mjs",
            "images/widget.js",
            "./widget.js",
        ] {
            assert!(!is_widget_file(bad), "{bad:?}");
        }
    }

    fn package(id: &str) -> Files {
        let recipe = json!({ "id": id, "version": "1.0.0", "name": "N" }).to_string().into_bytes();
        let manifest = json!({ "format": 1, "kind": "recipe", "id": id, "version": "1.0.0", "author": "a", "files": [{ "path": "recipe.json", "bytes": recipe.len(), "sha256": sha256_hex(&recipe) }] });
        vec![("manifest.json".into(), manifest.to_string().into_bytes()), ("recipe.json".into(), recipe)]
    }

    #[test]
    fn a_package_is_its_manifest_byte_for_byte() {
        let ok = package("recipe:mine");
        assert_eq!(checked_files(&ok, Some("recipe.mine")).map(|(l, _)| l.id).ok().as_deref(), Some("recipe:mine"));
        let refused = |files: &Files| checked_files(files, None).err().map(|Refused(s, _)| s);
        let mut edited = ok.clone();
        edited[1].1.push(b' ');
        assert_eq!(refused(&edited), Some(400), "a changed file");
        let mut extra = ok.clone();
        extra.push(("images/a.png".into(), b"x".to_vec()));
        assert_eq!(refused(&extra), Some(400), "a file not listed");
        assert_eq!(refused(&vec![ok[0].clone()]), Some(400), "a listed file missing");
        assert_eq!(checked_files(&ok, Some("recipe.other")).err().map(|Refused(s, _)| s), Some(400), "another folder's");
    }

    fn fixture(name: &str) -> Files {
        let root = Path::new(env!("CARGO_MANIFEST_DIR")).join("../../../tests/fixtures/widgets").join(name);
        read_files(&root).unwrap()
    }

    fn manifest_of(files: &Files) -> Value {
        serde_json::from_slice(&files.iter().find(|(p, _)| p == MANIFEST).unwrap().1).unwrap()
    }

    fn with_manifest(files: &Files, manifest: &Value) -> Files {
        files
            .iter()
            .map(|(p, b)| (p.clone(), if p == MANIFEST { serde_json::to_vec_pretty(manifest).unwrap() } else { b.clone() }))
            .collect()
    }

    /// A keyring that trusts the TEST-ONLY publisher key as a user key named Test, and revokes it when `revoked`.
    fn ring(trusted: bool, revoked: bool) -> Keyring {
        let pub_key =
            std::fs::read_to_string(Path::new(env!("CARGO_MANIFEST_DIR")).join("../../../tests/fixtures/widgets/TEST-ONLY-publisher.pub"))
                .unwrap();
        let key = widget_sign::Key::parse(&pub_key).unwrap();
        let publishers = vec!["test".to_string()];
        Keyring {
            trusted: if trusted {
                vec![widget_sign::Trusted { signer: widget_sign::Signer::User("Test".into()), key: key.clone(), publishers }]
            } else {
                vec![]
            },
            revoked: if revoked { vec![key] } else { vec![] },
        }
    }

    /// The trust state of `files` (`Err` names a refusal: the structure's or the signature's).
    fn trust(files: &Files, ring: &Keyring) -> Result<String, String> {
        let (listed, manifest) = checked_files(files, None).map_err(|Refused(_, m)| m)?;
        trust_of(&listed.kind, &manifest, ring)
    }

    #[test]
    fn a_signed_code_widget_verifies_with_a_trusted_key_only() {
        let good = fixture("ext.test.clock");
        assert_eq!(trust(&good, &ring(true, false)).as_deref(), Ok("user:Test"));
        let (listed, _) = checked_files(&good, Some("ext.test.clock")).ok().unwrap();
        assert_eq!((listed.id.as_str(), listed.kind.as_str(), listed.name.as_str()), ("ext:test.clock", "code", "Test clock"));

        let mut tampered = good.clone();
        tampered.iter_mut().find(|(p, _)| p == BUNDLE).unwrap().1.extend_from_slice(b"alert(1)");
        assert!(
            trust(&tampered, &ring(true, false)).unwrap_err().contains("widget.js is not the file the manifest lists"),
            "a tampered file"
        );

        let mut renamed = manifest_of(&good);
        renamed["name"] = json!("Another clock");
        assert_eq!(
            trust(&with_manifest(&good, &renamed), &ring(true, false)).unwrap_err(),
            "the signature does not match the package",
            "a changed manifest field"
        );
        let mut moved = manifest_of(&good);
        moved["files"][0]["sha256"] = json!(sha256_hex(b"other"));
        assert!(trust(&with_manifest(&good, &moved), &ring(true, false)).is_err(), "a changed hash");

        assert!(
            trust(&good, &ring(false, false)).unwrap_err().starts_with("signed with a key this app does not trust ("),
            "an unknown key"
        );
        assert!(trust(&good, &ring(true, true)).unwrap_err().starts_with("signed with a revoked key ("), "a revoked key");

        let mut unsigned = manifest_of(&good);
        unsigned.as_object_mut().unwrap().remove("signature");
        assert_eq!(
            trust(&with_manifest(&good, &unsigned), &ring(true, false)).unwrap_err(),
            "a code widget must be signed, and this one is not",
            "a missing signature"
        );

        let mut forged = manifest_of(&good);
        let text = forged["signature"]["minisign"].as_str().unwrap().to_string();
        let mut lines: Vec<String> = text.lines().map(str::to_string).collect();
        let mut sig = STANDARD.decode(&lines[1]).unwrap();
        sig[20] ^= 1;
        lines[1] = STANDARD.encode(sig);
        forged["signature"]["minisign"] = json!(lines.join("\n"));
        assert_eq!(
            trust(&with_manifest(&good, &forged), &ring(true, false)).unwrap_err(),
            "the signature does not match the package",
            "a bad signature"
        );
        for junk in [json!("text"), json!({ "minisign": "not one" }), json!({ "minisign": text, "extra": 1 })] {
            let mut bad = manifest_of(&good);
            bad["signature"] = junk;
            assert_eq!(trust(&with_manifest(&good, &bad), &ring(true, false)).unwrap_err(), "the signature is not a minisign signature");
        }
    }

    #[test]
    fn a_code_package_names_its_publisher_and_bundle_and_nothing_of_a_recipe() {
        let good = fixture("ext.test.clock");
        let refused = |edit: &dyn Fn(&mut Value)| {
            let mut m = manifest_of(&good);
            edit(&mut m);
            checked_files(&with_manifest(&good, &m), None).err().map(|Refused(s, _)| s)
        };
        assert_eq!(refused(&|m| m["publisher"] = json!("other")), Some(400));
        assert_eq!(refused(&|m| m["entry"] = json!("main.js")), Some(400));
        assert_eq!(refused(&|m| m["id"] = json!("recipe:test")), Some(400));
        assert_eq!(refused(&|m| m["kind"] = json!("recipe")), Some(400));
        assert_eq!(checked_files(&good, Some("ext.test.other")).err().map(|Refused(s, _)| s), Some(400), "another folder's");
        let mut recipe = package("recipe:mine");
        recipe.push((BUNDLE.into(), b"x".to_vec()));
        assert!(checked_files(&recipe, None).is_err(), "a recipe with a bundle");
    }

    #[test]
    fn a_recipe_may_be_signed_and_is_refused_when_its_signature_does_not_verify() {
        assert_eq!(trust(&package("recipe:mine"), &ring(true, false)).as_deref(), Ok("unsigned"));
        let signed = fixture("recipe.signed");
        assert_eq!(trust(&signed, &ring(true, false)).as_deref(), Ok("user:Test"));
        assert!(trust(&signed, &ring(false, false)).is_err(), "an unknown key");
        let mut edited = manifest_of(&signed);
        edited["author"] = json!("someone else");
        assert!(trust(&with_manifest(&signed, &edited), &ring(true, false)).is_err(), "a changed field");
    }

    #[test]
    fn a_stored_package_is_listed_with_its_trust_now_and_hidden_when_code_widgets_are_off() {
        let dir = tempfile::tempdir().unwrap();
        write(dir.path(), "ext.test.clock", &fixture("ext.test.clock"));
        write(dir.path(), "recipe.mine", &package("recipe:mine"));
        let mut widgets = Widgets::with(dir.path().to_path_buf(), true);
        let trusts = |w: &Widgets| listed(w).into_iter().map(|(k, (l, _))| format!("{k} {}", l.trust)).collect::<Vec<_>>();
        assert_eq!(
            trusts(&widgets),
            ["ext.test.clock refused:signed with a key this app does not trust (FD89B8C08B250DF6)", "recipe.mine unsigned"]
        );
        widgets
            .keys
            .add_user(
                "Test",
                &std::fs::read_to_string(
                    Path::new(env!("CARGO_MANIFEST_DIR")).join("../../../tests/fixtures/widgets/TEST-ONLY-publisher.pub"),
                )
                .unwrap(),
                &["test".into()],
            )
            .unwrap();
        assert_eq!(trusts(&widgets), ["ext.test.clock user:Test", "recipe.mine unsigned"]);
        assert!(widgets.path_of("ext.test.clock", BUNDLE).is_some());
        widgets.code_enabled = false;
        assert_eq!(trusts(&widgets), ["recipe.mine unsigned"], "off: a code widget is not listed");
        assert!(widgets.path_of("ext.test.clock", BUNDLE).is_none(), "off: nor served");
    }

    #[test]
    fn b23_a_read_waits_for_a_save_in_progress_rather_than_finding_no_package() {
        // a save holds the write lock from moving the old folder aside to moving the new one in; a read taken meanwhile found no
        // folder (a 404, an empty answer). It now waits for the lock and reads the package as the save left it.
        let dir = tempfile::tempdir().unwrap();
        write(dir.path(), "recipe.mine", &package("recipe:mine"));
        let widgets = Widgets::with(dir.path().to_path_buf(), true);
        let held = widgets.write.lock().unwrap();
        // the save's window: the package is not in its place
        std::fs::rename(dir.path().join("recipe.mine"), dir.path().join("aside")).unwrap();
        std::thread::scope(|s| {
            let (tx, rx) = std::sync::mpsc::channel();
            let w = &widgets;
            s.spawn(move || tx.send(w.read_package("recipe.mine", "recipe.json").map(|files| files.len())).unwrap());
            assert!(rx.recv_timeout(std::time::Duration::from_millis(200)).is_err(), "the read waits while the save holds the lock");
            std::fs::rename(dir.path().join("aside"), dir.path().join("recipe.mine")).unwrap();
            drop(held);
            assert_eq!(rx.recv().unwrap(), Ok(package("recipe:mine").len()), "then reads the package the save left");
        });
        assert_eq!(widgets.read_package("recipe.none", "recipe.json"), Err(404));
    }

    fn write(dir: &Path, key: &str, files: &Files) -> PathBuf {
        let root = dir.join(key);
        for (path, bytes) in files {
            std::fs::create_dir_all(root.join(path).parent().unwrap()).unwrap();
            std::fs::write(root.join(path), bytes).unwrap();
        }
        root
    }

    #[test]
    fn a_crash_leftover_is_swept_and_a_set_aside_package_is_put_back() {
        let dir = tempfile::tempdir().unwrap();
        write(dir.path(), "recipe.kept", &package("recipe:kept"));
        write(dir.path(), ".import-1", &package("recipe:half"));
        write(dir.path(), ".import-old-recipe.back-11111111-2222-3333-4444-555555555555", &package("recipe:back"));
        Widgets::with(dir.path().to_path_buf(), true).sweep();
        let mut names: Vec<String> =
            std::fs::read_dir(dir.path()).unwrap().map(|e| e.unwrap().file_name().to_string_lossy().into_owned()).collect();
        names.sort();
        assert_eq!(names, ["recipe.back", "recipe.kept"]);
    }

    #[test]
    fn two_imports_at_once_cannot_pass_the_count_cap_together() {
        for round in 0..10 {
            let dir = tempfile::tempdir().unwrap();
            let widgets = Widgets::with(dir.path().to_path_buf(), true);
            for k in 0..WIDGETS_MAX - 1 {
                write(dir.path(), &format!("recipe.p{k}"), &package(&format!("recipe:p{k}")));
            }
            let gate = std::sync::Barrier::new(2);
            let (a, b) = (package("recipe:a"), package("recipe:b"));
            let stored = std::thread::scope(|scope| {
                let x = scope.spawn(|| {
                    gate.wait();
                    widgets.store("recipe.a", &a, "import", || None).unwrap().is_ok()
                });
                let y = scope.spawn(|| {
                    gate.wait();
                    widgets.store("recipe.b", &b, "import", || None).unwrap().is_ok()
                });
                [x.join().unwrap(), y.join().unwrap()]
            });
            assert_eq!(stored.iter().filter(|ok| **ok).count(), 1, "round {round}: {stored:?}");
        }
    }
}
