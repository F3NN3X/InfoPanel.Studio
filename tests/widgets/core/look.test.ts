import { describe, expect, it } from "vitest";
import { chromeOf, STANDARD_DEFAULTS } from "@/modules/standard-settings";
import { surfaceBox } from "@/components/widget-style";
import { SKINS, SURFACES } from "@/widgets/core/theme";
import { DEFAULT_ACCENT, fadeBackground, forcedTier, lookBox, resolveAccent, shellPad, skinContext } from "@/widgets/core/look";
import type { Box } from "@/widgets/core/layout";

const look = (over: Record<string, string | number | boolean>) => chromeOf({ ...STANDARD_DEFAULTS, ...over });

describe("resolveAccent", () => {
  it("prefers an explicit accent over the skin's", () => {
    expect(resolveAccent("#ff0000", SKINS.synth)).toBe("#ff0000");
  });
});

describe("resolveAccent on light surfaces", () => {
  it("ignores the skin's accent on a light surface, not an explicit one", () => {
    expect(resolveAccent(undefined, SKINS.ink, "light")).toBe(DEFAULT_ACCENT);
    expect(resolveAccent(undefined, SKINS.ink, "dark")).toBe("#f4f4f5");
    expect(resolveAccent("#ff0000", SKINS.ink, "light")).toBe("#ff0000");
  });
});

describe("fadeBackground", () => {
  it("scales literal colours and mixes color-mix() with transparent", () => {
    expect(fadeBackground("rgba(20, 20, 24, 1)", 0.5)).toBe("rgba(20, 20, 24, 0.5)");
    const f = fadeBackground("radial-gradient(color-mix(in oklab, var(--accent) 38%, transparent), transparent 55%), #0f0f13", 0.5);
    expect(f).toContain("color-mix(in oklab, color-mix(in oklab, var(--accent) 38%, transparent) 50%, transparent)");
    expect(f).toContain("rgba(15, 15, 19, 0.5)");
  });
});

describe("forcedTier", () => {
  it("forces the Density tier", () => {
    expect(forcedTier({ sizeTier: "lg" }, undefined)).toBe("lg");
    expect(forcedTier({ sizeTier: "sm" }, "lg")).toBe("sm");
  });
});

const box = (w: number, h: number, size: Box["size"], shape: Box["shape"] = "box"): Box => ({ w, h, size, shape });

describe("shellPad", () => {
  it("uses the template's tier padding", () => {
    expect(shellPad({ box: box(600, 400, "lg"), studio: false, compact: false, tui: false })).toEqual({ className: "p-5" });
    expect(shellPad({ box: box(200, 100, "xs"), studio: false, compact: false, tui: false })).toEqual({ className: "p-2.5" });
    expect(shellPad({ box: box(300, 100, "xs", "strip"), studio: false, compact: true, tui: false }).className).toBe("px-4 py-2.5");
    expect(shellPad({ box: box(300, 200, "sm"), studio: true, compact: false, tui: false }).className).toBe("px-3 py-2.5");
    expect(shellPad({ box: box(300, 80, "xs"), studio: true, compact: false, tui: false }).className).toBe("px-3 py-0");
  });
});

describe("skinContext", () => {
  it("resolves graph and meter from the skin unless set", () => {
    expect(skinContext("tui")).toMatchObject({ skin: "tui", graph: "braille", meter: "blocks", stroke: 1, ring: 0.8 });
    expect(skinContext("tui", { graph: "line", meter: "auto" })).toMatchObject({ graph: "line", meter: "blocks" });
    expect(skinContext("default")).toMatchObject({ graph: "area", meter: "bar", ring: 1 });
  });
  it("multiplies the ring factor and graph strokes by the stroke option", () => {
    const ctx = skinContext("ios", { chrome: look({ stroke: 150 }) });
    expect(ctx.stroke).toBe(1.5);
    expect(ctx.ring).toBeCloseTo(1.7 * 1.5);
  });
});

describe("lookBox", () => {
  it("draws the app's materials through surfaceBox", () => {
    const chrome = look({ borderWidth: "2", glow: "soft", surfaceOpacity: 50, blur: "8" });
    const { color: _c, ...want } = surfaceBox(SURFACES.glass.colors!, chrome);
    expect(lookBox(SURFACES.glass, chrome)).toEqual(want);
    expect(lookBox(SURFACES.theme, undefined).boxShadow).toBe("inset 0 0 0 1px hsl(var(--border))");
  });
  it("adds border, glow, opacity and blur over a template surface", () => {
    const s = lookBox(SURFACES.solid, look({ borderWidth: "3", borderColor: "#ff0000", glow: "strong", surfaceOpacity: 50, blur: "4" }));
    expect(s.background).toBe("rgba(20, 20, 24, 0.5)");
    expect(s.boxShadow).toContain("inset 0 0 0 3px #ff0000");
    expect(s.boxShadow).toContain("inset 0 0 32px");
    expect(s.borderWidth).toBe(0);
    expect(s.backdropFilter).toBe("blur(min(4px, var(--wp-blur-cap, 4px)))");
    const neon = lookBox(SURFACES.neon, look({ glow: "soft" }));
    expect(String(neon.boxShadow).startsWith(String(SURFACES.neon.s.boxShadow))).toBe(true);
  });
});
