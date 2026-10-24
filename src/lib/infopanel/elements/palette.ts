/**
 * A profile's palette (studio-only, never exported): the named colours its elements and styled
 * defaults take. A colour that came from a slot keeps both the slot and the colour it resolved
 * to, so every renderer and the export read a plain colour, and a palette change can find and
 * recolour it.
 */
import type { Profile } from "../schema.ts";
import { ACCENT, mix } from "../editor/look.ts";

export const SLOTS = ["accent1", "accent2", "accent3", "text", "subtext", "track", "card", "warn", "crit"] as const;
export type Slot = (typeof SLOTS)[number];

export const SLOT_LABEL: Record<Slot, string> = {
  accent1: "Accent 1",
  accent2: "Accent 2",
  accent3: "Accent 3",
  text: "Text",
  subtext: "Sub-text",
  track: "Track",
  card: "Card",
  warn: "Warning",
  crit: "Critical",
};

/** Each slot's colour, as InfoPanel writes colours (#AARRGGBB). */
export type Palette = Record<Slot, string>;

/** A colour an element draws with: the colour, and the palette slot it follows, if any. */
export interface Ink {
  color: string;
  slot?: Slot;
}

const ARGB = /^#[0-9A-F]{8}$/;

export const isSlot = (v: unknown): v is Slot => typeof v === "string" && (SLOTS as readonly string[]).includes(v);

/** InfoPanel's colour forms (#RGB, #ARGB, #RRGGBB, #AARRGGBB) as #AARRGGBB; null when unreadable. */
export function argbOf(v: unknown): string | null {
  if (typeof v !== "string") return null;
  let h = v.trim().replace(/^#/, "").toUpperCase();
  if (h.length === 3 || h.length === 4) h = [...h].map((c) => c + c).join("");
  if (h.length === 6) h = "FF" + h;
  return ARGB.test("#" + h) ? "#" + h : null;
}

/**
 * A profile's palette before the user changes it: Phase 2's accent as accent 1, two more accents,
 * the text colour and a muted one, the styled defaults' track and card, and the widgets' warning
 * and critical tones.
 */
export function defaultPalette(profile: Pick<Profile, "BackgroundColor" | "Color">): Palette {
  return {
    accent1: ACCENT,
    accent2: "#FF22D3EE",
    accent3: "#FFA855F7",
    text: argbOf(profile.Color) ?? "#FFFFFFFF",
    subtext: mix(profile.BackgroundColor, profile.Color, 0.55),
    track: mix(profile.BackgroundColor, profile.Color, 0.14),
    card: mix(profile.BackgroundColor, profile.Color, 0.07),
    warn: "#FFEDB232",
    crit: "#FFF2665E",
  };
}

/** A stored palette from untrusted JSON, slot by slot; a missing or wrong slot takes the default. */
export function normalizePalette(raw: unknown, fallback: Palette): Palette {
  const o = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  return Object.fromEntries(SLOTS.map((s) => [s, argbOf(o[s]) ?? fallback[s]])) as Palette;
}

/** An ink from untrusted JSON; null when its colour is unreadable. */
export function normalizeInk(raw: unknown): Ink | null {
  const o = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : null;
  const color = argbOf(o?.color);
  if (!o || !color) return null;
  return isSlot(o.slot) ? { color, slot: o.slot } : { color };
}

/** An ink from a slot, resolved in the palette. */
export const slotInk = (palette: Palette, slot: Slot): Ink => ({ color: palette[slot], slot });

/** The ink with its slot's colour from the palette (a fixed colour stays). */
export const resolveInk = (ink: Ink, palette: Palette): Ink => (ink.slot ? { color: palette[ink.slot], slot: ink.slot } : ink);

/** #AARRGGBB → #RRGGBB, for the vector gauge spec (no alpha). */
export const rgbOf = (color: string): string => "#" + (argbOf(color) ?? "#FF000000").slice(3);

/** The colour's alpha, 0–1. */
export const alphaOf = (color: string): number => parseInt((argbOf(color) ?? "#FF000000").slice(1, 3), 16) / 255;

/** A colour as CSS (rgb with alpha), for SVG markup. */
export function cssOf(color: string): string {
  const h = (argbOf(color) ?? "#FF000000").slice(1);
  const [a, r, g, b] = [0, 2, 4, 6].map((i) => parseInt(h.slice(i, i + 2), 16));
  return a === 255 ? `rgb(${r},${g},${b})` : `rgba(${r},${g},${b},${+(a / 255).toFixed(4)})`;
}
