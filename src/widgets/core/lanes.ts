// The Threshold Timeline's lanes: a sensor's samples folded into columns, each a tone, then into runs of one
// tone so a lane draws as a few rects. Pure.
import type { Sample } from "./history";
import { tone } from "./theme";
import type { Tone } from "./types";

/**
 * `n` columns over the window ending at `now`: each holds the highest reading that fell in it (null: no reading),
 * so a short spike still shows. The oldest column is on the left.
 */
export function laneColumns(samples: readonly Sample[], now: number, windowMs: number, n: number): (number | null)[] {
  const cols: (number | null)[] = Array.from({ length: n }, () => null);
  const start = now - windowMs;
  for (const s of samples) {
    if (s.t < start || s.t > now) continue;
    const i = Math.min(n - 1, Math.floor(((s.t - start) / windowMs) * n));
    cols[i] = cols[i] === null ? s.v : Math.max(cols[i]!, s.v);
  }
  return cols;
}

export interface LaneRun {
  /** Columns from (inclusive) to (exclusive). */
  from: number;
  to: number;
  /** null: no reading in these columns. */
  tone: Tone | null;
}

/** Adjacent columns of one tone merged into runs. */
export function laneRuns(cols: readonly (number | null)[], warn: number | undefined, crit: number | undefined): LaneRun[] {
  const runs: LaneRun[] = [];
  cols.forEach((v, i) => {
    const t = v === null ? null : tone(v, warn, crit);
    const last = runs[runs.length - 1];
    if (last && last.tone === t) last.to = i + 1;
    else runs.push({ from: i, to: i + 1, tone: t });
  });
  return runs;
}

/** The highest reading in the window and the share of readings (samples, not time: uneven sampling skews it) (0-100) at or above `warn`; peak NaN and share 0 with none. */
export function laneStats(samples: readonly Sample[], warn: number): { peak: number; pctAbove: number } {
  if (!samples.length) return { peak: Number.NaN, pctAbove: 0 };
  const peak = samples.reduce((m, s) => Math.max(m, s.v), -Infinity);
  return { peak, pctAbove: (samples.filter((s) => s.v >= warn).length / samples.length) * 100 };
}
