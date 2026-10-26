import { describe, expect, it } from "vitest";
import { frameHistogram, frameLows, histogramTop, percentile } from "@/widgets/core/histogram";

describe("percentile", () => {
  it("is the nearest-rank value, NaN for none, and ignores non-finite values", () => {
    const v = Array.from({ length: 100 }, (_, i) => i + 1);
    expect(percentile(v, 0.99)).toBe(99);
    expect(percentile(v, 0.999)).toBe(100);
    expect(percentile(v, 0.5)).toBe(50);
    expect(percentile([], 0.99)).toBeNaN();
    expect(percentile([NaN, 5], 0.99)).toBe(5);
  });
});

describe("frameLows", () => {
  it("reads the 1 % and 0.1 % lows off the slowest frames, as ms and fps", () => {
    const frames = [...Array.from({ length: 998 }, () => 10), 30, 50];
    const l = frameLows(frames);
    expect(l.low1).toBe(10);
    expect(l.low01).toBe(30);
    expect(l.low01Fps).toBeCloseTo(33.33, 1);
    expect(frameLows([20]).low1Fps).toBe(50);
  });

  it("is NaN without frames", () => {
    expect(frameLows([]).low1Fps).toBeNaN();
  });
});

describe("frameHistogram", () => {
  it("counts every frame once, in 1-ms-wide bins on a 24 ms axis", () => {
    const h = frameHistogram([2.5, 2.9, 16.7, 16.7, 16.7, 23.99], 24, 24);
    expect(h.total).toBe(6);
    expect(h.bins).toHaveLength(24);
    expect(h.bins[2].count).toBe(2);
    expect(h.bins[16].count).toBe(3);
    expect(h.bins[23].count).toBe(1);
    expect(h.peak).toBe(3);
    expect(h.bins.reduce((a, b) => a + b.count, 0)).toBe(6);
  });

  it("puts frames slower than the axis in the last bin and drops invalid readings", () => {
    const h = frameHistogram([500, NaN, -1, 5], 10, 20);
    expect(h.total).toBe(2);
    expect(h.bins[9].count).toBe(1);
    expect(h.bins[2].count).toBe(1);
  });

  it("is empty with a peak of 1 for no frames", () => {
    const h = frameHistogram([]);
    expect(h.total).toBe(0);
    expect(h.peak).toBe(1);
  });

  it("snaps the axis top to a step above the slowest frames", () => {
    expect(histogramTop([])).toBe(20);
    expect(histogramTop([8, 9, 10])).toBe(20);
    expect(histogramTop([8, 9, 22])).toBe(25);
    expect(histogramTop([8, 9, 30])).toBe(40);
    expect(histogramTop([9, 5000])).toBe(250);
  });
});
