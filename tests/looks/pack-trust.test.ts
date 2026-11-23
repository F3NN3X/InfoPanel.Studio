// A pack's trust as the studio reads it from the server (pack signatures): the answer is parsed strictly, each state has its badge,
// and "verified" is never worded as safe. The routes themselves are tested in ips-server (tests/routes_pack_trust.rs).
import { afterEach, describe, expect, it, vi } from "vitest";
import { isRefused, parseTrust, readPackTrust, readScriptSwitch, setScriptSwitch, trustBadge, trustMeaning, type TrustState } from "@/looks/pack-trust";

afterEach(() => vi.unstubAllGlobals());

const STATES: TrustState[] = ["builtin", "verified", "signed", "unverified", "modified", "revoked"];

describe("the server's word on a pack", () => {
  it("is read strictly: a state it does not know is no trust at all", () => {
    expect(parseTrust({ state: "signed", publisher: "Acme", extra: 1 })).toEqual({ state: "signed", publisher: "Acme" });
    expect(parseTrust({ state: "revoked", reason: "x".repeat(300) })?.reason).toHaveLength(200);
    for (const bad of [undefined, null, "verified", { state: "safe" }, { state: 1 }]) expect(parseTrust(bad)).toBeUndefined();
  });

  it("refuses only a changed or withdrawn pack", () => {
    expect(STATES.filter((state) => isRefused({ state }))).toEqual(["modified", "revoked"]);
    expect(isRefused(undefined)).toBe(false);
  });
});

describe("the badges", () => {
  it("each state has its words and tone: amber unverified, red changed or withdrawn", () => {
    expect(STATES.map((state) => trustBadge({ state, publisher: "Acme", reason: "copies a logo" }))).toEqual([
      { label: "Built-in", tone: "neutral" },
      { label: "Verified by Themely", tone: "ok" },
      { label: "Signed by Acme, not reviewed", tone: "neutral" },
      { label: "Unverified", tone: "warn" },
      { label: "Changed since it was signed", tone: "danger" },
      { label: "Withdrawn: copies a logo", tone: "danger" },
    ]);
  });

  it("verified means checks and a person's review of these files, never that a pack is safe", () => {
    const meaning = trustMeaning({ state: "verified" });
    expect(meaning).toMatch(/checks/);
    expect(meaning).toMatch(/a person reviewed these exact files/);
    for (const state of STATES) expect(trustBadge({ state }).label.toLowerCase()).not.toContain("safe");
    expect(meaning).not.toMatch(/\bis safe\b/i);
  });
});

describe("the script routes", () => {
  it("reads a pack's trust with what it means for its script", async () => {
    vi.stubGlobal("fetch", async (url: string) =>
      url === "/api/packs/mine/trust" ? new Response(JSON.stringify({ state: "unverified", hasScript: true, consent: "granted", scriptRuns: true, scriptSha256: "ab" })) : new Response("", { status: 404 }),
    );
    expect(await readPackTrust("mine")).toEqual({ state: "unverified", hasScript: true, consent: "granted", scriptRuns: true, scriptSha256: "ab" });
    expect(await readPackTrust("none")).toBeUndefined();
  });

  it("sets the studio's switch with the write header, and says why the server refused", async () => {
    const calls: RequestInit[] = [];
    vi.stubGlobal("fetch", async (_url: string, init?: RequestInit) => {
      if (init?.method === "PUT") {
        calls.push(init);
        return (init.headers as Record<string, string>)["X-Dashboard-Pack"] === "1" ? new Response(JSON.stringify({ on: false, env: true, fetching: false, stale: false })) : new Response("", { status: 403 });
      }
      return new Response(JSON.stringify({ on: true, env: false, fetching: true, stale: true }));
    });
    expect(await readScriptSwitch()).toEqual({ on: true, env: false, fetching: true, stale: true });
    expect(await setScriptSwitch(false)).toEqual({ on: false, env: true, fetching: false, stale: false });
    expect(JSON.parse(calls[0].body as string)).toEqual({ on: false });
    vi.stubGlobal("fetch", async () => new Response("user packs are off", { status: 403 }));
    expect(await setScriptSwitch(true)).toBe("user packs are off");
  });
});
