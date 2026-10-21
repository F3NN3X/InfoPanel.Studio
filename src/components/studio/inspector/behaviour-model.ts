/** The Behaviour tab's choices: the frame-rate caps, motion, and the page-cycle interval. */

/** The frame-rate caps; the value is the stored number as text (0 = every display frame). */
export const FPS_OPTIONS = [
  { value: "5", label: "5" },
  { value: "15", label: "15" },
  { value: "30", label: "30" },
  { value: "60", label: "60" },
  { value: "0", label: "No limit" },
];

/** Animations: the stored `motion` values. */
export const MOTION_OPTIONS = [
  { value: "system", label: "Follow system" },
  { value: "reduce", label: "Reduced" },
  { value: "full", label: "Full" },
];

export const ROTATE_DEFAULT_SECONDS = 15;
export const ROTATE_MIN_SECONDS = 3;
export const ROTATE_MAX_SECONDS = 3600;

/** The "Switch every" shortcuts; any other stored interval shows in the number field only. */
export const ROTATE_PRESETS = [
  { value: "10", label: "10 s" },
  { value: "30", label: "30 s" },
  { value: "60", label: "1 min" },
  { value: "300", label: "5 min" },
];

/** The preset an interval is, as segmented-control text; "" when it is none of them. */
export const rotatePreset = (seconds: number): string => ROTATE_PRESETS.find((p) => Number(p.value) === seconds)?.value ?? "";

/** Where a page row dragged to pointer `y` lands in the list without it: the other rows whose middle is above it. */
export function dropRow(rects: { top: number; height: number }[], from: number, y: number): number {
  return rects.filter((r, i) => i !== from && r.top + r.height / 2 < y).length;
}

/** A typed interval as whole seconds within 3–3600; null when it is not a number. */
export function clampSeconds(text: string): number | null {
  const n = Math.round(Number(text));
  if (text.trim() === "" || !Number.isFinite(n)) return null;
  return Math.max(ROTATE_MIN_SECONDS, Math.min(ROTATE_MAX_SECONDS, n));
}
