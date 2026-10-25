/**
 * Glowing numbers, one definition for both editors: a radius and a colour. Native widgets draw it as a
 * CSS text-shadow; InfoPanel items carry it as Text/Value `GlowEnabled`, `GlowRadius` and `GlowColor`,
 * which InfoPanel itself draws. Pure.
 */

/** InfoPanel's GlowRadius range (`infopanel/schema.ts`). */
export const GLOW_MIN = 2;
export const GLOW_MAX = 20;

export const clampGlowRadius = (v: unknown, def = 8): number =>
  typeof v === "number" && Number.isFinite(v) ? Math.min(GLOW_MAX, Math.max(GLOW_MIN, Math.round(v))) : def;

/**
 * The native look key's choices ("auto" keeps the skin's own glow, "off" turns it off). The shadows for Soft and Strong
 * are in `index.css` (`[data-wp-numglow]`), so the widget bundle carries only the choice.
 */
export const GLOW_LEVELS = ["auto", "off", "soft", "strong"] as const;
export type GlowLevel = (typeof GLOW_LEVELS)[number];

/** The Text/Value fields for a glow (`null`: off). */
export function glowToInfoPanel(glow: { radius: number; color: string } | null): { GlowEnabled: boolean; GlowRadius?: number; GlowColor?: string } {
  return glow ? { GlowEnabled: true, GlowRadius: clampGlowRadius(glow.radius), GlowColor: glow.color } : { GlowEnabled: false };
}

/** The glow a Text/Value item carries, if it has one. */
export function glowFromInfoPanel(item: { GlowEnabled?: unknown; GlowRadius?: unknown; GlowColor?: unknown }): { radius: number; color: string } | null {
  return item.GlowEnabled === true ? { radius: clampGlowRadius(item.GlowRadius), color: typeof item.GlowColor === "string" ? item.GlowColor : "#000000" } : null;
}
