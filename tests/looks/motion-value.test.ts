// A value's count and roll (src/looks/motion-value.ts): a figure counts in the new reading's format and lands on it exactly; any other text
// rolls only the digits that changed, compared from the right.
import { describe, expect, it } from "vitest";
import { countAt, countOf, figureOf, rollOf } from "@/looks/motion-value";

describe("a value's count", () => {
  it("reads a figure with its words, decimals and grouping, and nothing that is not one number", () => {
    expect(figureOf("41.5 %")).toEqual({ head: "", value: 41.5, decimals: 1, grouped: false, tail: " %" });
    expect(figureOf("-3°")).toMatchObject({ value: -3, tail: "°" });
    expect(figureOf("1,024 MB")).toMatchObject({ value: 1024, grouped: true });
    expect(figureOf("12:34")).toBeUndefined();
    expect(figureOf("–")).toBeUndefined();
    expect(figureOf("v2 build 7")).toBeUndefined();
  });

  it("counts between two figures with the same words, in the new one's format, and ends on it", () => {
    const c = countOf("40.0", "50.5")!;
    expect(countAt(c, 0)).toBe("40.0");
    expect(countAt(c, 0.5)).toMatch(/^4\d\.\d$/);
    expect(countAt(c, 1)).toBe("50.5");
    expect(countAt(countOf("999", "1,200")!, 1)).toBe("1,200");
    expect(countOf("40 %", "41 MB")).toBeUndefined();
    expect(countOf("40", "40")).toBeUndefined();
  });

  it("rolls only the digits that changed, from the right", () => {
    expect(rollOf("12:34", "12:35")).toEqual([{ ch: "1" }, { ch: "2" }, { ch: ":" }, { ch: "3" }, { ch: "5", from: "4" }]);
    expect(rollOf("9", "10")).toEqual([{ ch: "1", from: " " }, { ch: "0", from: "9" }]);
    expect(rollOf("ok", "ok").some((c) => c.from !== undefined)).toBe(false);
  });
});
