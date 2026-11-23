// Pack signatures (Cyberspec v2): who published a theme pack's files, and whether Themely checked them and a person reviewed
// exactly those files. Not `pack_sign.rs`, the local mark that the studio's render check passed on this machine: that one is
// never shown as verified, and a gallery cannot carry it.
//
// - The manifest is the server's own, made from the files on every read: `{ "format": 1, "id", "version", "files": [{ "path",
//   "size", "sha256" }] }` over every file of the pack folder but the two signature files and the local mark (`pack.sig`), in
//   path order, as canonical JSON (widget_sign.rs) after `DOMAIN`. tools/packs/sign.mjs makes the same bytes
//   (tests/fixtures/packs/canonical-vector.json pins both).
// - The publisher signs those bytes with minisign (`pack.minisig`), the scheme of the code widgets' signatures.
// - Themely countersigns a statement, `{ manifestSha256, packId, version, publisherKeyId, checksVersion, reviewLevel,
//   sourceHash, issuedAt }`, after `STATEMENT_DOMAIN`: `themely.json` holds `{ "statement", "publisherKey", "minisign" }`. Its
//   key is pinned here (`THEMELY_PACK_KEY`), a slot of its own, never the code widgets' `THEMELY_KEY` or the updater's key, and
//   it stays empty and off until the owner sets it. A debug build takes a test key from `PACK_THEMELY_TEST_KEY`.
// - The states (`evaluate`): Verified (Themely's countersignature, a person's review and the publisher's signature, all over
//   these bytes), Signed (by a key the user added in Settings › Widget publishers, not reviewed), Unverified (no signature, or
//   one from a key this app does not know), Modified (a signature this app can check no longer matches the files) and Revoked
//   (its key or the pack itself is on a revoke list). Modified and Revoked packs are refused with the reason.

use base64::engine::general_purpose::STANDARD;
use base64::Engine;
use serde_json::{json, Value};

use crate::widget_sign::{self, Key};
use crate::widgets::sha256_hex;

/// What a publisher's signed bytes start with, so a signature over a pack is never read as one over anything else.
pub const DOMAIN: &[u8] = b"infopanel-studio theme pack 1\n";
/// What Themely's countersigned statement starts with.
pub const STATEMENT_DOMAIN: &[u8] = b"infopanel-studio pack review 1\n";
/// The publisher's signature and Themely's countersignature: files of a pack folder, outside the manifest.
pub const PUBLISHER_SIG: &str = "pack.minisig";
pub const COUNTERSIG: &str = "themely.json";
/// The local render-check mark (pack_sign.rs), outside the manifest too.
const LOCAL_MARK: &str = "pack.sig";

/// Themely's pack key (minisign's key line), once Themely reviews packs; `THEMELY_PACK_ENABLED` turns the slot on.
pub const THEMELY_PACK_KEY: Option<&str> = None;
pub const THEMELY_PACK_ENABLED: bool = false;
/// The review level a statement needs for "Verified": the automated checks and a person's review.
pub const REVIEWED: &str = "reviewed";

/// The pinned Themely pack key: the built-in slot when it is set up, else (a debug build only) `PACK_THEMELY_TEST_KEY`.
pub fn themely_key() -> Option<Key> {
    #[cfg(debug_assertions)]
    if let Some(line) = crate::env::non_empty("PACK_THEMELY_TEST_KEY") {
        return Key::parse(&line).ok();
    }
    THEMELY_PACK_KEY.filter(|_| THEMELY_PACK_ENABLED).and_then(|k| Key::parse(k).ok())
}

/// One file in a manifest.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Entry {
    pub path: String,
    pub size: u64,
    pub sha256: String,
}

/// The manifest entries of a pack's files: every one but the signatures and the local mark.
pub fn entries(files: &[(String, Vec<u8>)]) -> Vec<Entry> {
    files
        .iter()
        .filter(|(path, _)| ![PUBLISHER_SIG, COUNTERSIG, LOCAL_MARK].contains(&path.as_str()))
        .map(|(path, bytes)| Entry { path: path.clone(), size: bytes.len() as u64, sha256: sha256_hex(bytes) })
        .collect()
}

/// The bytes a publisher signs: `DOMAIN`, then the canonical manifest of pack `id` at `version` with these files (path order).
pub fn manifest_bytes(id: &str, version: &str, entries: &[Entry]) -> Vec<u8> {
    let mut sorted: Vec<&Entry> = entries.iter().collect();
    sorted.sort_by(|a, b| a.path.as_bytes().cmp(b.path.as_bytes()));
    let files: Vec<Value> = sorted.iter().map(|e| json!({ "path": e.path, "size": e.size, "sha256": e.sha256 })).collect();
    let manifest = json!({ "format": 1, "id": id, "version": version, "files": files });
    // every value is a string, a whole number or a list of them: the canonical form always exists
    [DOMAIN, widget_sign::canonical_json(&manifest).unwrap_or_default().as_bytes()].concat()
}

