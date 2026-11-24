// The component treatments a Look's T3 can ask for (Cyberspec v2, lane K): solid tone slabs on a header, chip, tab, list row or the whole
// card, scaled readouts, segmented cell meters, hexagon rings and avatars, signal-graph marks, gapped share bars and ruled rows. The words each token takes, and which
// tones a Look's slabs can be drawn in, for the validator (the contrast of the slab ink) and the drawing code (t3-tokens.ts) alike.

import { contrastOf } from "./status";

/** The parts a slab can be drawn on. */
export const SLAB_PARTS = ["header", "chip", "tab", "row", "card"] as const;
export type SlabPart = (typeof SLAB_PARTS)[number];
/** The tones a slab is drawn in: the accent, the Look's `slab-info`, and the card's ok, warn and critical colours. */
export const SLAB_TONES = ["accent", "info", "ok", "warn", "crit"] as const;
export type SlabTone = (typeof SLAB_TONES)[number];
/** What a part's `slab-*` token says: no slab, a slab only while the part (or, for the header and the card, the card) shows a warning or a critical reading, a slab in one tone always, or (rows only) the current row in the `slab-current` tone. */
export const SLAB_ROLES = ["none", "state", ...SLAB_TONES] as const;
export type SlabRole = (typeof SLAB_ROLES)[number] | "current";

/** The words each treatment token takes (the numbers and colours are the validator's ranges). */
export const TREATMENT_WORDS: Readonly<Record<string, readonly string[]>> = {
  "slab-header": SLAB_ROLES,
  "slab-chip": SLAB_ROLES,
  "slab-tab": SLAB_ROLES,
  "slab-row": [...SLAB_ROLES, "current"],
  "slab-card": SLAB_ROLES,
  "slab-texture": ["none", "scanlines"],
  "readout-bar": ["none", "rule"],
  "meter-peak": ["none", "hold"],
  "graph-grid": ["auto", "dashed", "none"],
  "graph-lead": ["none", "square"],
  "graph-bars": ["solid", "striped"],
  "row-style": ["none", "ruled"],
  "slab-current": SLAB_TONES,
  "share-style": ["none", "gapped"],
  "avatar-shape": ["none", "hex"],
};

/** The slab ink and the info tone a Look that names none draws (the kit's on-solid ink and signal cyan). */
export const SLAB_INK_DEFAULT = "#0B0B12";
export const SLAB_INFO_DEFAULT = "#5EF6FF";
/** How strong a slab's scan lines are over it: the contrast of the slab ink is read on the slab and on a line. */
export const SLAB_LINE_ALPHA = 0.16;
/** A dark ink (relative luminance under this) gets light scan lines, a light one dark lines, so a line only ever adds to the ink's contrast. */
const DARK_INK = 0.18;
const luminanceOf = (hex: string): number | undefined => {
  const m = /^#([\da-f]{6})$/i.exec(hex.trim());
  if (!m) return undefined;
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
/** The colour of a slab's scan lines under `ink`: white under a dark ink (and one that is not a literal), black under a light one. */
export const slabLine = (ink: string): "#ffffff" | "#000000" => ((luminanceOf(ink) ?? 0) < DARK_INK ? "#ffffff" : "#000000");
/** The scan-line texture a slab may carry: a line every 3 px, away from the ink. */
export const slabTexture = (ink: string): string => `repeating-linear-gradient(0deg, ${slabLine(ink) === "#ffffff" ? "rgb(255 255 255" : "rgb(0 0 0"} / ${SLAB_LINE_ALPHA}) 0 1px, transparent 1px 3px)`;
/** The lit cells of a cell meter: dark lines, as on the kit's meter. */
export const SLAB_TEXTURE = slabTexture("#ffffff");
/** The ink on a slab in a colour that is not a literal hex (a card variable): near black above this OKLCH lightness, white under it, so each reads 4.5:1 or more. */
const OWN_INK_L = 0.56;
/**
 * The custom properties of a slab that a layout variant draws in its own colour (`data-wp-slab="accent"` with these on it or above it), for
 * where no card carries the Look's: the alerts, the island, and a card whose Look names no slab. The colour is the slab, the ink the kit's near
 * black or white, whichever reads better on it (4.5:1 or more, as the validator holds a Look's slab ink to), the texture the one a Look's slabs
 * take. A colour that is a variable gets the ink computed in CSS, and no texture; its variables are read above the slab (a slab redefines the card's).
 */
export function ownSlabVars(color: string): Record<string, string> {
  const hex = luminanceOf(color) !== undefined;
  const ink = !hex ? `oklch(from ${color} clamp(0, (${OWN_INK_L} - l) * 1000, 1) 0 0)` : (contrastOf(color, SLAB_INK_DEFAULT) ?? 0) >= (contrastOf(color, "#ffffff") ?? 0) ? SLAB_INK_DEFAULT : "#ffffff";
  return { "--wp-slab-accent": color, "--wp-slab-ink": ink, ...(hex ? { "--wp-slab-tex": slabTexture(ink) } : null) };
}
/** A slab's notch (its bottom right corner cut) is at most this many px. */
export const SLAB_NOTCH_MAX = 12;
/** A readout's scale (`readout-scale`) and the size of its decimals (`readout-decimals`), as the validator holds them. */
export const READOUT_SCALE_MAX = 4;
export const READOUT_DECIMALS_MIN = 0.3;

/**
 * The tones a Look's slabs can be drawn in: each constant tone a part names, the `slab-current` tone for the current row, and warn and critical for any
 * part with a slab at all (a part's own warning or critical reading wins over its constant tone). Empty when the Look draws no slab.
 */
/** The tone a current row's slab takes (`slab-current`, the accent by default). */
export const currentTone = (t3: Readonly<Record<string, string | number>> | undefined): SlabTone => {
  const v = String(t3?.["slab-current"] ?? "accent");
  return (SLAB_TONES as readonly string[]).includes(v) ? (v as SlabTone) : "accent";
};

export function slabTones(t3: Readonly<Record<string, string | number>> | undefined): SlabTone[] {
  const roles = SLAB_PARTS.map((p) => String(t3?.[`slab-${p}`] ?? "none")).filter((r) => r !== "none" && (TREATMENT_WORDS["slab-row"] as readonly string[]).includes(r));
  if (!roles.length) return [];
  const tones = new Set<SlabTone>(["warn", "crit"]);
  for (const r of roles) {
    if (r === "current") tones.add(currentTone(t3));
    else if ((SLAB_TONES as readonly string[]).includes(r)) tones.add(r as SlabTone);
  }
  return SLAB_TONES.filter((t) => tones.has(t));
}
