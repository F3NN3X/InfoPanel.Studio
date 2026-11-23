// Signs a theme pack for sharing (pack signatures; docs/customization-guide.md "Signing a pack"), for publishers, Themely and tests:
//   node tools/packs/sign.mjs <pack-folder> --key <secret.key> [--password-env <VAR>]
//     writes pack.minisig: the publisher's minisign signature over the pack's manifest, which the app makes the same way from the
//     files it holds (every file of the folder but pack.minisig, themely.json and pack.sig, by path, with its size and SHA-256).
//   node tools/packs/sign.mjs <pack-folder> --countersign --key <themely.key> --checks-version <n> [--source-hash <hex>]
//     Themely's step after its checks and a person's review: writes themely.json, the countersigned statement (`reviewLevel`
//     "reviewed"). The app trusts it only from its pinned Themely pack key.
//   node tools/packs/sign.mjs --revocations <list.json> --key <themely.key> [--out <revoked.json>]
//     signs a revoke list (`{ format, version, expires, keys, packs }`) as the server fetches it.
//   node tools/packs/sign.mjs --generate <name>
//     a new key pair, the secret key NOT encrypted: for tests and trying it out (a real key is made with `minisign -G`).
// The app shows a pack signed by a key the user added in Settings › Widget publishers as "Signed by <name>, not reviewed", and one
// Themely countersigned as "Verified by Themely". The server is the only judge (src-tauri/crates/ips-server/src/pack_trust.rs).
import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { canonicalJson, fingerprint, generateKeyPair, readSecretKey, signBytes } from "../widgets/minisign.mjs";

/** What the signed bytes start with (`pack_trust::DOMAIN`, `STATEMENT_DOMAIN`, `pack_revocation::DOMAIN`). */
export const DOMAIN = "infopanel-studio theme pack 1\n";
export const STATEMENT_DOMAIN = "infopanel-studio pack review 1\n";
export const REVOCATIONS_DOMAIN = "infopanel-studio pack revocations 1\n";
export const PUBLISHER_SIG = "pack.minisig";
export const COUNTERSIG = "themely.json";
/** The files outside the manifest: the two signatures and the app's local render-check mark. */
const OUTSIDE = new Set([PUBLISHER_SIG, COUNTERSIG, "pack.sig"]);

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

/** The files of a pack folder that its manifest lists: the top and `assets/`, by path, the signatures and dot files left out. */
export function packFiles(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      if (name === "assets") for (const asset of readdirSync(path)) if (!asset.startsWith(".")) out.push({ path: `assets/${asset}`, bytes: readFileSync(join(path, asset)) });
    } else if (!name.startsWith(".") && !OUTSIDE.has(name)) out.push({ path: name, bytes: readFileSync(path) });
  }
  return out.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
}

/** The manifest of pack `id` at `version` with these files (`{ path, bytes }`). */
export function manifestOf(id, version, files) {
  const listed = files.filter((f) => !OUTSIDE.has(f.path)).map((f) => ({ path: f.path, size: f.bytes.length, sha256: sha256(f.bytes) }));
  listed.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  return { format: 1, id, version, files: listed };
}

/** The bytes a publisher signs: `DOMAIN`, then the manifest as canonical JSON. */
export const manifestBytes = (manifest) => Buffer.from(DOMAIN + canonicalJson(manifest), "utf8");

/** The id and version a pack folder's pack.json names. */
function identity(dir) {
  const pack = JSON.parse(readFileSync(join(dir, "pack.json"), "utf8"));
  if (typeof pack.id !== "string" || typeof pack.version !== "string") throw new Error("pack.json needs an id and a version");
  return pack;
}

/** Signs the pack in `dir` with `key` (`readSecretKey`'s): writes pack.minisig. Returns the manifest and its SHA-256. */
export function signPack(dir, key) {
  const { id, version } = identity(dir);
  const manifest = manifestOf(id, version, packFiles(dir));
  const bytes = manifestBytes(manifest);
  writeFileSync(join(dir, PUBLISHER_SIG), signBytes(bytes, key, `${id} ${version}`));
  return { manifest, sha256: sha256(bytes) };
}

