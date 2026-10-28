/**
 * Theme engine — shadcn-style CSS variable tokens.
 *
 * Each token is stored as an HSL triplet string (e.g. "240 10% 3.9%") and is
 * written to the document root as a CSS custom property, exactly like
 * shadcn/ui. Components use the semantic Tailwind classes (bg-card,
 * text-foreground, border-border, ...) which map to hsl(var(--token)).
 */

export interface ThemeTokens {
  background: string;
  foreground: string;
  card: string;
  "card-foreground": string;
  popover: string;
  "popover-foreground": string;
  primary: string;
  "primary-foreground": string;
  secondary: string;
  "secondary-foreground": string;
  muted: string;
  "muted-foreground": string;
  accent: string;
  "accent-foreground": string;
  destructive: string;
  "destructive-foreground": string;
  border: string;
  input: string;
  ring: string;
}

export type ThemePresetName =
  | "zinc"
  | "neutral"
  | "slate"
  | "ocean"
  | "forest"
  | "paper";

export interface ThemePreset {
  name: ThemePresetName;
  label: string;
  tokens: ThemeTokens;
}

export const DEFAULT_THEME: ThemeTokens = {
  background: "240 10% 3.9%",
  foreground: "0 0% 98%",
  card: "240 10% 3.9%",
  "card-foreground": "0 0% 98%",
  popover: "240 10% 3.9%",
  "popover-foreground": "0 0% 98%",
  primary: "0 0% 98%",
  "primary-foreground": "240 5.9% 10%",
  secondary: "240 3.7% 15.9%",
  "secondary-foreground": "0 0% 98%",
  muted: "240 3.7% 15.9%",
  "muted-foreground": "240 5% 64.9%",
  accent: "240 3.7% 15.9%",
  "accent-foreground": "0 0% 98%",
  destructive: "0 62.8% 30.6%",
  "destructive-foreground": "0 0% 98%",
  border: "240 3.7% 15.9%",
  input: "240 3.7% 15.9%",
  ring: "240 4.9% 83.9%",
};

export const THEME_PRESETS: ThemePreset[] = [
  { name: "zinc", label: "Zinc", tokens: DEFAULT_THEME },
  {
    name: "neutral",
    label: "Neutral",
    tokens: {
      background: "0 0% 4%",
      foreground: "0 0% 98%",
      card: "0 0% 5%",
      "card-foreground": "0 0% 98%",
      popover: "0 0% 4%",
      "popover-foreground": "0 0% 98%",
      primary: "0 0% 98%",
      "primary-foreground": "0 0% 9%",
      secondary: "0 0% 15%",
      "secondary-foreground": "0 0% 98%",
      muted: "0 0% 15%",
      "muted-foreground": "0 0% 64%",
      accent: "0 0% 15%",
      "accent-foreground": "0 0% 98%",
      destructive: "0 62% 31%",
      "destructive-foreground": "0 0% 98%",
      border: "0 0% 15%",
      input: "0 0% 15%",
      ring: "0 0% 84%",
    },
  },
  {
    name: "slate",
    label: "Slate",
    tokens: {
      background: "222.2 84% 5%",
      foreground: "210 40% 98%",
      card: "222.2 84% 5%",
      "card-foreground": "210 40% 98%",
      popover: "222.2 84% 5%",
      "popover-foreground": "210 40% 98%",
      primary: "210 40% 98%",
      "primary-foreground": "222.2 47% 11%",
      secondary: "217.2 32.8% 17.6%",
      "secondary-foreground": "210 40% 98%",
      muted: "217.2 32.8% 17.6%",
      "muted-foreground": "215 16.3% 46.9%",
      accent: "217.2 32.8% 17.6%",
      "accent-foreground": "210 40% 98%",
      destructive: "0 62.8% 30.6%",
      "destructive-foreground": "210 40% 98%",
      border: "217.2 32.8% 17.6%",
      input: "217.2 32.8% 17.6%",
      ring: "217.2 91.2% 59.8%",
    },
  },
  {
    name: "ocean",
    label: "Ocean",
    tokens: {
      background: "210 45% 7%",
      foreground: "200 30% 96%",
      card: "210 40% 10%",
      "card-foreground": "200 30% 96%",
      popover: "210 45% 7%",
      "popover-foreground": "200 30% 96%",
      primary: "199 89% 55%",
      "primary-foreground": "210 45% 8%",
      secondary: "210 35% 18%",
      "secondary-foreground": "200 30% 96%",
      muted: "210 35% 18%",
      "muted-foreground": "205 20% 65%",
      accent: "210 35% 18%",
      "accent-foreground": "200 30% 96%",
      destructive: "0 62.8% 30.6%",
      "destructive-foreground": "200 30% 96%",
      border: "210 35% 20%",
      input: "210 35% 20%",
      ring: "199 89% 55%",
    },
  },
  {
    name: "forest",
    label: "Forest",
    tokens: {
      background: "150 30% 7%",
      foreground: "140 25% 96%",
      card: "150 28% 10%",
      "card-foreground": "140 25% 96%",
      popover: "150 30% 7%",
      "popover-foreground": "140 25% 96%",
      primary: "142 70% 55%",
      "primary-foreground": "150 30% 8%",
      secondary: "150 25% 18%",
      "secondary-foreground": "140 25% 96%",
      muted: "150 25% 18%",
      "muted-foreground": "145 15% 65%",
      accent: "150 25% 18%",
      "accent-foreground": "140 25% 96%",
      destructive: "0 62.8% 30.6%",
      "destructive-foreground": "140 25% 96%",
      border: "150 25% 20%",
      input: "150 25% 20%",
      ring: "142 70% 55%",
    },
  },
  {
    name: "paper",
    label: "Paper (light)",
    tokens: {
      background: "0 0% 100%",
      foreground: "240 10% 3.9%",
      card: "0 0% 100%",
      "card-foreground": "240 10% 3.9%",
      popover: "0 0% 100%",
      "popover-foreground": "240 10% 3.9%",
      primary: "240 5.9% 10%",
      "primary-foreground": "0 0% 98%",
      secondary: "240 4.8% 95.9%",
      "secondary-foreground": "240 5.9% 10%",
      muted: "240 4.8% 95.9%",
      "muted-foreground": "240 3.8% 46.1%",
      accent: "240 4.8% 95.9%",
      "accent-foreground": "240 5.9% 10%",
      destructive: "0 72.2% 50.6%",
      "destructive-foreground": "0 0% 98%",
      border: "240 5.9% 90%",
      input: "240 5.9% 90%",
      ring: "240 5.9% 10%",
    },
  },
];

