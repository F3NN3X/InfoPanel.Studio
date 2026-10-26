import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SeriesStore, useSeries, type SeriesLimits } from "@/widgets/core/history";

const limits: SeriesLimits = { maxAgeMs: 10_000, maxCount: 5, minGapMs: 500 };

describe("SeriesStore", () => {
  it("keeps time-stamped samples oldest first", () => {
    const s = new SeriesStore(limits);
    s.push("a", 1, 0);
    s.push("a", 2, 1000);
    expect(s.read("a")).toEqual([
      { t: 0, v: 1 },
      { t: 1000, v: 2 },
    ]);
    expect(s.read("missing")).toEqual([]);
  });

  it("skips non-finite readings and readings inside the minimum gap", () => {
    const s = new SeriesStore(limits);
    expect(s.push("a", Number.NaN, 0)).toBe(false);
    expect(s.push("a", 1, 0)).toBe(true);
    expect(s.push("a", 2, 499)).toBe(false);
    expect(s.push("a", 3, 500)).toBe(true);
    expect(s.read("a").map((x) => x.v)).toEqual([1, 3]);
  });

  it("evicts the oldest past maxCount, so a key never holds more", () => {
    const s = new SeriesStore(limits);
    for (let i = 0; i < 20; i++) s.push("a", i, i * 1000);
    expect(s.read("a")).toHaveLength(5);
    expect(s.read("a").map((x) => x.v)).toEqual([15, 16, 17, 18, 19]);
  });

  it("evicts samples older than maxAge, boundary included", () => {
    const s = new SeriesStore({ ...limits, maxCount: 100 });
    s.push("a", 1, 0);
    s.push("a", 2, 5000);
    s.push("a", 3, 10_000); // exactly maxAge from the first: kept
    expect(s.read("a").map((x) => x.v)).toEqual([1, 2, 3]);
    s.push("a", 4, 10_600);
    expect(s.read("a").map((x) => x.v)).toEqual([2, 3, 4]);
    s.push("a", 5, 60_000);
    expect(s.read("a").map((x) => x.v)).toEqual([5]);
  });

  it("bounds the total by keys × maxCount, retains only wanted keys and clears", () => {
    const s = new SeriesStore(limits);
    for (const k of ["a", "b", "c"]) for (let i = 0; i < 50; i++) s.push(k, i, i * 1000);
    expect(s.size).toBe(15);
    s.retain(["b"]);
    expect(s.size).toBe(5);
    expect(s.read("a")).toEqual([]);
    s.clear();
    expect(s.size).toBe(0);
  });
});

describe("useSeries", () => {
  it("records the readings of the data it is given", () => {
    let store!: SeriesStore;
    const data = {};
    const Probe = ({ v }: { v: number }) => {
      store = useSeries(data, { a: v }, { ...limits, minGapMs: 0 });
      return null;
    };
    renderToString(createElement(Probe, { v: 1 }));
    expect(store.read("a")).toHaveLength(1);
  });
});
