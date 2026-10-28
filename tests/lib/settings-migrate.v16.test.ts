// v16 (screens own their look): the dashboard level ("All screens") goes, each screen keeps the look it showed. Each
// case loads a literal v15 config through `mergeConfig`, as the app does, and checks the fields one by one; the last
// cases resolve every screen's look under the v15 rules and the v16 rules and compare them.
import { describe, expect, it } from "vitest";
import { normalizeBackground, resolveBackground, type PageBackground } from "@/lib/appearance";
import type { AppearancePreset } from "@/lib/appearance-presets";
import { GENERAL_DEFAULTS, resolveFont, resolveGeneral } from "@/lib/general";
import { CONFIG_VERSION, mergeConfig, type DashboardConfig, type MonitorProfile, type Placement, type StoredConfig } from "@/lib/layout";
import { RENDERING_KEYS } from "@/lib/performance";
import { appearanceOf, resolveWith } from "@/lib/style-resolve";
import { DEFAULT_THEME, resolveTheme, THEME_PRESETS, type ThemeTokens } from "@/lib/theme";
import type { WidgetTheme } from "@/lib/theme-model";
import type { ModuleSettings } from "@/modules/types";

const OCEAN = THEME_PRESETS.find((p) => p.name === "ocean")!.tokens;

const zone = (id: string, extra: Partial<Placement> = {}): Placement => ({
  id, module: "CpuMonitor", colStart: 1, rowStart: 1, colSpan: 2, rowSpan: 2, visible: true, ...extra,
});

const screen = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  name: id.toUpperCase(),
  width: 1920,
  height: 550,
  cols: 12,
  rows: 4,
  fit: "fill",
  pages: [{ id: `${id}-main`, name: "Main", placements: [zone(`${id}-a`), zone(`${id}-b`, { follow: { colors: false, type: false }, settings: { accent: "#ff6a3d", font: "mono" } })] }],
  ...extra,
});

/** A v15 config: the dashboard's look and `profiles`, as a v15 build saved it. */
const v15 = (dashboard: Record<string, unknown>, profiles: unknown[]): StoredConfig =>
  JSON.parse(JSON.stringify({ version: 15, activeProfile: "auto", ...dashboard, profiles })) as StoredConfig;

const load = (c: StoredConfig): DashboardConfig => mergeConfig(c);
const byId = (c: DashboardConfig, id: string): MonitorProfile => c.profiles.find((p) => p.id === id)!;

/** A dashboard look like a real one: every kind of value at All screens. */
const DASHBOARD = {
  theme: { ...OCEAN, primary: "1 2% 3%" },
  radius: 0.6,
  background: { type: "color", color: "#08090c" },
  style: { surface: "glass", stroke: 160, padding: "8", glow: "none", blur: "16", smoothing: "smooth", clock: "24" },
  general: { font: "ibm-plex-sans", showSeconds: false, motion: "full", maxFps: 30, ringGlide: true, blurLimit: false, locale: "de-DE" },
};

describe("v16: the version", () => {
  it("is stamped, and a v16 config loads again identical", () => {
    expect(CONFIG_VERSION).toBe(16);
    const out = load(v15(DASHBOARD, [screen("s1"), screen("s2", { theme: { primary: "9 9% 9%" } })]));
    expect(out.version).toBe(16);
    const again = load(JSON.parse(JSON.stringify(out)) as StoredConfig);
    expect(again).toEqual(out);
    // Loading a v16 config again changes nothing: no dashboard look to copy, the screens keep theirs.
    expect(load({ ...JSON.parse(JSON.stringify(out)), theme: DEFAULT_THEME, style: { accent: "#ff0000" } } as StoredConfig)).toEqual(out);
  });

  it("drops the dashboard's look fields and the moved general keys", () => {
    const out = load(v15(DASHBOARD, [screen("s1")]));
    for (const key of ["theme", "radius", "background", "style", "appliedTheme"]) expect(out).not.toHaveProperty(key);
    expect(out.general).toEqual({ clock: "24", showSeconds: false, locale: "de-DE" });
  });
});