/** Convert an "h s% l%" triplet to "#rrggbb" for native color inputs. */
export function hslToHex(hsl: string): string {
  const [h, sRaw, lRaw] = hsl.split(" ").map((p) => p.replace("%", ""));
  const hNum = parseFloat(h);
  const s = parseFloat(sRaw) / 100;
  const l = parseFloat(lRaw) / 100;
  const k = (n: number) => (n + hNum / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) =>
    Math.round(
      255 * (l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1))))
    );
  const toHex = (v: number) =>
    Math.max(0, Math.min(255, v)).toString(16).padStart(2, "0");
  return `#${toHex(f(0))}${toHex(f(8))}${toHex(f(4))}`;
}

/** Convert a "#rrggbb" value back to an "h s% l%" triplet. */
export function hexToHsl(hex: string): string {
  const m = hex.replace("#", "");
  const r = parseInt(m.slice(0, 2), 16) / 255;
  const g = parseInt(m.slice(2, 4), 16) / 255;
  const b = parseInt(m.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let h = 0;
  let s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    h =
      max === r
        ? (g - b) / d + (g < b ? 6 : 0)
        : max === g
          ? (b - r) / d + 2
          : (r - g) / d + 4;
    h /= 6;
  }
  return `${Math.round(h * 360)} ${Math.round(s * 100)}% ${Math.round(
    l * 100
  )}%`;
}

const TOKEN_KEYS = Object.keys(DEFAULT_THEME) as (keyof ThemeTokens)[];

/** A stored partial theme (a profile's own colours): token strings only; undefined when empty. */
export function normalizeThemePatch(input: unknown): Partial<ThemeTokens> | undefined {
  if (typeof input !== "object" || input === null || Array.isArray(input)) return undefined;
  const v = input as Record<string, unknown>;
  const out = Object.fromEntries(
    TOKEN_KEYS.filter((k) => typeof v[k] === "string").map((k) => [k, v[k] as string])
  ) as Partial<ThemeTokens>;
  return Object.keys(out).length > 0 ? out : undefined;
}

/** The built-in corner radius in rem (shadcn --radius). */
export const DEFAULT_RADIUS = 0.5;

/** The theme a screen shows: its own colours / radius over the built-in ones (each screen owns its look since config v16). */
export function resolveTheme(profile?: { theme?: Partial<ThemeTokens>; radius?: number }): { tokens: ThemeTokens; radius: number } {
  return {
    tokens: profile?.theme ? { ...DEFAULT_THEME, ...profile.theme } : DEFAULT_THEME,
    radius: profile?.radius ?? DEFAULT_RADIUS,
  };
}

/** A theme (+ corner radius) as CSS variables (`--background`, ..., `--radius`). */
export function themeVars(tokens: ThemeTokens, radius = 0.5): Record<string, string> {
  return {
    ...Object.fromEntries(Object.entries(tokens).map(([key, value]) => [`--${key}`, value])),
    "--radius": `${radius}rem`,
  };
}

/** Write a theme (+ corner radius) to the document root as CSS variables. */
export function applyTheme(tokens: ThemeTokens, radius = 0.5): void {
  const root = document.documentElement;
  for (const [key, value] of Object.entries(themeVars(tokens, radius))) {
    root.style.setProperty(key, value);
  }
}
