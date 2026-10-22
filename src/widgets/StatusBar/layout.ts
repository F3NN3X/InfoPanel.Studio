// The Status Bar's placement maths: the island's gap on the page centre, and which items give way when the bar is narrow (pure).

export type IslandGapMode = "auto" | "off" | "custom";
export const ISLAND_GAP_MIN = 80;
export const ISLAND_GAP_MAX = 400;
/** Room kept either side of the island's idle pill, px. */
export const ISLAND_MARGIN = 24;

/** The gap's width in page px, 0 = none: Auto follows the island's idle width (0 while it is off), Custom the chosen width. */
export function gapWidth(mode: IslandGapMode, custom: number, islandIdle: number): number {
  if (mode === "off") return 0;
  if (mode === "custom") return Math.min(ISLAND_GAP_MAX, Math.max(ISLAND_GAP_MIN, Number.isFinite(custom) ? custom : ISLAND_GAP_MIN));
  return islandIdle > 0 ? islandIdle + 2 * ISLAND_MARGIN : 0;
}

/**
 * Where the gap sits in the bar: centred on the page's centre, not the bar's. All in one unit (viewport px);
 * `left` is from the bar's left edge. Null when there is no gap or it does not lie wholly inside the bar.
 */
export function gapPlacement(o: { barLeft: number; barWidth: number; pageCentre: number; width: number }): { left: number; width: number } | null {
  if (!(o.width > 0 && o.barWidth > 0)) return null;
  const left = o.pageCentre - o.barLeft - o.width / 2;
  return left < 0 || left + o.width > o.barWidth ? null : { left, width: o.width };
}

export interface Slots<K> {
  left: K[];
  center: K[];
  right: K[];
}

/**
 * The items that fit `room` (px): while the rest is too wide, the slot with more items gives one up (the right on a
 * tie) from its outer end, the first of the left slot or the last of the right one. The centre is kept; if it alone
 * is too wide it is clipped, never wrapped.
 */
export function fitSlots<K>(slots: Slots<K>, room: number, cost: (k: K) => number): Slots<K> {
  let { left, right } = slots;
  const total = () => [...left, ...slots.center, ...right].reduce((s, k) => s + cost(k), 0);
  while (total() > room && (left.length > 0 || right.length > 0)) {
    if (left.length > right.length) left = left.slice(1);
    else right = right.slice(0, -1);
  }
  return { left, center: slots.center, right };
}

/** The centre slot split around the gap: the first half to its left, the rest to its right. */
export function splitCenter<K>(center: K[]): [K[], K[]] {
  const at = Math.ceil(center.length / 2);
  return [center.slice(0, at), center.slice(at)];
}
