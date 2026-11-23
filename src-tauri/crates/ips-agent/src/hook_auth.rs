// The check on the server's permission answer (pinned layer P8, security review 4 and 5): the twin of ips-server's
// `hook_auth.rs`. Each request goes with a fresh nonce, and an answer counts only when it carries the keyed BLAKE2b, made
// with this user's key (in their own folder, owner-only: ips-server's key_file.rs, compiled here too), over that nonce, the
// request's id and the decision. A program that took the port can't make one, so its allow is ignored and the agent asks in
// its terminal; so is any answer while the key file is missing or others may read it.

use std::path::{Path, PathBuf};

use blake2::digest::consts::U32;
use blake2::digest::{KeyInit, Mac};
use blake2::Blake2bMac;

#[path = "../../ips-server/src/key_file.rs"]
pub mod key_file;

pub use key_file::{Key, KEY_BYTES, KEY_FILE};

/// The same as the server's: parts this use of a key from any other.
const DOMAIN: &[u8] = b"ips-agent-permission-v1\0";

/// A fresh nonce: 16 random bytes as 32 lowercase hex characters, or None if the OS gives no randomness.
pub fn nonce() -> Option<String> {
    let mut bytes = [0u8; 16];
    getrandom::fill(&mut bytes).ok()?;
    Some(bytes.iter().map(|b| format!("{b:02x}")).collect())
}

fn mac_of(key: &Key, nonce: &str, id: &str, behavior: &str) -> Blake2bMac<U32> {
    let mut mac = <Blake2bMac<U32> as KeyInit>::new_from_slice(key).expect("32 bytes is a BLAKE2b key");
    Mac::update(&mut mac, DOMAIN);
    Mac::update(&mut mac, format!("{nonce}\0{id}\0{behavior}").as_bytes());
    mac
}

/// The signature, as hex, on decision `behavior` for request `id` asked with `nonce` (the tests' stand-in server signs
/// with it).
pub fn sign(key: &Key, nonce: &str, id: &str, behavior: &str) -> String {
    mac_of(key, nonce, id, behavior).finalize().into_bytes().iter().map(|b| format!("{b:02x}")).collect()
}

/// Whether `mac` (hex) is the key's signature on the decision, compared in constant time.
pub fn verify(key: &Key, nonce: &str, id: &str, behavior: &str, mac: &str) -> bool {
    let Some(bytes) = from_hex(mac) else { return false };
    mac_of(key, nonce, id, behavior).verify_slice(&bytes).is_ok()
}

fn from_hex(text: &str) -> Option<Vec<u8>> {
    if !text.len().is_multiple_of(2) {
        return None;
    }
    (0..text.len()).step_by(2).map(|i| u8::from_str_radix(text.get(i..i + 2)?, 16).ok()).collect()
}

/// Where the key is: the `--key=` argument (a base64url path, written by the installer), else this user's own
/// (`key_file::key_file`, as the server finds it).
pub fn key_path(args: &[String]) -> PathBuf {
    match args.iter().find_map(|a| a.strip_prefix("--key=")).map(crate::wrap::decode).filter(|p| !p.is_empty()) {
        Some(path) => PathBuf::from(path),
        None => key_file::key_file(),
    }
}

/// The key in `file`; None when it is missing, not a key, or others may read or write it (the hook then takes no answer).
/// It is never created here.
pub fn load(file: &Path) -> Option<Key> {
    key_file::read(file).ok()
}

#[cfg(test)]
mod tests {
    use super::*;

    const N: &str = "0123456789abcdef0123456789abcdef";

    #[test]
    fn checks_the_same_signature_the_server_makes() {
        // pinned: ips-server's hook_auth.rs `signs_the_nonce_the_id_and_the_decision_together` asserts the same value
        assert_eq!(sign(&[7u8; KEY_BYTES], N, "r1", "allow"), PINNED);
        assert!(verify(&[7u8; KEY_BYTES], N, "r1", "allow", PINNED));
    }

    #[test]
    fn refuses_a_signature_for_anything_else() {
        let key = [7u8; KEY_BYTES];
        assert!(!verify(&key, N, "r1", "deny", PINNED));
        assert!(!verify(&key, N, "r2", "allow", PINNED));
        assert!(!verify(&key, "f123456789abcdef0123456789abcdef", "r1", "allow", PINNED));
        assert!(!verify(&[8u8; KEY_BYTES], N, "r1", "allow", PINNED));
        for bad in ["", "zz", &PINNED[..62], &PINNED[1..]] {
            assert!(!verify(&key, N, "r1", "allow", bad), "{bad}");
        }
    }

    #[test]
    fn makes_a_fresh_nonce_each_time() {
        let (a, b) = (nonce().unwrap(), nonce().unwrap());
        assert_ne!(a, b);
        assert!(a.len() == 32 && a.bytes().all(|c| c.is_ascii_hexdigit() && !c.is_ascii_uppercase()));
    }

    #[test]
    fn finds_the_key_from_the_argument_or_this_users_folder() {
        let arg = vec![format!("--key={}", crate::wrap::encode("D:/Data/IPS/agent-hook.key"))];
        assert_eq!(key_path(&arg), PathBuf::from("D:/Data/IPS/agent-hook.key"));
        assert_eq!(key_path(&[]), key_file::key_file());
    }

    #[test]
    fn loads_only_an_owner_only_key_and_never_makes_one() {
        let dir = tempfile::tempdir().unwrap();
        let file = dir.path().join(KEY_FILE);
        assert_eq!(load(&file), None);
        assert!(!file.exists());
        // a key others may read (the folder's inherited entries, or 0644): refused, so the terminal asks
        std::fs::write(&file, [9u8; KEY_BYTES]).unwrap();
        #[cfg(unix)]
        std::fs::set_permissions(&file, std::os::unix::fs::PermissionsExt::from_mode(0o644)).unwrap();
        assert_eq!(load(&file), None);
        std::fs::remove_file(&file).unwrap();
        key_file::create(&file, &[9u8; KEY_BYTES]).unwrap();
        assert_eq!(load(&file), Some([9u8; KEY_BYTES]));
    }

    const PINNED: &str = "36058a4188146a2c22ae478e7b4451e8c3842080a363813a237487012382ff7b";
}
