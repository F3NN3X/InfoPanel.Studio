// Drags, resizes and keys on a page's parts (Edit v3 SPEC §7.3, §14, decision Q3; acceptance 7, 8, 9, 26): a widget
// always lands on cells and never on another widget; an item snaps to cells, or with Alt lands at the exact pixel.
import { describe, expect, it } from "vitest";
import { ITEM_ID, type MonitorProfile, type Placement } from "@/lib/layout";
import { applyOps, cellRect, findNode, type PageGrid, type PartNode } from "@/lib/page-model";
import { arrowOps, cellsForAdd, moveCells, moveOps, placeForAdd, placesFreely, resizeOps, type Start } from "@/lib/page-model/gesture";
import { applyPlacements, readPlacements } from "@/lib/page-model/placements-adapter";

// 8 × 5 cells of 100 px, no gap or padding (an imported profile's grid, SPEC §3.7).
const GRID: PageGrid = { cols: 8, rows: 5, gap: 0, padding: 0, width: 800, height: 500 };
const widget = (id: string, col: number, row: number, cols = 2, rows = 1): Start => ({ id, kind: "widget", place: { cell: { col, row, cols, rows } } });
const freeItem = (id: string, x: number, y: number, w = 60, h = 30): Start => ({ id, kind: "item", place: { px: { x, y, w, h } } });
const cellItem = (id: string, col: number, row: number): Start => ({ id, kind: "item", place: { cell: { col, row, cols: 1, rows: 1 } } });

describe("Snap items and Alt", () => {
  it("frees a gesture that holds Alt while items snap, and one that doesn't while they don't", () => {
    expect([placesFreely(true, false), placesFreely(true, true), placesFreely(false, false), placesFreely(false, true)]).toEqual([false, true, true, false]);
  });
});

describe("moving parts by a pointer delta", () => {
  it("lands a widget on the cells nearest it, with or without Alt (acceptance 7)", () => {
    for (const free of [false, true]) expect(moveOps(GRID, [widget("w", 1, 1)], 137, 160, free)).toEqual([{ type: "move", id: "w", to: { col: 2, row: 3 } }]);
  });

  it("places an item with Alt at the exact pixel, and snaps one on cells to the nearest cells without (acceptance 8)", () => {
    expect(moveOps(GRID, [freeItem("t", 10, 10)], 33.4, 7.6, true)).toEqual([{ type: "move", id: "t", to: { x: 43, y: 18 } }]);
    expect(moveOps(GRID, [cellItem("t", 1, 1)], 133, 7, false)).toEqual([{ type: "move", id: "t", to: { col: 2, row: 1 } }]);
  });

  // User decision (2026-10-28), replacing SPEC §7.3's "without Alt it becomes / stays on grid" for items already
  // placed freely: a shape tuned to the pixel with Alt must not change when it is moved again.
  it("keeps an item placed freely at its size without Alt: only its corner snaps, to the nearest cell's", () => {
    expect(moveOps(GRID, [freeItem("t", 10, 10)], 133, 7, false)).toEqual([{ type: "move", id: "t", to: { x: 100, y: 0 } }]);
    // The last cell at most: the corner never snaps past the grid.
    expect(moveOps(GRID, [freeItem("t", 10, 10)], 2000, 2000, false)).toEqual([{ type: "move", id: "t", to: { x: 700, y: 400 } }]);
  });

  it("leaves a locked part where it is", () => {
    expect(moveOps(GRID, [{ ...freeItem("t", 10, 10), locked: true }], 50, 50, true)).toEqual([]);
  });

  it("stores the item in px through the page model (data-free), and a widget on cells", () => {
    const profile: MonitorProfile = { id: "s", name: "S", width: 800, height: 500, cols: 8, rows: 5, fit: "fill", gap: 0, padding: 0, pages: [] };
    const page = {
      id: "p",
      name: "P",
      placements: [
        { id: "w", module: "Weather", colStart: 1, rowStart: 1, colSpan: 2, rowSpan: 1, visible: true },
        { id: "t", module: ITEM_ID, colStart: 1, rowStart: 1, colSpan: 1, rowSpan: 1, visible: true, item: { kind: "Text", Name: "T", X: 10, Y: 10, unknown: {} }, px: { x: 10, y: 10, w: 60, h: 30 } },
      ] as Placement[],
    };
    const model = readPlacements(profile, page);
    const parts = ["w", "t"].map((id) => findNode(model.root, id)!.node as PartNode);
    // An item dropped with Alt over the widget sits on it, at its pixels.
    const next = applyPlacements(profile, page, moveOps(model.grid, parts, 25, 5, true));
    expect(next.placements.find((p) => p.id === "t")).toMatchObject({ px: { x: 35, y: 15, w: 60, h: 30 }, item: { X: 35, Y: 15 } });
    expect(next.placements.find((p) => p.id === "w")).toMatchObject({ colStart: 1, rowStart: 1 });
    expect(next.placements.find((p) => p.id === "w")).not.toHaveProperty("px");
  });

  it("an item sized with Alt and then moved without it keeps its pixel size in the page model", () => {
    const profile: MonitorProfile = { id: "s", name: "S", width: 800, height: 500, cols: 8, rows: 5, fit: "fill", gap: 0, padding: 0, pages: [] };
    const shape = { kind: "Shape", Name: "S", X: 10, Y: 10, Width: 60, Height: 30, unknown: {} };
    const page = { id: "p", name: "P", placements: [{ id: "s", module: ITEM_ID, colStart: 1, rowStart: 1, colSpan: 1, rowSpan: 1, visible: true, item: shape, px: { x: 10, y: 10, w: 60, h: 30 } }] as Placement[] };
    const model = readPlacements(profile, page);
    const sized = applyPlacements(profile, page, resizeOps(model.grid, findNode(model.root, "s")!.node as PartNode, "se", 17, 3, true));
    const again = readPlacements(profile, sized);
    const moved = applyPlacements(profile, sized, moveOps(again.grid, [findNode(again.root, "s")!.node as PartNode], 130, 95, false));
    expect(moved.placements[0]).toMatchObject({ px: { x: 100, y: 100, w: 77, h: 33 }, item: { X: 100, Y: 100, Width: 77, Height: 33 } });
  });
});

