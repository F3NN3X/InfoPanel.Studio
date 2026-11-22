// Pack effects (P9b): what a pack may draw over or under the page with code the app owns (grain, scanlines, vignette, glow,
// blur), each with a cost class, and what each becomes when the screen has to save work (lite mode, reduced motion, Limit blur,
// a solid page). Pack CSS never does this: it is paint only (pack-css.ts). Lazy: only the pack stage and the loader import it.

import { FX_KINDS, type FxKind } from "./pack-json";

export const EFFECT_COSTS = ["static", "composited", "filter", "mask", "animated"] as const;
export type EffectCost = (typeof EFFECT_COSTS)[number];
/** The kinds a pack may ask for; the `FX_KINDS` (glitch, flicker, rgb-split, interference) are animated overlays that flash (L108). */
export type EffectKind = "grain" | "scanlines" | "vignette" | "glow" | "blur" | FxKind;
export const SIZE_CLASSES = ["xs", "sm", "md", "lg"] as const;
export type SizeClass = (typeof SIZE_CLASSES)[number];

/** One effect a pack asks for. `cost` is what it says it costs; the loader refuses a cost under the kind's floor (`KIND_FLOOR`). */
export interface PackEffect {
  kind: EffectKind;
  cost: EffectCost;
  /** An overlay's strength, 0 to 1 (capped at `OVERLAY_MAX`: an overlay never hides what is under it). */
  opacity?: number;
  /** A glow's or blur's radius, px. */
  px?: number;
  /** What lite mode and reduced motion do to it: `off` removes it, `static` keeps it still. Grain and scanlines default to off, the rest to static. */
  fallback?: "off" | "static";
  /** Hidden on a screen under this size class. */
  minSizeClass?: SizeClass;
  /** What the `calm` FX level draws: `off` drops it, `static` keeps it still. Unset = `fallback`. */
  calm?: "off" | "static";
  /** Flashes a second for the `FX_KINDS`, over 0 and at most `FLASH_MAX`; unset = 1. */
  rate?: number;
}

/** What the screen is doing now. `lite` is lite mode (below 60 fps or reduced motion); `limitBlur` is the Limit blur switch. */
export interface EffectEnv {
  lite: boolean;
  reduceMotion: boolean;
  limitBlur: boolean;
  solidPage: boolean;
  sizeClass?: SizeClass;
}

/** An effect as it is drawn on this screen. */
export interface PlannedEffect {
  kind: EffectKind;
  cost: EffectCost;
  opacity: number;
  px: number;
  animate: boolean;
}

/** The cheapest class each kind can honestly claim: a glow or blur is a filter whatever the pack says. */
export const KIND_FLOOR: Readonly<Record<EffectKind, EffectCost>> = { grain: "static", scanlines: "static", vignette: "static", glow: "filter", blur: "filter", glitch: "composited", flicker: "composited", "rgb-split": "composited", interference: "composited" };
const COST_RANK: Readonly<Record<EffectCost, number>> = { static: 0, composited: 1, mask: 2, filter: 3, animated: 4 };
/** How many effects of a costly class a pack may have at once (the per-pack layer budget, spec Performance row). */
export const COST_LIMITS: Readonly<Partial<Record<EffectCost, number>>> = { filter: 2, mask: 2, animated: 1 };
/** Only these two can move. */
const MOVES: readonly EffectKind[] = ["grain", "scanlines"];

/** An overlay never gets stronger than this, so it cannot hide a widget (L71). */
export const OVERLAY_MAX = 0.4;
/** Glow radius cap (px), halved in lite mode; blur caps: Limit blur 12 px, otherwise 24 px, none in lite mode (spec 9.3). */
export const GLOW_MAX = 24;
export const BLUR_MAX = 24;
export const BLUR_LIMITED = 12;
const OVERLAY_DEFAULT = 0.25;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** The size class of a screen by its short side (display compatibility brief, Appendix B). */
export function sizeClassOf(width: number, height: number): SizeClass {
  const short = Math.min(width, height);
  return short < 360 ? "xs" : short < 600 ? "sm" : short < 900 ? "md" : "lg";
}

/** Whether a screen of `have` size class shows a decoration that needs `min` (no minimum: always). */
export const showsAt = (min: SizeClass | undefined, have: SizeClass | undefined): boolean =>
  !min || !have || SIZE_CLASSES.indexOf(have) >= SIZE_CLASSES.indexOf(min);

/** The problems with a pack's effects, one line each. */
export function effectIssues(effects: readonly PackEffect[]): string[] {
  const issues: string[] = [];
  const count: Partial<Record<EffectCost, number>> = {};
  effects.forEach((e, i) => {
    const at = `effect ${i}`;
    if (!e || typeof e !== "object") return void issues.push(`${at} is not an effect`);
    if (!(e.kind in KIND_FLOOR)) return void issues.push(`${at} kind ${String(e.kind)}`);
    if (!EFFECT_COSTS.includes(e.cost)) return void issues.push(`${at} cost ${String(e.cost)}`);
    if (e.cost !== "animated" && COST_RANK[e.cost] < COST_RANK[KIND_FLOOR[e.kind]]) issues.push(`${at}: ${e.kind} costs at least ${KIND_FLOOR[e.kind]}`);
    if (e.cost === "animated" && !MOVES.includes(e.kind)) issues.push(`${at}: ${e.kind} cannot be animated`);
    if ((FX_KINDS as readonly string[]).includes(e.kind) && e.cost !== "animated") issues.push(`${at}: ${e.kind} is animated: cost animated`);
    count[e.cost] = (count[e.cost] ?? 0) + 1;
    for (const key of ["opacity", "px"] as const) if (e[key] !== undefined && !(typeof e[key] === "number" && Number.isFinite(e[key]) && e[key]! >= 0)) issues.push(`${at} ${key}`);
    if (e.fallback !== undefined && e.fallback !== "off" && e.fallback !== "static") issues.push(`${at} fallback`);
    if (e.minSizeClass !== undefined && !SIZE_CLASSES.includes(e.minSizeClass)) issues.push(`${at} minSizeClass`);
  });
  for (const [cost, limit] of Object.entries(COST_LIMITS)) if ((count[cost as EffectCost] ?? 0) > limit) issues.push(`more than ${limit} ${cost} effects`);
  return issues;
}

/** The effects this screen draws: capped, cut or stilled by its settings. Pure, in the pack's order. */
export function planEffects(effects: readonly PackEffect[] | undefined, env: EffectEnv): PlannedEffect[] {
  const calm = env.lite || env.reduceMotion;
  const out: PlannedEffect[] = [];
  for (const e of effects ?? []) {
    if (!showsAt(e.minSizeClass, env.sizeClass)) continue;
    const fallback = e.fallback ?? (MOVES.includes(e.kind) ? "off" : "static");
    if (calm && fallback === "off") continue;
    let px = 0;
    if (e.kind === "glow") px = Math.floor(clamp(e.px ?? 12, 0, GLOW_MAX) / (env.lite ? 2 : 1));
    if (e.kind === "blur") px = env.lite || env.solidPage ? 0 : clamp(e.px ?? 8, 0, env.limitBlur ? BLUR_LIMITED : BLUR_MAX);
    if ((e.kind === "glow" || e.kind === "blur") && px === 0) continue;
    out.push({ kind: e.kind, cost: e.cost, opacity: clamp(e.opacity ?? OVERLAY_DEFAULT, 0, OVERLAY_MAX), px, animate: e.cost === "animated" && !calm });
  }
  return out;
}
