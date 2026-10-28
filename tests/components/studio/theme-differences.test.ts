import { describe, expect, it } from "vitest";
import type { AppearancePreset } from "@/lib/appearance-presets";
import { defaultConfig, type DashboardConfig, type MonitorProfile, type Placement } from "@/lib/layout";
import type { ThemeAt } from "@/components/studio/theme-cards";
import { differenceSummary, differencesOf, differencesPill, followAll, pageDifferences, widgetCount, widgetsKeeping } from "@/components/studio/theme-differences";
import { exceptionsOf } from "@/components/studio/theme-exceptions";

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
 * Screen "Desk" whose applied variant wrote card opacity into two widgets: "opaque" still holds only that write,
 * "blurred" also has a blur of its own; "red" has an accent of its own; "plain" follows.
 */
function setup(): DashboardConfig {
  const c = defaultConfig();
  const desk: MonitorProfile = {
    ...c.profiles[0],
    id: "desk",
    name: "Desk",
    appliedTheme: {
      id: "builtin:tpl-x",
      name: "Glass · Smoke",
      values: {},
      zones: { opaque: { was: {}, now: { surfaceOpacity: 60 } }, blurred: { was: {}, now: { surfaceOpacity: 60 } } },
    },
    pages: [
      {
        id: "main",
        name: "Main",
        placements: [
          zone("opaque", { settings: { surfaceOpacity: 60 }, follow: { surface: false } }),
          zone("blurred", { settings: { surfaceOpacity: 60, blur: "8" }, follow: { surface: false } }),
          zone("red", { settings: { accent: "#ff0000" }, follow: { colors: false } }),
          zone("plain"),
        ],
      },
    ],
  };
  return { ...c, profiles: [desk] };
}

const SCREEN: ThemeAt = { level: "screen", profileId: "desk" };
const diffsOf = (c: DashboardConfig) => differencesOf(c, exceptionsOf(c, SCREEN));

describe("the owner rule", () => {
  it("leaves out a widget whose only own values are a theme's writes; one with a value of its own still differs", () => {
    const c = setup();
    expect(diffsOf(c).map((ex) => ex.key)).toEqual(["widget:main:blurred:surface", "widget:main:red:colors"]);
  });

  it("counts the widget again once its value no longer equals the write", () => {
    const c = setup();
    const changed: DashboardConfig = {
      ...c,
      profiles: [{ ...c.profiles[0], pages: [{ ...c.profiles[0].pages[0], placements: [zone("opaque", { settings: { surfaceOpacity: 30 }, follow: { surface: false } })] }] }],
    };
    expect(diffsOf(changed).map((ex) => ex.key)).toEqual(["widget:main:opaque:surface"]);
  });
});

describe("the preview", () => {
  it("groups the differences by widget on the page drawn", () => {
    const diffs = pageDifferences(diffsOf(setup()), "main");
    expect([...diffs.keys()]).toEqual(["blurred", "red"]);
    expect(pageDifferences(diffsOf(setup()), "other").size).toBe(0);
  });

  it("the pill counts the widgets, or offers to show them", () => {
    expect(differencesPill(2, true)).toBe("2 widgets differ · hide tags");
    expect(differencesPill(1, true)).toBe("1 widget differs · hide tags");
    expect(differencesPill(2, false)).toBe("Show what differs");
  });

  it("the summary names what the widget uses of its own, never a theme's write", () => {
    const c = setup();
    const diffs = pageDifferences(diffsOf(c), "main");
    const placements = c.profiles[0].pages[0].placements;
    const summary = differenceSummary(c, placements[1], diffs.get("blurred"), "Desk");
    expect(summary).toMatch(/^Uses its own Surface & border: blur .*8.*\. Everything else follows Desk\.$/);
    expect(summary).not.toContain("60");
    expect(differenceSummary(c, placements[2], diffs.get("red"), "Desk")).toBe("Uses its own Colors: accent color #FF0000. Everything else follows Desk.");
    expect(differenceSummary(c, placements[3], undefined, "Desk")).toBe("Follows Desk everywhere.");
  });

  it("Use theme's value and Make all follow make exactly the differences follow, keeping the writes", () => {
    const c = setup();
    const next = followAll(c, diffsOf(c));
    const zones = next.profiles[0].pages[0].placements;
    expect(diffsOf(next)).toEqual([]);
    expect(zones.find((z) => z.id === "opaque")?.follow).toEqual({ surface: false });
    expect(zones.find((z) => z.id === "red")?.settings).toEqual({ accent: "#ff0000" });
  });

  it("keeps a theme's write in a card that also held a value of the widget's own", () => {
    const c = setup();
    const blurred = followAll(c, diffsOf(c)).profiles[0].pages[0].placements.find((z) => z.id === "blurred");
    expect(blurred?.settings).toEqual({ surfaceOpacity: 60 });
    expect(blurred?.follow).toEqual({ surface: false });
  });
});

describe("after a theme pick", () => {
  const preset = (style: Record<string, string>): AppearancePreset => ({ id: "t", name: "T", description: "", theme: "zinc", radius: 0.5, style });

  it("names the widgets that keep their own look in the sections the theme sets, and Make them follow clears them", () => {
    const c = setup();
    expect(widgetsKeeping(c, SCREEN, preset({ accent: "#2563eb" })).map((ex) => ex.key)).toEqual(["widget:main:red:colors"]);
    const both = widgetsKeeping(c, SCREEN, preset({ accent: "#2563eb", surface: "theme" }));
    expect(widgetCount(both)).toBe(2);
    expect(widgetsKeeping(followAll(c, both), SCREEN, preset({ accent: "#2563eb", surface: "theme" }))).toEqual([]);
    expect(widgetsKeeping(c, SCREEN, preset({ font: "inter" }))).toEqual([]);
  });
});
