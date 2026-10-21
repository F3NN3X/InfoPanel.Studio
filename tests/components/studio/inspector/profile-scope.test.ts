import { describe, expect, it } from "vitest";
import { withBackground, type PageBackground } from "@/lib/appearance";
import { defaultConfig, mergeConfig, type DashboardConfig, type MonitorProfile } from "@/lib/layout";
import { DEFAULT_THEME } from "@/lib/theme";
import { SECTION_IDS } from "@/lib/theme-model";
import { setProfileStyle } from "@/components/studio/studio-actions";
import { clampSeconds, dropRow, rotatePreset } from "@/components/studio/inspector/behaviour-model";
import {
  lockState,
  scopeOf,
  toggleLockAll,
  withPerformance,
  withRadius,
  withScope,
} from "@/components/studio/inspector/profile-scope";

const base = (): DashboardConfig => ({
  ...defaultConfig(),
  theme: { ...DEFAULT_THEME, primary: "10 20% 30%" },
  radius: 0.75,
  style: { skin: "glass" },
  background: { type: "color", color: "#123456" },
  general: { maxFps: 30, motion: "reduce" },
});

const profileOf = (c: DashboardConfig): MonitorProfile => c.profiles[0];
const pid = (c: DashboardConfig) => profileOf(c).id;

/** A config as an older build saved it: the profile with these keys over a minimal one. */
const stored = (extra: Record<string, unknown>): MonitorProfile =>
  mergeConfig({
    version: 9,
    profiles: [{ id: "p", name: "P", width: 1920, height: 1080, cols: 12, rows: 6, fit: "fill", placements: [], ...extra }],
  } as never).profiles[0];

describe("Theme switch", () => {
  it("copies the shared theme and corners to the profile, and drops both going back", () => {
    const c = base();
    const own = withScope(c, pid(c), "theme", "profile");
    expect(profileOf(own).theme).toEqual(c.theme);
    expect(profileOf(own).radius).toBe(0.75);
    expect(scopeOf(profileOf(own), "theme")).toBe("profile");

    const back = withScope(own, pid(own), "theme", "all");
    expect("theme" in profileOf(back)).toBe(false);
    expect("radius" in profileOf(back)).toBe(false);
    expect(scopeOf(profileOf(back), "theme")).toBe("all");
  });

  it("writes Corners to the dashboard under All profiles and to the profile under This profile", () => {
    const c = base();
    const shared = withRadius(c, pid(c), "all", 1);
    expect(shared.radius).toBe(1);
    expect(profileOf(shared).radius).toBeUndefined();

    const own = withRadius(c, pid(c), "profile", 0.25);
    expect(own.radius).toBe(0.75);
    expect(profileOf(own).radius).toBe(0.25);
    // A profile radius alone makes the Theme this profile's.
    expect(scopeOf(profileOf(own), "theme")).toBe("profile");
  });

  it("changes only the profile it names", () => {
    const c = base();
    const two = { ...c, profiles: [...c.profiles, { ...profileOf(c), id: "other" }] };
    const out = withScope(two, pid(two), "theme", "profile");
    expect(out.profiles[1].theme).toBeUndefined();
  });
});

describe("Widget style switch", () => {
  it("starts This profile with no values of its own over the shared style, and drops them going back", () => {
    const c = base();
    const own = withScope(c, pid(c), "style", "profile");
    expect(profileOf(own).widgetTheme?.values).toEqual({});
    expect(scopeOf(profileOf(own), "style")).toBe("profile");

    const locked = { ...own, profiles: [{ ...profileOf(own), widgetTheme: { ...profileOf(own).widgetTheme, locks: { colors: true } } }] };
    const back = withScope(locked, pid(locked), "style", "all");
    expect(profileOf(back).widgetTheme?.values).toBeUndefined();
    // The locks are not part of the switch.
    expect(profileOf(back).widgetTheme?.locks).toEqual({ colors: true });
    expect(scopeOf(profileOf(back), "style")).toBe("all");
  });
});

describe("emptying a This profile style", () => {
  it("keeps the scope: the values stay {} until the switch goes back to All profiles", () => {
    const c = base();
    const own = { ...profileOf(withScope(c, pid(c), "style", "profile")), widgetTheme: { values: { skin: "glass" } } };
    const emptied = setProfileStyle(own, () => ({}));
    expect(emptied.widgetTheme?.values).toEqual({});
    expect(scopeOf(emptied, "style")).toBe("profile");
    // A profile without its own style still stores none.
    expect(setProfileStyle(profileOf(c), () => ({})).widgetTheme).toBeUndefined();
  });
});

describe("Background switch", () => {
  it("copies the shared background to the profile, and drops the key going back", () => {
    const c = base();
    const own = withScope(c, pid(c), "background", "profile");
    expect(profileOf(own).background).toEqual(c.background);
    const back = withScope(own, pid(own), "background", "all");
    expect("background" in profileOf(back)).toBe(false);
  });

  it("starts from None when the dashboard has no background", () => {
    const c = { ...base(), background: undefined };
    expect(profileOf(withScope(c, pid(c), "background", "profile")).background).toEqual({ type: "none" });
  });

  it("keeps None as { type: 'none' } on the profile, and as the dashboard's type under All profiles", () => {
    const none: PageBackground = { type: "none" };
    const c = base();
    const own = withBackground(withScope(c, pid(c), "background", "profile"), { kind: "profile", profileId: pid(c) }, none);
    expect(profileOf(own).background).toEqual(none);
    expect(scopeOf(profileOf(own), "background")).toBe("profile");

    const shared = withBackground(c, { kind: "all" }, none);
    expect(shared.background).toEqual(none);
    expect(scopeOf(profileOf(shared), "background")).toBe("all");
  });
});

