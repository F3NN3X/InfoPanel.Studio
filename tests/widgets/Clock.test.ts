import { describe, expect, it } from "vitest";
import { DATE_EM, datePx, timePx } from "@/widgets/Clock";

describe("timePx", () => {
  it("holds a tier's size below lg", () => {
    expect(timePx("md", 1000, 1000, false, false, false)).toBe(72);
    expect(timePx("xs", 1000, 1000, false, false, false)).toBe(30);
  });

  it("grows with the box at lg, past the old 96 px cap", () => {
    expect(timePx("lg", 800, 320, true, false, true)).toBeGreaterThan(96);
    expect(timePx("lg", 2000, 600, false, false, false)).toBe(Math.round(600 * 0.62));
  });

  it("fits the time, the seconds and the date line in the box", () => {
    const px = timePx("lg", 600, 320, true, false, true);
    expect(px * (1.08 + DATE_EM * 1.3)).toBeLessThanOrEqual(320);
    // narrow: the width decides
    expect(timePx("lg", 300, 2000, true, true, false)).toBeLessThan(300 / 3.2);
  });

  it("keeps the date readable under a small time", () => {
    expect(datePx("xs", 30)).toBe(11);
    expect(datePx("lg", 300)).toBe(51);
  });
});
