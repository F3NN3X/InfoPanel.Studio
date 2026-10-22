import { describe, expect, it } from "vitest";
import { fxPlan, MAX_STEP, poolSize, REF_AREA, stepScale, windValue, type FxPlan } from "@/widgets/weather-fx/config";

describe("fxPlan", () => {
  it.each<[Parameters<typeof fxPlan>[0], (p: FxPlan) => boolean]>([
    ["rain", (p) => p.rain > 0 && p.snow === 0 && !p.lightning],
    ["snow", (p) => p.snow > 0 && p.rain === 0],
    ["sleet", (p) => p.snow > 0 && p.rain > 0],
    ["hail", (p) => p.hail > 0],
    ["thunder", (p) => p.rain > 0 && p.lightning],
    ["fog", (p) => p.fog > 0],
    ["wind", (p) => p.streaks > 0],
  ])("%s runs its own effects", (kind, ok) => {
    expect(ok(fxPlan(kind, false))).toBe(true);
  });

  it("swaps the sun for a moon and stars at night", () => {
    const day = fxPlan("clear", false);
    const night = fxPlan("clear", true);
    expect([day.sun > 0, day.moon, day.stars]).toEqual([true, false, 0]);
    expect([night.sun, night.moon, night.stars > 0]).toEqual([0, true, true]);
  });
});

describe("poolSize", () => {
  it("scales with the area and caps", () => {
    expect(poolSize(300, REF_AREA)).toBe(300);
    expect(poolSize(300, 200 * 120)).toBeLessThan(20);
    expect(poolSize(300, REF_AREA * 4, 600)).toBe(600);
  });
  it("is empty when off or unmeasured", () => {
    expect(poolSize(0, REF_AREA)).toBe(0);
    expect(poolSize(300, 0)).toBe(0);
  });
});

describe("stepScale", () => {
  it("is one frame at 60 fps and capped after a stall", () => {
    expect(stepScale(1000 / 60)).toBeCloseTo(1);
    expect(stepScale(60_000)).toBe(MAX_STEP);
  });
  it("ignores a negative or bad delta", () => {
    expect(stepScale(-5)).toBe(0);
    expect(stepScale(Number.NaN)).toBe(0);
  });
});

describe("windValue", () => {
  it("blows right for a westerly and left for an easterly", () => {
    expect(windValue("auto", 10, 270)).toBeGreaterThan(0);
    expect(windValue("auto", 10, 90)).toBeLessThan(0);
    expect(windValue("none", 10, 270)).toBe(0);
  });
});
