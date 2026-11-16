import { upgradeConfig } from "@/lib/config-upgrade";
import { describe, expect, it } from "vitest";
import type { AppearancePreset } from "@/lib/appearance-presets";
import { guessAppliedThemes, normalizeAppliedTheme } from "@/lib/applied-theme";
import type { DashboardConfig, MonitorProfile, Placement, StoredConfig } from "@/lib/layout";
import { mainPage } from "@/lib/pages";
import { METERS } from "@/lib/screen-templates/designs/meters";
import { TERMINAL } from "@/lib/screen-templates/designs/terminal";
import type { ScreenTemplate } from "@/lib/screen-templates/kit";
import { instantiate } from "@/lib/screen-templates/instantiate";
import { templatePreset, variantOf } from "@/lib/screen-templates/looks";
import { DEFAULT_THEME, THEME_PRESETS } from "@/lib/theme";
import { lookPreset } from "@/components/studio/look-gallery-model";
import { presetTokens } from "@/lib/appearance-presets";
import {
  applyLookToLevel,
  applyThemeToLevel,
  applyThemeToScreens,
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
  version: 20,
  activeProfile: "auto",
  profiles: [profile("p1"), profile("p2")],
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

const desk = theme("desk", { theme: OCEAN, radius: 1, style: { lookId: "tui", accent: "#38bdf8", surface: "glass" }, background: { type: "color", color: "#101820" } });
const night = theme("night", { radius: 0.25, style: { lookId: "hud", accent: "#f472b6", blur: "16" } });

const P1 = { kind: "profile", profileId: "p1" } as const;
const P2 = { kind: "profile", profileId: "p2" } as const;
const PAGE = { kind: "page", profileId: "p1", pageId: "main" } as const;

const p1 = (c: DashboardConfig) => c.profiles[0];
const page = (c: DashboardConfig) => c.profiles[0].pages[0];
/** A screen changed (its own fields, as the studio's edits write them). */
const withP = (c: DashboardConfig, id: string, fn: (p: MonitorProfile) => MonitorProfile): DashboardConfig => ({ ...c, profiles: c.profiles.map((p) => (p.id === id ? fn(p) : p)) });
/** The user's own style edit at a screen. */
const editScreen = (c: DashboardConfig, values: Record<string, string | number>, id = "p1"): DashboardConfig =>
  withP(c, id, (p) => ({ ...p, widgetTheme: { ...p.widgetTheme, values: { ...p.widgetTheme?.values, ...values } } }));

describe("a pick adds to the look (a screen)", () => {
  it("writes the palette, skin, corners and background, and stores what it wrote", () => {
    const out = applyThemeToLevel(config(), desk, P1);
    expect(p1(out)).toMatchObject({ theme: OCEAN, radius: 1, background: desk.background });
    expect(p1(out).widgetTheme?.values).toEqual({ lookId: "tui", accent: "#38bdf8", surface: "glass" });
    expect(p1(out).appliedTheme).toEqual({ id: "desk", name: "desk", tokens: OCEAN, radius: 1, background: desk.background, values: desk.style });
    expect(out.profiles[1]).toEqual(config().profiles[1]);
  });

  it("replaces what the last theme wrote and keeps what the user changed since", () => {
    const edited = editScreen(applyThemeToLevel(config(), desk, P1), { surface: "matte-dark", glow: "soft" });
    const out = applyThemeToLevel(edited, night, P1);
    // accent was the theme's → night's; surface and glow are the user's → kept; desk had no blur → night's.
    expect(p1(out).widgetTheme?.values).toEqual({ lookId: "hud", accent: "#f472b6", surface: "matte-dark", glow: "soft", blur: "16" });
    expect(themeState(out, P1).own).toEqual(["surface", "border"]);
  });

  it("always writes the skin (its Look), even one the user changed since", () => {
    const out = applyThemeToLevel(editScreen(applyThemeToLevel(config(), desk, P1), { lookId: "ink" }), night, P1);
    expect(p1(out).widgetTheme?.values?.lookId).toBe("hud");
  });

  it("replaces the look of a screen that has no snapshot, then keeps what changes since", () => {
    const out = applyThemeToLevel(editScreen(config(), { accent: "#ff0000", surfaceOpacity: 0 }), night, P1);
    expect(p1(out).widgetTheme?.values).toEqual(night.style);
    expect(p1(out).appliedTheme).toEqual({ id: "night", name: "night", tokens: DEFAULT_THEME, radius: 0.25, values: night.style });
    expect(themeState(out, P1).own).toEqual([]);
    const next = applyThemeToLevel(editScreen(out, { surfaceOpacity: 40 }), desk, P1);
    expect(p1(next).widgetTheme?.values).toEqual({ ...desk.style, surfaceOpacity: 40 });
  });

  it("replaces the look of a screen that has no snapshot: its own values, palette, corners and background", () => {
    const dark = profile("p1", { theme: OCEAN, radius: 0, background: { type: "color", color: "#000000" }, widgetTheme: { values: { surfaceOpacity: 0, accent: "#ff0000" } } });
    const out = applyThemeToLevel(config({ profiles: [dark, profile("p2")] }), desk, P1);
    expect(p1(out)).toMatchObject({ theme: OCEAN, radius: 1, background: desk.background });
    expect(p1(out).widgetTheme?.values).toEqual(p1(out).appliedTheme?.values);
    expect(p1(out).widgetTheme?.values).not.toHaveProperty("surfaceOpacity");
  });

  it("brings the theme's background unless the screen keeps its own; a theme without one leaves it", () => {
    const c = config({ profiles: [profile("p1", { background: { type: "color", color: "#000000" } }), profile("p2")] });
    const on = applyThemeToLevel(c, desk, P1);
    expect(p1(on).background).toEqual(desk.background);
    expect(p1(on).appliedTheme?.background).toEqual(desk.background);
    const kept = applyThemeToLevel(c, desk, P1, { keepBackground: true });
    expect(p1(kept).background).toEqual(p1(c).background);
    expect(p1(kept).appliedTheme?.background).toBeUndefined();
    expect(p1(applyThemeToLevel(c, night, P1)).background).toEqual(p1(c).background);
  });
});

describe("picking a Look (the gallery): its id, the level's own kept", () => {
  const hud = lookPreset({ id: "hud", name: "HUD", description: "" });
  const tagged = lookPreset({ id: "term", name: "Term", description: "" }, night);

  it("keeps a screen's own colors, corners, values and widgets, with no snapshot as with one", () => {
    const own = editScreen(withP(config(), "p1", (p) => ({ ...p, theme: { ...OCEAN }, radius: 1, pages: [mainPage([zone("p1-z", { accent: "#00ff00" })])] })), { lookId: "term", accent: "#ff0000", radius: "12" });
    for (const start of [own, applyLookToLevel(own, tagged, P1)]) {
      const p = p1(applyLookToLevel(start, hud, P1));
      expect(p.widgetTheme?.values).toEqual({ lookId: "hud", accent: "#ff0000", radius: "12" });
      expect([p.theme, p.radius]).toEqual([OCEAN, 1]);
      expect(p.pages).toEqual(p1(own).pages);
    }
  });

  it("replaces what the last look wrote: its colors, corners and values", () => {
    const picked = applyLookToLevel(applyThemeToLevel(config(), desk, P1), hud, P1);
    expect(p1(picked).widgetTheme?.values).toEqual({ lookId: "hud" });
    expect([p1(picked).theme, p1(picked).radius]).toEqual([presetTokens(hud), hud.radius]);
    expect(themeState(picked, P1).changed).toEqual([]);
  });

  it("keeps a page's own values with no snapshot", () => {
    const c = withP(config(), "p1", (p) => ({ ...p, pages: [{ ...p.pages[0], widgetTheme: { values: { accent: "#ff0000" }, follow: { colors: false } } }] }));
    expect(page(applyLookToLevel(c, hud, PAGE)).widgetTheme).toEqual({ values: { accent: "#ff0000", lookId: "hud" }, follow: { colors: false, skin: false } });
  });
});

describe("a pick at a page: its skin and style only", () => {
  it("customises the sections the theme sets, leaves its locked ones and its parts alone", () => {
    const c = config({ profiles: [profile("p1", { widgetTheme: { locks: { surface: true } } }), profile("p2")] });
    const out = applyThemeToLevel(c, desk, PAGE);
    expect(page(out).widgetTheme).toEqual({ values: { lookId: "tui", accent: "#38bdf8" }, follow: { skin: false, colors: false } });
    expect(page(out).appliedTheme).toEqual({ id: "desk", name: "desk", values: { lookId: "tui", accent: "#38bdf8" } });
    expect(p1(out).theme).toBeUndefined();
    expect(p1(out).background).toBeUndefined();
  });

  it("follows the screen again in a section the next theme leaves empty, and keeps a section the page changed", () => {
    const once = applyThemeToLevel(config(), desk, PAGE);
    const edited = { ...once, profiles: [{ ...p1(once), pages: [{ ...page(once), widgetTheme: { ...page(once).widgetTheme, values: { ...page(once).widgetTheme?.values, accent: "#00ff00" } } }] }, once.profiles[1]] };
    const out = applyThemeToLevel(edited, theme("plain", { style: { lookId: "ink" } }), PAGE);
    expect(page(out).widgetTheme).toEqual({ values: { lookId: "ink", accent: "#00ff00" }, follow: { skin: false, colors: false } });
    const clean = applyThemeToLevel(once, theme("plain", { style: { lookId: "ink" } }), PAGE);
    expect(page(clean).widgetTheme).toEqual({ values: { lookId: "ink" }, follow: { skin: false } });
  });

  it("replaces the unlocked sections of a page that has no snapshot, and leaves a locked one", () => {
    const c = config({
      profiles: [
        profile("p1", { widgetTheme: { locks: { border: true } }, pages: [{ ...mainPage(), widgetTheme: { values: { accent: "#ff0000", surfaceOpacity: 0, glow: "soft" }, follow: { colors: false, surface: false, border: false } } }] }),
        profile("p2"),
      ],
    });
    const out = applyThemeToLevel(c, desk, PAGE);
    expect(page(out).widgetTheme).toEqual({ values: { glow: "soft", lookId: "tui", accent: "#38bdf8", surface: "glass" }, follow: { border: false, colors: false, surface: false, skin: false } });
    expect(page(out).appliedTheme?.values).toEqual({ lookId: "tui", accent: "#38bdf8", surface: "glass" });
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
    const toSmoke = applyThemeToLevel(screen(dark), presetOf("smoke"), P1);
    expect(settingsOf(p1(toSmoke))).toEqual(settingsOf(smoke.profile));
    const toFloat = applyThemeToLevel(toSmoke, presetOf("float"), P1);
    expect(settingsOf(p1(toFloat))).toEqual(settingsOf(made(METERS, "float").profile));
    expect(settingsOf(p1(applyThemeToLevel(toFloat, presetOf("dark"), P1)))).toEqual(settingsOf(dark.profile));
  });

  it("swaps a variant's colours in the widgets, and back (Terminal · Green → Amber → Cyan → Green)", () => {
    const [green, amber, cyan] = ["green", "amber", "cyan"].map((id) => made(TERMINAL, id));
    expect(Object.keys(amber.applied.zones ?? {}).length).toBeGreaterThan(0);
    expect(settingsOf(amber.profile)).not.toEqual(settingsOf(green.profile));
    const toAmber = applyThemeToLevel(screen(green), presetOf("amber", TERMINAL), P1);
    expect(settingsOf(p1(toAmber))).toEqual(settingsOf(amber.profile));
    const toCyan = applyThemeToLevel(toAmber, presetOf("cyan", TERMINAL), P1);
    expect(settingsOf(p1(toCyan))).toEqual(settingsOf(cyan.profile));
    expect(settingsOf(p1(applyThemeToLevel(toCyan, presetOf("green", TERMINAL), P1)))).toEqual(settingsOf(green.profile));
  });

  it("takes its writes back when the next theme writes nothing there, and Reset does too", () => {
    expect(settingsOf(p1(applyThemeToLevel(screen(smoke), night, P1)))).toEqual(settingsOf(dark.profile));
    expect(settingsOf(p1(resetToTheme(screen(smoke), night, P1)))).toEqual(settingsOf(dark.profile));
  });

  it("keeps a widget value the user changed since", () => {
    const c = screen(smoke);
    const [first] = p1(c).pages[0].placements.filter((z) => z.settings?.surfaceOpacity === 72);
    const edited = { ...c, profiles: [{ ...p1(c), pages: p1(c).pages.map((pg) => ({ ...pg, placements: pg.placements.map((z) => (z === first ? { ...z, settings: { ...z.settings, surfaceOpacity: 50 } } : z)) })) }] };
    const out = applyThemeToLevel(edited, presetOf("dark"), P1);
    expect(p1(out).pages[0].placements.find((z) => z.id === first.id)?.settings?.surfaceOpacity).toBe(50);
  });
});

describe("Reset to a theme", () => {
  it("sets the parts exactly, background included or cleared, and clears the level's fine-tune", () => {
    const start = config({ profiles: [profile("p1", { background: { type: "color", color: "#000000" } }), profile("p2")] });
    const c = editScreen(applyThemeToLevel(start, desk, P1), { glow: "soft" });
    const out = resetToTheme(c, night, P1);
    expect(p1(out).widgetTheme?.values).toEqual(night.style);
    expect(p1(out).background).toBeUndefined();
    expect(themeState(out, P1)).toMatchObject({ changed: [], own: [] });
    expect(p1(resetToTheme(c, desk, P1)).background).toEqual(desk.background);
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
    expect(page(out).widgetTheme).toEqual({ values: { glow: "soft", lookId: "hud", accent: "#f472b6", blur: "16" }, follow: { border: false, skin: false, colors: false, surface: false } });
  });
});

describe("saved themes in use", () => {
  const withDesk = (c: DashboardConfig) => ({ ...c, appearancePresets: [desk] });

  it("lists every level that last applied a theme", () => {
    const c = applyThemeToLevel(applyThemeToLevel(withDesk(config()), desk, P1), desk, PAGE);
    expect(themeUses(c, "desk").map((u) => u.name)).toEqual(["P1", "Main"]);
  });

  it("Update rewrites the theme and every level using it, keeping what a level changed since", () => {
    const usedTwice = applyThemeToLevel(applyThemeToLevel(withDesk(config()), desk, P2), desk, P1);
    // P1 changes its own accent and corners; P2 changes its palette and saves it into desk.
    const screenEdit = editScreen(withP(usedTwice, "p1", (p) => ({ ...p, radius: 0.75 })), { accent: "#00ff00" });
    const p2Edit = editScreen(withP(screenEdit, "p2", (p) => ({ ...p, theme: { ...OCEAN, primary: "1 2% 3%" } })), { surface: "matte-dark" }, "p2");
    const out = updateThemeEverywhere(p2Edit, "desk", P2);
    expect(out.appearancePresets?.[0]).toMatchObject({ theme: { primary: "1 2% 3%" }, style: { surface: "matte-dark" } });
    expect(themeState(out, P2).changed).toEqual([]);
    expect(p1(out).theme).toMatchObject({ primary: "1 2% 3%" });
    expect(p1(out).radius).toBe(0.75);
    expect(p1(out).widgetTheme?.values).toMatchObject({ surface: "matte-dark", accent: "#00ff00" });
  });

  it("tells the parts changed since, and a deleted theme", () => {
    const c = applyThemeToLevel(withDesk(config()), desk, P1);
    expect(themeState(c, P1)).toMatchObject({ theme: desk, deleted: false, changed: [] });
    expect(themeState(editScreen(withP(c, "p1", (p) => ({ ...p, radius: 0.3 })), { lookId: "ink" }), P1).changed).toEqual(["skin", "corners"]);
    expect(themeState({ ...c, appearancePresets: undefined }, P1)).toMatchObject({ theme: undefined, deleted: true });
    const tpl = applyThemeToLevel(c, templatePreset(METERS), P1);
    expect(themeState(tpl, P1).deleted).toBe(false);
  });

  it("treats an unset Look, Classic and an unknown id as one Look, and keeps each as stored", () => {
    const plain = theme("plain", { style: { lookId: "classic", accent: "#38bdf8" } });
    const c = applyThemeToLevel({ ...config(), appearancePresets: [plain] }, plain, P1);
    // An id this build doesn't know shows Classic: the theme's Look, not a change.
    const unknown = editScreen(c, { lookId: "a-newer-look" });
    expect(themeState(unknown, P1).changed).toEqual([]);
    expect(themeState(editScreen(c, { lookId: "tui" }), P1).changed).toEqual(["skin"]);
    expect(themeState(editScreen(c, { lookId: "term" }), P1).changed).toEqual(["skin"]);
    // Update leaves it as stored, not as a value the level changed; loading stores it as Classic (`normalizeWidgetTheme`).
    expect(p1(updateThemeEverywhere(unknown, "plain", P1)).widgetTheme?.values?.lookId).toBe("a-newer-look");
  });

  it("Save as new names the new theme at that level, with nothing changed", () => {
    const edited = editScreen(applyThemeToLevel(withDesk(config()), desk, P1), { glow: "soft" });
    const out = saveAsTheme(edited, P1, "mine", "Mine", false);
    expect(p1(out).appliedTheme?.id).toBe("mine");
    expect(themeState(out, P1)).toMatchObject({ changed: [], own: [] });
    expect(p1(out).widgetTheme?.values).toEqual(p1(edited).widgetTheme?.values);
  });
});

describe("dashboards saved before the snapshot", () => {
  it("names a saved theme a screen shows exactly, and nothing on a near miss; the look doesn't change", () => {
    const exact = config({ profiles: [profile("p1", { theme: OCEAN, radius: 1, widgetTheme: { values: { ...desk.style } } }), profile("p2")], appearancePresets: [desk] });
    expect(p1(guessAppliedThemes(exact)).appliedTheme).toMatchObject({ id: "desk", values: desk.style });
    expect(p1(guessAppliedThemes(withP(exact, "p1", (p) => ({ ...p, radius: 0.75 })))).appliedTheme).toBeUndefined();
    const { appliedTheme: _a, ...rest } = p1(guessAppliedThemes(exact));
    expect(rest).toEqual(p1(exact));
  });

  it("loads a stored snapshot guarded (a Look this build lacks is kept), and guesses on load", () => {
    expect(normalizeAppliedTheme({ id: "x", name: "X", values: { accent: "#ff0000", bogus: 1, lookId: "nope" }, zones: { z: { was: {}, now: { surfaceOpacity: 72 } }, bad: 3 } })).toEqual({
      id: "x",
      name: "X",
      values: { accent: "#ff0000", lookId: "nope" },
      zones: { z: { was: {}, now: { surfaceOpacity: 72 } } },
    });
    expect(normalizeAppliedTheme({ name: "X", values: {} })).toBeUndefined();
    // A v15 dashboard showing desk: its snapshot moves to the screens that had no look of their own.
    const loaded = upgradeConfig({ ...config({ appearancePresets: [desk] }), version: 15, theme: OCEAN, radius: 1, style: { ...desk.style } } as unknown as StoredConfig);
    expect(loaded.profiles.map((p) => p.appliedTheme?.id)).toEqual(["desk", "desk"]);
    const round = upgradeConfig(JSON.parse(JSON.stringify(applyThemeToLevel(config(), night, PAGE))) as StoredConfig);
    expect(round.profiles[0].pages[0].appliedTheme).toEqual({ id: "night", name: "night", values: night.style });
  });

  describe("applyThemeToScreens", () => {
    const three = () => config({ profiles: [profile("p1"), profile("p2"), profile("p3")] });

    it("applies to each listed screen, leaves the others untouched, and ignores unknown ids", () => {
      const before = three();
      const out = applyThemeToScreens(before, desk, ["p1", "p3", "nope", "p1"]);
      expect(out.profiles.map((p) => p.appliedTheme?.id)).toEqual(["desk", undefined, "desk"]);
      expect(out.profiles[1]).toBe(before.profiles[1]);
      expect(out.profiles[0]).toEqual(applyThemeToLevel(before, desk, P1).profiles[0]);
    });

    it("follows the first-pick rule per screen", () => {
      const own = (p: MonitorProfile) => ({ ...p, widgetTheme: { values: { accent: "#00ff00" } } });
      const themed = withP(applyThemeToLevel(three(), night, P1), "p1", own);
      const out = applyThemeToScreens(withP(themed, "p2", own), desk, ["p1", "p2"]);
      // p1 has a snapshot: its own accent stays; p2 has none, so the first pick replaces its look.
      expect(out.profiles[0].widgetTheme?.values?.accent).toBe("#00ff00");
      expect(out.profiles[1].widgetTheme?.values?.accent).toBe("#38bdf8");
    });

    it("keeps each screen's background when asked", () => {
      const bg = { type: "color", color: "#222222" } as const;
      const c = config({ profiles: [profile("p1", { background: bg }), profile("p2", { background: bg })] });
      const out = applyThemeToScreens(c, desk, ["p1", "p2"], { keepBackground: true });
      expect(out.profiles.map((p) => p.background)).toEqual([bg, bg]);
      expect(applyThemeToScreens(c, desk, ["p1", "p2"]).profiles.map((p) => p.background)).toEqual([desk.background, desk.background]);
    });
  });
});
