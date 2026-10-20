import { describe, expect, it } from "vitest";
import { defaultConfig, type DashboardConfig, type MonitorProfile, type Placement } from "@/lib/layout";
import { appearanceOf, resolveWith } from "@/lib/style-resolve";
import { modules } from "@/modules";
import { allSections, followInfo, type InspectorSection } from "@/components/studio/inspector-model";
import type { FieldsApi } from "@/components/studio/settings-panel";
import { THEME_EDITOR_SETTINGS } from "@/components/studio/theme-editor-settings";
import {
  customCount,
  overridesOf,
  scopeAppearance,
  scopeLookValues,
  themeFollowFields,
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
const section = (id: string): InspectorSection => allSections({ kind: "theme", scope: "profile" }).find((s) => s.id === id)!;

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

describe("follow bars", () => {
  const noop = { onLock: () => {}, onPageFollow: () => {} };

  it("profile: Default for all widgets with the listed page's custom count and a Lock per section", () => {
    const c = setup();
    const locks: [string, boolean][] = [];
    const main = desk(c).pages[0];
    const f = themeFollowFields(scopeAppearance(c, desk(c), PROFILE), main, "profile", { ...noop, onLock: (sec, on) => locks.push([sec, on]) });
    const bar = f.follow!(section("colors"))!;
    // Main's CPU only (Gaming's custom Colors widget is not on the listed page).
    expect(bar).toMatchObject({ mode: "theme", level: "profile", scope: { kind: "profile", custom: 1, pageName: "Main" } });
    const levels = scopeAppearance(c, desk(c), PROFILE);
    expect(customCount(main.placements, levels, "thresholds")).toBe(1);
    expect(customCount(main.placements, levels, "motion")).toBe(0);
    // A locked section has no custom widgets: they follow it anyway.
    const locked = withLock(c, "desk", "thresholds", true);
    expect(customCount(main.placements, scopeAppearance(locked, desk(locked), PROFILE), "thresholds")).toBe(0);
    if (bar.scope?.kind === "profile") bar.scope.onLock(true);
    expect(locks).toEqual([["colors", true]]);
    // The profile edits its values whether locked or not.
    expect(f.readOnly).toBeUndefined();
  });

  it("page: Follows the profile theme + Customize, Custom + Use profile, read-only while following or locked", () => {
    let c = setup();
    const calls: [string, boolean][] = [];
    const fields = (cfg: DashboardConfig) =>
      themeFollowFields(scopeAppearance(cfg, desk(cfg), GAMING), desk(cfg).pages[1], "page", { ...noop, onPageFollow: (sec, f) => calls.push([sec, f]) });
    const accent = THEME_EDITOR_SETTINGS.find((d) => d.key === "accent")!;
    let f: Pick<FieldsApi, "follow" | "readOnly"> = fields(c);
    expect(f.follow!(section("colors"))).toMatchObject({ mode: "theme", scope: { kind: "page", pageName: "Gaming" } });
    expect(f.readOnly!(accent)).toBe(true);
    f.follow!(section("colors"))!.onCustomize();
    expect(calls).toEqual([["colors", false]]);

    c = withPageFollow(c, "desk", "gaming", "colors", false);
    f = fields(c);
    expect(f.follow!(section("colors"))?.mode).toBe("custom");
    expect(f.readOnly!(accent)).toBe(false);
    f.follow!(section("colors"))!.onUseTheme();
    expect(calls[1]).toEqual(["colors", true]);

    // Use profile keeps the page's values stored.
    c = withScopeValues(c, "desk", GAMING, (v) => ({ ...v, accent: "#333333" }));
    c = withPageFollow(c, "desk", "gaming", "colors", true);
    expect(desk(c).pages[1].widgetTheme).toEqual({ values: { accent: "#333333" } });

    // A locked section reads Locked on the page, read-only, even where the page was custom.
    c = withPageFollow(withLock(c, "desk", "colors", true), "desk", "gaming", "colors", false);
    f = fields(c);
    expect(f.follow!(section("colors"))?.mode).toBe("locked");
    expect(f.readOnly!(accent)).toBe(true);
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

describe("who doesn't follow the theme", () => {
  it("lists per section exactly the page's widgets with that section custom", () => {
    const c = setup();
    const list = overridesOf(desk(c).pages[0].placements, scopeAppearance(c, desk(c), PROFILE));
    const custom = list.filter((o) => o.zones.length > 0);
    expect(custom.map((o) => [o.sec, o.zones.map((z) => z.id)])).toEqual([
      ["colors", ["cpu"]],
      ["thresholds", ["cpu"]],
    ]);
    expect(list.find((o) => o.sec === "palette")?.title).toBe("Widget colors");
    expect(list.every((o) => !o.locked)).toBe(true);
    const locked = withLock(c, "desk", "colors", true);
    expect(overridesOf(desk(locked).pages[0].placements, scopeAppearance(locked, desk(locked), PROFILE)).find((o) => o.sec === "colors")?.locked).toBe(true);
  });

});

