// The colour reader a pack's contrast is judged on (L-8): an alpha is laid over the colour it is drawn on, whatever syntax that colour has.
import { describe, expect, it } from "vitest";
import { cssColour, flatOver, parseColour } from "@/looks/colour";

describe("flatOver", () => {
  it("lays an alpha over a short hex, an rgb() or an hsl() colour underneath, as it does over #rrggbb", () => {
    const want = flatOver("rgba(0, 0, 0, 0.9)", "#ffffff");
    expect(want).toBe("#191919");
    expect(flatOver("rgba(0, 0, 0, 0.9)", "#fff")).toBe(want);
    expect(flatOver("rgba(0, 0, 0, 0.9)", "rgb(255, 255, 255)")).toBe(want);
    expect(flatOver("rgba(0, 0, 0, 0.9)", "hsl(0 0% 100%)")).toBe(want);
  });

  it("returns the value unchanged where the colour underneath cannot be read", () => {
    expect(flatOver("rgba(0, 0, 0, 0.9)", "var(--x)")).toBe("rgba(0, 0, 0, 0.9)");
    expect(flatOver("rgba(0, 0, 0, 0.9)", "")).toBe("rgba(0, 0, 0, 0.9)");
  });

  it("does not need the colour underneath for an opaque colour", () => {
    expect(flatOver("rgb(1, 2, 3)", "var(--x)")).toBe("#010203");
    expect(flatOver("#abcdef", "nonsense")).toBe("#abcdef");
  });
});

describe("parseColour", () => {
  it("refuses an hsl() hue with a unit other than deg, rather than reading it as degrees", () => {
    expect(parseColour("hsl(0.5turn 50% 40%)")).toBeUndefined();
    expect(parseColour("hsl(3.14rad 50% 40%)")).toBeUndefined();
    expect(parseColour("hsl(100grad 50% 40%)")).toBeUndefined();
    expect(parseColour("hsl(120deg 50% 40%)")?.hex).toBe(parseColour("hsl(120 50% 40%)")?.hex);
  });
});

describe("parseColour: oklch()", () => {
  it("reads the sRGB primaries and the greys", () => {
    expect(parseColour("oklch(1 0 0)")).toEqual({ hex: "#ffffff", alpha: 1 });
    expect(parseColour("oklch(0 0 0)")).toEqual({ hex: "#000000", alpha: 1 });
    expect(parseColour("oklch(0.5 0 0)")?.hex).toBe("#636363");
    expect(parseColour("oklch(0.62796 0.25768 29.234)")?.hex).toBe("#ff0000");
    expect(parseColour("oklch(0.86644 0.29483 142.495)")?.hex).toBe("#00ff00");
  });

  it("reads a percent lightness, a percent chroma, a deg or none hue and an alpha as a number or a percent", () => {
    const want = parseColour("oklch(0.7 0.1 200)");
    expect(parseColour("oklch(70% 25% 200deg)")).toEqual(want);
    expect(parseColour("OKLCH( 0.7  0.1  200 )")).toEqual(want);
    expect(parseColour("oklch(0.7 0.1 560)")).toEqual(want);
    expect(parseColour("oklch(0.7 0.1 none)")).toEqual(parseColour("oklch(0.7 0.1 0)"));
    expect(parseColour("oklch(0.7 0.1 200 / 0.5)")).toEqual({ ...want, alpha: 0.5 });
    expect(parseColour("oklch(0.7 0.1 200 / 50%)")).toEqual({ ...want, alpha: 0.5 });
  });

  it("clamps an out-of-gamut colour by reducing chroma at the same lightness and hue", () => {
    const wild = parseColour("oklch(0.7 0.4 150)")!;
    expect(wild.hex).toMatch(/^#[\da-f]{6}$/);
    // the clamp lands where a smaller chroma of the same lightness and hue lands
    let fit = 0.399;
    while (fit > 0 && parseColour(`oklch(0.7 ${fit} 150)`)?.hex !== wild.hex) fit -= 0.0005;
    expect(fit).toBeGreaterThan(0.1);
    expect(fit).toBeLessThan(0.4);
    // lightness over 1 is white, and a lightness under 0 is black
    expect(parseColour("oklch(1.4 0.3 20)")?.hex).toBe("#ffffff");
    expect(parseColour("oklch(-0.2 0.3 20)")?.hex).toBe("#000000");
  });

  it("refuses what it cannot read: a comma list, a negative chroma, another hue unit, a missing channel, a stray word or var()", () => {
    for (const bad of ["oklch(0.7, 0.1, 200)", "oklch(0.7 -0.1 200)", "oklch(0.7 0.1 0.5turn)", "oklch(0.7 0.1)", "oklch(0.7 0.1 200 0.5)", "oklch(0.7 0.1 200 / red)", "oklch(var(--l) 0.1 200)", "oklch(0.7 0.1 200) red", "oklch(from red l c h)", "oklab(0.7 0.1 0.1)"]) expect(parseColour(bad), bad).toBeUndefined();
  });
});

describe("cssColour", () => {
  it("writes an oklch() as its clamped hex, with the alpha as a byte, and leaves every other value as it is", () => {
    expect(cssColour("oklch(0.62796 0.25768 29.234)")).toBe("#ff0000");
    expect(cssColour("oklch(1 0 0 / 0.5)")).toBe("#ffffff80");
    expect(cssColour("#abc")).toBe("#abc");
    expect(cssColour("rgb(1, 2, 3)")).toBe("rgb(1, 2, 3)");
    expect(cssColour("oklch(0.7 0.1)")).toBe("oklch(0.7 0.1)");
  });
});
