/** The preview's play button: a value sweeping 0 → 1 → 0 (spec §6). */

/** 0..1 at `elapsedMs` into a sweep of `periodMs` (up, then back down; a triangle wave starting at 0). */
export function sweepAt(elapsedMs: number, periodMs: number): number {
  if (!(periodMs > 0) || !Number.isFinite(elapsedMs)) return 0;
  const t = (((elapsedMs % periodMs) + periodMs) % periodMs) / periodMs;
  return t < 0.5 ? t * 2 : (1 - t) * 2;
}

/** The image of an image sequence at `p` (0..1 of its range): its frame index, or -1 for none. */
export function frameIndex(count: number, p: number): number {
  if (count <= 0) return -1;
  return Math.min(count - 1, Math.max(0, Math.round(p * (count - 1))));
}
