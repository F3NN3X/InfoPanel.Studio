import { describe, expect, it } from "vitest";
import { FLASH_MAX, FX_KINDS } from "@/looks/pack-json";
import { effectIssues, planEffects, showsAt, sizeClassOf, type EffectEnv, type PackEffect } from "@/looks/effects";

const env = (patch: Partial<EffectEnv> = {}): EffectEnv => ({ level: "full", lite: false, reduceMotion: false, limitBlur: false, solidPage: false, ...patch });
const grain: PackEffect = { kind: "grain", cost: "animated", opacity: 0.9 };

describe("planEffects", () => {
  it("caps an overlay's strength so it cannot hide a widget", () => {
    expect(planEffects([grain], env())[0]).toMatchObject({ kind: "grain", opacity: 0.4, animate: true });
  });

  it.each([
    ["lite mode", { lite: true }],
    ["reduced motion", { reduceMotion: true }],
  ])("drops grain and scanlines in %s unless the pack keeps them still", (_, patch) => {
    const fx: PackEffect[] = [grain, { kind: "scanlines", cost: "static" }, { kind: "scanlines", cost: "animated", fallback: "static" }, { kind: "vignette", cost: "static" }];
    const plan = planEffects(fx, env(patch));
    expect(plan.map((e) => e.kind)).toEqual(["scanlines", "vignette"]);
    expect(plan.every((e) => !e.animate)).toBe(true);
  });

  it("halves glow in lite mode and caps it at 24 px", () => {
    expect(planEffects([{ kind: "glow", cost: "filter", px: 80 }], env())[0].px).toBe(24);
    expect(planEffects([{ kind: "glow", cost: "filter", px: 24 }], env({ lite: true }))[0].px).toBe(12);
  });

  it("caps blur at 12 px under Limit blur, and drops it in lite mode or over a solid page", () => {
    const blur: PackEffect = { kind: "blur", cost: "filter", px: 40 };
    expect(planEffects([blur], env({ limitBlur: true }))[0].px).toBe(12);
    expect(planEffects([blur], env())[0].px).toBe(24);
    expect(planEffects([blur], env({ lite: true }))).toEqual([]);
    expect(planEffects([blur], env({ solidPage: true }))).toEqual([]);
  });

  it("hides an effect under its size class", () => {
    const fx: PackEffect[] = [{ kind: "vignette", cost: "static", minSizeClass: "md" }];
    expect(planEffects(fx, env({ sizeClass: "sm" }))).toEqual([]);
    expect(planEffects(fx, env({ sizeClass: "md" }))).toHaveLength(1);
    expect(planEffects(fx, env())).toHaveLength(1);
  });
});

describe("planEffects: FX levels", () => {
  const scan: PackEffect = { kind: "scanlines", cost: "animated", calm: "static" };
  const glitch: PackEffect = { kind: "glitch", cost: "animated", rate: 2, calm: "off" };
  const vignette: PackEffect = { kind: "vignette", cost: "static" };

  it("full draws everything, the flashing kinds animated at their rate", () => {
    const plan = planEffects([scan, glitch, vignette], env());
    expect(plan.map((e) => [e.kind, e.animate])).toEqual([["scanlines", true], ["glitch", true], ["vignette", false]]);
    expect(plan[1].rate).toBe(2);
  });

  it("calm draws each entry at its calm variant, never animated", () => {
    const plan = planEffects([scan, glitch, vignette], env({ level: "calm" }));
    expect(plan.map((e) => e.kind)).toEqual(["scanlines", "vignette"]);
    expect(plan.every((e) => !e.animate)).toBe(true);
  });

  it("calm without a calm variant follows the entry's fallback, so an old pack behaves as it did", () => {
    const old: PackEffect[] = [grain, { kind: "scanlines", cost: "animated", fallback: "static" }, vignette];
    expect(planEffects(old, env({ level: "calm" })).map((e) => e.kind)).toEqual(["scanlines", "vignette"]);
    expect(planEffects(old, env({ level: "calm" }))).toEqual(planEffects(old, env({ lite: true })));
    expect(planEffects([{ kind: "flicker", cost: "animated" }], env({ level: "calm" }))).toEqual([]);
  });

  it("off draws no effects", () => {
    expect(planEffects([scan, glitch, vignette, { kind: "glow", cost: "filter" }], env({ level: "off" }))).toEqual([]);
  });

  it("lite mode and reduced motion cap full at calm, and leave off at off", () => {
    for (const patch of [{ lite: true }, { reduceMotion: true }]) {
      expect(planEffects([scan, glitch], env(patch)).map((e) => [e.kind, e.animate])).toEqual([["scanlines", false]]);
      expect(planEffects([scan], env({ ...patch, level: "off" }))).toEqual([]);
    }
  });

  it("clamps a flash rate to the cap and defaults it to one a second", () => {
    expect(planEffects([{ kind: "glitch", cost: "animated", rate: 9 }], env())[0].rate).toBe(FLASH_MAX);
    expect(planEffects([{ kind: "glitch", cost: "animated" }], env())[0].rate).toBe(1);
  });

  it("never exceeds the overlay strength cap", () => {
    expect(planEffects([{ kind: "flicker", cost: "animated", opacity: 1 }], env())[0].opacity).toBe(0.4);
  });
});

