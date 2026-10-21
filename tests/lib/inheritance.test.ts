import { describe, expect, it } from "vitest";
import { dataInheritance, resolveInheritance, styleInheritance, valueText, type InheritScope } from "@/lib/inheritance";
import { defaultConfig, type DashboardConfig, type MonitorProfile, type Placement } from "@/lib/layout";
import { DEFAULT_THEME } from "@/lib/theme";
import type { WidgetTheme } from "@/lib/theme-model";

const zone = (follow?: Placement["follow"], settings?: Placement["settings"]): Placement => ({
  id: "z1",
  module: "CpuMonitor",
  colStart: 1,
  rowStart: 1,
  colSpan: 2,
  rowSpan: 2,
  visible: true,
  ...(follow ? { follow } : {}),
  ...(settings ? { settings } : {}),
});

/** One screen "Desk bar" with a page "Gaming" holding one widget. */
function config(opts: { style?: DashboardConfig["style"]; screen?: WidgetTheme; page?: WidgetTheme; zone?: Placement; profile?: Partial<MonitorProfile> } = {}): DashboardConfig {
  const base = defaultConfig();
  const profile: MonitorProfile = {
    ...base.profiles[0],
    id: "desk",
    name: "Desk bar",
    ...(opts.screen ? { widgetTheme: opts.screen } : {}),
    pages: [{ id: "gaming", name: "Gaming", placements: [opts.zone ?? zone()], ...(opts.page ? { widgetTheme: opts.page } : {}) }],
    ...opts.profile,
  };
  return { ...base, ...(opts.style ? { style: opts.style } : {}), profiles: [profile] };
}

const ALL: InheritScope = { level: "all" };
const SCREEN: InheritScope = { level: "screen", profileId: "desk" };
const PAGE: InheritScope = { level: "page", profileId: "desk", pageId: "gaming" };
const WIDGET: InheritScope = { level: "widget", profileId: "desk", pageId: "gaming", zoneId: "z1" };

describe("styleInheritance: All screens", () => {
  it("is built-in until All screens sets a key of the section, then base", () => {
    expect(styleInheritance(config(), ALL, "colors")).toMatchObject({ state: "builtin" });
    expect(styleInheritance(config(), ALL, "colors")).not.toHaveProperty("from");
    const set = styleInheritance(config({ style: { accent: "#3d8bff" } }), ALL, "colors");
    expect(set).toMatchObject({ state: "base", resolvedValue: { accent: "#3d8bff" }, parentValue: { accent: "" } });
    // Another section's key does not set this one.
    expect(styleInheritance(config({ style: { accent: "#3d8bff" } }), ALL, "type").state).toBe("builtin");
  });
});

describe("styleInheritance: Screen", () => {
  it("inherits from All screens until the screen holds a value for the section", () => {
    const c = config({ style: { accent: "#111111" } });
    expect(styleInheritance(c, SCREEN, "colors")).toMatchObject({ state: "inherited", from: "all", fromName: "All screens", resolvedValue: { accent: "#111111" } });
    const own = styleInheritance(config({ style: { accent: "#111111" }, screen: { values: { accent: "#222222" } } }), SCREEN, "colors");
    expect(own).toMatchObject({ state: "custom", from: "all", resolvedValue: { accent: "#222222" }, parentValue: { accent: "#111111" } });
  });
});

describe("styleInheritance: Page", () => {
  it("inherits from the screen when it sets the section, else from All screens", () => {
    expect(styleInheritance(config({ screen: { values: { accent: "#222222" } } }), PAGE, "colors")).toMatchObject({
      state: "inherited",
      from: "screen",
      fromName: "Desk bar",
    });
    expect(styleInheritance(config(), PAGE, "colors")).toMatchObject({ state: "inherited", from: "all", fromName: "All screens" });
  });

  it("is custom where the page customises the section", () => {
    const c = config({ screen: { values: { accent: "#222222" } }, page: { values: { accent: "#333333" }, follow: { colors: false } } });
    expect(styleInheritance(c, PAGE, "colors")).toMatchObject({
      state: "custom",
      from: "screen",
      resolvedValue: { accent: "#333333" },
      parentValue: { accent: "#222222" },
      keptOverride: false,
    });
  });

  it("is locked by the screen, keeping the page's own values as a kept override", () => {
    const c = config({ screen: { values: { accent: "#222222" }, locks: { colors: true } }, page: { values: { accent: "#333333" }, follow: { colors: false } } });
    expect(styleInheritance(c, PAGE, "colors")).toMatchObject({
      state: "locked",
      from: "screen",
      fromName: "Desk bar",
      resolvedValue: { accent: "#222222" },
      keptOverride: true,
    });
    expect(styleInheritance(config({ screen: { locks: { colors: true } } }), PAGE, "colors")).toMatchObject({ state: "locked", keptOverride: false });
  });
});

