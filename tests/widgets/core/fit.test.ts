import { describe, expect, it } from "vitest";
import { fitFont, ringFont, textEm, valueFont } from "@/widgets/core/fit";

describe("textEm", () => {
  it("counts a figure, punctuation and the % at their own widths", () => {
    expect(textEm("00")).toBeCloseTo(1.24);
    expect(textEm("1.5")).toBeCloseTo(1.54);
    // the % is the widest glyph a reading has: wider than a figure
    expect(textEm("%")).toBeGreaterThan(textEm("0"));
    expect(textEm("")).toBe(0);
  });
});

describe("fitFont", () => {
  it("takes the tighter of the height and the width", () => {
    expect(fitFont(2, 400, 100)).toBe(100);
    expect(fitFont(4, 200, 100)).toBe(50);
    expect(fitFont(1, 400, 100, { lineHeight: 1.25 })).toBe(80);
  });

  it("keeps its floor, and has no width limit without text", () => {
    expect(fitFont(10, 50, 100, { min: 12 })).toBe(12);
    expect(fitFont(0, 10, 60)).toBe(60);
  });
});

describe("valueFont", () => {
  it("fills a large box and keeps the number and unit inside its width", () => {
    const px = valueFont("61", "°C", 300, 200);
    expect(px * (textEm("61") * 0.975 + textEm("°C") * 0.45 + 0.15)).toBeLessThanOrEqual(300.001);
    expect(px).toBeGreaterThan(80);
  });

  it("is height-bound in a wide box and never under 14 px", () => {
    expect(valueFont("61", "°C", 2000, 100)).toBe(100);
    expect(valueFont("1234.5", "MB/s", 20, 20)).toBe(14);
  });
});

describe("ringFont", () => {
  it("is 0.28 of the ring for a short number, less for a long one", () => {
    expect(ringFont("42", "", 0, 400)).toBeCloseTo(112);
    expect(ringFont("12345.6", "", 0, 400)).toBeLessThan(112);
    // with a unit beside the number the fit is narrower still
    expect(ringFont("100", "%", 0.45, 200)).toBeLessThanOrEqual(ringFont("100", "", 0, 200));
  });

  it("keeps a 12 px floor in a small ring", () => {
    expect(ringFont("42", "", 0, 20)).toBe(12);
  });
});
