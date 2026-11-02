/** What the native versions of the InfoPanel templates share: a theme from a handful of colours, and the common zones. */
import type { ThemeTokens } from "../../theme";
import { zone, type At, type Variant, type Zone } from "../kit";
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

export interface Colours {
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

const channels = (h: string): number[] => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const luminance = (h: string): number => {
  const [r, g, b] = channels(h).map((v) => ((v /= 255) <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a: string, b: string): number => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

/** `sub` moved toward `fg` until it reads at 4.6:1 (a margin for the HSL rounding) on every surface it sits on (the page and the muted chips). */
export function readableSub(sub: string, fg: string, on: readonly string[]): string {
  const [from, to] = [channels(sub), channels(fg)];
  for (let t = 0; t <= 1.0001; t += 0.04) {
    const hex = `#${from.map((v, i) => Math.round(v + (to[i] - v) * t).toString(16).padStart(2, "0")).join("")}`;
    if (on.every((s) => contrast(hex, s) >= 4.6)) return hex;
  }
  return fg;
}

/** A theme from five colours, the way an InfoPanel template names its palette. */
export function theme({ bg, fg, card, sub, line }: Colours): ThemeTokens {
  sub = readableSub(sub, fg, [bg, line]);
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

/** A palette of a template: its colours with some changed, and what else it sets (`Variant`). */
export const variant = (id: string, name: string, swatch: Variant["swatch"], base: Colours, change: Partial<Colours>, rest: Partial<Variant> = {}): Variant => ({
  id,
  name,
  swatch,
  ...(Object.keys(change).length > 0 ? { theme: theme({ ...base, ...change }) } : {}),
  ...rest,
});

/** The blue, purple and green of the Dark family (Deck, Meters, Orbit, Tower, Ticker) and what each becomes on White. */
const DARK = { blue: "#0a84ff", purple: "#bf5af2", green: "#30d158" };
const WHITE = { blue: "#0a6ce8", purple: "#ae4fdb", green: "#1e9a47" };
const SWAP_WHITE = { [DARK.blue]: WHITE.blue, [DARK.purple]: WHITE.purple, [DARK.green]: WHITE.green };

/**
 * The palettes Deck, Meters, Orbit, Tower and Ticker share, as the InfoPanel templates have them: Dark (as designed),
 * White, Smoke and Tint (a see-through card in a lighter tone) and Float (no cards). `base` is the template's colours.
 */
export function darkFamily(base: Colours, ...ids: readonly ("white" | "smoke" | "tint" | "float")[]): Variant[] {
  const swatch = (c: string): Variant["swatch"] => [DARK.blue, DARK.purple, c];
  const all: Record<(typeof ids)[number], Variant> = {
    white: variant("white", "White", [WHITE.blue, WHITE.purple, "#121216"], base, { bg: "#eceef3", fg: "#121216", card: "#e4e5e9", sub: "#5c5f6b", line: "#b4b6bf" }, { style: { accent: WHITE.blue }, swap: SWAP_WHITE }),
    smoke: variant("smoke", "Smoke", swatch("#c6c9d6"), base, { card: "#3e4156", line: "#6c6f84", sub: "#c6c9d6" }, { zones: { surfaceOpacity: 72 } }),
    tint: variant("tint", "Tint", swatch("#b4b9d2"), base, { card: "#1b2142", line: "#4b5272", sub: "#b4b9d2" }, { zones: { surfaceOpacity: 69 } }),
    float: variant("float", "Float", swatch("#e6e8f2"), base, { sub: "#e6e8f2", line: "#4d5268" }, { zones: { surfaceOpacity: 0 } }),
  };
  return [{ id: "dark", name: "Dark", swatch: swatch("#ffffff") }, ...ids.map((id) => all[id])];
}

/**
 * Zones that read as one card: the layout leaves no space between them (empty cells separate one card from the
 * next), and only the corners of the group's outline are rounded.
 */
export function merged(zones: Zone[], radius = 14): Zone[] {
  const x0 = Math.min(...zones.map((z) => z.at[0]));
  const y0 = Math.min(...zones.map((z) => z.at[1]));
  const x1 = Math.max(...zones.map((z) => z.at[0] + z.at[2]));
  const y1 = Math.max(...zones.map((z) => z.at[1] + z.at[3]));
  return zones.map((z) => {
    const [c, r, w, h] = z.at;
    const px = (on: boolean) => `${on ? radius : 0}px`;
    const corners = [c === x0 && r === y0, c + w === x1 && r === y0, c + w === x1 && r + h === y1, c === x0 && r + h === y1].map(px).join(" ");
    return { ...z, settings: { ...z.settings, customCss: `${z.settings?.customCss ?? ""} :scope { border-radius: ${corners} !important; }`.trim() } };
  });
}

/** The first `n` cells of a `cols` wide grid, left to right and top to bottom, one cell each. */
export const flow = (cols: number, n: number): At[] => Array.from({ length: n }, (_, i) => [(i % cols) + 1, Math.floor(i / cols) + 1, 1, 1] as const);

/**
 * Every zone given the same card: a reading or the CPU monitor draws none unless its surface and the surface's opacity
 * are set on the zone itself. A zone's own settings win over these.
 */
export const cards = (zones: Zone[], card: Record<string, string | number | boolean>): Zone[] => zones.map((z) => ({ ...z, settings: { surfaceOpacity: 100, ...card, ...z.settings } }));

/** A sensor reading found by role: a value, a ring, a bar or a sparkline. One that isn't found on this PC is replaced by a similar one or left out. */
export const reading = (at: At, label: string, role: Role, settings?: Zone["settings"]): Zone => ({ ...zone("SensorValue", at, { label, ...settings }, { sensor: role }), spare: true });
