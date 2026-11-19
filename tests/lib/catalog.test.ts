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

  it("lists the dashboard server's own readings too: one source per namespace, one container per device", async () => {
    // The Data API never carries battery.*, so Device batteries were missing from the data sources and pickers.
    const battery = {
      "battery.7.name": { text: "MX Master 3S", unit: "" },
      "battery.7.percent": { value: 93, unit: "%" },
      "battery.status": { text: "ok", unit: "" },
    };
    vi.stubGlobal("fetch", api({ "libre.x": { value: 1, unit: "" } }));
    vi.stubGlobal(
      "EventSource",
      class {
        onmessage: ((e: { data: string }) => void) | null = null;
        constructor(url: string) {
          const sensors = url.includes("prefix=battery.") ? battery : {};
          setTimeout(() => this.onmessage?.({ data: JSON.stringify({ timestamp: 1, sensors }) }), 0);
        }
        close() {}
      }
    );
    const { refreshCatalog, getCatalog } = await load();
    await refreshCatalog();
    const c = getCatalog();
    expect(c.sensors["battery.7.percent"]).toEqual({ value: 93, unit: "%" });
    expect(c.sensors["libre.x"]).toEqual({ value: 1, unit: "" });
    const devices = c.sources?.plugins.find((p) => p.id === "battery");
    expect(devices?.name).toBe("Device batteries");
    expect(devices?.containers.map((k) => [k.name, k.entries.map((e) => [e.name, e.type, e.key])])).toEqual([
      ["MX Master 3S", [["name", "text", "battery.7.name"], ["percent", "sensor", "battery.7.percent"]]],
      ["Status", [["status", "text", "battery.status"]]],
    ]);
    // weather. sent nothing: no empty source for it
    expect(c.sources?.plugins.map((p) => p.id)).toEqual(["p", "battery"]);
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

  it("waits while the studio holds Data API requests, then fetches from the address the config set, never the default", async () => {
    const fetch = api({ "libre.x": { value: 1, unit: "" } });
    vi.stubGlobal("fetch", fetch);
    const { holdApiBase, releaseApiBase } = await import("@/lib/data-api");
    const { setApiBase, refreshCatalog, getCatalog } = await load();
    holdApiBase();
    const done = refreshCatalog();
    await Promise.resolve();
    expect(fetch).not.toHaveBeenCalled();
    // the server's config arrives with its address, then the hold ends
    setApiBase("http://fake:9");
    releaseApiBase();
    await done;
    await refreshCatalog();
    expect(fetch.mock.calls.map(([url]) => url).every((url) => String(url).startsWith("http://fake:9/"))).toBe(true);
    expect(getCatalog().status).toBe("ready");
  });
});
