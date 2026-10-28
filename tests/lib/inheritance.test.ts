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
  return { ...base, profiles: [profile] };
}

const SCREEN: InheritScope = { level: "screen", profileId: "desk" };
const PAGE: InheritScope = { level: "page", profileId: "desk", pageId: "gaming" };
const WIDGET: InheritScope = { level: "widget", profileId: "desk", pageId: "gaming", zoneId: "z1" };

describe("styleInheritance: Screen (the top level)", () => {
  it("is built-in until the screen sets a key of the section, then base", () => {
    expect(styleInheritance(config(), SCREEN, "colors")).toMatchObject({ state: "builtin" });
    expect(styleInheritance(config(), SCREEN, "colors")).not.toHaveProperty("from");
    const set = styleInheritance(config({ screen: { values: { accent: "#3d8bff" } } }), SCREEN, "colors");
    expect(set).toMatchObject({ state: "base", resolvedValue: { accent: "#3d8bff" }, parentValue: { accent: "" } });
    // Another section's key does not set this one.
    expect(styleInheritance(config({ screen: { values: { accent: "#3d8bff" } } }), SCREEN, "type").state).toBe("builtin");
  });

  it("reads the app's clock under the screen's Units & format", () => {
    const c: DashboardConfig = { ...config(), general: { clock: "12" } };
    expect(styleInheritance(c, SCREEN, "format")).toMatchObject({ state: "builtin", resolvedValue: { clock: "12" }, parentValue: { clock: "12" } });
    expect(styleInheritance({ ...c, profiles: config({ screen: { values: { clock: "24" } } }).profiles }, SCREEN, "format").resolvedValue).toMatchObject({ clock: "24" });
  });
});

describe("styleInheritance: Page", () => {
  it("inherits from the screen", () => {
    expect(styleInheritance(config({ screen: { values: { accent: "#222222" } } }), PAGE, "colors")).toMatchObject({
      state: "inherited",
      from: "screen",
      fromName: "Desk bar",
    });
    expect(styleInheritance(config(), PAGE, "colors")).toMatchObject({ state: "inherited", from: "screen", fromName: "Desk bar" });
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
  it("inherits from the page where it customises the section, else the screen", () => {
    const page = config({ page: { values: { accent: "#333333" }, follow: { colors: false } } });
    expect(styleInheritance(page, WIDGET, "colors")).toMatchObject({ state: "inherited", from: "page", fromName: "Gaming", resolvedValue: { accent: "#333333" } });
    expect(styleInheritance(config({ screen: { values: { accent: "#222222" } } }), WIDGET, "colors")).toMatchObject({ from: "screen", resolvedValue: { accent: "#222222" } });
    expect(styleInheritance(config(), WIDGET, "colors")).toMatchObject({ from: "screen" });
  });

  it("is custom with its own values over the theme's", () => {
    const c = config({ screen: { values: { accent: "#111111" } }, zone: zone({ colors: false }, { accent: "#ff6a3d" }) });
    expect(styleInheritance(c, WIDGET, "colors")).toMatchObject({
      state: "custom",
      from: "screen",
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
  it("tokens and radius: built-in until the screen holds its own, then base", () => {
    expect(dataInheritance(config(), SCREEN, "tokens")).toMatchObject({ state: "builtin", resolvedValue: { tokens: DEFAULT_THEME, radius: 0.5 } });
    expect(dataInheritance(config({ profile: { radius: 0.75 } }), SCREEN, "tokens")).toMatchObject({ state: "base", resolvedValue: { radius: 0.75 }, parentValue: { radius: 0.5 } });
    const own = dataInheritance(config({ profile: { theme: { primary: "1 2% 3%" } } }), SCREEN, "tokens");
    expect(own).toMatchObject({ state: "base", resolvedValue: { tokens: { ...DEFAULT_THEME, primary: "1 2% 3%" } }, parentValue: { tokens: DEFAULT_THEME } });
    expect(own).not.toHaveProperty("from");
  });

  it("background: a screen's `none` is its own", () => {
    expect(dataInheritance(config({ profile: { background: { type: "none" } } }), SCREEN, "background")).toMatchObject({ state: "base", resolvedValue: undefined });
    expect(dataInheritance(config({ profile: { background: { type: "color", color: "#123456" } } }), SCREEN, "background")).toMatchObject({ state: "base", resolvedValue: { type: "color" } });
    expect(dataInheritance(config(), SCREEN, "background")).toMatchObject({ state: "builtin", resolvedValue: undefined });
  });

  it("performance: the screen's own keys over the defaults", () => {
    expect(dataInheritance(config({ profile: { performance: { maxFps: 30 } } }), SCREEN, "performance")).toMatchObject({ state: "base", resolvedValue: { maxFps: 30, motion: "system" } });
    expect(dataInheritance(config(), SCREEN, "performance")).toMatchObject({ state: "builtin", resolvedValue: { maxFps: 60, motion: "system" } });
  });

  it("page font: the screen's own, else the built-in", () => {
    expect(dataInheritance(config(), SCREEN, "font")).toMatchObject({ state: "builtin", resolvedValue: "system" });
    expect(dataInheritance(config({ profile: { font: "geist" } }), SCREEN, "font")).toMatchObject({ state: "base", resolvedValue: "geist", parentValue: "system" });
  });

  it("a page or widget reads its screen's value, inherited (no level of its own)", () => {
    const own = config({ profile: { font: "geist" } });
    expect(dataInheritance(own, PAGE, "font")).toMatchObject({ state: "inherited", from: "screen", fromName: "Desk bar", resolvedValue: "geist" });
    expect(dataInheritance(config(), WIDGET, "font")).toMatchObject({ state: "inherited", from: "screen", resolvedValue: "system" });
  });
});

describe("resolveInheritance / valueText", () => {
  it("routes sections and data paths, and words the value", () => {
    const c = config({ screen: { values: { accent: "#3d8bff" } }, profile: { performance: { maxFps: 30 } } });
    expect(valueText("colors", resolveInheritance(c, "colors", SCREEN).resolvedValue)).toBe("#3d8bff");
    expect(valueText("performance", resolveInheritance(c, "performance", SCREEN).resolvedValue)).toBe("30 fps");
    expect(valueText("background", resolveInheritance(c, "background", SCREEN).resolvedValue)).toBe("none");
  });
});
