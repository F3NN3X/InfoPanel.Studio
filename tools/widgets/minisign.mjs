// minisign keys and signatures for widget packages (Phase 6a), with Node's own crypto: Ed25519, BLAKE2b-512 and scrypt. The server
// verifies with the `minisign-verify` crate (src-tauri/crates/ips-server/src/widget_sign.rs); this side only signs, for publishers
// and tests. What is signed is `canonicalBytes(manifest)`: FORMAT.md §17, the same bytes as the server's `canonical`
// (tests/fixtures/widgets/canonical-vector.json pins both).
import crypto from "node:crypto";

/** What the signed bytes start with (`widget_sign::DOMAIN`). */
export const DOMAIN = "infopanel-studio widget package 1\n";

/** The canonical JSON of a manifest value: keys sorted (ASCII only), no whitespace, whole non-negative numbers (`widget_sign::canonical_json`; theme packs sign it too, tools/packs/sign.mjs). */
export function canonicalJson(value) {
  if (value === null || typeof value === "boolean") return JSON.stringify(value);
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value) || value < 0) throw new Error("a number in the manifest is not a whole number of at least 0");
    return String(value);
  }
  if (typeof value === "string") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (typeof value === "object") {
    const keys = Object.keys(value);
    if (keys.some((k) => [...k].some((c) => c.charCodeAt(0) > 0x7f))) throw new Error("a field name in the manifest is not ASCII");
    return `{${keys
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canonicalJson(value[k])}`)
      .join(",")}}`;
  }
  throw new Error(`a manifest holds no ${typeof value}`);
}

/** The bytes a package's signature is over: `DOMAIN`, then the manifest without `signature` as canonical JSON. */
export function canonicalBytes(manifest) {
  if (manifest === null || typeof manifest !== "object" || Array.isArray(manifest)) throw new Error("the manifest is not an object");
  const { signature: _, ...unsigned } = manifest;
  return Buffer.from(DOMAIN + canonicalJson(unsigned), "utf8");
}

// BLAKE2b (RFC 7693) for the secret key's 32-byte checksum, which Node's fixed `blake2b512` cannot make.
const MASK = (1n << 64n) - 1n;
const IV = [
  0x6a09e667f3bcc908n, 0xbb67ae8584caa73bn, 0x3c6ef372fe94f82bn, 0xa54ff53a5f1d36f1n, 0x510e527fade682d1n, 0x9b05688c2b3e6c1fn, 0x1f83d9abfb41bd6bn, 0x5be0cd19137e2179n,
];
const SIGMA = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15],
  [14, 10, 4, 8, 9, 15, 13, 6, 1, 12, 0, 2, 11, 7, 5, 3],
  [11, 8, 12, 0, 5, 2, 15, 13, 10, 14, 3, 6, 7, 1, 9, 4],
  [7, 9, 3, 1, 13, 12, 11, 14, 2, 6, 5, 10, 4, 0, 15, 8],
  [9, 0, 5, 7, 2, 4, 10, 15, 14, 1, 11, 12, 6, 8, 3, 13],
  [2, 12, 6, 10, 0, 11, 8, 3, 4, 13, 7, 5, 15, 14, 1, 9],
  [12, 5, 1, 15, 14, 13, 4, 10, 0, 7, 6, 3, 9, 2, 8, 11],
  [13, 11, 7, 14, 12, 1, 3, 9, 5, 0, 15, 4, 8, 6, 2, 10],
  [6, 15, 14, 9, 11, 3, 0, 8, 12, 2, 13, 7, 1, 4, 10, 5],
  [10, 2, 8, 4, 7, 6, 1, 5, 15, 11, 9, 14, 3, 12, 13, 0],
];
const rotr = (x, n) => ((x >> n) | (x << (64n - n))) & MASK;

/** BLAKE2b with an `outLen`-byte digest (1 to 64), unkeyed. */
export function blake2b(data, outLen) {
  const h = IV.slice();
  h[0] ^= 0x01010000n ^ BigInt(outLen);
  const blocks = Math.max(1, Math.ceil(data.length / 128));
  for (let b = 0; b < blocks; b++) {
    const block = Buffer.alloc(128);
    Buffer.from(data).copy(block, 0, b * 128, Math.min(data.length, (b + 1) * 128));
    const m = Array.from({ length: 16 }, (_, i) => block.readBigUInt64LE(i * 8));
    const v = [...h, ...IV];
    v[12] ^= BigInt(Math.min(data.length, (b + 1) * 128));
    if (b === blocks - 1) v[14] ^= MASK;
    const g = (a, bb, c, d, x, y) => {
      v[a] = (v[a] + v[bb] + x) & MASK;
      v[d] = rotr(v[d] ^ v[a], 32n);
      v[c] = (v[c] + v[d]) & MASK;
      v[bb] = rotr(v[bb] ^ v[c], 24n);
      v[a] = (v[a] + v[bb] + y) & MASK;
      v[d] = rotr(v[d] ^ v[a], 16n);
      v[c] = (v[c] + v[d]) & MASK;
      v[bb] = rotr(v[bb] ^ v[c], 63n);
    };
    for (let r = 0; r < 12; r++) {
      const s = SIGMA[r % 10];
      g(0, 4, 8, 12, m[s[0]], m[s[1]]);
      g(1, 5, 9, 13, m[s[2]], m[s[3]]);
      g(2, 6, 10, 14, m[s[4]], m[s[5]]);
      g(3, 7, 11, 15, m[s[6]], m[s[7]]);
      g(0, 5, 10, 15, m[s[8]], m[s[9]]);
      g(1, 6, 11, 12, m[s[10]], m[s[11]]);
      g(2, 7, 8, 13, m[s[12]], m[s[13]]);
      g(3, 4, 9, 14, m[s[14]], m[s[15]]);
    }
    for (let i = 0; i < 8; i++) h[i] ^= v[i] ^ v[i + 8];
  }
  const out = Buffer.alloc(64);
  h.forEach((x, i) => out.writeBigUInt64LE(x, i * 8));
  return out.subarray(0, outLen);
}

const PKCS8_ED25519 = Buffer.from("302e020100300506032b657004220420", "hex");
const privateKeyOf = (seed) => crypto.createPrivateKey({ key: Buffer.concat([PKCS8_ED25519, seed]), format: "der", type: "pkcs8" });
const publicOf = (seed) => crypto.createPublicKey(privateKeyOf(seed)).export({ format: "der", type: "spki" }).subarray(-32);

/** A key id as minisign prints it: the 8 bytes read as a little-endian number, in hex. */
export const fingerprint = (keyId) => Buffer.from(keyId).reverse().toString("hex").toUpperCase();

/** scrypt's N, r and p for libsodium's opslimit and memlimit (`crypto_pwhash_scryptsalsa208sha256`'s `pickparams`). */
export function scryptParams(opslimit, memlimit) {
  const ops = Math.max(opslimit, 32768);
  const r = 8;
  let logN = 1;
  if (ops < memlimit / 32) {
    const maxN = Math.floor(ops / (r * 4));
    while (logN < 63 && 2 ** logN <= maxN / 2) logN++;
    return { N: 2 ** logN, r, p: 1 };
  }
  const maxN = Math.floor(memlimit / (r * 128));
  while (logN < 63 && 2 ** logN <= maxN / 2) logN++;
  const maxrp = Math.min(0x3fffffff, Math.floor(ops / 4 / 2 ** logN));
  return { N: 2 ** logN, r, p: Math.max(1, Math.floor(maxrp / r)) };
}

const secondLine = (text, what) => {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const line = lines.length === 1 ? lines[0] : lines[0]?.startsWith("untrusted comment:") ? lines[1] : undefined;
  if (!line) throw new Error(`not a minisign ${what}`);
  return Buffer.from(line, "base64");
};

/**
 * The key in a minisign secret key file (`minisign -G`): `{ keyId, seed, publicKey }`. An encrypted one needs its password; a
 * wrong password, a damaged file or a key that is not Ed25519 throws.
 */
export function readSecretKey(text, password) {
  const bin = secondLine(text, "secret key");
  if (bin.length !== 158 || bin.toString("latin1", 0, 2) !== "Ed" || bin.toString("latin1", 4, 6) !== "B2") throw new Error("not a minisign Ed25519 secret key");
  const kdf = bin.toString("latin1", 2, 4);
  let keynumSk = bin.subarray(54, 158);
  if (kdf === "Sc") {
    if (password === undefined) throw new Error("this secret key is encrypted: give its password");
    const { N, r, p } = scryptParams(Number(bin.readBigUInt64LE(38)), Number(bin.readBigUInt64LE(46)));
    const stream = crypto.scryptSync(Buffer.from(password, "utf8"), bin.subarray(6, 38), 104, { N, r, p, maxmem: 256 * N * r * p });
    keynumSk = Buffer.from(keynumSk.map((x, i) => x ^ stream[i]));
  } else if (kdf !== "\0\0") throw new Error("this secret key uses an unknown key derivation");
  const keyId = keynumSk.subarray(0, 8);
  const sk = keynumSk.subarray(8, 72);
  const checksum = blake2b(Buffer.concat([Buffer.from("Ed"), keyId, sk]), 32);
  if (!checksum.equals(keynumSk.subarray(72, 104))) throw new Error("wrong password, or a damaged secret key");
  const seed = sk.subarray(0, 32);
  if (!publicOf(seed).equals(sk.subarray(32, 64))) throw new Error("a damaged secret key");
  return { keyId: Buffer.from(keyId), seed: Buffer.from(seed), publicKey: Buffer.from(sk.subarray(32, 64)) };
}

/** A minisign public key file (two lines) for a key. */
export const publicKeyFile = ({ keyId, publicKey }) =>
  `untrusted comment: minisign public key ${fingerprint(keyId)}\n${Buffer.concat([Buffer.from("Ed"), keyId, publicKey]).toString("base64")}\n`;

/**
 * A new key pair as minisign files, the secret one unencrypted (as `minisign -G -W`): throwaway keys for tests, or a publisher's
 * own. The owner's key is made with minisign itself and a password (docs/security.md).
 */
export function generateKeyPair() {
  const seed = crypto.randomBytes(32);
  const keyId = crypto.randomBytes(8);
  const publicKey = publicOf(seed);
  const sk = Buffer.concat([seed, publicKey]);
  const head = Buffer.concat([Buffer.from("Ed"), Buffer.alloc(2), Buffer.from("B2"), Buffer.alloc(48)]);
  const checksum = blake2b(Buffer.concat([Buffer.from("Ed"), keyId, sk]), 32);
  const secret = Buffer.concat([head, keyId, sk, checksum]).toString("base64");
  return {
    publicText: publicKeyFile({ keyId, publicKey }),
    secretText: `untrusted comment: minisign encrypted secret key\n${secret}\n`,
  };
}

/** A minisign signature (pre-hashed, `ED`) of `message` with `key`, as the `.minisig` text. */
export function signBytes(message, key, trustedComment) {
  if (/[\r\n]/.test(trustedComment)) throw new Error("the trusted comment is one line");
  const prv = privateKeyOf(key.seed);
  const hashed = crypto.createHash("blake2b512").update(message).digest();
  const sig = crypto.sign(null, hashed, prv);
  const global = crypto.sign(null, Buffer.concat([sig, Buffer.from(trustedComment, "utf8")]), prv);
  return [
    `untrusted comment: signature from minisign secret key ${fingerprint(key.keyId)}`,
    Buffer.concat([Buffer.from("ED"), key.keyId, sig]).toString("base64"),
    `trusted comment: ${trustedComment}`,
    global.toString("base64"),
    "",
  ].join("\n");
}

/** Whether `minisig` is `key`'s signature of `message` (tests; the server has its own verifier). */
export function verifyBytes(message, minisig, publicText) {
  const pk = secondLine(publicText, "public key");
  const lines = minisig.split("\n");
  const head = Buffer.from(lines[1], "base64");
  if (head.toString("latin1", 0, 2) !== "ED" || !head.subarray(2, 10).equals(pk.subarray(2, 10))) return false;
  const pub = crypto.createPublicKey({ key: Buffer.concat([Buffer.from("302a300506032b6570032100", "hex"), pk.subarray(10)]), format: "der", type: "spki" });
  const hashed = crypto.createHash("blake2b512").update(message).digest();
  const comment = Buffer.from(lines[2].replace(/^trusted comment: /, ""), "utf8");
  return crypto.verify(null, hashed, pub, head.subarray(10)) && crypto.verify(null, Buffer.concat([head.subarray(10), comment]), pub, Buffer.from(lines[3], "base64"));
}

/** `manifest` with `signature` set: `key`'s signature of its canonical bytes. */
export function signManifest(manifest, key) {
  const comment = `${manifest.id} ${manifest.version}`;
  return { ...manifest, signature: { minisign: signBytes(canonicalBytes(manifest), key, comment) } };
}
