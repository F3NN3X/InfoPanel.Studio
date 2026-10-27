// Studio widget items on an imported profile's grid (Edit v3 SPEC §3.6, §7.3, Q3; acceptance 7, 12): they move and
// resize by whole cells, their record's cell and their box kept in step, and never onto another widget.
import { describe, expect, it } from "vitest";
import { cellDelta, itemCells, itemOnCells, moveOnCells, resizeOnCells, settleCells } from "@/lib/infopanel/editor/cells";
import { moveBy, setField } from "@/lib/infopanel/editor/ops";
import { newWidgetItem, widgetOf } from "@/lib/infopanel/native/widget-item";
import { defaultItem, type DisplayItem } from "@/lib/infopanel/schema";
import { cellRect, type PageGrid } from "@/lib/page-model/model";

const GRID: PageGrid = { cols: 8, rows: 5, gap: 0, padding: 0, width: 800, height: 480 };
const onCells = (module: string, col: number, row: number, cols: number) => {
  const cell = { col, row, cols, rows: 1 };
  return newWidgetItem({ module, cell }, cellRect(GRID, cell), module);
};
const text = { ...defaultItem("Text"), Name: "T", X: 15, Y: 20 } as DisplayItem;
// Weather on columns 1–2, Clock on 5–6 of row 1, a text.
const items = [onCells("Weather", 1, 1, 2), onCells("Clock", 5, 1, 2), text];

describe("widget items on cells", () => {
  it("move by whole cells, the record's cell and the box together; items with them by the same px", () => {
    const out = moveOnCells(GRID, items, ["0", "2"], 2, 1)!;
    expect(widgetOf(out[0])?.cell).toEqual({ col: 3, row: 2, cols: 2, rows: 1 });
    expect(out[0]).toMatchObject({ X: 200, Y: 96, Width: 200, Height: 96 });
    expect(out[2]).toMatchObject({ X: 215, Y: 116 });
    expect(out[1]).toBe(items[1]);
  });

  it("refuse a move onto another widget or off the grid", () => {
    expect(moveOnCells(GRID, items, ["0"], 3, 0)).toBeNull();
    expect(moveOnCells(GRID, items, ["1"], 3, 0)).toBeNull();
  });

  it("resize to the cells nearest the box, refused when another widget sits there", () => {
    expect(widgetOf(resizeOnCells(GRID, items, "0", { x: 0, y: 0, w: 290, h: 100 })![0])?.cell).toEqual({ col: 1, row: 1, cols: 3, rows: 1 });
    expect(resizeOnCells(GRID, items, "0", { x: 0, y: 0, w: 510, h: 96 })).toBeNull();
  });

  it("count a drag in the nearest number of cells", () => {
    expect(cellDelta(GRID, 149, -50)).toEqual({ dc: 1, dr: -1 });
  });
});

// Edit v3 SPEC §3.3, §10.2 (DECISIONS after phase 4): an imported profile's item on cells keeps `$.cell` (Snap to grid
// stores it), and an item that leaves its cells is placed freely, so the Place row never shows a stale cell.
describe("items on cells", () => {
  const sensor = { ...defaultItem("Sensor"), Name: "CPU temp", X: 32, Y: 96, Width: 224, Height: 96 } as DisplayItem;
  const cellOf = (it: DisplayItem) => (it as DisplayItem & { cell?: unknown }).cell;
  const snapped = () => itemOnCells(GRID, [sensor], "0", { col: 1, row: 2, cols: 3, rows: 1 });

  it("Snap to grid puts the item on the cells, its box theirs, the cell stored", () => {
    const [out] = snapped();
    expect(cellOf(out)).toEqual({ col: 1, row: 2, cols: 3, rows: 1 });
    expect(out).toMatchObject({ X: 0, Y: 96, Width: 300, Height: 96 });
  });

  it("keeps an item a move by whole cells left on cells, on its new cells", () => {
    const [moved] = settleCells(GRID, moveBy(snapped(), ["0"], 100, 96));
    expect(cellOf(moved)).toEqual({ col: 2, row: 3, cols: 3, rows: 1 });
  });

  it("places freely an item moved off its cells (a nudge, a typed X)", () => {
    expect(cellOf(settleCells(GRID, moveBy(snapped(), ["0"], 1, 0))[0])).toBeUndefined();
    expect(cellOf(settleCells(GRID, setField(snapped(), "0", "X", 37))[0])).toBeUndefined();
  });

  it("leaves items without cells, and items still on theirs, as the same list (byte-identical export)", () => {
    const list = [sensor, text, snapped()[0]];
    expect(settleCells(GRID, list)).toBe(list);
  });

  it("lists the cells the items cover, not the widgets' or hidden items'", () => {
    const hidden = { ...sensor, Hidden: true } as DisplayItem;
    expect(itemCells(GRID, [onCells("Weather", 1, 1, 2), sensor, hidden], 1)).toEqual([{ col: 1, row: 2, cols: 3, rows: 1 }]);
  });
});
