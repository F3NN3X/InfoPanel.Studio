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

/** The native look key's choices ("auto" keeps the skin's own glow, "off" turns it off). */
export const GLOW_LEVELS = ["auto", "off", "soft", "strong"] as const;
export type GlowLevel = (typeof GLOW_LEVELS)[number];

const LEVEL_RADIUS = { soft: 6, strong: 12 } as const;

/** The radius of a level that glows; null for auto and off. */
export const levelRadius = (level: GlowLevel): number | null => (level === "soft" || level === "strong" ? LEVEL_RADIUS[level] : null);

/** The CSS text-shadow of a glow: a tight core and a wide halo, in `color` (default: the widget's accent). */
export function glowShadow(radius: number, color = ""): string {
  const c = color || "var(--accent)";
  const r = clampGlowRadius(radius);
  return `0 0 ${Math.round(r / 2)}px ${c}, 0 0 ${r * 2}px ${c}`;
}

/** The Text/Value fields for a glow (`null`: off). */
export function glowToInfoPanel(glow: { radius: number; color: string } | null): { GlowEnabled: boolean; GlowRadius?: number; GlowColor?: string } {
  return glow ? { GlowEnabled: true, GlowRadius: clampGlowRadius(glow.radius), GlowColor: glow.color } : { GlowEnabled: false };
}

/** The glow a Text/Value item carries, if it has one. */
export function glowFromInfoPanel(item: { GlowEnabled?: unknown; GlowRadius?: unknown; GlowColor?: unknown }): { radius: number; color: string } | null {
  return item.GlowEnabled === true ? { radius: clampGlowRadius(item.GlowRadius), color: typeof item.GlowColor === "string" ? item.GlowColor : "#000000" } : null;
}
