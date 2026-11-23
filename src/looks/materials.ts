// The T2 material registry (_docs/investigations/look-system.md section 9.3, D10): every card material under its stored
// name, and the one resolver every consumer draws a card through. The 27 names stay valid ids (saved data).
import type { CSSProperties } from "react";
import { type ModernChrome, SCRIM } from "@/components/modern-chrome";
import { cappedBlur, fadeColors, surfaceBox } from "@/components/widget-style";
import { mix } from "@/widgets/core/tokens";
import { RAMP_START } from "./data-viz";
import { DEFAULT_ACCENT_RGB } from "./palette";

/* ───────── the app's materials (glass, matte light and dark, theme), optionally tinted by cover art ───────── */

/**
 * The app's materials: "glass" / "matte-light" / "matte-dark" are fixed palettes (optionally tinted, e.g. by cover
 * art); "theme" is built from the theme tokens, so it follows the theme preset (light or dark) and the re-scoped
 * tokens of the widget (`tokenScope`).
 */
export type ModernStyle = "glass" | "matte-light" | "matte-dark" | "theme";

export type RGB = [number, number, number];

const blend = (a: RGB, b: RGB, t: number): RGB => [
  Math.round(a[0] + (b[0] - a[0]) * t),
  Math.round(a[1] + (b[1] - a[1]) * t),
  Math.round(a[2] + (b[2] - a[2]) * t),
];
export const lighten = (c: RGB, t: number) => blend(c, [255, 255, 255], t);
export const darken = (c: RGB, t: number) => blend(c, [0, 0, 0], t);
const rgba = (c: RGB, a = 1) => (a >= 1 ? `rgb(${c[0]}, ${c[1]}, ${c[2]})` : `rgba(${c[0]}, ${c[1]}, ${c[2]}, ${a})`);

/** The colours a widget's box, text, tracks and fills are drawn with on one of the app's materials. */
export interface Surface {
  background: string;
  fg: string;
  muted: string;
  track: string;
  fill: string;
  ring: string;
}

/** The surface from the theme tokens (no tint: the theme is the colour). */
const THEME_SURFACE: Surface = {
  background: "hsl(var(--card) / 0.85)",
  fg: "hsl(var(--card-foreground))",
  muted: "hsl(var(--muted-foreground))",
  track: "hsl(var(--muted))",
  fill: "hsl(var(--primary))",
  ring: "hsl(var(--border))",
};

/** Text colours as `var(--w-fg, …)` / `var(--w-muted, …)`, so the look's text colours override every material. */
const withTextOverrides = (s: Surface): Surface => ({ ...s, fg: `var(--w-fg, ${s.fg})`, muted: `var(--w-muted, ${s.muted})` });

/** The colours of one of the app's materials, tinted by one colour (or not). */
export function makeSurface(style: ModernStyle, tint: RGB | null): Surface {
  return withTextOverrides(style === "theme" ? THEME_SURFACE : buildSurface(style, tint));
}

function buildSurface(style: ModernStyle, tint: RGB | null): Surface {
  if (style === "matte-light") {
    const base = tint ? lighten(tint, 0.74) : ([244, 244, 245] as RGB);
    return { background: rgba(base), fg: "rgb(24, 24, 27)", muted: "rgba(24, 24, 27, 0.72)", track: "rgba(24, 24, 27, 0.16)", fill: rgba(tint ? darken(tint, 0.12) : ([113, 113, 122] as RGB)), ring: "rgba(255, 255, 255, 0.4)" };
  }
  if (style === "matte-dark") {
    const base = tint ? darken(tint, 0.72) : ([24, 24, 27] as RGB);
    return { background: rgba(base), fg: "rgb(250, 250, 250)", muted: "rgba(250, 250, 250, 0.6)", track: "rgba(255, 255, 255, 0.14)", fill: rgba(tint ? lighten(tint, 0.4) : ([161, 161, 170] as RGB)), ring: "rgba(255, 255, 255, 0.1)" };
  }
  if (tint) {
    return {
      background: `linear-gradient(155deg, ${rgba(lighten(tint, 0.15), 0.45)} 0%, ${rgba(darken(tint, 0.6), 0.8)} 100%)`,
      fg: "rgb(250, 250, 250)",
      muted: "rgba(250, 250, 250, 0.65)",
      track: "rgba(255, 255, 255, 0.16)",
      fill: rgba(lighten(tint, 0.3)),
      ring: "rgba(255, 255, 255, 0.12)",
    };
  }
  return {
    background: "linear-gradient(155deg, rgba(24, 24, 27, 0.85) 0%, rgba(24, 24, 27, 0.55) 100%)",
    fg: "rgb(250, 250, 250)",
    muted: "rgba(250, 250, 250, 0.6)",
    track: "rgba(255, 255, 255, 0.14)",
    fill: rgba(DEFAULT_ACCENT_RGB),
    ring: "rgba(255, 255, 255, 0.1)",
  };
}