/// A pack's `x.y.z` version as numbers; anything else is 0.0.0 (the validator refuses it before a pack is worn).
pub fn version_of(text: &str) -> (u64, u64, u64) {
    let parts: Vec<u64> = text.split('.').map_while(|p| p.parse().ok()).collect();
    match parts.as_slice() {
        [a, b, c] if text.split('.').count() == 3 => (*a, *b, *c),
        _ => (0, 0, 0),
    }
}

/// A pack on a revoke list: by its manifest's SHA-256, or by its id (and version) when it carries a signature.
#[derive(Clone, Debug, Default)]
pub struct Withdrawn {
    pub id: Option<String>,
    pub version: Option<String>,
    pub manifest: Option<String>,
    pub reason: String,
}

impl Withdrawn {
    /// The entries of a list's `packs`: `{ "id"?, "version"?, "manifestSha256"?, "reason" }`, each naming an id or a manifest.
    pub fn list(value: Option<&Value>) -> Vec<Withdrawn> {
        let text = |v: &Value, k: &str| v.get(k).and_then(Value::as_str).map(str::to_string);
        value
            .and_then(Value::as_array)
            .into_iter()
            .flatten()
            .map(|e| Withdrawn {
                id: text(e, "id"),
                version: text(e, "version"),
                manifest: text(e, "manifestSha256").map(|m| m.to_ascii_lowercase()),
                reason: text(e, "reason").unwrap_or_else(|| "withdrawn".into()).chars().take(200).collect(),
            })
            .filter(|w| w.id.is_some() || w.manifest.is_some())
            .collect()
    }
}

/// A publisher key the user trusts: its name, the key, and whether its packs may run scripts.
#[derive(Clone, Debug)]
pub struct Publisher {
    pub name: String,
    pub key: Key,
    pub scripts: bool,
}

/// What a pack is checked against: Themely's pinned key, the user's publisher keys, and the revoke lists.
#[derive(Clone, Debug, Default)]
pub struct Ring {
    pub themely: Option<Key>,
    pub publishers: Vec<Publisher>,
    /// Revoked keys (by id or key bytes), with the reason shown.
    pub revoked_keys: Vec<(Key, String)>,
    pub revoked_packs: Vec<Withdrawn>,
}

impl Ring {
    fn revoked(&self, key: &Key) -> Option<&str> {
        self.revoked_keys.iter().find(|(r, _)| r.id == key.id || r.bytes == key.bytes).map(|(_, why)| why.as_str())
    }

    fn revoked_id(&self, id: &[u8; 8]) -> Option<&str> {
        self.revoked_keys.iter().find(|(r, _)| &r.id == id).map(|(_, why)| why.as_str())
    }

    /// Whether a list names manifests: only then is an unsigned pack hashed to be looked up.
    pub fn names_manifests(&self) -> bool {
        self.revoked_packs.iter().any(|w| w.manifest.is_some())
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum State {
    Verified,
    Signed,
    Unverified,
    Modified,
    Revoked,
}

impl State {
    pub fn word(self) -> &'static str {
        match self {
            State::Verified => "verified",
            State::Signed => "signed",
            State::Unverified => "unverified",
            State::Modified => "modified",
            State::Revoked => "revoked",
        }
    }

    /// Whether the pack is refused: not worn, its files not served.
    pub fn refused(self) -> bool {
        matches!(self, State::Modified | State::Revoked)
    }
}

/// A pack's trust: its state, who signed it, why it is refused, whether its signer allows scripts, and what was checked.
#[derive(Clone, Debug)]
pub struct Trust {
    pub state: State,
    pub publisher: Option<String>,
    pub reason: Option<String>,
    /// Verified, or signed by a key whose "Allow pack scripts" is on.
    pub scripts_allowed: bool,
    pub manifest_sha256: String,
    pub version: String,
    /// The publisher key the signature verified with (Verified and Signed).
    pub key: Option<Key>,
}

impl Trust {
    fn of(state: State, manifest: &str, version: &str) -> Trust {
        Trust {
            state,
            publisher: None,
            reason: None,
            scripts_allowed: false,
            manifest_sha256: manifest.to_string(),
            version: version.to_string(),
            key: None,
        }
    }

    fn refused(state: State, why: impl Into<String>, manifest: &str, version: &str) -> Trust {
        Trust { reason: Some(why.into()), ..Trust::of(state, manifest, version) }
    }

