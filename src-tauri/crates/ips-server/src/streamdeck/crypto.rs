// The VSD2 crypto: one Curve25519 keypair for every session (its secret is kept in the integrations file), the pairing
// code the Stream Deck app shows, and the box every frame after the two hellos travels in: `nonce(24) || box`, where the
// box is XSalsa20-Poly1305 with the tag first under the precomputed shared key, which is libsodium's
// `crypto_box_easy_afternm`.

use blake2::digest::consts::U32;
use blake2::{Blake2b, Digest};
use crypto_box::aead::generic_array::GenericArray;
use crypto_box::aead::Aead;
use crypto_box::{PublicKey, SalsaBox, SecretKey};
use zeroize::Zeroizing;

pub const NONCE_LEN: usize = 24;
const KEY_LEN: usize = 32;

pub fn hex(bytes: &[u8]) -> String {
    bytes.iter().map(|b| format!("{b:02x}")).collect()
}

fn unhex(s: &str) -> Option<Vec<u8>> {
    if !s.len().is_multiple_of(2) || !s.bytes().all(|b| b.is_ascii_hexdigit()) {
        return None;
    }
    (0..s.len())
        .step_by(2)
        .map(|i| u8::from_str_radix(&s[i..i + 2], 16).ok())
        .collect()
}

/// A new secret key as stored (64 hex characters), from the OS's random source.
pub fn new_secret() -> Result<String, String> {
    let mut key = Zeroizing::new([0u8; KEY_LEN]);
    getrandom::fill(key.as_mut()).map_err(|e| format!("no random source: {e}"))?;
    Ok(hex(key.as_ref()))
}

/// The stored secret key, or `None` for anything that isn't one.
pub fn secret_key(stored: &str) -> Option<SecretKey> {
    // The key's bytes are wiped from these buffers once the key holds them (SecretKey wipes its own).
    let raw = Zeroizing::new(unhex(stored)?);
    let bytes = Zeroizing::new(<[u8; KEY_LEN]>::try_from(raw.as_slice()).ok()?);
    Some(SecretKey::from(*bytes))
}

pub fn public_key(secret: &SecretKey) -> [u8; KEY_LEN] {
    secret.public_key().to_bytes()
}

/// The code the Stream Deck app shows when it asks whether to trust us: the first three bytes of BLAKE2b-256 of the
/// public key, in lowercase hex.
pub fn pairing_code(public_key: &[u8]) -> String {
    hex(&Blake2b::<U32>::digest(public_key)[..3])
}

/// The pairing code of a stored secret key; "" when there is none.
pub fn pairing_code_of(stored: &str) -> String {
    secret_key(stored).map_or_else(String::new, |secret| pairing_code(&public_key(&secret)))
}

/// The box of one connection, keyed by the server's public key and our secret one.
pub struct Channel(SalsaBox);

impl Channel {
    pub fn new(server_public: &[u8], secret: &SecretKey) -> Option<Self> {
        let server: [u8; KEY_LEN] = server_public.try_into().ok()?;
        Some(Self(SalsaBox::new(&PublicKey::from(server), secret)))
    }

    /// A frame of `plain` under a fresh random nonce.
    pub fn seal(&self, plain: &[u8]) -> Result<Vec<u8>, String> {
        let mut nonce = [0u8; NONCE_LEN];
        getrandom::fill(&mut nonce).map_err(|e| format!("no random source: {e}"))?;
        self.seal_with(&nonce, plain)
    }

    fn seal_with(&self, nonce: &[u8; NONCE_LEN], plain: &[u8]) -> Result<Vec<u8>, String> {
        let sealed = self
            .0
            .encrypt(GenericArray::from_slice(nonce), plain)
            .map_err(|_| "sealing failed".to_string())?;
        Ok([nonce.as_slice(), &sealed].concat())
    }

