import type { Placement } from "@/lib/layout";

/** A zone box in 1-based grid cells. */
export interface ZoneRect {
  col: number;
  row: number;
  cols: number;
  rows: number;
}

/** Anything that occupies grid cells (a placement's box). */
interface ZoneLike {
  colStart: number;
  rowStart: number;
  colSpan: number;
  rowSpan: number;
}

export function rectsOverlap(r: ZoneRect, o: ZoneLike): boolean {
  return (
    r.col < o.colStart + o.colSpan &&
    o.colStart < r.col + r.cols &&
    r.row < o.rowStart + o.rowSpan &&
    o.rowStart < r.row + r.rows
  );
}

/** The first visible zone (other than `ignore`) that the box overlaps. */
function hitZone(r: ZoneRect, others: Placement[], ignore?: string): Placement | undefined {
  return others.find((o) => o.id !== ignore && o.visible !== false && rectsOverlap(r, o));
}

/** Whether the box lies inside the grid and overlaps no other visible zone. */
export function zoneFits(
  r: ZoneRect,
  others: Placement[],
  cols: number,
  rows: number,
  ignore?: string
): boolean {
  return (
    r.col >= 1 &&
    r.row >= 1 &&
    r.cols >= 1 &&
    r.rows >= 1 &&
    r.col + r.cols - 1 <= cols &&
    r.row + r.rows - 1 <= rows &&
    !hitZone(r, others, ignore)
  );
}

/**
 * The free position for a box of this size closest to `r` (Manhattan
 * distance, row-major for ties), or null when no free spot exists.
 */
function nearestFreeRect(
  r: ZoneRect,
  others: Placement[],
  cols: number,
  rows: number,
  ignore?: string
): ZoneRect | null {
  let best: ZoneRect | null = null;
  let bestDistance = Infinity;
  for (let row = 1; row + r.rows - 1 <= rows; row++) {
    for (let col = 1; col + r.cols - 1 <= cols; col++) {
      const distance = Math.abs(col - r.col) + Math.abs(row - r.row);
      if (distance >= bestDistance) continue;
      const probe: ZoneRect = { col, row, cols: r.cols, rows: r.rows };
      if (hitZone(probe, others, ignore)) continue;
      best = probe;
      bestDistance = distance;
    }
  }
  return best;
}

/**
 * Clamp a proposed zone box to the grid, then push it out of any other
 * zones along the axis of least penetration (biome-style: zones never
 * overlap). When the push runs into the grid edge, the nearest free spot
 * of the same size is used instead; with no free spot at all the result
 * still overlaps — use `fitZoneRect` to detect that. `ignore` is the id
 * of the zone being moved/resized.
 */
export function clampZoneRect(
  rect: ZoneRect,
  others: Placement[],
  cols: number,
  rows: number,
  ignore?: string
): ZoneRect {
  const r: ZoneRect = {
    col: Math.max(1, Math.min(cols, rect.col)),
    row: Math.max(1, Math.min(rows, rect.row)),
    cols: Math.max(1, Math.min(cols, rect.cols)),
    rows: Math.max(1, Math.min(rows, rect.rows)),
  };
  r.col = Math.min(r.col, cols - r.cols + 1);
  r.row = Math.min(r.row, rows - r.rows + 1);
  for (let i = 0; i < 8; i++) {
    const hit = hitZone(r, others, ignore);
    if (!hit) return r;
    const hcol = hit.colStart;
    const hrow = hit.rowStart;
    const hcols = hit.colSpan;
    const hrows = hit.rowSpan;
    // How far r must move to clear the hit on each side.
    const toLeft = r.col + r.cols - hcol;
    const toRight = hcol + hcols - r.col;
    const toUp = r.row + r.rows - hrow;
    const toDown = hrow + hrows - r.row;
    const m = Math.min(toLeft, toRight, toUp, toDown);
    if (m === toLeft) r.col -= toLeft;
    else if (m === toRight) r.col += toRight;
    else if (m === toUp) r.row -= toUp;
    else r.row += toDown;
    r.col = Math.max(1, Math.min(cols - r.cols + 1, r.col));
    r.row = Math.max(1, Math.min(rows - r.rows + 1, r.row));
  }
  if (!hitZone(r, others, ignore)) return r;
  // The push got stuck against the grid edge: take the nearest free spot.
  return nearestFreeRect(r, others, cols, rows, ignore) ?? r;
}

/**
 * `clampZoneRect`, or null when the box can't be placed without
 * overlapping (no free spot of that size) — callers keep the old box.
 */
