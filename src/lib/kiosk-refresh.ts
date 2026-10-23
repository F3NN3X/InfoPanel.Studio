/** The hour (local time) kiosk pages reload at when Refresh kiosk pages is daily. */
export const REFRESH_HOUR = 4;
/** Up to this long after it, picked per page, so several kiosks don't reload at the same instant. */
export const REFRESH_JITTER_MS = 5 * 60_000;

/** Milliseconds from `now` to the next 04:00 local time (a time already at 04:00 counts as passed), plus `jitterMs`. */
export function msUntilNextRefresh(now: Date, jitterMs = 0): number {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate(), REFRESH_HOUR);
  const next = today.getTime() > now.getTime() ? today : new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, REFRESH_HOUR);
  return Math.max(0, next.getTime() - now.getTime()) + jitterMs;
}