describe("effectIssues", () => {
  it("accepts honest effects", () => {
    expect(effectIssues([grain, { kind: "glow", cost: "filter" }, { kind: "vignette", cost: "mask" }])).toEqual([]);
  });

  it("accepts two animated effects, the flashing kinds at their cap, and a calm variant", () => {
    expect(effectIssues([{ kind: "scanlines", cost: "animated", calm: "static" }, { kind: "glitch", cost: "animated", rate: FLASH_MAX, calm: "off" }])).toEqual([]);
    for (const kind of FX_KINDS) expect(effectIssues([{ kind, cost: "animated" }])).toEqual([]);
  });

  it.each([
    ["a glow that claims to be static", [{ kind: "glow", cost: "static" }]],
    ["an animated glow", [{ kind: "glow", cost: "animated" }]],
    ["an unknown cost", [{ kind: "grain", cost: "free" }]],
    ["an unknown kind", [{ kind: "rain", cost: "static" }]],
    ["a negative radius", [{ kind: "glow", cost: "filter", px: -1 }]],
    ["a bad size class", [{ kind: "grain", cost: "static", minSizeClass: "huge" }]],
    ["three animated effects", [grain, { kind: "scanlines", cost: "animated" }, { kind: "glitch", cost: "animated" }]],
    ["a glitch that claims to be static", [{ kind: "glitch", cost: "static" }]],
    ["a flashing kind past the flash cap", [{ kind: "flicker", cost: "animated", rate: 3.5 }]],
    ["a flash rate of zero", [{ kind: "glitch", cost: "animated", rate: 0 }]],
    ["a flash rate on a kind that does not flash", [{ kind: "grain", cost: "animated", rate: 1 }]],
    ["a bad calm variant", [{ kind: "scanlines", cost: "static", calm: "loud" }]],
    ["three filter effects", [{ kind: "glow", cost: "filter" }, { kind: "blur", cost: "filter" }, { kind: "glow", cost: "filter" }]],
  ])("refuses %s", (_, fx) => {
    expect(effectIssues(fx as unknown as PackEffect[])).not.toEqual([]);
  });
});

describe("size classes", () => {
  it("come from the short side", () => {
    expect([sizeClassOf(1920, 340), sizeClassOf(800, 480), sizeClassOf(1024, 700), sizeClassOf(1920, 1080), sizeClassOf(300, 2000)]).toEqual(["xs", "sm", "md", "lg", "xs"]);
  });
  it("showsAt hides below the minimum only", () => {
    expect([showsAt("md", "sm"), showsAt("md", "md"), showsAt("md", "lg"), showsAt(undefined, "xs"), showsAt("lg", undefined)]).toEqual([false, true, true, true, true]);
  });
});
