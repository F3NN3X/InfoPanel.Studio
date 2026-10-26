/** What the native versions of the InfoPanel templates share: a theme from a handful of colours, and the common zones. */
import type { ThemeTokens } from "../../theme";
import { zone, type At, type Zone } from "../kit";
import type { Role } from "../../infopanel/templates/roles";

/** "#rrggbb" as the HSL triplet the theme tokens hold ("210 40% 12%"). */
export function hsl(hex: string): string {
  const n = parseInt(hex.slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => v / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  const h = d === 0 ? 0 : max === r ? ((g - b) / d + 6) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return `${Math.round(h * 60)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
}

interface Palette {
  /** The page. */
  bg: string;
  /** Text. */
  fg: string;
  /** A card's face. */
  card: string;
  /** Secondary text. */
  sub: string;
  /** Tracks, hairlines. */
  line: string;
}

/** A theme from five colours, the way an InfoPanel template names its palette. */
export function theme({ bg, fg, card, sub, line }: Palette): ThemeTokens {
  return {
    background: hsl(bg),
    foreground: hsl(fg),
    card: hsl(card),
    "card-foreground": hsl(fg),
    popover: hsl(card),
    "popover-foreground": hsl(fg),
    primary: hsl(fg),
    "primary-foreground": hsl(bg),
    secondary: hsl(line),
    "secondary-foreground": hsl(fg),
    muted: hsl(line),
    "muted-foreground": hsl(sub),
    accent: hsl(line),
    "accent-foreground": hsl(fg),
    destructive: "0 72% 51%",
    "destructive-foreground": "0 0% 98%",
    border: hsl(line),
    input: hsl(line),
    ring: hsl(sub),
  };
}

/** The first `n` cells of a `cols` wide grid, left to right and top to bottom, one cell each. */
export const flow = (cols: number, n: number): At[] => Array.from({ length: n }, (_, i) => [(i % cols) + 1, Math.floor(i / cols) + 1, 1, 1] as const);

/**
 * Every zone given the same card: a reading or the CPU monitor draws none unless its surface and the surface's opacity
 * are set on the zone itself. A zone's own settings win over these.
 */
export const cards = (zones: Zone[], card: Record<string, string | number>): Zone[] => zones.map((z) => ({ ...z, settings: { surfaceOpacity: 100, ...card, ...z.settings } }));

/** A sensor reading found by role: a value, a ring, a bar or a sparkline. */
export const reading = (at: At, label: string, role: Role, settings?: Zone["settings"]): Zone => zone("SensorValue", at, { label, ...settings }, { sensor: role });
