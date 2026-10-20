import { beforeEach, describe, expect, it, vi } from "vitest";
import { STARTERS } from "@/lib/infopanel/gauges/presets";
import type { LibraryItem } from "@/lib/library";
import { linkOf } from "@/lib/gauge-studio/gauge-link";
import { saveGauge } from "@/components/gauges/save-gauge";

const store = vi.hoisted(() => ({ items: [] as unknown[], n: 0 }));
vi.mock("@/lib/library", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  listLibrary: vi.fn(async () => store.items.map((i) => ({ ...(i as object) }))),
  getLibraryItem: vi.fn(async (id: string) => {
    const i = store.items.find((x) => (x as LibraryItem).id === id);
    if (!i) throw new Error("gone");
    return i;
  }),
  createLibraryItem: vi.fn(async (b: object) => {
    const item = { id: `n${++store.n}`, files: [], meta: {}, copies: [], ...b };
    store.items.push(item);
    return item;
  }),
  updateLibraryItem: vi.fn(async (id: string, patch: object) => {
    const i = store.items.find((x) => (x as LibraryItem).id === id) as object;
    Object.assign(i, patch);
    return i;
  }),
}));

const gauge = STARTERS[0].gauge;
const widget = linkOf({ profileId: "p", pageId: "pg" }, { kind: "widget", zoneId: "z1" })!;
const copyAt = (over: object) => ({ profileId: "p", zoneId: "z1", ...over });
const lib = (id: string, copies: object[]) => ({ id, kind: "gauge", name: id, files: [], meta: {}, copies, data: { vector: gauge, min: 0, max: 100, animationSpeed: 0 } });

beforeEach(() => {
  store.items = [];
  store.n = 0;
});

describe("saveGauge for a profile gauge", () => {
  it("creates once, then updates the same item", async () => {
    const a = await saveGauge({ name: "Ring", gauge, link: widget });
    const b = await saveGauge({ name: "Ring", gauge, link: widget });
    expect([a.updated, b.updated, b.id]).toEqual([false, true, a.id]);
    expect(store.items).toHaveLength(1);
    expect((store.items[0] as LibraryItem).copies[0]).toMatchObject({ profileId: "p", zoneId: "z1" });
  });

  it("updates the library item a gauge was placed from", async () => {
    store.items = [lib("src", [copyAt({})])];
    const r = await saveGauge({ name: "Ring", gauge, link: widget });
    expect([r.id, r.updated, store.items.length]).toEqual(["src", true, 1]);
  });

  it("creates a new one when the linked item was deleted", async () => {
    await saveGauge({ name: "Ring", gauge, link: widget });
    store.items = [];
    const r = await saveGauge({ name: "Ring", gauge, link: widget });
    expect([r.updated, store.items.length]).toEqual([false, 1]);
  });

  it("links a canvas Gauge item by its path", async () => {
    store.items = [lib("a", [copyAt({ itemPath: "0" })]), lib("b", [copyAt({ itemPath: "1" })])];
    const link = linkOf({ profileId: "p" }, { kind: "canvas", zoneId: "z1", path: "1" })!;
    const r = await saveGauge({ name: "Ring", gauge, link });
    expect(r.id).toBe("b");
  });

  it("still updates a library gauge by id", async () => {
    store.items = [lib("src", [])];
    const r = await saveGauge({ name: "Ring", gauge, itemId: "src" });
    expect([r.id, r.updated]).toEqual(["src", true]);
  });
  it("save as new on a library gauge creates a second item, then a Save updates the new one", async () => {
    store.items = [lib("src", [])];
    const copy = await saveGauge({ name: "Ring copy", gauge, itemId: "src", asNew: true });
    expect([copy.updated, store.items.length, copy.id === "src"]).toEqual([false, 2, false]);
    const next = await saveGauge({ name: "Ring copy", gauge, itemId: copy.id });
    expect([next.id, next.updated, store.items.length]).toEqual([copy.id, true, 2]);
  });

  it("save as new on a linked profile gauge moves the link to the new item", async () => {
    store.items = [lib("src", [copyAt({})])];
    const copy = await saveGauge({ name: "Ring copy", gauge, link: widget, asNew: true });
    expect(copy.id).not.toBe("src");
    expect((store.items[0] as LibraryItem).copies).toEqual([]);
    const next = await saveGauge({ name: "Ring copy", gauge, link: widget });
    expect([next.id, next.updated, store.items.length]).toEqual([copy.id, true, 2]);
  });
  it("save as new on a library frames gauge leaves the original untouched when the new item is saved again", async () => {
    const frames = [{ id: `${"1".repeat(64)}.png`, name: "f.png" }];
    store.items = [{ ...lib("src", []), data: { frames, min: 0, max: 100, animationSpeed: 8 } }];
    const copy = await saveGauge({ name: "Seq copy", gauge: null, frames, animationSpeed: 8, itemId: "src", asNew: true });
    await saveGauge({ name: "Seq renamed", gauge: null, frames, animationSpeed: 8, itemId: copy.id });
    expect((store.items[0] as LibraryItem).name).toBe("src");
    expect((store.items[1] as LibraryItem).name).toBe("Seq renamed");
  });

  it("save as new keeps the source item's source and frame rate", async () => {
    store.items = [{ ...lib("src", []), data: { vector: gauge, min: 0, max: 100, animationSpeed: 6, source: "MyDefault" } }];
    const copy = await saveGauge({ name: "Ring copy", gauge, itemId: "src", asNew: true });
    expect(copy.data).toMatchObject({ source: "MyDefault", animationSpeed: 6 });
  });

  it("logs when the old link cannot be removed", async () => {
    store.items = [lib("src", [copyAt({})])];
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const lib2 = await import("@/lib/library");
    vi.mocked(lib2.updateLibraryItem).mockImplementationOnce(async (id: string, patch: object) => {
      Object.assign(store.items.find((x) => (x as LibraryItem).id === id) as object, patch);
      return store.items.at(-1) as never;
    }).mockRejectedValueOnce(new Error("nope"));
    await saveGauge({ name: "Ring copy", gauge, link: widget, asNew: true });
    expect(log).toHaveBeenCalled();
    log.mockRestore();
  });

  it("keeps the old link when the new one cannot be recorded", async () => {
    store.items = [lib("src", [copyAt({})])];
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const lib2 = await import("@/lib/library");
    vi.mocked(lib2.updateLibraryItem).mockRejectedValueOnce(new Error("offline"));
    await saveGauge({ name: "Ring copy", gauge, link: widget, asNew: true });
    expect((store.items[0] as LibraryItem).copies).toHaveLength(1);
    expect(log).toHaveBeenCalled();
    log.mockRestore();
  });
});