/**
 * A Vibrant-style palette of roles sampled from the cover art: the dominant saturated colour (`vibrant`, the accent)
 * plus its light / dark variants for the material's base. Built saturation-weighted (see `computeArtTint`), so a cover
 * with one strong colour tints with that colour instead of a muddy grey average.
 */
export interface ArtTint {
  vibrant: RGB;
  light: RGB;
  dark: RGB;
}

/** The app's material built from the cover-art palette roles: the same mixes as `makeSurface`. Theme takes no tint. */
export function makeSurfacePalette(style: ModernStyle, tint: ArtTint): Surface {
  return withTextOverrides(style === "theme" ? THEME_SURFACE : buildSurfacePalette(style, tint));
}

function buildSurfacePalette(style: ModernStyle, tint: ArtTint): Surface {
  if (style === "matte-light")
    return { background: rgba(tint.light), fg: "rgb(24, 24, 27)", muted: "rgba(24, 24, 27, 0.72)", track: "rgba(24, 24, 27, 0.16)", fill: rgba(darken(tint.vibrant, 0.12)), ring: "rgba(255, 255, 255, 0.4)" };
  if (style === "matte-dark")
    return { background: rgba(tint.dark), fg: "rgb(250, 250, 250)", muted: "rgba(250, 250, 250, 0.6)", track: "rgba(255, 255, 255, 0.14)", fill: rgba(lighten(tint.vibrant, 0.4)), ring: "rgba(255, 255, 255, 0.1)" };
  return {
    background: `linear-gradient(155deg, ${rgba(lighten(tint.vibrant, 0.15), 0.45)} 0%, ${rgba(tint.dark, 0.8)} 100%)`,
    fg: "rgb(250, 250, 250)",
    muted: "rgba(250, 250, 250, 0.65)",
    track: "rgba(255, 255, 255, 0.16)",
    fill: rgba(lighten(tint.vibrant, 0.3)),
    ring: "rgba(255, 255, 255, 0.12)",
  };
}

/* ───────── the registry ───────── */

/** Light text on a dark card, dark text on a light card, or the theme's own card text. */
export type SurfaceTone = "dark" | "light" | "theme";
export type MaterialKind = "solid" | "gradient" | "glass" | "lcd";

export interface Material {
  /** The stored name. */
  id: string;
  kind: MaterialKind;
  tone: SurfaceTone;
  /** Where the name comes from: the generic set, a skin's own card, the app's materials, or a sample theme's card. */
  origin: "base" | "skin" | "app" | "sample";
  /**
   * The flat colour a target that cannot draw the material uses (the InfoPanel export); null only when see-through.
   * Unset on a material whose background is one colour already: that is its export.
   */
  export?: string | null;
  /** The base colour data-viz ramps start from (`--w-fill`); unset = the export colour (see-through: transparent). */
  fill?: string;
  /** Classes: the CSS border takes layout room, so the edge stays a class. */
  c: string;
  /** The paint. */
  s: CSSProperties;
  /** The app's materials keep their colour set, so the look keys apply through `surfaceBox`. */
  colors?: Surface;
}

export type Paint = Omit<Material, "id" | "tone" | "origin"> & { tone?: SurfaceTone };

// The optional layers are in the paint as CSS: patterns (mesh dots, carbon stripes, terminal scanlines, hud and synth
// grids) and radial spots (aurora, mica, hud, cyber, nixie). Kinds per section 8 G.2 of the investigation.
export const m = (kind: MaterialKind, c: string, s: CSSProperties, exp?: string): Paint => ({ kind, c, s, ...(exp ? { export: exp } : null) });

