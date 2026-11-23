// A pack's `motion` block (L117): text and card effects a pack declares as numbers and the app draws with its own code
// (motion-render.tsx, motion-runtime.ts, the `app-mo-*` keyframes in index.css). The pack names an effect, its strength and
// its timing inside the ranges below; nothing it gives runs. One-shots stay under 300 ms (a decode, which settles text rather
// than flashing it, up to 900), the effects that repeat wait at least 2 s, and the page never shows two repeats closer than a
// second, so nothing flashes more than three times a second (WCAG 2.3.1). Types, ranges, the checker and the plan; no DOM.
import type { FxLevel } from "./pack-json";

export const MOTION_EFFECTS = ["glitch", "decode", "scramble", "arrival", "flicker", "sweep"] as const;
export type MotionEffect = (typeof MOTION_EFFECTS)[number];
export const ARRIVAL_STYLES = ["fade", "clip", "line"] as const;
export type ArrivalStyle = (typeof ARRIVAL_STYLES)[number];
export const FLICKER_TARGETS = ["card", "label"] as const;
export type FlickerTarget = (typeof FLICKER_TARGETS)[number];

/** One effect as pack.json gives it. `every` is seconds, `ms` milliseconds, `intensity` 0.1 to 1. */
export interface MotionEffectSpec {
  /** Unset = on; off declares it for the user to switch on (the Theme view's Motion group). */
  on?: boolean;
  intensity?: number;
  /** Seconds between two runs on the page; a glitch's 0 runs it on arrival only. */
  every?: number;
  /** How long one run lasts. */
  ms?: number;
  /** `arrival` only. */
  style?: ArrivalStyle;
  /** `flicker` only. */
  target?: FlickerTarget;
}

/** pack.json `motion`: any of the six effects. */
export type PackMotion = Partial<Record<MotionEffect, MotionEffectSpec>>;

type Range = readonly [number, number];
interface EffectRule {
  ms?: Range;
  every?: Range;
  /** `every: 0` is allowed (arrival only). */
  once?: boolean;
  /** What an unset value is. */
  def: Required<Pick<MotionEffectSpec, "intensity">> & Pick<MotionEffectSpec, "ms" | "every" | "style" | "target">;
}

/** The longest a one-shot runs, ms (the kit's glitch rule). */
export const ONE_SHOT_MAX_MS = 300;
/** The least time between two repeating effects anywhere on the page, ms: with at most three dips in one run, never over three flashes a second. */
export const MOTION_GAP_MS = 1000;
export const INTENSITY_RANGE: Range = [0.1, 1];

/** Each effect's ranges and defaults; a key an effect has no range for is refused (the schema already refuses unknown keys). */
export const MOTION_RULES: Readonly<Record<MotionEffect, EffectRule>> = {
  glitch: { ms: [80, ONE_SHOT_MAX_MS], every: [4, 120], once: true, def: { intensity: 0.6, ms: 240, every: 0 } },
  decode: { ms: [150, 900], def: { intensity: 1, ms: 480 } },
  scramble: { ms: [60, ONE_SHOT_MAX_MS], every: [1, 60], def: { intensity: 1, ms: 240, every: 4 } },
  arrival: { ms: [120, ONE_SHOT_MAX_MS], def: { intensity: 1, ms: 240, style: "fade" } },
  flicker: { every: [2, 120], def: { intensity: 0.5, every: 8, target: "card" } },
  sweep: { ms: [400, 3000], every: [4, 120], def: { intensity: 0.5, ms: 1200, every: 12 } },
};

const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const within = (v: number, [lo, hi]: Range) => v >= lo && v <= hi;

/** The problems with a motion block, one line each (empty: it may be drawn). Unknown effects and keys are the schema's. */
export function motionIssues(motion: unknown): string[] {
  if (motion === undefined) return [];
  if (!motion || typeof motion !== "object" || Array.isArray(motion)) return ["motion is not an object"];
  const issues: string[] = [];
  for (const [name, spec] of Object.entries(motion as Record<string, unknown>)) {
    const rule = MOTION_RULES[name as MotionEffect];
    if (!rule || !Object.hasOwn(MOTION_RULES, name)) {
      issues.push(`motion ${name.slice(0, 20)}: not an effect (${MOTION_EFFECTS.join(", ")})`);
      continue;
    }
    if (!spec || typeof spec !== "object" || Array.isArray(spec)) {
      issues.push(`motion ${name} is not an object`);
      continue;
    }
    const s = spec as Record<string, unknown>;
    const at = `motion ${name}`;
    if (s.on !== undefined && typeof s.on !== "boolean") issues.push(`${at} on: true or false`);
    if (s.intensity !== undefined && !(isNum(s.intensity) && within(s.intensity, INTENSITY_RANGE))) issues.push(`${at} intensity: ${INTENSITY_RANGE[0]} to ${INTENSITY_RANGE[1]}`);
    if (s.ms !== undefined && !(rule.ms && isNum(s.ms) && within(s.ms, rule.ms))) issues.push(rule.ms ? `${at} ms: ${rule.ms[0]} to ${rule.ms[1]}` : `${at} takes no ms`);
    if (s.every !== undefined && !(rule.every && isNum(s.every) && (within(s.every, rule.every) || (rule.once && s.every === 0)))) issues.push(rule.every ? `${at} every: ${rule.once ? "0 (arrival only) or " : ""}${rule.every[0]} to ${rule.every[1]} seconds` : `${at} takes no every`);
    if (s.style !== undefined && !(name === "arrival" && (ARRIVAL_STYLES as readonly unknown[]).includes(s.style))) issues.push(name === "arrival" ? `${at} style: ${ARRIVAL_STYLES.join(", ")}` : `${at} takes no style`);
    if (s.target !== undefined && !(name === "flicker" && (FLICKER_TARGETS as readonly unknown[]).includes(s.target))) issues.push(name === "flicker" ? `${at} target: ${FLICKER_TARGETS.join(", ")}` : `${at} takes no target`);
  }
  return issues;
}

