// A pack's motion block (L117, src/looks/motion.ts): the validator refuses an unknown effect or key (schema) and a value out of its
// range (motion), the loader refuses the same, and the plan draws nothing at Off, under reduced motion or in lite mode, the one-shots at Calm.
import { describe, expect, it } from "vitest";
import { MOTION_EFFECTS, MOTION_RULES, motionIssues, motionKnobsOf, ONE_SHOT_MAX_MS, planMotion, type MotionEnv, type PackMotion } from "@/looks/motion";
import { packIssues } from "@/looks/pack-load";
import { type PackSource, validatePack } from "@/looks/pack-validate";
import { userPackOf } from "@/looks/user-packs";
import { THEME_DEFAULTS } from "@/lib/theme-model";
import fixture from "../fixtures/packs/motion/motion.json";
import { readPackDir } from "../../tools/validate-pack.mjs";
import { TEST_PACK } from "./__fixtures__/test-pack";

const BASE = readPackDir("src/looks/packs/field-kit", /\.tsx?$/) as PackSource;
const withMotion = (motion: unknown): PackSource => ({ ...BASE, pack: { ...(BASE.pack as object), motion } });
const errors = (src: PackSource, source: "builtin" | "user" = "builtin") => validatePack(src, { source }).filter((i) => i.severity === "error");
const rules = (motion: unknown) => errors(withMotion(motion)).map((i) => i.rule);

const FULL: MotionEnv = { level: "full", lite: false, reduceMotion: false };
const ALL = fixture as PackMotion;

describe("the motion block in a pack", () => {
  it("the fixture with every effect passes, as a built-in and as a user pack", () => {
    expect(Object.keys(ALL).sort()).toEqual([...MOTION_EFFECTS].sort());
    expect(errors(withMotion(ALL))).toEqual([]);
    expect(errors(withMotion(ALL), "user").filter((i) => i.rule === "motion" || i.rule === "schema")).toEqual([]);
  });

  it("a pack without one is unchanged: no issue, and nothing planned", () => {
    expect(motionIssues(undefined)).toEqual([]);
    expect(planMotion(undefined, {}, FULL)).toBeUndefined();
  });

  it("an unknown effect or key, or a wrong type, is the schema's", () => {
    expect(rules({ shake: { ms: 100 } })).toContain("schema");
    expect(rules({ glitch: { ms: 100, script: "x" } })).toContain("schema");
    expect(rules({ arrival: { style: "spin" } })).toContain("schema");
    expect(rules({ flicker: { target: "page" } })).toContain("schema");
    expect(rules({ decode: { every: 4 } })).toContain("schema");
    expect(rules({ glitch: { on: "yes" } })).toContain("schema");
    expect(rules([])).toContain("schema");
  });

  it("a value out of its range is refused by rule motion, at both ends", () => {
    for (const [effect, rule] of Object.entries(MOTION_RULES)) {
      if (rule.ms) {
        expect(rules({ [effect]: { ms: rule.ms[0] } }), `${effect} ms low`).toEqual([]);
        expect(rules({ [effect]: { ms: rule.ms[1] } }), `${effect} ms high`).toEqual([]);
        expect(rules({ [effect]: { ms: rule.ms[0] - 1 } }), effect).toContain("motion");
        expect(rules({ [effect]: { ms: rule.ms[1] + 1 } }), effect).toContain("motion");
      }
      if (rule.every) {
        expect(rules({ [effect]: { every: rule.every[1] + 1 } }), effect).toContain("motion");
        expect(rules({ [effect]: { every: rule.every[0] - 0.5 } }), effect).toContain("motion");
      }
      expect(rules({ [effect]: { intensity: 0 } }), effect).toContain("motion");
      expect(rules({ [effect]: { intensity: 1.01 } }), effect).toContain("motion");
    }
  });

  it("keeps the kit's limits: one-shots at most 300 ms, repeats at least 2 s apart, a glitch on arrival only at every 0", () => {
    for (const name of ["glitch", "scramble", "arrival"] as const) expect(MOTION_RULES[name].ms![1]).toBeLessThanOrEqual(ONE_SHOT_MAX_MS);
    for (const name of ["flicker", "sweep", "glitch"] as const) expect(MOTION_RULES[name].every![0]).toBeGreaterThanOrEqual(2);
    expect(rules({ glitch: { every: 0 } })).toEqual([]);
    expect(rules({ glitch: { every: 2 } })).toContain("motion");
    expect(rules({ sweep: { every: 0 } })).toContain("motion");
  });

  it("the loader refuses a pack whose motion is out of range, and keeps one that is in it", () => {
    expect(packIssues({ ...TEST_PACK, motion: ALL })).toEqual([]);
    expect(packIssues({ ...TEST_PACK, motion: { scramble: { ms: 900 } } }).join()).toMatch(/motion scramble ms/);
    expect(motionIssues({ shake: {} })).toHaveLength(1);
  });

  it("a stored user pack carries it; the render check's candidate does not (it measures the pack's paint at rest)", () => {
    expect(userPackOf(withMotion(ALL)).motion).toEqual(ALL);
    expect(userPackOf(withMotion(ALL), true).motion).toBeUndefined();
  });
});