export function fitZoneRect(
  rect: ZoneRect,
  others: Placement[],
  cols: number,
  rows: number,
  ignore?: string
): ZoneRect | null {
  const r = clampZoneRect(rect, others, cols, rows, ignore);
  return hitZone(r, others, ignore) ? null : r;
}

/**
 * The zone resized to `size` from its top-left corner (toolbar size
 * steps), or null when that leaves the grid or runs into another visible
 * zone — a blocked grow keeps the current size instead of moving. With
 * `min`, shrinking below it (or below the current size, if smaller) is
 * blocked too.
 */
export function resizeZone(
  zone: Placement,
  size: { cols: number; rows: number },
  others: Placement[],
  cols: number,
  rows: number,
  min?: { cols: number; rows: number }
): ZoneRect | null {
  if (
    min &&
    ((size.cols < zone.colSpan && size.cols < min.cols) ||
      (size.rows < zone.rowSpan && size.rows < min.rows))
  )
    return null;
  const rect: ZoneRect = { col: zone.colStart, row: zone.rowStart, ...size };
  // Checked directly: clampZoneRect would push the zone elsewhere.
  return zoneFits(rect, others, cols, rows, zone.id) ? rect : null;
}

/**
 * The zone moved by whole cells (keyboard nudge), or null when that
 * leaves the grid or runs into another visible zone.
 */
export function nudgeZone(
  zone: Placement,
  delta: { cols: number; rows: number },
  others: Placement[],
  cols: number,
  rows: number
): ZoneRect | null {
  const rect: ZoneRect = {
    col: zone.colStart + delta.cols,
    row: zone.rowStart + delta.rows,
    cols: zone.colSpan,
    rows: zone.rowSpan,
  };
  return zoneFits(rect, others, cols, rows, zone.id) ? rect : null;
}

/**
 * First empty grid cell where a cols×rows box fits (row-major scan),
 * used to place palette widgets. Returns null when the grid is full.
 */
export function firstFreeRect(
  cols: number,
  rows: number,
  size: { cols: number; rows: number },
  placements: Placement[]
): ZoneRect | null {
  for (let row = 1; row + size.rows - 1 <= rows; row++) {
    for (let col = 1; col + size.cols - 1 <= cols; col++) {
      const probe: ZoneRect = { col, row, cols: size.cols, rows: size.rows };
      if (placements.some((p) => p.visible !== false && rectsOverlap(probe, p)))
        continue;
      return probe;
    }
  }
  return null;
}

/** Zones in grid reading order: row, then column (stable for ties). */
export function sortZones<T extends ZoneLike>(zones: T[]): T[] {
  return [...zones].sort(
    (a, b) => a.rowStart - b.rowStart || a.colStart - b.colStart
  );
}

/**
 * The zones `ids` moved together by whole cells: each one's new box by
 * id, or null when any would leave the grid or overlap a visible zone
 * outside the set (the set moves as one block, or not at all).
 */
export function moveZoneSet(
  placements: Placement[],
  ids: readonly string[],
  delta: { cols: number; rows: number },
  cols: number,
  rows: number
): Record<string, ZoneRect> | null {
  const set = new Set(ids);
  const others = placements.filter((p) => !set.has(p.id));
  const moved: Record<string, ZoneRect> = {};
  for (const p of placements) {
    if (!set.has(p.id)) continue;
    const rect: ZoneRect = {
      col: p.colStart + delta.cols,
      row: p.rowStart + delta.rows,
      cols: p.colSpan,
      rows: p.rowSpan,
    };
    if (!zoneFits(rect, others, cols, rows)) return null;
    moved[p.id] = rect;
  }
  return Object.keys(moved).length > 0 ? moved : null;
}

/**
 * A resized box kept at least `min` cells — or the zone's current size,
 * when an older zone is already smaller — with the edge opposite the
 * dragged one held in place.
 */
export function enforceMinSize(
  rect: ZoneRect,
  zone: ZoneLike,
  min: { cols: number; rows: number }
): ZoneRect {
  const minCols = Math.min(min.cols, zone.colSpan);
  const minRows = Math.min(min.rows, zone.rowSpan);
  const r = { ...rect };
  if (r.cols < minCols) {
    // The left edge was dragged: keep the right one.
    if (r.col !== zone.colStart) r.col = r.col + r.cols - minCols;
    r.cols = minCols;
  }
  if (r.rows < minRows) {
    if (r.row !== zone.rowStart) r.row = r.row + r.rows - minRows;
    r.rows = minRows;
  }
  return r;
}
