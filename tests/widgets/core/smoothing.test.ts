import { describe, expect, it } from "vitest";
import { FeedClock, RangeEaser, SmoothScroll, nextStamps, timePoints } from "@/widgets/core/smoothing";

describe("nextStamps", () => {
  it("appends while the history grows and slides once it is full", () => {
    expect(nextStamps([0, 1000], 3, 2000, 1000)).toEqual([0, 1000, 2000]);
    expect(nextStamps([0, 1000, 2000], 3, 3100, 1000)).toEqual([1000, 2000, 3100]);
  });

});

describe("timePoints", () => {
  it("places each sample at its arrival time in the window", () => {
    expect(timePoints([1, 2, 3], [0, 1000, 2000], 2000, 2000)).toEqual([[0, 1], [50, 2], [100, 3]]);
  });

});

describe("FeedClock", () => {
  it("reports progress toward the next sample and holds at 1 while it is late", () => {
    const c = new FeedClock(1000);
    expect(c.progress(0)).toBe(1);
    c.arrive(1000);
    expect(c.progress(1500)).toBeCloseTo(0.5);
    expect(c.progress(5000)).toBe(1);
  });

});

describe("RangeEaser", () => {
  it("starts on the target and then eases toward a new one", () => {
    const e = new RangeEaser(300);
    expect(e.next([0, 100], 16)).toEqual([0, 100]);
    const [lo, hi] = e.next([0, 200], 300);
    expect(hi).toBeGreaterThan(100);
    expect(hi).toBeLessThan(200);
    expect(lo).toBe(0);
  });
});

describe("SmoothScroll on an uneven feed", () => {
  // Readings every 2–3 s at uneven times (as the Data API delivers network rates), drawn at 60 fps.
  const GAPS = [2000, 3000, 2100, 2900, 2500, 3000, 2000, 2600];
  const simulate = (ms: number, capacity = 48) => {
    const sc = new SmoothScroll(capacity);
    let values = [0];
    sc.arrive(values.length, 0);
    let next = GAPS[0];
    let k = 0;
    const frames: { t: number; x: number; pts: [number, number][] }[] = [];
    let last = 0;
    for (let t = 0; t <= ms; t += 1000 / 60) {
      if (t >= next) {
        values = [...values, values.length].slice(-capacity);
        sc.arrive(values.length, next);
        next += GAPS[++k % GAPS.length];
      }
      const pts = sc.frame(values, t, t - last);
      last = t;
      // track the reading whose value is 5 once it exists
      const at = pts?.find((p) => p[1] === 5);
      frames.push({ t, x: at ? at[0] : NaN, pts: pts ?? [] });
    }
    return frames;
  };

  it("moves a sample left without jolts at readings: no step back, no stop, speed changes gradually", () => {
    const f = simulate(60_000).filter((r) => Number.isFinite(r.x) && r.x > 0 && r.x < 100 && r.t > 20_000);
    expect(f.length).toBeGreaterThan(300);
    const steps = f.slice(1).map((r, i) => f[i].x - r.x);
    for (const s of steps) expect(s).toBeGreaterThan(0);
    // frame to frame the speed changes by under 1%: a reading never makes the line jump
    for (let i = 1; i < steps.length; i++) expect(Math.abs(steps[i] - steps[i - 1]) / steps[i - 1]).toBeLessThan(0.01);
  });

});
