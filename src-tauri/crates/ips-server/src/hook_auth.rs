// The server's signature on a permission answer (pinned layer P8, security review 4 and 5): the agent's hook must not take an
// allow from whatever listens on the port. The key is 32 random bytes in the user's own folder (key_file.rs: never the data
// folder, owner-only, and refused when it isn't), made by the server the first time it starts with approvals on. No route
// reads it. The hook reads the same file (ips-agent's `hook_auth.rs`, which keeps this code's twin), sends a fresh nonce
// with each request, and prints a decision only when the answer carries this keyed BLAKE2b over the nonce, the request's id
// and the decision.
//
// What it proves, and no more: the answer came from a process that can read this user's key file. Anything already running
// as this user can read it too (docs/security.md, "Agent approvals: threat model").

use std::path::Path;

use blake2::digest::consts::U32;
use blake2::digest::Mac;
use blake2::Blake2bMac;

pub use crate::key_file::{key_file, Key, KEY_BYTES, KEY_FILE};
use crate::key_file::{self, Refused};

/// Parts this use of a key from any other.
const DOMAIN: &[u8] = b"ips-agent-permission-v1\0";

/// A nonce as the hook sends it: 32 lowercase hex characters (16 random bytes).
pub fn valid_nonce(nonce: &str) -> bool {
    nonce.len() == 32 && nonce.bytes().all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b))
}

fn mac_of(key: &Key, nonce: &str, id: &str, behavior: &str) -> Blake2bMac<U32> {
    let mut mac = <Blake2bMac<U32> as Mac>::new_from_slice(key).expect("32 bytes is a BLAKE2b key");
    Mac::update(&mut mac, DOMAIN);
    Mac::update(&mut mac, format!("{nonce}\0{id}\0{behavior}").as_bytes());
    mac
}

/// The signature, as hex, on decision `behavior` for request `id` asked with `nonce`.
pub fn sign(key: &Key, nonce: &str, id: &str, behavior: &str) -> String {
    mac_of(key, nonce, id, behavior).finalize().into_bytes().iter().map(|b| format!("{b:02x}")).collect()
}

/// The key in `file`, or a new one written there. A file someone else may read or write, or that is not a key, is replaced
/// by a fresh one: a key that was planted or seen must never sign.
pub fn load_or_create(file: &Path) -> std::io::Result<Key> {
    match key_file::read(file) {
        Ok(key) => return Ok(key),
        Err(Refused::Missing) => {}
        Err(Refused::Unreadable(e)) => return Err(std::io::Error::other(e)),
        Err(refused) => {
            log::warn!(target: "server", "approvals: the agent hook key is not owner-only or not a key ({refused:?}); making a new one");
            std::fs::remove_file(file)?;
        }
    }
    let mut key = [0u8; KEY_BYTES];
    getrandom::fill(&mut key).map_err(std::io::Error::other)?;
    key_file::create(file, &key)?;
    Ok(key)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn signs_the_nonce_the_id_and_the_decision_together() {
        let key = [7u8; KEY_BYTES];
        let n = "0123456789abcdef0123456789abcdef";
        let allow = sign(&key, n, "r1", "allow");
        // pinned: ips-agent's hook_auth.rs `checks_the_same_signature_the_server_makes` asserts the same value
        assert_eq!(allow, "36058a4188146a2c22ae478e7b4451e8c3842080a363813a237487012382ff7b");
        for other in [sign(&key, n, "r1", "deny"), sign(&key, n, "r2", "allow"), sign(&key, "f123456789abcdef0123456789abcdef", "r1", "allow"), sign(&[8u8; KEY_BYTES], n, "r1", "allow")] {
            assert_ne!(allow, other);
        }
    }

    #[test]
    fn takes_only_a_hook_nonce() {
        assert!(valid_nonce("0123456789abcdef0123456789abcdef"));
        for bad in ["", "0123456789ABCDEF0123456789ABCDEF", "0123", "0123456789abcdef0123456789abcdeg"] {
            assert!(!valid_nonce(bad), "{bad}");
        }
    }

    #[test]
    fn makes_the_key_once_owner_only() {
        let dir = tempfile::tempdir().unwrap();
        let file = dir.path().join("d").join(KEY_FILE);
        let key = load_or_create(&file).unwrap();
        assert!(key_file::owner_only(&file));
        assert_eq!(load_or_create(&file).unwrap(), key);
    }

    #[test]
    fn a_planted_loose_or_damaged_key_is_replaced_by_a_fresh_one() {
        let dir = tempfile::tempdir().unwrap();
        let file = dir.path().join(KEY_FILE);
        // planted with the folder's inherited entries (others may read it): never used
        std::fs::write(&file, [7u8; KEY_BYTES]).unwrap();
        #[cfg(unix)]
        std::fs::set_permissions(&file, std::os::unix::fs::PermissionsExt::from_mode(0o644)).unwrap();
        let key = load_or_create(&file).unwrap();
        assert_ne!(key, [7u8; KEY_BYTES]);
        assert!(key_file::owner_only(&file));
        assert_eq!(key_file::read(&file), Ok(key));
    }
}
