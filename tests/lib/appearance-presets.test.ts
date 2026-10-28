import { describe, expect, it } from "vitest";
import { PROFILE_STYLE_KEYS } from "@/modules/standard-settings";
import {
  applyAppearancePreset,
  duplicateAppearancePreset,
  presetFromCurrent,
  saveThemeAt,
  themeFromScope,
  updateAppearancePreset,
} from "@/lib/appearance-preset-apply";
import {
  invalidStyleKeys,
  isValidStyleValue,
  presetTokens,
  type AppearancePreset,
} from "@/lib/appearance-presets";
import { normalizeBackground, type PageBackground } from "@/lib/appearance";
import { applyTheme } from "@/lib/theme-apply";
import type { DashboardConfig, MonitorProfile, Placement } from "@/lib/layout";
import { mainPage } from "@/lib/pages";
import { DEFAULT_THEME, THEME_PRESETS } from "@/lib/theme";

const zone = (id: string, extra: Partial<Placement> = {}): Placement => ({
  id,
  module: "SystemOverview",
  colStart: 1,
  rowStart: 1,
  colSpan: 1,
  rowSpan: 1,
  visible: true,
  ...extra,
});

const profile = (id: string, extra: Partial<MonitorProfile> = {}): MonitorProfile => ({
  id,
  name: id,
  width: 1920,
  height: 1080,
  cols: 12,
  rows: 6,
  fit: "scroll",
  pages: [mainPage([
    zone("plain"),
    zone("content-only", { settings: { label: "CPU", sensor: "x" } }),
    zone("own-look", { settings: { accent: "#ff0000", label: "Net" }, follow: { colors: false } }),
    zone("follows", { settings: { accent: "#ff0000" } }),
  ])],
  ...extra,
});

const config = (extra: Partial<DashboardConfig> = {}): DashboardConfig => ({
  version: 16,
  activeProfile: "auto",
  profiles: [profile("p1"), profile("p2")],
  ...extra,
});

const P1 = { kind: "profile", profileId: "p1" } as const;
const P2 = { kind: "profile", profileId: "p2" } as const;
// Saved themes as the user would store them (the former Glass and Light built-ins).
const glass: AppearancePreset = {
  id: "look-glass",
  name: "Glass",
  description: "See-through blurred cards over a colour wash",
  theme: "zinc",
  radius: 0.75,
  style: { surface: "glass", surfaceOpacity: 60, blur: "16", borderWidth: "1", borderColor: "#ffffff26" },
  background: { type: "image", src: "/assets/bg/aurora.png", fit: "cover", dim: 20 },
};
const light: AppearancePreset = {
  id: "look-light",
  name: "Light",
  description: "Paper theme, light cards everywhere",
  theme: "paper",
  radius: 0.75,
  style: { surface: "theme" },
};

describe("look fixtures", () => {
  it.each([glass, light].map((p) => [p.name, p] as const))("%s uses valid look keys, options, theme and background", (_, preset) => {
    expect(Object.keys(preset.style).every((k) => PROFILE_STYLE_KEYS.has(k))).toBe(true);
    expect(invalidStyleKeys(preset.style)).toEqual([]);
    expect(THEME_PRESETS.some((t) => t.tokens === presetTokens(preset))).toBe(true);
    if (preset.background) expect(normalizeBackground(preset.background)).toEqual(preset.background);
  });
});

describe("isValidStyleValue", () => {
  it("checks values against the setting's options", () => {
    expect(isValidStyleValue("blur", "16")).toBe(true);
    expect(isValidStyleValue("blur", "28")).toBe(false);
    expect(isValidStyleValue("surface", "none")).toBe(false);
    expect(isValidStyleValue("surfaceOpacity", 0)).toBe(true);
    expect(isValidStyleValue("surfaceOpacity", 140)).toBe(false);
    expect(isValidStyleValue("accent", "")).toBe(true);
    expect(isValidStyleValue("accent", "url(x)")).toBe(false);
    expect(isValidStyleValue("align", "br")).toBe(true);
    expect(isValidStyleValue("align", "between")).toBe(false);
    expect(isValidStyleValue("alignSpread", true)).toBe(true);
    expect(isValidStyleValue("alignSpread", "yes")).toBe(false);
    expect(isValidStyleValue("alignX", "between")).toBe(false);
    expect(isValidStyleValue("autoScale", "yes")).toBe(false);
    expect(isValidStyleValue("label", "x")).toBe(false);
  });
});