/** The statement Themely countersigns for a signed pack in `dir`. */
export function statementOf(dir, { checksVersion, reviewLevel = "reviewed", sourceHash = "", issuedAt = new Date().toISOString() }) {
  const { id, version } = identity(dir);
  const minisig = readFileSync(join(dir, PUBLISHER_SIG), "utf8");
  const keyId = Buffer.from(minisig.split("\n")[1], "base64").subarray(2, 10);
  const manifestSha256 = sha256(manifestBytes(manifestOf(id, version, packFiles(dir))));
  return { manifestSha256, packId: id, version, publisherKeyId: fingerprint(keyId), checksVersion, reviewLevel, sourceHash, issuedAt: issuedAt.replace(/\.\d{3}Z$/, "Z") };
}

/** Themely's countersignature for the signed pack in `dir`, written as themely.json; `publisherKey` is the publisher's public key line. */
export function countersign(dir, themelyKey, publisherKey, options) {
  const statement = statementOf(dir, options);
  const minisign = signBytes(Buffer.from(STATEMENT_DOMAIN + canonicalJson(statement), "utf8"), themelyKey, `${statement.packId} ${statement.version} review`);
  const doc = { statement, publisherKey, minisign };
  writeFileSync(join(dir, COUNTERSIG), `${JSON.stringify(doc, null, 2)}\n`);
  return doc;
}

/** A revoke list signed with Themely's key, as the server fetches it. */
export function signRevocations(list, themelyKey) {
  if (!Number.isSafeInteger(list.version) || typeof list.expires !== "string") throw new Error("a revoke list has a whole version and an expires date");
  return { list, minisign: signBytes(Buffer.from(REVOCATIONS_DOMAIN + canonicalJson(list), "utf8"), themelyKey, `revocations ${list.version}`) };
}

function main(args) {
  const flag = (name) => {
    const i = args.indexOf(name);
    return i >= 0 ? args[i + 1] : undefined;
  };
  const generate = flag("--generate");
  if (generate) {
    const pair = generateKeyPair();
    writeFileSync(`${generate}.pub`, pair.publicText);
    writeFileSync(`${generate}.key`, pair.secretText, { mode: 0o600 });
    console.log(`wrote ${generate}.pub and ${generate}.key (not encrypted: for tests only)`);
    return 0;
  }
  const keyFile = flag("--key");
  const passwordEnv = flag("--password-env");
  const key = keyFile && readSecretKey(readFileSync(keyFile, "utf8"), passwordEnv ? process.env[passwordEnv] : undefined);
  const revocations = flag("--revocations");
  if (revocations && key) {
    const signed = signRevocations(JSON.parse(readFileSync(revocations, "utf8")), key);
    writeFileSync(flag("--out") ?? "revoked.json", `${JSON.stringify(signed, null, 2)}\n`);
    console.log(`signed revoke list version ${signed.list.version}`);
    return 0;
  }
  const valued = new Set(["--key", "--password-env", "--checks-version", "--source-hash", "--publisher-key", "--out", "--revocations"]);
  const dir = args.find((a, i) => !a.startsWith("--") && !valued.has(args[i - 1]));
  if (!dir || !key) {
    console.error("usage: node tools/packs/sign.mjs <pack-folder> --key <secret.key> [--password-env <VAR>] [--countersign --checks-version <n> [--source-hash <hex>]] | --revocations <list.json> --key <key> | --generate <name>");
    return 2;
  }
  if (args.includes("--countersign")) {
    const minisig = readFileSync(join(dir, PUBLISHER_SIG), "utf8");
    const keyId = Buffer.from(minisig.split("\n")[1], "base64").subarray(2, 10);
    const publisherKey = flag("--publisher-key") ?? "";
    if (!publisherKey) throw new Error(`give the publisher's public key line (key id ${fingerprint(keyId)}) with --publisher-key`);
    const doc = countersign(dir, key, publisherKey, { checksVersion: Number(flag("--checks-version") ?? 1), sourceHash: flag("--source-hash") ?? "" });
    console.log(`countersigned ${doc.statement.packId} ${doc.statement.version}`);
    return 0;
  }
  const { manifest, sha256: hash } = signPack(dir, key);
  console.log(`signed ${manifest.id} ${manifest.version}: ${manifest.files.length} files, manifest ${hash}`);
  return 0;
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  try {
    process.exitCode = main(process.argv.slice(2));
  } catch (e) {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  }
}
