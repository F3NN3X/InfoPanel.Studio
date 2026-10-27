/**
 * What a drag, a resize or a key press does to parts of the page model (Edit v3 SPEC §7.3, §14), as model ops: a
 * widget always lands on cells; an item or element snaps to cells, or is placed freely to the pixel for the gesture
 * that holds Alt (with the page's Snap items off the other way round). Every op is absolute, from where the parts were
 * when the gesture started, so a drag can apply its latest ops again and again inside one undo step. Pure.
 */
import { boxOf, cellsOverlap, nearestCells, trackOf, type CellBox, type PageGrid, type PageOp, type PartNode, type PartPlace, type PixelBox } from "./model.ts";

/** A resize handle: the edges it moves. */
export type Handle = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";

/** Whether a gesture on an item places it freely: Alt held while items snap, or not held while they don't. */
export const placesFreely = (snapItems: boolean, alt: boolean): boolean => snapItems === alt;

/** A part where a gesture started: its node as it was. */
export type Start = Pick<PartNode, "id" | "kind" | "place" | "locked">;

const shifted = (b: PixelBox, dx: number, dy: number): PixelBox => ({ ...b, x: b.x + dx, y: b.y + dy });

/** The ops that move parts by a pointer delta (page px) from where they started; locked parts stay. */
export function moveOps(grid: PageGrid, starts: readonly Start[], dx: number, dy: number, free: boolean): PageOp[] {
  return starts.flatMap((s): PageOp[] => {
    if (s.locked) return [];
    const box = shifted(boxOf(grid, s.place), dx, dy);
    if (free && s.kind !== "widget") return [{ type: "move", id: s.id, to: { x: Math.round(box.x), y: Math.round(box.y) } }];
    const cell = nearestCells(grid, box);
    return [{ type: "move", id: s.id, to: { col: cell.col, row: cell.row } }];
  });
}

/** A box resized by dragging `handle` by a delta: the opposite edges stay, at least 1 px each way. */
export function resizedBox(box: PixelBox, handle: Handle, dx: number, dy: number): PixelBox {
  const out = { ...box };
  if (handle.includes("e")) out.w = Math.max(1, box.w + dx);
  if (handle.includes("s")) out.h = Math.max(1, box.h + dy);
  if (handle.includes("w")) {
    out.w = Math.max(1, box.w - dx);
    out.x = box.x + box.w - out.w;
  }
  if (handle.includes("n")) {
    out.h = Math.max(1, box.h - dy);
    out.y = box.y + box.h - out.h;
  }
  return out;
}

/** The ops that resize one part by dragging `handle`: to the pixel when free, else to the cells nearest the box. */
export function resizeOps(grid: PageGrid, start: Start, handle: Handle, dx: number, dy: number, free: boolean): PageOp[] {
  if (start.locked) return [];
  const box = resizedBox(boxOf(grid, start.place), handle, dx, dy);
  if (free && start.kind !== "widget") {
    const px = { x: Math.round(box.x), y: Math.round(box.y), w: Math.round(box.w), h: Math.round(box.h) };
    return [
      { type: "move", id: start.id, to: { x: px.x, y: px.y } },
      { type: "resize", id: start.id, to: { w: Math.max(1, px.w), h: Math.max(1, px.h) } },
    ];
  }
  const cell = nearestCells(grid, box);
  return [
    { type: "move", id: start.id, to: { col: cell.col, row: cell.row } },
    { type: "resize", id: start.id, to: { cols: cell.cols, rows: cell.rows } },
  ];
}

/**
 * Widgets moved by whole cells (SPEC §7.3, decision Q3): their new cells, or null when one would leave the grid or
 * land on a widget that isn't moving, so the move is refused and they stay where they were.
 */
export function moveCells(grid: Pick<PageGrid, "cols" | "rows">, moving: readonly CellBox[], others: readonly CellBox[], dc: number, dr: number): CellBox[] | null {
  const out = moving.map((c) => ({ ...c, col: c.col + dc, row: c.row + dr }));
  const inside = out.every((c) => c.col >= 1 && c.row >= 1 && c.col + c.cols - 1 <= grid.cols && c.row + c.rows - 1 <= grid.rows);
  return inside && !out.some((c) => others.some((o) => cellsOverlap(c, o))) ? out : null;
}

