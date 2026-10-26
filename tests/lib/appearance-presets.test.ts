import { describe, expect, it } from "vitest";
import { PROFILE_STYLE_KEYS } from "@/modules/standard-settings";
import {
  applyAppearancePreset,
  applyThemeAt,
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
import { normalizeBackground } from "@/lib/appearance";
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
  version: 14,
  activeProfile: "auto",
  profiles: [profile("p1"), profile("p2")],
  theme: DEFAULT_THEME,
  radius: 0.5,
  ...extra,
});

const ALL = { kind: "all" } as const;
const P1 = { kind: "profile", profileId: "p1" } as const;
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

describe("applyAppearancePreset — All profiles", () => {
  it("sets theme, radius and replaces the dashboard style", () => {
    const next = applyAppearancePreset(config({ style: { textColor: "#ff0000" } }), light, ALL);
    expect(next.theme).toEqual(THEME_PRESETS.find((t) => t.name === "paper")!.tokens);
    expect(next.radius).toBe(0.75);
    expect(next.style).toEqual({ surface: "theme" });
  });

  it("writes the background only into an empty scope unless asked", () => {
    expect(applyAppearancePreset(config(), glass, ALL).background).toEqual(glass.background);
    const empty = config({ background: { type: "image" } });
    expect(applyAppearancePreset(empty, glass, ALL).background).toEqual(glass.background);
    const mine = { type: "color" as const, color: "#123456" };
    expect(applyAppearancePreset(config({ background: mine }), glass, ALL).background).toBe(mine);
    expect(
      applyAppearancePreset(config({ background: mine }), glass, ALL, { includeBackground: true }).background
    ).toEqual(glass.background);
    expect(
      applyAppearancePreset(config(), glass, ALL, { includeBackground: false }).background
    ).toBeUndefined();
  });

});

describe("applyAppearancePreset — This profile", () => {
  it("writes the profile's theme, theme values and background, not the dashboard's or other profiles", () => {
    const before = config();
    const next = applyAppearancePreset(before, glass, P1);
    expect(next.theme).toBe(before.theme);
    expect(next.radius).toBe(before.radius);
    expect(next.style).toBeUndefined();
    expect(next.background).toBeUndefined();
    expect(next.profiles[0].theme).toEqual(presetTokens(glass));
    expect(next.profiles[0].radius).toBe(glass.radius);
    expect(next.profiles[0].widgetTheme).toEqual({ values: glass.style });
    expect(next.profiles[0].background).toEqual(glass.background);
    expect(next.profiles[0].pages).toBe(before.profiles[0].pages);
    expect(next.profiles[1]).toBe(before.profiles[1]);
  });

  it("resets the dashboard's look keys the preset leaves unset", () => {
    const next = applyAppearancePreset(config({ style: { glow: "strong", surface: "glass" } }), light, P1);
    expect(next.profiles[0].widgetTheme?.values).toEqual({ glow: "none", surface: "theme" });
  });

});

