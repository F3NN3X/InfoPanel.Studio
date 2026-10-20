import { describe, expect, it } from "vitest";
import type { Placement } from "@/lib/layout";
import {
  clampZoneRect,
  enforceMinSize,
  firstFreeRect,
  fitZoneRect,
  moveZoneSet,
  nudgeZone,
  rectsOverlap,
  resizeZone,
  sortZones,
  zoneFits,
} from "./zone-geometry";

const zone = (
  id: string,
  colStart: number,
  rowStart: number,
  colSpan: number,
  rowSpan: number,
  visible = true
): Placement => ({ id, module: "m", colStart, rowStart, colSpan, rowSpan, visible });

describe("rectsOverlap", () => {
  it("detects shared cells and ignores edge-touching boxes", () => {
    const o = zone("a", 3, 3, 2, 2);
    expect(rectsOverlap({ col: 4, row: 4, cols: 2, rows: 2 }, o)).toBe(true);
    expect(rectsOverlap({ col: 1, row: 3, cols: 2, rows: 2 }, o)).toBe(false);
    expect(rectsOverlap({ col: 3, row: 5, cols: 2, rows: 1 }, o)).toBe(false);
  });
});

describe("clampZoneRect", () => {
  it("clamps position and size into the grid", () => {
    expect(clampZoneRect({ col: 0, row: -2, cols: 3, rows: 2 }, [], 12, 6)).toEqual({
      col: 1,
      row: 1,
      cols: 3,
      rows: 2,
    });
    expect(clampZoneRect({ col: 11, row: 6, cols: 4, rows: 3 }, [], 12, 6)).toEqual({
      col: 9,
      row: 4,
      cols: 4,
      rows: 3,
    });
    expect(clampZoneRect({ col: 1, row: 1, cols: 40, rows: 0 }, [], 12, 6)).toEqual({
      col: 1,
      row: 1,
      cols: 12,
      rows: 1,
    });
  });

  it("pushes the box out of an overlapped zone", () => {
    const others = [zone("a", 5, 1, 2, 1)];
    const r = clampZoneRect({ col: 4, row: 1, cols: 2, rows: 1 }, others, 12, 6);
    expect(r).toEqual({ col: 3, row: 1, cols: 2, rows: 1 });
    expect(rectsOverlap(r, others[0])).toBe(false);
  });

  it("never overlaps when any free spot exists", () => {
    const others = [zone("a", 1, 1, 3, 1), zone("b", 1, 2, 1, 2), zone("c", 3, 2, 1, 2)];
    const r = clampZoneRect({ col: 2, row: 1, cols: 1, rows: 1 }, others, 3, 3);
    expect(r).toEqual({ col: 2, row: 2, cols: 1, rows: 1 });
    expect(others.some((o) => rectsOverlap(r, o))).toBe(false);
  });
});

describe("fitZoneRect", () => {

  it("signals failure when no free spot of that size exists", () => {
    const others = [zone("a", 1, 1, 2, 1), zone("b", 3, 1, 2, 1)];
    expect(fitZoneRect({ col: 2, row: 1, cols: 2, rows: 1 }, others, 4, 1)).toBeNull();
    // The zone being moved doesn't block itself.
    expect(fitZoneRect({ col: 2, row: 1, cols: 2, rows: 1 }, others, 4, 1, "a")).toEqual({
      col: 1,
      row: 1,
      cols: 2,
      rows: 1,
    });
  });
});

describe("zoneFits / nudgeZone", () => {
  const self = zone("s", 2, 2, 2, 1);

  it("checks the grid bounds and other visible zones", () => {
    expect(zoneFits({ col: 0, row: 1, cols: 1, rows: 1 }, [], 4, 4)).toBe(false);
    expect(zoneFits({ col: 4, row: 4, cols: 1, rows: 1 }, [], 4, 4)).toBe(true);
    expect(zoneFits({ col: 4, row: 4, cols: 2, rows: 1 }, [], 4, 4)).toBe(false);
    expect(zoneFits({ col: 1, row: 1, cols: 2, rows: 2 }, [self], 4, 4)).toBe(false);
    expect(zoneFits({ col: 1, row: 1, cols: 2, rows: 2 }, [self], 4, 4, "s")).toBe(true);
  });

  it("is blocked by a neighbour or the grid edge (no push elsewhere)", () => {
    const placements = [self, zone("n", 4, 1, 1, 4)];
    expect(nudgeZone(self, { cols: 1, rows: 0 }, placements, 4, 4)).toBeNull();
    expect(nudgeZone(self, { cols: -2, rows: 0 }, [self], 4, 4)).toBeNull();
    // A hidden neighbour doesn't block.
    expect(nudgeZone(self, { cols: 1, rows: 0 }, [self, zone("h", 4, 1, 1, 4, false)], 4, 4)).not.toBeNull();
  });
});

