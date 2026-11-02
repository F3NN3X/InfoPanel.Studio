import { describe, expect, it } from "vitest";
import { laneColumns, laneRuns, laneStats } from "@/widgets/core/lanes";

const at = (t: number, v: number) => ({ t, v });

describe("laneColumns", () => {
  it("puts the oldest on the left and keeps the highest reading in a column", () => {
    const cols = laneColumns([at(100, 10), at(150, 95), at(900, 40)], 1000, 1000, 10);
    expect(cols[1]).toBe(95);
    expect(cols[9]).toBe(40);
    expect(cols.filter((c) => c === null)).toHaveLength(8);
  });

  it("drops samples outside the window and puts the newest in the last column", () => {
    const cols = laneColumns([at(-5, 1), at(1000, 7), at(1001, 9)], 1000, 1000, 4);
    expect(cols).toEqual([null, null, null, 7]);
  });
});

describe("laneRuns", () => {
  it("merges adjacent columns of one tone, so a lane is a few rects", () => {
    const runs = laneRuns([10, 20, 75, 80, 95, null, null, 10], 70, 90);
    expect(runs).toEqual([
      { from: 0, to: 2, tone: "ok" },
      { from: 2, to: 4, tone: "warn" },
      { from: 4, to: 5, tone: "crit" },
      { from: 5, to: 7, tone: null },
      { from: 7, to: 8, tone: "ok" },
    ]);
  });

  it("colours at the thresholds, boundary included, and is all ok without them", () => {
    expect(laneRuns([70, 90], 70, 90).map((r) => r.tone)).toEqual(["warn", "crit"]);
    expect(laneRuns([99, 100], undefined, undefined)).toEqual([{ from: 0, to: 2, tone: "ok" }]);
  });
});

describe("laneStats", () => {
  it("gives the peak and the share of readings at or above the warn level", () => {
    expect(laneStats([at(0, 10), at(1, 70), at(2, 95), at(3, 20)], 70)).toEqual({ peak: 95, pctAbove: 50 });
  });
  it("has no peak for no readings", () => {
    expect(laneStats([], 70)).toEqual({ peak: Number.NaN, pctAbove: 0 });
  });
});
