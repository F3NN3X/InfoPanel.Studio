// Publisher signatures on widget packages (Phase 6a): who made a package, proved with a public key. Not `pack_sign.rs`, which is
// a MAC only this server can make and check (it proves a render check passed, not who published the bytes).
//
// A signature is minisign's (Ed25519, pre-hashed with BLAKE2b-512: the `ED` algorithm; the legacy `Ed` one is refused), over the
// package's canonical bytes: `DOMAIN` and then the manifest without its `signature` field, as canonical JSON (`canonical`). The
// manifest lists every other file with its size and SHA-256, so the signature covers the files too: a changed file fails its hash,
// a changed manifest fails the signature. It is carried in the manifest: `"signature": { "minisign": "<the .minisig text>" }`.
// FORMAT.md §17 defines the canonical form; `tests/fixtures/widgets/canonical-vector.json` is its test vector, checked here and
// by the signing tool's tests (tools/widgets/minisign.mjs), so both sides make the same bytes.
//
// A key id is only a label (minisign does not sign it), so a revoked key is matched by its key bytes as well as its id. And a key
// signs for the publishers it holds only: a code widget `ext:<publisher>.<id>` verifies only with a key whose `publishers` name
// that publisher (the owner's and Themely's are fixed, a user key's are given when it is added in Settings).

use base64::engine::general_purpose::STANDARD;
use base64::Engine;
use minisign_verify::{PublicKey, Signature};
use serde_json::Value;

/// What the signed bytes start with, so a signature over a package can never be read as one over anything else.
pub const DOMAIN: &[u8] = b"infopanel-studio widget package 1\n";

/// The canonical JSON of `value`: object keys sorted (ASCII only), no whitespace, strings escaped as `JSON.stringify` does,
/// numbers whole and non-negative. Anything else in a manifest has no canonical form and is refused.
fn write_canonical(value: &Value, out: &mut String) -> Result<(), String> {
    match value {
        Value::Null => out.push_str("null"),
        Value::Bool(b) => out.push_str(if *b { "true" } else { "false" }),
        Value::Number(n) => out.push_str(&n.as_u64().ok_or("a number in the manifest is not a whole number of at least 0")?.to_string()),
        Value::String(s) => out.push_str(&serde_json::to_string(s).map_err(|e| e.to_string())?),
        Value::Array(items) => {
            out.push('[');
            for (i, item) in items.iter().enumerate() {
                if i > 0 {
                    out.push(',');
                }
                write_canonical(item, out)?;
            }
            out.push(']');
        }
        Value::Object(map) => {
            let mut keys: Vec<&String> = map.keys().collect();
            if keys.iter().any(|k| !k.is_ascii()) {
                return Err("a field name in the manifest is not ASCII".into());
            }
            keys.sort();
            out.push('{');
            for (i, key) in keys.into_iter().enumerate() {
                if i > 0 {
                    out.push(',');
                }
                out.push_str(&serde_json::to_string(key).map_err(|e| e.to_string())?);
                out.push(':');
                write_canonical(&map[key], out)?;
            }
            out.push('}');
        }
    }
    Ok(())
}

/// The canonical JSON of `value` (`write_canonical`): also what a theme pack's manifest and Themely's statements are signed as
/// (pack_trust.rs), each after a domain of its own.
pub fn canonical_json(value: &Value) -> Result<String, String> {
    let mut json = String::new();
    write_canonical(value, &mut json)?;
    Ok(json)
}

/// The bytes a package's signature is over: `DOMAIN`, then the canonical JSON of its manifest without `signature`.
pub fn canonical(manifest: &Value) -> Result<Vec<u8>, String> {
    let mut unsigned = manifest.as_object().ok_or("the manifest is not an object")?.clone();
    unsigned.remove("signature");
    let mut json = String::new();
    write_canonical(&Value::Object(unsigned), &mut json)?;
    Ok([DOMAIN, json.as_bytes()].concat())
}

