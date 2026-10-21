import { describe, expect, it } from "vitest";
import { defaultConfig, newProfile, type DashboardConfig, type MonitorProfile, type ProfilePage } from "@/lib/layout";
import { mainPage } from "@/lib/pages";
import {
  launchRule,
  launchTag,
  ownPerformanceText,
  rotationPageIds,
  screenMeta,
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

  it("starts from All screens' values when the screen had none, then applies the patch", () => {
    const c = { ...two(), general: { maxFps: 30, motion: "reduce" as const } };
    const out = withScreenPerformance(c, "side", { maxFps: 15 });
    expect(profileOf(out, "side").performance).toEqual({ maxFps: 15, motion: "reduce" });
    expect(profileOf(out, "desk").performance).toBeUndefined();
  });

  it("changes only the patched key once it is the screen's own", () => {
    const c = two();
    const own = withScreenPerformance(withScreenPerformance(c, "side", { maxFps: 5 }), "side", { motion: "full" });
    expect(profileOf(own, "side").performance).toEqual({ maxFps: 5, motion: "full" });
  });

  it("names it for Settings' note, nothing when there is none", () => {
    expect(ownPerformanceText(undefined)).toBeUndefined();
    expect(ownPerformanceText({ maxFps: 30 })).toBe("30 fps");
    expect(ownPerformanceText({ maxFps: 0 })).toBe("unlimited fps");
    expect(ownPerformanceText({ motion: "reduce" })).toBe("reduced motion");
    expect(ownPerformanceText({ maxFps: 30, motion: "full" })).toBe("30 fps · full motion");
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
