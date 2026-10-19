import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { inlineCanvases, liftCanvases, loadCanvas, refOf, resetWriteRefusal, REUSE_MS, saveCanvas, storageCopy, unresolvedCanvases } from "./canvas-store";
import { ConfigRejectedError, fetchConfig, isUnreachable, pushConfig } from "./dashboard-server";
import type { StoredCanvas } from "./infopanel/import/stored";
import { defaultConfig, loadConfig, saveConfig, type DashboardConfig, type Placement } from "./layout";

/** A stand-in for server.mjs: the canvas store (ids by content) and the config, with failures to order. */
function fakeServer() {
  const canvases = new Map<string, string>();
  const state = { config: null as string | null, failConfig: false, refuseCanvases: false };
  const idOf = (text: string) => {
    let h = 0;
    for (let i = 0; i < text.length; i++) h = (h * 31 + text.charCodeAt(i)) >>> 0;
    return `cnv_${h.toString(16).padStart(32, "0")}`;
  };
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    if (url === "/api/canvases") {
      if (state.refuseCanvases) return new Response("from this computer only", { status: 403 });
      const text = String(init?.body);
      const id = idOf(text);
      canvases.set(id, text);
      return new Response(JSON.stringify({ id }), { status: 200 });
    }
    if (url.startsWith("/api/canvases/")) {
      const text = canvases.get(url.slice("/api/canvases/".length));
      return text === undefined ? new Response(null, { status: 404 }) : new Response(text, { status: 200 });
    }
    if (url === "/api/config") {
      if (init?.method !== "POST") return state.config ? new Response(state.config) : new Response(null, { status: 404 });
      if (state.failConfig) throw new TypeError("Failed to fetch");
      state.config = String(init.body);
      return new Response(JSON.stringify({ ok: true }));
    }
    return new Response(null, { status: 404 });
  });
  vi.stubGlobal("fetch", fetchMock);
  const posts = () => fetchMock.mock.calls.filter(([u, i]) => u === "/api/canvases" && i?.method === "POST").length;
  return { canvases, state, fetchMock, posts };
}

const canvas = (name: string, size = 0): StoredCanvas =>
  ({ format: "infopanel-canvas", version: 1, source: { name, origin: "file", importedAt: "" }, items: [], assets: [], fonts: [], pad: "x".repeat(size) }) as unknown as StoredCanvas;

const zone = (id: string, extra: Partial<Placement>): Placement => ({ id, module: "infopanel-canvas", colStart: 1, rowStart: 1, colSpan: 1, rowSpan: 1, visible: true, ...extra });

const withZones = (zones: Placement[]): DashboardConfig => {
  const c = defaultConfig();
  return { ...c, profiles: [{ ...c.profiles[0], pages: [{ ...c.profiles[0].pages[0], placements: zones }] }] };
};

const zonesOf = (config: { profiles?: unknown }) =>
  (config.profiles as DashboardConfig["profiles"]).flatMap((p) => p.pages.flatMap((pg) => pg.placements));

beforeEach(() => {
  vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  resetWriteRefusal();
});