describe("resizing a part", () => {
  it("to the pixel when free, to the nearest cells when snapped; a widget always on cells", () => {
    expect(resizeOps(GRID, freeItem("t", 10, 10), "se", 15, 5, true)).toEqual([
      { type: "move", id: "t", to: { x: 10, y: 10 } },
      { type: "resize", id: "t", to: { w: 75, h: 35 } },
    ]);
    expect(resizeOps(GRID, widget("w", 1, 1), "e", 120, 0, true)).toEqual([
      { type: "move", id: "w", to: { col: 1, row: 1 } },
      { type: "resize", id: "w", to: { cols: 3, rows: 1 } },
    ]);
  });

  it("keeps an item placed freely when snapped: only the edges dragged go to grid lines, the others keep their pixels", () => {
    // The south-east corner dragged to (85, 45): the right and bottom edges go to the cell ends nearest them (100, 100).
    expect(resizeOps(GRID, freeItem("t", 10, 10), "se", 15, 5, false)).toEqual([
      { type: "move", id: "t", to: { x: 10, y: 10 } },
      { type: "resize", id: "t", to: { w: 90, h: 90 } },
    ]);
    // The west edge dragged to x 80 snaps to 100; the east edge (160) and the top and height stay.
    expect(resizeOps(GRID, freeItem("t", 110, 110, 50, 50), "w", -30, 0, false)).toEqual([
      { type: "move", id: "t", to: { x: 100, y: 110 } },
      { type: "resize", id: "t", to: { w: 60, h: 50 } },
    ]);
    // One on cells still snaps to the cells nearest the box.
    expect(resizeOps(GRID, cellItem("t", 1, 1), "e", 120, 0, false)).toEqual([
      { type: "move", id: "t", to: { col: 1, row: 1 } },
      { type: "resize", id: "t", to: { cols: 2, rows: 1 } },
    ]);
  });

  it("keeps the opposite edge where it was when the west or north edge moves", () => {
    const [move, size] = resizeOps(GRID, freeItem("t", 100, 100, 50, 50), "nw", 10, 20, true);
    expect(move).toEqual({ type: "move", id: "t", to: { x: 110, y: 120 } });
    expect(size).toEqual({ type: "resize", id: "t", to: { w: 40, h: 30 } });
  });
});

