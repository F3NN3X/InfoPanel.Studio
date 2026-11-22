/**
 * Performance settings: each screen's own (`MonitorProfile.performance`, since config v16), Max FPS and reduced
 * motion also from the URL (kiosk pages only), then the default; reduced motion also follows the OS when the choice
 * is "system".
 */

import { FPS_CHOICES, type MaxFps } from "@/lib/ticker";
import type { MotionChoice } from "@/lib/general";
import { FX_LEVELS, type FxLevel } from "@/looks/pack-json";

/** The URL's layer: Max FPS and motion. */
export interface PerformanceOverride {
  maxFps?: number;
  motion?: MotionChoice;
}

/** A screen's performance: Max FPS, motion and the rendering switches (only the keys it changed). */
export interface ScreenPerformance extends PerformanceOverride {
  /** Rings ease to each new reading (default off: they step). */
  ringGlide?: boolean;
  /** Cap a widget's blur at 12 px (default on). */
  blurLimit?: boolean;
  /** Badges and cards inside a widget blur what is behind them (default off). */
  innerBlur?: boolean;
  /** A graph's glow is a filter redrawn with the line (default off: a static glow under it). */
  liveGlow?: boolean;
  /** A pack's page art drifts 1 to 2 px, slowly, on a pack that needs it (burn-in; default off). */
  pixelShift?: boolean;
  /** Minutes without input before a pack's page art dims (one of `IDLE_DIM_MINUTES`; default off). */
  idleDim?: number;
  /** How much of a pack's effects it draws: full, the calm variants or none. Unset: off under reduced motion, else full; lite mode still caps it at calm. */
  fx?: FxLevel;
}

export interface ResolvedPerformance {
  maxFps: MaxFps;
  reduceMotion: boolean;
  /** The FX level: the screen's own, else off under reduced motion and full otherwise. Not yet capped by lite mode (`planEffects` does). */
  fx: FxLevel;
}

export const DEFAULT_MAX_FPS: MaxFps = 60;

const MOTIONS: readonly MotionChoice[] = ["system", "reduce", "full"];

/** A screen's rendering switches. */
export const RENDERING_KEYS = ["ringGlide", "blurLimit", "innerBlur", "liveGlow", "pixelShift"] as const;

/** The idle times the Idle dim setting offers, in minutes. */
export const IDLE_DIM_MINUTES: readonly number[] = [5, 15, 30, 60];

/** Lite mode: reduced motion, or a frame-rate cap under 60 (the widgets drop their transitions, a pack its motion and blur). */
export const liteOf = ({ maxFps, reduceMotion }: { maxFps: number; reduceMotion: boolean }): boolean => reduceMotion || (maxFps > 0 && maxFps < 60);

export const isMaxFps = (v: unknown): v is MaxFps => FPS_CHOICES.includes(v as MaxFps);
export const isFxLevel = (v: unknown): v is FxLevel => FX_LEVELS.includes(v as FxLevel);
export const isMotionChoice = (v: unknown): v is MotionChoice => MOTIONS.includes(v as MotionChoice);

/** A stored screen performance, keeping only valid keys; undefined when nothing is left. */
export function normalizePerformance(input: unknown): ScreenPerformance | undefined {
  if (typeof input !== "object" || input === null || Array.isArray(input)) return undefined;
  const v = input as Record<string, unknown>;
  const out: ScreenPerformance = {};
  if (isMaxFps(v.maxFps)) out.maxFps = v.maxFps;
  if (isMotionChoice(v.motion)) out.motion = v.motion;
  for (const key of RENDERING_KEYS) if (typeof v[key] === "boolean") out[key] = v[key];
  if (IDLE_DIM_MINUTES.includes(v.idleDim as number)) out.idleDim = v.idleDim as number;
  if (isFxLevel(v.fx)) out.fx = v.fx;
  return Object.keys(out).length > 0 ? out : undefined;
}

/**
 * The URL's overrides: `fps` (5, 15, 30, 60, 0 = unlimited), `animations=0`
 * (reduce) and `motion=reduce|full|system`. `motion` wins over `animations`;
 * a bad value is ignored.
 */
export function performanceFromSearch(search: string): PerformanceOverride {
  const q = new URLSearchParams(search);
  const out: PerformanceOverride = {};
  const fps = q.get("fps");
  if (fps !== null && /^\d+$/.test(fps) && isMaxFps(Number(fps))) out.maxFps = Number(fps);
  if (q.get("animations") === "0") out.motion = "reduce";
  const motion = q.get("motion");
  if (isMotionChoice(motion)) out.motion = motion;
  return out;
}

/** URL > the screen's (`general`: `resolveGeneral` for the screen) > default. */
export function resolvePerformance(layers: {
  url?: PerformanceOverride;
  profile?: PerformanceOverride;
  general: { maxFps?: number; motion?: MotionChoice; fx?: FxLevel };
  /** The OS's prefers-reduced-motion. */
  system: boolean;
}): ResolvedPerformance {
  const { url, profile, general, system } = layers;
  const maxFps = [url?.maxFps, profile?.maxFps, general.maxFps].find(isMaxFps) ?? DEFAULT_MAX_FPS;
  const motion = [url?.motion, profile?.motion, general.motion].find(isMotionChoice) ?? "system";
  const reduceMotion = motion === "system" ? system : motion === "reduce";
  return { maxFps, reduceMotion, fx: isFxLevel(general.fx) ? general.fx : reduceMotion ? "off" : "full" };
}
