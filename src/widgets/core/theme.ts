// Theme tokens: surfaces, skins, state colours, text colours, colour ramps, skin context and tone helpers.
import { createContext, useContext, type CSSProperties } from "react";
import { clamp } from "./data";
import { BASE_SURFACES, DEFAULT_SURFACE, LEGACY_SURFACES, type SurfaceDef, type SurfaceTone } from "./surfaces";
import { defaultSkin } from "./skins/default";
import { tuiSkin } from "./skins/tui";
import { macosSkin } from "./skins/macos";
import { fluentSkin } from "./skins/fluent";
import { hudSkin } from "./skins/hud";
import { inkSkin } from "./skins/ink";
import { retroSkin } from "./skins/retro";
import { iosSkin } from "./skins/ios";
import { androidSkin } from "./skins/android";
import { synthSkin } from "./skins/synth";
import { brutalSkin } from "./skins/brutal";
import { cyberSkin } from "./skins/cyber";
import { nixieSkin } from "./skins/nixie";
import { instrumentSkin } from "./skins/instrument";
import type { SkinContext, SkinPack, SkinTokens, Tone } from "./types";

/* ───────── shell ───────── */
// Skin packs: one file per skin in core/skins/. Order = picker order.
export const SKIN_PACKS: SkinPack[] = [defaultSkin, tuiSkin, macosSkin, fluentSkin, hudSkin, inkSkin, retroSkin, iosSkin, androidSkin, synthSkin, brutalSkin, cyberSkin, nixieSkin, instrumentSkin];
// Skin-native surfaces are all dark materials. The app's materials go last so their names always win.
const SKIN_SURFACES: Record<string, SurfaceDef> = Object.fromEntries(
  SKIN_PACKS.flatMap((p) => Object.entries(p.surfaces).map(([name, s]) => [name, { ...s, tone: "dark" as const }]))
);
export const SURFACES: Record<string, SurfaceDef> = { ...BASE_SURFACES, ...SKIN_SURFACES, ...LEGACY_SURFACES };
export const SURFACE_NAMES = Object.keys(SURFACES);
export const SKINS: Record<string, Partial<SkinTokens>> = Object.fromEntries(SKIN_PACKS.map((p) => [p.name, p.skin]));
export const SKIN_NAMES = Object.keys(SKINS);

/**
 * The surface a widget draws: a registry name, `auto` = the skin's own (or `studio` for the
 * studio variant, `solid` without one), unset = the app default (`glass`). Unknown names fall
 * back to the default too.
 */
export function resolveSurface(surface: string | undefined, skin: string | undefined, studio = false): SurfaceDef {
  const sk = SKINS[skin ?? "default"] ?? SKINS.default;
  const name = !surface ? DEFAULT_SURFACE : surface === "auto" ? sk.surface ?? (studio ? "studio" : "solid") : surface;
  return SURFACES[name] ?? SURFACES[DEFAULT_SURFACE];
}

/* ───────── text colours (decision 5) ─────────
   The shell sets these on its root from the surface's tone; views and primitives read them, so
   text stays legible on light materials and follows the theme on the theme surface. */
export type TextVars = Record<"--w-fg" | "--w-muted" | "--w-faint" | "--w-track", string> & Partial<Record<"--w-warn" | "--w-crit", string>>;
export const TEXT_VARS: Record<SurfaceTone, TextVars> = {
  dark: { "--w-fg": "#f4f4f5", "--w-muted": "#a1a1aa", "--w-faint": "#71717a", "--w-track": "rgba(255,255,255,.07)" },
  // light and theme surfaces darken the warn / crit text so it keeps contrast (dark surfaces use STATE as is)
  light: { "--w-fg": "#18181b", "--w-muted": "#52525b", "--w-faint": "#71717a", "--w-track": "rgba(24,24,27,.1)", "--w-warn": "#a15c07", "--w-crit": "#c4261d" },
  theme: {
    "--w-fg": "hsl(var(--card-foreground))",
    "--w-muted": "hsl(var(--muted-foreground))",
    "--w-faint": "color-mix(in oklab, hsl(var(--muted-foreground)) 80%, transparent)",
    "--w-track": "color-mix(in oklab, hsl(var(--card-foreground)) 9%, transparent)",
    "--w-warn": "color-mix(in oklab, #EDB232 60%, hsl(var(--card-foreground)))",
    "--w-crit": "color-mix(in oklab, #F2665E 60%, hsl(var(--card-foreground)))",
  },
};
/** The text variables for a tone; the look's text / secondary text colours override fg / muted. */
export function textVars(tone: SurfaceTone, colors?: { textColor?: string; mutedColor?: string }): CSSProperties {
  const v: Record<string, string> = { ...TEXT_VARS[tone] };
  if (colors?.textColor) v["--w-fg"] = colors.textColor;
  if (colors?.mutedColor) v["--w-muted"] = colors.mutedColor;
  return v as CSSProperties;
}