describe("what a card draws on this screen", () => {
  it("nothing at Off, under reduced motion or in lite mode", () => {
    expect(planMotion(ALL, {}, { ...FULL, level: "off" })).toBeUndefined();
    expect(planMotion(ALL, {}, { ...FULL, reduceMotion: true })).toBeUndefined();
    expect(planMotion(ALL, {}, { ...FULL, lite: true })).toBeUndefined();
  });

  it("everything at Full, inside each range", () => {
    const plan = planMotion(ALL, {}, FULL)!;
    expect(Object.keys(plan).filter((k) => k !== "key").sort()).toEqual([...MOTION_EFFECTS].sort());
    expect(plan.glitch).toMatchObject({ ms: 240, every: 4, intensity: 0.8 });
    expect(plan.arrival).toMatchObject({ style: "line", ms: 240 });
    expect(plan.flicker).toMatchObject({ target: "card", every: 2 });
  });

  it("the one-shots at Calm: no flicker or sweep, a glitch on arrival only", () => {
    const plan = planMotion(ALL, {}, { ...FULL, level: "calm" })!;
    expect(plan.flicker).toBeUndefined();
    expect(plan.sweep).toBeUndefined();
    expect(plan.glitch?.every).toBe(0);
    expect(plan.decode && plan.scramble && plan.arrival).toBeTruthy();
  });

  it("an effect declared off waits for the knob; the knob's list wins over the pack's", () => {
    const motion: PackMotion = { decode: {}, sweep: { on: false } };
    expect(planMotion(motion, {}, FULL)?.sweep).toBeUndefined();
    expect(planMotion(motion, { effects: ["sweep"] }, FULL)).toMatchObject({ sweep: { every: 12 } });
    expect(planMotion(motion, { effects: ["sweep"] }, FULL)?.decode).toBeUndefined();
    expect(planMotion(motion, { effects: [] }, FULL)).toBeUndefined();
  });

  it("Intensity and Speed scale the pack's values and stay in range", () => {
    const fast = planMotion(ALL, { speed: "fast", intensity: "high" }, FULL)!;
    expect(fast.glitch!.intensity).toBe(1);
    expect(fast.flicker!.every).toBe(2);
    expect(fast.sweep!.ms).toBeCloseTo(536);
    const slow = planMotion(ALL, { speed: "slow", intensity: "low" }, FULL)!;
    expect(slow.scramble!.ms).toBe(300);
    expect(slow.glitch!.intensity).toBeCloseTo(0.4);
  });

  it("equal plans have the same key", () => {
    expect(planMotion(ALL, {}, FULL)!.key).toBe(planMotion(structuredClone(ALL), {}, FULL)!.key);
  });
});

describe("the knobs a level stores", () => {
  it("an old config, and the theme defaults, read as the pack's own", () => {
    expect(motionKnobsOf(undefined)).toEqual({});
    expect(motionKnobsOf({ smoothing: "stepped" })).toEqual({});
    expect(motionKnobsOf(THEME_DEFAULTS)).toEqual({});
  });

  it("reads known values and drops the rest", () => {
    expect(motionKnobsOf({ motionIntensity: "high", motionSpeed: "slow", motionEffects: "decode,shake,sweep" })).toEqual({ intensity: "high", speed: "slow", effects: ["decode", "sweep"] });
    expect(motionKnobsOf({ motionIntensity: "max", motionSpeed: 3 })).toEqual({});
    expect(motionKnobsOf({ motionEffects: "none" })).toEqual({ effects: [] });
  });
});
