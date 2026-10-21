import { SCROLL_ROW_H, type Placement, type ProfileView } from "@/lib/layout";
import { profileGap, profilePadding } from "@/lib/profile-grid";
import { changeCols, changeRows } from "../studio-actions";

/** The toast when a smaller grid would cut a zone off. */
export const GRID_REFUSED = "Some zones would fall outside the grid — move or resize them first";

/**
 * Step the grid's columns or rows by `delta` (limits as `changeCols` /
 * `changeRows`). Shrinking below a zone's far edge is refused (null)
 * instead of squeezing the zone; the same profile comes back when the
 * limit leaves nothing to change. The grid is shared by every page, so
 * `otherZones` (the other pages' zones) count for the refusal too.
 */
export function stepGrid(
  profile: ProfileView,
  axis: "cols" | "rows",
  delta: number,
  otherZones: readonly Placement[] = []
): ProfileView | null {
  const next = axis === "cols" ? changeCols(profile, delta) : changeRows(profile, delta);
  if (next[axis] === profile[axis]) return profile;
  if (next[axis] > profile[axis]) return next;
  const size = next[axis];
  const outside = [...profile.placements, ...otherZones].some((p) =>
    axis === "cols" ? p.colStart + p.colSpan - 1 > size : p.rowStart + p.rowSpan - 1 > size
  );
  return outside ? null : next;
}

/** The design sizes the Profile tab offers (README §4.7). */
export const SIZE_PRESETS: readonly { width: number; height: number }[] = [
  { width: 1920, height: 550 },
  { width: 1920, height: 1080 },
  { width: 2560, height: 720 },
  { width: 1280, height: 400 },
  { width: 1024, height: 600 },
  { width: 800, height: 480 },
];

const sizeKey = (width: number, height: number) => `${width}×${height}`;

/** The select value of a design size. */
export const sizeChoice = sizeKey;

/** The design sizes to pick from; a size that is not a preset is the first option. */
export function sizeOptions(width: number, height: number): { value: string; label: string }[] {
  const current = sizeKey(width, height);
  const presets = SIZE_PRESETS.map((p) => ({ value: sizeKey(p.width, p.height), label: sizeKey(p.width, p.height) }));
  return presets.some((o) => o.value === current) ? presets : [{ value: current, label: current }, ...presets];
}

/** A preset's select value as a size (null for the current non-preset size, which changes nothing). */
export function sizeOfChoice(choice: string): { width: number; height: number } | null {
  return SIZE_PRESETS.find((p) => sizeKey(p.width, p.height) === choice) ?? null;
}

/** The live grid preview's box in px (as wide as the inspector's content allows). */
export const GRID_PREVIEW_BOX = { width: 288, height: 112 };

/**
 * The profile's screen fitted into the preview box, with its gap and padding scaled the same
 * (the canvas's: `profilePadding` for a kiosk page). Render only.
 */
export function gridPreview(profile: {
  width: number;
  height: number;
  rows: number;
  fit: "scroll" | "fill";
  gap?: number;
  padding?: number;
}): { width: number; height: number; gap: number; padding: number } {
  const padding = profilePadding(profile, true);
  // Scroll: rows keep their real height (SCROLL_ROW_H) against the design width, so the screen is as tall as its rows.
  const height = profile.fit === "scroll" ? profile.rows * SCROLL_ROW_H + 2 * padding : profile.height;
  const scale = Math.min(GRID_PREVIEW_BOX.width / profile.width, GRID_PREVIEW_BOX.height / height);
  return {
    width: profile.width * scale,
    height: height * scale,
    gap: profileGap(profile) * scale,
    padding: padding * scale,
  };
}

/** Typed design-size text as pixels: a positive whole number, else null (nothing is written). */
export function parseSize(text: string): number | null {
  const n = parseInt(text, 10);
  return Number.isFinite(n) && n >= 1 ? n : null;
}