describe("applyAppearancePreset — This profile", () => {
  it("writes the background only into an empty scope (unset, none or media without a file) unless asked", () => {
    const bgOf = (bg: PageBackground | undefined, options?: { includeBackground?: boolean }) =>
      applyAppearancePreset(config({ profiles: [profile("p1", { background: bg }), profile("p2")] }), glass, P1, options).profiles[0].background;
    expect(bgOf(undefined)).toEqual(glass.background);
    expect(bgOf({ type: "image" })).toEqual(glass.background);
    expect(bgOf({ type: "none" })).toEqual(glass.background);
    const mine = { type: "color" as const, color: "#123456" };
    expect(bgOf(mine)).toBe(mine);
    expect(bgOf(mine, { includeBackground: true })).toEqual(glass.background);
    expect(bgOf(undefined, { includeBackground: false })).toBeUndefined();
  });

  it("writes the profile's theme, theme values and background, not other profiles", () => {
    const before = config();
    const next = applyAppearancePreset(before, glass, P1);
    expect(next.profiles[0].theme).toEqual(presetTokens(glass));
    expect(next.profiles[0].radius).toBe(glass.radius);
    expect(next.profiles[0].widgetTheme).toEqual({ values: glass.style });
    expect(next.profiles[0].background).toEqual(glass.background);
    expect(next.profiles[0].pages).toBe(before.profiles[0].pages);
    expect(next.profiles[1]).toBe(before.profiles[1]);
  });

  it("replaces the screen's style with the preset's", () => {
    const next = applyAppearancePreset(config({ profiles: [profile("p1", { widgetTheme: { values: { glow: "strong", surface: "glass" } } }), profile("p2")] }), light, P1);
    expect(next.profiles[0].widgetTheme?.values).toEqual({ surface: "theme" });
  });

});

describe("the user's presets", () => {
  it("captures the current look of a screen", () => {
    const c = config({
      profiles: [
        profile("p1", { widgetTheme: { values: { surface: "glass", accent: "#00ff00" } }, background: { type: "color", color: "#101010" } }),
        profile("p2", { widgetTheme: { values: { accent: "#0000ff" } }, background: { type: "none" } }),
      ],
    });
    const mine = presetFromCurrent(c, P1, "u1", "Mine");
    expect(mine).toMatchObject({ id: "u1", name: "Mine", radius: 0.5, style: { surface: "glass", accent: "#00ff00" } });
    expect(mine.background).toEqual({ type: "color", color: "#101010" });
    const other = presetFromCurrent(c, P2, "u2", "Mine");
    expect(other.style).toEqual({ accent: "#0000ff" });
    expect(other.background).toBeUndefined();
  });

  it("captures a profile's own theme colours and radius", () => {
    const c = config({ profiles: [profile("p1", { theme: { background: "0 0% 100%" }, radius: 1 })] });
    const one = presetFromCurrent(c, P1, "u1", "Mine");
    expect(one.theme).toEqual({ ...DEFAULT_THEME, background: "0 0% 100%" });
    expect(one.radius).toBe(1);
  });

  it("round-trips: applying a saved look reproduces it", () => {
    const c = config({ profiles: [profile("p1", { widgetTheme: { values: { surface: "matte-dark", glow: "soft" } }, radius: 1 }), profile("p2")] });
    const preset = presetFromCurrent(c, P1, "u1", "Mine");
    const other = applyAppearancePreset(c, light, P1);
    const back = applyAppearancePreset(other, preset, P1).profiles[0];
    expect(back.widgetTheme?.values).toEqual(c.profiles[0].widgetTheme?.values);
    expect(back.radius).toBe(1);
    expect(back.theme).toEqual(DEFAULT_THEME);
  });
});