describe("v16: a screen that inherited everything", () => {
  const out = load(v15(DASHBOARD, [screen("s1")]));
  const p = byId(out, "s1");

  it("gets the dashboard's 19 tokens and corners", () => {
    expect(p.theme).toEqual(DASHBOARD.theme);
    expect(Object.keys(p.theme!)).toHaveLength(Object.keys(DEFAULT_THEME).length);
    expect(p.radius).toBe(0.6);
  });

  it("gets the dashboard's background, page font and widget style (its clock aside)", () => {
    expect(p.background).toEqual(DASHBOARD.background);
    expect(p.font).toBe("ibm-plex-sans");
    const { clock: _clock, ...style } = DASHBOARD.style;
    expect(p.widgetTheme).toEqual({ values: style });
  });

  it("gets the dashboard's performance", () => {
    expect(p.performance).toEqual({ maxFps: 30, motion: "full", ringGlide: true, blurLimit: false });
  });
});

describe("v16: a screen with a look of its own", () => {
  it("keeps its own tokens over the dashboard's, and its own radius", () => {
    const out = load(v15(DASHBOARD, [screen("s1", { theme: { primary: "9 9% 9%" }, radius: 0 })]));
    expect(byId(out, "s1").theme).toEqual({ ...DASHBOARD.theme, primary: "9 9% 9%" });
    expect(byId(out, "s1").radius).toBe(0);
  });

  it("keeps its own background, its None included; a dashboard None or none leaves the screen unset", () => {
    const own = { type: "gradient", gradient: { from: "#000", to: "#fff", angle: 90 } };
    const out = load(v15(DASHBOARD, [screen("s1", { background: own }), screen("s2", { background: { type: "none" } })]));
    expect(byId(out, "s1").background).toEqual(normalizeBackground(own));
    expect(byId(out, "s2").background).toEqual({ type: "none" });
    for (const background of [{ type: "none" }, undefined]) {
      expect(byId(load(v15({ ...DASHBOARD, background }, [screen("s1")])), "s1").background).toBeUndefined();
    }
  });

  it("keeps its own page font", () => {
    expect(byId(load(v15(DASHBOARD, [screen("s1", { font: "inter" })])), "s1").font).toBe("inter");
  });

  it("keeps its own style values over the dashboard's, its own clock and its locks; pages are untouched", () => {
    const page = { values: { accent: "#00ff00", surface: "matte-dark" }, follow: { colors: false } };
    const s1 = screen("s1", { widgetTheme: { values: { surface: "matte-dark", clock: "12" }, locks: { colors: true } } });
    s1.pages = [{ ...s1.pages[0], widgetTheme: page } as never];
    const p = byId(load(v15(DASHBOARD, [s1])), "s1");
    expect(p.widgetTheme).toEqual({ values: { stroke: 160, padding: "8", glow: "none", blur: "16", smoothing: "smooth", surface: "matte-dark", clock: "12" }, locks: { colors: true } });
    expect(p.pages[0].widgetTheme).toEqual(page);
  });

  it("keeps an empty style of its own empty when the dashboard has none", () => {
    const p = byId(load(v15({}, [screen("s1", { widgetTheme: { values: {} } })])), "s1");
    expect(p.widgetTheme).toEqual({ values: {} });
  });

  it("lays its own performance over the dashboard's", () => {
    const p = byId(load(v15(DASHBOARD, [screen("s1", { performance: { maxFps: 60 } })])), "s1");
    expect(p.performance).toEqual({ maxFps: 60, motion: "full", ringGlide: true, blurLimit: false });
  });
});

