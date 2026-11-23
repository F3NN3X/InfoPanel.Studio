import { describe, expect, it } from "vitest";
import { offsetsOf, rowAt, stickyBefore, windowRange } from "@/lib/virtual-window";

const HEAD = 30;
const ROW = 50;
/** A header, nine rows, a header, nine rows. */
const rows = Array.from({ length: 20 }, (_, i) => ({ head: i % 10 === 0 }));
const heightOf = (r: { head: boolean }) => (r.head ? HEAD : ROW);

describe("offsetsOf", () => {
  it("lists each row's top and ends with the total height", () => {
    const offsets = offsetsOf(rows, heightOf);
    expect(offsets).toHaveLength(21);
    expect(offsets.slice(0, 3)).toEqual([0, 30, 80]);
    expect(offsets[10]).toBe(30 + 9 * ROW);
    expect(offsets[20]).toBe(2 * HEAD + 18 * ROW);
  });

  it("is just [0] for no rows", () => {
    expect(offsetsOf([], heightOf)).toEqual([0]);
  });
});

describe("rowAt", () => {
  const offsets = offsetsOf(rows, heightOf);
  it("finds the row holding a y, clamped to the list", () => {
    expect(rowAt(offsets, 0)).toBe(0);
    expect(rowAt(offsets, 29)).toBe(0);
    expect(rowAt(offsets, 30)).toBe(1);
    expect(rowAt(offsets, 1e9)).toBe(19);
    expect(rowAt(offsets, -5)).toBe(0);
  });
});

describe("windowRange", () => {
  const long = offsetsOf(Array.from({ length: 1000 }, () => ({ head: false })), heightOf);

  it("starts at row 0 at the top, with overscan below", () => {
    expect(windowRange(long, 0, ROW * 10, 5)).toEqual({ start: 0, end: 16 });
  });

  it("adds overscan either side in the middle", () => {
    expect(windowRange(long, ROW * 500, ROW * 10, 5)).toEqual({ start: 495, end: 516 });
  });

  it("stops at the last row at the end", () => {
    expect(windowRange(long, ROW * 1000, ROW * 10, 5).end).toBe(1000);
  });

  it("is empty for an empty list", () => {
    expect(windowRange([0], 0, 100)).toEqual({ start: 0, end: 0 });
  });

  it("draws a bounded number of rows however long the list is", () => {
    const { start, end } = windowRange(long, ROW * 321, ROW * 10);
    expect(end - start).toBeLessThan(30);
  });
});

describe("stickyBefore", () => {
  const isHead = (r: { head: boolean }) => r.head;
  it("finds the header governing a row", () => {
    expect(stickyBefore(rows, 0, isHead)).toBe(0);
    expect(stickyBefore(rows, 9, isHead)).toBe(0);
    expect(stickyBefore(rows, 10, isHead)).toBe(10);
    expect(stickyBefore(rows, 15, isHead)).toBe(10);
  });

  it("clamps an index past the end and reports -1 when no header comes first", () => {
    expect(stickyBefore(rows, 99, isHead)).toBe(10);
    expect(stickyBefore([{ head: false }, { head: true }], 0, isHead)).toBe(-1);
    expect(stickyBefore([], 0, isHead)).toBe(-1);
  });
});
