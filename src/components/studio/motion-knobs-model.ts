import { MOTION_EFFECTS, MOTION_KNOB_KEYS, motionKnobsOf, NO_EFFECTS, type MotionEffect, type PackMotion } from "@/looks/motion";
import type { FxLevel } from "@/looks/pack-json";
import type { ModuleSettings, ModuleSettingValue } from "@/modules/types";
import type { LookValues } from "./inspector-model";

/**
 * The Motion group (L117): the knobs of a pack with a `motion` block, in the Theme view under Quick changes. Level is the
 * screen's FX level (`performance.fx`, the Effects setting of Screens); Intensity, Speed and the effects are Look values at
 * the level, like the other knobs (`motionIntensity`, `motionSpeed`, `motionEffects`), and "auto" or unset is the pack's own. Pure.
 */

export const LEVELS: readonly { id: FxLevel; label: string }[] = [
  { id: "full", label: "Full" },
  { id: "calm", label: "Calm" },
  { id: "off", label: "Off" },
];

/** Intensity and Speed: the pack's own in the middle (no value stored). */
export const INTENSITIES: readonly { id: string; label: string }[] = [
  { id: "low", label: "Low" },
  { id: "auto", label: "Theme's" },
  { id: "high", label: "High" },
];
export const SPEEDS: readonly { id: string; label: string }[] = [
  { id: "slow", label: "Slow" },
  { id: "auto", label: "Theme's" },
  { id: "fast", label: "Fast" },
];

export const EFFECT_LABELS: Readonly<Record<MotionEffect, string>> = { glitch: "Glitch", decode: "Decode labels", scramble: "Scramble numbers", arrival: "Arrival", flicker: "Flicker", sweep: "Sweep", value: "Count numbers", list: "List rows", boot: "Boot" };

/** The value a key shows at the level: its own where it applies, else what it inherits. */
const shown = (values: LookValues, key: string): ModuleSettingValue | undefined => (values.applies && !values.applies(key) ? undefined : values.own?.[key]) ?? values.inherited?.[key];

/** The chip a choice key shows: its value when it is one of `ids`, else the pack's own ("auto"). */
export function choiceOf(values: LookValues, key: "motionIntensity" | "motionSpeed", ids: readonly { id: string }[]): string {
  const v = shown(values, key);
  return typeof v === "string" && ids.some((o) => o.id === v) ? v : "auto";
}

/** Whether a key holds a value of the level's own that is not what it inherits (the dot is filled, Reset clears it). */
export function motionCustom(values: LookValues, keys: readonly string[] = MOTION_KNOB_KEYS): boolean {
  return keys.some((key) => {
    const own = values.applies && !values.applies(key) ? undefined : values.own?.[key];
    return own !== undefined && own !== values.inherited?.[key];
  });
}

/** The effects the pack declares, in the app's order. */
export const declared = (motion: PackMotion): MotionEffect[] => MOTION_EFFECTS.filter((e) => motion[e] !== undefined);

/** The effects switched on at the level: the knob's list, else the pack's own (`on` unset or true). */
export function effectsOn(values: LookValues, motion: PackMotion): MotionEffect[] {
  const listed = motionKnobsOf({ motionEffects: shown(values, "motionEffects") }).effects;
  return declared(motion).filter((e) => (listed ? listed.includes(e) : motion[e]?.on !== false));
}

/** What switching `effect` writes: the new list, or nothing (`undefined`: clear the key) when that is the pack's own. */
export function effectsPatch(values: LookValues, motion: PackMotion, effect: MotionEffect, on: boolean): ModuleSettings | undefined {
  const now = effectsOn(values, motion);
  const next = declared(motion).filter((e) => (e === effect ? on : now.includes(e)));
  const own = declared(motion).filter((e) => motion[e]?.on !== false);
  if (next.join() === own.join()) return undefined;
  return { motionEffects: next.length ? next.join(",") : NO_EFFECTS };
}

/** The level a screen shows: its own, else Off under reduced motion and Full otherwise (`resolvePerformance`). */
export const levelOf = (fx: FxLevel | undefined, reduceMotion: boolean): FxLevel => fx ?? (reduceMotion ? "off" : "full");