describe("v16: the theme snapshot", () => {
  const desk: AppearancePreset = { id: "desk", name: "Desk", description: "", theme: OCEAN, radius: 1, style: { skin: "tui", accent: "#38bdf8" } };
  const applied = { id: "desk", name: "Desk", tokens: OCEAN, radius: 1, values: desk.style };

  it("a screen with no look of its own takes the dashboard's; one with a look keeps its own or none", () => {
    const mine = { id: "mine", name: "Mine", values: { skin: "ink" } };
    const out = load(
      v15({ ...DASHBOARD, appliedTheme: applied, appearancePresets: [desk] }, [
        screen("plain"),
        screen("own", { radius: 1 }),
        screen("snap", { widgetTheme: { values: { skin: "ink" } }, appliedTheme: mine }),
      ])
    );
    expect(byId(out, "plain").appliedTheme).toMatchObject({ id: "desk" });
    expect(byId(out, "own").appliedTheme).toBeUndefined();
    expect(byId(out, "snap").appliedTheme).toMatchObject({ id: "mine" });
  });

  it("a dashboard saved before snapshots that shows a saved theme exactly: its guess goes to the screens that inherited", () => {
    const out = load(v15({ theme: OCEAN, radius: 1, style: desk.style, appearancePresets: [desk] }, [screen("plain"), screen("own", { background: { type: "none" } })]));
    expect(byId(out, "plain").appliedTheme).toMatchObject({ id: "desk", values: desk.style });
    expect(byId(out, "own").appliedTheme).toBeUndefined();
  });
});

describe("v16: a config with no looks at all", () => {
  it("gives each screen the built-in look, explicitly", () => {
    const out = load(v15({}, [screen("s1")]));
    const p = byId(out, "s1");
    expect(p.theme).toEqual(DEFAULT_THEME);
    expect(p.radius).toBe(0.5);
    expect(p.background).toBeUndefined();
    expect(p.font).toBeUndefined();
    expect(p.widgetTheme).toBeUndefined();
    expect(p.performance).toBeUndefined();
    expect(out.general).toBeUndefined();
  });
});

/* ---------------- the resolved look, under the v15 rules and the v16 rules ---------------- */

interface Look {
  tokens: ThemeTokens;
  radius: number;
  background: PageBackground | undefined;
  font: string;
  hour12: boolean | undefined;
  performance: Record<string, unknown>;
  widgets: Record<string, ModuleSettings | undefined>;
}

const PERF_KEYS = ["maxFps", "motion", ...RENDERING_KEYS] as const;

/** v15 stored fields read as a v15 build did (the stored config, normalized by a v15 load). */
type V15 = { theme?: Partial<ThemeTokens>; radius?: number; background?: PageBackground; style?: ModuleSettings; general?: Record<string, unknown>; profiles: MonitorProfile[] };

/** Each screen's look under the v15 rules: its own over the dashboard's. */
function lookV15(c: V15): Record<string, Look> {
  const g = { ...GENERAL_DEFAULTS, ...c.general } as Record<string, unknown>;
  return Object.fromEntries(
    c.profiles.map((p) => {
      const bg = p.background ?? c.background;
      const widgets: Record<string, ModuleSettings | undefined> = {};
      for (const page of p.pages) {
        const levels = { base: c.style, profile: p.widgetTheme, page: page.widgetTheme as WidgetTheme | undefined };
        for (const z of page.placements) widgets[z.id] = resolveWith(levels, z.settings, z.follow);
      }
      const look: Look = {
        tokens: { ...DEFAULT_THEME, ...c.theme, ...p.theme },
        radius: p.radius ?? c.radius ?? 0.5,
        background: resolveBackground({ background: bg }),
        font: (p.font ?? g.font) as string,
        hour12: c.style?.clock === "12" ? true : c.style?.clock === "24" ? false : undefined,
        performance: Object.fromEntries(PERF_KEYS.map((k) => [k, p.performance?.[k] ?? g[k]])),
        widgets,
      };
      return [p.id, look];
    })
  );
}

