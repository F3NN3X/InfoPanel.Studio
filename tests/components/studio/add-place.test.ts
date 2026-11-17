import { describe, expect, it } from "vitest";
import { BLANK_MODULE, type Placement, type ProfileView } from "@/lib/layout";
import { addGhost, autoPlace, shrinkSizes } from "@/components/studio/add-place";
import { fitZoneRect, takenOn } from "@/components/studio/zone-geometry";

const zone = (id: string, colStart: number, rowStart: number, colSpan: number, rowSpan: number, module = "m"): Placement => ({
  id,
  module,
  colStart,
  rowStart,
  colSpan,
  rowSpan,
  visible: true,
});

const grid = { cols: 8, rows: 3 };
const cpu = { def: { cols: 3, rows: 2 }, min: { cols: 1, rows: 1 } };

describe("shrinkSizes", () => {
  it("goes from the default to the min, largest area first, wider first on a tie", () => {
    expect(shrinkSizes({ cols: 3, rows: 2 }, { cols: 1, rows: 1 }, grid).slice(0, 4)).toEqual([
      { cols: 3, rows: 2 },
      { cols: 2, rows: 2 },
      { cols: 3, rows: 1 },
      { cols: 2, rows: 1 },
    ]);
    // Equal areas: the wider first.
    expect(shrinkSizes({ cols: 2, rows: 2 }, { cols: 1, rows: 1 }, grid).slice(1, 3)).toEqual([
      { cols: 2, rows: 1 },
      { cols: 1, rows: 2 },
    ]);
  });

  it("keeps sizes inside the grid, and has none when the min is wider than it", () => {
    expect(shrinkSizes({ cols: 10, rows: 1 }, { cols: 9, rows: 1 }, grid)).toEqual([]);
    expect(shrinkSizes({ cols: 10, rows: 5 }, { cols: 8, rows: 3 }, grid)).toEqual([{ cols: 8, rows: 3 }]);
  });
});

describe("autoPlace", () => {
  it("puts the first widget of an empty page at 1,1 at its default size", () => {
    expect(autoPlace(grid, [], cpu.def, cpu.min)).toEqual({ col: 1, row: 1, cols: 3, rows: 2 });
  });

  it("shrinks into the only hole left", () => {
    // Everything but a 2×2 hole at columns 7–8, rows 1–2.
    const zones = [zone("a", 1, 1, 6, 3), zone("b", 7, 3, 2, 1)];
    expect(autoPlace(grid, zones, cpu.def, cpu.min)).toEqual({ col: 7, row: 1, cols: 2, rows: 2 });
  });

  it("counts blank zones as taken, and finds no room on a full page", () => {
    const full = [zone("a", 1, 1, 8, 2), zone("blank", 1, 3, 8, 1, BLANK_MODULE)];
    expect(autoPlace(grid, full, cpu.def, cpu.min)).toBeNull();
  });

  it("treats the cells of widgets pinned in place as taken on the pages they are drawn on (config v21)", () => {
    // three widgets pinned in a row across the top: a new one goes under them, never on them
    const pin = (id: string, col: number) => ({ id, at: { colStart: col, rowStart: 1, colSpan: 2, rowSpan: 1 }, show: "all" as const, visible: true, placement: { id: `${id}-w`, module: "Clock" } });
    const view = { ...grid, pageId: "a", placements: [], pinned: { items: [pin("p1", 1), pin("p2", 3), pin("p3", 5)] } } as unknown as ProfileView;
    expect(autoPlace(grid, takenOn(view), { cols: 2, rows: 1 }, { cols: 1, rows: 1 })).toEqual({ col: 7, row: 1, cols: 2, rows: 1 });
    expect(autoPlace(grid, takenOn(view), { cols: 3, rows: 1 }, { cols: 3, rows: 1 })).toEqual({ col: 1, row: 2, cols: 3, rows: 1 });
    // a move or a drawn box onto them is pushed off them
    expect(fitZoneRect({ col: 3, row: 1, cols: 2, rows: 1 }, takenOn(view), grid.cols, grid.rows)).toEqual({ col: 3, row: 2, cols: 2, rows: 1 });
    // a page that hides the pinned layer has its whole grid
    expect(autoPlace(grid, takenOn({ ...view, hidePinned: true }), { cols: 2, rows: 1 }, { cols: 1, rows: 1 })).toEqual({ col: 1, row: 1, cols: 2, rows: 1 });
    // and the stand-ins are never added to the page's own zones
    expect(view.placements).toEqual([]);
  });

  it("never goes below the min size", () => {
    const zones = [zone("a", 1, 1, 7, 3)];
    expect(autoPlace(grid, zones, { cols: 6, rows: 1 }, { cols: 2, rows: 1 })).toBeNull();
  });
});

describe("addGhost", () => {
  it("covers a blank zone under the pointer and says whether the item fits it", () => {
    const zones = [zone("z", 6, 2, 3, 2, BLANK_MODULE)];
    expect(addGhost({ col: 7, row: 3 }, grid, zones, cpu.def, cpu.min)).toEqual({
      kind: "fill",
      zoneId: "z",
      rect: { col: 6, row: 2, cols: 3, rows: 2 },
      ok: true,
    });
    expect(addGhost({ col: 7, row: 3 }, grid, zones, { cols: 6, rows: 1 }, { cols: 4, rows: 1 }).ok).toBe(false);
  });

  it("centres the default size on the pointer's column with its top on the pointer's row, kept in the grid", () => {
    expect(addGhost({ col: 4, row: 1 }, grid, [], cpu.def, cpu.min)).toEqual({ kind: "place", rect: { col: 3, row: 1, cols: 3, rows: 2 }, ok: true });
    expect(addGhost({ col: 8, row: 3 }, grid, [], cpu.def, cpu.min).rect).toEqual({ col: 6, row: 2, cols: 3, rows: 2 });
  });

  it("shrinks at the same anchor when blocked, and is invalid at the default size when nothing fits", () => {
    const zones = [zone("a", 1, 2, 8, 2)];
    expect(addGhost({ col: 4, row: 1 }, grid, zones, cpu.def, cpu.min)).toEqual({ kind: "place", rect: { col: 3, row: 1, cols: 3, rows: 1 }, ok: true });
    const full = [zone("a", 1, 1, 8, 3)];
    expect(addGhost({ col: 4, row: 1 }, grid, full, cpu.def, cpu.min)).toMatchObject({ ok: false, rect: { cols: 3, rows: 2 } });
  });
});
