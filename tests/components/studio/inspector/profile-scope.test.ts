import { describe, expect, it } from "vitest";
import { defaultConfig, mergeConfig, type DashboardConfig, type MonitorProfile } from "@/lib/layout";
import { setProfileStyle } from "@/components/studio/studio-actions";
import { clampSeconds, dropRow, rotatePreset } from "@/components/studio/inspector/behaviour-model";
import { withBuiltin, withPerformance } from "@/components/studio/inspector/profile-scope";

/** One screen with a look and performance of its own, and a second one. */
const base = (): DashboardConfig => {
  const c = defaultConfig();
  const own: MonitorProfile = {
    ...c.profiles[0],
    theme: { primary: "10 20% 30%" },
    radius: 0.75,
    widgetTheme: { values: { skin: "glass" }, locks: { colors: true } },
    background: { type: "color", color: "#123456" },
    performance: { maxFps: 30, motion: "reduce", ringGlide: true },
    font: "inter",
  };
  return { ...c, profiles: [own, { ...own, id: "other" }] };
};

const profileOf = (c: DashboardConfig): MonitorProfile => c.profiles[0];
const pid = (c: DashboardConfig) => profileOf(c).id;

/** A config as an older build saved it: the profile with these keys over a minimal one. */
const stored = (extra: Record<string, unknown>): MonitorProfile =>
  mergeConfig({
    version: 9,
    profiles: [{ id: "p", name: "P", width: 1920, height: 1080, cols: 12, rows: 6, fit: "fill", placements: [], ...extra }],
  } as never).profiles[0];

describe("withBuiltin (Reset at a screen)", () => {
  it("drops the theme and corners together, leaving the other screen", () => {
    const c = base();
    const out = withBuiltin(c, pid(c), "theme");
    expect("theme" in profileOf(out)).toBe(false);
    expect("radius" in profileOf(out)).toBe(false);
    expect(out.profiles[1]).toBe(c.profiles[1]);
  });

  it("drops the background, the page font and the whole performance", () => {
    const c = base();
    expect("background" in profileOf(withBuiltin(c, pid(c), "background"))).toBe(false);
    expect("font" in profileOf(withBuiltin(c, pid(c), "font"))).toBe(false);
    expect("performance" in profileOf(withBuiltin(c, pid(c), "performance"))).toBe(false);
    // The widget style is the sections' own reset; the locks stay.
    expect(profileOf(withBuiltin(c, pid(c), "theme")).widgetTheme).toEqual(profileOf(c).widgetTheme);
  });
});

describe("emptying a screen's style", () => {
  it("keeps its values {} until the screen has none", () => {
    const own = { ...profileOf(base()), widgetTheme: { values: { skin: "glass" } } };
    const emptied = setProfileStyle(own, () => ({}));
    expect(emptied.widgetTheme?.values).toEqual({});
    // A profile without its own style still stores none.
    expect(setProfileStyle(defaultConfig().profiles[0], () => ({})).widgetTheme).toBeUndefined();
  });
});

describe("withPerformance", () => {
  it("sets keys of the screen's performance, and keeps nothing empty", () => {
    expect(withPerformance({ maxFps: 15, motion: "full" }, { maxFps: 5 })).toEqual({ maxFps: 5, motion: "full" });
    expect(withPerformance(undefined, { motion: "system" })).toEqual({ motion: "system" });
    expect(withPerformance({ maxFps: 15 }, { maxFps: undefined })).toBeUndefined();
    expect(withPerformance({ maxFps: 15 }, { blurLimit: false, liveGlow: true })).toEqual({ maxFps: 15, blurLimit: false, liveGlow: true });
  });
});

describe("a profile saved by an older build", () => {
  it("keeps its own theme, style, background and a stored None", () => {
    const p = stored({
      theme: { primary: "1 2% 3%" },
      widgetTheme: { values: { skin: "glass" } },
      background: { type: "none" },
    });
    expect(p.theme).toMatchObject({ primary: "1 2% 3%" });
    expect(p.widgetTheme?.values).toEqual({ skin: "glass" });
    expect(p.background).toEqual({ type: "none" });
  });

  it("keeps a partial performance as it was", () => {
    expect(stored({ performance: { motion: "reduce" } }).performance).toEqual({ motion: "reduce" });
    expect(stored({ performance: {} }).performance).toBeUndefined();
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
