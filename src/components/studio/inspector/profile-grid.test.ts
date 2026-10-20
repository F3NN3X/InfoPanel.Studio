import { describe, expect, it } from "vitest";
import type { ProfileView, Placement } from "@/lib/layout";
import { stepGrid } from "./profile-grid";

const zone = (id: string, extra: Partial<Placement>): Placement => ({
  id,
  module: "SystemOverview",
  colStart: 1,
  rowStart: 1,
  colSpan: 1,
  rowSpan: 1,
  visible: true,
  ...extra,
});

const profile = (placements: Placement[], extra: Partial<ProfileView> = {}): ProfileView => ({
  id: "p",
  name: "p",
  width: 1920,
  height: 1080,
  cols: 12,
  rows: 6,
  fit: "scroll",
  placements,
  ...extra,
});

describe("stepGrid", () => {
  it("refuses to shrink under a zone", () => {
    const p = profile([zone("a", { colStart: 10, colSpan: 3 }), zone("b", { rowStart: 5, rowSpan: 2 })]);
    expect(stepGrid(p, "cols", -1)).toBeNull();
    expect(stepGrid(p, "rows", -1)).toBeNull();
    expect(stepGrid(p, "cols", 1)?.cols).toBe(13);
  });

  it("refuses to shrink under a zone on another page (the grid is shared)", () => {
    const p = profile([zone("a", { colStart: 1, colSpan: 2 })]);
    const other = [zone("b", { rowStart: 4, rowSpan: 3 })];
    expect(stepGrid(p, "rows", -1, other)).toBeNull();
    expect(stepGrid(p, "rows", -1)?.rows).toBe(5);
  });
});