describe("Performance switch", () => {
  it("copies the shared frame rate and animations to the profile, and drops them going back", () => {
    const c = base();
    const own = withScope(c, pid(c), "performance", "profile");
    expect(profileOf(own).performance).toEqual({ maxFps: 30, motion: "reduce" });
    const back = withScope(own, pid(own), "performance", "all");
    expect("performance" in profileOf(back)).toBe(false);
  });

  it("copies the defaults when the dashboard sets none", () => {
    const c = { ...base(), general: undefined };
    expect(profileOf(withScope(c, pid(c), "performance", "profile")).performance).toEqual({ maxFps: 60, motion: "system" });
  });

  it("sets one key of the override, and keeps nothing empty", () => {
    expect(withPerformance({ maxFps: 15, motion: "full" }, { maxFps: 5 })).toEqual({ maxFps: 5, motion: "full" });
    expect(withPerformance(undefined, { motion: "system" })).toEqual({ motion: "system" });
    expect(withPerformance({ maxFps: 15 }, { maxFps: undefined })).toBeUndefined();
  });
});

describe("Apply to every widget", () => {
  const some = { locks: { colors: true, surface: true } };

  it("reads all, some and none of the sections locked", () => {
    expect(lockState(undefined)).toBe("none");
    expect(lockState({ values: {} })).toBe("none");
    expect(lockState(some)).toBe("some");
    expect(lockState({ locks: Object.fromEntries(SECTION_IDS.map((s) => [s, true])) })).toBe("all");
  });

  it("locks every section from none or some, and unlocks them from all", () => {
    const all = toggleLockAll(some);
    expect(lockState(all)).toBe("all");
    expect(Object.keys(all?.locks ?? {})).toHaveLength(SECTION_IDS.length);
    expect(toggleLockAll(undefined)).toEqual(all);
    expect(toggleLockAll(all)).toBeUndefined();
    expect(toggleLockAll({ ...all, values: { skin: "glass" } })).toEqual({ values: { skin: "glass" } });
  });
});

describe("a config saved before the switches", () => {
  it("reads Inherit as All profiles for every section", () => {
    const p = stored({});
    expect(["theme", "style", "background", "performance"].map((s) => scopeOf(p, s as never))).toEqual(["all", "all", "all", "all"]);
  });

  it("reads Custom as This profile", () => {
    const p = stored({
      theme: { primary: "1 2% 3%" },
      widgetTheme: { values: { skin: "glass" } },
      background: { type: "color", color: "#000000" },
    });
    expect(["theme", "style", "background"].map((s) => scopeOf(p, s as never))).toEqual(["profile", "profile", "profile"]);
  });

  it("reads a stored None as This profile with the background type none", () => {
    const p = stored({ background: { type: "none" } });
    expect(p.background).toEqual({ type: "none" });
    expect(scopeOf(p, "background")).toBe("profile");
  });

  it("reads a profile with only a radius as a This profile Theme, and All profiles drops it", () => {
    const p = stored({ radius: 0.2 });
    expect(p.theme).toBeUndefined();
    expect(scopeOf(p, "theme")).toBe("profile");
    const config = { ...base(), profiles: [p] };
    expect("radius" in withScope(config, "p", "theme", "all").profiles[0]).toBe(false);
  });

  it("reads performance absent as All profiles and a partial override as This profile", () => {
    expect(scopeOf(stored({}), "performance")).toBe("all");
    const partial = stored({ performance: { motion: "reduce" } });
    expect(partial.performance).toEqual({ motion: "reduce" });
    expect(scopeOf(partial, "performance")).toBe("profile");
    // Max FPS = Dashboard (the key removed) and nothing else is still no override.
    expect(scopeOf(stored({ performance: {} }), "performance")).toBe("all");
  });
});

describe("Cycle interval", () => {
  it("highlights a preset and leaves a stored 15 to the number field", () => {
    expect(rotatePreset(30)).toBe("30");
    expect(rotatePreset(300)).toBe("300");
    expect(rotatePreset(15)).toBe("");
  });

  it("clamps a typed interval to 3–3600 s and refuses text", () => {
    expect(clampSeconds("1")).toBe(3);
    expect(clampSeconds("99999")).toBe(3600);
    expect(clampSeconds("12.6")).toBe(13);
    expect(clampSeconds("")).toBeNull();
    expect(clampSeconds("abc")).toBeNull();
  });
});

describe("page reorder drop", () => {
  const rows = [0, 1, 2].map((i) => ({ top: i * 32, height: 32 }));

  it("lands on the row whose middle the pointer has passed", () => {
    expect(dropRow(rows, 0, 90)).toBe(2);
    expect(dropRow(rows, 2, 10)).toBe(0);
    expect(dropRow(rows, 1, 40)).toBe(1);
  });
});