    /// A frame's plaintext, or `None` when it is too short or its tag doesn't check.
    pub fn open(&self, frame: &[u8]) -> Option<Vec<u8>> {
        if frame.len() < NONCE_LEN + 16 {
            return None;
        }
        let (nonce, sealed) = frame.split_at(NONCE_LEN);
        self.0.decrypt(GenericArray::from_slice(nonce), sealed).ok()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    // The classic NaCl crypto_box test (tests/box.c and box2.c): Alice's secret key, Bob's public key, the nonce and the
    // 131-byte message; the box is NaCl's output from byte 16 on (`crypto_box_easy`'s layout: tag, then ciphertext).
    const ALICE_SECRET: &str = "77076d0a7318a57d3c16c17251b26645df4c2f87ebc0992ab177fba51db92c2a";
    const ALICE_PUBLIC: &str = "8520f0098930a754748b7ddcb43ef75a0dbf3a0d26381af4eba4a98eaa9b4e6a";
    const BOB_SECRET: &str = "5dab087e624a8a4b79e17f8b83800ee66f3bb1292618b6fd1c2f8b27ff88e0eb";
    const BOB_PUBLIC: &str = "de9edb7d7b7dc1b4d35b61c2ece435373f8343c85b78674dadfc7e146f882b4f";
    const NONCE: &str = "69696ee955b62b73cd62bda875fc73d68219e0036b7a0b37";
    const MESSAGE: &str = "be075fc53c81f2d5cf141316ebeb0c7b5228c52a4c62cbd44b66849b64244ffce5ecbaaf33bd751a1ac728d45e6c61296cdc3c01233561f41db66cce314adb310e3be8250c46f06dceea3a7fa1348057e2f6556ad6b1318a024a838f21af1fde048977eb48f59ffd4924ca1c60902e52f0a089bc76897040e082f937763848645e0705";
    const BOX: &str = "f3ffc7703f9400e52a7dfb4b3d3305d98e993b9f48681273c29650ba32fc76ce48332ea7164d96a4476fb8c531a1186ac0dfc17c98dce87b4da7f011ec48c97271d2c20f9b928fe2270d6fb863d51738b48eeee314a7cc8ab932164548e526ae90224368517acfeabd6bb3732bc0e9da99832b61ca01b6de56244a9e88d5f9b37973f622a43d14a6599b1f654cb45a74e355a5";

    #[test]
    fn boxes_the_nacl_test_vector_as_libsodium_does() {
        let alice = secret_key(ALICE_SECRET).unwrap();
        assert_eq!(hex(&public_key(&alice)), ALICE_PUBLIC);
        let nonce: [u8; NONCE_LEN] = unhex(NONCE).unwrap().try_into().unwrap();
        let sealed = Channel::new(&unhex(BOB_PUBLIC).unwrap(), &alice)
            .unwrap()
            .seal_with(&nonce, &unhex(MESSAGE).unwrap())
            .unwrap();
        assert_eq!(
            hex(&sealed),
            format!("{NONCE}{BOX}"),
            "nonce, then tag and ciphertext"
        );
        // Bob opens it with his secret key and Alice's public one.
        let bob = Channel::new(
            &unhex(ALICE_PUBLIC).unwrap(),
            &secret_key(BOB_SECRET).unwrap(),
        )
        .unwrap();
        assert_eq!(hex(&bob.open(&sealed).unwrap()), MESSAGE);
        // A flipped bit, or a frame too short to hold a nonce and a tag, doesn't open.
        let mut bad = sealed.clone();
        bad[30] ^= 1;
        assert_eq!(bob.open(&bad), None);
        assert_eq!(bob.open(&sealed[..39]), None);
    }

    #[test]
    fn seals_under_fresh_nonces_that_the_other_side_opens() {
        let (ours, theirs) = (
            secret_key(&new_secret().unwrap()).unwrap(),
            secret_key(&new_secret().unwrap()).unwrap(),
        );
        let a = Channel::new(&public_key(&theirs), &ours).unwrap();
        let b = Channel::new(&public_key(&ours), &theirs).unwrap();
        let (one, two) = (a.seal(b"hi").unwrap(), a.seal(b"hi").unwrap());
        assert_ne!(one[..NONCE_LEN], two[..NONCE_LEN]);
        assert_eq!(b.open(&one).unwrap(), b"hi");
        assert!(Channel::new(&[1, 2, 3], &ours).is_none());
    }

    #[test]
    fn derives_the_pairing_code_from_blake2b_256() {
        // BLAKE2b-256("") = 0e5751c0..., BLAKE2b-256("abc") = bddd813c... (RFC 7693's test inputs, 32-byte digests).
        assert_eq!(pairing_code(b""), "0e5751");
        assert_eq!(pairing_code(b"abc"), "bddd81");
        assert_eq!(
            pairing_code_of(ALICE_SECRET),
            pairing_code(&unhex(ALICE_PUBLIC).unwrap())
        );
        assert_eq!(pairing_code_of(ALICE_SECRET).len(), 6);
        assert_eq!(pairing_code_of(""), "");
        assert_eq!(pairing_code_of("zz"), "");
    }

    #[test]
    fn reads_only_a_well_formed_stored_key() {
        assert_eq!(new_secret().unwrap().len(), 64);
        assert!(secret_key(ALICE_SECRET).is_some());
        assert!(secret_key(&ALICE_SECRET[..62]).is_none());
        assert!(secret_key(&format!("{}g", &ALICE_SECRET[..63])).is_none());
    }
}
