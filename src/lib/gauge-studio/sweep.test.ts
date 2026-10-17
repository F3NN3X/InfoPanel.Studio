import { describe, expect, it } from "vitest";
import { THEME_PRESETS } from "@/lib/theme";
import { previewScope, themeNameOf } from "./preview";
import { frameIndex, sweepAt } from "./sweep";

describe("sweep", () => {
  it("runs 0 to 1 and back over the period, and repeats", () => {
    const at = (t: number) => sweepAt(t, 1000);
    expect([at(0), at(250), at(500), at(750), at(1000)]).toEqual([0, 0.5, 1, 0.5, 0]);
    expect(at(1250)).toBe(0.5);
    expect(at(-250)).toBe(0.5);
  });

  it("stays at 0 for a bad period or time", () => {
    expect([sweepAt(100, 0), sweepAt(NaN, 1000), sweepAt(Infinity, 1000)]).toEqual([0, 0, 0]);
  });

  it("picks the image of a sequence at a value", () => {
    expect([frameIndex(0, 0.5), frameIndex(10, 0), frameIndex(10, 1), frameIndex(10, 0.5), frameIndex(10, 7), frameIndex(1, 0.9)]).toEqual([-1, 0, 9, 5, 9, 0]);
  });
});

describe("preview theme", () => {
  it("names a preset theme by its colours, null for a custom one", () => {
    const preset = THEME_PRESETS[1];
    expect(themeNameOf(preset.tokens)).toBe(THEME_PRESETS.find((t) => t.tokens.accent === preset.tokens.accent && t.tokens.foreground === preset.tokens.foreground)!.label);
    expect(themeNameOf({ accent: "1 2% 3%", foreground: "4 5% 6%" })).toBeNull();
  });

  it("feeds the theme accent to the widget variable", () => {
    expect(previewScope({ accent: "240 5% 65%" })).toEqual({ "--accent": "hsl(240 5% 65%)" });
  });
});
