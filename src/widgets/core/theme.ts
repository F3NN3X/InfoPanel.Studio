// Theme tokens: surfaces, skins, state colours, text colours, colour ramps, skin context and tone helpers.
import { createContext, useContext, type CSSProperties } from "react";
import { RAMP_BASE, RAMP_START, RAMPS } from "@/looks/data-viz";
import { DARK_TEXT, DEFAULT_ACCENT } from "@/looks/palette";
import { LIGHT_FILL, STATUS, STATUS_LIGHT } from "@/looks/status";
import { DEFAULT_MATERIAL, MATERIALS, type Material, type SurfaceTone } from "@/looks/materials";
import { sampleCards } from "@/looks/sample-cards";
import { clamp } from "./data";
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
export const SURFACE_NAMES = Object.keys(MATERIALS);
export const SKINS: Record<string, Partial<SkinTokens>> = Object.fromEntries(SKIN_PACKS.map((p) => [p.name, p.skin]));
export const SKIN_NAMES = Object.keys(SKINS);

/**
 * The skin a Look draws its widgets in (config v17, D6): a skin's Look is named as the skin (the hidden `default` Look is the core Default skin); Classic, a sample Look and
 * an id this build doesn't know draw the Default skin (undefined, the shell's own choice).
 */
export const skinOfLook = (lookId: unknown): string | undefined => (Object.hasOwn(SKINS, lookId as string) ? (lookId as string) : undefined);

/**
 * The surface a widget draws: a registry name, `auto` = the skin's own (or `studio` for the
 * studio variant, `solid` without one), unset = the app default (`glass`); a `look-*` name is a sample theme's card. Unknown names fall
 * back to the default too.
 */
export function resolveSurface(surface: string | undefined, skin: string | undefined, studio = false): Material {
  const sk = SKINS[skin ?? "default"] ?? SKINS.default;
  const name = !surface ? DEFAULT_MATERIAL : surface === "auto" ? sk.surface ?? (studio ? "studio" : "solid") : surface;
  return MATERIALS[name] ?? sampleCards[name] ?? MATERIALS[DEFAULT_MATERIAL];
}

/* ───────── text colours (decision 5) ─────────
   The shell sets these on its root from the surface's tone; views and primitives read them, so
   text stays legible on light materials and follows the theme on the theme surface. */
export type TextVars = Record<"--w-fg" | "--w-muted" | "--w-faint" | "--w-track", string> & Partial<Record<"--w-ok" | "--w-master" | "--w-warn" | "--w-crit" | "--w-fill", string>>;
export const TEXT_VARS: Record<SurfaceTone, TextVars> = {
  dark: { "--w-fg": DARK_TEXT.fg, "--w-muted": DARK_TEXT.muted, "--w-faint": "#8a8a94", "--w-track": "rgba(255,255,255,.07)" },
  // light and theme surfaces darken the warn / crit text so it keeps contrast (dark surfaces use STATE as is)
  light: { "--w-fg": "#18181b", "--w-muted": "#52525b", "--w-faint": "#636366", "--w-track": "rgba(24,24,27,.1)", "--w-fill": LIGHT_FILL, "--w-ok": STATUS_LIGHT.ok, "--w-master": "#3f3f46", "--w-warn": STATUS_LIGHT.warn, "--w-crit": STATUS_LIGHT.crit },
  theme: {
    "--w-fg": "hsl(var(--card-foreground))",
    "--w-muted": "hsl(var(--muted-foreground))",
    "--w-faint": "hsl(var(--muted-foreground))",
    "--w-track": "color-mix(in oklab, hsl(var(--card-foreground)) 9%, transparent)",
    "--w-fill": "hsl(var(--card))",
    "--w-master": "hsl(var(--card-foreground))",
    "--w-warn": `color-mix(in oklab, ${STATUS.warn} 60%, hsl(var(--card-foreground)))`,
    "--w-crit": `color-mix(in oklab, ${STATUS.crit} 60%, hsl(var(--card-foreground)))`,
  },
};
/** The text variables for a tone; the look's text / secondary text colours override fg / muted, its status colours ok / warn / crit (L33). */
export function textVars(tone: SurfaceTone, colors?: { textColor?: string; mutedColor?: string; ok?: string; warn?: string; crit?: string }): CSSProperties {
  const v: Record<string, string> = { ...TEXT_VARS[tone] };
  if (colors?.textColor) v["--w-fg"] = colors.textColor;
  if (colors?.mutedColor) v["--w-muted"] = colors.mutedColor;
  for (const k of ["ok", "warn", "crit"] as const) if (colors?.[k]) v[`--w-${k}`] = colors[k]!;
  return v as CSSProperties;
}