describe("loadCanvas", () => {
  it("loads a ref once and answers null for a missing file", async () => {
    const server = fakeServer();
    const ref = await saveCanvas(canvas("cached"));
    expect(await loadCanvas(ref!)).toMatchObject({ source: { name: "cached" } });
    await loadCanvas(ref!);
    expect(server.fetchMock.mock.calls.filter(([u]) => u === `/api/canvases/${ref}`)).toHaveLength(1);
    expect(await loadCanvas("cnv_ffffffffffffffffffffffffffffffff")).toBeNull();
  });

  it("answers null for a failed load, logs it, and tries it again next time", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 502 })));
    expect(await loadCanvas("cnv_eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee")).toBeNull();
    expect(console.warn).toHaveBeenCalled();
    vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new TypeError("Failed to fetch"))));
    expect(await loadCanvas("cnv_eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee")).toBeNull();
    const server = fakeServer();
    const ref = await saveCanvas(canvas("later"));
    server.canvases.set("cnv_eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee", server.canvases.get(ref!)!);
    expect(await loadCanvas("cnv_eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee")).toMatchObject({ source: { name: "later" } });
  });

  it("never fails the config for one bad file: the others load, the bad one keeps its ref", async () => {
    const server = fakeServer();
    const good = await saveCanvas(canvas("good"));
    server.canvases.set("cnv_cccccccccccccccccccccccccccccccc", '{"format":"infopanel-canvas","trunc');
    server.state.config = JSON.stringify(withZones([zone("a", { canvasRef: good! }), zone("b", { canvasRef: "cnv_cccccccccccccccccccccccccccccccc" })]));
    const fetched = (await fetchConfig()) as DashboardConfig;
    const [a, b] = zonesOf(fetched);
    expect(a.canvas).toMatchObject({ source: { name: "good" } });
    expect(b).toEqual(zone("b", { canvasRef: "cnv_cccccccccccccccccccccccccccccccc" }));
    expect(unresolvedCanvases(fetched)).toEqual(["Main display › Main › b"]);
  });
});

describe("liftCanvases and inlineCanvases", () => {
  let server: ReturnType<typeof fakeServer>;
  beforeEach(() => {
    server = fakeServer();
  });

  it("moves inline canvases into the store and back, leaving other zones alone", async () => {
    const plain = zone("plain", { module: "Clock" });
    const config = withZones([zone("a", { canvas: canvas("A") }), plain]);
    const lifted = await liftCanvases(config);
    const [a, other] = zonesOf(lifted);
    expect(a).not.toHaveProperty("canvas");
    expect(a.canvasRef).toMatch(/^cnv_[a-f0-9]{32}$/);
    expect(server.canvases.has(a.canvasRef!)).toBe(true);
    expect(other).toBe(plain);
    const back = await inlineCanvases(JSON.parse(JSON.stringify(lifted)) as DashboardConfig);
    expect(zonesOf(back)[0]).toEqual(zone("a", { canvas: canvas("A") }));
  });

  it("sends an unchanged canvas only once, and the same bytes to the same file", async () => {
    const shared = canvas("A");
    const config = withZones([zone("a", { canvas: shared })]);
    await liftCanvases(config);
    await liftCanvases(config);
    expect(server.posts()).toBe(1);
    // A duplicated zone (a copy of the canvas) gets the same ref.
    const copy = await liftCanvases(withZones([zone("b", { canvas: structuredClone(shared) })]));
    expect(zonesOf(copy)[0].canvasRef).toBe(zonesOf(await liftCanvases(config))[0].canvasRef);
    expect(server.canvases.size).toBe(1);
  });

  it("returns the same config when there is nothing to move", async () => {
    const config = withZones([zone("plain", { module: "Clock" })]);
    expect(await liftCanvases(config)).toBe(config);
    expect(await inlineCanvases(config)).toBe(config);
    expect(await inlineCanvases({})).toEqual({});
  });

  it("keeps a canvas inline when the server refuses canvas writes from here", async () => {
    server.state.refuseCanvases = true;
    const lifted = await liftCanvases(withZones([zone("a", { canvas: canvas("remote") })]));
    expect(zonesOf(lifted)[0].canvas).toMatchObject({ source: { name: "remote" } });
  });

  it("keeps the ref of a loaded canvas when writes are refused, and asks only once per session", async () => {
    const ref = await saveCanvas(canvas("stored"));
    const loadedBack = (await loadCanvas(ref!))!;
    server.state.refuseCanvases = true;
    const config = withZones([zone("a", { canvas: loadedBack }), zone("b", { canvas: canvas("new") })]);
    const before = server.posts();
    const lifted = await liftCanvases(config);
    expect(zonesOf(lifted)[0]).toEqual(zone("a", { canvasRef: ref! }));
    expect(zonesOf(lifted)[1].canvas).toMatchObject({ source: { name: "new" } });
    const asked = server.posts() - before;
    expect(asked).toBeGreaterThanOrEqual(1);
    await liftCanvases(config);
    await liftCanvases(withZones([zone("c", { canvas: canvas("newer") })]));
    expect(server.posts() - before).toBe(asked);
  });

  it("turns a refused canvas (too large) into a rejected save, not an offline one", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string) => (url === "/api/canvases" ? new Response("canvas is too large", { status: 413 }) : new Response("{}"))));
    const err = await pushConfig(withZones([zone("a", { canvas: canvas("huge") })])).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ConfigRejectedError);
    expect((err as ConfigRejectedError).status).toBe(413);
    expect((err as Error).message).toContain("too large");
    expect(isUnreachable(err)).toBe(false);
  });

  it("reports the server's 422 for a missing canvas file as a rejected save", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("canvas files missing from the store: cnv_x", { status: 422 })));
    const err = await pushConfig(withZones([zone("a", { canvasRef: "cnv_x" })])).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ConfigRejectedError);
    expect((err as Error).message).toContain("missing");
    expect(isUnreachable(err)).toBe(false);
  });

  it("keeps a ref the store has no file for", async () => {
    const config = withZones([zone("a", { canvasRef: "cnv_dddddddddddddddddddddddddddddddd" })]);
    expect(zonesOf(await inlineCanvases(config))[0]).toEqual(config.profiles[0].pages[0].placements[0]);
  });

  it("walks legacy profiles that keep their own placements", async () => {
    const lifted = await liftCanvases({ profiles: [{ id: "old", placements: [zone("a", { canvas: canvas("old") })] }] });
    expect((lifted.profiles as { placements: Placement[] }[])[0].placements[0].canvasRef).toMatch(/^cnv_/);
  });
});

