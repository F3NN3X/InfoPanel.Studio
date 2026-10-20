import { afterEach, describe, expect, it, vi } from "vitest";

/** Fresh copies of both modules, so they share one Data API URL. */
async function load() {
  const { setApiBase } = await import("@/lib/data-api");
  const catalog = await import("@/lib/catalog");
  return { setApiBase, ...catalog };
}

const ok = (body: unknown) => ({ ok: true, json: async () => body });
const api = (sensors: object) =>
  vi.fn(async (url: string) =>
    url.endsWith("/api/sources")
      ? ok({ plugins: [{ id: "p", name: "P", containers: [] }], hardware: {} })
      : ok({ sensors })
  );

describe("catalog", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it("loads the source tree and a sensor snapshot from the current base, once at a time", async () => {
    const fetchMock = api({ "libre.x": { value: 1, unit: "" } });
    vi.stubGlobal("fetch", fetchMock);
    const { setApiBase, refreshCatalog, getCatalog } = await load();
    setApiBase("http://pc:1");

    await Promise.all([refreshCatalog(), refreshCatalog()]);
    expect(fetchMock.mock.calls.map((c) => c[0]).sort()).toEqual([
      "http://pc:1/api/sensors",
      "http://pc:1/api/sources",
    ]);
    const c = getCatalog();
    expect(c.status).toBe("ready");
    expect(c.sources?.plugins.map((p) => p.id)).toEqual(["p"]);
    expect(Object.keys(c.sensors)).toEqual(["libre.x"]);
  });

  it("keeps the last good catalog when the Data API is unreachable", async () => {
    vi.stubGlobal("fetch", api({ "libre.x": { value: 1, unit: "" } }));
    const { refreshCatalog, getCatalog } = await load();
    await refreshCatalog();

    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new Error("refused"))));
    await refreshCatalog();
    expect(getCatalog().status).toBe("error");
    expect(Object.keys(getCatalog().sensors)).toEqual(["libre.x"]);
  });

  it("forgets the old catalog when the Data API URL changes", async () => {
    vi.stubGlobal("fetch", api({ "libre.x": { value: 1, unit: "" } }));
    const { setApiBase, refreshCatalog, getCatalog } = await load();
    await refreshCatalog();
    setApiBase("http://elsewhere:2");
    expect(getCatalog()).toMatchObject({ sources: null, sensors: {}, status: "idle" });
  });
});