// Instrument palette, usable by any widget: ok / warn / crit / muted fills
export const INSTR = { card: "#161A20", muted: "#20252D", mutedFg: "#8D96A4", border: "#29303A", primary: "#7D95FF", chart2: "#3FC4D0", ok: "#3CC97F", warn: "#EDB232", crit: "#F2665E" };
/* Colour ramps for heatmaps & visualisers. rampColor(t 0-1, name, accentHex) → css rgb() */
export const RAMPS: Record<string, string[] | null> = {
  accent: null,
  thermal: ["#1e3a8a", "#0ea5e9", "#22c55e", "#facc15", "#f97316", "#ef4444"],
  viridis: ["#440154", "#3b528b", "#21918c", "#5ec962", "#fde725"],
  magma: ["#000004", "#3b0f70", "#8c2981", "#de4968", "#fe9f6d", "#fcfdbf"],
  ice: ["#0b1020", "#1e3a5f", "#2f7fb5", "#7dd3fc", "#f0f9ff"],
  synth: ["#12062a", "#6b1ea8", "#ff4fd8", "#ff9e5e", "#ffe66d"],
  mono: ["#18181b", "#52525b", "#a1a1aa", "#fafafa"],
};
const hex = (h: string): number[] => {
  const s = String(h).replace("#", "");
  const f = s.length === 3 ? s.split("").map((c) => c + c).join("") : s;
  return [0, 2, 4].map((i) => parseInt(f.slice(i, i + 2), 16) || 0);
};
export const rampColor = (t: number, name = "accent", accentHex = "#34d399"): string => {
  t = Math.min(1, Math.max(0, t));
  const stops = RAMPS[name] ?? ["#18181c", accentHex];
  const x = t * (stops.length - 1),
    i = Math.min(stops.length - 2, Math.floor(x)),
    f = x - i;
  const a = hex(stops[i]),
    b = hex(stops[i + 1]);
  return `rgb(${a.map((v, j) => Math.round(v + (b[j] - v) * f)).join(",")})`;
};
// resolve the live --accent of an element (for canvas drawing)
export const accentOf = (el: Element | null, fb = "#34d399"): string =>
  (el && getComputedStyle(el).getPropertyValue("--accent").trim()) || fb;
export const GRAPH_STYLES = ["area", "line", "step", "bars", "dots", "braille"];
export const METER_STYLES = ["bar", "pill", "segments", "blocks", "hair", "wave", "square"];
export const SkinCtx = createContext<SkinContext>({ skin: "default", graph: "area", meter: "bar", stroke: 1 });
export const useSkin = (): SkinContext => useContext(SkinCtx);
// Skin-aware numeral style for widgets that draw big numbers directly
export const numFont = (sk: Partial<SkinTokens>, weight = 700): CSSProperties => ({
  fontFamily: sk.num,
  fontWeight: sk.numWeight ?? weight,
  fontStretch: sk.numStretch,
  ...(sk.numGlow ? { textShadow: "0 0 4px var(--accent), 0 0 14px var(--accent)" } : null),
});
// Semantic state colours (stay meaningful under every skin)
export const STATE = { ok: "#3CC97F", warn: "#EDB232", crit: "#F2665E", none: "rgba(255,255,255,0.07)" } as const;
// Tone → colour: ok follows the accent; warn / crit are the semantic STATE colours.
// On light / theme surfaces the shell's --w-warn / --w-crit darken them for contrast.
export const TONES: Record<Tone | "muted", string> = { ok: "var(--accent)", warn: `var(--w-warn, ${STATE.warn})`, crit: `var(--w-crit, ${STATE.crit})`, muted: "#71717a" };
// 0-100 → colour for heatmaps. ramp 'accent' (accent intensity) or 'thermal' (blue → green → amber → red)
export const heat = (v: number, ramp = "accent"): string => {
  const t = clamp(v) / 100;
  return ramp === "accent" || !RAMPS[ramp] ? `color-mix(in oklab, var(--accent) ${8 + t * 92}%, #18181c)` : rampColor(t, ramp);
};
export const tone = (v: number, warn?: number, crit?: number): Tone =>
  Number.isFinite(v) && crit != null && v >= crit ? "crit" : Number.isFinite(v) && warn != null && v >= warn ? "warn" : "ok";
