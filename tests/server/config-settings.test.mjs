import { describe, expect, it } from "vitest";
import { applySettingsPatch } from "../../server/config-settings.mjs";

const stored = () => ({
  version: 11,
  general: { font: "inter", maxFps: 30, showSeconds: false },
  style: { clock: "24", surface: "glass" },
  profiles: [
    { id: "desk", name: "Desk", pages: [{ id: "one", placements: [] }], performance: { maxFps: 30 } },
    { id: "wall", name: "Wall", pages: [{ id: "one", placements: [] }] },
  ],
});

describe("applySettingsPatch", () => {
  it("sets and clears general keys and keeps the rest of the config", () => {
    const { config } = applySettingsPatch(stored(), { general: { maxFps: 60, hideCursor: true, showSeconds: null } });
    expect(config.general).toEqual({ font: "inter", maxFps: 60, hideCursor: true });
    expect(config.style).toEqual(stored().style);
    expect(config.profiles).toEqual(stored().profiles);
    expect(config.version).toBe(11);
  });

  it("drops general when its last key is cleared", () => {
    const { config } = applySettingsPatch({ ...stored(), general: { maxFps: 30 } }, { general: { maxFps: null } });
    expect(config).not.toHaveProperty("general");
  });

  it("sets and clears the all-screens clock without touching other style keys", () => {
    expect(applySettingsPatch(stored(), { style: { clock: "12" } }).config.style).toEqual({ clock: "12", surface: "glass" });
    expect(applySettingsPatch(stored(), { style: { clock: null } }).config.style).toEqual({ surface: "glass" });
    const bare = applySettingsPatch({ ...stored(), style: { clock: "24" } }, { style: { clock: null } }).config;
    expect(bare).not.toHaveProperty("style");
  });

  it("replaces or resets a screen's own performance", () => {
    const set = applySettingsPatch(stored(), { profiles: { wall: { performance: { maxFps: 15, motion: "reduce" } } } }).config;
    expect(set.profiles[1].performance).toEqual({ maxFps: 15, motion: "reduce" });
    expect(set.profiles[0]).toEqual(stored().profiles[0]);
    const reset = applySettingsPatch(stored(), { profiles: { desk: { performance: null } } }).config;
    expect(reset.profiles[0]).not.toHaveProperty("performance");
    expect(reset.profiles[0].pages).toEqual(stored().profiles[0].pages);
  });

  it("accepts every frame-rate choice and the system locale", () => {
    for (const maxFps of [5, 15, 30, 60, 0]) expect(applySettingsPatch(stored(), { general: { maxFps } }).config.general.maxFps).toBe(maxFps);
    expect(applySettingsPatch(stored(), { general: { locale: "" } }).config.general.locale).toBe("");
    expect(applySettingsPatch(stored(), { general: { locale: "de-CH" } }).config.general.locale).toBe("de-CH");
  });

  it("refuses a patch with an unknown key or a bad value, whole", () => {
    const refused = [
      { theme: {} },
      { general: { font: "inter" } },
      { general: { maxFps: 24 } },
      { general: { motion: "slow" } },
      { general: { showSeconds: "yes" } },
      { general: { locale: "not a locale!" } },
      { general: [] },
      { style: { clock: "auto" } },
      { style: { surface: "glass" } },
      { profiles: { desk: { performance: { maxFps: 7 } } } },
      { profiles: { desk: { performance: { maxFps: null } } } },
      { profiles: { desk: { name: "x" } } },
      { profiles: [] },
      null,
      [],
    ];
    for (const patch of refused) expect(applySettingsPatch(stored(), patch), JSON.stringify(patch)).toMatchObject({ status: 400 });
  });

  it("refuses a screen the config does not have, and an unreadable config", () => {
    expect(applySettingsPatch(stored(), { profiles: { nope: { performance: null } } })).toEqual({ status: 404, message: "no screen nope" });
    expect(applySettingsPatch(null, { general: { maxFps: 30 } })).toMatchObject({ status: 409 });
  });
});
