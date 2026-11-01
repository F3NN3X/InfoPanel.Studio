// How a Stream Deck key looks under the widget's skin. Pure: the widget passes the skin context, its own surface (the
// pane) and the key's side. The skin styles the keys only, never the widget's frame. The app's icons are opaque, so a
// surface shows as a frame round the icon, and an overlay (the surface's edge, a sheen or a glow) is drawn over it;
// the surface's background never is, or it would hide the icon.
import type { CSSProperties } from "react";
import { mix } from "../core/tokens";
import { BASE_SURFACES, LEGACY_SURFACES, type SurfaceTone } from "../core/surfaces";
import { SURFACES, resolveSurface, textVars } from "../core/theme";
import type { SkinContext } from "../core/types";

/** `auto` the skin's own card, `widget` the widget's surface, `plain` the flat key, else a surface's name. */
export type KeyStyle = string;
export type KeyFrame = "none" | "thin" | "thick";
export type IconOverlay = "skin" | "sheen" | "glow" | "none";
export type PressedEffect = "skin" | "dip" | "glow" | "none";

export interface KeyLook {
  /** The key box: classes and style. */
  className: string;
  style: CSSProperties;
  /** Which text colours read on the key. */
  tone: SurfaceTone;
  /** The icon's inset from the key's edge, px. */
  inset: number;
  /** Drawn over the icon, or null. */
  overlay: { className: string; style: CSSProperties } | null;
}

const PLAIN = { className: "bg-white/[0.06]", style: { boxShadow: "inset 0 0 0 1px rgba(255,255,255,.05)" } };

/** A skin's surfaces are drawn for widget-sized cards: fixed px (cyber's chamfer) shrink with the key, from this side down. */
const DESIGN_SIDE = 160;

/** `css` with its px lengths scaled by `k`. */
export const scalePx = (css: string, k: number): string => css.replace(/(\d+(?:\.\d+)?)px/g, (_, n: string) => `${Math.round(Number(n) * k * 10) / 10}px`);

const FRAME: Record<KeyFrame, number> = { none: 0, thin: 0.05, thick: 0.1 };

/**
 * The widget frame's surface: a skin's card (`auto`, or a skin-native name a chosen skin brought in) is the keys' look,
 * so the frame keeps the default; a surface picked by name stays.
 */
export const frameSurface = (surface: string | undefined): string | undefined =>
  surface && (surface in BASE_SURFACES || surface in LEGACY_SURFACES) ? surface : undefined;

/** The over-icon layer for `kind` at `strength` (0–100 %). Skin = the surface's border and shadow, or a faint accent ring when it has none. */
function overlayOf(kind: IconOverlay, strength: number, size: number, edge: { className: string; style: CSSProperties } | null, clipPath: string | undefined): KeyLook["overlay"] {
  if (kind === "none" || strength <= 0) return null;
  const opacity = Math.min(100, strength) / 100;
  const clip = clipPath ? { clipPath } : null;
  if (kind === "sheen")
    return {
      className: "",
      style: { background: "linear-gradient(180deg, rgba(255,255,255,.28), rgba(255,255,255,.06) 42%, transparent 55%)", boxShadow: "inset 0 1px 0 rgba(255,255,255,.4), inset 0 0 0 1px rgba(255,255,255,.12)", opacity, ...clip },
    };
  if (kind === "glow") return { className: "", style: { boxShadow: `inset 0 0 0 1px ${mix(70)}, inset 0 0 ${Math.round(size * 0.2)}px ${mix(55)}`, opacity, ...clip } };
  if (!edge) return null;
  return { className: edge.className, style: { ...edge.style, opacity, ...clip } };
}

/** The key's look for `style` (an unknown surface name draws the plain key), its frame and overlay, and its side, px. */
export function keyLook(o: { style: KeyStyle; frame: KeyFrame; overlay: IconOverlay; strength: number; size: number; skin: SkinContext; pane: { className: string; style: CSSProperties } }): KeyLook {
  const { style, size } = o;
  const def = style === "widget" ? null : style === "auto" ? resolveSurface("auto", o.skin.skin) : SURFACES[style];
  if (style === "plain" || (style !== "widget" && !def)) return { ...PLAIN, tone: "dark", inset: 0, overlay: overlayOf(o.overlay === "skin" ? "none" : o.overlay, o.strength, size, null, undefined) };
  const className = def ? def.c : o.pane.className;
  // A surface's own size (brutal leaves room for its offset shadow) would shrink the key in its grid cell.
  const { width: _w, height: _h, ...base } = def ? def.s : o.pane.style;
  const k = Math.min(1, size / DESIGN_SIDE);
  const clipPath = typeof base.clipPath === "string" ? scalePx(base.clipPath, k) : undefined;
  // The widget's root already sets the text colours for its own surface.
  const box: CSSProperties = { ...base, ...(clipPath ? { clipPath } : null), ...(def ? textVars(def.tone) : null) };
  // Only the border classes go over the icon: a backdrop blur there would blur the icon.
  const borders = className.split(/\s+/).filter((c) => c.startsWith("border")).join(" ");
  const ring = base.boxShadow || base.borderColor || borders;
  const edge = ring ? { className: borders, style: { boxShadow: base.boxShadow, borderColor: base.borderColor } } : { className: "", style: { boxShadow: `inset 0 0 0 1px ${mix(40)}` } };
  return { className, style: box, tone: def?.tone ?? "dark", inset: Math.round(size * FRAME[o.frame]), overlay: overlayOf(o.overlay, o.strength, size, edge, clipPath) };
}

/** The key's corner radius: its own, else the widget's or (on the skin's card) the skin's × 0.62, else the theme's. */
export function keyRadius(o: { keyRadius?: number; radius?: number; style: KeyStyle; skin: SkinContext }): string {
  if (o.keyRadius !== undefined && o.keyRadius > 0) return `${o.keyRadius}px`;
  if (o.radius !== undefined) return `${o.radius * 0.62}px`;
  if (o.style === "auto" && o.skin.radius !== undefined) return `${o.skin.radius * 0.62}px`;
  return "calc(var(--radius, 1rem) * 0.62)";
}

/** Skin = glow on the skins that glow, dip on the rest. */
export const pressedOf = (effect: PressedEffect, skin: SkinContext): Exclude<PressedEffect, "skin"> => (effect === "skin" ? (skin.glow || skin.numGlow ? "glow" : "dip") : effect);
