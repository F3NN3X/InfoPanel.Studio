import { describe, expect, it } from "vitest";
import type { AppearancePreset } from "@/lib/appearance-presets";
import { guessAppliedThemes, normalizeAppliedTheme } from "@/lib/applied-theme";
import { mergeConfig, type DashboardConfig, type MonitorProfile, type Placement, type StoredConfig } from "@/lib/layout";
import { mainPage } from "@/lib/pages";
import { METERS } from "@/lib/screen-templates/designs/meters";
import { TERMINAL } from "@/lib/screen-templates/designs/terminal";
import type { ScreenTemplate } from "@/lib/screen-templates/kit";
import { instantiate } from "@/lib/screen-templates/instantiate";
import { templatePreset, variantOf } from "@/lib/screen-templates/looks";
import { DEFAULT_THEME, THEME_PRESETS } from "@/lib/theme";
import {
  applyTheme,
  resetToTheme,
  saveAsTheme,
  themeState,
  themeUses,
  updateThemeEverywhere,
} from "@/lib/theme-apply";

const OCEAN = THEME_PRESETS.find((p) => p.name === "ocean")!.tokens;

const zone = (id: string, settings?: Placement["settings"]): Placement => ({
  id,
  module: "SensorValue",
  colStart: 1,
  rowStart: 1,
  colSpan: 1,
  rowSpan: 1,
  visible: true,
  ...(settings ? { settings } : {}),
});

const profile = (id: string, extra: Partial<MonitorProfile> = {}): MonitorProfile => ({
  id,
  name: id.toUpperCase(),
  width: 1920,
  height: 550,
  cols: 12,
  rows: 4,
  fit: "fill",
  pages: [mainPage([zone(`${id}-z`)])],
  ...extra,
});

const config = (extra: Partial<DashboardConfig> = {}): DashboardConfig => ({
  version: 15,
  activeProfile: "auto",
  profiles: [profile("p1"), profile("p2")],
  theme: DEFAULT_THEME,
  radius: 0.5,
  ...extra,
});

const theme = (id: string, extra: Partial<AppearancePreset> = {}): AppearancePreset => ({
  id,
  name: id,
  description: "",
  theme: "zinc",
  radius: 0.5,
  style: {},
  ...extra,
});

const desk = theme("desk", { theme: OCEAN, radius: 1, style: { skin: "tui", accent: "#38bdf8", surface: "glass" }, background: { type: "color", color: "#101820" } });
const night = theme("night", { radius: 0.25, style: { skin: "hud", accent: "#f472b6", blur: "16" } });

const ALL = { kind: "all" } as const;
const P1 = { kind: "profile", profileId: "p1" } as const;
const PAGE = { kind: "page", profileId: "p1", pageId: "main" } as const;

const p1 = (c: DashboardConfig) => c.profiles[0];
const page = (c: DashboardConfig) => c.profiles[0].pages[0];
/** The user's own edit at All screens. */
const editAll = (c: DashboardConfig, values: Record<string, string | number>): DashboardConfig => ({ ...c, style: { ...c.style, ...values } });

describe("a pick adds to the look (All screens)", () => {
  it("writes the palette, skin and corners, and stores what it wrote", () => {
    const out = applyTheme(config(), desk, ALL);
    expect(out.theme).toEqual(OCEAN);
    expect(out.radius).toBe(1);
    expect(out.style).toEqual({ skin: "tui", accent: "#38bdf8", surface: "glass" });
    expect(out.appliedTheme).toEqual({ id: "desk", name: "desk", tokens: OCEAN, radius: 1, values: desk.style });
  });

  it("replaces what the last theme wrote and keeps what the user changed since", () => {
    const edited = editAll(applyTheme(config(), desk, ALL), { surface: "matte-dark", glow: "soft" });
    const out = applyTheme(edited, night, ALL);
    // accent was the theme's → night's; surface and glow are the user's → kept; desk had no blur → night's.
    expect(out.style).toEqual({ skin: "hud", accent: "#f472b6", surface: "matte-dark", glow: "soft", blur: "16" });
    expect(themeState(out, ALL).own).toEqual(["surface", "border"]);
  });

  it("always writes the skin, even one the user changed since", () => {
    const out = applyTheme(editAll(applyTheme(config(), desk, ALL), { skin: "ink" }), night, ALL);
    expect(out.style?.skin).toBe("hud");
  });

  it("keeps every value of a level that has no snapshot (a dashboard saved before)", () => {
    const out = applyTheme(config({ style: { accent: "#ff0000" } }), night, ALL);
    expect(out.style).toEqual({ accent: "#ff0000", skin: "hud", blur: "16" });
  });

  it("writes the background only when included", () => {
    const c = config({ background: { type: "color", color: "#000000" } });
    expect(applyTheme(c, desk, ALL).background).toEqual(c.background);
    expect(applyTheme(c, desk, ALL).appliedTheme?.background).toBeUndefined();
    const on = applyTheme(c, desk, ALL, { includeBackground: true });
    expect(on.background).toEqual(desk.background);
    expect(on.appliedTheme?.background).toEqual(desk.background);
  });
});

