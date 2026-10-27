// How a screen page's item placements draw until the one canvas does (acceptance 14, 18): each run between zones is
// one layer in its place in the z-order, its items at their screen pixels; hidden parts and hidden groups aren't drawn.
import { describe, expect, it } from "vitest";
import { CANVAS_ID, ITEM_ID, type MonitorProfile, type Placement, type ProfilePage } from "@/lib/layout";
import { isItemsLayer, placedItem, withItemLayers } from "@/lib/page-model/items-layer";
import type { StoredItem } from "@/lib/infopanel/import/stored";
import { openCanvas } from "@/lib/infopanel/canvas";

const zone = (id: string, module = "Clock", extra: Partial<Placement> = {}): Placement => ({ id, module, colStart: 1, rowStart: 1, colSpan: 1, rowSpan: 1, visible: true, ...extra });
const item = (id: string, x: number, extra: Partial<Placement> = {}) => zone(id, ITEM_ID, { item: { kind: "Text", Name: id, X: x, Y: 40, unknown: {} }, px: { x, y: 40, w: 20, h: 20 }, ...extra });
const screen: Pick<MonitorProfile, "width" | "height" | "cols" | "rows" | "fit" | "gap" | "padding"> = { width: 800, height: 480, cols: 4, rows: 3, fit: "scroll", padding: 20, gap: 10 };

describe("item layers", () => {
  const page: ProfilePage = {
    id: "p", name: "P",
    groups: [{ id: "g", name: "G", hidden: true }, { id: "inner", name: "In", parentId: "g" }],
    placements: [item("a", 30), zone("w1"), item("b", 50), item("c", 70, { visible: false }), item("d", 90, { groupId: "inner" }), zone("w2"), zone("w3", "Weather", { groupId: "g" })],
  };
  const zones = page.placements.filter((p) => p.module !== ITEM_ID);
  const out = withItemLayers(screen, page, zones);

  it("puts each run of items where it is in the z-order, zones kept as the same objects", () => {
    expect(out.map((p) => (isItemsLayer(p) ? "layer" : p.id))).toEqual(["layer", "w1", "layer", "w2"]);
    expect(out[1]).toBe(zones[0]);
    expect(out[0]).toMatchObject({ module: CANVAS_ID, colStart: 1, rowStart: 1, colSpan: 4, rowSpan: 3 });
  });

  it("draws the items at their screen pixels on a see-through canvas the grid's area in size", () => {
    const canvas = out[0].canvas!;
    expect(canvas.profile).toMatchObject({ Width: 760, Height: 3 * 120 + 2 * 10, BackgroundColor: "#00000000" });
    // Moved by the padding: the layer starts where the grid does.
    expect(openCanvas(canvas).items[0]).toMatchObject({ Name: "a", X: 10, Y: 20 });
  });

  it("leaves out hidden items, and every part of a hidden group (nested ones too)", () => {
    expect(openCanvas(out[2].canvas!).items.map((i) => i.Name)).toEqual(["b"]);
    expect(out.some((p) => p.id === "w3")).toBe(false);
  });

  it("draws an item on cells at its cells' box, so it follows the grid; a group moves with its children", () => {
    const pic = zone("pic", ITEM_ID, { colStart: 2, rowStart: 2, item: { kind: "Image", Name: "pic", X: 0, Y: 0, Width: 50, Height: 50, Scale: 100, unknown: {} } });
    const group = zone("grp", ITEM_ID, {
      item: { kind: "Group", Name: "grp", X: 10, Y: 10, DisplayItems: [{ kind: "Text", Name: "t", X: 12, Y: 14, unknown: {} }], unknown: {} },
      px: { x: 110, y: 60, w: 30, h: 20 },
    });
    // 4 × 3 cells of 182.5 × 120 between 20 px of padding and 10 px gaps.
    expect(placedItem(screen, pic)).toMatchObject({ X: 213, Y: 150, Width: 183, Height: 120 });
    const moved = placedItem(screen, group)!;
    expect(moved).toMatchObject({ X: 110, Y: 60 });
    expect((moved.DisplayItems as StoredItem[])[0]).toMatchObject({ X: 112, Y: 64 });
    // Already where it sits: the same object, so nothing re-renders.
    const there = zone("t", ITEM_ID, { item: { kind: "Text", Name: "t", X: 5, Y: 6, unknown: {} }, px: { x: 5, y: 6, w: 9, h: 9 } });
    expect(placedItem(screen, there)).toBe(there.item);
  });

  it("gives the zones back as they are on a page without items", () => {
    const plain = [zone("w")];
    expect(withItemLayers(screen, { id: "p", name: "P", placements: plain }, plain)).toBe(plain);
    expect(withItemLayers(screen, undefined, plain)).toBe(plain);
  });
});
