import { afterEach, describe, expect, it, vi } from "vitest";
import { ConfigRejectedError, NewerConfigError, fetchConfig, isUnreachable, noteSettingsRev, patchSettings, pushConfig } from "@/lib/dashboard-server";
import type { DashboardConfig } from "@/lib/layout";

const respond = (status: number, body?: unknown) =>
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(body === undefined ? null : JSON.stringify(body), { status }))
  );

afterEach(() => vi.unstubAllGlobals());

describe("fetchConfig", () => {
  it("returns the saved config", async () => {
    respond(200, { profiles: [{ id: "a" }] });
    expect(await fetchConfig()).toEqual({ profiles: [{ id: "a" }] });
  });

  it("returns null when nothing is saved or the file has no profiles", async () => {
    respond(404);
    expect(await fetchConfig()).toBeNull();
    respond(200, { theme: {} });
    expect(await fetchConfig()).toBeNull();
  });

  it("throws when the server answers with an error, so nothing gets pushed over it", async () => {
    respond(502);
    await expect(fetchConfig()).rejects.toThrow("502");
  });
});

describe("pushConfig", () => {
  it("posts JSON with the config header the server requires", async () => {
    respond(200, { ok: true });
    await pushConfig({ profiles: [] } as unknown as DashboardConfig);
    const [url, init] = vi.mocked(fetch).mock.calls[0];
    expect(url).toBe("/api/config");
    expect(init?.method).toBe("POST");
    expect(init?.headers).toEqual({ "Content-Type": "application/json", "X-Dashboard-Config": "1" });
  });

  it("throws on a refusal", async () => {
    respond(403);
    await expect(pushConfig({} as DashboardConfig)).rejects.toThrow("403");
  });
});

describe("patchSettings", () => {
  it("sends the patch as a PATCH with the config header the server requires", async () => {
    respond(200, { ok: true });
    await patchSettings({ general: { hideCursor: true } });
    const [url, init] = vi.mocked(fetch).mock.calls[0];
    expect(url).toBe("/api/config/settings");
    expect(init?.method).toBe("PATCH");
    expect(init?.headers).toEqual({ "Content-Type": "application/json", "X-Dashboard-Config": "1" });
    expect(JSON.parse(String(init?.body))).toEqual({ general: { hideCursor: true } });
  });

  it("throws a refusal as ConfigRejectedError", async () => {
    respond(400);
    await expect(patchSettings({ general: { hideCursor: true } })).rejects.toBeInstanceOf(ConfigRejectedError);
  });
});

describe("isUnreachable", () => {
  it("is true for a network failure, false for any answer from the server", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new TypeError("Failed to fetch"))));
    expect(await pushConfig({} as DashboardConfig).catch(isUnreachable)).toBe(true);
    respond(422);
    const refused = await pushConfig({} as DashboardConfig).catch((e: unknown) => e);
    expect(refused).toBeInstanceOf(ConfigRejectedError);
    expect(isUnreachable(refused)).toBe(false);
    respond(409);
    const newer = await pushConfig({} as DashboardConfig).catch((e: unknown) => e);
    expect(newer).toBeInstanceOf(NewerConfigError);
    expect(isUnreachable(newer)).toBe(false);
  });
});

// Last: the revision is module state, kept for the rest of the file once noted.
describe("the Settings revision sent with a push", () => {
  const sentHeaders = () => vi.mocked(fetch).mock.calls[0][1]?.headers as Record<string, string>;

  it("is sent once a read of the saved config or a Settings change has noted it, and only the newest counts", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ profiles: [{ id: "a" }] }), { status: 200, headers: { "X-Settings-Rev": "100" } })));
    await fetchConfig();
    noteSettingsRev(90);
    respond(200, { ok: true });
    await pushConfig({} as DashboardConfig);
    expect(sentHeaders()["X-Settings-Rev"]).toBe("100");
    noteSettingsRev(105);
    respond(200, { ok: true });
    await pushConfig({} as DashboardConfig);
    expect(sentHeaders()["X-Settings-Rev"]).toBe("105");
  });

  it("is left off a push that replaces the saved config whole", async () => {
    noteSettingsRev(110);
    respond(200, { ok: true });
    await pushConfig({} as DashboardConfig, true);
    expect(sentHeaders()).not.toHaveProperty("X-Settings-Rev");
  });

  it("is what a Settings patch resolves to", async () => {
    respond(200, { ok: true, settingsRev: 120 });
    expect(await patchSettings({ general: { hideCursor: true } })).toBe(120);
  });
});