    /// The listing's word for it: `{ "state", "publisher"?, "reason"? }`.
    pub fn view(&self) -> Value {
        let mut out = json!({ "state": self.state.word() });
        if let Some(p) = &self.publisher {
            out["publisher"] = json!(p);
        }
        if let Some(r) = &self.reason {
            out["reason"] = json!(r);
        }
        out
    }
}

/// The statement Themely countersigns, as `themely.json` carries it.
struct Statement {
    manifest: String,
    pack: String,
    version: String,
    publisher_key_id: String,
    review: String,
}

fn statement_of(value: &Value) -> Option<Statement> {
    let text = |k: &str| value.get(k).and_then(Value::as_str).map(str::to_string);
    value.get("checksVersion")?.as_u64()?;
    text("sourceHash")?;
    text("issuedAt")?;
    Some(Statement {
        manifest: text("manifestSha256")?.to_ascii_lowercase(),
        pack: text("packId")?,
        version: text("version")?,
        publisher_key_id: text("publisherKeyId")?.to_ascii_uppercase(),
        review: text("reviewLevel")?,
    })
}

/// The bytes Themely signs: `STATEMENT_DOMAIN`, then the statement as canonical JSON.
pub fn statement_bytes(statement: &Value) -> Result<Vec<u8>, String> {
    Ok([STATEMENT_DOMAIN, widget_sign::canonical_json(statement)?.as_bytes()].concat())
}

/// What `themely.json` says when its countersignature is Themely's and holds: `Ok(None)` when there is none to check here
/// (no file, no Themely key, another key's or a statement short of a person's review), `Err` with the state and reason when the
/// pack is refused, else the publisher key it names.
fn countersigned(text: &[u8], id: &str, version: &str, manifest: &str, ring: &Ring) -> Result<Option<Key>, (State, String)> {
    let Some(themely) = &ring.themely else {
        return Ok(None);
    };
    let modified = |why: &str| (State::Modified, why.to_string());
    let doc: Value = serde_json::from_slice(text).map_err(|_| modified("Themely's countersignature is damaged"))?;
    let sig = doc.get("minisign").and_then(Value::as_str).ok_or_else(|| modified("Themely's countersignature is damaged"))?;
    let key_id = widget_sign::sig_key_id(sig).ok_or_else(|| modified("Themely's countersignature is damaged"))?;
    if let Some(why) = ring.revoked_id(&key_id).or_else(|| ring.revoked(themely).filter(|_| key_id == themely.id)) {
        return Err((State::Revoked, format!("the review key was withdrawn ({why})")));
    }
    if key_id != themely.id {
        return Ok(None);
    }
    let body = doc.get("statement").cloned().unwrap_or(Value::Null);
    let bytes = statement_bytes(&body).map_err(|_| modified("Themely's countersignature is damaged"))?;
    if !themely.verifies(&bytes, sig) {
        return Err(modified("Themely's countersignature does not match it"));
    }
    let statement = statement_of(&body).ok_or_else(|| modified("Themely's countersignature is damaged"))?;
    if statement.pack != id || statement.version != version || statement.manifest != manifest {
        return Err(modified("its files changed since Themely reviewed them"));
    }
    if statement.review != REVIEWED {
        return Ok(None);
    }
    let publisher = doc.get("publisherKey").and_then(Value::as_str).and_then(|k| Key::parse(k).ok());
    match publisher {
        Some(key) if key.fingerprint() == statement.publisher_key_id => Ok(Some(key)),
        _ => Err(modified("Themely's countersignature names another publisher key")),
    }
}

/// The trust of pack `id` with these files (and `extra` manifest entries for files not here yet: the import's `pack.css`, which
/// the signing route stores after it). The files are hashed now, every time: nothing is taken from an earlier check.
pub fn evaluate(id: &str, files: &[(String, Vec<u8>)], extra: &[Entry], ring: &Ring) -> Trust {
    let file = |name: &str| files.iter().find(|(p, _)| p == name).map(|(_, b)| b.as_slice());
    let version = file("pack.json")
        .and_then(|b| serde_json::from_slice::<Value>(b).ok())
        .and_then(|p| p.get("version")?.as_str().map(str::to_string))
        .unwrap_or_default();
    let mut listed = entries(files);
    listed.extend(extra.iter().filter(|e| !listed.iter().any(|l| l.path == e.path)).cloned().collect::<Vec<_>>());
    let manifest = sha256_hex(&manifest_bytes(id, &version, &listed));
    let (minisig, counter) = (file(PUBLISHER_SIG), file(COUNTERSIG));
    let signed = minisig.is_some() || counter.is_some();
    let withdrawn = ring.revoked_packs.iter().find(|w| {
        w.manifest.as_deref() == Some(manifest.as_str())
            || (signed && w.id.as_deref() == Some(id) && w.version.as_deref().is_none_or(|v| v == version))
    });
    if let Some(w) = withdrawn {
        return Trust::refused(State::Revoked, w.reason.clone(), &manifest, &version);
    }
    let message = manifest_bytes(id, &version, &listed);
    // a signature file saved with Windows line ends reads the same (it is outside the manifest)
    let sig_text = minisig.map(|b| String::from_utf8_lossy(b).replace("\r\n", "\n"));
    if let Some(counter) = counter {
        match countersigned(counter, id, &version, &manifest, ring) {
            Err((state, why)) => return Trust::refused(state, why, &manifest, &version),
            Ok(Some(key)) => {
                if let Some(why) = ring.revoked(&key) {
                    return Trust::refused(State::Revoked, format!("the publisher's key was withdrawn ({why})"), &manifest, &version);
                }
                if !sig_text.as_deref().is_some_and(|s| key.verifies(&message, s)) {
                    return Trust::refused(State::Modified, "the publisher's signature does not match its files", &manifest, &version);
                }
                let publisher = ring.publishers.iter().find(|p| p.key.bytes == key.bytes).map(|p| p.name.clone());
                return Trust { publisher, scripts_allowed: true, key: Some(key), ..Trust::of(State::Verified, &manifest, &version) };
            }
            Ok(None) => {}
        }
    }
    let Some(sig) = sig_text else {
        return Trust::of(State::Unverified, &manifest, &version);
    };
    let Some(key_id) = widget_sign::sig_key_id(&sig) else {
        return Trust::refused(State::Modified, "the publisher's signature is damaged", &manifest, &version);
    };
    if let Some(why) = ring.revoked_id(&key_id) {
        return Trust::refused(State::Revoked, format!("the publisher's key was withdrawn ({why})"), &manifest, &version);
    }
    let Some(publisher) = ring.publishers.iter().find(|p| p.key.id == key_id) else {
        let why = format!("signed with a key you have not added ({})", widget_sign::fingerprint(&key_id));
        return Trust { reason: Some(why), ..Trust::of(State::Unverified, &manifest, &version) };
    };
    if let Some(why) = ring.revoked(&publisher.key) {
        return Trust::refused(State::Revoked, format!("the publisher's key was withdrawn ({why})"), &manifest, &version);
    }
    if !publisher.key.verifies(&message, &sig) {
        return Trust::refused(State::Modified, "its files changed since they were signed", &manifest, &version);
    }
    Trust {
        publisher: Some(publisher.name.clone()),
        scripts_allowed: publisher.scripts,
        key: Some(publisher.key.clone()),
        ..Trust::of(State::Signed, &manifest, &version)
    }
}

/// What the server remembers of the last signed version of a pack id it stored (kept when the pack is removed): its key, its
/// version, its manifest and whether it was verified.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Installed {
    pub key: String,
    pub version: String,
    pub manifest: String,
    pub verified: bool,
}