describe("saveCanvas reuse", () => {
  it("sends a known canvas again once its ref is older than REUSE_MS, and a loaded one on its first push", async () => {
    const server = fakeServer();
    const c = canvas("undo");
    await saveCanvas(c, 0);
    await saveCanvas(c, REUSE_MS - 1);
    expect(server.posts()).toBe(1);
    await saveCanvas(c, REUSE_MS + 1);
    expect(server.posts()).toBe(2);
    const loadedBack = await loadCanvas((await saveCanvas(canvas("stored")))!);
    const before = server.posts();
    await saveCanvas(loadedBack!);
    expect(server.posts()).toBe(before + 1);
  });
});

describe("the browser's own copy", () => {
  const storage = () => {
    const items = new Map<string, string>();
    const store = { getItem: (k: string) => items.get(k) ?? null, setItem: vi.fn((k: string, v: string) => void items.set(k, v)) };
    vi.stubGlobal("localStorage", store);
    return { items, store };
  };

  it("keeps a canvas the store holds as its ref, and an unsaved one inline", async () => {
    fakeServer();
    const saved = canvas("saved");
    await saveCanvas(saved);
    const config = withZones([zone("a", { canvas: saved }), zone("b", { canvas: canvas("unsaved") })]);
    const copy = storageCopy(config);
    const [a, b] = zonesOf(copy);
    expect(a).toEqual(zone("a", { canvasRef: refOf(saved) }));
    expect(b.canvas).toMatchObject({ source: { name: "unsaved" } });
    expect(storageCopy(withZones([zone("c", { module: "Clock" })]))).toEqual(withZones([zone("c", { module: "Clock" })]));
  });

  it("keeps canvases inline, so an offline start still draws them", async () => {
    fakeServer();
    const saved = canvas("saved");
    await saveCanvas(saved);
    storage();
    saveConfig(withZones([zone("a", { canvas: saved })]));
    expect(zonesOf(loadConfig())[0].canvas).toMatchObject({ source: { name: "saved" } });
  });

  it("falls back to refs when the inline copy is over the quota", async () => {
    fakeServer();
    const saved = canvas("saved");
    await saveCanvas(saved);
    const { items, store } = storage();
    store.setItem.mockImplementation((k: string, v: string) => {
      if (v.includes('"saved"')) throw new DOMException("full", "QuotaExceededError");
      items.set(k, v);
    });
    saveConfig(withZones([zone("a", { canvas: saved })]));
    expect(store.setItem).toHaveBeenCalledTimes(2);
    expect(zonesOf(loadConfig())[0]).toMatchObject({ id: "a", canvasRef: refOf(saved) });
  });

  it("survives a storage that is full even for refs, or unavailable", () => {
    const { store } = storage();
    store.setItem.mockImplementation(() => {
      throw new DOMException("full", "QuotaExceededError");
    });
    expect(() => saveConfig(withZones([zone("a", { canvas: canvas("big") })]))).not.toThrow();
    store.setItem.mockImplementation(() => {
      throw new DOMException("denied", "SecurityError");
    });
    store.setItem.mockClear();
    expect(() => saveConfig(withZones([zone("a", { canvas: canvas("big") })]))).not.toThrow();
    expect(store.setItem).toHaveBeenCalledTimes(1);
  });
});

