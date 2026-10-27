/**
 * A screen's Columns × rows changed from the page inspector (Edit v3 SPEC §10.1, decision Q5). Widgets keep their cells
 * and never get squeezed: when one would fall outside the new grid the change is refused with one message naming
 * them. Parts on cells reflow with the grid (an imported profile's widget items and items on `$.cell` get their new
 * box); parts placed freely keep their pixels, so an imported profile's own items never move. Pure.
 */
import { CANVAS_ID, ITEM_ID, type MonitorProfile, type Placement, type ProfilePage } from "../layout.ts";
import { freeCanvasOf } from "../screens/list.ts";
import type { StoredCanvas, StoredItem, WidgetItem } from "../infopanel/import/stored.ts";
import { canvasGrid } from "./canvas-adapter.ts";
import { cellRect, clampCell, GRID_LIMITS, type CellBox, type PageGrid } from "./model.ts";
import { atBox, obj } from "./stored-items.ts";

export type Regrid = { profile: MonitorProfile } | { refused: string };

const outside = (c: CellBox, cols: number, rows: number) => c.col + c.cols - 1 > cols || c.row + c.rows - 1 > rows;
const zoneCells = (p: Placement): CellBox => ({ col: p.colStart, row: p.rowStart, cols: p.colSpan, rows: p.rowSpan });
const widgetRecord = (item: StoredItem): WidgetItem | null => (item.kind === "Image" ? ((obj(item.$)?.widget as WidgetItem | undefined) ?? null) : null);
const kidsOf = (item: StoredItem): StoredItem[] => (Array.isArray(item.DisplayItems) ? (item.DisplayItems as StoredItem[]) : []);

/** "CPU gauge", "CPU gauge and Weather", "CPU gauge, GPU gauge and Weather". */
export function nameList(names: readonly string[]): string {
  return names.length <= 1 ? (names[0] ?? "") : `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;
}

/** Q5's message: `CPU gauge and Weather don't fit in 3 × 2. Make room first.` */
export const refusal = (names: readonly string[], cols: number, rows: number) =>
  `${nameList(names)} ${names.length === 1 ? "doesn't" : "don't"} fit in ${cols} × ${rows}. Make room first.`;

/** The canvas's widget items that would leave the grid, by name. */
function canvasMisfits(items: readonly StoredItem[], cols: number, rows: number): string[] {
  return items.flatMap((it) => {
    const w = widgetRecord(it);
    if (w?.cell && outside(w.cell, cols, rows)) return [typeof it.Name === "string" && it.Name ? it.Name : w.module];
    return it.kind === "Group" ? canvasMisfits(kidsOf(it), cols, rows) : [];
  });
}

/** A canvas's parts on cells at their boxes on `grid` (clamped into it); the rest the same objects. */
function reflowItems(grid: PageGrid, items: readonly StoredItem[]): StoredItem[] {
  let changed = false;
  const out = items.map((it) => {
    let next = it;
    if (it.kind === "Group") {
      const kids = kidsOf(it);
      const moved = reflowItems(grid, kids);
      if (moved !== kids) next = { ...it, DisplayItems: moved };
    }
    const $ = obj(next.$);
    const w = widgetRecord(next);
    const cell = w?.cell ?? (next.kind !== "Group" ? (($?.cell as CellBox | undefined) ?? null) : null);
    if (cell) {
      const c = clampCell(grid, cell);
      next = { ...atBox(next, cellRect(grid, c)), $: w ? { ...$, widget: { ...w, cell: c } } : { ...$, cell: c } } as StoredItem;
    }
    if (next !== it) changed = true;
    return next;
  });
  return changed ? out : (items as StoredItem[]);
}

/** A page on the new grid: its canvas filling it (an imported profile's, its parts on cells reflowed), or its item placements on cells kept inside it. */
function pageOn(before: MonitorProfile, after: MonitorProfile, page: ProfilePage): ProfilePage {
  const whole = freeCanvasOf(before, page);
  if (whole) {
    const canvas = whole.canvas;
    const items = canvas ? reflowItems(canvasGrid(after, canvas), canvas.items) : undefined;
    const zone: Placement = {
      ...whole,
      colStart: 1,
      rowStart: 1,
      colSpan: after.cols,
      rowSpan: after.rows,
      ...(canvas && items !== canvas.items ? { canvas: { ...canvas, items } as StoredCanvas } : {}),
    };
    return { ...page, placements: [zone] };
  }
  const placements = page.placements.map((p) => {
    if (p.module !== ITEM_ID || p.px) return p;
    const c = clampCell(after, zoneCells(p));
    return c.col === p.colStart && c.row === p.rowStart && c.cols === p.colSpan && c.rows === p.rowSpan ? p : { ...p, colStart: c.col, rowStart: c.row, colSpan: c.cols, rowSpan: c.rows };
  });
  return placements.every((p, i) => p === page.placements[i]) ? page : { ...page, placements };
}

/**
 * The screen on `cols` × `rows` (limits as Screens' steppers); refused, naming them, when a widget on any page would
 * fall outside. `nameOf` names a widget zone.
 */
export function regrid(profile: MonitorProfile, cols: number, rows: number, nameOf: (p: Placement) => string): Regrid {
  const c = Math.max(GRID_LIMITS.cols.min, Math.min(GRID_LIMITS.cols.max, Math.round(cols)));
  const r = Math.max(GRID_LIMITS.rows.min, Math.min(GRID_LIMITS.rows.max, Math.round(rows)));
  if (c === profile.cols && r === profile.rows) return { profile };
  const misfits = profile.pages.flatMap((page) => {
    const whole = freeCanvasOf(profile, page);
    if (whole) return whole.canvas ? canvasMisfits(whole.canvas.items, c, r) : [];
    return page.placements.filter((p) => p.module !== ITEM_ID && outside(zoneCells(p), c, r)).map((p) => (p.module === CANVAS_ID ? p.canvas?.source.name || nameOf(p) : nameOf(p)));
  });
  if (misfits.length) return { refused: refusal([...new Set(misfits)], c, r) };
  const after = { ...profile, cols: c, rows: r };
  return { profile: { ...after, pages: profile.pages.map((pg) => pageOn(profile, after, pg)) } };
}