impl Installed {
    pub fn of(value: &Value) -> Option<Installed> {
        let text = |k: &str| value.get(k).and_then(Value::as_str).map(str::to_string);
        Some(Installed {
            key: text("key")?,
            version: text("version")?,
            manifest: text("manifest")?,
            verified: value.get("verified").and_then(Value::as_bool).unwrap_or(false),
        })
    }

    pub fn to_json(&self) -> Value {
        json!({ "key": self.key, "version": self.version, "manifest": self.manifest, "verified": self.verified })
    }

    /// The record a stored signed pack leaves, or `None` for one that is not signed.
    pub fn after(trust: &Trust) -> Option<Installed> {
        let key = trust.key.as_ref()?;
        matches!(trust.state, State::Verified | State::Signed).then(|| Installed {
            key: key.line.clone(),
            version: trust.version.clone(),
            manifest: trust.manifest_sha256.clone(),
            verified: trust.state == State::Verified,
        })
    }
}

/// Why an import of `next` is refused, or `None`. `stored` is the trust of the pack of that id stored now, `installed` the record
/// of the last signed version stored. A Modified or Revoked pack is refused; a signed one replaces a signed one only with the same
/// publisher key, a reviewed one only with a reviewed one, and never with a lower version (the same version only with the same
/// files); a signed pack stored is never replaced by an unsigned one.
pub fn update_refusal(next: &Trust, stored: Option<&Trust>, installed: Option<&Installed>) -> Option<String> {
    if next.state.refused() {
        let why = next.reason.clone().unwrap_or_default();
        return Some(if next.state == State::Revoked {
            format!("this pack was withdrawn: {why}")
        } else {
            format!("this pack was changed since it was signed: {why}")
        });
    }
    let signed = |t: &Trust| matches!(t.state, State::Verified | State::Signed);
    if !signed(next) {
        return stored.filter(|s| signed(s)).map(|_| "the pack stored is signed: an update must be signed with the same key".to_string());
    }
    let record = installed?;
    let same_key = Key::parse(&record.key).ok().zip(next.key.as_ref()).is_some_and(|(was, now)| was.bytes == now.bytes);
    if !same_key {
        return Some("an earlier version of this pack was signed with another key".into());
    }
    if record.verified && next.state != State::Verified {
        return Some("an earlier version of this pack was reviewed by Themely: an update must be too".into());
    }
    let (was, now) = (version_of(&record.version), version_of(&next.version));
    if now < was || (now == was && next.manifest_sha256 != record.manifest) {
        return Some(format!("version {} is not newer than {}, which was installed before", next.version, record.version));
    }
    None
}

