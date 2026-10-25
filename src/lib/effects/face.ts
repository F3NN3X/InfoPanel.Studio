/**
 * Textured ring faces, one definition for both editors: a disc inside the ring, filled and printed
 * with a repeating pattern (hex, dots, grid or carbon). A vector gauge draws it as an SVG `<pattern>`
 * in a static layer of its own, so the moving arc never repaints it live; InfoPanel has no such
 * thing, so the export bakes it into the ring's frames. Pure.
 */
import { fmt } from "../infopanel/gauges/geom.ts";

export const FACE_PATTERNS = ["hex", "dots", "grid", "carbon"] as const;
export type FacePattern = (typeof FACE_PATTERNS)[number];

export interface FaceSpec {
  pattern: FacePattern;
  /** The pattern's colour: #RRGGBB or a theme colour name. */
  color: string;
  /** The pattern's opacity, 0-1. */
  opacity: number;
  /** One cell, px. */
  size: number;
  /** The disc behind the pattern; null draws only the pattern. */
  fill: string | null;
}

export const DEFAULT_FACE: FaceSpec = { pattern: "hex", color: "#FFFFFF", opacity: 0.07, size: 14, fill: "#0B0F15" };

/** The pattern's tile, drawn from the origin: its size and its markup. `ink` is a resolved CSS colour. */
export function faceTile(pattern: FacePattern, size: number, ink: string): { w: number; h: number; markup: string } {
  const s = size;
  const style = `fill:none;stroke:${ink};stroke-width:${fmt(Math.max(0.6, s / 14))}`;
  switch (pattern) {
    case "dots":
      return { w: s, h: s, markup: `<circle cx="${fmt(s / 2)}" cy="${fmt(s / 2)}" r="${fmt(Math.max(0.6, s / 7))}" style="fill:${ink}"/>` };
    case "grid":
      return { w: s, h: s, markup: `<path d="M0 0H${fmt(s)}M0 0V${fmt(s)}" style="${style}"/>` };
    case "carbon":
      return {
        w: s, h: s,
        markup: `<rect width="${fmt(s / 2)}" height="${fmt(s / 2)}" style="fill:${ink}"/><rect x="${fmt(s / 2)}" y="${fmt(s / 2)}" width="${fmt(s / 2)}" height="${fmt(s / 2)}" style="fill:${ink}"/>`,
      };
    case "hex": {
      // Pointy-top hexagons of circumradius s/2 in a lattice: a tile is one hexagon wide and three radii tall.
      const r = s / 2;
      const w = Math.sqrt(3) * r;
      const hex = ([cx, cy]: number[]) =>
        `M${fmt(cx)} ${fmt(cy - r)}L${fmt(cx + w / 2)} ${fmt(cy - r / 2)}L${fmt(cx + w / 2)} ${fmt(cy + r / 2)}L${fmt(cx)} ${fmt(cy + r)}L${fmt(cx - w / 2)} ${fmt(cy + r / 2)}L${fmt(cx - w / 2)} ${fmt(cy - r / 2)}Z`;
      const cells = [[0, 0], [w, 0], [w / 2, 1.5 * r], [0, 3 * r], [w, 3 * r]];
      return { w, h: 3 * r, markup: `<path d="${cells.map(hex).join("")}" style="${style}"/>` };
    }
  }
}

/**
 * A face from untrusted JSON: a known pattern, numbers in range, colours as the caller checks them.
 * Anything that is not an object gives null, so a missing face stays missing.
 */
export function normalizeFace(raw: unknown, color: (v: unknown, def: string) => string): FaceSpec | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const num = (v: unknown, def: number, lo: number, hi: number) => (typeof v === "number" && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : def);
  return {
    pattern: (FACE_PATTERNS as readonly unknown[]).includes(o.pattern) ? (o.pattern as FacePattern) : DEFAULT_FACE.pattern,
    color: color(o.color, DEFAULT_FACE.color),
    opacity: num(o.opacity, DEFAULT_FACE.opacity, 0, 1),
    size: num(o.size, DEFAULT_FACE.size, 4, 64),
    fill: o.fill === null ? null : color(o.fill, DEFAULT_FACE.fill!),
  };
}
