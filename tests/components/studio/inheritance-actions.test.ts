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
  return { ...base, profiles: [profile] };
}

const SCREEN: InheritScope = { level: "screen", profileId: "desk" };
const PAGE: InheritScope = { level: "page", profileId: "desk", pageId: "gaming" };
const WIDGET: InheritScope = { level: "widget", profileId: "desk", pageId: "gaming", zoneId: "z1" };

const stateAfter = (c: DashboardConfig, path: InheritPath, scope: InheritScope) => resolveInheritance(c, path, scope).state;
const profileOf = (c: DashboardConfig) => c.profiles[0];

describe("customise / reset: widget-style sections", () => {
  it("Screen (the top level): Reset to built-in drops only the section's keys; customise changes nothing", () => {
    const c = config({ screen: { values: { accent: "#111111", font: "inter" } } });
    const reset = resetInheritance(c, "colors", SCREEN);
    expect(profileOf(reset).widgetTheme?.values).toEqual({ font: "inter" });
    expect(stateAfter(reset, "colors", SCREEN)).toBe("builtin");
    expect(stateAfter(c, "colors", SCREEN)).toBe("base");
    expect(customiseInheritance(c, "colors", SCREEN)).toBe(c);
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

describe("customise / reset: the screen's data", () => {
  it("page font: Reset drops the screen's own; there is nothing to customise", () => {
    const own = config({ profile: { font: "inter" } });
    expect(stateAfter(own, "font", SCREEN)).toBe("base");
    const back = resetInheritance(own, "font", SCREEN);
    expect(profileOf(back)).not.toHaveProperty("font");
    expect(stateAfter(back, "font", SCREEN)).toBe("builtin");
    expect(customiseInheritance(config(), "font", SCREEN)).toEqual(config());
  });

  it("tokens, background and performance: Reset puts the screen back to the built-in values", () => {
    const own = config({ profile: { theme: { ...DEFAULT_THEME, primary: "1 2% 3%" }, radius: 1, background: { type: "color", color: "#123456" }, performance: { maxFps: 30, ringGlide: true } } });
    const tokens = resetInheritance(own, "tokens", SCREEN);
    expect(profileOf(tokens)).not.toHaveProperty("theme");
    expect(profileOf(tokens)).not.toHaveProperty("radius");
    expect(stateAfter(tokens, "tokens", SCREEN)).toBe("builtin");
    expect(profileOf(resetInheritance(own, "background", SCREEN))).not.toHaveProperty("background");
    expect(profileOf(resetInheritance(own, "performance", SCREEN))).not.toHaveProperty("performance");
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
    expect(jump(config(), "colors", WIDGET)).toEqual({ view: "theme", themeScope: { kind: "profile" }, profileId: "desk", section: "colors" });
    const page = config({ page: { follow: { colors: false } } });
    expect(jump(page, "colors", WIDGET)).toMatchObject({ themeScope: { kind: "page", pageId: "gaming" } });
    expect(jump(config({ screen: { locks: { colors: true } } }), "colors", PAGE)).toMatchObject({ themeScope: { kind: "profile" } });
    expect(jump(config(), "font", PAGE)).toMatchObject({ view: "theme", themeScope: { kind: "profile" }, section: "type" });
  });

  it("performance goes to the screen in Screens; a screen's own chip goes nowhere", () => {
    const own = config({ profile: { performance: { maxFps: 15 } } });
    expect(jump(own, "performance", PAGE)).toEqual({ view: "screens", profileId: "desk", section: "performance" });
    expect(jump(own, "performance", SCREEN)).toBeUndefined();
    expect(jump(config(), "colors", SCREEN)).toBeUndefined();
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

  it("This screen: the values move into the screen's theme, and the widget follows again with them gone", () => {
    const c = makeTheme(custom(), WIDGET, "screen");
    expect(profileOf(c).widgetTheme?.values).toEqual({ accent: "#ff6a3d", glow: "soft" });
    expect(zoneOf(c)).not.toHaveProperty("follow");
    expect(zoneOf(c).settings).toEqual({ label: "CPU" });
    expect(stateAfter(c, "colors", SCREEN)).toBe("base");
    expect(stateAfter(c, "colors", WIDGET)).toBe("inherited");
    expect(resolveInheritance(c, "colors", WIDGET).resolvedValue).toMatchObject({ accent: "#ff6a3d" });
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
    expect(makeTheme(c, WIDGET, "screen")).toBe(c);
  });
});
