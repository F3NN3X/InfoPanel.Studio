// The pack signer (tools/packs/sign.mjs): the manifest bytes match the vector the server's pack_trust.rs checks too, the publisher's
// signature covers every file but the signatures, and Themely's countersignature and revoke list are signed over their own
// domains. Keys here are throwaway, made at test time.
import crypto from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { countersign, manifestBytes, manifestOf, packFiles, REVOCATIONS_DOMAIN, signPack, signRevocations, STATEMENT_DOMAIN } from "../../../tools/packs/sign.mjs";
import { canonicalJson, generateKeyPair, readSecretKey, verifyBytes } from "../../../tools/widgets/minisign.mjs";

const vector = JSON.parse(readFileSync(new URL("../../fixtures/packs/canonical-vector.json", import.meta.url), "utf8"));
const dirs = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

/** A pack folder with its files, a stray dot file and the app's local mark. */
function folder() {
  const dir = mkdtempSync(join(tmpdir(), "pack-sign-"));
  dirs.push(dir);
  mkdirSync(join(dir, "assets"));
  writeFileSync(join(dir, "pack.json"), JSON.stringify({ id: "mine", version: "1.2.0" }));
  writeFileSync(join(dir, "look.json"), JSON.stringify({ id: "mine" }));
  writeFileSync(join(dir, "assets/fx.js"), "fx.onFrame(() => {});");
  writeFileSync(join(dir, ".DS_Store"), "x");
  writeFileSync(join(dir, "pack.sig"), "local");
  return dir;
}

const keys = () => {
  const pair = generateKeyPair();
  return { pub: pair.publicText, key: readSecretKey(pair.secretText), line: pair.publicText.split("\n")[1] };
};

describe("the manifest", () => {
  it("matches the shared test vector", () => {
    const bytes = manifestBytes(manifestOf(vector.id, vector.version, vector.files.map((f) => ({ path: f.path, bytes: Buffer.from(f.text, "utf8") }))));
    expect(bytes.toString("utf8")).toBe(vector.canonical);
    expect(crypto.createHash("sha256").update(bytes).digest("hex")).toBe(vector.sha256);
  });

  it("lists the pack's files and leaves out the signatures, the local mark and dot files", () => {
    const dir = folder();
    writeFileSync(join(dir, "pack.minisig"), "x");
    writeFileSync(join(dir, "themely.json"), "{}");
    expect(packFiles(dir).map((f) => f.path)).toEqual(["assets/fx.js", "look.json", "pack.json"]);
  });
});

describe("signing", () => {
  it("the publisher's signature verifies over the manifest and breaks on any change to a file", () => {
    const dir = folder();
    const { pub, key } = keys();
    const { manifest } = signPack(dir, key);
    const sig = readFileSync(join(dir, "pack.minisig"), "utf8");
    expect(verifyBytes(manifestBytes(manifest), sig, pub)).toBe(true);
    writeFileSync(join(dir, "assets/fx.js"), "fx.onFrame(() => 1);");
    const now = manifestOf("mine", "1.2.0", packFiles(dir));
    expect(verifyBytes(manifestBytes(now), sig, pub)).toBe(false);
  });

  it("Themely countersigns the statement of these files, a person's review", () => {
    const dir = folder();
    const publisher = keys();
    const themely = keys();
    const { sha256 } = signPack(dir, publisher.key);
    const doc = countersign(dir, themely.key, publisher.line, { checksVersion: 1, sourceHash: "ab", issuedAt: "2026-11-23T10:00:00.000Z" });
    expect(JSON.parse(readFileSync(join(dir, "themely.json"), "utf8"))).toEqual(doc);
    expect(doc.statement).toEqual({
      manifestSha256: sha256,
      packId: "mine",
      version: "1.2.0",
      publisherKeyId: publisher.pub.split("\n")[0].split(" ").pop(),
      checksVersion: 1,
      reviewLevel: "reviewed",
      sourceHash: "ab",
      issuedAt: "2026-11-23T10:00:00Z",
    });
    expect(doc.publisherKey).toBe(publisher.line);
    const bytes = Buffer.from(STATEMENT_DOMAIN + canonicalJson(doc.statement), "utf8");
    expect(verifyBytes(bytes, doc.minisign, themely.pub)).toBe(true);
    expect(verifyBytes(bytes, doc.minisign, publisher.pub)).toBe(false);
  });

  it("a revoke list is signed over its own domain and needs a whole version and an expiry", () => {
    const themely = keys();
    const list = { format: 1, version: 3, expires: "2027-01-01T00:00:00Z", keys: [], packs: [{ id: "bad", reason: "copies a logo" }] };
    const signed = signRevocations(list, themely.key);
    expect(verifyBytes(Buffer.from(REVOCATIONS_DOMAIN + canonicalJson(list), "utf8"), signed.minisign, themely.pub)).toBe(true);
    expect(() => signRevocations({ ...list, version: 1.5 }, themely.key)).toThrow();
    expect(() => signRevocations({ ...list, expires: undefined }, themely.key)).toThrow();
  });
});
