import { describe, expect, it } from "vitest";
import { resolveInheritance, type InheritPath, type InheritScope } from "@/lib/inheritance";
import { defaultConfig, type DashboardConfig, type MonitorProfile, type Placement } from "@/lib/layout";
import { DEFAULT_THEME } from "@/lib/theme";
import type { WidgetTheme } from "@/lib/theme-model";
import { customiseInheritance, inheritanceJump, makeTheme, makeThemeSections, resetInheritance } from "@/components/studio/inheritance-actions";

const zone = (follow?: Placement["follow"]): Placement => ({
  id: "z1",
  module: "CpuMonitor",
  colStart: 1,
  rowStart: 1,
  colSpan: 2,
  rowSpan: 2,
  visible: true,
  settings: { accent: "#ff6a3d" },
  ...(follow ? { follow } : {}),
});

function config(opts: { screen?: WidgetTheme; page?: WidgetTheme; zone?: Placement; profile?: Partial<MonitorProfile> } = {}): DashboardConfig {
  const base = defaultConfig();
  const profile: MonitorProfile = {
    ...base.profiles[0],
    id: "desk",
    name: "Desk bar",
    ...(opts.screen ? { widgetTheme: opts.screen } : {}),
    pages: [{ id: "gaming", name: "Gaming", placements: [opts.zone ?? zone()], ...(opts.page ? { widgetTheme: opts.page } : {}) }],
    ...opts.profile,
  };
  return { ...base, style: { accent: "#111111", font: "inter" }, general: { font: "inter", maxFps: 30 }, profiles: [profile] };
}

const ALL: InheritScope = { level: "all" };
const SCREEN: InheritScope = { level: "screen", profileId: "desk" };
const PAGE: InheritScope = { level: "page", profileId: "desk", pageId: "gaming" };
const WIDGET: InheritScope = { level: "widget", profileId: "desk", pageId: "gaming", zoneId: "z1" };

const stateAfter = (c: DashboardConfig, path: InheritPath, scope: InheritScope) => resolveInheritance(c, path, scope).state;
const profileOf = (c: DashboardConfig) => c.profiles[0];

describe("customise / reset: widget-style sections", () => {
  it("All screens: Reset to built-in drops only the section's keys", () => {
    const reset = resetInheritance(config(), "colors", ALL);
    expect(reset.style).toEqual({ font: "inter" });
    expect(stateAfter(reset, "colors", ALL)).toBe("builtin");
    expect(customiseInheritance(config(), "colors", ALL)).toEqual(config());
  });

  it("Screen: customise copies All screens' keys, reset drops the screen's", () => {
    const own = customiseInheritance(config({ screen: { values: { font: "geist" } } }), "colors", SCREEN);
    expect(profileOf(own).widgetTheme?.values).toEqual({ font: "geist", accent: "#111111" });
    expect(stateAfter(own, "colors", SCREEN)).toBe("custom");
    const back = resetInheritance(own, "colors", SCREEN);
    expect(profileOf(back).widgetTheme?.values).toEqual({ font: "geist" });
    expect(stateAfter(back, "colors", SCREEN)).toBe("inherited");
  });

  it("Screen: customise with nothing set above leaves the config as it is", () => {
    const c = config();
    expect(customiseInheritance(c, "motion", SCREEN)).toBe(c);
  });

  it("Page: customise and reset flip the page's follow flag; its values stay stored", () => {
    const c = config({ page: { values: { accent: "#333333" } } });
    const own = customiseInheritance(c, "colors", PAGE);
    expect(stateAfter(own, "colors", PAGE)).toBe("custom");
    const back = resetInheritance(own, "colors", PAGE);
    expect(stateAfter(back, "colors", PAGE)).toBe("inherited");
    expect(profileOf(back).pages[0].widgetTheme).toEqual({ values: { accent: "#333333" } });
  });

  it("Widget: customise and reset flip the zone's follow flag; its own values stay stored", () => {
    const own = customiseInheritance(config(), "colors", WIDGET);
    expect(profileOf(own).pages[0].placements[0].follow).toEqual({ colors: false });
    expect(stateAfter(own, "colors", WIDGET)).toBe("custom");
    const back = resetInheritance(own, "colors", WIDGET);
    expect(profileOf(back).pages[0].placements[0]).not.toHaveProperty("follow");
    expect(profileOf(back).pages[0].placements[0].settings).toEqual({ accent: "#ff6a3d" });
  });

  it("a lock wins over a widget's custom section; unlocking brings it back", () => {
    const c = config({ zone: zone({ colors: false }), screen: { locks: { colors: true } } });
    expect(resolveInheritance(c, "colors", WIDGET)).toMatchObject({ state: "locked", keptOverride: true });
    const unlocked = { ...c, profiles: [{ ...profileOf(c), widgetTheme: undefined }] };
    expect(resolveInheritance(unlocked, "colors", WIDGET)).toMatchObject({ state: "custom", resolvedValue: { accent: "#ff6a3d" } });
  });
});

