/**
 * The widget surfaces: the colors a widget's box, text, tracks and fills
 * are drawn with. "glass" / "matte-light" / "matte-dark" are fixed
 * palettes (optionally tinted, e.g. by cover art); "theme" is built from
 * the theme tokens, so it follows the theme preset (light or dark) and the
 * re-scoped tokens of the widget (`tokenScope`).
 */
export type ModernStyle = "glass" | "matte-light" | "matte-dark" | "theme";

export type RGB = [number, number, number];

const mix = (a: RGB, b: RGB, t: number): RGB => [
  Math.round(a[0] + (b[0] - a[0]) * t),
  Math.round(a[1] + (b[1] - a[1]) * t),
  Math.round(a[2] + (b[2] - a[2]) * t),
];
export const lighten = (c: RGB, t: number) => mix(c, [255, 255, 255], t);
export const darken = (c: RGB, t: number) => mix(c, [0, 0, 0], t);
const rgba = (c: RGB, a = 1) =>
  a >= 1 ? `rgb(${c[0]}, ${c[1]}, ${c[2]})` : `rgba(${c[0]}, ${c[1]}, ${c[2]}, ${a})`;

export interface Surface {
  background: string;
  fg: string;
  muted: string;
  track: string;
  fill: string;
  ring: string;
}

/** The surface from the theme tokens (no tint: the theme is the color). */
const THEME_SURFACE: Surface = {
  background: "hsl(var(--card) / 0.85)",
  fg: "hsl(var(--card-foreground))",
  muted: "hsl(var(--muted-foreground))",
  track: "hsl(var(--muted))",
  fill: "hsl(var(--primary))",
  ring: "hsl(var(--border))",
};

/** Shared surface builder (glass / matte light / matte dark / theme) for the modern widgets. */
export function makeSurface(style: ModernStyle, tint: RGB | null): Surface {
  return withTextOverrides(style === "theme" ? THEME_SURFACE : buildSurface(style, tint));
}

/**
 * Text colors as `var(--wp-fg, …)` / `var(--wp-muted, …)`, so the widget's
 * "Text color" options (set by ModernChrome) override every surface.
 */
function withTextOverrides(s: Surface): Surface {
  return { ...s, fg: `var(--wp-fg, ${s.fg})`, muted: `var(--wp-muted, ${s.muted})` };
}

function buildSurface(style: ModernStyle, tint: RGB | null): Surface {
  if (style === "matte-light") {
    const base = tint ? lighten(tint, 0.74) : ([244, 244, 245] as RGB);
    return {
      background: rgba(base),
      fg: "rgb(24, 24, 27)",
      muted: "rgba(24, 24, 27, 0.72)",
      track: "rgba(24, 24, 27, 0.16)",
      fill: rgba(tint ? darken(tint, 0.12) : ([113, 113, 122] as RGB)),
      ring: "rgba(255, 255, 255, 0.4)",
    };
  }
  if (style === "matte-dark") {
    const base = tint ? darken(tint, 0.72) : ([24, 24, 27] as RGB);
    return {
      background: rgba(base),
      fg: "rgb(250, 250, 250)",
      muted: "rgba(250, 250, 250, 0.6)",
      track: "rgba(255, 255, 255, 0.14)",
      fill: rgba(tint ? lighten(tint, 0.4) : ([161, 161, 170] as RGB)),
      ring: "rgba(255, 255, 255, 0.1)",
    };
  }
  // glass
  if (tint) {
    return {
      background: `linear-gradient(155deg, ${rgba(lighten(tint, 0.15), 0.45)} 0%, ${rgba(
        darken(tint, 0.6),
        0.8
      )} 100%)`,
      fg: "rgb(250, 250, 250)",
      muted: "rgba(250, 250, 250, 0.65)",
      track: "rgba(255, 255, 255, 0.16)",
      fill: rgba(lighten(tint, 0.3)),
      ring: "rgba(255, 255, 255, 0.12)",
    };
  }
  return {
    background:
      "linear-gradient(155deg, rgba(24, 24, 27, 0.85) 0%, rgba(24, 24, 27, 0.55) 100%)",
    fg: "rgb(250, 250, 250)",
    muted: "rgba(250, 250, 250, 0.6)",
    track: "rgba(255, 255, 255, 0.14)",
    fill: "rgb(52, 211, 153)",
    ring: "rgba(255, 255, 255, 0.1)",
  };
}