// The template's own `glass` is left out: the stored `glass` value is the app's material (below).
const BASE: Record<string, Paint> = {
  solid: m("solid", "border border-white/[0.06]", { background: "#141418" }),
  outline: m("solid", "border border-white/15", { background: "transparent" }),
  flat: m("solid", "", { background: "transparent" }),
  tinted: m("gradient", "border", { background: `linear-gradient(155deg, ${mix(22, "#141418")}, #121215 65%)`, borderColor: mix(28) }, "color-mix(in srgb, var(--w-accent) 5%, #131316)"),
  aurora: m("gradient", "border border-white/[0.07]", { background: `radial-gradient(120% 90% at 0% 0%, ${mix(38)}, transparent 55%), radial-gradient(90% 80% at 100% 100%, color-mix(in oklab, #a78bfa 26%, transparent), transparent 60%), #0f0f13` }, "#0f0f13"),
  neon: m("solid", "border", { background: "#0a0a0d", borderColor: mix(80), boxShadow: `0 0 22px -6px ${mix(70)}, inset 0 0 22px -12px ${mix(80)}` }),
  holo: m("solid", "border border-transparent", { background: "linear-gradient(#121215,#121215) padding-box, conic-gradient(from 210deg, var(--w-accent), #a78bfa, #f472b6, #fbbf24, var(--w-accent)) border-box" }, "#121215"),
  mesh: m("solid", "border border-white/[0.06]", { background: "radial-gradient(rgba(255,255,255,.075) 1px, transparent 1.2px) 0 0/12px 12px, #121215" }, "#121215"),
  carbon: m("solid", "border border-white/[0.06]", { background: "repeating-linear-gradient(45deg, #17171b 0 5px, #121215 5px 10px)" }, "#151518"),
  inset: m("solid", "", { background: "#0e0e11", boxShadow: "inset 0 2px 8px rgba(0,0,0,.7), inset 0 -1px 0 rgba(255,255,255,.05), 0 1px 0 rgba(255,255,255,.04)" }),
  studio: m("glass", "border", { background: "linear-gradient(160deg, rgba(255,255,255,.075), rgba(255,255,255,.022))", borderColor: "rgba(255,255,255,.08)" }, "rgba(255, 255, 255, 0.05)"),
  terminal: m("solid", "border font-mono", { background: "repeating-linear-gradient(0deg, rgba(255,255,255,.03) 0 1px, transparent 1px 3px), #060807", borderColor: mix(30), textShadow: `0 0 8px ${mix(45)}`, fontSizeAdjust: 0.4 }, "#060807"),
};

// The skins' own cards, in skin order (core/skins/*: each skin names its card as `skin.surface`).
const SKIN: Record<string, Paint> = {
  tui: m("solid", "", { background: "#0b0b0d" }),
  vibrancy: m("glass", "border border-white/[0.08]", { background: "linear-gradient(180deg, rgba(62,62,68,.66), rgba(38,38,42,.66))", boxShadow: "0 12px 30px -12px rgba(0,0,0,.7), inset 0 1px 0 rgba(255,255,255,.1)", backdropFilter: `blur(${cappedBlur(40)})`, WebkitBackdropFilter: `blur(${cappedBlur(40)})` }, "rgba(50, 50, 55, 0.9)"),
  mica: m("gradient", "border border-white/[0.07]", { background: `radial-gradient(140% 120% at 0% 0%, ${mix(11)}, transparent 60%), #202023`, boxShadow: "inset 0 1px 0 rgba(255,255,255,.05)" }, "#202023"),
  hud: m("solid", "", { background: `repeating-linear-gradient(90deg, ${mix(8)} 0 1px, transparent 1px 22px), repeating-linear-gradient(0deg, ${mix(8)} 0 1px, transparent 1px 22px), radial-gradient(120% 100% at 50% 0%, ${mix(10)}, transparent 70%), #07090b`, boxShadow: `inset 0 0 0 1px ${mix(20)}` }, "#07090b"),
  ios: m("solid", "", { background: "#1c1c1e", boxShadow: "0 1px 0 rgba(255,255,255,.04) inset, 0 18px 40px -18px rgba(0,0,0,.8)" }),
  material: m("solid", "", { background: `linear-gradient(${mix(15, "#1b1b1f")}, ${mix(15, "#1b1b1f")})` }, "color-mix(in srgb, var(--w-accent) 15%, #1b1b1f)"),
  synth: m("gradient", "border", { background: "linear-gradient(to top, rgba(255,79,216,.22) 0 1px, transparent 1px) 0 100%/100% 14px repeat-y, linear-gradient(90deg, rgba(56,232,255,.10) 0 1px, transparent 1px) 0 0/22px 100%, linear-gradient(180deg, #12062a 0%, #2a0b3d 62%, #45104a 100%)", borderColor: "rgba(255,79,216,.35)", boxShadow: "0 0 24px -8px rgba(255,79,216,.55)" }, "#2b0c3d"),
  // The hard accent offset is painted inside the edge (an inset bar on the right and bottom), so the card keeps its box (G2).
  brutal: m("solid", "border-2", { background: "#121212", borderColor: "#f4f4f5", boxShadow: "inset -5px -5px 0 0 var(--w-accent)" }),
  cyber: m("solid", "", { background: `linear-gradient(135deg, ${mix(18)} 0 10%, transparent 10%), linear-gradient(#0e0e0b, #0e0e0b)`, clipPath: "polygon(0 0, calc(100% - 18px) 0, 100% 18px, 100% 100%, 18px 100%, 0 calc(100% - 18px))", boxShadow: `inset 0 0 0 1px ${mix(55)}` }, "#0e0e0b"),
  nixie: m("gradient", "border border-black", { background: "radial-gradient(120% 90% at 50% 0%, rgba(255,138,61,.10), transparent 60%), linear-gradient(180deg, #1a1210, #0c0907)", boxShadow: "inset 0 1px 0 rgba(255,255,255,.06), inset 0 -20px 40px -20px rgba(0,0,0,.9)" }, "#150e0b"),
  instrument: m("solid", "border", { background: "#161A20", borderColor: "#29303A" }),
};

