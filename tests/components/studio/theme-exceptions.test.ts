import { describe, expect, it } from "vitest";
import { defaultConfig, type DashboardConfig, type MonitorProfile, type Placement } from "@/lib/layout";
import { themeCard, withCardLock, withToken, type ThemeAt } from "@/components/studio/theme-cards";
import { withPageFollow } from "@/components/studio/theme-editor-model";
import { exceptionsOf, makeAllFollow, makeFollow, previewProfile, widgetOverrides } from "@/components/studio/theme-exceptions";

const zone = (id: string, extra: Partial<Placement> = {}): Placement => ({
  id,
  module: "CpuMonitor",
  colStart: 1,
  rowStart: 1,
  colSpan: 3,
  rowSpan: 2,
  visible: true,
  ...extra,
});

/**
 * Screen "Desk" with its own color tokens; page Main (a CPU custom for Colors, a second custom for Motion) and
 * page Gaming (custom Border & glow, with a CPU custom for Typography).
 */
function setup(): DashboardConfig {
  const c = defaultConfig();
  const desk: MonitorProfile = {
    ...c.profiles[0],
    id: "desk",
    name: "Desk",
    pages: [
      {
        id: "main",
        name: "Main",
        placements: [
          zone("cpu", { settings: { accent: "#ff0000" }, follow: { colors: false } }),
          zone("gpu", { settings: { smoothing: "smooth" }, follow: { motion: false } }),
        ],
      },
      {
        id: "gaming",
        name: "Gaming",
        widgetTheme: { values: { glow: "soft" }, follow: { border: false } },
        placements: [zone("cpu2", { settings: { font: "mono" }, follow: { type: false } })],
      },
    ],
  };
  return withToken({ ...c, profiles: [desk] }, { level: "screen", profileId: "desk" }, "primary", "1 2% 3%");
}

const ALL: ThemeAt = { level: "all" };
const SCREEN: ThemeAt = { level: "screen", profileId: "desk" };
const GAMING: ThemeAt = { level: "page", profileId: "desk", pageId: "gaming" };
const desk = (c: DashboardConfig) => c.profiles[0];
const keys = (c: DashboardConfig, at: ThemeAt) => exceptionsOf(c, at).map((ex) => ex.key);

describe("what each scope lists", () => {
  it("All screens: the screen, its pages and widgets; a screen: pages and widgets; a page: its widgets", () => {
    const c = setup();
    expect(keys(c, ALL)).toEqual([
      "screen:desk:colors",
      "widget:main:cpu:colors",
      "widget:main:gpu:motion",
      "page:gaming:border",
      "widget:gaming:cpu2:type",
    ]);
    expect(keys(c, SCREEN)).toEqual(["widget:main:cpu:colors", "widget:main:gpu:motion", "page:gaming:border", "widget:gaming:cpu2:type"]);
    expect(keys(c, GAMING)).toEqual(["widget:gaming:cpu2:type"]);
  });

  it("marks an override the screen's lock ignores, and counts widgets per card", () => {
    const c = withCardLock(setup(), "desk", themeCard("colors"), true);
    const list = exceptionsOf(c, SCREEN);
    expect(list.find((ex) => ex.key === "widget:main:cpu:colors")?.ignored).toBe(true);
    expect(list.find((ex) => ex.key === "widget:main:gpu:motion")?.ignored).toBe(false);
    expect(widgetOverrides(list, themeCard("colors"))).toBe(1);
    expect(widgetOverrides(list, themeCard("border"))).toBe(0);
  });
});

describe("Make it follow", () => {
  it("resets exactly that override: a widget follows again, keeping its values stored", () => {
    const c = setup();
    const ex = exceptionsOf(c, SCREEN).find((e) => e.key === "widget:main:cpu:colors")!;
    const out = makeFollow(c, ex);
    expect(desk(out).pages[0].placements[0]).toEqual({ ...desk(c).pages[0].placements[0], follow: undefined });
    expect(desk(out).pages[0].placements[0].settings).toEqual({ accent: "#ff0000" });
    expect(keys(out, SCREEN)).toEqual(["widget:main:gpu:motion", "page:gaming:border", "widget:gaming:cpu2:type"]);
  });

  it("a page follows its screen again; a screen drops its own values for the card", () => {
    const c = setup();
    const page = makeFollow(c, exceptionsOf(c, SCREEN).find((e) => e.kind === "page")!);
    expect(desk(page).pages[1].widgetTheme).toEqual({ values: { glow: "soft" } });
    const screen = makeFollow(c, exceptionsOf(c, ALL).find((e) => e.kind === "screen")!);
    expect(desk(screen)).not.toHaveProperty("theme");
  });
});

describe("Make all follow respects the scope", () => {
  it("a page only touches its widgets, never the page's own sections", () => {
    const out = makeAllFollow(setup(), GAMING);
    expect(desk(out).pages[1].widgetTheme).toEqual(desk(setup()).pages[1].widgetTheme);
    expect(desk(out).pages[1].placements[0].follow).toBeUndefined();
    // Main's widgets are not below Gaming.
    expect(desk(out).pages[0]).toEqual(desk(setup()).pages[0]);
  });

  it("a screen clears its pages and widgets but keeps its own look; All screens clears the screen too", () => {
    const screen = makeAllFollow(setup(), SCREEN);
    expect(exceptionsOf(screen, SCREEN)).toEqual([]);
    expect(desk(screen).theme).toBeDefined();
    const all = makeAllFollow(setup(), ALL);
    expect(exceptionsOf(all, ALL)).toEqual([]);
    expect(desk(all)).not.toHaveProperty("theme");
  });
});

describe("the preview", () => {
  it("draws All screens without the screen's and pages' own look, a screen without its pages'", () => {
    const c = withPageFollow(setup(), "desk", "main", "colors", false);
    const all = previewProfile(desk(c), ALL);
    expect(all).not.toHaveProperty("theme");
    expect(all.pages.every((pg) => pg.widgetTheme === undefined)).toBe(true);
    // Widgets keep their own (they get the badge).
    expect(all.pages[0].placements[0].follow).toEqual({ colors: false });
    const screen = previewProfile(desk(c), SCREEN);
    expect(screen.theme).toEqual(desk(c).theme);
    expect(screen.pages.every((pg) => pg.widgetTheme === undefined)).toBe(true);
    expect(previewProfile(desk(c), GAMING)).toBe(desk(c));
  });
});
