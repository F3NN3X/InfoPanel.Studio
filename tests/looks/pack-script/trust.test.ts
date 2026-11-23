import { afterEach, describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import { asksConsent, giveConsent, type PackTrust, readScript, readTrust, scriptsOn, trustOf } from "@/looks/pack-script/trust";

// The client of the trust contract (`/trust`, `/script-consent`, `/fx.js`), against a fake fetch: anything out of shape is "no script".

afterEach(() => {
  vi.unstubAllGlobals();
});

const T: PackTrust = { state: "unverified", hasScript: true, consent: "none", scriptRuns: false };
const SRC = "fx.onFrame(function(){})";
const SHA = createHash("sha256").update(SRC).digest("hex");
const answer = (body: BodyInit | null, init: ResponseInit = {}) => vi.fn(async () => new Response(body, init));

describe("trustOf", () => {
  it("reads the contract's shape and nothing else", () => {
    expect(trustOf({ ...T, publisher: "Ana" })).toEqual({ ...T, publisher: "Ana" });
    expect(trustOf({ ...T, state: "trusted" })).toBeUndefined();
    // the server never answers builtin: built-in packs are the client's to know
    expect(trustOf({ ...T, state: "builtin" })).toBeUndefined();
    // a script runs only with the hash it is fetched by
    expect(trustOf({ ...T, scriptRuns: true, scriptSha256: SHA })).toEqual({ ...T, scriptRuns: true, scriptSha256: SHA });
    expect(trustOf({ ...T, scriptRuns: true })?.scriptRuns).toBe(false);
    expect(trustOf({ ...T, scriptRuns: true, scriptSha256: "ABC" })?.scriptRuns).toBe(false);
    expect(trustOf({ ...T, consent: "yes" })).toBeUndefined();
    expect(trustOf({ ...T, scriptRuns: "true" })).toBeUndefined();
    expect(trustOf([T])).toBeUndefined();
    expect(trustOf(null)).toBeUndefined();
    // a script that does not exist never runs; a publisher name with markup is dropped
    expect(trustOf({ ...T, hasScript: false, scriptRuns: true })?.scriptRuns).toBe(false);
    expect(trustOf({ ...T, publisher: "<b>x</b>" })?.publisher).toBeUndefined();
  });
});

describe("asksConsent", () => {
  it.each([
    [T, true],
    [{ ...T, consent: "granted" }, false],
    [{ ...T, consent: "denied" }, false],
    [{ ...T, hasScript: false }, false],
    [{ ...T, state: "verified" }, false],
    [{ ...T, state: "signed" }, false],
    [{ ...T, state: "modified" }, false],
    [{ ...T, state: "revoked" }, false],
    [undefined, false],
  ] as const)("%o: %s", (t, asks) => expect(asksConsent(t as PackTrust | undefined)).toBe(asks));
});

describe("the routes", () => {
  it("reads the trust of a pack id only, and reads a failed or odd answer as none", async () => {
    const ok = answer(JSON.stringify(T), { headers: { "Content-Type": "application/json" } });
    vi.stubGlobal("fetch", ok);
    expect(await readTrust("my-pack")).toEqual(T);
    expect(ok).toHaveBeenCalledWith("/api/packs/my-pack/trust", { cache: "no-store" });
    expect(await readTrust("../config")).toBeUndefined();
    expect(ok).toHaveBeenCalledTimes(1);
    vi.stubGlobal("fetch", answer("nope", { status: 404 }));
    expect(await readTrust("my-pack")).toBeUndefined();
    vi.stubGlobal("fetch", answer("{not json"));
    expect(await readTrust("my-pack")).toBeUndefined();
  });

  it("puts the answer with the pack write header", async () => {
    const put = answer(null, { status: 204 });
    vi.stubGlobal("fetch", put);
    expect(await giveConsent("my-pack", true)).toBe(true);
    expect(put).toHaveBeenCalledWith("/api/packs/my-pack/script-consent", { method: "PUT", headers: { "Content-Type": "application/json", "X-Dashboard-Pack": "1" }, body: '{"granted":true}' });
    vi.stubGlobal("fetch", answer(null, { status: 403 }));
    expect(await giveConsent("my-pack", false)).toBe(false);
  });

  it("takes a script only by its hash, as JavaScript, within 64 KB, as UTF-8 and with that SHA-256", async () => {
    const js = { headers: { "Content-Type": "text/javascript; charset=utf-8" } };
    const ok = answer(SRC, js);
    vi.stubGlobal("fetch", ok);
    expect(await readScript("my-pack", SHA)).toBe(SRC);
    expect(ok).toHaveBeenCalledWith(`/api/packs/my-pack/fx.js?sha256=${SHA}`, { cache: "no-store" });
    expect(await readScript("my-pack", "not-a-hash")).toBeUndefined();
    vi.stubGlobal("fetch", answer("fx.onFrame(function(){ })", js));
    expect(await readScript("my-pack", SHA)).toBeUndefined();
    vi.stubGlobal("fetch", answer(SRC, { headers: { "Content-Type": "text/html" } }));
    expect(await readScript("my-pack", SHA)).toBeUndefined();
    const big = "x".repeat(65_537);
    vi.stubGlobal("fetch", answer(big, js));
    expect(await readScript("my-pack", createHash("sha256").update(big).digest("hex"))).toBeUndefined();
    const bad = new Uint8Array([0xff, 0xfe]);
    vi.stubGlobal("fetch", answer(bad, js));
    expect(await readScript("my-pack", createHash("sha256").update(bad).digest("hex"))).toBeUndefined();
    vi.stubGlobal("fetch", answer(SRC, { ...js, status: 404 }));
    expect(await readScript("my-pack", SHA)).toBeUndefined();
  });

  it("reads the switch as on only when it says on: true", async () => {
    vi.stubGlobal("fetch", answer(JSON.stringify({ on: true, env: "on", fetching: false, stale: false })));
    expect(await scriptsOn()).toBe(true);
    vi.stubGlobal("fetch", answer(JSON.stringify({ on: false, env: "off" })));
    expect(await scriptsOn()).toBe(false);
    vi.stubGlobal("fetch", answer("x", { status: 404 }));
    expect(await scriptsOn()).toBe(false);
  });
});