describe("migration through pushConfig", () => {
  it("writes the canvases first, then the config with refs", async () => {
    const server = fakeServer();
    await pushConfig(withZones([zone("a", { canvas: canvas("A") }), zone("b", { canvas: canvas("B") })]));
    const urls = server.fetchMock.mock.calls.map(([u]) => u);
    expect(urls.lastIndexOf("/api/canvases")).toBeLessThan(urls.indexOf("/api/config"));
    const saved = JSON.parse(server.state.config!) as DashboardConfig;
    expect(saved.version).toBe(5);
    expect(zonesOf(saved).map((z) => [z.canvas, server.canvases.has(z.canvasRef!)])).toEqual([
      [undefined, true],
      [undefined, true],
    ]);
  });

  it("loses nothing when the config save fails after the canvases were written, and the retry reuses the files", async () => {
    const server = fakeServer();
    const inline = JSON.stringify(withZones([zone("a", { canvas: canvas("A") })]));
    server.state.config = inline;
    server.state.failConfig = true;
    const config = JSON.parse(inline) as DashboardConfig;
    await expect(pushConfig(config)).rejects.toThrow("Failed to fetch");
    // The stored config still has the canvas inline; the file written is unreferenced, not lost.
    expect(server.state.config).toBe(inline);
    expect(server.canvases.size).toBe(1);
    server.state.failConfig = false;
    await pushConfig(JSON.parse(inline) as DashboardConfig);
    expect(server.canvases.size).toBe(1);
    const [z] = zonesOf(JSON.parse(server.state.config!));
    expect(server.canvases.has(z.canvasRef!)).toBe(true);
    // Migrated again: nothing to move.
    const again = await liftCanvases(JSON.parse(server.state.config!) as DashboardConfig);
    expect(JSON.stringify(again)).toBe(server.state.config);
  });

  it("keeps a config with twenty 310 kB canvases under the 5 MB cap", async () => {
    const server = fakeServer();
    const zones = Array.from({ length: 20 }, (_, i) => zone(`c${i}`, { canvas: canvas(`ARCv2 ${i}`, 310 * 1024) }));
    const config = withZones(zones);
    expect(JSON.stringify(config).length).toBeGreaterThan(5 * 1024 * 1024);
    await pushConfig(config);
    expect(server.state.config!.length).toBeLessThan(64 * 1024);
    expect(server.canvases.size).toBe(20);
  });

  it("lands pushes in order even when an earlier one waits on a canvas", async () => {
    const server = fakeServer();
    const first = pushConfig(withZones([zone("a", { canvas: canvas("slow", 1000) })]));
    const second = pushConfig(withZones([zone("a", { module: "Clock" })]));
    await Promise.all([first, second]);
    expect(zonesOf(JSON.parse(server.state.config!))[0].module).toBe("Clock");
  });
});