describe("firstFreeRect", () => {
  it("returns the first row-major slot where the box fits", () => {
    const placements = [zone("a", 1, 1, 3, 1)];
    expect(firstFreeRect(4, 2, { cols: 2, rows: 1 }, placements)).toEqual({
      col: 1,
      row: 2,
      cols: 2,
      rows: 1,
    });
    expect(firstFreeRect(4, 2, { cols: 1, rows: 1 }, placements)).toEqual({
      col: 4,
      row: 1,
      cols: 1,
      rows: 1,
    });
  });

  it("returns null when the grid is full", () => {
    const placements = [zone("a", 1, 1, 4, 2)];
    expect(firstFreeRect(4, 2, { cols: 1, rows: 1 }, placements)).toBeNull();
  });
});

describe("sortZones", () => {
  it("orders by row, then column", () => {
    const placements = [zone("c", 1, 3, 1, 1), zone("b", 5, 1, 1, 1), zone("a", 1, 1, 2, 2)];
    expect(sortZones(placements).map((p) => p.id)).toEqual(["a", "b", "c"]);
  });

});

describe("resizeZone", () => {
  const self = zone("s", 1, 1, 2, 2);

  it("grows from the top-left corner into free cells", () => {
    expect(resizeZone(self, { cols: 3, rows: 2 }, [self], 12, 6)).toEqual({
      col: 1,
      row: 1,
      cols: 3,
      rows: 2,
    });
  });

  it("blocks a grow into a neighbour or past the grid", () => {
    const placements = [self, zone("n", 3, 1, 2, 2)];
    expect(resizeZone(self, { cols: 3, rows: 2 }, placements, 12, 6)).toBeNull();
    expect(resizeZone(self, { cols: 2, rows: 3 }, [self], 12, 2)).toBeNull();
  });

});

describe("moveZoneSet", () => {
  const zones = [zone("a", 1, 1, 2, 1), zone("b", 3, 1, 2, 1), zone("c", 1, 3, 2, 2)];

  it("moves every zone of the set by the same delta", () => {
    expect(moveZoneSet(zones, ["a", "b"], { cols: 0, rows: 1 }, 12, 6)).toEqual({
      a: { col: 1, row: 2, cols: 2, rows: 1 },
      b: { col: 3, row: 2, cols: 2, rows: 1 },
    });
  });

  it("blocks the whole move when one zone would leave the grid", () => {
    expect(moveZoneSet(zones, ["a", "b"], { cols: -1, rows: 0 }, 12, 6)).toBeNull();
    expect(moveZoneSet(zones, ["a", "b"], { cols: 9, rows: 0 }, 12, 6)).toBeNull();
  });

  it("blocks the whole move when one zone would overlap a zone outside the set", () => {
    expect(moveZoneSet(zones, ["a", "b"], { cols: 0, rows: 2 }, 12, 6)).toBeNull();
  });

});

describe("enforceMinSize", () => {
  const z = zone("a", 3, 3, 4, 3);

  it("keeps a right/bottom-edge resize at the minimum, anchored top-left", () => {
    expect(enforceMinSize({ col: 3, row: 3, cols: 1, rows: 1 }, z, { cols: 2, rows: 2 })).toEqual({
      col: 3,
      row: 3,
      cols: 2,
      rows: 2,
    });
  });

});

describe("resizeZone with a minimum", () => {
  it("blocks shrinking below the minimum and allows growing", () => {
    const z = zone("a", 1, 1, 2, 2);
    expect(resizeZone(z, { cols: 1, rows: 2 }, [z], 12, 6, { cols: 2, rows: 1 })).toBeNull();
    expect(resizeZone(z, { cols: 2, rows: 1 }, [z], 12, 6, { cols: 2, rows: 1 })).toEqual({
      col: 1,
      row: 1,
      cols: 2,
      rows: 1,
    });
    expect(resizeZone(z, { cols: 3, rows: 2 }, [z], 12, 6, { cols: 4, rows: 4 })).toEqual({
      col: 1,
      row: 1,
      cols: 3,
      rows: 2,
    });
  });
});
