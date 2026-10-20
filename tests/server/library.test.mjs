import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { createLibraryStore, ITEM_ID_RE, LIST_DATA_BYTES, libraryWriteRefusal, newItemId, normalizeItem, summaryOf } from "../../server/library.mjs";

const ASSET = `${"a".repeat(64)}.png`;
const NOW = new Date("2026-10-17T12:00:00Z");

describe("normalizeItem", () => {
  it("makes a new item with an id, stamps and clean copies", () => {
    const { item } = normalizeItem(
      { kind: "image", name: "  Nebula  ", files: [ASSET, ASSET], meta: { w: 1920, tags: ["Dark"] }, copies: [{ profileId: "p", zoneId: "z", evil: 1 }, "x"] },
      null,
      NOW,
    );
    expect(item).toEqual({
      id: expect.stringMatching(ITEM_ID_RE),
      kind: "image",
      name: "Nebula",
      createdAt: NOW.toISOString(),
      updatedAt: NOW.toISOString(),
      files: [ASSET],
      meta: { w: 1920, tags: ["Dark"] },
      copies: [{ profileId: "p", zoneId: "z" }],
    });
  });

  it("refuses an unknown kind, a missing name, files that are not asset ids and odd meta", () => {
    expect(normalizeItem({ kind: "script", name: "x" }).error).toMatch(/kind/);
    expect(normalizeItem({ kind: "gauge", name: " " }).error).toMatch(/name/);
    expect(normalizeItem({ kind: "image", name: "x", files: ["../config.json"] }).error).toMatch(/files/);
    expect(normalizeItem({ kind: "image", name: "x", meta: [] }).error).toMatch(/meta/);
    expect(normalizeItem({ kind: "image", name: "x", meta: { s: "x".repeat(70_000) } }).error).toMatch(/meta/);
  });

  it("updates over an existing item, keeping its id, kind and creation", () => {
    const { item: first } = normalizeItem({ kind: "gauge", name: "Arc", data: { shape: "arc" } }, null, NOW);
    const later = new Date("2026-10-18T00:00:00Z");
    const { item } = normalizeItem({ name: "Arc copy", copies: [{ profileId: "p" }] }, first, later);
    expect(item).toMatchObject({ id: first.id, kind: "gauge", name: "Arc copy", createdAt: NOW.toISOString(), updatedAt: later.toISOString(), data: { shape: "arc" } });
    expect(normalizeItem({ kind: "image" }, first).error).toMatch(/kind cannot change/);
    expect(normalizeItem({ id: "lib_other000000" }, first).item.id).toBe(first.id);
  });
});

describe("summaryOf", () => {
  it("leaves out large data with its size", () => {
    const { item } = normalizeItem({ kind: "canvas", name: "c", data: { s: "x".repeat(LIST_DATA_BYTES) } });
    const s = summaryOf(item);
    expect(s).not.toHaveProperty("data");
    expect(s.dataSize).toBeGreaterThan(LIST_DATA_BYTES);
    const small = normalizeItem({ kind: "gauge", name: "g", data: { shape: "arc" } }).item;
    expect(summaryOf(small)).toBe(small);
  });
});

describe("createLibraryStore", () => {
  const withStore = (fn) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "library-"));
    try {
      return fn(createLibraryStore(dir), dir);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  };

  it("creates, reads, updates and removes items, one file each", () =>
    withStore((store, dir) => {
      const { item } = store.create({ kind: "font", name: "Orbitron", files: [ASSET] });
      expect(fs.readdirSync(dir)).toEqual([`${item.id}.json`]);
      expect(store.get(item.id)).toEqual(item);
      expect(store.update(item.id, { name: "Orbitron Bold" }).item.name).toBe("Orbitron Bold");
      expect(store.list().map((i) => i.name)).toEqual(["Orbitron Bold"]);
      expect(store.texts().join("")).toContain("a".repeat(64));
      expect(store.remove(item.id)).toBe(true);
      expect(store.list()).toEqual([]);
    }));

  it("answers missing ids and refuses ids that could be paths", () =>
    withStore((store) => {
      expect(store.update("lib_000000000000", { name: "x" })).toEqual({ missing: true });
      expect(store.get("../config")).toBeNull();
      expect(store.remove("..\\x")).toBe(false);
    }));

  it("skips files that are not items", () =>
    withStore((store, dir) => {
      fs.writeFileSync(path.join(dir, "lib_aaaaaaaaaaaa.json"), "{broken");
      fs.writeFileSync(path.join(dir, "notes.json"), "{}");
      expect(store.list()).toEqual([]);
    }));
});

describe("libraryWriteRefusal", () => {
  const ok = { "x-dashboard-library": "1", "content-type": "application/json" };
  it("needs the header, JSON and this computer", () => {
    expect(libraryWriteRefusal(ok, "127.0.0.1", false)).toBeNull();
    expect(libraryWriteRefusal({ ...ok, "x-dashboard-library": undefined }, "127.0.0.1", false)?.status).toBe(403);
    expect(libraryWriteRefusal({ ...ok, "content-type": "text/plain" }, "127.0.0.1", false)?.status).toBe(415);
    expect(libraryWriteRefusal(ok, "192.168.1.5", false)?.status).toBe(403);
    expect(libraryWriteRefusal(ok, "192.168.1.5", true)).toBeNull();
  });

  it("needs no JSON for a delete", () => {
    expect(libraryWriteRefusal({ "x-dashboard-library": "1" }, "::1", false, false)).toBeNull();
  });
});

it("newItemId matches the id pattern", () => {
  for (let i = 0; i < 50; i++) expect(newItemId()).toMatch(ITEM_ID_RE);
});
