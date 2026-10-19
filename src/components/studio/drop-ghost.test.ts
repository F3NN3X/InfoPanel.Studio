import { describe, expect, it } from "vitest";
import type { Placement } from "@/lib/layout";
import { DND_MIME, DND_MIME_PANEL, ALL_MODULES } from "./studio-modules";
import type { LibraryItem as MyLibraryItem } from "@/lib/library";
import { canvasTakesDrop, dropGhost, dropSize, libraryItemOf } from "./drop-ghost";

const zone = (
  id: string,
  colStart: number,
  rowStart: number,
  colSpan: number,
  rowSpan: number,
  visible = true
): Placement => ({ id, module: "mod", colStart, rowStart, colSpan, rowSpan, visible });

const grid = { cols: 12, rows: 6 };

describe("dropSize", () => {
  it("is at least 3×2", () => {
    expect(dropSize({ cols: 1, rows: 1 }, grid)).toEqual({ cols: 3, rows: 2 });
  });

  it("keeps a larger minimum", () => {
    expect(dropSize({ cols: 4, rows: 3 }, grid)).toEqual({ cols: 4, rows: 3 });
  });

  it("is clamped to the grid", () => {
    expect(dropSize({ cols: 8, rows: 5 }, { cols: 6, rows: 2 })).toEqual({ cols: 6, rows: 2 });
    expect(dropSize({ cols: 1, rows: 1 }, { cols: 2, rows: 1 })).toEqual({ cols: 2, rows: 1 });
  });
});

describe("dropGhost", () => {
  it("centres the box on the pointer cell", () => {
    const g = dropGhost({ col: 5, row: 3 }, { cols: 3, rows: 2 }, grid, []);
    expect(g).toEqual({ rect: { col: 4, row: 3, cols: 3, rows: 2 }, ok: true });
  });

  it("clamps into the grid", () => {
    expect(dropGhost({ col: 1, row: 1 }, { cols: 3, rows: 2 }, grid, []).rect).toMatchObject({ col: 1, row: 1 });
    expect(dropGhost({ col: 12, row: 6 }, { cols: 3, rows: 2 }, grid, []).rect).toMatchObject({ col: 10, row: 5 });
  });

  it("is not ok over a visible zone, but ignores hidden ones", () => {
    const size = { cols: 3, rows: 2 };
    expect(dropGhost({ col: 5, row: 3 }, size, grid, [zone("a", 4, 3, 2, 2)]).ok).toBe(false);
    expect(dropGhost({ col: 5, row: 3 }, size, grid, [zone("a", 4, 3, 2, 2, false)]).ok).toBe(true);
  });
});

describe("libraryItemOf", () => {
  const data = (map: Record<string, string>) => (type: string) => map[type] ?? "";

  it("reads a known widget", () => {
    const id = ALL_MODULES[0].id;
    expect(libraryItemOf(data({ [DND_MIME]: id }))).toEqual({ kind: "module", id });
  });

  it("reads the blank zone card", () => {
    expect(libraryItemOf(data({ [DND_MIME]: "blank" }))).toEqual({ kind: "module", id: "blank" });
  });

  it("reads a panel preset id", () => {
    expect(libraryItemOf(data({ [DND_MIME_PANEL]: "p1" }))).toEqual({ kind: "panel", id: "p1" });
  });

  it("ignores unknown widgets and other drags", () => {
    expect(libraryItemOf(data({ [DND_MIME]: "nope" }))).toBeNull();
    expect(libraryItemOf(data({}))).toBeNull();
  });
});

describe("canvasTakesDrop", () => {
  const over = { zoneId: "c", fx: 0.5, fy: 0.5 };
  const card = (kind: string) => ({ kind: "mylib" as const, id: "i", item: { kind } as MyLibraryItem });

  it("hides the grid ghost over a canvas zone for a card it takes as an item", () => {
    for (const kind of ["image", "svg", "video", "gauge"]) expect(canvasTakesDrop(card(kind), over)).toBe(true);
  });

  it("keeps the ghost off a canvas zone, for cards it doesn't take, and for widgets", () => {
    expect(canvasTakesDrop(card("image"), null)).toBe(false);
    expect(canvasTakesDrop(card("panel"), over)).toBe(false);
    expect(canvasTakesDrop({ kind: "mylib", id: "i" }, over)).toBe(false);
    expect(canvasTakesDrop({ kind: "module", id: "m" }, over)).toBe(false);
    expect(canvasTakesDrop(null, over)).toBe(false);
  });
});
