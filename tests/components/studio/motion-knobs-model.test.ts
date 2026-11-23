// The Theme view's Motion group (L117, motion-knobs-model.ts): what each knob shows and writes, and that a level with no motion keys,
// an old config's included, shows and draws the pack's own motion.
import { describe, expect, it } from "vitest";
import { choiceOf, effectsOn, effectsPatch, INTENSITIES, levelOf, motionCustom, SPEEDS } from "@/components/studio/motion-knobs-model";
import { motionKnobsOf, type PackMotion } from "@/looks/motion";
import { normalizeWidgetTheme, THEMED_KEYS } from "@/lib/theme-model";

const MOTION: PackMotion = { glitch: {}, decode: {}, sweep: { on: false } };

describe("the Motion knobs", () => {
  it("an old level (no motion keys) shows the pack's own and reads as no knobs", () => {
    const old = normalizeWidgetTheme({ values: { lookId: "cyberspec", accent: "#ff0000", smoothing: "stepped" } });
    expect(old?.values).toEqual({ lookId: "cyberspec", accent: "#ff0000", smoothing: "stepped" });
    const values = { own: old?.values };
    expect(choiceOf(values, "motionIntensity", INTENSITIES)).toBe("auto");
    expect(choiceOf(values, "motionSpeed", SPEEDS)).toBe("auto");
    expect(effectsOn(values, MOTION)).toEqual(["glitch", "decode"]);
    expect(motionCustom(values)).toBe(false);
    expect(motionKnobsOf(old?.values)).toEqual({});
  });

  it("the keys are themed, so a level keeps them through a save", () => {
    for (const key of ["motionIntensity", "motionSpeed", "motionEffects"]) expect(THEMED_KEYS.has(key)).toBe(true);
    expect(normalizeWidgetTheme({ values: { motionIntensity: "high", motionEffects: "decode" } })?.values).toEqual({ motionIntensity: "high", motionEffects: "decode" });
  });

  it("shows a stored choice, and an unknown one as the pack's own", () => {
    expect(choiceOf({ own: { motionSpeed: "fast" } }, "motionSpeed", SPEEDS)).toBe("fast");
    expect(choiceOf({ inherited: { motionIntensity: "low" } }, "motionIntensity", INTENSITIES)).toBe("low");
    expect(choiceOf({ own: { motionSpeed: "warp" } }, "motionSpeed", SPEEDS)).toBe("auto");
  });

  it("a switch writes the effects list, nothing for the pack's own, and none as its own word", () => {
    expect(effectsPatch({}, MOTION, "sweep", true)).toEqual({ motionEffects: "glitch,decode,sweep" });
    expect(effectsPatch({}, MOTION, "glitch", false)).toEqual({ motionEffects: "decode" });
    expect(effectsPatch({ own: { motionEffects: "decode" } }, MOTION, "glitch", true)).toBeUndefined();
    expect(effectsPatch({ own: { motionEffects: "decode" } }, MOTION, "decode", false)).toEqual({ motionEffects: "none" });
    expect(effectsOn({ own: { motionEffects: "none" } }, MOTION)).toEqual([]);
  });

  it("Custom only for an own value that differs from what the level inherits", () => {
    expect(motionCustom({ own: { motionSpeed: "fast" }, inherited: { motionSpeed: "fast" } })).toBe(false);
    expect(motionCustom({ own: { motionSpeed: "fast" } })).toBe(true);
    expect(motionCustom({ own: { motionSpeed: "fast" }, applies: () => false })).toBe(false);
  });

  it("Level is the screen's own, else Off under reduced motion and Full otherwise", () => {
    expect(levelOf(undefined, false)).toBe("full");
    expect(levelOf(undefined, true)).toBe("off");
    expect(levelOf("calm", true)).toBe("calm");
  });
});
