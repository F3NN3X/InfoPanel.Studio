import { describe, expect, it } from "vitest";
import type { Placement } from "@/lib/layout";
import { alignZones, arrangeZones, distributeZones, matchZoneSize, zonesInRect } from "@/components/studio/zone-arrange";

const zone = (id: string, colStart: number, rowStart: number, colSpan: number, rowSpan: number, visible = true): Placement => ({
  id,
  module: "m",
  colStart,
  rowStart,
  colSpan,
  rowSpan,
  visible,
});

describe("alignZones", () => {
  const stack = [zone("a", 2, 1, 2, 1), zone("b", 5, 3, 3, 1), zone("c", 1, 5, 1, 1)];

  it("aligns on the left edge of the box around them, moving only what differs", () => {
    const r = alignZones(stack, ["a", "b", "c"], "left", 12, 8)!;
    expect(r.a).toEqual({ col: 1, row: 1, cols: 2, rows: 1 });
    expect(r.b.col).toBe(1);
    expect(r.c).toBeUndefined();
  });

  it("aligns right and bottom flush with the outer edge", () => {
    const r = alignZones(stack, ["a", "b", "c"], "right", 12, 8)!;
    expect(r.a.col + r.a.cols).toBe(8);
    expect(r.c.col).toBe(7);
    const b = alignZones(stack, ["a", "b", "c"], "bottom", 12, 8)!;
    expect(b.a.row).toBe(5);
  });

  it("refuses when the zones would land on each other", () => {
    const row = [zone("a", 1, 1, 2, 2), zone("b", 4, 1, 2, 2)];
    expect(alignZones(row, ["a", "b"], "left", 8, 4)).toBeNull();
    expect(alignZones(row, ["a", "b"], "top", 8, 4)).toBeNull();
  });

  it("refuses a result that runs into a zone outside the selection", () => {
    const zones = [zone("a", 1, 1, 2, 1), zone("b", 5, 3, 2, 1), zone("wall", 1, 3, 2, 1)];
    expect(alignZones(zones, ["a", "b"], "left", 8, 4)).toBeNull();
  });

  it("does nothing for fewer than two zones or when already aligned", () => {
    expect(alignZones(stack, ["a"], "left", 12, 8)).toBeNull();
    expect(alignZones([zone("a", 1, 1, 1, 1), zone("b", 1, 3, 2, 1)], ["a", "b"], "left", 8, 4)).toBeNull();
  });
});

describe("matchZoneSize", () => {
  const zones = [zone("a", 1, 1, 4, 2), zone("b", 1, 4, 2, 1), zone("c", 7, 4, 1, 1)];

  it("gives each zone the primary's width, keeping its corner", () => {
    const r = matchZoneSize(zones, ["a", "b"], "a", "width", 8, 6)!;
    expect(r.b).toEqual({ col: 1, row: 4, cols: 4, rows: 1 });
    expect(r.a).toBeUndefined();
  });

  it("stays inside the grid and off other zones", () => {
    expect(matchZoneSize(zones, ["a", "c"], "a", "width", 8, 6)).toBeNull(); // c would span columns 7 to 10
    const hit = [zone("a", 1, 1, 1, 3), zone("b", 3, 1, 1, 1), zone("wall", 3, 2, 1, 1)];
    expect(matchZoneSize(hit, ["a", "b"], "a", "height", 4, 4)).toBeNull();
  });

  it("is blocked when the primary is under a zone's minimum size", () => {
    const wide = [zone("a", 1, 1, 1, 1), zone("b", 1, 3, 4, 1)];
    expect(matchZoneSize(wide, ["a", "b"], "a", "width", 8, 4, () => ({ cols: 2, rows: 1 }))).toBeNull();
  });
});

describe("distributeZones", () => {
  it("spreads three zones with equal gaps, first and last fixed", () => {
    const zones = [zone("a", 1, 1, 2, 1), zone("b", 3, 1, 2, 1), zone("c", 9, 1, 2, 1)];
    const r = distributeZones(zones, ["a", "b", "c"], "horizontal", 10, 2)!;
    expect(r.b.col).toBe(5);
    expect(r.a).toBeUndefined();
    expect(r.c).toBeUndefined();
  });

  it("shares leftover cells between gaps without overlap, keeping the end zones", () => {
    const zones = [zone("a", 1, 1, 1, 1), zone("b", 2, 1, 1, 1), zone("c", 3, 1, 1, 1), zone("d", 8, 1, 1, 1)];
    const r = distributeZones(zones, ["a", "b", "c", "d"], "horizontal", 8, 2)!;
    const cols = ["a", "b", "c", "d"].map((id) => r[id]?.col ?? zones.find((z) => z.id === id)!.colStart);
    expect(cols).toEqual([1, 3, 5, 8]);
  });

  it("works down the grid", () => {
    const zones = [zone("a", 1, 1, 1, 1), zone("b", 1, 2, 1, 1), zone("c", 1, 7, 1, 1)];
    expect(distributeZones(zones, ["a", "b", "c"], "vertical", 2, 7)!.b.row).toBe(4);
  });

  it("needs three zones and room", () => {
    const two = [zone("a", 1, 1, 1, 1), zone("b", 4, 1, 1, 1)];
    expect(distributeZones(two, ["a", "b"], "horizontal", 6, 2)).toBeNull();
    const tight = [zone("a", 1, 1, 2, 1), zone("b", 2, 2, 2, 1), zone("c", 3, 3, 2, 1)];
    expect(distributeZones(tight, ["a", "b", "c"], "horizontal", 6, 4)).toBeNull();
  });

  it("refuses a spread onto a zone outside the selection", () => {
    const zones = [zone("a", 1, 1, 1, 1), zone("b", 2, 1, 1, 1), zone("c", 7, 1, 1, 1), zone("wall", 4, 1, 1, 1)];
    expect(distributeZones(zones, ["a", "b", "c"], "horizontal", 8, 2)).toBeNull();
  });
});

describe("arrangeZones and zonesInRect", () => {
  it("dispatches an op", () => {
    const zones = [zone("a", 2, 1, 1, 1), zone("b", 4, 3, 1, 1)];
    expect(arrangeZones("align-left", zones, ["a", "b"], "b", 6, 4)!.b.col).toBe(2);
  });

  it("selects the visible zones a box touches", () => {
    const zones = [zone("a", 1, 1, 2, 2), zone("b", 5, 5, 1, 1), zone("h", 2, 2, 1, 1, false)];
    expect(zonesInRect(zones, { col: 2, row: 2, cols: 2, rows: 2 })).toEqual(["a"]);
  });
});
