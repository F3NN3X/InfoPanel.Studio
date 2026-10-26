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

/** The bar's text size as a share of its height, and its smallest. */
export const FS_SHARE = 0.36;
export const FS_MIN = 13;
/** The drawn items' smallest height, px (a lower bar keeps its own). */
const U_MIN = 60;

/**
 * The bar's text size (`fs`) and drawn-item height (`u`, at most `u0`, the room the bar has): the text follows the
 * height (0.36 of it, from 13 px), and both shrink together until `fits` says every item fits, down to 13 px text and
 * 60 px items (their captions stay about 10 px). Past that the narrow-bar drop (`fitSlots` / `fitByRank`) takes over at the smallest size.
 */
export function barSize(h: number, u0: number, fits: (fs: number, u: number) => boolean): { fs: number; u: number } {
  const fs0 = Math.max(FS_MIN, Math.round(h * FS_SHARE));
  const at = (k: number) => ({ fs: Math.max(FS_MIN, Math.round(fs0 * k)), u: Math.max(Math.min(u0, U_MIN), Math.round(u0 * k)) });
  if (fits(at(1).fs, at(1).u)) return at(1);
  // The largest scale that fits; at 0 both are at their floors.
  let lo = 0,
    hi = 1;
  for (let i = 0; i < 12; i++) {
    const k = (lo + hi) / 2;
    const s = at(k);
    if (fits(s.fs, s.u)) lo = k;
    else hi = k;
  }
  return at(lo);
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

/**
 * The items that fit `room` (px) in a bar that drops by priority: while the rest is too wide, the item with the
 * lowest `rank` goes (the last of them on a tie), from any slot; slots and the order of the rest are kept.
 */
export function fitByRank<K>(slots: Slots<K>, room: number, cost: (k: K) => number, rank: (k: K) => number): Slots<K> {
  let kept = slots;
  const all = () => [...kept.left, ...kept.center, ...kept.right];
  const total = () => all().reduce((s, k) => s + cost(k), 0);
  while (total() > room && all().length > 1) {
    const items = all();
    const lowest = items.reduce((at, k, i) => (rank(k) <= rank(items[at]) ? i : at), 0);
    const drop = (list: K[], from: number) => list.filter((_, i) => i + from !== lowest);
    kept = { left: drop(kept.left, 0), center: drop(kept.center, kept.left.length), right: drop(kept.right, kept.left.length + kept.center.length) };
  }
  return kept;
}