describe("the user's presets", () => {
  it("captures the current look of a scope", () => {
    const c = config({
      style: { surface: "glass", accent: "#00ff00" },
      background: { type: "color", color: "#101010" },
      profiles: [profile("p1", { widgetTheme: { values: { accent: "#0000ff" } }, background: { type: "none" } })],
    });
    const all = presetFromCurrent(c, ALL, "u1", "Mine");
    expect(all).toMatchObject({ id: "u1", name: "Mine", radius: 0.5, style: { surface: "glass", accent: "#00ff00" } });
    expect(all.background).toEqual({ type: "color", color: "#101010" });
    const one = presetFromCurrent(c, P1, "u2", "Mine");
    expect(one.style).toEqual({ surface: "glass", accent: "#0000ff" });
    expect(one.background).toBeUndefined();
  });

  it("captures a profile's own theme colours and radius", () => {
    const c = config({ profiles: [profile("p1", { theme: { background: "0 0% 100%" }, radius: 1 })] });
    const one = presetFromCurrent(c, P1, "u1", "Mine");
    expect(one.theme).toEqual({ ...DEFAULT_THEME, background: "0 0% 100%" });
    expect(one.radius).toBe(1);
  });

  it("round-trips: applying a saved look reproduces it", () => {
    const c = config({ style: { surface: "matte-dark", glow: "soft" }, radius: 1 });
    const preset = presetFromCurrent(c, ALL, "u1", "Mine");
    const other = applyAppearancePreset(c, light, ALL);
    const back = applyAppearancePreset(other, preset, ALL);
    expect(back.style).toEqual(c.style);
    expect(back.radius).toBe(1);
    expect(back.theme).toEqual(c.theme);
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
    const out = applyThemeAt(seeded, glass, PAGE);
    const theme = pageOf(out).widgetTheme!;
    // Surface (all three keys replaced) is customised; the locked Border & glow is not written.
    expect(theme.values).toEqual({ font: "mono", surface: "glass", surfaceOpacity: 60, blur: "16" });
    expect(theme.follow).toEqual({ surface: false });
    // A page has no tokens, radius or background: the config and the screen keep theirs.
    expect(out.theme).toEqual(seeded.theme);
    expect(out.profiles[0].theme).toBeUndefined();
    expect(out.profiles[0].background).toBeUndefined();
    expect(out.background).toBeUndefined();
  });

  it("never writes the background with Include background off, and always with it on", () => {
    const c = config({ background: { type: "color", color: "#101010" } });
    expect(applyThemeAt(c, glass, ALL, { includeBackground: false }).background).toEqual(c.background);
    expect(applyThemeAt(c, glass, ALL, { includeBackground: true }).background).toEqual(glass.background);
    expect(applyThemeAt(config(), glass, P1, { includeBackground: false }).profiles[0].background).toBeUndefined();
  });

  it("saves a page's resolved look: its customised sections over its screen's, the screen's tokens", () => {
    const c = config({
      style: { accent: "#00ff00", surface: "matte-dark" },
      profiles: [profile("p1", { theme: { primary: "1 2% 3%" }, widgetTheme: { values: { accent: "#0000ff" } } }), profile("p2")],
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

  it("round-trips: a screen saved as a Theme, applied to All screens, reproduces its look", () => {
    const c = config({
      style: { surface: "glass" },
      profiles: [profile("p1", { theme: { primary: "1 2% 3%" }, radius: 1, widgetTheme: { values: { accent: "#0000ff" } }, background: { type: "color", color: "#202020" } }), profile("p2")],
    });
    const saved = saveThemeAt(c, P1, "u1", "Desk", false);
    const preset = saved.appearancePresets![0];
    expect(preset).toMatchObject({ id: "u1", name: "Desk", radius: 1, style: { surface: "glass", accent: "#0000ff" } });
    expect(preset.background).toBeUndefined();
    const all = applyThemeAt(saved, preset, ALL);
    expect(all.theme).toEqual({ ...DEFAULT_THEME, primary: "1 2% 3%" });
    expect(all.radius).toBe(1);
    expect(all.style).toEqual({ surface: "glass", accent: "#0000ff" });
    expect(saveThemeAt(c, P1, "u2", "Desk").appearancePresets![0].background).toEqual({ type: "color", color: "#202020" });
  });
});

describe("updateAppearancePreset", () => {
  const c = config({
    style: { surface: "glass" },
    profiles: [profile("p1", { theme: { primary: "1 2% 3%" }, radius: 1, background: { type: "color", color: "#202020" } }), profile("p2")],
  });
  const withTwo = saveThemeAt(saveThemeAt(c, ALL, "a", "Alpha", false), P1, "b", "Beta", false);

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
    expect(updateAppearancePreset(withBg, "c", ALL).appearancePresets![0].background).toBeUndefined();
  });

  it("leaves the config as it was for an unknown id", () => {
    expect(updateAppearancePreset(withTwo, "nope", ALL)).toBe(withTwo);
  });
});

describe("duplicateAppearancePreset", () => {
  it("copies a saved Theme right after it under a new id", () => {
    const c = saveThemeAt(saveThemeAt(config(), ALL, "a", "Alpha"), ALL, "b", "Beta");
    const copy = duplicateAppearancePreset(c, "a", "a2").appearancePresets!;
    expect(copy.map((p) => [p.id, p.name])).toEqual([["a", "Alpha"], ["a2", "Alpha copy"], ["b", "Beta"]]);
    expect(copy[1].theme).not.toBe(copy[0].theme);
  });
});
