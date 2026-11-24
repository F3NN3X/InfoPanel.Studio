import { describe, expect, it } from "vitest";
import { adopted, adoptionText, coloursIn, lookColours, parseColour } from "@/widgets/widget-qa/adoption";
import cyberspec from "@/looks/packs/cyberspec/look.json";

const lch = (text: string) => parseColour(text)!;
/** Cyberspec Crimson's card tokens: the accent, its text and secondary text, the status tones and the card. */
const CRIMSON = ["#FF3B45", "#FFE4E1", "#D67A75", "#2BF59A", "#FFD23F", "#0E0E17", "#5EF6FF"].map(lch);

describe("the theme-adoption check's colours", () => {
  it("reads every form a browser computes a colour in, and none from a transparent or missing one", () => {
    expect(lch("rgb(255, 59, 69)")).toMatchObject({ a: 1 });
    expect(lch("rgba(255, 59, 69, 0.5)").a).toBe(0.5);
    // the same red written four ways lands on one OKLCH colour
    const red = lch("#ff3b45");
    for (const form of ["rgb(255 59 69)", "color(srgb 1 0.2314 0.2706)", "oklch(0.6566 0.2236 22.4)"]) {
      const c = lch(form);
      expect(Math.abs(c.l - red.l)).toBeLessThan(0.01);
      expect(Math.abs(c.c - red.c)).toBeLessThan(0.01);
    }
    expect(lch("oklab(0.5 0.1 -0.1 / 0.3)").a).toBe(0.3);
    expect(parseColour("transparent")).toBeUndefined();
    expect(parseColour("none")).toBeUndefined();
    expect(coloursIn("linear-gradient(90deg, rgb(1, 2, 3) 0%, oklch(0.5 0.1 120) 50%)")).toEqual(["rgb(1, 2, 3)", "oklch(0.5 0.1 120)"]);
  });

  it("keeps the Look's colours, their tints and shades, near blacks and washes, and flags a colour of its own", () => {
    // the accent itself, a darker shade of it, and the accent at 13 % (a dim track)
    expect(adopted(lch("#FF3B45"), CRIMSON)).toBe(true);
    expect(adopted(lch("#8f1f26"), CRIMSON)).toBe(true);
    expect(adopted(lch("rgba(46, 230, 120, 0.08)"), CRIMSON)).toBe(true);
    expect(adopted(lch("#101018"), CRIMSON)).toBe(true);
    // the Mixer's rotated channel colours under Crimson: a lime, a blue, a violet
    expect(adopted(lch("oklch(0.656 0.23 119)"), CRIMSON)).toBe(false);
    expect(adopted(lch("oklch(0.656 0.23 269)"), CRIMSON)).toBe(false);
    expect(adopted(lch("oklch(0.656 0.23 309)"), CRIMSON)).toBe(false);
    // a mid grey where the Look has no neutral of that lightness (the alerts' amber is not Cyberspec's yellow either)
    expect(adopted(lch("#71717a"), CRIMSON)).toBe(false);
    expect(adopted(lch("rgb(245, 159, 10)"), CRIMSON)).toBe(false);
  });

  it("takes the Look's own written colours from its T1 and T3 values and its pack CSS", () => {
    const colours = lookColours(cyberspec as never, "[data-part=num] { color: #5EF6FF; }");
    expect(colours).toEqual(expect.arrayContaining(["#FF3B45", "#1B3A42", "#0B0B12", "#5EF6FF"]));
  });

  it("reports the flagged frames worst first, with each flag under its frame", () => {
    const flag = { kind: "colour" as const, at: "div[fader-range]", prop: "background-color", value: "#0f0" };
    const text = adoptionText([
      { frame: "Clock 2x2", flags: [] },
      { frame: "StreamMixer 4x2", flags: [flag] },
      { frame: "StreamMixer view:strips", flags: [flag, { ...flag, value: "#00f" }] },
    ]);
    expect(text.split("\n")).toEqual([
      "2 of 3 frames flagged",
      "StreamMixer view:strips: 2",
      "  colour background-color #0f0 at div[fader-range]",
      "  colour background-color #00f at div[fader-range]",
      "StreamMixer 4x2: 1",
      "  colour background-color #0f0 at div[fader-range]",
    ]);
  });
});