const app = (name: ModernStyle, kind: MaterialKind, tone: SurfaceTone, exp?: string, fill?: string): Paint => {
  const colors = makeSurface(name, null);
  // surfaceBox with no look = today's box: background, text colour and the 1px edge.
  return { ...m(kind, "", surfaceBox(colors, undefined), exp), tone, colors, ...(fill ? { fill } : null) };
};

/** The app's materials under their stored names; they render exactly as the modern widgets draw them. */
const APP: Record<ModernStyle, Paint> = {
  // D10: Classic glass is a 0.85 to 0.55 tint of rgb(24 24 27) with no blur; its ramps start from that colour.
  glass: app("glass", "glass", "dark", "rgba(24, 24, 27, 0.9)", RAMP_START),
  "matte-light": app("matte-light", "solid", "light"),
  "matte-dark": app("matte-dark", "solid", "dark"),
  theme: app("theme", "solid", "theme"),
};

const entries = (origin: Material["origin"], set: Record<string, Paint>) => Object.entries(set).map(([id, p]) => [id, { id, origin, tone: "dark" as const, ...p }] as const);

/** Every material by its stored name. The app's materials go last so their names always win. */
export const MATERIALS: Record<string, Material> = Object.fromEntries([...entries("base", BASE), ...entries("skin", SKIN), ...entries("app", APP)]);

/** The material used when none is set (decision 4: stored configs keep today's default). */
export const DEFAULT_MATERIAL = "glass";

/* ───────── the resolver ───────── */

const DEFAULT_EDGE = "rgba(255, 255, 255, 0.1)";

/**
 * `fadeColors` for template backgrounds: rgb / hex / theme colours have their alpha scaled, and a `color-mix()`
 * (accent tints) is mixed with transparent instead, since its colours are not literals.
 */
export function fadeBackground(background: string, factor: number): string {
  const pct = Math.round(Math.min(1, Math.max(0, factor)) * 100);
  return background
    .split(/(color-mix\((?:[^()]|\([^()]*\))*\))/g)
    .map((part, i) => (i % 2 ? `color-mix(in oklab, ${part} ${pct}%, transparent)` : fadeColors(part, factor)))
    .join("");
}

/**
 * The material's box with the look's border, glow, opacity and blur. The app's materials go through `surfaceBox`
 * exactly as the modern widgets draw them; the others keep their own style and gain only what the look sets (the edge
 * becomes an inset shadow of the chosen width).
 */
function boxOf(mat: Material, chrome: ModernChrome | undefined, colors: Surface | undefined): CSSProperties {
  if (colors) {
    const { color: _color, ...box } = surfaceBox(colors, chrome);
    return box;
  }
  const s = mat.s;
  if (!chrome) return s;
  const edge = chrome.borderWidth !== undefined || !!chrome.borderColor || (!!chrome.glow && chrome.glow !== "none");
  const box = surfaceBox({ background: String(s.background ?? ""), fg: "", ring: String(s.borderColor ?? DEFAULT_EDGE) }, chrome);
  const faded = (chrome.surfaceOpacity ?? 1) < 1 && s.background;
  // A border-box background (holo) draws its ring as the CSS border, so that border stays.
  const ringBorder = String(s.background ?? "").includes("border-box");
  return {
    ...s,
    ...(faded ? { background: fadeBackground(String(s.background), chrome.surfaceOpacity!) } : null),
    ...(edge ? { boxShadow: [s.boxShadow, box.boxShadow].filter(Boolean).join(", ") } : null),
    ...(chrome.borderWidth !== undefined && !ringBorder ? { borderWidth: 0 } : null),
    ...(chrome.blur !== undefined ? { backdropFilter: box.backdropFilter, WebkitBackdropFilter: box.WebkitBackdropFilter } : null),
  };
}

