import { describe, expect, it } from "vitest";
import { defaultConfig, newProfile, type DashboardConfig, type MonitorProfile, type ProfilePage } from "@/lib/layout";
import { mainPage } from "@/lib/pages";
import {
  launchRule,
  launchTag,
  rotationPageIds,
  screenMeta,
  smoothOffScreens,
  toggleRotationPage,
  withLaunch,
  withScreenPerformance,
} from "@/components/studio/screens-model";

const two = (): DashboardConfig => {
  const c = defaultConfig();
  return { ...c, profiles: [{ ...c.profiles[0], id: "desk" }, { ...newProfile("Side", 1280, 400), id: "side" }], activeProfile: "auto" };
};

const page = (id: string): ProfilePage => ({ ...mainPage(), id, name: id });
const pages = ["a", "b", "c"].map(page);

describe("the launch rule (config.activeProfile)", () => {
  it("is best fit for auto, and one screen for an id that exists", () => {
    expect(launchRule(two())).toBe("auto");
    expect(launchRule({ ...two(), activeProfile: "side" })).toBe("fixed");
  });

  it("reads an id nothing matches as best fit, the way the app opens it", () => {
    expect(launchRule({ ...two(), activeProfile: "gone" })).toBe("auto");
  });

  it("writes auto or a screen id, and ignores one that does not exist", () => {
    const c = two();
    expect(withLaunch(c, "side").activeProfile).toBe("side");
    expect(withLaunch({ ...c, activeProfile: "side" }, "auto").activeProfile).toBe("auto");
    expect(withLaunch(c, "gone")).toBe(c);
    // The same value is no change (no undo step).
    expect(withLaunch(c, "auto")).toBe(c);
  });

  it("tags the best fit while the rule is best fit, and the fixed screen otherwise", () => {
    const c = two();
    expect(launchTag(c, "desk", "desk")).toBe("best-fit");
    expect(launchTag(c, "side", "desk")).toBeUndefined();
    const fixed = withLaunch(c, "side");
    expect(launchTag(fixed, "side", "desk")).toBe("launch");
    expect(launchTag(fixed, "desk", "desk")).toBeUndefined();
  });
});

describe("screenMeta", () => {
  it("reads size, pages and grid", () => {
    const p = { ...newProfile("P", 1920, 550), cols: 8, rows: 3 };
    expect(screenMeta(p)).toBe("1920×550 · 1 page · grid 8 × 3");
    expect(screenMeta({ ...p, pages })).toBe("1920×550 · 3 pages · grid 8 × 3");
  });
});

describe("a screen's own performance", () => {
  const profileOf = (c: DashboardConfig, id: string): MonitorProfile => c.profiles.find((p) => p.id === id)!;

  it("applies the patch to that screen only, keys it sets added to its own", () => {
    const out = withScreenPerformance(two(), "side", { maxFps: 15 });
    expect(profileOf(out, "side").performance).toEqual({ maxFps: 15 });
    expect(profileOf(out, "desk").performance).toBeUndefined();
    const more = withScreenPerformance(withScreenPerformance(out, "side", { motion: "full" }), "side", { blurLimit: false });
    expect(profileOf(more, "side").performance).toEqual({ maxFps: 15, motion: "full", blurLimit: false });
  });

  it("clears a key back to the default, and keeps nothing empty", () => {
    const own = withScreenPerformance(two(), "side", { maxFps: 5, ringGlide: true });
    expect(profileOf(withScreenPerformance(own, "side", { maxFps: undefined }), "side").performance).toEqual({ ringGlide: true });
    expect(profileOf(withScreenPerformance(own, "side", { maxFps: undefined, ringGlide: undefined }), "side").performance).toBeUndefined();
  });
});

describe("where Smooth is off", () => {
  const withOwn = (...own: [string, MonitorProfile["performance"]][]): DashboardConfig => {
    const c = two();
    return { ...c, profiles: c.profiles.map((p) => ({ ...p, performance: own.find(([id]) => id === p.id)?.[1] })) };
  };

  it("finds it per screen: a cap under 60 fps or reduced animations", () => {
    const own = withOwn(["desk", { maxFps: 30 }], ["side", { motion: "reduce", maxFps: 5 }]);
    expect(smoothOffScreens(own).map((s) => [s.id, s.reason])).toEqual([
      ["desk", "30 fps cap"],
      ["side", "5 fps cap and animations reduced"],
    ]);
    expect(smoothOffScreens(withOwn(["desk", { maxFps: 0 }], ["side", { maxFps: 60, motion: "system" }]))).toEqual([]);
    expect(smoothOffScreens(two())).toEqual([]);
  });
});

describe("which pages the rotation includes", () => {
  it("is every page when none are ticked or the ticked ones are gone", () => {
    expect(rotationPageIds(undefined, pages)).toEqual(["a", "b", "c"]);
    expect(rotationPageIds({ enabled: true, seconds: 15, pages: [] }, pages)).toEqual(["a", "b", "c"]);
    expect(rotationPageIds({ enabled: true, seconds: 15, pages: ["x"] }, pages)).toEqual(["a", "b", "c"]);
  });

  it("keeps the ticked ones in page order", () => {
    expect(rotationPageIds({ enabled: true, seconds: 15, pages: ["c", "a"] }, pages)).toEqual(["a", "c"]);
  });

  it("switching one page out ticks the rest, and back in leaves none ticked (every page)", () => {
    const out = toggleRotationPage(undefined, pages, "b");
    expect(out).toEqual({ pages: ["a", "c"] });
    expect(toggleRotationPage({ enabled: true, seconds: 15, ...out }, pages, "b")).toEqual({ pages: undefined });
  });

  it("refuses to switch out the last page, since none ticked means every page", () => {
    expect(toggleRotationPage({ enabled: true, seconds: 15, pages: ["b"] }, pages, "b")).toBeNull();
    expect(toggleRotationPage(undefined, [page("only")], "only")).toBeNull();
  });
});
