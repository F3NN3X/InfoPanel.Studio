// Smoothing for live graphs (the `smoothing` look key), after the widget sampler's smoothing.ts:
// draw behind the feed and glide into the newest reading. Unlike the sampler's per-sample glide,
// graphs scroll by time (each sample at its arrival time, at a constant speed), so a reading that
// arrives early or late never makes the line jump back or stop.
import { useEffect, useRef } from "react";
import { subscribeTick } from "@/lib/ticker";

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

/**
 * Tracks when samples arrive and reports how far we are toward the next one (0 → 1). The interval
 * adapts to the measured arrivals; progress holds at 1 while a sample is late, so a graph stops at
 * the last reading instead of guessing ahead.
 */
export class FeedClock {
  private last: number | null = null;
  private dt: number;
  private measured = false;

  constructor(initialIntervalMs = 1000, private readonly adapt = 0.3) {
    this.dt = initialIntervalMs;
  }

  arrive(now = performance.now()): void {
    if (this.last === null) {
      this.last = now;
      return;
    }
    const gap = now - this.last;
    if (!this.measured) {
      // The first measured gap replaces the guess outright (a 2.5 s feed is not learned from 1 s).
      if (gap < 10_000) [this.dt, this.measured] = [gap, true];
    } else if (gap < this.dt * 4) {
      // A gap of several intervals is a pause (hidden tab, stalled feed), not a new rate.
      this.dt = lerp(this.dt, gap, this.adapt);
    }
    this.last = now;
  }

  progress(now = performance.now()): number {
    if (this.last === null) return 1;
    return Math.min(1, Math.max(0, (now - this.last) / this.dt));
  }

  get intervalMs(): number {
    return this.dt;
  }

  /** Whether a real gap has been measured (until then `intervalMs` is the initial guess). */
  get measuredInterval(): boolean {
    return this.measured;
  }
}

/** A chart point in a 0–100 wide space: [x, value]. */
export type ScrollPoint = [x: number, value: number];

/**
 * The arrival times of a history after it changed: one more sample appended (`n` = one longer),
 * or the oldest dropped and one appended (same length). Anything else (the first render, a
 * reset) spaces the samples one `intervalMs` apart, ending now.
 */
export function nextStamps(prev: readonly number[], n: number, now: number, intervalMs: number): number[] {
  if (prev.length === n - 1) return [...prev, now];
  if (prev.length === n && n > 0) return [...prev.slice(1), now];
  return Array.from({ length: n }, (_, i) => now - (n - 1 - i) * intervalMs);
}

/**
 * Points for a chart that scrolls by time: each sample sits where its arrival time falls in a
 * window of `windowMs` ending at `right`. Points right of 100 (not yet reached) and left of 0 are
 * clipped by the caller, which draws the segment into the newest sample as it scrolls in.
 */
export function timePoints(values: readonly number[], stamps: readonly number[], right: number, windowMs: number): ScrollPoint[] {
  return values.map((v, i) => [100 - ((right - stamps[i]) / windowMs) * 100, v]);
}

/** Two cascaded first-order filters: the output's rate of change is continuous when the input steps. */
class DoubleEase {
  private a: number | null = null;
  value: number | null = null;

  next(target: number, dtMs: number, tauMs: number): number {
    const k = 1 - Math.exp(-dtMs / (tauMs / 2));
    this.a = this.a === null ? target : lerp(this.a, target, k);
    this.value = this.value === null ? target : lerp(this.value, this.a, k);
    return this.value;
  }
}

/** How far the right edge's speed may drift from real time to keep its lag (0.05 = ±5 %). */
const MAX_DRIFT = 0.05;

/**
 * The scroll state of one smooth graph. The right edge trails the newest reading by about `lag`
 * sample intervals (riding out readings up to an interval late, or a repeated reading that adds no
 * sample), moves at real-time speed (drifting at most `MAX_DRIFT` to keep that lag), and holds at
 * the newest sample when the feed stalls. The window is
 * `lag + 2` intervals short of a full history (`capacity`), so the left edge stays covered while
 * the oldest sample scrolls out, and it keeps that width while the history fills.
 *
 * Feeds arrive unevenly (every 2–3 s is common), so the measured interval moves with every reading.
 * The lag follows it through two cascaded filters (`tauMs`), and only bends the edge's speed by
 * up to `MAX_DRIFT`. The width follows it far more slowly (`widthTauMs`): rescaling the window
 * moves every point sideways, and on a window of ~45 intervals even a 1 % change shows as a jolt.
 */
