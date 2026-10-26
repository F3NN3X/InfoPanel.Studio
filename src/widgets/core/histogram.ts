// Frame-time distribution: counts per millisecond bin, and the 1 % / 0.1 % lows read off the slowest frames.
// Pure; the widget feeds it the frame times (ms) of the last N seconds.

/** The tops (ms) a histogram's axis snaps to, so its scale changes in steps, not with every slow frame. */
const TOPS_MS = [20, 25, 40, 50, 75, 100, 150, 250];

export interface FrameBin {
  /** The bin's range in ms, `from` inclusive. */
  from: number;
  to: number;
  count: number;
}

export interface FrameHistogram {
  bins: FrameBin[];
  /** The axis top (ms). */
  top: number;
  /** Frames counted. */
  total: number;
  /** The largest bin count, at least 1. */
  peak: number;
}

/** The percentile `p` (0 to 1) of `values` by nearest rank: the value `p` of the samples sit at or under. NaN for none. */
export function percentile(values: readonly number[], p: number): number {
  const v = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!v.length) return Number.NaN;
  return v[Math.min(v.length - 1, Math.max(0, Math.ceil(p * v.length) - 1))];
}

/** The axis top (ms) for these frame times: the first step above the 99.9th percentile with a margin, at least 20 ms. */
export function histogramTop(values: readonly number[]): number {
  const worst = percentile(values, 0.999);
  const need = Number.isFinite(worst) ? worst * 1.1 : 0;
  return TOPS_MS.find((t) => t >= need) ?? TOPS_MS[TOPS_MS.length - 1];
}

/** Frame times (ms) in `n` equal bins from 0 to `top`; a frame slower than `top` counts in the last bin. */
export function frameHistogram(values: readonly number[], n = 24, top = histogramTop(values)): FrameHistogram {
  const width = top / n;
  const bins: FrameBin[] = Array.from({ length: n }, (_, i) => ({ from: i * width, to: (i + 1) * width, count: 0 }));
  let total = 0;
  for (const v of values) {
    if (!Number.isFinite(v) || v < 0) continue;
    bins[Math.min(n - 1, Math.floor(v / width))].count++;
    total++;
  }
  return { bins, top, total, peak: Math.max(1, ...bins.map((b) => b.count)) };
}

export interface FrameLows {
  /** Frame times (ms) that 99 % and 99.9 % of the frames came in under; NaN without frames. */
  low1: number;
  low01: number;
  /** The same lows as frames per second. */
  low1Fps: number;
  low01Fps: number;
}

/** The 1 % and 0.1 % lows: the 99th and 99.9th percentile frame time (a slow frame is a high number), and its rate. */
export function frameLows(values: readonly number[]): FrameLows {
  const low1 = percentile(values, 0.99),
    low01 = percentile(values, 0.999);
  const fps = (ms: number) => (ms > 0 ? 1000 / ms : Number.NaN);
  return { low1, low01, low1Fps: fps(low1), low01Fps: fps(low01) };
}