describe("a pick at a screen", () => {
  it("writes the screen's own parts and defaults over All screens' keys the theme leaves unset", () => {
    const out = applyTheme(config({ style: { numGlow: "strong" } }), night, P1);
    expect(p1(out)).toMatchObject({ theme: DEFAULT_THEME, radius: 0.25 });
    expect(p1(out).widgetTheme?.values).toEqual({ numGlow: "auto", skin: "hud", accent: "#f472b6", blur: "16" });
    expect(out.style).toEqual({ numGlow: "strong" });
    expect(out.profiles[1].appliedTheme).toBeUndefined();
  });
});

describe("a pick at a page: its skin and style only", () => {
  it("customises the sections the theme sets, leaves its locked ones and its parts alone", () => {
    const c = config({ profiles: [profile("p1", { widgetTheme: { locks: { surface: true } } }), profile("p2")] });
    const out = applyTheme(c, desk, PAGE, { includeBackground: true });
    expect(page(out).widgetTheme).toEqual({ values: { skin: "tui", accent: "#38bdf8" }, follow: { skin: false, colors: false } });
    expect(page(out).appliedTheme).toEqual({ id: "desk", name: "desk", values: { skin: "tui", accent: "#38bdf8" } });
    expect(p1(out).theme).toBeUndefined();
    expect(p1(out).background).toBeUndefined();
    expect(out.theme).toEqual(DEFAULT_THEME);
  });

  it("follows the screen again in a section the next theme leaves empty, and keeps a section the page changed", () => {
    const once = applyTheme(config(), desk, PAGE);
    const edited = { ...once, profiles: [{ ...p1(once), pages: [{ ...page(once), widgetTheme: { ...page(once).widgetTheme, values: { ...page(once).widgetTheme?.values, accent: "#00ff00" } } }] }, once.profiles[1]] };
    const out = applyTheme(edited, theme("plain", { style: { skin: "ink" } }), PAGE);
    expect(page(out).widgetTheme).toEqual({ values: { skin: "ink", accent: "#00ff00" }, follow: { skin: false, colors: false } });
    const clean = applyTheme(once, theme("plain", { style: { skin: "ink" } }), PAGE);
    expect(page(clean).widgetTheme).toEqual({ values: { skin: "ink" }, follow: { skin: false } });
  });
});