/** The scrim over a background image: it darkens a dark card and lightens a light one, like the text. */
const scrimOf = (tone: SurfaceTone): string => (tone === "dark" ? "rgba(0, 0, 0, 0.45)" : tone === "light" ? "rgba(255, 255, 255, 0.45)" : SCRIM);

/** The colour that hides what is behind a header patch: the material's own background when flat. */
function patchOf(background: unknown, tone: SurfaceTone): string {
  const bg = String(background ?? "");
  if (bg && !bg.includes("gradient(")) return bg;
  return tone === "light" ? "#f4f4f5" : tone === "theme" ? "hsl(var(--card))" : "#0b0b0d";
}

/** The material's export colour: its own, else its background when that is one colour, else none. */
export function exportOf(mat: Material): string | null {
  if (mat.export !== undefined) return mat.export;
  const bg = String(mat.s.background ?? "");
  return bg && bg !== "transparent" && !bg.includes("gradient(") ? bg : null;
}

/** A material resolved for one card: what every consumer draws it with. */
export interface ResolvedMaterial {
  id: string;
  kind: MaterialKind;
  tone: SurfaceTone;
  /** The edge (and any font) classes. */
  className: string;
  /** The whole box as inline style, for a part drawn in the material (a pill, a key, a thumbnail, the island). */
  box: CSSProperties;
  /** The colour behind a header patch. */
  patch: string;
  /** The scrim over a background image. */
  scrim: string;
  /** The flat colour for export; null when see-through. */
  export: string | null;
  /** The colour data-viz ramps start from. */
  fill: string;
  /** A glass card with a backdrop blur: its background at `BLUR_FALLBACK_ALPHA`, drawn where the blur is off. */
  fallback?: string;
}

/** A glass card's least fill alpha where its backdrop blur is off (D10: 0.85 fails muted text over white, 0.90 passes). */
export const BLUR_FALLBACK_ALPHA = 0.9;

/** `background` with the alpha of every rgba() tint layer below `alpha` raised to it; a white highlight layer (every channel 200 or more) keeps its own. */
const opaquer = (background: string, alpha: number): string =>
  background.replace(/rgba\(([^,()]+),([^,()]+),([^,()]+),\s*([\d.]+)\s*\)/g, (all, r, g, b, a) =>
    Number(a) < alpha && Math.min(Number(r), Number(g), Number(b)) < 200 ? `rgba(${r},${g},${b}, ${alpha})` : all,
  );

/**
 * One card's material: `mat` with the look's border, glow, opacity and blur, and the colour set from the cover art
 * (`colors`, the app's materials only) when one is given.
 */
export function resolveMaterial(mat: Material, chrome?: ModernChrome, colors?: Surface): ResolvedMaterial {
  const box = boxOf(mat, chrome, colors ?? mat.colors);
  const opacity = chrome?.surfaceOpacity ?? 1;
  const exp = exportOf(mat);
  const raised = mat.kind === "glass" && opacity >= 1 && box.backdropFilter && box.backdropFilter !== "none" ? opaquer(String(box.background), BLUR_FALLBACK_ALPHA) : "";
  return {
    id: mat.id,
    kind: mat.kind,
    tone: mat.tone,
    className: mat.c,
    box,
    patch: patchOf(box.background, mat.tone),
    scrim: scrimOf(mat.tone),
    export: exp && opacity < 1 ? fadeBackground(exp, opacity) : exp,
    // A see-through material starts ramps from the old colour: a transparent start makes them translucent.
    fill: mat.fill ?? exp ?? RAMP_START,
    // A faded card keeps the opacity the look asked for; a card with no tint layer to raise has no fallback.
    ...(raised && raised !== String(box.background) ? { fallback: raised } : null),
  };
}

/**
 * The widget shell's style for a resolved material: the `--w-mat-*` variables the static `[data-mat]` rule in
 * `src/index.css` paints the card with, plus what the box sets that has no variable (an edge colour, a clip, a size).
 * Every variable is set, so a nested card never inherits its parent's.
 */
export function materialVars(r: ResolvedMaterial): CSSProperties {
  const { background, boxShadow, backdropFilter, WebkitBackdropFilter: _webkit, ...rest } = r.box;
  return {
    ...rest,
    "--w-mat-bg": background ?? "transparent",
    "--w-mat-shadow": boxShadow ?? "none",
    "--w-mat-blur": backdropFilter ?? "none",
    "--w-mat-export": r.export ?? "transparent",
    // The ramp start (looks/data-viz.ts RAMP_BASE). The light and theme text sets write their own after it.
    "--w-fill": r.fill,
    ...(r.fallback ? { "--w-mat-fallback": r.fallback } : null),
  } as CSSProperties;
}
