/** The rule editor chart's pure side: the rolling samples and how they land in the box. */

export const TRAIL_MS = 300_000;

export interface Sample {
  at: number;
  value: number;
}

/** A longer pause in the samples starts the trail again: no line is drawn across a time nothing was read. */
const GAP_MS = 3000;

/** The trail with a new reading on the end, without what is older than five minutes. A missing reading adds nothing. */
export function addSample(trail: readonly Sample[], value: number | undefined, now: number): Sample[] {
  const last = trail.at(-1);
  const kept = last && now - last.at > GAP_MS ? [] : trail.filter((s) => now - s.at <= TRAIL_MS);
  return value === undefined ? kept : [...kept, { at: now, value }];
}

/** The value range the box shows: the samples and the lines, with a little room above and below. */
export function chartRange(samples: readonly Sample[], lines: readonly number[]): [number, number] {
  const all = [...samples.map((s) => s.value), ...lines];
  if (all.length === 0) return [0, 1];
  const low = Math.min(...all);
  const high = Math.max(...all);
  const pad = (high - low || Math.abs(high) || 1) * 0.15;
  return [low - pad, high + pad];
}

/** The fill under a line: the line's points closed along the bottom edge. */
export function areaPoints(points: string, height: number): string {
  if (!points) return "";
  const xs = points.split(" ").map((p) => p.split(",")[0]);
  return `${xs[0]},${height} ${points} ${xs[xs.length - 1]},${height}`;
}

/** The polyline's points: time runs to `now` at the right edge. */
export function chartPoints(samples: readonly Sample[], now: number, width: number, height: number, low: number, high: number): string {
  if (samples.length < 2) return "";
  return samples
    .map((s) => `${(width - ((now - s.at) / TRAIL_MS) * width).toFixed(1)},${(height - ((s.value - low) / (high - low || 1)) * height).toFixed(1)}`)
    .join(" ");
}