/// The key line of a minisign key's id and public key bytes (for tests and tools that hold only the bytes).
pub fn key_line(id: &[u8; 8], public: &[u8; 32]) -> String {
    STANDARD.encode([b"Ed".as_slice(), id, public].concat())
}

/// Minisign signatures made in tests: an Ed25519 key from a fixed seed (rustls' ring signer, already a dependency), and the
/// `.minisig` text minisign writes (pre-hashed `ED`, with a trusted comment and its global signature).
#[cfg(test)]
pub(crate) mod testing {
    use std::sync::Arc;

    use blake2::{Blake2b512, Digest};
    use rustls::crypto::ring::sign::any_eddsa_type;
    use rustls::pki_types::PrivatePkcs8KeyDer;
    use rustls::sign::SigningKey;
    use rustls::SignatureScheme;

    use super::*;

    const PKCS8_ED25519: [u8; 16] = [0x30, 0x2e, 0x02, 0x01, 0x00, 0x30, 0x05, 0x06, 0x03, 0x2b, 0x65, 0x70, 0x04, 0x22, 0x04, 0x20];

    pub struct Signer {
        pub id: [u8; 8],
        key: Arc<dyn SigningKey>,
        pub public: [u8; 32],
    }

    impl Signer {
        pub fn new(seed: u8) -> Signer {
            let der = [PKCS8_ED25519.as_slice(), &[seed; 32]].concat();
            let key = any_eddsa_type(&PrivatePkcs8KeyDer::from(der)).unwrap();
            let spki = key.public_key().unwrap();
            let public: [u8; 32] = spki.as_ref()[spki.as_ref().len() - 32..].try_into().unwrap();
            Signer { id: [seed; 8], key, public }
        }

        pub fn key(&self) -> Key {
            Key::parse(&key_line(&self.id, &self.public)).unwrap()
        }

        fn raw(&self, message: &[u8]) -> Vec<u8> {
            self.key.choose_scheme(&[SignatureScheme::ED25519]).unwrap().sign(message).unwrap()
        }

        pub fn sign(&self, message: &[u8]) -> String {
            let sig = self.raw(&Blake2b512::digest(message));
            let comment = "test";
            let global = self.raw(&[sig.as_slice(), comment.as_bytes()].concat());
            format!(
                "untrusted comment: test\n{}\ntrusted comment: {comment}\n{}\n",
                STANDARD.encode([b"ED".as_slice(), &self.id, &sig].concat()),
                STANDARD.encode(global)
            )
        }
    }

    /// A pack's files as a test writes them: pack.json at `version`, look.json and one asset.
    pub fn pack(id: &str, version: &str) -> Vec<(String, Vec<u8>)> {
        vec![
            ("pack.json".into(), json!({ "id": id, "name": "Test", "version": version }).to_string().into_bytes()),
            ("look.json".into(), json!({ "id": id }).to_string().into_bytes()),
            ("assets/fx.js".into(), b"fx.onFrame(() => {});".to_vec()),
        ]
    }

    /// `files` with the publisher's signature added.
    pub fn signed(id: &str, mut files: Vec<(String, Vec<u8>)>, by: &Signer) -> Vec<(String, Vec<u8>)> {
        let version = serde_json::from_slice::<Value>(&files[0].1).unwrap()["version"].as_str().unwrap().to_string();
        let sig = by.sign(&manifest_bytes(id, &version, &entries(&files)));
        files.push((PUBLISHER_SIG.into(), sig.into_bytes()));
        files
    }

    /// `files` (signed by `publisher`) with Themely's countersignature added, at `review`.
    pub fn with_review(
        id: &str,
        mut files: Vec<(String, Vec<u8>)>,
        publisher: &Signer,
        themely: &Signer,
        review: &str,
    ) -> Vec<(String, Vec<u8>)> {
        let version = serde_json::from_slice::<Value>(&files[0].1).unwrap()["version"].as_str().unwrap().to_string();
        let manifest = sha256_hex(&manifest_bytes(id, &version, &entries(&files)));
        let statement = json!({
            "manifestSha256": manifest, "packId": id, "version": version, "publisherKeyId": publisher.key().fingerprint(),
            "checksVersion": 1, "reviewLevel": review, "sourceHash": "", "issuedAt": "2026-11-23T00:00:00Z",
        });
        let sig = themely.sign(&statement_bytes(&statement).unwrap());
        let doc = json!({ "statement": statement, "publisherKey": publisher.key().line, "minisign": sig });
        files.push((COUNTERSIG.into(), doc.to_string().into_bytes()));
        files
    }
}