/// A minisign public key: its 8-byte key id and its Ed25519 key.
#[derive(Clone, Debug)]
pub struct Key {
    pub id: [u8; 8],
    pub bytes: [u8; 32],
    /// The key as minisign writes its second line (base64 of the algorithm, the id and the key).
    pub line: String,
    verifier: PublicKey,
}

impl Key {
    /// A key from minisign's public key: the whole `.pub` file (an `untrusted comment:` line, then the key) or the key line alone.
    pub fn parse(text: &str) -> Result<Key, String> {
        let lines: Vec<&str> = text.lines().map(str::trim).filter(|l| !l.is_empty()).collect();
        let line = match lines.as_slice() {
            [line] => *line,
            [comment, line] if comment.starts_with("untrusted comment:") => *line,
            _ => return Err("paste a minisign public key: its two lines, or the line after \"untrusted comment\"".into()),
        };
        let bin = STANDARD.decode(line).map_err(|_| "the key is not base64".to_string())?;
        if bin.len() != 42 || &bin[..2] != b"Ed" {
            return Err("this is not a minisign Ed25519 public key".into());
        }
        let verifier = PublicKey::from_base64(line).map_err(|e| e.to_string())?;
        let (mut id, mut bytes) = ([0u8; 8], [0u8; 32]);
        id.copy_from_slice(&bin[2..10]);
        bytes.copy_from_slice(&bin[10..42]);
        Ok(Key { id, bytes, line: line.to_string(), verifier })
    }

    /// The key id as minisign prints it (`minisign public key: 1064EAA31E758037`): the id read as a little-endian number, in hex.
    pub fn fingerprint(&self) -> String {
        fingerprint(&self.id)
    }

    /// Whether `minisig` (a `.minisig` file's text) is this key's signature of `message`: the key id it names is this key's,
    /// and minisign's checks pass (the pre-hashed `ED` algorithm only).
    pub fn verifies(&self, message: &[u8], minisig: &str) -> bool {
        sig_key_id(minisig) == Some(self.id)
            && Signature::decode(minisig).is_ok_and(|sig| self.verifier.verify(message, &sig, false).is_ok())
    }
}

/// The key id a `.minisig` text names (bytes 2..10 of its second line), when it has one.
pub fn sig_key_id(minisig: &str) -> Option<[u8; 8]> {
    let bin = STANDARD.decode(minisig.lines().nth(1)?.trim()).ok()?;
    bin.get(2..10)?.try_into().ok()
}

/// A key id as minisign prints it.
pub fn fingerprint(id: &[u8; 8]) -> String {
    format!("{:016X}", u64::from_le_bytes(*id))
}

/// Who a trusted key belongs to.
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum Signer {
    Owner,
    Themely,
    User(String),
}

impl Signer {
    /// The listing's trust state: `owner`, `themely` or `user:<name>`.
    pub fn state(&self) -> String {
        match self {
            Signer::Owner => "owner".into(),
            Signer::Themely => "themely".into(),
            Signer::User(name) => format!("user:{name}"),
        }
    }
}

/// A trusted key: whose it is, the key, and the publishers it may sign code widgets for.
#[derive(Clone, Debug)]
pub struct Trusted {
    pub signer: Signer,
    pub key: Key,
    pub publishers: Vec<String>,
}

/// The keys a package may be signed with, and the revoked ones (whatever they sign is refused).
#[derive(Clone, Debug, Default)]
pub struct Keyring {
    pub trusted: Vec<Trusted>,
    pub revoked: Vec<Key>,
}

impl Keyring {
    /// Whether `key` is revoked: its id or its key bytes are on the list (an id alone is a label anyone can give a key).
    pub fn is_revoked(&self, key: &Key) -> bool {
        self.revoked.iter().any(|r| r.id == key.id || r.bytes == key.bytes)
    }
}

/// Who signed a package, with the key that verified it.
#[derive(Clone, Debug)]
pub struct Verified {
    pub signer: Signer,
    pub key: Key,
}

