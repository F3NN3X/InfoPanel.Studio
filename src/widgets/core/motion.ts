import type { CSSProperties } from "react";

/**
 * Bar fills move with `transform`, not width/height: a transform transition runs on the
 * compositor, a size transition lays out every frame. `pct` is 0-100. Unrounded fills scale
 * from their edge; rounded fills inside an overflow-hidden track slide, so their ends keep
 * their radius. A gradient on a sliding fill is anchored to the track.
 */
export const scaleX = (pct: number): CSSProperties => ({ transform: `scaleX(${pct / 100})`, transformOrigin: "left" });
export const scaleY = (pct: number): CSSProperties => ({ transform: `scaleY(${pct / 100})`, transformOrigin: "bottom" });
export const slideX = (pct: number): CSSProperties => ({ transform: `translateX(${pct - 100}%)` });
export const slideY = (pct: number): CSSProperties => ({ transform: `translateY(${100 - pct}%)` });
