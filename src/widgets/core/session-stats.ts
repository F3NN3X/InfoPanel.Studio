// Running min, max, average and time above a level for one sensor, kept as totals (a few numbers, however long it runs).
// Pure; the widget calls `observe` for each new reading.

/** A gap longer than this between two readings (a hidden tab, a stalled feed) counts as this long. */
export const MAX_STEP_MS = 5000;

export interface SessionStat {
  min: number;
  max: number;
  /** Readings seen. */
  n: number;
  /** Time-weighted sum of the readings (value × ms) and the time it covers. */
  weighted: number;
  coveredMs: number;
  /** Time spent at or above the level. */
  aboveMs: number;
  lastValue: number;
  lastT: number;
}

/** The totals after one more reading `v` at `t` (ms). The previous reading holds for the time since it, up to `MAX_STEP_MS`. */
export function observe(prev: SessionStat | undefined, v: number, t: number, above: number): SessionStat {
  if (!Number.isFinite(v)) return prev ?? { min: Number.NaN, max: Number.NaN, n: 0, weighted: 0, coveredMs: 0, aboveMs: 0, lastValue: Number.NaN, lastT: t };
  if (!prev || prev.n === 0) return { min: v, max: v, n: 1, weighted: 0, coveredMs: 0, aboveMs: 0, lastValue: v, lastT: t };
  const dt = Math.min(MAX_STEP_MS, Math.max(0, t - prev.lastT));
  return {
    min: Math.min(prev.min, v),
    max: Math.max(prev.max, v),
    n: prev.n + 1,
    weighted: prev.weighted + prev.lastValue * dt,
    coveredMs: prev.coveredMs + dt,
    aboveMs: prev.aboveMs + (prev.lastValue >= above ? dt : 0),
    lastValue: v,
    lastT: t,
  };
}

/** The time-weighted average, or the only reading so far; NaN with none. */
export const average = (s: SessionStat): number => (s.coveredMs > 0 ? s.weighted / s.coveredMs : s.n ? s.lastValue : Number.NaN);

/** "42 s", "7 min", "1 h 05 min": a duration for the time-above column. */
export function durationText(ms: number): string {
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s} s`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min`;
  return `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, "0")} min`;
}