/** Whether a widget fits on `cell`: inside the grid and on no other widget's cells. */
export const cellFree = (grid: Pick<PageGrid, "cols" | "rows">, cell: CellBox, others: readonly CellBox[]): boolean => moveCells(grid, [cell], others, 0, 0) !== null;

/**
 * Where a widget added at a point goes (SPEC §7.4, Q3): its span with the point in its first cell, kept inside the
 * grid; when other widgets sit there, the free cells nearest it; null when no cells are free for that span.
 */
export function cellsForAdd(grid: PageGrid, at: { x: number; y: number } | null, span: { cols: number; rows: number }, others: readonly CellBox[]): CellBox | null {
  const cols = Math.max(1, Math.min(grid.cols, span.cols));
  const rows = Math.max(1, Math.min(grid.rows, span.rows));
  const near = at ? nearestCells(grid, { x: at.x, y: at.y, w: 1, h: 1 }, true) : { col: 1, row: 1 };
  const want = { col: Math.min(near.col, grid.cols - cols + 1), row: Math.min(near.row, grid.rows - rows + 1), cols, rows };
  if (cellFree(grid, want, others)) return want;
  let best: CellBox | null = null;
  let dist = Infinity;
  for (let row = 1; row + rows - 1 <= grid.rows; row++) {
    for (let col = 1; col + cols - 1 <= grid.cols; col++) {
      const c = { col, row, cols, rows };
      if (!cellFree(grid, c, others)) continue;
      // A click (no point) takes the first free cells in reading order.
      const d = at ? (col - want.col) ** 2 + (row - want.row) ** 2 : (row - 1) * grid.cols + col;
      if (d < dist) [best, dist] = [c, d];
    }
  }
  return best;
}

/**
 * Where an item or element added at a point goes (SPEC §7.4): its box centred there, snapped to the cells nearest
 * it, or placed freely to the pixel (`free`: Alt on the drop, or the page's Snap items off).
 */
export function placeForAdd(grid: PageGrid, at: { x: number; y: number }, size: { w: number; h: number }, free: boolean): PartPlace {
  const w = Math.max(1, Math.round(size.w));
  const h = Math.max(1, Math.round(size.h));
  const box = { x: Math.round(at.x - w / 2), y: Math.round(at.y - h / 2), w, h };
  return free ? { px: box } : { cell: nearestCells(grid, box) };
}

/** A key press on the selection (SPEC §14): which arrow, and Alt and Shift as held. */
export interface ArrowKey {
  dx: -1 | 0 | 1;
  dy: -1 | 0 | 1;
  alt: boolean;
  shift: boolean;
}

/**
 * The ops an arrow key makes: Arrows move a part one cell (a placed-freely item one cell's pitch in px), Shift+Arrows
 * resize it one cell, Alt+Arrows nudge an item 1 px (it becomes placed freely) and Alt+Shift+Arrows 10 px. A widget
 * moves one cell with or without Alt. Locked parts stay.
 */
export function arrowOps(grid: PageGrid, starts: readonly Start[], key: ArrowKey): PageOp[] {
  const t = trackOf(grid);
  const pitch = { x: t.w + grid.gap, y: t.h + grid.gap };
  return starts.flatMap((s): PageOp[] => {
    if (s.locked) return [];
    const box = boxOf(grid, s.place);
    const item = s.kind !== "widget";
    if (key.alt && item) {
      const step = key.shift ? 10 : 1;
      return [{ type: "move", id: s.id, to: { x: Math.round(box.x + key.dx * step), y: Math.round(box.y + key.dy * step) } }];
    }
    if ("px" in s.place) {
      if (key.shift && !key.alt) return [{ type: "resize", id: s.id, to: { w: Math.max(1, Math.round(box.w + key.dx * pitch.x)), h: Math.max(1, Math.round(box.h + key.dy * pitch.y)) } }];
      return [{ type: "move", id: s.id, to: { x: Math.round(box.x + key.dx * pitch.x), y: Math.round(box.y + key.dy * pitch.y) } }];
    }
    const c = s.place.cell;
    if (key.shift && !key.alt) return [{ type: "resize", id: s.id, to: { cols: Math.max(1, c.cols + key.dx), rows: Math.max(1, c.rows + key.dy) } }];
    return [{ type: "move", id: s.id, to: { col: c.col + key.dx, row: c.row + key.dy } }];
  });
}
