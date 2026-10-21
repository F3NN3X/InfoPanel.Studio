import { describe, expect, it } from "vitest";
import { defaultConfig, type DashboardConfig } from "@/lib/layout";
import { withSettingsPatch } from "@/lib/settings-patch";

const config = (): DashboardConfig => {
  const base = defaultConfig();
  return {
    ...base,
    general: { font: "inter", maxFps: 30 },
    style: { clock: "24", surface: "glass" },
    profiles: [
      { ...base.profiles[0], id: "desk", performance: { maxFps: 30 } },
      { ...base.profiles[0], id: "wall" },
    ],
  };
};

describe("withSettingsPatch", () => {
  it("sets and clears general keys, keeping the page font and every other key", () => {
    const before = config();
    const next = withSettingsPatch(before, { general: { maxFps: null, hideCursor: true } });
    expect(next.general).toEqual({ font: "inter", hideCursor: true });
    expect(next.profiles).toBe(before.profiles);
    expect(next.style).toBe(before.style);
  });

  it("drops general and style once their last key is cleared", () => {
    const bare = { ...config(), general: { maxFps: 30 }, style: { clock: "24" } };
    const next = withSettingsPatch(bare, { general: { maxFps: null }, style: { clock: null } });
    expect(next.general).toBeUndefined();
    expect(next.style).toBeUndefined();
  });

  it("sets the clock without touching the rest of the all-screens style", () => {
    expect(withSettingsPatch(config(), { style: { clock: "12" } }).style).toEqual({ clock: "12", surface: "glass" });
  });

  it("replaces or resets one screen's performance and leaves the others as they are", () => {
    const before = config();
    const set = withSettingsPatch(before, { profiles: { wall: { performance: { motion: "reduce" } } } });
    expect(set.profiles[1].performance).toEqual({ motion: "reduce" });
    expect(set.profiles[0]).toBe(before.profiles[0]);
    const reset = withSettingsPatch(before, { profiles: { desk: { performance: null } } });
    expect(reset.profiles[0]).not.toHaveProperty("performance");
    expect(reset.profiles[0].pages).toBe(before.profiles[0].pages);
  });

  it("ignores a screen the config does not have, and leaves the input untouched", () => {
    const before = config();
    const next = withSettingsPatch(before, { profiles: { gone: { performance: null } } });
    expect(next.profiles).toEqual(before.profiles);
    expect(before.general).toEqual({ font: "inter", maxFps: 30 });
  });
});
