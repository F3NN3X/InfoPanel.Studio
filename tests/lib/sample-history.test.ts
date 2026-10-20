import { describe, expect, it } from "vitest";
import { HISTORY_SIZE, barHeights, SampleHistory, recordSnapshot, recordThrottled } from "@/lib/sample-history";

describe("SampleHistory", () => {
  it("keeps samples oldest first and reports min / avg / max", () => {
    const h = new SampleHistory();
    [4, 8, 6].forEach((v) => h.push("a", v));
    expect(h.get("a")).toEqual([4, 8, 6]);
    expect(h.stats("a")).toEqual({ min: 4, avg: 6, max: 8 });
  });

  it("overwrites the oldest sample once full", () => {
    const h = new SampleHistory(3);
    [1, 2, 3, 4, 5].forEach((v) => h.push("a", v));
    expect(h.get("a")).toEqual([3, 4, 5]);
    expect(h.stats("a")).toEqual({ min: 3, avg: 4, max: 5 });
  });

  it("holds 24 samples by default, per key", () => {
    const h = new SampleHistory();
    for (let i = 0; i < 40; i++) h.push("a", i);
    h.push("b", 9);
    expect(HISTORY_SIZE).toBe(24);
    expect(h.get("a")).toHaveLength(24);
    expect(h.get("a")[0]).toBe(16);
    expect(h.get("b")).toEqual([9]);
  });

  it("has no stats before a sample, and forgets on clear", () => {
    const h = new SampleHistory();
    expect(h.get("a")).toEqual([]);
    expect(h.stats("a")).toBeNull();
    h.push("a", 1);
    h.clear();
    expect(h.get("a")).toEqual([]);
  });
});

describe("recordSnapshot", () => {
  it("records numeric readings only", () => {
    const h = new SampleHistory();
    recordSnapshot(h, {
      "cpu": { value: 12, unit: "%" },
      "title": { text: "hello", unit: "" },
      "bad": { value: Number.NaN, unit: "" },
    });
    expect(h.get("cpu")).toEqual([12]);
    expect(h.get("title")).toEqual([]);
    expect(h.get("bad")).toEqual([]);
  });
});

describe("recordThrottled", () => {
  const snap = { cpu: { value: 1, unit: "%" } };

  it("records once per gap however many messages arrive", () => {
    const h = new SampleHistory();
    expect(recordThrottled(h, snap, 1000)).toBe(true);
    expect(recordThrottled(h, snap, 1300)).toBe(false);
    expect(recordThrottled(h, snap, 1600)).toBe(false);
    expect(recordThrottled(h, snap, 1950)).toBe(true);
    expect(h.get("cpu")).toEqual([1, 1]);
  });

  it("starts over after clear()", () => {
    const h = new SampleHistory();
    recordThrottled(h, snap, 1000);
    h.clear();
    expect(h.get("cpu")).toEqual([]);
    expect(recordThrottled(h, snap, 1100)).toBe(true);
  });
});

describe("barHeights", () => {
  it("scales samples between 20% and 100%", () => {
    expect(barHeights([10, 20, 30])).toEqual([20, 60, 100]);
  });

  it("draws a flat series at 20% and nothing for no samples", () => {
    expect(barHeights([5, 5])).toEqual([20, 20]);
    expect(barHeights([])).toEqual([]);
  });
});