describe("styleInheritance: Widget", () => {
  it("inherits from the page, the screen or All screens: the nearest level that sets the section", () => {
    const page = config({ page: { values: { accent: "#333333" }, follow: { colors: false } } });
    expect(styleInheritance(page, WIDGET, "colors")).toMatchObject({ state: "inherited", from: "page", fromName: "Gaming", resolvedValue: { accent: "#333333" } });
    expect(styleInheritance(config({ screen: { values: { accent: "#222222" } } }), WIDGET, "colors")).toMatchObject({ from: "screen" });
    expect(styleInheritance(config({ style: { accent: "#111111" } }), WIDGET, "colors")).toMatchObject({ from: "all", resolvedValue: { accent: "#111111" } });
  });

  it("is custom with its own values over the theme's", () => {
    const c = config({ style: { accent: "#111111" }, zone: zone({ colors: false }, { accent: "#ff6a3d" }) });
    expect(styleInheritance(c, WIDGET, "colors")).toMatchObject({
      state: "custom",
      from: "all",
      resolvedValue: { accent: "#ff6a3d", textColor: "" },
      parentValue: { accent: "#111111" },
    });
  });

  it("is locked by the screen, its own values kept but not applied", () => {
    const c = config({ screen: { values: { accent: "#222222" }, locks: { colors: true } }, zone: zone({ colors: false }, { accent: "#ff6a3d" }) });
    expect(styleInheritance(c, WIDGET, "colors")).toMatchObject({ state: "locked", from: "screen", resolvedValue: { accent: "#222222" }, keptOverride: true });
  });

  it("skips a page that customises the section while the screen locks it", () => {
    const c = config({ screen: { locks: { type: true } }, page: { values: { font: "inter" }, follow: { type: false } } });
    expect(styleInheritance(c, WIDGET, "type")).toMatchObject({ state: "locked", from: "screen", resolvedValue: { font: "auto" } });
  });
});

describe("dataInheritance", () => {
  it("tokens and radius: built-in until changed, then base; a screen's own is custom", () => {
    expect(dataInheritance(config(), ALL, "tokens").state).toBe("builtin");
    const changed: DashboardConfig = { ...config(), radius: 0.75 };
    expect(dataInheritance(changed, ALL, "tokens")).toMatchObject({ state: "base", resolvedValue: { radius: 0.75 }, parentValue: { radius: 0.5 } });
    expect(dataInheritance(changed, SCREEN, "tokens")).toMatchObject({ state: "inherited", from: "all", resolvedValue: { radius: 0.75 } });
    const own = dataInheritance(config({ profile: { theme: { primary: "1 2% 3%" } } }), SCREEN, "tokens");
    expect(own).toMatchObject({ state: "custom", from: "all", resolvedValue: { tokens: { ...DEFAULT_THEME, primary: "1 2% 3%" } }, parentValue: { tokens: DEFAULT_THEME } });
  });

  it("background: a screen's `none` is its own", () => {
    const c: DashboardConfig = { ...config({ profile: { background: { type: "none" } } }), background: { type: "color", color: "#123456" } };
    expect(dataInheritance(c, ALL, "background")).toMatchObject({ state: "base", resolvedValue: { type: "color" } });
    expect(dataInheritance(c, SCREEN, "background")).toMatchObject({ state: "custom", resolvedValue: undefined, parentValue: { type: "color" } });
    expect(dataInheritance(config(), ALL, "background")).toMatchObject({ state: "builtin", resolvedValue: undefined });
  });

  it("performance: the screen's own keys over the dashboard's", () => {
    const c: DashboardConfig = { ...config({ profile: { performance: { maxFps: 30 } } }), general: { maxFps: 15, motion: "reduce" } };
    expect(dataInheritance(c, ALL, "performance")).toMatchObject({ state: "base", resolvedValue: { maxFps: 15, motion: "reduce" } });
    expect(dataInheritance(c, SCREEN, "performance")).toMatchObject({ state: "custom", resolvedValue: { maxFps: 30, motion: "reduce" } });
    expect(dataInheritance(config(), ALL, "performance")).toMatchObject({ state: "builtin", resolvedValue: { maxFps: 60, motion: "system" } });
  });

  it("page font: the screen's own, else general.font, else the built-in", () => {
    expect(dataInheritance(config(), ALL, "font")).toMatchObject({ state: "builtin", resolvedValue: "system" });
    const global: DashboardConfig = { ...config(), general: { font: "inter" } };
    expect(dataInheritance(global, ALL, "font")).toMatchObject({ state: "base", resolvedValue: "inter" });
    expect(dataInheritance(global, SCREEN, "font")).toMatchObject({ state: "inherited", from: "all", resolvedValue: "inter" });
    const own: DashboardConfig = { ...config({ profile: { font: "geist" } }), general: { font: "inter" } };
    expect(dataInheritance(own, SCREEN, "font")).toMatchObject({ state: "custom", resolvedValue: "geist", parentValue: "inter" });
  });

  it("a page or widget reads its screen's value, inherited (no level of its own)", () => {
    const own: DashboardConfig = { ...config({ profile: { font: "geist" } }), general: { font: "inter" } };
    expect(dataInheritance(own, PAGE, "font")).toMatchObject({ state: "inherited", from: "screen", fromName: "Desk bar", resolvedValue: "geist" });
    expect(dataInheritance({ ...config(), general: { font: "inter" } }, WIDGET, "font")).toMatchObject({ state: "inherited", from: "all" });
  });
});

describe("resolveInheritance / valueText", () => {
  it("routes sections and data paths, and words the value", () => {
    const c: DashboardConfig = { ...config({ style: { accent: "#3d8bff" } }), general: { maxFps: 30 } };
    expect(valueText("colors", resolveInheritance(c, "colors", ALL).resolvedValue)).toBe("#3d8bff");
    expect(valueText("performance", resolveInheritance(c, "performance", ALL).resolvedValue)).toBe("30 fps");
    expect(valueText("background", resolveInheritance(c, "background", ALL).resolvedValue)).toBe("none");
  });
});