export class SmoothScroll {
  private readonly clock = new FeedClock(1000, 0.3);
  private stamps: number[] = [];
  private readonly lagIvl = new DoubleEase();
  private readonly widthIvl = new DoubleEase();
  private right = -Infinity;
  /** The time the graph's width spans (ms), as of the last frame; 0 before the first. */
  windowMs = 0;

  constructor(
    private readonly capacity: number,
    private readonly tauMs = 4000,
    private readonly widthTauMs = 30_000,
    private readonly lag = 2
  ) {}

  /** Record a new history of `n` samples (call once per sample, when the array changes). */
  arrive(n: number, now: number): void {
    this.clock.arrive(now);
    this.stamps = nextStamps(this.stamps, n, now, this.clock.intervalMs);
  }

  /** The interval the frame uses (eased toward the measured one). */
  get intervalMs(): number {
    return this.lagIvl.value ?? this.clock.intervalMs;
  }

  /**
   * The points to draw at `now`, `dtMs` after the last frame; null until the history is recorded
   * and the feed's interval measured (the lag is set from it, so the graph keeps its first paint).
   */
  frame(values: readonly number[], now: number, dtMs: number): ScrollPoint[] | null {
    const st = this.stamps;
    if (st.length !== values.length || st.length < 2 || !this.clock.measuredInterval) return null;
    const target = this.clock.intervalMs;
    const lagIvl = this.lagIvl.next(target, dtMs, this.tauMs);
    const widthIvl = this.widthIvl.next(target, dtMs, this.widthTauMs);
    // The right edge moves at real-time speed, drifting at most ±5 % (smoothly) toward its target
    // `lag` intervals behind: the speed never steps, whatever the readings' timing.
    const goal = now - lagIvl * this.lag;
    this.right = this.right === -Infinity ? goal : this.right + dtMs * (1 + MAX_DRIFT * Math.tanh((goal - this.right) / 1000));
    // held at the newest sample when the feed stalls
    this.right = Math.min(this.right, st[st.length - 1]);
    this.windowMs = (Math.max(this.capacity, values.length) - 2 - this.lag) * widthIvl;
    return timePoints(values, st, this.right, this.windowMs);
  }
}

/** How far (device px) a scrolling graph moves between redraws, and the longest it waits (ms). */
const MIN_MOVE_PX = 0.5;
const MAX_WAIT_MS = 200;

/**
 * The time (ms) a graph `widthPx` device pixels wide takes to scroll `MIN_MOVE_PX` across a window
 * of `windowMs`: a slow graph redrawn on every display frame moves a tenth of a pixel each time, so
 * it waits until the line has moved enough to see. 0 (every frame) while the width is unknown.
 */
export function scrollWaitMs(widthPx: number, windowMs: number): number {
  if (!(widthPx > 0) || !(windowMs > 0)) return 0;
  return Math.min(MAX_WAIT_MS, (MIN_MOVE_PX * windowMs) / widthPx);
}

/** Eases an axis range toward its target so the whole line never jumps when the scale changes. */
export class RangeEaser {
  private lo: number | null = null;
  private hi = 0;

  constructor(private readonly tauMs = 300) {}

  next(target: readonly [number, number], dtMs: number): [number, number] {
    if (this.lo === null) {
      this.lo = target[0];
      this.hi = target[1];
    } else {
      const a = 1 - Math.exp(-dtMs / this.tauMs);
      this.lo = lerp(this.lo, target[0], a);
      this.hi = lerp(this.hi, target[1], a);
    }
    return [this.lo, this.hi];
  }

  /** Whether the range is still moving toward `target` (more than 0.5 % of the span). */
  moving(target: readonly [number, number]): boolean {
    if (this.lo === null) return false;
    const span = Math.abs(target[1] - target[0]) || 1;
    return Math.abs(this.lo - target[0]) + Math.abs(this.hi - target[1]) > span * 0.005;
  }
}

/** Runs `cb` on the shared ticker (at most Max FPS a second) while `active`; write to DOM refs there, never set state. */
export function useAnimationFrame(cb: (now: number, dtMs: number) => void, active = true): void {
  const cbRef = useRef(cb);
  cbRef.current = cb;
  useEffect(() => {
    if (!active) return;
    let last = performance.now();
    // Up to 250 ms, so a 5 fps cap still moves at real-time speed.
    return subscribeTick((now) => {
      cbRef.current(now, Math.min(250, now - last));
      last = now;
    });
  }, [active]);
}
