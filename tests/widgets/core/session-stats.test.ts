import { describe, expect, it } from "vitest";
import { MAX_STEP_MS, average, durationText, observe, type SessionStat } from "@/widgets/core/session-stats";

const run = (readings: [number, number][], above = 80): SessionStat | undefined => readings.reduce<SessionStat | undefined>((s, [t, v]) => observe(s, v, t, above), undefined);

describe("observe", () => {
  it("tracks min and max", () => {
    const s = run([[0, 50], [1000, 90], [2000, 20]])!;
    expect([s.min, s.max, s.n]).toEqual([20, 90, 3]);
  });

  it("weights the average by how long each reading held, not by how many there were", () => {
    // 10 for 3 s, then 40 for 1 s
    const s = run([[0, 10], [3000, 40], [4000, 0]])!;
    expect(average(s)).toBeCloseTo((10 * 3 + 40 * 1) / 4, 6);
  });

  it("counts time at or above the level, boundary included", () => {
    const s = run([[0, 79], [1000, 80], [3000, 81], [4000, 10], [5000, 10]])!;
    // 79 held 1 s (below), 80 held 2 s, 81 held 1 s, 10 held 1 s (below)
    expect(s.aboveMs).toBe(3000);
  });

  it("caps a long gap, so a hidden tab does not count as hours at the level", () => {
    const s = run([[0, 90], [10 * 60_000, 90]])!;
    expect(s.aboveMs).toBe(MAX_STEP_MS);
    expect(s.coveredMs).toBe(MAX_STEP_MS);
  });

  it("ignores a reading that is not a number and keeps the totals", () => {
    const s = run([[0, 10], [1000, NaN], [2000, 30]])!;
    expect([s.min, s.max, s.n]).toEqual([10, 30, 2]);
    expect(observe(undefined, NaN, 0, 80).n).toBe(0);
  });

  it("does not run time backwards", () => {
    const s = run([[5000, 90], [1000, 90]])!;
    expect(s.aboveMs).toBe(0);
  });
});

describe("average and durationText", () => {
  it("falls back to the only reading, NaN for none", () => {
    expect(average(run([[0, 42]])!)).toBe(42);
    expect(average(observe(undefined, NaN, 0, 80))).toBeNaN();
  });

  it("writes seconds, minutes and hours", () => {
    expect(durationText(0)).toBe("0 s");
    expect(durationText(42_000)).toBe("42 s");
    expect(durationText(7 * 60_000)).toBe("7 min");
    expect(durationText(65 * 60_000)).toBe("1 h 05 min");
  });
});
