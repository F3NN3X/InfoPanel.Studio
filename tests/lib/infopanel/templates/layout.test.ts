import { describe, expect, it } from "vitest";
import { SIZE_PRESETS } from "@/components/infopanel/new-profile-dialog";
import { TEMPLATES } from "@/lib/infopanel/templates/catalog.ts";
import { frameOf, gridFor, tiles, transpose, type Box } from "@/lib/infopanel/templates/layout.ts";

const overlap = (a: Box, b: Box) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

describe("template size rules", () => {
  it.each([
    [480, 320, "standard", 1],
    [800, 480, "standard", 1.5],
    [1920, 1080, "standard", 3.375],
    [1280, 480, "wide", 1.5],
    [1920, 480, "wide", 1.5],
    [480, 1920, "tall", 1],
    [600, 250, "wide", 0.78125],
  ])("%i × %i is %s at %f", (w, h, shape, u) => {
    expect(frameOf(w, h)).toEqual({ width: w, height: h, shape, u });
  });

  it("a tall canvas without its own grid uses the standard one on its side", () => {
    const g = { cols: 3, rows: 2, cells: [[0, 0, 2, 1], [2, 0, 1, 1]] as const };
    expect(transpose(g)).toEqual({ cols: 2, rows: 3, cells: [[0, 0, 1, 2], [0, 2, 1, 1]] });
    expect(gridFor({ standard: g, wide: g }, "tall")).toEqual(transpose(g));
  });

  it("cuts the grid into whole-pixel cells inside the margin, the gap between", () => {
    const boxes = tiles(frameOf(480, 320), { cols: 3, rows: 2, cells: [[0, 0, 1, 1], [1, 0, 2, 1], [0, 1, 3, 1]] }, 8, 8);
    expect(boxes).toEqual([
      { x: 8, y: 8, width: 149, height: 148 },
      { x: 165, y: 8, width: 307, height: 148 },
      { x: 8, y: 164, width: 464, height: 148 },
    ]);
  });

  // Every template at every preset and a portrait size: one cell per tile, all on the canvas, none overlapping.
  const sizes = SIZE_PRESETS;
  it.each(TEMPLATES.flatMap((t) => sizes.map((s) => [t.id, s.width, s.height, t] as const)))("%s fits %i × %i", (_, width, height, t) => {
    const frame = frameOf(width, height);
    const grid = gridFor(t.grids, frame.shape);
    expect(grid.cells.length).toBeLessThanOrEqual(t.tiles.length);
    expect(grid.cells.length).toBeGreaterThan(0);
    const boxes = tiles(frame, grid, t.margin, t.gap);
    for (const b of boxes) {
      expect(b.x).toBeGreaterThanOrEqual(0);
      expect(b.y).toBeGreaterThanOrEqual(0);
      expect(b.x + b.width).toBeLessThanOrEqual(width);
      expect(b.y + b.height).toBeLessThanOrEqual(height);
      expect(b.width).toBeGreaterThan(0);
    }
    boxes.forEach((a, i) => boxes.slice(i + 1).forEach((b) => expect(overlap(a, b)).toBe(false)));
  });
});
