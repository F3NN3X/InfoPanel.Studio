import { BLANK_MODULE, type Placement } from "@/lib/layout";
import { firstFreeRect, zoneFits, type ZoneRect } from "./zone-geometry";

/** Where the Add panel puts things (handoff SPEC §7): auto-place with shrink-to-fit, and the drag ghost. */

export interface Size {
  cols: number;
  rows: number;
}

export interface Grid {
  cols: number;
  rows: number;
}

/**
 * Every size from the default down to the min, largest area first (equal areas: wider first). Both are kept
 * inside the grid; none when even the min does not fit it.
 */
export function shrinkSizes(def: Size, min: Size, grid: Grid): Size[] {
  const top = { cols: Math.min(grid.cols, def.cols), rows: Math.min(grid.rows, def.rows) };
  const sizes: Size[] = [];
  for (let cols = top.cols; cols >= min.cols; cols--) for (let rows = top.rows; rows >= min.rows; rows--) sizes.push({ cols, rows });
  return sizes.sort((a, b) => b.cols * b.rows - a.cols * a.rows || b.cols - a.cols);
}

/** The first free box (rows top to bottom, then columns) at the largest size that fits; null = no room. */
export function autoPlace(grid: Grid, placements: Placement[], def: Size, min: Size): ZoneRect | null {
  for (const size of shrinkSizes(def, min, grid)) {
    const rect = firstFreeRect(grid.cols, grid.rows, size, placements);
    if (rect) return rect;
  }
  return null;
}

/** A cell in px for a widget placed on a Free page: the Add preview's native cell (add-preview.tsx). */
export const FREE_CELL_PX = 150;
export const FREE_GAP_PX = 10;

/**
 * A widget's default size on a Free page (one-editor SPEC §5.3): its cells at the native cell size, scaled down with
 * the shape kept when that is larger than the canvas (with a 5% margin).
 */
export function freeSize(size: Size, canvas: { width: number; height: number }): { w: number; h: number } {
  const w = size.cols * FREE_CELL_PX + (size.cols - 1) * FREE_GAP_PX;
  const h = size.rows * FREE_CELL_PX + (size.rows - 1) * FREE_GAP_PX;
  const k = Math.min(1, (canvas.width * 0.95) / w, (canvas.height * 0.95) / h);
  return { w: Math.max(1, Math.round(w * k)), h: Math.max(1, Math.round(h * k)) };
}

/** The visible blank zone covering a cell. */
export function blankZoneAt(placements: Placement[], cell: { col: number; row: number }): Placement | undefined {
  return placements.find(
    (p) =>
      p.visible !== false &&
      p.module === BLANK_MODULE &&
      cell.col >= p.colStart &&
      cell.col < p.colStart + p.colSpan &&
      cell.row >= p.rowStart &&
      cell.row < p.rowStart + p.rowSpan
  );
}

/** A box of `size` centred horizontally on the pointer's cell, its top on the pointer's row, kept in the grid. */
function anchored(cell: { col: number; row: number }, size: Size, grid: Grid): ZoneRect {
  const clamp = (n: number, max: number) => Math.max(1, Math.min(max, n));
  return {
    col: clamp(cell.col - Math.floor((size.cols - 1) / 2), grid.cols + 1 - size.cols),
    row: clamp(cell.row, grid.rows + 1 - size.rows),
    cols: size.cols,
    rows: size.rows,
  };
}

export type Ghost =
  /** Over a blank zone: it covers the zone; `ok` = the item fits in it. */
  | { kind: "fill"; rect: ZoneRect; zoneId: string; ok: boolean }
  /** Elsewhere: the largest size that is free at the pointer, else the default size and not ok. */
  | { kind: "place"; rect: ZoneRect; ok: boolean };

/** The drag ghost for a pointer over `cell` (SPEC §7.3). */
export function addGhost(cell: { col: number; row: number }, grid: Grid, placements: Placement[], def: Size, min: Size): Ghost {
  const zone = blankZoneAt(placements, cell);
  if (zone) {
    const rect = { col: zone.colStart, row: zone.rowStart, cols: zone.colSpan, rows: zone.rowSpan };
    return { kind: "fill", rect, zoneId: zone.id, ok: min.cols <= rect.cols && min.rows <= rect.rows };
  }
  for (const size of shrinkSizes(def, min, grid)) {
    const rect = anchored(cell, size, grid);
    if (zoneFits(rect, placements, grid.cols, grid.rows)) return { kind: "place", rect, ok: true };
  }
  const size = { cols: Math.min(grid.cols, def.cols), rows: Math.min(grid.rows, def.rows) };
  return { kind: "place", rect: anchored(cell, size, grid), ok: false };
}
