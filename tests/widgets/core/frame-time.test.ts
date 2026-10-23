import { describe, expect, it } from "vitest";
import { clampSpikes, frameBudgets, frameSample, frameTimeTop } from "@/widgets/core/frame-time";

describe("frameSample", () => {
  it("keeps a reading that fits the frame rate, stutters included", () => {
    expect(frameSample(17.2, 60)).toBe(17.2);
    expect(frameSample(120, 60)).toBe(120);
  });

  it("replaces a reading far faster than the frame rate with the second's average", () => {
    // RTSS sent 0.13 ms at 130 fps
    expect(frameSample(0.13, 130)).toBeCloseTo(1000 / 130);
  });

  it("falls back to the average without a reading, and to NaN without either", () => {
    expect(frameSample(Number.NaN, 50)).toBe(20);
    expect(frameSample(0, 50)).toBe(20);
    expect(frameSample(16, 0)).toBe(16);
    expect(frameSample(Number.NaN, Number.NaN)).toBeNaN();
  });
});

describe("frameTimeTop", () => {
  it("sits a round step above the slowest budget line", () => {
    // 60 Hz is 16.7 ms: 1.5× is 25
    expect(frameTimeTop([16, 17, 16.5], [1000 / 240, 1000 / 60])).toBe(25);
  });

  it("ignores the two slowest samples, so one load spike doesn't flatten the line", () => {
    expect(frameTimeTop([16, 17, 2004, 900, 18], [1000 / 60])).toBe(25);
  });

  it("grows in steps once stutters repeat", () => {
    expect(frameTimeTop([16, 40, 45, 42, 17], [1000 / 60])).toBe(50);
  });

  it("caps at the largest step", () => {
    expect(frameTimeTop([5000, 5000, 5000], [])).toBe(1000);
  });
});

describe("frameBudgets", () => {
  it("lists each rate once, skipping unknown ones", () => {
    expect(frameBudgets([60, 60, 0, Number.NaN]).map((b) => b.hz)).toEqual([60]);
    expect(frameBudgets([240, 60])).toEqual([
      { hz: 240, ms: 1000 / 240 },
      { hz: 60, ms: 1000 / 60 },
    ]);
  });
});

describe("clampSpikes", () => {
  it("cuts a loading-screen spike to 1.25× the third-largest reading", () => {
    expect(clampSpikes([60, 61, 59, 708, 60])).toEqual([60, 61, 59, 75, 60]);
  });

  it("leaves a short or empty history alone", () => {
    expect(clampSpikes([60, 700])).toEqual([60, 700]);
    expect(clampSpikes([])).toEqual([]);
  });
});
