import { describe, expect, it } from "vitest";
import { PROFILE_STYLE_KEYS } from "@/modules/standard-settings";
import {
  applyAppearancePreset,
  clearOverrides,
  countOverrides,
  countProfileOverrides,
  deleteAppearancePreset,
  presetFromCurrent,
  renameAppearancePreset,
  saveAppearancePreset,
} from "./appearance-preset-apply";
import {
  invalidStyleKeys,
  isValidStyleValue,
  presetTokens,
  type AppearancePreset,
} from "./appearance-presets";
import { normalizeBackground } from "./appearance";
import type { DashboardConfig, MonitorProfile, Placement } from "./layout";
import { allPlacements, mainPage } from "./pages";
import { DEFAULT_THEME, THEME_PRESETS } from "./theme";

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
  version: 8,
  activeProfile: "auto",
  profiles: [profile("p1"), profile("p2")],
  theme: DEFAULT_THEME,
  radius: 0.5,
  ...extra,
});

const ALL = { kind: "all" } as const;
const P1 = { kind: "profile", profileId: "p1" } as const;
// Saved looks as the user would store them (the former Glass and Light built-ins).
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

  it("leaves profiles and widgets (content keys included) untouched", () => {
    const before = config({ profiles: [profile("p1", { widgetTheme: { values: { font: "serif" } } })] });
    const next = applyAppearancePreset(before, glass, ALL);
    expect(next.profiles).toBe(before.profiles);
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

  it("never clears a background with a preset that has none", () => {
    const mine = { type: "color" as const, color: "#123456" };
    expect(applyAppearancePreset(config({ background: mine }), light, ALL, { includeBackground: true }).background).toBe(mine);
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

  it("makes the profile fully light with Light (its theme, not the dashboard's)", () => {
    const next = applyAppearancePreset(config(), light, P1);
    const paper = THEME_PRESETS.find((t) => t.name === "paper")!.tokens;
    expect(next.profiles[0].theme).toEqual(paper);
    expect(next.theme).toEqual(DEFAULT_THEME);
    expect(next.profiles[1].theme).toBeUndefined();
  });

  it("resets the dashboard's look keys the preset leaves unset", () => {
    const next = applyAppearancePreset(config({ style: { glow: "strong", surface: "glass" } }), light, P1);
    expect(next.profiles[0].widgetTheme?.values).toEqual({ glow: "none", surface: "theme" });
  });

  it("keeps a profile's deliberate 'no background'", () => {
    const off = config({ profiles: [profile("p1", { background: { type: "none" } })] });
    expect(applyAppearancePreset(off, glass, P1).profiles[0].background).toEqual({ type: "none" });
  });

  it("only applies look keys", () => {
    const sneaky: AppearancePreset = { ...light, style: { surface: "theme", label: "x", sensor: "y" } };
    expect(applyAppearancePreset(config(), sneaky, P1).profiles[0].widgetTheme?.values).toEqual({ surface: "theme" });
    const locked = config({ profiles: [profile("p1", { widgetTheme: { locks: { colors: true } } })] });
    expect(applyAppearancePreset(locked, sneaky, P1).profiles[0].widgetTheme?.locks).toEqual({ colors: true });
  });
});

describe("overrides", () => {
  it("counts widgets whose own look shows over the global style (custom, unlocked sections)", () => {
    expect(countOverrides(config(), P1)).toBe(1);
    expect(countOverrides(config(), ALL)).toBe(2);
    const p1Locked = config({ profiles: [profile("p1", { widgetTheme: { locks: { colors: true } } }), profile("p2")] });
    expect(countOverrides(p1Locked, ALL)).toBe(1);
  });

  it("counts profile theme values for All profiles only", () => {
    const c = config({ profiles: [profile("p1", { widgetTheme: { values: { font: "mono" } } }), profile("p2")] });
    expect(countProfileOverrides(c, ALL)).toBe(1);
    expect(countProfileOverrides(c, P1)).toBe(0);
  });

  it("counts and clears a profile's own theme colours and radius", () => {
    const own = profile("p2", { theme: { background: "0 0% 100%" }, radius: 1 });
    const c = config({ profiles: [profile("p1"), own] });
    expect(countProfileOverrides(c, ALL)).toBe(1);
    const cleared = clearOverrides(c, ALL).profiles[1];
    expect(cleared.theme).toBeUndefined();
    expect(cleared.radius).toBeUndefined();
    expect(clearOverrides(c, { kind: "profile", profileId: "p2" }).profiles[1].theme).toEqual(own.theme);
  });

  it("clears them by following, keeping the widgets' data", () => {
    const c = config({ profiles: [profile("p1", { widgetTheme: { values: { font: "mono" }, locks: { css: true } } }), profile("p2")] });
    const one = clearOverrides(c, P1);
    expect(countOverrides(one, P1)).toBe(0);
    expect(one.profiles[0].widgetTheme?.values).toEqual({ font: "mono" });
    expect(one.profiles[1]).toBe(c.profiles[1]);
    const own = allPlacements(one.profiles[0]).find((p) => p.id === "own-look")!;
    expect(own.follow).toBeUndefined();
    expect(own.settings).toEqual({ accent: "#ff0000", label: "Net" });

    const all = clearOverrides(c, ALL);
    expect(countOverrides(all, ALL)).toBe(0);
    expect(countProfileOverrides(all, ALL)).toBe(0);
    // The values go, the locks stay.
    expect(all.profiles[0].widgetTheme).toEqual({ locks: { css: true } });
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

  it("saves, renames and deletes", () => {
    const saved = saveAppearancePreset(config(), ALL, "u1", "Mine");
    expect(saved.appearancePresets?.map((p) => p.name)).toEqual(["Mine"]);
    const renamed = renameAppearancePreset(saved, "u1", "Ours");
    expect(renamed.appearancePresets?.[0].name).toBe("Ours");
    expect(deleteAppearancePreset(renamed, "u1").appearancePresets).toBeUndefined();
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
