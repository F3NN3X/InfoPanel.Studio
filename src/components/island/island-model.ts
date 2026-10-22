import type { IslandConfig, IslandSize } from "@/lib/island/config";
import type { IslandSnapshot } from "@/lib/island/types";

/**
 * What the island is showing: open for a notice, the time with a badge, the time with a live
 * activity, the time alone ("line": a hairline), or nothing. A badge and an activity at once is
 * "compact" with the activity beside the time.
 */
export type IslandMode = "expanded" | "compact" | "activity" | "idle" | "line" | "none";

export function islandMode(snap: IslandSnapshot, idle: IslandConfig["idle"]): IslandMode {
  if (snap.expanded) return "expanded";
  if (snap.pending.length > 0) return "compact";
  if (snap.activity) return "activity";
  return idle === "hidden" ? "none" : idle === "line" ? "line" : "idle";
}

interface Box {
  width: number;
  height: number;
}

/** What sets the pill's idle width. */
export type IslandLook = Pick<IslandConfig, "idle" | "stats" | "rotate" | "scale">;

const IDLE: Record<IslandSize, Box> = { s: { width: 124, height: 28 }, m: { width: 156, height: 36 }, l: { width: 196, height: 46 } };
/** Extra width for the date (or one rotating view) beside the time. */
const DATE_EXTRA: Record<IslandSize, number> = { s: 96, m: 120, l: 150 };
/** Extra width for each live value after the first (the first takes the date's room, as before there were more). */
const STAT_EXTRA: Record<IslandSize, number> = { s: 72, m: 88, l: 110 };
/** Extra width for the badge beside the time. */
const BADGE_EXTRA: Record<IslandSize, number> = { s: 36, m: 44, l: 54 };
const EXPANDED: Record<IslandSize, Box> = { s: { width: 300, height: 64 }, m: { width: 380, height: 78 }, l: { width: 470, height: 96 } };
/** The idle hairline (L4 NotchBar's "thin line"). */
const LINE: Box = { width: 150, height: 5 };
export const ISLAND_FONT_PX: Record<IslandSize, number> = { s: 12, m: 14, l: 17 };
const SIZES_DOWN: readonly IslandSize[] = ["l", "m", "s"];
/** The open island takes at most this share of the page height. */
export const EXPANDED_MAX_SHARE = 0.4;
/** Space kept between the pill and the page edges, px. */
const SIDE_ROOM = 16;

const scaled = (b: Box, k: number): Box => ({ width: Math.round(b.width * k), height: Math.round(b.height * k) });

/** The width the idle views beside the time take: one rotating slot, the date, or each value. */
function idleExtra(size: IslandSize, look: IslandLook): number {
  if (look.rotate > 0) return look.idle === "time" ? 0 : DATE_EXTRA[size];
  if (look.idle === "time-date") return DATE_EXTRA[size];
  if (look.idle === "sensor") return DATE_EXTRA[size] + STAT_EXTRA[size] * Math.max(0, look.stats.length - 1);
  return 0;
}

/**
 * The pill's box per mode. Fixed sizes so width, height and radius can animate between modes; the
 * view caps the width to the page. A badge beside an activity takes the activity's width, so the
 * activity has room next to the time and the badge.
 */
export function islandBox(mode: IslandMode, size: IslandSize, look: IslandLook, withActivity = false): Box {
  const k = look.scale / 100;
  if (mode === "expanded") return scaled(EXPANDED[size], k);
  if (mode === "line") return scaled(LINE, k);
  const base = IDLE[size];
  const extra = idleExtra(size, look);
  if (mode === "compact") {
    const width = base.width + extra + BADGE_EXTRA[size];
    return scaled({ width: withActivity ? Math.max(width, EXPANDED[size].width) : width, height: base.height }, k);
  }
  if (mode === "activity") return scaled({ width: EXPANDED[size].width, height: base.height }, k);
  if (mode === "idle") return scaled({ width: base.width + extra, height: base.height }, k);
  return { width: 0, height: 0 };
}

/** The pill's font size at a size and scale, px. */
export const islandFontPx = (size: IslandSize, scale: number): number => Math.round(ISLAND_FONT_PX[size] * (scale / 100) * 10) / 10;

/**
 * The size that fits the page: the chosen one, or the largest smaller one whose open island (at
 * `scale`) stays within `EXPANDED_MAX_SHARE` of the height and inside the width (a short strip or a
 * small screen). The smallest size is the floor.
 */
export function fitIslandSize(size: IslandSize, page: { width: number; height: number }, scale = 100): IslandSize {
  if (!(page.width > 0 && page.height > 0)) return size;
  const fits = (s: IslandSize) => {
    const b = scaled(EXPANDED[s], scale / 100);
    return b.height <= page.height * EXPANDED_MAX_SHARE && b.width + SIDE_ROOM <= page.width;
  };
  return SIZES_DOWN.slice(SIZES_DOWN.indexOf(size)).find(fits) ?? "s";
}

/** Where the pill's top sits: the notch on the page edge, the pill at its offset. */
export const islandTop = (island: Pick<IslandConfig, "shape" | "offsetY">): number => (island.shape === "notch" ? 0 : island.offsetY);

/** The top space "Reserve space" keeps free for the pill: its top, its idle height and a gap, px. */
export function islandReserve(island: IslandConfig | undefined, page: { width: number; height: number }): number {
  if (!island?.enabled || !island.reserve) return 0;
  const size = fitIslandSize(island.size, page, island.scale);
  return islandTop(island) + scaled(IDLE[size], island.scale / 100).height + 8;
}

/** The width the island takes at rest at the top centre of the page, px (0 without an enabled island, or one that shows nothing at rest). */
export function islandIdleWidth(island: IslandConfig | undefined, page: { width: number; height: number }): number {
  if (!island?.enabled || island.idle === "hidden") return 0;
  return islandBox(island.idle === "line" ? "line" : "idle", fitIslandSize(island.size, page, island.scale), island).width;
}

/** One view in the idle slot beside the time: the date, one live value, or the next event. */
export type IdleView = { kind: "date" } | { kind: "stat"; index: number } | { kind: "event" };

/**
 * The views the idle slot shows in turn when the island rotates: the date (idle "+ Date"), each value
 * (idle "+ Sensor"), and the next calendar event while one is coming up.
 */
export function idleViews(look: Pick<IslandConfig, "idle" | "stats">, hasEvent: boolean): IdleView[] {
  const views: IdleView[] = [];
  if (look.idle === "time-date") views.push({ kind: "date" });
  if (look.idle === "sensor") look.stats.forEach((_, index) => views.push({ kind: "stat", index }));
  if (hasEvent) views.push({ kind: "event" });
  return views;
}
