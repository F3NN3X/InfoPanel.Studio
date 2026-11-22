import { upgradeConfig } from "@/lib/config-upgrade";
import { describe, expect, it } from "vitest";
import { normalizePerformance, performanceFromSearch, resolvePerformance } from "@/lib/performance";


const general = { maxFps: 60, motion: "system" as const };

describe("performanceFromSearch", () => {
  it("reads fps, animations=0 and motion", () => {
    expect(performanceFromSearch("?kiosk=1&fps=30")).toEqual({ maxFps: 30 });
    expect(performanceFromSearch("?fps=0")).toEqual({ maxFps: 0 });
    expect(performanceFromSearch("?animations=0")).toEqual({ motion: "reduce" });
    expect(performanceFromSearch("?motion=full")).toEqual({ motion: "full" });
    expect(performanceFromSearch("?animations=0&motion=full")).toEqual({ motion: "full" });
  });

  it("ignores bad values", () => {
    expect(performanceFromSearch("?fps=24&motion=lots&animations=1")).toEqual({});
    expect(performanceFromSearch("?fps=abc")).toEqual({});
    expect(performanceFromSearch("?fps=")).toEqual({});
  });
});

describe("resolvePerformance", () => {
  it("defaults to 60 fps and follows the OS", () => {
    expect(resolvePerformance({ general: {}, system: false })).toEqual({ maxFps: 60, reduceMotion: false, fx: "full" });
    expect(resolvePerformance({ general, system: true }).reduceMotion).toBe(true);
  });

  it("applies URL > profile > general", () => {
    const g = { maxFps: 15, motion: "reduce" as const };
    expect(resolvePerformance({ general: g, system: false })).toEqual({ maxFps: 15, reduceMotion: true, fx: "off" });
    const profile = { maxFps: 30, motion: "full" as const };
    expect(resolvePerformance({ general: g, profile, system: true })).toEqual({ maxFps: 30, reduceMotion: false, fx: "full" });
    const url = { maxFps: 0, motion: "reduce" as const };
    expect(resolvePerformance({ general: g, profile, url, system: false })).toEqual({ maxFps: 0, reduceMotion: true, fx: "off" });
  });

  it("falls through a layer that sets only the other key", () => {
    expect(resolvePerformance({ general: { maxFps: 5 }, profile: { motion: "reduce" }, url: { maxFps: 30 }, system: false })).toEqual({
      maxFps: 30,
      reduceMotion: true,
      fx: "off",
    });
  });

  it("falls back past invalid values", () => {
    expect(resolvePerformance({ general: { maxFps: 15 }, url: { maxFps: 24 }, system: false }).maxFps).toBe(15);
    expect(resolvePerformance({ general: { maxFps: 7 }, system: false }).maxFps).toBe(60);
  });
});

describe("resolvePerformance: the FX level", () => {
  it("is off under reduced motion and full otherwise when the screen sets none", () => {
    expect(resolvePerformance({ general: {}, system: false }).fx).toBe("full");
    expect(resolvePerformance({ general: {}, system: true }).fx).toBe("off");
    expect(resolvePerformance({ general: { motion: "reduce" }, system: false }).fx).toBe("off");
  });

  it("lets an explicit level win over reduced motion", () => {
    expect(resolvePerformance({ general: { fx: "full", motion: "reduce" }, system: false }).fx).toBe("full");
    expect(resolvePerformance({ general: { fx: "calm" }, system: true }).fx).toBe("calm");
    expect(resolvePerformance({ general: { fx: "off" }, system: false }).fx).toBe("off");
  });

  it("ignores a level that is not one", () => {
    expect(resolvePerformance({ general: { fx: "loud" as never }, system: false }).fx).toBe("full");
  });
});

describe("profile performance", () => {
  it("keeps fx only as one of full, calm or off", () => {
    for (const fx of ["full", "calm", "off"]) expect(normalizePerformance({ fx })).toEqual({ fx });
    for (const bad of ["loud", "", 1, null, true]) expect(normalizePerformance({ fx: bad })).toBeUndefined();
  });

  it("keeps valid keys only", () => {
    expect(normalizePerformance({ maxFps: 30, motion: "reduce", extra: 1 })).toEqual({ maxFps: 30, motion: "reduce" });
    expect(normalizePerformance({ maxFps: 24, motion: "lots" })).toBeUndefined();
    expect(normalizePerformance(undefined)).toBeUndefined();
    for (const fps of [5, 15, 30, 60, 0]) expect(normalizePerformance({ maxFps: fps })).toEqual({ maxFps: fps });
    for (const bad of [24, -1, "30", null, 1000]) expect(normalizePerformance({ maxFps: bad })).toBeUndefined();
  });

  it("keeps the rendering switches as booleans only (each screen's since config v16)", () => {
    for (const key of ["ringGlide", "blurLimit", "innerBlur", "liveGlow", "pixelShift"] as const) {
      expect(normalizePerformance({ [key]: true })).toEqual({ [key]: true });
      expect(normalizePerformance({ [key]: false })).toEqual({ [key]: false });
      for (const bad of ["yes", 1, null]) expect(normalizePerformance({ [key]: bad })).toBeUndefined();
    }
  });

  it("keeps Idle dim only as one of the offered minutes", () => {
    expect(normalizePerformance({ idleDim: 15 })).toEqual({ idleDim: 15 });
    for (const bad of [0, 7, "15", null]) expect(normalizePerformance({ idleDim: bad })).toBeUndefined();
  });

  it("survives loading a config", () => {
    const cfg = upgradeConfig({
      profiles: [{ id: "p", name: "P", width: 800, height: 480, cols: 4, rows: 2, fit: "fill", pages: [], performance: { maxFps: 15, motion: "full" } }],
    });
    expect(cfg.profiles[0].performance).toEqual({ maxFps: 15, motion: "full" });
  });
});