describe("widgets on cells (Q3: refuse)", () => {
  it("move by whole cells, refused on another widget or off the grid", () => {
    const others = [{ col: 5, row: 1, cols: 2, rows: 1 }];
    expect(moveCells(GRID, [{ col: 1, row: 1, cols: 2, rows: 1 }], others, 2, 0)).toEqual([{ col: 3, row: 1, cols: 2, rows: 1 }]);
    expect(moveCells(GRID, [{ col: 1, row: 1, cols: 2, rows: 1 }], others, 3, 0)).toBeNull();
    expect(moveCells(GRID, [{ col: 7, row: 1, cols: 2, rows: 1 }], [], 1, 0)).toBeNull();
  });

  it("are added under the pointer, else the nearest free cells, else the first free; none when the page is full", () => {
    expect(cellsForAdd(GRID, { x: 650, y: 450 }, { cols: 2, rows: 1 }, [])).toEqual({ col: 7, row: 5, cols: 2, rows: 1 });
    // Over the grid's edge: kept inside.
    expect(cellsForAdd(GRID, { x: 790, y: 450 }, { cols: 2, rows: 1 }, [])).toEqual({ col: 7, row: 5, cols: 2, rows: 1 });
    expect(cellsForAdd(GRID, { x: 650, y: 450 }, { cols: 2, rows: 1 }, [{ col: 7, row: 5, cols: 2, rows: 1 }])).toEqual({ col: 7, row: 4, cols: 2, rows: 1 });
    expect(cellsForAdd(GRID, null, { cols: 2, rows: 1 }, [{ col: 1, row: 1, cols: 2, rows: 1 }])).toEqual({ col: 3, row: 1, cols: 2, rows: 1 });
    expect(cellsForAdd(GRID, null, { cols: 2, rows: 1 }, [{ col: 1, row: 1, cols: 8, rows: 5 }])).toBeNull();
  });
});

describe("arrow keys (SPEC §14, acceptance 26)", () => {
  const key = (dx: -1 | 0 | 1, dy: -1 | 0 | 1, alt = false, shift = false) => ({ dx, dy, alt, shift });

  it("Arrows move one cell; Alt+Arrows move a widget one cell too", () => {
    expect(arrowOps(GRID, [widget("w", 2, 2)], key(1, 0))).toEqual([{ type: "move", id: "w", to: { col: 3, row: 2 } }]);
    expect(arrowOps(GRID, [widget("w", 2, 2)], key(0, 1, true))).toEqual([{ type: "move", id: "w", to: { col: 2, row: 3 } }]);
    expect(arrowOps(GRID, [cellItem("i", 2, 2)], key(-1, 0))).toEqual([{ type: "move", id: "i", to: { col: 1, row: 2 } }]);
  });

  it("Arrows move a placed-freely item one cell's pitch in px", () => {
    expect(arrowOps(GRID, [freeItem("t", 13, 7)], key(1, 0))).toEqual([{ type: "move", id: "t", to: { x: 113, y: 7 } }]);
  });

  it("Alt+Arrows nudge an item 1 px and Alt+Shift+Arrows 10 px; it becomes placed freely", () => {
    expect(arrowOps(GRID, [cellItem("i", 2, 2)], key(1, 0, true))).toEqual([{ type: "move", id: "i", to: { x: 101, y: 100 } }]);
    expect(arrowOps(GRID, [freeItem("t", 13, 7)], key(0, -1, true, true))).toEqual([{ type: "move", id: "t", to: { x: 13, y: -3 } }]);
    const model = { pageId: "p", grid: GRID, snapItems: true, root: [{ type: "part", id: "i", kind: "item", name: "i", place: { cell: { col: 2, row: 2, cols: 1, rows: 1 } }, ref: { backing: "item", item: { kind: "Text" } } } as PartNode] };
    const moved = applyOps(model, arrowOps(GRID, [cellItem("i", 2, 2)], key(1, 0, true)));
    expect((moved.root[0] as PartNode).place).toEqual({ px: { ...cellRect(GRID, { col: 2, row: 2, cols: 1, rows: 1 }), x: 101 } });
  });

  it("Shift+Arrows resize one cell", () => {
    expect(arrowOps(GRID, [widget("w", 2, 2)], key(1, 0, false, true))).toEqual([{ type: "resize", id: "w", to: { cols: 3, rows: 1 } }]);
    expect(arrowOps(GRID, [widget("w", 2, 2)], key(-1, 0, false, true))).toEqual([{ type: "resize", id: "w", to: { cols: 1, rows: 1 } }]);
  });
});

describe("An item or element added from Add (SPEC §7.4)", () => {
  it("centres its box on the point and snaps it to the cells nearest the box", () => {
    expect(placeForAdd(GRID, { x: 450, y: 250 }, { w: 180, h: 90 }, false)).toEqual({ cell: { col: 5, row: 3, cols: 2, rows: 1 } });
  });

  it("lands at the exact pixel when free (Alt, or the page's Snap items off)", () => {
    expect(placeForAdd(GRID, { x: 450, y: 250 }, { w: 181, h: 90 }, true)).toEqual({ px: { x: 360, y: 205, w: 181, h: 90 } });
  });

  it("takes at least one cell, at the page's corner", () => {
    expect(placeForAdd(GRID, { x: 0, y: 0 }, { w: 0, h: 0 }, false)).toEqual({ cell: { col: 1, row: 1, cols: 1, rows: 1 } });
  });
});