/// The key id a manifest's signature names (bytes 2..10 of its second line; minisign-verify keeps it private), when it has one.
pub fn signature_key_id(manifest: &Value) -> Option<[u8; 8]> {
    sig_key_id(manifest.get("signature")?.get("minisign")?.as_str()?)
}

/// The publisher a code widget's id names (`ext:<publisher>.<id>`), or `None` for any other id.
fn publisher_of(manifest: &Value) -> Option<&str> {
    manifest.get("id")?.as_str()?.strip_prefix("ext:")?.split_once('.').map(|(p, _)| p)
}

/// The signer of a package whose manifest carries a signature, `Ok(None)` when it carries none, or why it is refused: an unreadable
/// signature, a revoked key (by id or by key bytes), a key not trusted here, a key that does not hold the id's publisher, or a
/// signature that does not match the manifest.
pub fn verify(manifest: &Value, ring: &Keyring) -> Result<Option<Verified>, String> {
    let Some(signature) = manifest.get("signature") else {
        return Ok(None);
    };
    let text = signature.get("minisign").and_then(Value::as_str).filter(|_| signature.as_object().is_some_and(|o| o.len() == 1));
    let parsed = text.and_then(|t| Signature::decode(t).ok()).ok_or("the signature is not a minisign signature")?;
    let id = signature_key_id(manifest).ok_or("the signature is not a minisign signature")?;
    if ring.revoked.iter().any(|k| k.id == id) {
        return Err(format!("signed with a revoked key ({})", fingerprint(&id)));
    }
    let Some(trusted) = ring.trusted.iter().find(|t| t.key.id == id) else {
        return Err(format!("signed with a key this app does not trust ({})", fingerprint(&id)));
    };
    if ring.is_revoked(&trusted.key) {
        return Err(format!("signed with a revoked key ({})", fingerprint(&id)));
    }
    if let Some(publisher) = publisher_of(manifest) {
        if !trusted.publishers.iter().any(|p| p == publisher) {
            return Err(format!("signed with a key ({}) that does not sign for the publisher {publisher}", fingerprint(&id)));
        }
    }
    let message = canonical(manifest)?;
    trusted.key.verifier.verify(&message, &parsed, false).map_err(|_| "the signature does not match the package".to_string())?;
    Ok(Some(Verified { signer: trusted.signer.clone(), key: trusted.key.clone() }))
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn fixtures() -> std::path::PathBuf {
        std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../../../tests/fixtures/widgets")
    }

    #[test]
    fn the_canonical_form_matches_the_test_vector() {
        let vector: Value = serde_json::from_str(&std::fs::read_to_string(fixtures().join("canonical-vector.json")).unwrap()).unwrap();
        let bytes = canonical(&vector["manifest"]).unwrap();
        assert_eq!(String::from_utf8(bytes.clone()).unwrap(), vector["canonical"].as_str().unwrap());
        assert_eq!(crate::widgets::sha256_hex(&bytes), vector["sha256"].as_str().unwrap());
    }

    #[test]
    fn the_canonical_form_sorts_keys_drops_the_signature_and_refuses_what_has_no_form() {
        let a = canonical(&json!({ "b": 1, "a": ["x", { "d": true, "c": null }], "signature": { "minisign": "s" } })).unwrap();
        assert_eq!(a, [DOMAIN, br#"{"a":["x",{"c":null,"d":true}],"b":1}"#].concat());
        assert_eq!(
            canonical(&json!({ "name": "\u{1}\"\\\n é" })).unwrap(),
            [DOMAIN, "{\"name\":\"\\u0001\\\"\\\\\\n é\"}".as_bytes()].concat()
        );
        assert!(canonical(&json!({ "a": 1.5 })).is_err());
        assert!(canonical(&json!({ "a": -1 })).is_err());
        assert!(canonical(&json!({ "é": 1 })).is_err());
        assert!(canonical(&json!([1])).is_err());
    }

    #[test]
    fn a_key_parses_from_its_file_or_its_line_and_prints_minisigns_id() {
        let file = std::fs::read_to_string(fixtures().join("TEST-ONLY-publisher.pub")).unwrap();
        let key = Key::parse(&file).unwrap();
        let line = file.lines().nth(1).unwrap();
        assert_eq!(Key::parse(line).unwrap().bytes, key.bytes);
        assert!(file.lines().next().unwrap().ends_with(&key.fingerprint()), "minisign's comment names the same id");
        for bad in ["", "abc", "untrusted comment: x", "untrusted comment: x\nnot base64!", &STANDARD.encode([0u8; 42])] {
            assert!(Key::parse(bad).is_err(), "{bad:?}");
        }
    }

    /// The fixture code widget's manifest, its key, and that key under another id (minisign signs no id, so a signature
    /// re-labelled with the new id still verifies with the same key bytes).
    fn relabelled() -> (Value, Key, Value, Key) {
        let manifest: Value = serde_json::from_slice(&std::fs::read(fixtures().join("ext.test.clock/manifest.json")).unwrap()).unwrap();
        let key = Key::parse(&std::fs::read_to_string(fixtures().join("TEST-ONLY-publisher.pub")).unwrap()).unwrap();
        let new_id = [9u8; 8];
        let line = STANDARD.encode([b"Ed".as_slice(), &new_id, &key.bytes].concat());
        let other = Key::parse(&line).unwrap();
        let mut moved = manifest.clone();
        let text = manifest["signature"]["minisign"].as_str().unwrap();
        let mut lines: Vec<String> = text.lines().map(str::to_string).collect();
        let mut sig = STANDARD.decode(&lines[1]).unwrap();
        sig[2..10].copy_from_slice(&new_id);
        lines[1] = STANDARD.encode(sig);
        moved["signature"]["minisign"] = json!(lines.join("\n"));
        (manifest, key, moved, other)
    }

    fn trusted(key: &Key, publishers: &[&str]) -> Trusted {
        Trusted { signer: Signer::User("Test".into()), key: key.clone(), publishers: publishers.iter().map(|p| p.to_string()).collect() }
    }

    #[test]
    fn a_revoked_key_is_refused_under_any_id() {
        let (manifest, key, moved, other) = relabelled();
        let ring = Keyring { trusted: vec![trusted(&other, &["test"])], revoked: vec![] };
        assert!(verify(&moved, &ring).is_ok(), "the re-labelled signature verifies: the id is not signed");
        let ring = Keyring { trusted: vec![trusted(&other, &["test"])], revoked: vec![key.clone()] };
        assert_eq!(
            verify(&moved, &ring).unwrap_err(),
            "signed with a revoked key (0909090909090909)",
            "the revoked key's bytes under another id"
        );
        let ring = Keyring { trusted: vec![trusted(&key, &["test"])], revoked: vec![key] };
        assert!(verify(&manifest, &ring).unwrap_err().starts_with("signed with a revoked key"), "by its own id");
    }

    #[test]
    fn a_key_signs_code_widgets_for_its_own_publishers_only() {
        let (manifest, key, ..) = relabelled();
        let ok = Keyring { trusted: vec![trusted(&key, &["other", "test"])], revoked: vec![] };
        assert_eq!(verify(&manifest, &ok).unwrap().unwrap().signer, Signer::User("Test".into()));
        let wrong = Keyring { trusted: vec![trusted(&key, &["infopanel"])], revoked: vec![] };
        assert_eq!(
            verify(&manifest, &wrong).unwrap_err(),
            "signed with a key (FD89B8C08B250DF6) that does not sign for the publisher test"
        );
        let none = Keyring { trusted: vec![trusted(&key, &[])], revoked: vec![] };
        assert!(verify(&manifest, &none).is_err(), "a key with no publisher signs no code widget");
    }
}