describe("a template variant's writes into the widgets", () => {
  const made = (t: ScreenTemplate, variant: string) => instantiate(t, { name: "M", variant, width: t.size.width, height: t.size.height });
  const dark = made(METERS, "dark");
  const smoke = made(METERS, "smoke");
  const presetOf = (id: string, t: ScreenTemplate = METERS) => templatePreset(t, variantOf(t, id));
  const settingsOf = (p: MonitorProfile) => p.pages.flatMap((pg) => pg.placements.map((z) => z.settings));
  const screen = (made: typeof dark) => config({ profiles: [{ ...made.profile, id: "p1", appliedTheme: made.applied }] });

  it("records what the variant wrote when the screen is made", () => {
    expect(dark.applied.zones).toBeUndefined();
    const writes = Object.values(smoke.applied.zones ?? {});
    expect(writes.length).toBeGreaterThan(0);
    expect(writes.every((w) => w.was.surfaceOpacity === 100 && w.now.surfaceOpacity === 72)).toBe(true);
    expect(settingsOf(smoke.profile)).not.toEqual(settingsOf(dark.profile));
  });

  it("a variant applied from Theme makes the widgets a new screen from it has, and back", () => {
    const toSmoke = applyTheme(screen(dark), presetOf("smoke"), P1);
    expect(settingsOf(p1(toSmoke))).toEqual(settingsOf(smoke.profile));
    const toFloat = applyTheme(toSmoke, presetOf("float"), P1);
    expect(settingsOf(p1(toFloat))).toEqual(settingsOf(made(METERS, "float").profile));
    expect(settingsOf(p1(applyTheme(toFloat, presetOf("dark"), P1)))).toEqual(settingsOf(dark.profile));
  });

  it("swaps a variant's colours in the widgets, and back (Terminal · Green → Amber → Cyan → Green)", () => {
    const [green, amber, cyan] = ["green", "amber", "cyan"].map((id) => made(TERMINAL, id));
    expect(Object.keys(amber.applied.zones ?? {}).length).toBeGreaterThan(0);
    expect(settingsOf(amber.profile)).not.toEqual(settingsOf(green.profile));
    const toAmber = applyTheme(screen(green), presetOf("amber", TERMINAL), P1);
    expect(settingsOf(p1(toAmber))).toEqual(settingsOf(amber.profile));
    const toCyan = applyTheme(toAmber, presetOf("cyan", TERMINAL), P1);
    expect(settingsOf(p1(toCyan))).toEqual(settingsOf(cyan.profile));
    expect(settingsOf(p1(applyTheme(toCyan, presetOf("green", TERMINAL), P1)))).toEqual(settingsOf(green.profile));
  });

  it("takes its writes back when the next theme writes nothing there, and Reset does too", () => {
    expect(settingsOf(p1(applyTheme(screen(smoke), night, P1)))).toEqual(settingsOf(dark.profile));
    expect(settingsOf(p1(resetToTheme(screen(smoke), night, P1)))).toEqual(settingsOf(dark.profile));
  });

  it("keeps a widget value the user changed since", () => {
    const c = screen(smoke);
    const [first] = p1(c).pages[0].placements.filter((z) => z.settings?.surfaceOpacity === 72);
    const edited = { ...c, profiles: [{ ...p1(c), pages: p1(c).pages.map((pg) => ({ ...pg, placements: pg.placements.map((z) => (z === first ? { ...z, settings: { ...z.settings, surfaceOpacity: 50 } } : z)) })) }] };
    const out = applyTheme(edited, presetOf("dark"), P1);
    expect(p1(out).pages[0].placements.find((z) => z.id === first.id)?.settings?.surfaceOpacity).toBe(50);
  });
});

describe("Reset to a theme", () => {
  it("sets the parts exactly, background included or cleared, and clears the level's fine-tune", () => {
    const c = editAll(applyTheme(config({ background: { type: "color", color: "#000000" } }), desk, ALL), { glow: "soft" });
    const out = resetToTheme(c, night, ALL);
    expect(out.style).toEqual(night.style);
    expect(out.background).toBeUndefined();
    expect(themeState(out, ALL)).toMatchObject({ changed: [], own: [] });
    expect(resetToTheme(c, desk, ALL).background).toEqual(desk.background);
  });

  it("drops a screen's own background when the theme has none; pages keep their own", () => {
    const c = config({ profiles: [profile("p1", { background: { type: "color", color: "#222222" }, pages: [{ ...mainPage(), widgetTheme: { values: { accent: "#ff0000" }, follow: { colors: false } } }] }), profile("p2")] });
    const out = resetToTheme(c, night, P1);
    expect(p1(out)).not.toHaveProperty("background");
    expect(page(out).widgetTheme).toEqual(page(c).widgetTheme);
  });

  it("on a page clears the sections its screen doesn't lock", () => {
    const c = config({
      profiles: [profile("p1", { widgetTheme: { locks: { border: true } }, pages: [{ ...mainPage(), widgetTheme: { values: { glow: "soft", font: "mono" }, follow: { border: false, type: false } } }] }), profile("p2")],
    });
    const out = resetToTheme(c, night, PAGE);
    expect(page(out).widgetTheme).toEqual({ values: { glow: "soft", skin: "hud", accent: "#f472b6", blur: "16" }, follow: { border: false, skin: false, colors: false, surface: false } });
  });
});

