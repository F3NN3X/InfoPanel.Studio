import type { Placement } from "@/lib/layout";
import { rectsOverlap, zoneFits, type ZoneRect } from "./zone-geometry";

/** What the Align and distribute menu does to a multi-selection, in grid cells. */
export type ArrangeOp =
  | "align-left"
  | "align-right"
  | "align-top"
  | "align-bottom"
  | "match-width"
  | "match-height"
  | "distribute-h"
  | "distribute-v";

const rectOf = (p: Placement): ZoneRect => ({ col: p.colStart, row: p.rowStart, cols: p.colSpan, rows: p.rowSpan });

const same = (a: ZoneRect, b: ZoneRect) => a.col === b.col && a.row === b.row && a.cols === b.cols && a.rows === b.rows;

/**
 * The boxes that changed, or null when nothing changed or the result would leave the grid or overlap
 * a visible zone: the selection is arranged as a whole or not at all (like `moveZoneSet`).
 */
function accepted(
  placements: Placement[],
  set: ReadonlySet<string>,
  next: Record<string, ZoneRect>,
  cols: number,
  rows: number
): Record<string, ZoneRect> | null {
  const others = placements.filter((p) => !set.has(p.id));
  const members = placements.filter((p) => set.has(p.id));
  const boxes = members.map((p) => ({ p, r: next[p.id] ?? rectOf(p) }));
  for (const { p, r } of boxes) {
    if (!zoneFits(r, others, cols, rows)) return null;
    // Hidden zones take no cells, so they may sit on top of each other.
    if (p.visible === false) continue;
    if (boxes.some((o) => o.p !== p && o.p.visible !== false && rectsOverlap(r, { colStart: o.r.col, rowStart: o.r.row, colSpan: o.r.cols, rowSpan: o.r.rows }))) return null;
  }
  const changed = Object.fromEntries(boxes.filter(({ p, r }) => !same(r, rectOf(p))).map(({ p, r }) => [p.id, r]));
  return Object.keys(changed).length > 0 ? changed : null;
}

/** The selected zones, in the placements' order. */
const selected = (placements: Placement[], ids: ReadonlySet<string>) => placements.filter((p) => ids.has(p.id));

/**
 * Align the zones on the left, right, top or bottom edge of the box around them. Null when that
 * would overlap (two zones side by side can't share a left edge), leave the grid, or move nothing.
 */
export function alignZones(
  placements: Placement[],
  ids: readonly string[],
  edge: "left" | "right" | "top" | "bottom",
  cols: number,
  rows: number
): Record<string, ZoneRect> | null {
  const set = new Set(ids);
  const zones = selected(placements, set);
  if (zones.length < 2) return null;
  const left = Math.min(...zones.map((p) => p.colStart));
  const right = Math.max(...zones.map((p) => p.colStart + p.colSpan));
  const top = Math.min(...zones.map((p) => p.rowStart));
  const bottom = Math.max(...zones.map((p) => p.rowStart + p.rowSpan));
  const next = Object.fromEntries(
    zones.map((p): [string, ZoneRect] => {
      const r = rectOf(p);
      switch (edge) {
        case "left":
          return [p.id, { ...r, col: left }];
        case "right":
          return [p.id, { ...r, col: right - p.colSpan }];
        case "top":
          return [p.id, { ...r, row: top }];
        case "bottom":
          return [p.id, { ...r, row: bottom - p.rowSpan }];
      }
    })
  );
  return accepted(placements, set, next, cols, rows);
}

/**
 * Give every zone the width (or height) of the primary zone, keeping each one's top-left corner.
 * `min` is a zone's smallest size; one the primary's size would shrink below it blocks the whole change.
 */
export function matchZoneSize(
  placements: Placement[],
  ids: readonly string[],
  primaryId: string,
  axis: "width" | "height",
  cols: number,
  rows: number,
  min: (p: Placement) => { cols: number; rows: number } = () => ({ cols: 1, rows: 1 })
): Record<string, ZoneRect> | null {
  const set = new Set(ids);
  const zones = selected(placements, set);
  const primary = zones.find((p) => p.id === primaryId);
  if (zones.length < 2 || !primary) return null;
  const next: Record<string, ZoneRect> = {};
  for (const p of zones) {
    const r = rectOf(p);
    const floor = min(p);
    if (axis === "width") {
      if (primary.colSpan < Math.min(floor.cols, p.colSpan)) return null;
      next[p.id] = { ...r, cols: primary.colSpan };
    } else {
      if (primary.rowSpan < Math.min(floor.rows, p.rowSpan)) return null;
      next[p.id] = { ...r, rows: primary.rowSpan };
    }
  }
  return accepted(placements, set, next, cols, rows);
}

/**
 * Spread three or more zones so the gaps between them are equal, across or down: the first and last
 * stay, the others keep their order. Gaps are whole cells (the leftover cells go to the later gaps).
 * Null when the zones don't fit with no gap, or the spread would overlap another zone.
 */
export function distributeZones(
  placements: Placement[],
  ids: readonly string[],
  axis: "horizontal" | "vertical",
  cols: number,
  rows: number
): Record<string, ZoneRect> | null {
  const set = new Set(ids);
  const zones = selected(placements, set);
  if (zones.length < 3) return null;
  const horizontal = axis === "horizontal";
  const start = (p: Placement) => (horizontal ? p.colStart : p.rowStart);
  const size = (p: Placement) => (horizontal ? p.colSpan : p.rowSpan);
  const order = [...zones].sort((a, b) => start(a) - start(b) || a.id.localeCompare(b.id));
  const first = order[0];
  const last = order[order.length - 1];
  const free = start(last) + size(last) - start(first) - order.reduce((n, p) => n + size(p), 0);
  if (free < 0) return null;
  const gaps = order.length - 1;
  const base = Math.floor(free / gaps);
  // The first `extra` gaps from the end get one more cell.
  const extra = free - base * gaps;
  let at = start(first);
  const next: Record<string, ZoneRect> = {};
  order.forEach((p, i) => {
    const r = rectOf(p);
    next[p.id] = horizontal ? { ...r, col: at } : { ...r, row: at };
    at += size(p) + base + (i >= gaps - extra ? 1 : 0);
  });
  return accepted(placements, set, next, cols, rows);
}

/** Run one `ArrangeOp` on the selection (`primaryId` is the zone whose size `match-*` copies). */
export function arrangeZones(
  op: ArrangeOp,
  placements: Placement[],
  ids: readonly string[],
  primaryId: string,
  cols: number,
  rows: number,
  min?: (p: Placement) => { cols: number; rows: number }
): Record<string, ZoneRect> | null {
  switch (op) {
    case "align-left":
      return alignZones(placements, ids, "left", cols, rows);
    case "align-right":
      return alignZones(placements, ids, "right", cols, rows);
    case "align-top":
      return alignZones(placements, ids, "top", cols, rows);
    case "align-bottom":
      return alignZones(placements, ids, "bottom", cols, rows);
    case "match-width":
      return matchZoneSize(placements, ids, primaryId, "width", cols, rows, min);
    case "match-height":
      return matchZoneSize(placements, ids, primaryId, "height", cols, rows, min);
    case "distribute-h":
      return distributeZones(placements, ids, "horizontal", cols, rows);
    case "distribute-v":
      return distributeZones(placements, ids, "vertical", cols, rows);
  }
}

/** The zones a marquee box touches (visible ones only), for a drag-select. */
export function zonesInRect(placements: Placement[], rect: ZoneRect): string[] {
  return placements.filter((p) => p.visible !== false && rectsOverlap(rect, p)).map((p) => p.id);
}
