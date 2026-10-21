import { describe, expect, it } from "vitest";
import { defaultConfig, type DashboardConfig, type MonitorProfile, type Placement } from "@/lib/layout";
import { appearanceOf, resolveWith } from "@/lib/style-resolve";
import { modules } from "@/modules";
import { followInfo } from "@/components/studio/inspector-model";
import { THEME_EDITOR_SETTINGS } from "@/components/studio/theme-editor-settings";
import {
  scopeAppearance,
  scopeLookValues,
  withLock,
  withLockAll,
  withPageFollow,
  withScopeValues,
  type ThemeScope,
} from "@/components/studio/theme-editor-model";
import { shownValue } from "@/components/studio/inspector/zone-fields";
import { sourceState } from "@/components/studio/inspector-model";

const zone = (id: string, module: string, extra: Partial<Placement> = {}): Placement => ({
  id,
  module,
  colStart: 1,
  rowStart: 1,
  colSpan: 3,
  rowSpan: 2,
  visible: true,
  ...extra,
});

/** One profile "Desk" with pages Main (a CpuMonitor custom for Colors and Thresholds, a Weather) and Gaming. */
function setup(): DashboardConfig {
  const c = defaultConfig();
  const profile: MonitorProfile = {
    ...c.profiles[0],
    id: "desk",
    name: "Desk",
    pages: [
      {
        id: "main",
        name: "Main",
        placements: [
          zone("cpu", "CpuMonitor", { settings: { accent: "#ff0000", "warn.load": 60 }, follow: { colors: false, thresholds: false } }),
          zone("wx", "Weather"),
        ],
      },
      { id: "gaming", name: "Gaming", placements: [zone("cpu2", "CpuMonitor", { follow: { colors: false } })] },
    ],
  };
  return { ...c, profiles: [profile] };
}

const PROFILE: ThemeScope = { kind: "profile" };
const GAMING: ThemeScope = { kind: "page", pageId: "gaming" };
const desk = (c: DashboardConfig) => c.profiles[0];
const cpuDefs = modules.find((m) => m.id === "CpuMonitor")!.settings!;
/** A placement's resolved settings under its page's theme, as the canvas draws it. */
const rendered = (c: DashboardConfig, pageId: string, id: string) => {
  const page = desk(c).pages.find((p) => p.id === pageId)!;
  const z = page.placements.find((p) => p.id === id)!;
  const view = { ...desk(c), pageId, ...(page.widgetTheme ? { pageTheme: page.widgetTheme } : {}) };
  return resolveWith(appearanceOf(c, view), z.settings, z.follow, undefined, cpuDefs) ?? {};
};

describe("theme scopes", () => {

  it("edits the all-profiles base, the profile theme or one page theme", () => {
    let c = withScopeValues(setup(), "desk", { kind: "base" }, (v) => ({ ...v, accent: "#111111" }));
    expect(c.style).toEqual({ accent: "#111111" });
    c = withScopeValues(c, "desk", PROFILE, (v) => ({ ...v, accent: "#222222" }));
    expect(desk(c).widgetTheme?.values).toEqual({ accent: "#222222" });
    c = withScopeValues(c, "desk", GAMING, (v) => ({ ...v, accent: "#333333" }));
    expect(desk(c).pages[1].widgetTheme?.values).toEqual({ accent: "#333333" });
    expect(desk(c).pages[0].widgetTheme).toBeUndefined();
    // Clearing the last value stores none.
    expect(withScopeValues(c, "desk", { kind: "base" }, () => ({})).style).toBeUndefined();
    expect(desk(withScopeValues(c, "desk", GAMING, () => ({}))).pages[1].widgetTheme).toBeUndefined();
  });

  it("shows a page's own values only where the page is custom for the section, else the profile's", () => {
    let c = withScopeValues(setup(), "desk", PROFILE, (v) => ({ ...v, accent: "#222222" }));
    c = withScopeValues(c, "desk", GAMING, (v) => ({ ...v, accent: "#333333" }));
    const accent = THEME_EDITOR_SETTINGS.find((d) => d.key === "accent")!;
    const following = scopeLookValues(scopeAppearance(c, desk(c), GAMING), "page");
    expect(shownValue(following, "accent", accent)).toBe("#222222");
    expect(sourceState(accent, following)).toBe("default");
    c = withPageFollow(c, "desk", "gaming", "colors", false);
    const custom = scopeLookValues(scopeAppearance(c, desk(c), GAMING), "page");
    expect(shownValue(custom, "accent", accent)).toBe("#333333");
    expect(sourceState(accent, custom)).toBe("here");
  });
});

describe("locks (SPEC §9 item 6)", () => {
  it("locking Thresholds in the profile shows Locked in every widget, and they render without their own values", () => {
    let c = withScopeValues(setup(), "desk", PROFILE, (v) => ({ ...v, "warn.load": 70 }));
    expect(rendered(c, "main", "cpu")["warn.load"]).toBe(60);
    c = withLock(c, "desk", "thresholds", true);
    expect(desk(c).widgetTheme?.locks).toEqual({ thresholds: true });
    for (const page of desk(c).pages) {
      const appearance = appearanceOf(c, { ...desk(c), pageId: page.id });
      for (const z of page.placements) expect(followInfo(appearance, z.follow, "thresholds").mode).toBe("locked");
    }
    expect(rendered(c, "main", "cpu")["warn.load"]).toBe(70);
    // The own value stays stored; unlocking brings it back.
    expect(desk(c).pages[0].placements[0].settings?.["warn.load"]).toBe(60);
    expect(rendered(withLock(c, "desk", "thresholds", false), "main", "cpu")["warn.load"]).toBe(60);
  });

  it("a locked section is the profile's on a custom page too", () => {
    let c = withScopeValues(setup(), "desk", PROFILE, (v) => ({ ...v, "warn.load": 70 }));
    c = withScopeValues(c, "desk", GAMING, (v) => ({ ...v, "warn.load": 50 }));
    c = withPageFollow(c, "desk", "gaming", "thresholds", false);
    expect(rendered(c, "gaming", "cpu2")["warn.load"]).toBe(50);
    expect(rendered(withLock(c, "desk", "thresholds", true), "gaming", "cpu2")["warn.load"]).toBe(70);
  });

  it("Lock all locks every section, and unlocks them", () => {
    const c = withLockAll(setup(), "desk", true);
    expect(Object.keys(desk(c).widgetTheme?.locks ?? {})).toHaveLength(11);
    expect(desk(withLockAll(c, "desk", false)).widgetTheme).toBeUndefined();
  });
});

describe("the profile accent (SPEC §9 item 5)", () => {
  it("repaints every following widget; a widget with Colors custom keeps its own", () => {
    const c = withScopeValues(setup(), "desk", PROFILE, (v) => ({ ...v, accent: "#00ff00" }));
    const page = desk(c).pages[0];
    const appearance = appearanceOf(c, { ...desk(c), pageId: "main" });
    const wx = page.placements[1];
    expect(resolveWith(appearance, wx.settings, wx.follow)?.accent).toBe("#00ff00");
    expect(rendered(c, "main", "cpu").accent).toBe("#ff0000");
  });
});