#[cfg(test)]
mod tests {
    use super::testing::*;
    use super::*;

    fn fixtures() -> std::path::PathBuf {
        std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../../../tests/fixtures/packs")
    }

    fn ring(themely: &Signer, publishers: &[(&Signer, &str, bool)]) -> Ring {
        Ring {
            themely: Some(themely.key()),
            publishers: publishers
                .iter()
                .map(|(s, name, scripts)| Publisher { name: name.to_string(), key: s.key(), scripts: *scripts })
                .collect(),
            ..Ring::default()
        }
    }

    fn with(files: &[(String, Vec<u8>)], path: &str, bytes: &[u8]) -> Vec<(String, Vec<u8>)> {
        files.iter().map(|(p, b)| (p.clone(), if p == path { bytes.to_vec() } else { b.clone() })).collect()
    }

    #[test]
    fn the_manifest_matches_the_test_vector_and_leaves_the_signatures_out() {
        let vector: Value = serde_json::from_str(&std::fs::read_to_string(fixtures().join("canonical-vector.json")).unwrap()).unwrap();
        let files: Vec<(String, Vec<u8>)> = vector["files"]
            .as_array()
            .unwrap()
            .iter()
            .map(|f| (f["path"].as_str().unwrap().to_string(), f["text"].as_str().unwrap().as_bytes().to_vec()))
            .collect();
        let bytes = manifest_bytes(vector["id"].as_str().unwrap(), vector["version"].as_str().unwrap(), &entries(&files));
        assert_eq!(String::from_utf8(bytes.clone()).unwrap(), vector["canonical"].as_str().unwrap());
        assert_eq!(sha256_hex(&bytes), vector["sha256"].as_str().unwrap());
        let more = [
            files.clone(),
            vec![("pack.minisig".into(), b"x".to_vec()), ("themely.json".into(), b"{}".to_vec()), ("pack.sig".into(), b"y".to_vec())],
        ]
        .concat();
        assert_eq!(entries(&more), entries(&files), "the signatures and the local mark are not in it");
        let reordered: Vec<_> = files.iter().rev().cloned().collect();
        assert_eq!(manifest_bytes("a", "1.0.0", &entries(&reordered)), manifest_bytes("a", "1.0.0", &entries(&files)), "path order");
    }

    #[test]
    fn a_pack_signed_by_a_tool_signature_verifies_here() {
        // tests/fixtures/packs/signed: signed by tools/packs/sign.mjs with a throwaway key whose secret half was not kept
        let dir = fixtures().join("signed");
        let files: Vec<(String, Vec<u8>)> =
            ["pack.json", "look.json", "pack.minisig"].iter().map(|p| (p.to_string(), std::fs::read(dir.join(p)).unwrap())).collect();
        let key = Key::parse(&std::fs::read_to_string(fixtures().join("TEST-ONLY-pack-publisher.pub")).unwrap()).unwrap();
        let ring = Ring { publishers: vec![Publisher { name: "Tool".into(), key, scripts: false }], ..Ring::default() };
        let trust = evaluate("signed-fixture", &files, &[], &ring);
        assert_eq!((trust.state, trust.publisher.as_deref()), (State::Signed, Some("Tool")), "{:?}", trust.reason);
        let crlf: Vec<_> = files
            .iter()
            .map(|(p, b)| {
                (p.clone(), if p == PUBLISHER_SIG { String::from_utf8_lossy(b).replace('\n', "\r\n").into_bytes() } else { b.clone() })
            })
            .collect();
        assert_eq!(evaluate("signed-fixture", &crlf, &[], &ring).state, State::Signed, "a signature saved with Windows line ends");
    }

