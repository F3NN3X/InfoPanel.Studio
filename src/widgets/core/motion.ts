import type { CSSProperties } from "react";

/**
 * Bar fills move with `transform`, not width/height: a transform transition runs on the
 * compositor, a size transition lays out every frame. `pct` is 0-100. Unrounded fills scale
 * from their edge; rounded fills inside an overflow-hidden track slide, so their ends keep
 * their radius. A gradient on a sliding fill is anchored to the track.
 */
// A fill past its track (a reading above its max) or below zero stays inside it; NaN reads as empty.
const clampPct = (pct: number): number => (Number.isFinite(pct) ? Math.min(100, Math.max(0, pct)) : 0);
const frac = (pct: number): number => clampPct(pct) / 100;
export const scaleX = (pct: number): CSSProperties => ({ transform: `scaleX(${frac(pct)})`, transformOrigin: "left" });
export const scaleY = (pct: number): CSSProperties => ({ transform: `scaleY(${frac(pct)})`, transformOrigin: "bottom" });
export const slideX = (pct: number): CSSProperties => ({ transform: `translateX(${clampPct(pct) - 100}%)` });
export const slideY = (pct: number): CSSProperties => ({ transform: `translateY(${100 - clampPct(pct)}%)` });
/** A full-width fill starting `fromPct` along the track and `pct` wide, for stacked segments (the fill is `absolute inset-0`). */
export const stackX = (fromPct: number, pct: number): CSSProperties => ({ transform: `translateX(${clampPct(fromPct)}%) scaleX(${frac(pct)})`, transformOrigin: "left" });
