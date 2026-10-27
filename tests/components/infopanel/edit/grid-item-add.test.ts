// An InfoPanel item or element added from Add on a screen's page (Edit v3 SPEC §7.4, DECISIONS after phase 3): an item
// placement, never a free area; on top, or on top inside the selected group; snapped or placed freely; the page's
// fonts kept; a sensor kind bound once its sensor is chosen.
import { describe, expect, it } from "vitest";
import { boundPagePart, newPagePart, partOf } from "@/components/infopanel/edit/grid-item-add";
import { readStored, type StoredCanvas } from "@/lib/infopanel/import/stored";
import { CANVAS_ID, ITEM_ID, type MonitorProfile, type ProfilePage } from "@/lib/layout";
import { placeForAdd } from "@/lib/page-model/gesture";
import { applyPlacements, readPlacements } from "@/lib/page-model/placements-adapter";
import type { PartNode } from "@/lib/page-model/model";

const page: ProfilePage = {
  id: "main",
  name: "Main",
  placements: [{ id: "w", module: "Weather", colStart: 1, rowStart: 1, colSpan: 2, rowSpan: 1, visible: true, groupId: "g" }],
  groups: [{ id: "g", name: "Right" }],
};
const screen: MonitorProfile = { id: "s", name: "Desk", width: 1024, height: 600, cols: 4, rows: 3, fit: "fill", gap: 0, padding: 0, pages: [page] };
const SIZE = { width: 1024, height: 600 };

/** The page after adding `data` at `at` (free or snapped), inside `parentId`. */
function add(data: string, at: { x: number; y: number }, free: boolean, parentId: string | null = null, on: ProfilePage = page) {
  const made = newPagePart(data, on, SIZE)!;
  const grid = readPlacements(screen, on).grid;
  const part: PartNode = { type: "part", id: "new", kind: data.startsWith("element:") ? "element" : "item", name: String(made.item.Name), place: placeForAdd(grid, at, made, free), ref: { backing: "item", item: made.item } };
  return { made, next: applyPlacements(screen, { ...on, freeCanvas: made.store }, [{ type: "add", part, parentId }]) };
}

describe("Add on a screen page", () => {
  it("makes an item placement on top of the page, snapped to cells, never a free area", () => {
    const { next } = add("Text", { x: 640, y: 300 }, false);
    const placed = next.placements.at(-1)!;
    expect(placed).toMatchObject({ id: "new", module: ITEM_ID, visible: true });
    expect(placed.px).toBeUndefined();
    expect(placed.item?.kind).toBe("Text");
    expect(next.placements.some((p) => p.module === CANVAS_ID)).toBe(false);
    expect(readPlacements(screen, next).root[0].id).toBe("new");
  });

  it("lands at the exact pixel when free", () => {
    const { next, made } = add("Text", { x: 500, y: 300 }, true);
    const placed = next.placements.at(-1)!;
    expect(placed.px).toEqual({ x: Math.round(500 - made.w / 2), y: Math.round(300 - made.h / 2), w: made.w, h: made.h });
    expect([placed.item?.X, placed.item?.Y]).toEqual([placed.px!.x, placed.px!.y]);
  });

  it("goes on top inside the selected group", () => {
    const { next } = add("element:card", { x: 100, y: 100 }, false, "g");
    const model = readPlacements(screen, next);
    const group = model.root.find((n) => n.id === "g");
    expect(group?.type === "group" && group.children.map((c) => c.id)).toEqual(["new", "w"]);
    expect(next.placements.find((p) => p.id === "new")?.groupId).toBe("g");
    expect((readPlacements(screen, next).root[0] as { children: PartNode[] }).children[0].kind).toBe("element");
  });

  it("keeps the page's fonts and adds the new item's", () => {
    const first = add("Text", { x: 100, y: 100 }, false);
    const store = { ...first.made.store!, fonts: [...first.made.store!.fonts, { request: { font: "Orbitron", style: "Regular", bold: false, italic: false }, use: "infopanel" as const }] };
    const again = newPagePart("Clock", { ...first.next, freeCanvas: store }, SIZE)!;
    expect(again.store?.fonts.map((f) => f.request.font)).toContain("Orbitron");
    expect(again.store?.fonts.length).toBeGreaterThanOrEqual(store.fonts.length);
  });

  it("binds a sensor kind once its sensor is chosen, named after it", () => {
    expect(partOf("Sensor")).toMatchObject({ label: "Value", sensor: true });
    expect(partOf("element:card")).toMatchObject({ label: "Card", sensor: false });
    expect(partOf("nope")).toBeNull();
    const { made, next } = add("Sensor", { x: 100, y: 100 }, false);
    const placed = next.placements.at(-1)!;
    const bound = boundPagePart(next, placed.item!, { key: "hwinfo:cpu", name: "CPU Package", unit: "°C" }, SIZE);
    const canvas = { ...(next.freeCanvas as Omit<StoredCanvas, "items">), items: [bound] } as StoredCanvas;
    const read = readStored(canvas);
    expect(read.items[0].Name).toBe("CPU Package");
    expect(read.keys.get("0")?.key).toBe("hwinfo:cpu");
    expect([bound.X, bound.Y]).toEqual([placed.item!.X, placed.item!.Y]);
    expect(made.item.Name).not.toBe("CPU Package");
  });

  it("knows nothing of an unknown drag id", () => {
    expect(newPagePart("nope", page, SIZE)).toBeNull();
  });
});
