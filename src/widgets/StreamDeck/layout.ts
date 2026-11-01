// How the Stream Deck widget lays its keys out. Pure: the widget passes its inner size and the device's grid.

/** The page row's height, px. */
export const PAGE_ROW = 28;

/** A swipe has to travel this far across, px, and mostly sideways. */
export const SWIPE_PX = 48;

/** Where a swipe can turn pages, a key's press waits this long, ms, or for the pointer to lift. */
export const HOLD_MS = 120;

/** A pointer that travels further than this, px, before its press is sent is a swipe: the key is never pressed. */
export const SLOP_PX = 12;

export interface KeyFit {
  /** One key's side, px (square). */
  size: number;
  /** The whole grid's width and height, px. */
  width: number;
  height: number;
}

/** The biggest square keys that fit `cols` × `rows` (with `gap` between them) into `w` × `h`; 0 when nothing fits. */
export function fitKeys(w: number, h: number, cols: number, rows: number, gap: number): KeyFit {
  const size = Math.max(0, Math.floor(Math.min((w - (cols - 1) * gap) / cols, (h - (rows - 1) * gap) / rows)));
  return { size, width: size * cols + (cols - 1) * gap, height: size * rows + (rows - 1) * gap };
}

/** Which way a pointer's travel from down to up turns pages: 1 next (leftwards), -1 previous, 0 none. */
export function swipeOf(dx: number, dy: number): -1 | 0 | 1 {
  if (Math.abs(dx) < SWIPE_PX || Math.abs(dx) < Math.abs(dy) * 2) return 0;
  return dx < 0 ? 1 : -1;
}

/** The title's font size for a key of side `size` (S, M, L), px; 0 when the key is too small to carry one. */
export function titlePx(size: number, scale: "sm" | "md" | "lg"): number {
  if (size < 40) return 0;
  return Math.max(8, Math.round(size * { sm: 0.13, md: 0.17, lg: 0.22 }[scale]));
}

/** The page shown "n / N": counted from 1 and held within the total. */
export const pageText = (current: number, total: number): string => `${Math.min(total, current + 1)} / ${total}`;
