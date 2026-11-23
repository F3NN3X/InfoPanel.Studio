import { describe, expect, it } from "vitest";
import { addSample, areaPoints } from "@/components/studio/alerts-chart-model";

describe("addSample", () => {
  it("starts again after a gap, so no line crosses it", () => {
    const trail = addSample(addSample([], 1, 0), 2, 1000);
    expect(addSample(trail, 3, 4000)).toHaveLength(3);
    expect(addSample(trail, 3, 4001)).toEqual([{ at: 4001, value: 3 }]);
  });
});

describe("areaPoints", () => {
  it("closes the line along the bottom edge, and draws nothing without a line", () => {
    expect(areaPoints("0.0,10.0 50.0,20.0", 100)).toBe("0.0,100 0.0,10.0 50.0,20.0 50.0,100");
    expect(areaPoints("", 100)).toBe("");
  });
});