describe("Theme's scopes (Apply a theme here…, Save as Theme)", () => {
  const PAGE = { kind: "page", profileId: "p1", pageId: "main" } as const;
  const pageOf = (c: DashboardConfig) => c.profiles[0].pages[0];

  it("applies a Theme to a page as its own sections: values replaced, customised, locked ones left alone", () => {
    const c = config({
      profiles: [
        profile("p1", { widgetTheme: { locks: { border: true } } }),
        profile("p2"),
      ],
    });
    const seeded = { ...c, profiles: [{ ...c.profiles[0], pages: [{ ...pageOf(c), widgetTheme: { values: { surfaceOpacity: 40, font: "mono" } } }] }, c.profiles[1]] };
    const out = applyTheme(seeded, glass, PAGE);
    const theme = pageOf(out).widgetTheme!;
    // Surface (all three keys replaced) is customised; the locked Border & glow is not written.
    expect(theme.values).toEqual({ font: "mono", surface: "glass", surfaceOpacity: 60, blur: "16" });
    expect(theme.follow).toEqual({ surface: false });
    // A page has no tokens, radius or background: the screen keeps its own.
    expect(out.profiles[0].theme).toBeUndefined();
    expect(out.profiles[0].background).toBeUndefined();
  });

  it("never writes the background with Keep my background on, and always with it off", () => {
    const bg = { type: "color" as const, color: "#101010" };
    const c = config({ profiles: [profile("p1"), profile("p2", { background: bg })] });
    expect(applyTheme(c, glass, P2, { keepBackground: true }).profiles[1].background).toEqual(bg);
    expect(applyTheme(c, glass, P2, { keepBackground: false }).profiles[1].background).toEqual(glass.background);
    expect(applyTheme(config(), glass, P1, { keepBackground: true }).profiles[0].background).toBeUndefined();
  });

  it("saves a page's resolved look: its customised sections over its screen's, the screen's tokens", () => {
    const c = config({
      profiles: [profile("p1", { theme: { primary: "1 2% 3%" }, widgetTheme: { values: { accent: "#0000ff", surface: "matte-dark" } } }), profile("p2")],
    });
    const custom = {
      ...c,
      profiles: [
        {
          ...c.profiles[0],
          pages: [{ ...pageOf(c), widgetTheme: { values: { accent: "#ff00ff", surface: "glass" }, follow: { colors: false } } }],
        },
        c.profiles[1],
      ],
    };
    const t = themeFromScope(custom, PAGE, "u1", "Page look");
    // Colors is the page's; its surface value follows the screen (the page doesn't customise Surface).
    expect(t.style).toEqual({ accent: "#ff00ff", surface: "matte-dark" });
    expect(t.theme).toEqual({ ...DEFAULT_THEME, primary: "1 2% 3%" });
    expect(t).not.toHaveProperty("font");
  });

  it("round-trips: a screen saved as a Theme, applied to another screen, reproduces its look", () => {
    const c = config({
      profiles: [profile("p1", { theme: { primary: "1 2% 3%" }, radius: 1, widgetTheme: { values: { surface: "glass", accent: "#0000ff" } }, background: { type: "color", color: "#202020" } }), profile("p2")],
    });
    const saved = saveThemeAt(c, P1, "u1", "Desk", false);
    const preset = saved.appearancePresets![0];
    expect(preset).toMatchObject({ id: "u1", name: "Desk", radius: 1, style: { surface: "glass", accent: "#0000ff" } });
    expect(preset.background).toBeUndefined();
    const other = applyTheme(saved, preset, P2).profiles[1];
    expect(other.theme).toEqual({ ...DEFAULT_THEME, primary: "1 2% 3%" });
    expect(other.radius).toBe(1);
    expect(other.widgetTheme?.values).toEqual({ surface: "glass", accent: "#0000ff" });
    expect(saveThemeAt(c, P1, "u2", "Desk").appearancePresets![0].background).toEqual({ type: "color", color: "#202020" });
  });
});

describe("updateAppearancePreset", () => {
  const c = config({
    profiles: [profile("p1", { theme: { primary: "1 2% 3%" }, radius: 1, widgetTheme: { values: { surface: "glass" } }, background: { type: "color", color: "#202020" } }), profile("p2")],
  });
  const withTwo = saveThemeAt(saveThemeAt(c, P2, "a", "Alpha", false), P1, "b", "Beta", false);

  it("overwrites the look in place, keeping the id, name, description and the other Themes", () => {
    const updated = updateAppearancePreset(withTwo, "a", P1);
    const [a, b] = updated.appearancePresets!;
    expect(a).toMatchObject({ id: "a", name: "Alpha", description: "Saved theme", radius: 1 });
    expect(a.theme).toEqual({ ...DEFAULT_THEME, primary: "1 2% 3%" });
    expect(b).toEqual(withTwo.appearancePresets![1]);
    expect(updated.appearancePresets).toHaveLength(2);
  });

  it("writes the background only for a Theme that had one, or when asked", () => {
    expect(updateAppearancePreset(withTwo, "a", P1).appearancePresets![0].background).toBeUndefined();
    expect(updateAppearancePreset(withTwo, "a", P1, true).appearancePresets![0].background).toEqual({ type: "color", color: "#202020" });
    const withBg = saveThemeAt(c, P1, "c", "Gamma", true);
    expect(updateAppearancePreset(withBg, "c", P2).appearancePresets![0].background).toBeUndefined();
  });

  it("leaves the config as it was for an unknown id", () => {
    expect(updateAppearancePreset(withTwo, "nope", P2)).toBe(withTwo);
  });
});

describe("duplicateAppearancePreset", () => {
  it("copies a saved Theme right after it under a new id", () => {
    const c = saveThemeAt(saveThemeAt(config(), P1, "a", "Alpha"), P1, "b", "Beta");
    const copy = duplicateAppearancePreset(c, "a", "a2").appearancePresets!;
    expect(copy.map((p) => [p.id, p.name])).toEqual([["a", "Alpha"], ["a2", "Alpha copy"], ["b", "Beta"]]);
    expect(copy[1].theme).not.toBe(copy[0].theme);
  });
});
