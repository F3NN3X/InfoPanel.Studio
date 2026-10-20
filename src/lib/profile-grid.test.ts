import { describe, expect, it } from "vitest";
import {
  DEFAULT_GRID_GAP,
  cellAt,
  normalizeSpacing,
  profileGap,
  profilePadding,
  trackPitch,
  trackSize,
  zoneBox,
} from "./profile-grid";

describe("profileGap / profilePadding", () => {
  it("defaults to today's spacing per mode", () => {
    expect(profileGap({ fit: "fill" })).toBe(DEFAULT_GRID_GAP);
    expect(DEFAULT_GRID_GAP).toBe(12);
    expect(profilePadding({ fit: "fill" }, true)).toBe(0);
    expect(profilePadding({ fit: "fill" }, false)).toBe(12);
    expect(profilePadding({ fit: "scroll" }, true)).toBe(24);
    expect(profilePadding({ fit: "scroll" }, false)).toBe(24);
  });

});

describe("normalizeSpacing", () => {
  it("keeps whole px in range and drops the rest", () => {
    expect(normalizeSpacing(12.4)).toBe(12);
    expect(normalizeSpacing(-3)).toBe(0);
    expect(normalizeSpacing(9999)).toBe(200);
    expect(normalizeSpacing("12")).toBeUndefined();
    expect(normalizeSpacing(Number.NaN)).toBeUndefined();
    expect(normalizeSpacing(undefined)).toBeUndefined();
  });
});

describe("track math", () => {
  // 4 columns over 1000 px.
  it.each([
    [0, 250, 250],
    [12, 241, 253],
    [24, 232, 256],
  ])("gap %i: size %d, pitch %d", (gap, size, pitch) => {
    expect(trackSize(1000, 4, gap)).toBe(size);
    expect(trackPitch(1000, 4, gap)).toBe(pitch);
  });

});

describe("cellAt", () => {
  const grid = { width: 1000, height: 400 };

  it("maps points to cells with no gap", () => {
    expect(cellAt(0, 0, grid, 4, 2, 0)).toEqual({ col: 1, row: 1 });
    expect(cellAt(249, 199, grid, 4, 2, 0)).toEqual({ col: 1, row: 1 });
    expect(cellAt(250, 200, grid, 4, 2, 0)).toEqual({ col: 2, row: 2 });
    expect(cellAt(999, 399, grid, 4, 2, 0)).toEqual({ col: 4, row: 2 });
  });

  it("returns null outside the grid", () => {
    expect(cellAt(-1, 0, grid, 4, 2, 12)).toBeNull();
    expect(cellAt(0, 500, grid, 4, 2, 12)).toBeNull();
    expect(cellAt(0, 0, { width: 0, height: 0 }, 4, 2, 12)).toBeNull();
  });
});

describe("zoneBox", () => {
  const track = { width: 100, height: 50 };

  it.each([0, 12, 24])("lines a 2×2 zone at C2 R2 up with the tracks (gap %i)", (gap) => {
    expect(zoneBox({ col: 2, row: 2, cols: 2, rows: 2 }, track, gap)).toEqual({
      left: 100 + gap,
      top: 50 + gap,
      width: 200 + gap,
      height: 100 + gap,
    });
  });

});