describe("customise / reset: two-level data", () => {
  it("page font: a screen takes the dashboard's font, and Reset drops it", () => {
    const own = customiseInheritance(config(), "font", SCREEN);
    expect(profileOf(own).font).toBe("inter");
    expect(stateAfter(own, "font", SCREEN)).toBe("custom");
    const back = resetInheritance(own, "font", SCREEN);
    expect(profileOf(back)).not.toHaveProperty("font");
    expect(resetInheritance(config(), "font", ALL).general).toEqual({ maxFps: 30 });
  });

  it("tokens, background and performance: the screen switch, and All screens back to built-in", () => {
    const own = customiseInheritance(config(), "tokens", SCREEN);
    expect(profileOf(own).theme).toEqual(DEFAULT_THEME);
    expect(stateAfter(resetInheritance(own, "tokens", SCREEN), "tokens", SCREEN)).toBe("inherited");
    expect(stateAfter(resetInheritance({ ...config(), radius: 1 }, "tokens", ALL), "tokens", ALL)).toBe("builtin");
    expect(profileOf(customiseInheritance(config(), "performance", SCREEN)).performance).toEqual({ maxFps: 30, motion: "system" });
    expect(resetInheritance(config(), "performance", ALL).general).toEqual({ font: "inter" });
    const bg = resetInheritance({ ...config(), background: { type: "color", color: "#123456" } }, "background", ALL);
    expect(bg.background).toBeUndefined();
  });

  it("pages and widgets have no level of their own: nothing changes", () => {
    const c = config();
    expect(customiseInheritance(c, "font", PAGE)).toBe(c);
    expect(resetInheritance(c, "background", WIDGET)).toBe(c);
  });
});

describe("inheritanceJump", () => {
  const jump = (c: DashboardConfig, path: InheritPath, scope: InheritScope) => inheritanceJump(resolveInheritance(c, path, scope), path, scope);

  it("opens Theme at the level the chip names, with the section", () => {
    expect(jump(config(), "colors", WIDGET)).toEqual({ view: "theme", themeScope: { kind: "base" }, profileId: "desk", section: "colors" });
    const page = config({ page: { follow: { colors: false } } });
    expect(jump(page, "colors", WIDGET)).toMatchObject({ themeScope: { kind: "page", pageId: "gaming" } });
    expect(jump(config({ screen: { locks: { colors: true } } }), "colors", PAGE)).toMatchObject({ themeScope: { kind: "profile" } });
    expect(jump(config(), "font", SCREEN)).toMatchObject({ view: "theme", themeScope: { kind: "base" }, section: "type" });
  });

  it("performance goes to Settings › Dashboard or the screen in Screens; All screens goes nowhere", () => {
    expect(jump(config(), "performance", SCREEN)).toEqual({ view: "settings", tab: "dashboard", section: "performance" });
    const own = config({ profile: { performance: { maxFps: 15 } } });
    expect(jump(own, "performance", PAGE)).toEqual({ view: "screens", profileId: "desk", section: "performance" });
    expect(jump(config(), "colors", ALL)).toBeUndefined();
  });
});

describe("Make this the theme for…", () => {
  const custom = () => config({ zone: { ...zone({ colors: false, border: false }), settings: { accent: "#ff6a3d", glow: "soft", label: "CPU" } } });
  const zoneOf = (c: DashboardConfig) => profileOf(c).pages[0].placements[0];

  it("lists the widget's custom sections, skipping a locked one", () => {
    expect(makeThemeSections(custom(), WIDGET)).toEqual(["colors", "border"]);
    expect(makeThemeSections(custom(), WIDGET, ["border"])).toEqual(["border"]);
    expect(makeThemeSections(config(), WIDGET)).toEqual([]);
    expect(makeThemeSections({ ...custom(), profiles: [{ ...profileOf(custom()), widgetTheme: { locks: { colors: true } } }] }, WIDGET)).toEqual(["border"]);
  });

  it("All screens: the values move into the base style, and the widget follows again with them gone", () => {
    const c = makeTheme(custom(), WIDGET, "all");
    expect(c.style).toEqual({ accent: "#ff6a3d", font: "inter", glow: "soft" });
    expect(zoneOf(c)).not.toHaveProperty("follow");
    expect(zoneOf(c).settings).toEqual({ label: "CPU" });
    expect(stateAfter(c, "colors", WIDGET)).toBe("inherited");
    expect(resolveInheritance(c, "colors", WIDGET).resolvedValue).toMatchObject({ accent: "#ff6a3d" });
  });

  it("This screen: the values move into the screen's theme", () => {
    const c = makeTheme(custom(), WIDGET, "screen");
    expect(profileOf(c).widgetTheme?.values).toEqual({ accent: "#ff6a3d", glow: "soft" });
    expect(c.style).toEqual(custom().style);
    expect(stateAfter(c, "colors", SCREEN)).toBe("custom");
  });

  it("This page: the values move into the page's theme and the page customises those sections", () => {
    const c = makeTheme(custom(), WIDGET, "page", ["colors"]);
    expect(profileOf(c).pages[0].widgetTheme).toEqual({ values: { accent: "#ff6a3d" }, follow: { colors: false } });
    // Only the named section moved: Border & glow stays the widget's own.
    expect(zoneOf(c).follow).toEqual({ border: false });
    expect(zoneOf(c).settings).toEqual({ glow: "soft", label: "CPU" });
    expect(stateAfter(c, "colors", PAGE)).toBe("custom");
  });

  it("changes nothing when the widget has no custom section", () => {
    const c = config();
    expect(makeTheme(c, WIDGET, "all")).toBe(c);
  });
});
