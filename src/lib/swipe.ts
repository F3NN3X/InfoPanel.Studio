/** A swipe must travel this far, in px, horizontally. */
export const SWIPE_MIN_PX = 60;
/** ... and finish within this time, in ms. */
export const SWIPE_MAX_MS = 600;

/**
 * What a pointer gesture means on the kiosk: swiping left shows the next
 * page, right the previous. It must be long enough, quick, and mostly
 * horizontal (so a vertical scroll never counts); null otherwise.
 */
export function swipeDirection(g: { dx: number; dy: number; ms: number }): "next" | "prev" | null {
  if (g.ms >= SWIPE_MAX_MS || Math.abs(g.dx) < SWIPE_MIN_PX) return null;
  if (Math.abs(g.dx) < Math.abs(g.dy) * 2) return null;
  return g.dx < 0 ? "next" : "prev";
}

/* ───────── drag-follow: the page moves with the finger under a still pinned layer ───────── */

/** A drag becomes a page drag (or a scroll) once it has moved this far, px. */
export const DRAG_START_PX = 12;
/** A released drag goes on to the next page past this share of the page's width; short of it, it springs back (unless flicked). */
export const DRAG_COMMIT_SHARE = 0.25;
/** The settle after a release, ms. */
export const DRAG_SETTLE_MS = 220;

/** Which way a drag goes once it has moved far enough: `x` (the page follows), `y` (a scroll, left to the browser), or undecided. */
export function dragAxis(dx: number, dy: number): "x" | "y" | null {
  if (Math.hypot(dx, dy) < DRAG_START_PX) return null;
  return Math.abs(dx) >= Math.abs(dy) * 1.5 ? "x" : "y";
}

/** Where a released page drag settles: the next or previous page past a quarter of the width or on a quick flick, else back (null). */
export function dragSettle(g: { dx: number; ms: number; width: number }): "next" | "prev" | null {
  const flick = swipeDirection({ dx: g.dx, dy: 0, ms: g.ms });
  if (flick) return flick;
  if (g.width > 0 && Math.abs(g.dx) >= g.width * DRAG_COMMIT_SHARE) return g.dx < 0 ? "next" : "prev";
  return null;
}

/**
 * Whether a press at `target` is the pinned layer's own, never a page drag: an edge item (the rail) or a grid pin whose
 * widget takes the touch. A grid pin that doesn't (`data-pinned-swipe`) lets the page follow the finger.
 */
export const startsOnPinned = (target: EventTarget | null): boolean => (target as Element | null)?.closest?.("[data-pinned-item]:not([data-pinned-swipe])") != null;
