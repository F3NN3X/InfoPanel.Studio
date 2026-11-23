// The signature that lets a user pack's CSS be served (L94): a key only this server holds, and a keyed BLAKE2b over the pack's
// id and the SHA-256 of its stored files. The key is 32 random bytes in DATA_DIR/pack-signing.key, made the first time a pack is
// signed. No route reads that file, it is outside the packs folder, and nothing is exported from the data folder. A key that
// is missing or unreadable verifies nothing: it is never replaced, so no signature that failed can start to pass.
//
// What a signature says, and no more: a client that passed the request guards on the signing route claimed the studio's render
// check passed for exactly these bytes. It stops a file dropped into the folder, an edit after the check and CSS that skipped
// the flow. It does not stop a local process that can send the same request itself (decision log, L94).

use std::io::Write;
use std::path::Path;

use blake2::digest::consts::U32;
use blake2::digest::{KeyInit, Mac};
use blake2::Blake2bMac;
use sha2::{Digest, Sha256};

pub const KEY_FILE: &str = "pack-signing.key";
const KEY_BYTES: usize = 32;
/// Parts this use of the key from any other.
const DOMAIN: &[u8] = b"ips-pack-signature-v1\0";

type Key = [u8; KEY_BYTES];

/// The hash of a pack's files: for each, in path order, `<path>\0<length>\0<bytes>` (the studio writes the same, `packContentHash`).
pub fn content_hash(files: &[(String, Vec<u8>)]) -> String {
    let mut sorted: Vec<&(String, Vec<u8>)> = files.iter().collect();
    sorted.sort_by(|a, b| a.0.as_bytes().cmp(b.0.as_bytes()));
    let mut hash = Sha256::new();
    for (path, bytes) in sorted {
        hash.update(format!("{path}\0{}\0", bytes.len()).as_bytes());
        hash.update(bytes);
    }
    hash.finalize().iter().map(|b| format!("{b:02x}")).collect()
}

fn mac(key: &Key, id: &str, hash: &str) -> Blake2bMac<U32> {
    let mut mac = <Blake2bMac<U32> as KeyInit>::new_from_slice(key).expect("32 bytes is a BLAKE2b key");
    Mac::update(&mut mac, DOMAIN);
    Mac::update(&mut mac, format!("{id}\0{hash}").as_bytes());
    mac
}

/// The signature of pack `id` with content hash `hash`.
pub fn sign(key: &Key, id: &str, hash: &str) -> Vec<u8> {
    mac(key, id, hash).finalize().into_bytes().to_vec()
}

/// Whether `signature` is this key's for this pack and hash (compared in constant time).
pub fn verify(key: &Key, id: &str, hash: &str, signature: &[u8]) -> bool {
    mac(key, id, hash).verify_slice(signature).is_ok()
}

/// The key in `file`, or `None` when it is missing or not a key.
pub fn load_key(file: &Path) -> Option<Key> {
    std::fs::read(file).ok()?.try_into().ok()
}

/// The key for signing: the one in `file`, or a new one written owner-only where the platform has modes. A file that is
/// not a key is an error, never overwritten.
pub fn signing_key(file: &Path) -> std::io::Result<Key> {
    if file.exists() {
        return load_key(file).ok_or_else(|| std::io::Error::new(std::io::ErrorKind::InvalidData, "the pack signing key is damaged"));
    }
    let mut key = [0u8; KEY_BYTES];
    getrandom::fill(&mut key).map_err(std::io::Error::other)?;
    if let Some(dir) = file.parent() {
        std::fs::create_dir_all(dir)?;
    }
    let mut options = std::fs::OpenOptions::new();
    options.write(true).create_new(true);
    #[cfg(unix)]
    std::os::unix::fs::OpenOptionsExt::mode(&mut options, 0o600);
    options.open(file)?.write_all(&key)?;
    Ok(key)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn files(list: &[(&str, &str)]) -> Vec<(String, Vec<u8>)> {
        list.iter().map(|(p, c)| (p.to_string(), c.as_bytes().to_vec())).collect()
    }

    #[test]
    fn the_hash_covers_path_length_and_bytes_in_path_order() {
        let one = content_hash(&files(&[("pack.json", "{}"), ("assets/a.png", "x")]));
        assert_eq!(one, content_hash(&files(&[("assets/a.png", "x"), ("pack.json", "{}")])), "the order given does not count");
        // the studio's `packContentHash` gives this value for these files (tests/looks/user-pack-css.test.ts)
        assert_eq!(one, "6bf20373c9c6dd6202c89936450c5ab12020a31223376672cbfbff2a9647227d");
        assert_ne!(one, content_hash(&files(&[("pack.json", "{}"), ("assets/a.png", "y")])), "a byte");
        assert_ne!(one, content_hash(&files(&[("pack.json", "{}"), ("assets/b.png", "x")])), "a name");
        assert_ne!(content_hash(&files(&[("a", "bc")])), content_hash(&files(&[("ab", "c")])), "where a name ends");
    }

    #[test]
    fn a_signature_is_bound_to_the_key_the_id_and_the_hash() {
        let (key, other) = ([1u8; 32], [2u8; 32]);
        let good = sign(&key, "mine", "abc");
        assert!(verify(&key, "mine", "abc", &good));
        assert!(!verify(&other, "mine", "abc", &good), "another key");
        assert!(!verify(&key, "yours", "abc", &good), "another pack");
        assert!(!verify(&key, "mine", "abd", &good), "other bytes");
        assert!(!verify(&key, "mine", "abc", &good[1..]), "cut short");
        assert!(!verify(&key, "mine", "abc", &[]), "nothing");
        // an id and a hash cannot be slid into one another
        assert_ne!(sign(&key, "a", "bc"), sign(&key, "ab", "c"));
    }

    #[test]
    fn the_key_is_made_once_and_a_damaged_one_is_never_replaced() {
        let dir = tempfile::tempdir().unwrap();
        let file = dir.path().join("data").join(KEY_FILE);
        assert_eq!(load_key(&file), None, "no key until the first signature");
        let key = signing_key(&file).unwrap();
        assert_eq!(std::fs::read(&file).unwrap(), key);
        assert_eq!(signing_key(&file).unwrap(), key, "the second use reads it");
        assert_ne!(signing_key(&dir.path().join("other.key")).unwrap(), key, "each is random");
        std::fs::write(&file, "short").unwrap();
        assert_eq!(load_key(&file), None);
        assert!(signing_key(&file).is_err());
        assert_eq!(std::fs::read(&file).unwrap(), b"short");
    }

    #[cfg(unix)]
    #[test]
    fn the_key_is_owner_only() {
        use std::os::unix::fs::PermissionsExt;
        let dir = tempfile::tempdir().unwrap();
        let file = dir.path().join(KEY_FILE);
        signing_key(&file).unwrap();
        assert_eq!(std::fs::metadata(&file).unwrap().permissions().mode() & 0o777, 0o600);
    }
}
