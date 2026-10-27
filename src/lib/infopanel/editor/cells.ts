/**
 * Studio widget items on an imported profile's grid (Edit v3 SPEC §3.6, §7.3, decision Q3): they move and resize by
 * whole cells and never onto another widget; a move that would is refused. The other items a selection holds move by
 * the same px. Pure, on the canvas editor's item tree.
 */
import { widgetBox, widgetOf } from "../import/stored.ts";
import { widgetOnCell, widgetPaths } from "../native/widget-item.ts";
import type { DisplayItem } from "../schema.ts";
import { cellRect, nearestCells, trackOf, type CellBox, type PageGrid, type PixelBox } from "../../page-model/model.ts";
import { cellFree, moveCells } from "../../page-model/gesture.ts";
import { itemAt, moveBy, topmost, updateAt, type Path } from "./ops.ts";

/** A widget item's cells: its record's, else the cells nearest its box. */
export const cellOfWidget = (grid: PageGrid, item: DisplayItem): CellBox => widgetOf(item)?.cell ?? nearestCells(grid, widgetBox(item));

/** The widget items among `paths` (a group's included) and the ones outside them. */
function split(items: readonly DisplayItem[], paths: readonly Path[]): { moving: Path[]; others: Path[] } {
  const inside = (p: Path) => paths.some((m) => p === m || p.startsWith(m + "."));
  const all = widgetPaths(items);
  return { moving: all.filter(inside), others: all.filter((p) => !inside(p)) };
}

/** Whether any of `paths` is, or holds, a widget item. */
export const holdsWidget = (items: readonly DisplayItem[], paths: readonly Path[]): boolean => split(items, paths).moving.length > 0;

/**
 * The items after moving `paths` by `dc` columns and `dr` rows: widget items onto their new cells, the rest by the
 * same px. Null when a widget would leave the grid or land on another widget.
 */
export function moveOnCells(grid: PageGrid, items: readonly DisplayItem[], paths: readonly Path[], dc: number, dr: number): DisplayItem[] | null {
  const { moving, others } = split(items, paths);
  const cells = moveCells(grid, moving.map((p) => cellOfWidget(grid, itemAt(items, p)!)), others.map((p) => cellOfWidget(grid, itemAt(items, p)!)), dc, dr);
  if (!cells) return null;
  const t = trackOf(grid);
  const rest = topmost(paths).filter((p) => !moving.includes(p));
  let out = moveBy(items, rest, Math.round(dc * (t.w + grid.gap)), Math.round(dr * (t.h + grid.gap)));
  moving.forEach((p, i) => {
    out = updateAt(out, p, (it) => widgetOnCell(it, cells[i], cellRect(grid, cells[i])));
  });
  return out;
}

/** A move by a px delta in whole cells: the nearest number of each. */
export function cellDelta(grid: PageGrid, dx: number, dy: number): { dc: number; dr: number } {
  const t = trackOf(grid);
  return { dc: Math.round(dx / Math.max(1, t.w + grid.gap)), dr: Math.round(dy / Math.max(1, t.h + grid.gap)) };
}

/** The items after resizing the widget item at `path` to the cells nearest `box`; null when they aren't free. */
export function resizeOnCells(grid: PageGrid, items: readonly DisplayItem[], path: Path, box: PixelBox): DisplayItem[] | null {
  const { others } = split(items, [path]);
  const cell = nearestCells(grid, box);
  if (!cellFree(grid, cell, others.map((p) => cellOfWidget(grid, itemAt(items, p)!)))) return null;
  return updateAt(items, path, (it) => widgetOnCell(it, cell, cellRect(grid, cell)));
}
