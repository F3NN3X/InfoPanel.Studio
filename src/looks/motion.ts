// A pack's `motion` block (L117): text and card effects a pack declares as numbers and the app draws with its own code
// (motion-render.tsx, motion-runtime.ts, motion-list.ts, the `app-mo-*` keyframes in index.css). The pack names an effect, its
// strength and its timing inside the ranges below; nothing it gives runs. One-shots stay under 300 ms (a decode or a value's
// count-up, which settle text rather than flashing it, up to 900), the effects that repeat wait at least 2 s, and the page never
// shows two repeats closer than a second nor more than two change marks in a second, so nothing flashes more than three times a
// second (WCAG 2.3.1). Types, ranges, the checker and the plan; no DOM.
import type { FxLevel } from "./pack-json";

export const MOTION_EFFECTS = ["glitch", "decode", "scramble", "arrival", "flicker", "sweep", "value", "list", "boot"] as const;
export type MotionEffect = (typeof MOTION_EFFECTS)[number];
export const ARRIVAL_STYLES = ["fade", "clip", "line"] as const;
export type ArrivalStyle = (typeof ARRIVAL_STYLES)[number];
export const FLICKER_TARGETS = ["card", "label"] as const;
export type FlickerTarget = (typeof FLICKER_TARGETS)[number];
/** How a number reaches a new reading: counts to it, or rolls its changed digits (a text that is not one figure, a clock, always rolls). */
export const VALUE_STYLES = ["tween", "roll"] as const;
export type ValueStyle = (typeof VALUE_STYLES)[number];
/** What marks a number that changed, besides its run. */
export const VALUE_MARKS = ["none", "flash", "underline"] as const;
export type ValueMark = (typeof VALUE_MARKS)[number];
/** How a new row of a list comes in. */
export const LIST_ENTERS = ["slide", "fade", "none"] as const;
export type ListEnter = (typeof LIST_ENTERS)[number];
/** How a card arrives in a page's boot. */
export const BOOT_STYLES = ["fade", "clip", "glitch"] as const;
export type BootStyle = (typeof BOOT_STYLES)[number];
/** The `style` each effect that has one takes. */
const STYLES: Partial<Record<MotionEffect, readonly string[]>> = { arrival: ARRIVAL_STYLES, value: VALUE_STYLES, boot: BOOT_STYLES };
type Switch = "reorder" | "change" | "decode" | "line";
/** The switches (true or false) each effect that has them takes. */
const SWITCHES: Partial<Record<MotionEffect, readonly Switch[]>> = { list: ["reorder", "change", "decode"], boot: ["line", "decode"] };

/** One effect as pack.json gives it. `every` is seconds, `ms` milliseconds, `intensity` 0.1 to 1. */
export interface MotionEffectSpec {
  /** Unset = on; off declares it for the user to switch on (the Theme view's Motion group). */
  on?: boolean;
  intensity?: number;
  /** Seconds between two runs on the page; a glitch's 0 runs it on arrival only. */
  every?: number;
  /** How long one run lasts. */
  ms?: number;
  /** `arrival`, `value` and `boot`: each its own list (`ARRIVAL_STYLES`, `VALUE_STYLES`, `BOOT_STYLES`). */
  style?: ArrivalStyle | ValueStyle | BootStyle;
  /** `flicker` only. */
  target?: FlickerTarget;
  /** `value` only: the mark on a number that changed. */
  mark?: ValueMark;
  /** `list` only: how a new row comes in. */
  enter?: ListEnter;
  /** `list` only: rows that change places glide to them (FLIP). */
  reorder?: boolean;
  /** `list` only: a row whose text changed is lit once. */
  change?: boolean;
  /** `list`: a new row's text decodes; `boot`: each card's title decodes as it arrives. */
  decode?: boolean;
  /** `boot` only: a line draws across each card as it arrives. */
  line?: boolean;
  /** `boot` only: ms between two cards' arrivals. */
  stagger?: number;
}

/** pack.json `motion`: any of the nine effects. */
export type PackMotion = Partial<Record<MotionEffect, MotionEffectSpec>>;

