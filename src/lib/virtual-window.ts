/** The maths of a fixed-row-height virtual list: where each row sits, which rows a scroll position shows, and which header is pinned. */

/** Top offset of every row, plus the total height as the last entry. */
export function offsetsOf<T>(rows: readonly T[], heightOf: (row: T) => number): number[] {
  const offsets = [0];
  for (const row of rows) offsets.push(offsets[offsets.length - 1] + heightOf(row));
  return offsets;
}

/** The index of the row containing `y` (clamped), by binary search over `offsets`. */
export function rowAt(offsets: readonly number[], y: number): number {
  const count = offsets.length - 1;
  if (count <= 0) return 0;
  let lo = 0;
  let hi = count - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (offsets[mid] <= y) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

/** The rows to render for a scroll position: `[start, end)` with `overscan` rows either side. */
export function windowRange(
  offsets: readonly number[],
  scrollTop: number,
  viewportH: number,
  overscan = 6
): { start: number; end: number } {
  const count = offsets.length - 1;
  if (count <= 0) return { start: 0, end: 0 };
  const first = rowAt(offsets, Math.max(0, scrollTop));
  const last = rowAt(offsets, Math.max(0, scrollTop) + viewportH);
  return { start: Math.max(0, first - overscan), end: Math.min(count, last + 1 + overscan) };
}

/** Index of the sticky header governing the row at `index` (-1 before the first). */
export function stickyBefore<T>(rows: readonly T[], index: number, isSticky: (row: T) => boolean): number {
  for (let i = Math.min(index, rows.length - 1); i >= 0; i--) {
    if (isSticky(rows[i])) return i;
  }
  return -1;
}
