import { describe, expect, it, vi } from "vitest";
import { STARTERS } from "@/lib/infopanel/gauges/presets";
import { newStored } from "@/lib/infopanel/import/stored";
import type { LibraryItem, NewLibraryItem } from "@/lib/library";
import { canvasItem, canvasUpdate } from "@/lib/my-library/canvas-link";
import { ITEM_FORMAT, isOlderItem, stampFormat, updateItemFormat, upgradedData, type FormatStore } from "@/lib/my-library/item-format";

const stored = newStored({ name: "Arc", width: 800, height: 480, now: new Date("2026-10-26T00:00:00Z") });
const gaugeData = { vector: STARTERS[0].gauge, min: 0, max: 100, animationSpeed: 0 };
const gaugeDataOfStarter = () => ({ ...gaugeData, vector: expect.anything() });
const item = (over: Partial<LibraryItem> = {}): LibraryItem => ({
  id: "i1", kind: "canvas", name: "Arc", createdAt: "", updatedAt: "", files: ["f"], meta: { width: 800 }, copies: [{ profileId: "p" }], data: stored, ...over,
});

/** A server in memory: what was written, in order. */
function memoryStore(items: LibraryItem[]) {
  const writes: string[] = [];
  const store: FormatStore = {
    get: vi.fn(async (id: string) => items.find((i) => i.id === id)!),
    create: vi.fn(async (b: NewLibraryItem) => {
      writes.push(`create ${b.name}`);
      return { ...item(), id: "backup", ...b } as LibraryItem;
    }),
    update: vi.fn(async (id: string, patch: Partial<NewLibraryItem>) => {
      writes.push(`update ${id}`);
      return { ...items.find((i) => i.id === id)!, ...patch } as LibraryItem;
    }),
  };
  return { store, writes };
}

describe("isOlderItem", () => {
  it("a profile, component or gauge with no format, or a lower one, is older; today's or a newer one is not", () => {
    expect(isOlderItem(item())).toBe(true);
    expect(isOlderItem(item({ kind: "gauge", meta: { formatVersion: ITEM_FORMAT - 1 } }))).toBe(true);
    expect(isOlderItem(item({ meta: stampFormat() }))).toBe(false);
    expect(isOlderItem(item({ meta: { formatVersion: ITEM_FORMAT + 1 } }))).toBe(false);
  });

  it("files, the config's and the built-in items, and backups never are", () => {
    expect(isOlderItem(item({ kind: "image" }))).toBe(false);
    expect(isOlderItem(item({ id: "cfg-gauge:x", kind: "gauge" }))).toBe(false);
    expect(isOlderItem(item({ id: "builtin-panel:x", kind: "canvas" }))).toBe(false);
    expect(isOlderItem(item({ meta: { backupOf: "i0" } }))).toBe(false);
  });
});

describe("what saves an item stamps it", () => {
  it("a new profile and an edited one carry today's format", () => {
    expect(canvasItem(stored, "Arc").meta?.formatVersion).toBe(ITEM_FORMAT);
    expect(canvasUpdate(item(), stored).meta?.formatVersion).toBe(ITEM_FORMAT);
  });
});

describe("upgradedData", () => {
  it("reads a profile and a gauge as they are today", () => {
    expect(upgradedData("canvas", stored)).toEqual(stored);
    expect(upgradedData("gauge", gaugeData)).toEqual(gaugeDataOfStarter());
  });

  it("throws on data it can't read", () => {
    expect(() => upgradedData("canvas", { format: "something else" })).toThrow();
    expect(() => upgradedData("gauge", {})).toThrow();
  });
});

describe("updateItemFormat", () => {
  it("keeps a backup of the item as it was first, then rewrites it stamped, keeping its id, name, files and copies", async () => {
    const old = item();
    const { store, writes } = memoryStore([old]);
    const r = await updateItemFormat(old, store);
    expect(writes).toEqual(["create Arc (before update)", "update i1"]);
    expect(store.create).toHaveBeenCalledWith({ kind: "canvas", name: "Arc (before update)", files: ["f"], meta: { width: 800, backupOf: "i1" }, data: stored });
    expect(store.update).toHaveBeenCalledWith("i1", { data: stored, meta: { width: 800, formatVersion: ITEM_FORMAT } });
    expect(r.item).toMatchObject({ id: "i1", name: "Arc", files: ["f"], copies: [{ profileId: "p" }] });
    expect(isOlderItem(r.item)).toBe(false);
    expect(isOlderItem(r.backup)).toBe(false);
  });

  it("fetches an item whose data the list left out", async () => {
    const full = item({ kind: "gauge", data: gaugeData });
    const { store } = memoryStore([full]);
    await updateItemFormat({ ...full, data: undefined, dataSize: 4000 }, store);
    expect(store.get).toHaveBeenCalledWith("i1");
    expect(store.create).toHaveBeenCalledWith(expect.objectContaining({ data: gaugeData }));
  });

  it("leaves an item it can't read as it was, with no backup", async () => {
    const broken = item({ data: { format: "nope" } });
    const { store, writes } = memoryStore([broken]);
    await expect(updateItemFormat(broken, store)).rejects.toThrow();
    expect(writes).toEqual([]);
  });

  it("writes nothing over the item when its backup fails", async () => {
    const old = item();
    const { store } = memoryStore([old]);
    vi.mocked(store.create).mockRejectedValueOnce(new Error("full"));
    await expect(updateItemFormat(old, store)).rejects.toThrow("full");
    expect(store.update).not.toHaveBeenCalled();
  });
});
