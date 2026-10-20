/**
 * Performance settings: Max FPS and reduced motion. Each comes from the URL
 * (kiosk pages only), the profile, the general settings or the default, in
 * that order; reduced motion also follows the OS when the choice is "system".
 */

import { FPS_CHOICES, type MaxFps } from "@/lib/ticker";
import type { MotionChoice } from "@/lib/general";

export interface PerformanceOverride {
  maxFps?: number;
  motion?: MotionChoice;
}

export interface ResolvedPerformance {
  maxFps: MaxFps;
  reduceMotion: boolean;
}

export const DEFAULT_MAX_FPS: MaxFps = 60;

const MOTIONS: readonly MotionChoice[] = ["system", "reduce", "full"];

export const isMaxFps = (v: unknown): v is MaxFps => FPS_CHOICES.includes(v as MaxFps);
export const isMotionChoice = (v: unknown): v is MotionChoice => MOTIONS.includes(v as MotionChoice);

/** A stored per-profile override, keeping only valid keys; undefined when nothing is left. */
export function normalizePerformance(input: unknown): PerformanceOverride | undefined {
  if (typeof input !== "object" || input === null || Array.isArray(input)) return undefined;
  const v = input as Record<string, unknown>;
  const out: PerformanceOverride = {};
  if (isMaxFps(v.maxFps)) out.maxFps = v.maxFps;
  if (isMotionChoice(v.motion)) out.motion = v.motion;
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

/** URL > profile > general > default. */
export function resolvePerformance(layers: {
  url?: PerformanceOverride;
  profile?: PerformanceOverride;
  general: { maxFps?: number; motion?: MotionChoice };
  /** The OS's prefers-reduced-motion. */
  system: boolean;
}): ResolvedPerformance {
  const { url, profile, general, system } = layers;
  const maxFps = [url?.maxFps, profile?.maxFps, general.maxFps].find(isMaxFps) ?? DEFAULT_MAX_FPS;
  const motion = [url?.motion, profile?.motion, general.motion].find(isMotionChoice) ?? "system";
  return { maxFps, reduceMotion: motion === "system" ? system : motion === "reduce" };
}
