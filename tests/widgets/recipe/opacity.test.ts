import { describe, expect, it } from "vitest";
import { inkOf, type Ink, readableStep } from "@/widgets/recipe/opacity";

// The opacity clamp (Phase E, G22): a faded text is drawn at the lowest step from the one asked for that keeps 4.5:1 on its card, with the
// app's own contrast (`contrastOf`). Cards: Classic's dark glass (its export colour, #18181b) and a light card (`LIGHT_FILL`, #f4f4f5),
// with the text colours each draws (`DARK_TEXT` #f4f4f5 / #a1a1aa; the light text set's #18181b / #52525b in widgets/core/theme.ts).

const rgb = (hex: string): [number, number, number] => [1, 3, 5].map((k) => parseInt(hex.slice(k, k + 2), 16)) as [number, number, number];
const solid = (hex: string): Ink => ({ rgb: rgb(hex), alpha: 1 });
const DARK_CARD = rgb("#18181b");
const LIGHT_CARD = rgb("#f4f4f5");
const dark = { fg: solid("#f4f4f5"), muted: solid("#a1a1aa") };
const light = { fg: solid("#18181b"), muted: solid("#52525b") };

describe("readableStep", () => {
  it("on a dark card: the text colour at 40 % is raised to 60 %, muted to 80 %; a step that holds is kept", () => {
    expect(readableStep(40, [dark.fg], DARK_CARD)).toBe(60);
    expect(readableStep(40, [dark.muted], DARK_CARD)).toBe(80);
    expect(readableStep(80, [dark.fg], DARK_CARD)).toBe(80);
    expect(readableStep(60, [dark.fg], DARK_CARD)).toBe(60);
  });

  it("on a light card: the text colour at 40 % is raised to 80 % (just under 4.5:1 at 60 %); muted, under 4.5:1 at 80 %, is drawn whole", () => {
    expect(readableStep(40, [light.fg], LIGHT_CARD)).toBe(80);
    expect(readableStep(80, [light.fg], LIGHT_CARD)).toBe(80);
    expect(readableStep(80, [light.muted], LIGHT_CARD)).toBe(100);
  });

  it("every colour a text draws holds: a value's number and its muted label take the step the fainter one needs", () => {
    expect(readableStep(40, [dark.fg, dark.muted], DARK_CARD)).toBe(80);
  });

  it("a colour under 4.5:1 even whole is drawn whole, never fainter; an ink's own alpha counts", () => {
    expect(readableStep(40, [solid("#3f3f46")], DARK_CARD)).toBe(100);
    expect(readableStep(60, [{ ...dark.fg, alpha: 0.5 }], DARK_CARD)).toBe(100);
  });
});

describe("inkOf", () => {
  it("reads what a browser computes: rgb(), rgba(), transparent and color(srgb) from a color-mix; nothing else", () => {
    expect(inkOf("rgb(244, 244, 245)")).toEqual({ rgb: [244, 244, 245], alpha: 1 });
    expect(inkOf("rgba(255, 255, 255, 0.07)")).toEqual({ rgb: [255, 255, 255], alpha: 0.07 });
    expect(inkOf("rgba(0, 0, 0, 0)")?.alpha).toBe(0);
    expect(inkOf("transparent")?.alpha).toBe(0);
    expect(inkOf("color(srgb 1 1 1 / 0.11)")).toEqual({ rgb: [255, 255, 255], alpha: 0.11 });
    expect(inkOf("color(srgb 0 0.5 1)")).toEqual({ rgb: [0, 127.5, 255], alpha: 1 });
    expect(inkOf("oklab(0.5 0 0 / 0.1)")).toBeUndefined();
    expect(inkOf("#18181b")).toBeUndefined();
  });
});
