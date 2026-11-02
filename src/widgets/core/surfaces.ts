// Generic surfaces (card materials) usable with any skin. Skin-native surfaces live in core/skins/<skin>.ts.
// Each entry: c = Tailwind classes, s = inline style, tone = which text colours read on it (see theme.ts).
// Accent-tinted ones use mix() so they follow --accent.
import { makeSurface, type ModernStyle, type Surface } from "@/components/surfaces";
import { surfaceBox } from "@/components/widget-style";
import { mix } from "./tokens";
import type { SurfaceSpec } from "./types";

/** Light text on a dark card, dark text on a light card, or the theme's own card text. */
export type SurfaceTone = "dark" | "light" | "theme";

export interface SurfaceDef extends SurfaceSpec {
  tone: SurfaceTone;
  /** The app's materials keep their colour set, so the shell can apply the look keys through `surfaceBox`. */
  colors?: Surface;
}

const dark = (c: string, s: SurfaceSpec["s"]): SurfaceDef => ({ c, s, tone: "dark" });

// The template's own `glass` is left out: the stored `glass` value is the app's material (below).
export const BASE_SURFACES: Record<string, SurfaceDef> = {
  solid: dark("border border-white/[0.06]", { background: "#141418" }),
  outline: dark("border border-white/15", { background: "transparent" }),
  flat: dark("", { background: "transparent" }),
  tinted: dark("border", { background: `linear-gradient(155deg, ${mix(22, "#141418")}, #121215 65%)`, borderColor: mix(28) }),
  aurora: dark("border border-white/[0.07]", { background: `radial-gradient(120% 90% at 0% 0%, ${mix(38)}, transparent 55%), radial-gradient(90% 80% at 100% 100%, color-mix(in oklab, #a78bfa 26%, transparent), transparent 60%), #0f0f13` }),
  neon: dark("border", { background: "#0a0a0d", borderColor: mix(80), boxShadow: `0 0 22px -6px ${mix(70)}, inset 0 0 22px -12px ${mix(80)}` }),
  holo: dark("border border-transparent", { background: "linear-gradient(#121215,#121215) padding-box, conic-gradient(from 210deg, var(--accent), #a78bfa, #f472b6, #fbbf24, var(--accent)) border-box" }),
  mesh: dark("border border-white/[0.06]", { background: "radial-gradient(rgba(255,255,255,.075) 1px, transparent 1.2px) 0 0/12px 12px, #121215" }),
  carbon: dark("border border-white/[0.06]", { background: "repeating-linear-gradient(45deg, #17171b 0 5px, #121215 5px 10px)" }),
  inset: dark("", { background: "#0e0e11", boxShadow: "inset 0 2px 8px rgba(0,0,0,.7), inset 0 -1px 0 rgba(255,255,255,.05), 0 1px 0 rgba(255,255,255,.04)" }),
  studio: dark("border", { background: "linear-gradient(160deg, rgba(255,255,255,.075), rgba(255,255,255,.022))", borderColor: "rgba(255,255,255,.08)" }),
  terminal: dark("border font-mono", { background: "repeating-linear-gradient(0deg, rgba(255,255,255,.03) 0 1px, transparent 1px 3px), #060807", borderColor: mix(30), textShadow: `0 0 8px ${mix(45)}`, fontSizeAdjust: 0.4 }),
};

const LEGACY_TONES: Record<ModernStyle, SurfaceTone> = {
  glass: "dark",
  "matte-light": "light",
  "matte-dark": "dark",
  theme: "theme",
};

const legacy = (name: ModernStyle): SurfaceDef => {
  const colors = makeSurface(name, null);
  // surfaceBox with no look = today's box: background, text colour and the 1px edge.
  return { c: "", s: surfaceBox(colors, undefined), tone: LEGACY_TONES[name], colors };
};

/** The app's materials under their stored names; they render exactly as the modern widgets draw them. */
export const LEGACY_SURFACES: Record<ModernStyle, SurfaceDef> = {
  glass: legacy("glass"),
  "matte-light": legacy("matte-light"),
  "matte-dark": legacy("matte-dark"),
  theme: legacy("theme"),
};

/** The surface used when none is set (decision 4: stored configs keep today's default). */
export const DEFAULT_SURFACE = "glass";