/* Colour ramps for heatmaps & visualisers (stop lists in looks/data-viz.ts). rampColor(t 0-1, name, accentHex, base) → css rgb(); the accent ramp starts from `base`, the material fill */
export { RAMPS };
const hex = (h: string): number[] => {
  const s = String(h).replace("#", "");
  const f = s.length === 3 ? s.split("").map((c) => c + c).join("") : s;
  return [0, 2, 4].map((i) => parseInt(f.slice(i, i + 2), 16) || 0);
};
export const rampColor = (t: number, name = "accent", accentHex = DEFAULT_ACCENT, base = RAMP_START): string => {
  t = Math.min(1, Math.max(0, t));
  const stops = RAMPS[name] ?? [base, accentHex];
  const x = t * (stops.length - 1),
    i = Math.min(stops.length - 2, Math.floor(x)),
    f = x - i;
  const a = hex(stops[i]),
    b = hex(stops[i + 1]);
  return `rgb(${a.map((v, j) => Math.round(v + (b[j] - v) * f)).join(",")})`;
};
// resolve the live --w-accent of an element (for canvas drawing)
export const accentOf = (el: Element | null, fb = DEFAULT_ACCENT): string =>
  (el && getComputedStyle(el).getPropertyValue("--w-accent").trim()) || fb;
export const GRAPH_STYLES = ["area", "line", "step", "bars", "dots", "braille"];
export const METER_STYLES = ["bar", "pill", "segments", "blocks", "hair", "wave", "square"];
export const SkinCtx = createContext<SkinContext>({ skin: "default", graph: "area", meter: "bar", stroke: 1 });
export const useSkin = (): SkinContext => useContext(SkinCtx);
// Skin-aware numeral style for widgets that draw big numbers directly
/** A length that is negative below 18px and huge from there: clamped, it switches a stroke or a blur on at that font size without knowing it. */
const OVER_18PX = "calc((1em - 17.5px) * 1000)";
/**
 * The glow of a glowing skin's numerals (null for the others); `extra` adds a wider outer layer. A skin with `numStroke` also
 * outlines them and glows harder, but only from 18px up: the outline would clog the counters of a smaller numeral.
 */
export const numGlowStyle = (sk: Partial<SkinTokens>, extra?: string): CSSProperties | null => {
  // a gradient fill replaces the glow, and turns the card's inherited text shadow off: a shadow would draw through the transparent text.
  // A tone colour set after it (warn, crit) wins over the gradient, so a status stays visible.
  if (sk.numFill) return { backgroundImage: sk.numFill, WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent", textShadow: "none" };
  if (sk.numChroma) return { textShadow: "-1px 0 rgba(255,40,90,.7), 1px 0 rgba(0,220,255,.7)" };
  if (!sk.numGlow) return null;
  const outer = extra ? `, ${extra}` : "";
  if (!sk.numStroke) return { textShadow: `0 0 4px var(--w-accent), 0 0 14px var(--w-accent)${outer}` };
  return {
    WebkitTextStroke: `clamp(0px, ${OVER_18PX}, ${sk.numStroke}) currentColor`,
    paintOrder: "stroke fill",
    textShadow: `0 0 clamp(0px, ${OVER_18PX}, 2px) currentColor, 0 0 clamp(4px, calc(4px + ${OVER_18PX}), 6px) var(--w-accent), 0 0 clamp(14px, calc(14px + ${OVER_18PX}), 18px) var(--w-accent)${outer}`,
  };
};
export const numFont = (sk: Partial<SkinTokens>, weight = 700): CSSProperties => ({
  fontFamily: sk.num,
  fontWeight: sk.numWeight ?? weight,
  fontStretch: sk.numStretch,
  ...numGlowStyle(sk),
});
// Semantic state colours (stay meaningful under every skin)
export const STATE = STATUS;
// Tone → colour: ok follows the accent; warn / crit are the semantic STATE colours.
// On light / theme surfaces the shell's --w-warn / --w-crit darken them for contrast.
export const TONES: Record<Tone | "muted", string> = { ok: "var(--w-accent)", warn: `var(--w-warn, ${STATE.warn})`, crit: `var(--w-crit, ${STATE.crit})`, muted: "var(--w-faint, #8a8a94)" };
/**
 * A series colour: the Look's `series-<n>` (T3, in the skin context `sk`) as the card's `--w-s<n>`, else the widget's own `own`, so a Look
 * that sets none draws (and writes its markup) as before. The card resolves the variable, so a scope that sets its own `--w-accent` from it
 * (System Overview's sections) does not read itself. A colour a widget or the theme's palette row sets is passed instead of this.
 */
export const seriesColour = (sk: Pick<SkinContext, "series">, n: 1 | 2 | 3 | 4 | 5 | 6, own: string): string => (sk.series?.[n - 1] ? `var(--w-s${n})` : own);
/**
 * A level meter's colour: one set on the widget (`own`) stays; the theme's (its OK, which the level rows follow) gives way to the
 * Look's meter colour (T3 `meter-ok`, in the skin context `sk`); none is the accent.
 */
export const meterColour = (sk: Pick<SkinContext, "meterOk">, colour: string | undefined, own?: boolean): string => (own && colour ? colour : sk.meterOk || colour || "var(--w-accent)");
// 0-100 → colour for heatmaps. ramp 'accent' (accent intensity) or 'thermal' (blue → green → amber → red)
export const heat = (v: number, ramp = "accent"): string => {
  const t = clamp(v) / 100;
  return ramp === "accent" || !RAMPS[ramp] ? `color-mix(in oklab, var(--w-accent) ${8 + t * 92}%, ${RAMP_BASE})` : rampColor(t, ramp);
};
export const tone = (v: number, warn?: number, crit?: number): Tone =>
  Number.isFinite(v) && crit != null && v >= crit ? "crit" : Number.isFinite(v) && warn != null && v >= warn ? "warn" : "ok";
