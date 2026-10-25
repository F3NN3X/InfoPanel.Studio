/**
 * How a profile template fits a canvas size. Every template is designed at 480 × 320 and lays out
 * by rules, not per pixel size:
 * - the canvas's aspect picks one of three shapes: wide (2.4:1 or wider, as 1280 × 480 and
 *   1920 × 480), tall (narrower than square), or standard (everything between, as 480 × 320,
 *   800 × 480, 1024 × 600 and 1920 × 1080);
 * - the template gives one grid per shape (tall falls back to the standard grid turned on its
 *   side), and the grid's cells are sized from the canvas, so any size of a shape uses the same grid;
 * - margins, gaps, strokes and type scale by `u`, the 480 × 320 design fitted into the canvas.
 * Each tile then sizes its content from its own box.
 */

export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type Shape = "standard" | "wide" | "tall";

export const DESIGN = { width: 480, height: 320 } as const;

export interface Frame {
  width: number;
  height: number;
  shape: Shape;
  /** The design's scale on this canvas: 1 at 480 × 320, 1.5 at 1920 × 480. */
  u: number;
}

/** The aspect from which a canvas lays out as a wide strip. */
export const WIDE_FROM = 2.4;

export function frameOf(width: number, height: number): Frame {
  const aspect = width / height;
  const shape: Shape = aspect >= WIDE_FROM ? "wide" : aspect < 1 ? "tall" : "standard";
  return { width, height, shape, u: Math.min(width / DESIGN.width, height / DESIGN.height) };
}

/** A cell of a grid: column, row, and how many of each it spans. */
export type Cell = readonly [col: number, row: number, cols: number, rows: number];

export interface Grid {
  cols: number;
  rows: number;
  /** One cell per tile, in the template's tile order; a shape that has fewer cells drops the tiles at the end. */
  cells: readonly Cell[];
}

export interface Grids {
  standard: Grid;
  wide: Grid;
  tall?: Grid;
}

/** The grid on its side: columns become rows. */
export const transpose = (g: Grid): Grid => ({ cols: g.rows, rows: g.cols, cells: g.cells.map(([c, r, cs, rs]) => [r, c, rs, cs] as const) });

export const gridFor = (grids: Grids, shape: Shape): Grid => (shape === "tall" ? (grids.tall ?? transpose(grids.standard)) : grids[shape]);

/**
 * The tiles' boxes on the canvas: the grid inside a `margin`, `gap` between cells (both in design
 * px, scaled by `u`), edges on whole pixels so neighbours never overlap.
 */
export function tiles(frame: Frame, grid: Grid, margin: number, gap: number): Box[] {
  const m = Math.round(margin * frame.u);
  const g = Math.round(gap * frame.u);
  const colW = (frame.width - 2 * m - (grid.cols - 1) * g) / grid.cols;
  const rowH = (frame.height - 2 * m - (grid.rows - 1) * g) / grid.rows;
  const edge = (i: number, size: number) => Math.round(m + i * (size + g));
  return grid.cells.map(([c, r, cs, rs]) => {
    const x = edge(c, colW);
    const y = edge(r, rowH);
    return { x, y, width: Math.round(edge(c + cs, colW) - g) - x, height: Math.round(edge(r + rs, rowH) - g) - y };
  });
}

/** A box shrunk by `p` px on every side. */
export const inset = (b: Box, p: number): Box => ({ x: b.x + p, y: b.y + p, width: Math.max(1, b.width - 2 * p), height: Math.max(1, b.height - 2 * p) });

/** The largest square centred in a box, `fill` (0–1) of its shorter side. */
export function square(b: Box, fill = 1): Box {
  const s = Math.max(1, Math.round(Math.min(b.width, b.height) * fill));
  return { x: Math.round(b.x + (b.width - s) / 2), y: Math.round(b.y + (b.height - s) / 2), width: s, height: s };
}

/** A box split across into parts by weight, `gap` px between. */
export function split(b: Box, weights: readonly number[], gap: number, across: boolean): Box[] {
  const total = weights.reduce((a, w) => a + w, 0);
  const room = (across ? b.width : b.height) - gap * (weights.length - 1);
  let at = 0;
  return weights.map((w) => {
    const size = (room * w) / total;
    const start = Math.round(at);
    const end = Math.round(at + size);
    at += size + gap;
    return across ? { x: b.x + start, y: b.y, width: end - start, height: b.height } : { x: b.x, y: b.y + start, width: b.width, height: end - start };
  });
}