/** Each screen's look under the v16 rules: the screen's own, the app's clock. */
function lookV16(c: DashboardConfig): Record<string, Look> {
  return Object.fromEntries(
    c.profiles.map((p) => {
      const general = resolveGeneral(c, p) as unknown as Record<string, unknown>;
      const widgets: Record<string, ModuleSettings | undefined> = {};
      for (const page of p.pages) {
        const levels = appearanceOf(c, { ...p, pageId: page.id, pageTheme: page.widgetTheme });
        for (const z of page.placements) widgets[z.id] = resolveWith(levels, z.settings, z.follow);
      }
      const { tokens, radius } = resolveTheme(p);
      const look: Look = {
        tokens,
        radius,
        background: resolveBackground(p),
        font: resolveFont(p),
        hour12: general.hour12 as boolean | undefined,
        performance: Object.fromEntries(PERF_KEYS.map((k) => [k, general[k]])),
        widgets,
      };
      return [p.id, look];
    })
  );
}

/** A v15 config loaded by a v15 build: every screen as v15 normalized it, the dashboard's fields as stored. */
const asV15 = (stored: StoredConfig): V15 => {
  const raw = stored as unknown as V15;
  // The screens' own fields and pages come through the earlier migrations unchanged; v16 only adds to them.
  const screens = mergeConfig({ ...stored, theme: undefined, radius: undefined, background: undefined, style: undefined, general: undefined, appliedTheme: undefined, version: 16 } as StoredConfig).profiles;
  return { ...raw, background: normalizeBackground(raw.background), profiles: screens };
};

const sameLooks = (stored: StoredConfig) => expect(lookV16(load(stored))).toEqual(lookV15(asV15(stored)));

describe("v16: every screen's resolved look is the same before and after", () => {
  it("screens that inherit, own every part, own some, a None background, locks and custom pages", () => {
    const page = { values: { accent: "#00ff00", surface: "matte-dark", "warn.load": 70 }, follow: { colors: false, thresholds: false } };
    const custom = screen("custom", {
      theme: { primary: "9 9% 9%", background: "0 0% 100%" },
      radius: 1,
      background: { type: "gradient", gradient: { from: "#4139a7", to: "#a4deea", angle: 135 } },
      font: "nunito",
      performance: { maxFps: 60, motion: "full" },
      widgetTheme: { values: { surface: "auto", scale: 100, stroke: 100, smoothing: "smooth" }, locks: { colors: true, palette: true } },
    });
    custom.pages = [{ ...custom.pages[0], widgetTheme: page } as never, { id: "custom-2", name: "Two", placements: [zone("custom-c", { follow: { surface: false }, settings: { surface: "glass" } })] } as never];
    sameLooks(
      v15(DASHBOARD, [
        screen("inherits"),
        custom,
        screen("radius", { radius: 0.25, background: { type: "color", color: "#08090c" }, widgetTheme: { values: { scale: 100, padding: "auto" } } }),
        screen("none", { background: { type: "none" }, widgetTheme: { values: { skin: "android", surface: "auto" } } }),
        screen("empty", { widgetTheme: { values: {} } }),
      ])
    );
  });

  it("a dashboard with no look, a None background, or only some fields", () => {
    sameLooks(v15({}, [screen("a"), screen("b", { theme: { primary: "9 9% 9%" } })]));
    sameLooks(v15({ background: { type: "none" }, radius: 0.75 }, [screen("a"), screen("b", { background: { type: "color", color: "#123456" } })]));
    sameLooks(v15({ style: { clock: "12", accent: "#ff0000" }, general: { motion: "reduce" } }, [screen("a", { widgetTheme: { values: { clock: "24" } } })]));
    // A screen's or a widget's "auto" (the locale's) under a 24 h dashboard stays the locale's.
    const own = screen("own");
    own.pages[0].placements = [zone("own-a", { follow: { format: false }, settings: { clock: "auto" } })] as never;
    sameLooks(v15({ style: { clock: "24" } }, [screen("auto", { widgetTheme: { values: { clock: "auto" } } }), own]));
  });

  it("the perf fixture's shape: a dashboard palette and corners, screens with nothing of their own", () => {
    sameLooks(
      v15({ theme: { ...DEFAULT_THEME, ...OCEAN }, radius: 0.75 }, [
        screen("perf-heavy", { background: { type: "gradient", gradient: { from: "#0f172a", to: "#1e293b", angle: 120 } } }),
        screen("perf-light"),
        screen("perf-viz"),
      ])
    );
  });
});
