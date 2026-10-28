import { describe, expect, it } from "vitest";
import { normalizePerformance, performanceFromSearch, resolvePerformance } from "@/lib/performance";
import { mergeConfig } from "@/lib/layout";

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
    expect(resolvePerformance({ general: {}, system: false })).toEqual({ maxFps: 60, reduceMotion: false });
    expect(resolvePerformance({ general, system: true }).reduceMotion).toBe(true);
  });

  it("applies URL > profile > general", () => {
    const g = { maxFps: 15, motion: "reduce" as const };
    expect(resolvePerformance({ general: g, system: false })).toEqual({ maxFps: 15, reduceMotion: true });
    const profile = { maxFps: 30, motion: "full" as const };
    expect(resolvePerformance({ general: g, profile, system: true })).toEqual({ maxFps: 30, reduceMotion: false });
    const url = { maxFps: 0, motion: "reduce" as const };
    expect(resolvePerformance({ general: g, profile, url, system: false })).toEqual({ maxFps: 0, reduceMotion: true });
  });

  it("falls through a layer that sets only the other key", () => {
    expect(resolvePerformance({ general: { maxFps: 5 }, profile: { motion: "reduce" }, url: { maxFps: 30 }, system: false })).toEqual({
      maxFps: 30,
      reduceMotion: true,
    });
  });

  it("falls back past invalid values", () => {
    expect(resolvePerformance({ general: { maxFps: 15 }, url: { maxFps: 24 }, system: false }).maxFps).toBe(15);
    expect(resolvePerformance({ general: { maxFps: 7 }, system: false }).maxFps).toBe(60);
  });
});

describe("profile performance", () => {
  it("keeps valid keys only", () => {
    expect(normalizePerformance({ maxFps: 30, motion: "reduce", extra: 1 })).toEqual({ maxFps: 30, motion: "reduce" });
    expect(normalizePerformance({ maxFps: 24, motion: "lots" })).toBeUndefined();
    expect(normalizePerformance(undefined)).toBeUndefined();
    for (const fps of [5, 15, 30, 60, 0]) expect(normalizePerformance({ maxFps: fps })).toEqual({ maxFps: fps });
    for (const bad of [24, -1, "30", null, 1000]) expect(normalizePerformance({ maxFps: bad })).toBeUndefined();
  });

  it("keeps the rendering switches as booleans only (each screen's since config v16)", () => {
    for (const key of ["ringGlide", "blurLimit", "innerBlur", "liveGlow"] as const) {
      expect(normalizePerformance({ [key]: true })).toEqual({ [key]: true });
      expect(normalizePerformance({ [key]: false })).toEqual({ [key]: false });
      for (const bad of ["yes", 1, null]) expect(normalizePerformance({ [key]: bad })).toBeUndefined();
    }
  });

  it("survives loading a config", () => {
    const cfg = mergeConfig({
      profiles: [{ id: "p", name: "P", width: 800, height: 480, cols: 4, rows: 2, fit: "fill", pages: [], performance: { maxFps: 15, motion: "full" } }],
    });
    expect(cfg.profiles[0].performance).toEqual({ maxFps: 15, motion: "full" });
  });
});
