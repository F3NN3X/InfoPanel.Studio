import { describe, expect, it } from "vitest";
import { applySettingsPatch, reapplySettings } from "../../server/config-settings.mjs";

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
    for (const key of ["ringGlide", "blurLimit", "innerBlur", "liveGlow"]) for (const on of [true, false]) expect(applySettingsPatch(stored(), { general: { [key]: on } }).config.general[key]).toBe(on);
    for (const kioskRefresh of ["daily", "off"]) expect(applySettingsPatch(stored(), { general: { kioskRefresh } }).config.general.kioskRefresh).toBe(kioskRefresh);
  });

  it("refuses a patch with an unknown key or a bad value, whole", () => {
    const refused = [
      { theme: {} },
      { general: { font: "inter" } },
      { general: { maxFps: 24 } },
      { general: { motion: "slow" } },
      { general: { kioskRefresh: "hourly" } },
      { general: { blurLimit: "yes" } },
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

describe("reapplySettings", () => {
  const log = [
    { rev: 5, patch: { general: { maxFps: 60 } } },
    { rev: 6, patch: { general: { maxFps: 15 }, style: { clock: "12" } } },
    { rev: 7, patch: { profiles: { gone: { performance: null } } } },
  ];

  it("applies the patches newer than the pushed config's revision, in order, and not the older ones", () => {
    const pushed = { ...stored(), general: { font: "inter", maxFps: 30 } };
    const { general, style } = reapplySettings(pushed, log, 5);
    expect(general).toEqual({ font: "inter", maxFps: 15 });
    expect(style.clock).toBe("12");
    expect(reapplySettings(pushed, log, 7)).toBe(pushed);
  });

  it("skips a patch the config no longer accepts and keeps the others", () => {
    const config = reapplySettings(stored(), log, 4);
    expect(config.general.maxFps).toBe(15);
    expect(config.profiles).toEqual(stored().profiles);
  });
});