describe("saved themes in use", () => {
  const withDesk = (c: DashboardConfig) => ({ ...c, appearancePresets: [desk] });

  it("lists every level that last applied a theme", () => {
    const c = applyTheme(applyTheme(withDesk(config()), desk, P1), desk, PAGE);
    expect(themeUses(c, "desk").map((u) => u.name)).toEqual(["P1", "Main"]);
  });

  it("Update rewrites the theme and every level using it, keeping what a level changed since", () => {
    const usedTwice = applyTheme(applyTheme(withDesk(config()), desk, ALL), desk, P1);
    // The screen changes its own accent and corners; All screens changes its palette and saves it into desk.
    const screenEdit = { ...usedTwice, profiles: [{ ...p1(usedTwice), radius: 0.75, widgetTheme: { values: { ...p1(usedTwice).widgetTheme?.values, accent: "#00ff00" } } }, usedTwice.profiles[1]] };
    const allEdit = { ...screenEdit, theme: { ...OCEAN, primary: "1 2% 3%" }, style: { ...screenEdit.style, surface: "matte-dark" } };
    const out = updateThemeEverywhere(allEdit, "desk", ALL);
    expect(out.appearancePresets?.[0]).toMatchObject({ theme: { primary: "1 2% 3%" }, style: { surface: "matte-dark" } });
    expect(themeState(out, ALL).changed).toEqual([]);
    expect(p1(out).theme).toMatchObject({ primary: "1 2% 3%" });
    expect(p1(out).radius).toBe(0.75);
    expect(p1(out).widgetTheme?.values).toMatchObject({ surface: "matte-dark", accent: "#00ff00" });
  });

  it("tells the parts changed since, and a deleted theme", () => {
    const c = applyTheme(withDesk(config()), desk, ALL);
    expect(themeState(c, ALL)).toMatchObject({ theme: desk, deleted: false, changed: [] });
    expect(themeState({ ...c, radius: 0.3, style: { ...c.style, skin: "ink" } }, ALL).changed).toEqual(["skin", "corners"]);
    expect(themeState({ ...c, appearancePresets: undefined }, ALL)).toMatchObject({ theme: undefined, deleted: true });
    const tpl = applyTheme(c, templatePreset(METERS), ALL);
    expect(themeState(tpl, ALL).deleted).toBe(false);
  });

  it("treats the Default skin's two spellings as one, and keeps each as stored", () => {
    const plain = theme("plain", { style: { skin: "default", accent: "#38bdf8" } });
    const c = applyTheme({ ...config(), appearancePresets: [plain] }, plain, ALL);
    // The Skin picker writes `auto` for Default: the theme's skin, not a change.
    const picked = { ...c, style: { ...c.style, skin: "auto" } };
    expect(themeState(picked, ALL).changed).toEqual([]);
    expect(themeState({ ...c, style: { ...c.style, skin: "tui" } }, ALL).changed).toEqual(["skin"]);
    // Update rewrites it as the theme's, not as a value the level changed.
    expect(updateThemeEverywhere(picked, "plain", ALL).style?.skin).toBe("auto");
    // Loading keeps either spelling, so nothing repaints.
    expect(normalizeAppliedTheme({ id: "x", name: "X", values: { skin: "default" } })?.values).toEqual({ skin: "default" });
    expect(mergeConfig(JSON.parse(JSON.stringify(config({ style: { skin: "auto" } }))) as StoredConfig).style).toEqual({ skin: "auto" });
  });

  it("Save as new names the new theme at that level, with nothing changed", () => {
    const edited = editAll(applyTheme(withDesk(config()), desk, ALL), { glow: "soft" });
    const out = saveAsTheme(edited, ALL, "mine", "Mine", false);
    expect(out.appliedTheme?.id).toBe("mine");
    expect(themeState(out, ALL)).toMatchObject({ changed: [], own: [] });
    expect(out.style).toEqual(edited.style);
  });
});

describe("dashboards saved before the snapshot", () => {
  it("names a saved theme a level shows exactly, and nothing on a near miss; the look doesn't change", () => {
    const exact = config({ theme: OCEAN, radius: 1, style: { ...desk.style }, appearancePresets: [desk] });
    expect(guessAppliedThemes(exact).appliedTheme).toMatchObject({ id: "desk", values: desk.style });
    expect(guessAppliedThemes({ ...exact, radius: 0.75 }).appliedTheme).toBeUndefined();
    const { appliedTheme: _a, ...rest } = guessAppliedThemes(exact);
    expect(rest).toEqual(exact);
  });

  it("loads a stored snapshot guarded, and guesses on load", () => {
    expect(normalizeAppliedTheme({ id: "x", name: "X", values: { accent: "#ff0000", bogus: 1, skin: "nope" }, zones: { z: { was: {}, now: { surfaceOpacity: 72 } }, bad: 3 } })).toEqual({
      id: "x",
      name: "X",
      values: { accent: "#ff0000" },
      zones: { z: { was: {}, now: { surfaceOpacity: 72 } } },
    });
    expect(normalizeAppliedTheme({ name: "X", values: {} })).toBeUndefined();
    const loaded = mergeConfig({ ...config({ theme: OCEAN, radius: 1, style: { ...desk.style }, appearancePresets: [desk] }) } as unknown as StoredConfig);
    expect(loaded.appliedTheme?.id).toBe("desk");
    const round = mergeConfig(JSON.parse(JSON.stringify(applyTheme(config(), night, PAGE))) as StoredConfig);
    expect(round.profiles[0].pages[0].appliedTheme).toEqual({ id: "night", name: "night", values: night.style });
  });
});
