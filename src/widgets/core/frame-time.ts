// Frame-time and FPS graphs from the game overlay's readings. RTSS and PresentMon report one reading a second,
// and some readings are far off (a 0.13 ms "current frame time" at 130 fps, a 2 s frame while a game loads),
// so the graphs check each reading against the frame rate and keep their scale through single spikes.

/**
 * The frame time (ms) to plot for one reading: `ft` when it fits the frame rate, else the second's average
 * (1000 / fps). A frame can be much slower than the average (a stutter), never three times faster. NaN with
 * neither.
 */
export function frameSample(ft: number, fps: number): number {
  const avg = fps > 0 ? 1000 / fps : Number.NaN;
  if (!(ft > 0)) return avg;
  return Number.isFinite(avg) && ft < avg / 3 ? avg : ft;
}

/** The round tops (ms) a frame-time graph snaps to, so its scale only changes in steps. */
const TOPS_MS = [10, 20, 25, 40, 50, 75, 100, 150, 200, 300, 500, 1000];

/** The history's third-largest value: its two worst samples (a load, an alt-tab) don't set the scale. */
const thirdLargest = (hist: readonly number[]): number => [...hist].filter(Number.isFinite).sort((a, b) => b - a)[2] ?? 0;

/**
 * The top of a frame-time graph (ms): the first round step above the budget lines (1.5× the slowest) and the
 * history. Samples slower than it draw along the top instead of flattening the rest of the line.
 */
export function frameTimeTop(hist: readonly number[], budgetsMs: readonly number[]): number {
  const need = Math.max(1, ...budgetsMs.map((ms) => ms * 1.5), thirdLargest(hist) * 1.15);
  return TOPS_MS.find((t) => t >= need) ?? TOPS_MS[TOPS_MS.length - 1];
}

/** The budget lines of a frame-time graph: each rate once (a 60 Hz display needs no second 60 Hz line), as Hz and ms. */
export function frameBudgets(rates: readonly number[]): { hz: number; ms: number }[] {
  const seen = new Set<number>();
  return rates
    .filter((hz) => hz > 0 && !seen.has(Math.round(hz)) && seen.add(Math.round(hz)))
    .map((hz) => ({ hz, ms: 1000 / hz }));
}

/** An FPS history with its spikes (a menu or loading screen at hundreds of fps) cut to 1.25× its third-largest value. */
export function clampSpikes(hist: readonly number[]): number[] {
  const cap = thirdLargest(hist) * 1.25;
  return cap > 0 ? hist.map((v) => Math.min(v, cap)) : [...hist];
}
