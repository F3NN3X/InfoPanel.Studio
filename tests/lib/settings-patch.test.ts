import { describe, expect, it } from "vitest";
import { defaultConfig, type DashboardConfig } from "@/lib/layout";
import { withSettingsPatch } from "@/lib/settings-patch";

const config = (): DashboardConfig => {
  const base = defaultConfig();
  return {
    ...base,
    general: { locale: "de-DE", clock: "24" },
    profiles: [
      { ...base.profiles[0], id: "desk", performance: { maxFps: 30 } },
      { ...base.profiles[0], id: "wall" },
    ],
  };
};

describe("withSettingsPatch", () => {
  it("sets and clears general keys, keeping every other key", () => {
    const before = config();
    const next = withSettingsPatch(before, { general: { clock: null, hideCursor: true } });
    expect(next.general).toEqual({ locale: "de-DE", hideCursor: true });
    expect(next.profiles).toBe(before.profiles);
  });

  it("drops general once its last key is cleared", () => {
    const bare = { ...config(), general: { clock: "24" as const } };
    expect(withSettingsPatch(bare, { general: { clock: null } }).general).toBeUndefined();
  });

  it("sets the app's clock without touching the rest of general", () => {
    expect(withSettingsPatch(config(), { general: { clock: "12" } }).general).toEqual({ locale: "de-DE", clock: "12" });
  });

  it("replaces or resets one screen's performance and leaves the others as they are", () => {
    const before = config();
    const set = withSettingsPatch(before, { profiles: { wall: { performance: { motion: "reduce", ringGlide: true } } } });
    expect(set.profiles[1].performance).toEqual({ motion: "reduce", ringGlide: true });
    expect(set.profiles[0]).toBe(before.profiles[0]);
    const reset = withSettingsPatch(before, { profiles: { desk: { performance: null } } });
    expect(reset.profiles[0]).not.toHaveProperty("performance");
    expect(reset.profiles[0].pages).toBe(before.profiles[0].pages);
  });

  it("sets the startup screen to auto or a screen, null resets to auto, and an unknown id is no change", () => {
    const before = config();
    const fixed = withSettingsPatch(before, { activeProfile: "wall" });
    expect(fixed.activeProfile).toBe("wall");
    expect(fixed.profiles).toBe(before.profiles);
    expect(withSettingsPatch(fixed, { activeProfile: null }).activeProfile).toBe("auto");
    expect(withSettingsPatch(fixed, { activeProfile: "auto" }).activeProfile).toBe("auto");
    expect(withSettingsPatch(fixed, { activeProfile: "gone" }).activeProfile).toBe("wall");
    expect(withSettingsPatch(fixed, { general: { hideCursor: true } }).activeProfile).toBe("wall");
  });

  it("ignores a screen the config does not have, and leaves the input untouched", () => {
    const before = config();
    const next = withSettingsPatch(before, { profiles: { gone: { performance: null } } });
    expect(next.profiles).toEqual(before.profiles);
    expect(before.general).toEqual({ locale: "de-DE", clock: "24" });
  });
});