    #[test]
    fn each_state_and_its_reason() {
        let (publisher, themely, stranger) = (Signer::new(1), Signer::new(2), Signer::new(3));
        let plain = pack("mine", "1.0.0");
        let r = ring(&themely, &[(&publisher, "Acme", false)]);
        assert_eq!(evaluate("mine", &plain, &[], &r).state, State::Unverified);
        let by_acme = signed("mine", plain.clone(), &publisher);
        let trust = evaluate("mine", &by_acme, &[], &r);
        assert_eq!((trust.state, trust.publisher.as_deref(), trust.scripts_allowed), (State::Signed, Some("Acme"), false));
        let allowed = ring(&themely, &[(&publisher, "Acme", true)]);
        assert!(evaluate("mine", &by_acme, &[], &allowed).scripts_allowed, "the key's switch");
        let unknown = evaluate("mine", &signed("mine", plain.clone(), &stranger), &[], &r);
        assert_eq!(unknown.state, State::Unverified, "a key this app does not know");
        assert!(unknown.reason.unwrap().contains("have not added"));
        let changed = with(&by_acme, "look.json", b"{\"id\":\"mine\",\"x\":1}");
        assert_eq!(evaluate("mine", &changed, &[], &r).state, State::Modified, "a byte changed");
        let added = [by_acme.clone(), vec![("assets/more.png".into(), vec![1])]].concat();
        assert_eq!(evaluate("mine", &added, &[], &r).state, State::Modified, "a file added");
        assert_eq!(evaluate("other", &by_acme, &[], &r).state, State::Modified, "another id");
        let damaged = with(&by_acme, "pack.minisig", b"not a signature");
        assert_eq!(evaluate("mine", &damaged, &[], &r).state, State::Modified);

        let reviewed = with_review("mine", by_acme.clone(), &publisher, &themely, REVIEWED);
        let none = Ring { themely: Some(themely.key()), ..Ring::default() };
        let trust = evaluate("mine", &reviewed, &[], &none);
        assert_eq!((trust.state, trust.scripts_allowed), (State::Verified, true), "{:?}", trust.reason);
        assert_eq!(evaluate("mine", &reviewed, &[], &r).publisher.as_deref(), Some("Acme"), "named when the user has the key too");
        let off = Ring::default();
        assert_eq!(evaluate("mine", &reviewed, &[], &off).state, State::Unverified, "the Themely slot off: an unknown signature");
        let automated = with_review("mine", by_acme.clone(), &publisher, &themely, "automated");
        assert_eq!(evaluate("mine", &automated, &[], &none).state, State::Unverified, "checks without a person's review");
        let edited = with(&reviewed, "look.json", b"{}");
        assert_eq!(evaluate("mine", &edited, &[], &none).state, State::Modified, "after the review");
        let forged = with_review("mine", by_acme.clone(), &publisher, &stranger, REVIEWED);
        let swapped: Vec<_> = by_acme.iter().cloned().chain(forged.iter().filter(|(p, _)| p == COUNTERSIG).cloned()).collect();
        assert_eq!(evaluate("mine", &swapped, &[], &none).state, State::Unverified, "another key's countersignature is not Themely's");
        let mut statement: Value = serde_json::from_slice(&reviewed.last().unwrap().1).unwrap();
        statement["statement"]["reviewLevel"] = json!("reviewed ");
        let tampered = with(&reviewed, COUNTERSIG, statement.to_string().as_bytes());
        assert_eq!(evaluate("mine", &tampered, &[], &none).state, State::Modified, "a statement edited after Themely signed it");
        let resigned = with(&reviewed, PUBLISHER_SIG, stranger.sign(b"other").as_bytes());
        assert_eq!(evaluate("mine", &resigned, &[], &none).state, State::Modified, "the publisher's signature does not hold");
    }

    #[test]
    fn a_revoked_key_or_pack_refuses_with_its_reason() {
        let (publisher, themely) = (Signer::new(1), Signer::new(2));
        let by_acme = signed("mine", pack("mine", "1.0.0"), &publisher);
        let reviewed = with_review("mine", by_acme.clone(), &publisher, &themely, REVIEWED);
        let mut r = ring(&themely, &[(&publisher, "Acme", true)]);
        r.revoked_keys = vec![(publisher.key(), "stolen".into())];
        for files in [&by_acme, &reviewed] {
            let trust = evaluate("mine", files, &[], &r);
            assert_eq!(trust.state, State::Revoked);
            assert!(trust.reason.unwrap().contains("stolen"));
        }
        let mut r = ring(&themely, &[(&publisher, "Acme", true)]);
        r.revoked_keys = vec![(themely.key(), "leaked".into())];
        assert_eq!(evaluate("mine", &reviewed, &[], &r).state, State::Revoked, "the review key");
        let mut r = ring(&themely, &[(&publisher, "Acme", true)]);
        r.revoked_packs = Withdrawn::list(Some(&json!([{ "id": "mine", "version": "1.0.0", "reason": "copies a logo" }])));
        let trust = evaluate("mine", &by_acme, &[], &r);
        assert_eq!((trust.state, trust.reason.as_deref()), (State::Revoked, Some("copies a logo")));
        assert_eq!(evaluate("mine", &pack("mine", "1.0.0"), &[], &r).state, State::Unverified, "an id names signed packs only");
        assert_eq!(evaluate("mine", &signed("mine", pack("mine", "1.0.1"), &publisher), &[], &r).state, State::Signed, "another version");
        let manifest = evaluate("mine", &pack("mine", "1.0.0"), &[], &Ring::default()).manifest_sha256;
        r.revoked_packs = Withdrawn::list(Some(&json!([{ "manifestSha256": manifest.to_uppercase(), "reason": "malware" }])));
        assert!(r.names_manifests());
        assert_eq!(evaluate("mine", &pack("mine", "1.0.0"), &[], &r).state, State::Revoked, "a manifest names any pack");
    }