/**
 * A Vibrant-style palette of roles sampled from the cover art: the dominant
 * saturated color (`vibrant`, the accent) plus its light/dark variants for
 * the surface base. Built saturation-weighted (see `computeArtTint`), not a
 * flat pixel average, so a cover with one strong color tints with that
 * color instead of a muddy gray average.
 */
export interface ArtTint {
  vibrant: RGB;
  light: RGB;
  dark: RGB;
}

/**
 * The surface built from the cover-art palette roles — the same mixes as
 * `makeSurface`, driven by the palette instead of a single average color.
 * The theme surface takes no tint.
 */
export function makeSurfacePalette(style: ModernStyle, tint: ArtTint): Surface {
  return withTextOverrides(style === "theme" ? THEME_SURFACE : buildSurfacePalette(style, tint));
}

function buildSurfacePalette(style: ModernStyle, tint: ArtTint): Surface {
  if (style === "matte-light") {
    return {
      background: rgba(tint.light),
      fg: "rgb(24, 24, 27)",
      muted: "rgba(24, 24, 27, 0.72)",
      track: "rgba(24, 24, 27, 0.16)",
      fill: rgba(darken(tint.vibrant, 0.12)),
      ring: "rgba(255, 255, 255, 0.4)",
    };
  }
  if (style === "matte-dark") {
    return {
      background: rgba(tint.dark),
      fg: "rgb(250, 250, 250)",
      muted: "rgba(250, 250, 250, 0.6)",
      track: "rgba(255, 255, 255, 0.14)",
      fill: rgba(lighten(tint.vibrant, 0.4)),
      ring: "rgba(255, 255, 255, 0.1)",
    };
  }
  // glass
  return {
    background: `linear-gradient(155deg, ${rgba(lighten(tint.vibrant, 0.15), 0.45)} 0%, ${rgba(
      tint.dark,
      0.8
    )} 100%)`,
    fg: "rgb(250, 250, 250)",
    muted: "rgba(250, 250, 250, 0.65)",
    track: "rgba(255, 255, 255, 0.16)",
    fill: rgba(lighten(tint.vibrant, 0.3)),
    ring: "rgba(255, 255, 255, 0.12)",
  };
}

const CARD_SURFACES: readonly string[] = ["glass", "matte-light", "matte-dark", "theme"];

/**
 * The surface of a plain card (the legacy modules, the catch-all cards):
 * one of the widget surfaces, the theme surface for anything else (a
 * panel-only card choice reaching it from the global style).
 */
export function surfaceColors(surface: unknown): Surface {
  return makeSurface(CARD_SURFACES.includes(surface as string) ? (surface as ModernStyle) : "theme", null);
}

/**
 * The tokens of a fixed-palette surface, as HSL triplets for the theme
 * variables: content that reads the theme (`text-foreground`, the
 * `bg-secondary` chips, …) stays legible on it. The theme surface needs none.
 */
const SURFACE_TOKENS: Record<Exclude<ModernStyle, "theme">, { fg: string; muted: string; chip: string }> = {
  glass: { fg: "0 0% 98%", muted: "0 0% 98% / 0.6", chip: "240 3.7% 15.9%" },
  "matte-dark": { fg: "0 0% 98%", muted: "0 0% 98% / 0.6", chip: "240 3.7% 15.9%" },
  "matte-light": { fg: "240 6% 10%", muted: "240 6% 10% / 0.72", chip: "240 5% 88%" },
};

/**
 * Theme tokens for a card on `surface`: its chip background, and its text
 * colors unless the user picked them (then the widget's re-scoped tokens
 * stand).
 */
export function surfaceTokens(
  surface: unknown,
  chrome: { textColor?: string; mutedColor?: string } | undefined
): Record<string, string> {
  const tokens = SURFACE_TOKENS[surface as keyof typeof SURFACE_TOKENS];
  if (!tokens) return {};
  const v: Record<string, string> = { "--secondary": tokens.chip, "--muted": tokens.chip };
  if (!chrome?.textColor) {
    v["--foreground"] = tokens.fg;
    v["--card-foreground"] = tokens.fg;
  }
  if (!chrome?.mutedColor) v["--muted-foreground"] = tokens.muted;
  return v;
}