type Range = readonly [number, number];
interface EffectRule {
  ms?: Range;
  every?: Range;
  stagger?: Range;
  /** `every: 0` is allowed (arrival only). */
  once?: boolean;
  /** What an unset value is. */
  def: Required<Pick<MotionEffectSpec, "intensity">> & Omit<MotionEffectSpec, "on" | "intensity">;
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
  // a value's `every` is the least seconds between two runs of one number, like a scramble's
  value: { ms: [150, 900], every: [1, 60], def: { intensity: 0.6, ms: 480, every: 1, style: "tween", mark: "none" } },
  list: { ms: [120, ONE_SHOT_MAX_MS], def: { intensity: 0.6, ms: 240, enter: "slide", reorder: true, change: true, decode: false } },
  boot: { ms: [120, ONE_SHOT_MAX_MS], stagger: [20, 120], def: { intensity: 1, ms: 240, stagger: 60, style: "clip", line: true, decode: true } },
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
    const styles = STYLES[name as MotionEffect];
    if (s.style !== undefined && !(styles && (styles as readonly unknown[]).includes(s.style))) issues.push(styles ? `${at} style: ${styles.join(", ")}` : `${at} takes no style`);
    if (s.target !== undefined && !(name === "flicker" && (FLICKER_TARGETS as readonly unknown[]).includes(s.target))) issues.push(name === "flicker" ? `${at} target: ${FLICKER_TARGETS.join(", ")}` : `${at} takes no target`);
    if (s.mark !== undefined && !(name === "value" && (VALUE_MARKS as readonly unknown[]).includes(s.mark))) issues.push(name === "value" ? `${at} mark: ${VALUE_MARKS.join(", ")}` : `${at} takes no mark`);
    if (s.enter !== undefined && !(name === "list" && (LIST_ENTERS as readonly unknown[]).includes(s.enter))) issues.push(name === "list" ? `${at} enter: ${LIST_ENTERS.join(", ")}` : `${at} takes no enter`);
    const switches = SWITCHES[name as MotionEffect] ?? [];
    for (const key of ["reorder", "change", "decode", "line"] as const) {
      if (s[key] !== undefined && !(switches.includes(key) && typeof s[key] === "boolean")) issues.push(switches.includes(key) ? `${at} ${key}: true or false` : `${at} takes no ${key}`);
    }
    if (s.stagger !== undefined && !(rule.stagger && isNum(s.stagger) && within(s.stagger, rule.stagger))) issues.push(rule.stagger ? `${at} stagger: ${rule.stagger[0]} to ${rule.stagger[1]} ms` : `${at} takes no stagger`);
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
  style?: ArrivalStyle | ValueStyle | BootStyle;
  target?: FlickerTarget;
  mark?: ValueMark;
  enter?: ListEnter;
  reorder?: boolean;
  change?: boolean;
  decode?: boolean;
  line?: boolean;
  /** ms, `boot` only. */
  stagger?: number;
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
 * decode, scramble, a glitch's arrival run, a value's count or roll, a list's rows coming in and moving, the boot), without the
 * marks that light a changed number or row. Knobs scale strength and timing, clamped to each effect's range. Pure.
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
      ...(STYLES[name] ? { style: spec.style ?? rule.def.style } : null),
      ...(name === "flicker" ? { target: spec.target ?? rule.def.target } : null),
      ...(name === "value" ? { mark: calm ? "none" : (spec.mark ?? rule.def.mark) } : null),
      ...(name === "list" ? { enter: spec.enter ?? rule.def.enter, reorder: spec.reorder ?? rule.def.reorder, change: !calm && (spec.change ?? rule.def.change), decode: spec.decode ?? rule.def.decode } : null),
      ...(name === "boot" ? { stagger: clamp((spec.stagger ?? rule.def.stagger ?? 0) * time, rule.stagger ?? [0, 0]), line: spec.line ?? rule.def.line, decode: spec.decode ?? rule.def.decode } : null),
    };
  }
  const names = Object.keys(plan);
  if (!names.length) return undefined;
  return { ...plan, key: JSON.stringify(plan) };
}
