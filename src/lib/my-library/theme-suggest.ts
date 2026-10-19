/**
 * "Suggested for theme" (spec §3): the backgrounds that suit the active profile's theme, ranked
 * by (1) contrast with the theme's text colour at the image's median luminance (≥ 4.5:1 to
 * qualify), (2) how close its hue is to the accent, (3) low detail. Each comes with a one-line
 * reason. Pure; the image numbers were read at upload (`analyse.ts`).
 */
import type { LibraryItem } from "@/lib/library";
import { hueName, hueSat, relLuminance } from "./analyse";
import { metaOf, tagsOf } from "./model";

/** The contrast a background needs against the theme's text. */
export const MIN_CONTRAST = 4.5;

/** "H S% L%" (the theme tokens' form) → sRGB 0–255. */
export function hslTokenToRgb(token: string): [number, number, number] | null {
  const m = /^\s*(-?[\d.]+)\s+([\d.]+)%\s+([\d.]+)%\s*$/.exec(token);
  if (!m) return null;
  const h = ((Number(m[1]) % 360) + 360) % 360;
  const s = Number(m[2]) / 100;
  const l = Number(m[3]) / 100;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const o = l - c / 2;
  const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return [Math.round((r + o) * 255), Math.round((g + o) * 255), Math.round((b + o) * 255)];
}

export const contrast = (a: number, b: number) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);

/** Degrees between two hues (0–180). */
export const hueDistance = (a: number, b: number) => {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
};

export interface ThemeColours {
  /** The text colour token ("H S% L%"). */
  foreground: string;
  /** The accent token. */
  accent: string;
  /** "Midnight", or omitted for "the theme". */
  name?: string;
}

export interface Suggestion {
  item: LibraryItem;
  reason: string;
  score: number;
}

export function suggestBackgrounds(items: readonly LibraryItem[], theme: ThemeColours, limit = 3): Suggestion[] {
  const fg = hslTokenToRgb(theme.foreground);
  const accent = hslTokenToRgb(theme.accent);
  if (!fg) return [];
  const fgLum = relLuminance(...fg);
  const acc = accent ? hueSat(...accent) : null;
  // An accent with no colour of its own (a grey) can't be matched by hue.
  const accentHue = acc && acc.sat >= 0.15 ? acc.hue : null;
  const owner = theme.name ? `the ${theme.name} accent` : "the theme accent";
  const out: Suggestion[] = [];
  for (const item of items) {
    const s = metaOf(item).stats;
    if (!s || !tagsOf(item).includes("Background")) continue;
    if (contrast(fgLum, s.median) < MIN_CONTRAST) continue;
    const neutral = s.hue === null || s.colourful < 0.1;
    const dist = !neutral && accentHue !== null && s.hue !== null ? hueDistance(s.hue, accentHue) : null;
    // Hue first (a neutral image neither helps nor clashes), then calm detail.
    const hueScore = dist === null ? 0.5 : 1 - dist / 180;
    const score = hueScore * 2 + (1 - s.edges);
    const reason =
      dist !== null && dist <= 30
        ? `Same ${hueName(s.hue!).toLowerCase()}s as ${owner}`
        : neutral
          ? "Neutral; lets the accent lead"
          : s.edges < 0.15
            ? "Low detail; keeps values readable"
            : "Text stays readable over it";
    out.push({ item, reason, score });
  }
  return out.sort((a, b) => b.score - a.score).slice(0, limit);
}