/** What the Theme view's Motion group stores at a level (the cascade's `motionIntensity`, `motionSpeed`, `motionEffects`). Unset: the pack's own. */
export interface MotionKnobs {
  intensity?: "low" | "high";
  speed?: "slow" | "fast";
  /** The effects switched on, of those the pack declares; unset: the pack's own `on`. */
  effects?: readonly MotionEffect[];
}

/** The cascade keys the Motion group writes; "auto" (the theme default) is the pack's own. */
export const MOTION_KNOB_KEYS = ["motionIntensity", "motionSpeed", "motionEffects"] as const;
/** `motionEffects` with every effect switched off (an empty list is not a value the cascade keeps apart from unset). */
export const NO_EFFECTS = "none";

/** The knobs a zone's resolved settings hold; values it does not know are the pack's own. */
export function motionKnobsOf(settings: Readonly<Record<string, unknown>> | undefined): MotionKnobs {
  const i = settings?.motionIntensity;
  const s = settings?.motionSpeed;
  const e = settings?.motionEffects;
  const effects = typeof e === "string" && e !== "auto" && e !== "" ? (e === NO_EFFECTS ? [] : MOTION_EFFECTS.filter((x) => e.split(",").includes(x))) : undefined;
  return { ...(i === "low" || i === "high" ? { intensity: i } : null), ...(s === "slow" || s === "fast" ? { speed: s } : null), ...(effects ? { effects } : null) };
}

/** What the screen allows: its FX level, lite mode (reduced motion or a frame cap under 60), reduced motion. */
export interface MotionEnv {
  level: FxLevel;
  lite: boolean;
  reduceMotion: boolean;
}

/** One effect as this screen draws it: every value inside its range. */
export interface PlannedMotion {
  intensity: number;
  ms: number;
  /** Seconds; 0 for a glitch that runs on arrival only (and every glitch at Calm). */
  every: number;
  style?: ArrivalStyle;
  target?: FlickerTarget;
}

/** The effects a card draws, by name; unset ones are off. `key` names the plan, so equal plans compare equal. */
export type MotionPlan = Partial<Record<MotionEffect, PlannedMotion>> & { key: string };

const INTENSITY_SCALE = { low: 0.5, high: 1.5 } as const;
/** Fast runs and repeats sooner; slow later. */
const TIME_SCALE = { slow: 1.5, fast: 0.67 } as const;
/** The effects that repeat: Calm draws none of them (a glitch keeps its arrival run). */
const REPEATS: readonly MotionEffect[] = ["flicker", "sweep"];

const clamp = (v: number, [lo, hi]: Range) => Math.min(hi, Math.max(lo, v));

/**
 * What a card draws of a pack's motion on this screen: nothing at Off, under reduced motion or in lite mode (CSS animations
 * run past the frame cap, and lite mode already stops every widget animation, index.css); at Calm the one-shots only (arrival,
 * decode, scramble and a glitch's arrival run). Knobs scale strength and timing, clamped to each effect's range. Pure.
 */
export function planMotion(motion: PackMotion | undefined, knobs: MotionKnobs, env: MotionEnv): MotionPlan | undefined {
  if (!motion || env.level === "off" || env.reduceMotion || env.lite) return undefined;
  const calm = env.level === "calm";
  const scale = knobs.intensity ? INTENSITY_SCALE[knobs.intensity] : 1;
  const time = knobs.speed ? TIME_SCALE[knobs.speed] : 1;
  const plan: Partial<Record<MotionEffect, PlannedMotion>> = {};
  for (const name of MOTION_EFFECTS) {
    const spec = motion[name];
    if (!spec || !(knobs.effects ? knobs.effects.includes(name) : spec.on !== false)) continue;
    if (calm && REPEATS.includes(name)) continue;
    const rule = MOTION_RULES[name];
    const every = spec.every ?? rule.def.every ?? 0;
    plan[name] = {
      intensity: clamp((spec.intensity ?? rule.def.intensity) * scale, INTENSITY_RANGE),
      ms: rule.ms ? clamp((spec.ms ?? rule.def.ms ?? rule.ms[0]) * time, rule.ms) : 0,
      every: rule.every && every > 0 && !(calm && name === "glitch") ? clamp(every * time, rule.every) : 0,
      ...(name === "arrival" ? { style: spec.style ?? rule.def.style } : null),
      ...(name === "flicker" ? { target: spec.target ?? rule.def.target } : null),
    };
  }
  const names = Object.keys(plan);
  if (!names.length) return undefined;
  return { ...plan, key: JSON.stringify(plan) };
}