    #[test]
    fn a_file_still_to_come_counts_in_the_manifest() {
        let (publisher, themely) = (Signer::new(1), Signer::new(2));
        let full = [pack("mine", "1.0.0"), vec![("pack.css".into(), b"a{}".to_vec())]].concat();
        let by_acme = signed("mine", full, &publisher);
        let r = ring(&themely, &[(&publisher, "Acme", false)]);
        let without: Vec<_> = by_acme.iter().filter(|(p, _)| p != "pack.css").cloned().collect();
        assert_eq!(evaluate("mine", &without, &[], &r).state, State::Modified, "pack.css missing");
        let css = Entry { path: "pack.css".into(), size: 3, sha256: sha256_hex(b"a{}") };
        assert_eq!(evaluate("mine", &without, &[css], &r).state, State::Signed, "the import's pack.css, by its hash");
    }

    #[test]
    fn versions_compare_as_numbers() {
        assert!(version_of("1.10.0") > version_of("1.9.9"));
        assert_eq!(version_of("1.2"), (0, 0, 0));
        assert_eq!(version_of("1.2.3.4"), (0, 0, 0));
        assert_eq!(version_of("x"), (0, 0, 0));
    }

    #[test]
    fn an_update_keeps_the_key_the_review_and_a_rising_version() {
        let (publisher, themely, other) = (Signer::new(1), Signer::new(2), Signer::new(3));
        let r = ring(&themely, &[(&publisher, "Acme", false), (&other, "Other", false)]);
        let at = |v: &str, by: &Signer| evaluate("mine", &signed("mine", pack("mine", v), by), &[], &r);
        let first = at("1.1.0", &publisher);
        let record = Installed::after(&first).unwrap();
        assert_eq!(Installed::of(&record.to_json()), Some(record.clone()));
        assert_eq!(update_refusal(&first, Some(&first), Some(&record)), None, "the same files again");
        assert_eq!(update_refusal(&at("1.2.0", &publisher), Some(&first), Some(&record)), None);
        assert!(update_refusal(&at("1.0.0", &publisher), Some(&first), Some(&record)).unwrap().contains("not newer"), "rollback");
        assert!(update_refusal(&at("1.0.0", &publisher), None, Some(&record)).is_some(), "rollback after a remove");
        let same_version = evaluate("mine", &signed("mine", with(&pack("mine", "1.1.0"), "look.json", b"{}"), &publisher), &[], &r);
        assert!(update_refusal(&same_version, Some(&first), Some(&record)).is_some(), "other files under the same version");
        assert!(update_refusal(&at("2.0.0", &other), Some(&first), Some(&record)).unwrap().contains("another key"));
        let plain = evaluate("mine", &pack("mine", "9.0.0"), &[], &r);
        assert!(update_refusal(&plain, Some(&first), Some(&record)).is_some(), "an unsigned pack over a signed one");
        assert_eq!(update_refusal(&plain, None, Some(&record)), None, "an unsigned pack after the signed one was removed");
        assert_eq!(update_refusal(&first, Some(&plain), None), None, "a signed pack over an unsigned one");
        let reviewed = evaluate(
            "mine",
            &with_review("mine", signed("mine", pack("mine", "1.1.0"), &publisher), &publisher, &themely, REVIEWED),
            &[],
            &r,
        );
        let was_reviewed = Installed::after(&reviewed).unwrap();
        assert!(was_reviewed.verified);
        assert!(update_refusal(&at("1.3.0", &publisher), Some(&reviewed), Some(&was_reviewed)).unwrap().contains("reviewed"));
        let modified = Trust::refused(State::Modified, "x", "", "");
        assert!(update_refusal(&modified, None, None).unwrap().contains("changed since"));
        let revoked = Trust::refused(State::Revoked, "malware", "", "");
        assert_eq!(update_refusal(&revoked, None, None).unwrap(), "this pack was withdrawn: malware");
    }

    #[test]
    fn the_themely_pack_slot_is_its_own_and_off() {
        const { assert!(!THEMELY_PACK_ENABLED) };
        assert!(THEMELY_PACK_KEY.is_none(), "empty until the owner sets it");
        assert_ne!(DOMAIN, crate::widget_sign::DOMAIN, "a pack signature is never a widget package's");
        assert_ne!(DOMAIN, STATEMENT_DOMAIN);
    }
}
