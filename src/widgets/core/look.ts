// The standard look keys (src/modules/standard-settings.ts) mapped onto the shell (decision 7):
// pure helpers <Widget> composes, so the mapping is testable without a DOM.
import type { CSSProperties } from "react";
import type { ModernChrome } from "@/components/modern-chrome";
import { SCRIM } from "@/components/modern-chrome";
import { fadeColors, surfaceBox } from "@/components/widget-style";
import { FONT_STACKS } from "@/lib/general";
import { glowShadow, levelRadius } from "@/lib/effects/glow";
import { sizeTierOf } from "@/modules/setting-readers";
import { chromeOf } from "@/modules/standard-settings";
import type { ModuleSettings } from "@/modules/types";
import type { Box } from "./layout";
import { pickBy } from "./layout";
import type { SurfaceDef, SurfaceTone } from "./surfaces";
import { SKINS } from "./theme";
import type { Compact, SkinContext, SkinTokens, Studio, Tier } from "./types";

export const DEFAULT_ACCENT = "#34d399";

/**
 * Decision 6: an explicit accent always wins; a skin's own accent applies only when none is set
 * and the surface is not light (the skins' accents are pale or neon, invisible on a light card).
 */
export function resolveAccent(explicit: string | undefined, sk: Partial<SkinTokens>, tone?: SurfaceTone): string {
  return explicit || (tone === "light" ? undefined : sk.accent) || DEFAULT_ACCENT;
}

/** The scrim over a background image: it darkens a dark card and lightens a light one, like the text. */
export function scrimFor(tone: SurfaceTone): string {
  return tone === "dark" ? "rgba(0, 0, 0, 0.45)" : tone === "light" ? "rgba(255, 255, 255, 0.45)" : SCRIM;
}

/** The colour that hides what is behind a header patch: the surface's own background when flat. */
export function patchBackground(background: unknown, tone: SurfaceTone): string {
  const bg = String(background ?? "");
  if (bg && !bg.includes("gradient(")) return bg;
  return tone === "light" ? "#f4f4f5" : tone === "theme" ? "hsl(var(--card))" : "#0b0b0d";
}

/** The zone's own icon and title replace the template descriptor's (explicit settings win). */
export function withUserLook<T extends Compact | Studio>(c: T, user: { icon?: string; label?: string }): T {
  return user.icon || user.label ? { ...c, ...(user.icon ? { icon: user.icon } : null), ...(user.label ? { label: user.label } : null) } : c;
}

/** A summary view without its title line when the look's Show title is off (the views skip an empty label). */
export function untitled<T extends Compact | Studio>(c: T, titled: boolean): T {
  return titled ? c : { ...c, label: "" };
}

/** The tier to force: the look's Density (`sizeTier`, the old `layout`) when it names one, else the `size` prop. */
export function forcedTier(look: ModuleSettings | undefined, size: Tier | "auto" | undefined): Tier | "auto" | undefined {
  return (look && sizeTierOf(look)) ?? size;
}

/** The look's Number glow over the skin's: Off clears it, Soft and Strong set it (in the look's colour, else the accent). */
function numGlowOf(chrome: ModernChrome | undefined): Partial<SkinTokens> {
  const level = chrome?.numGlow ?? "auto";
  if (level === "off") return { numGlow: false };
  const radius = levelRadius(level);
  return radius === null ? {} : { numGlow: true, numShadow: glowShadow(radius, chrome?.numGlowColor) };
}

/**
 * The skin context for a widget: the skin's tokens with graph / meter resolved (`auto` = the
 * skin's), and the look applied — `stroke` scales the ring factor and graph strokes, `font`
 * replaces the skin's UI and numeral fonts, `fontWeight` the numeral weight, `gap` is exposed.
 */
export function skinContext(skin: string, opts: { graph?: string; meter?: string; chrome?: ModernChrome } = {}): SkinContext {
  const sk = SKINS[skin] ?? SKINS.default;
  const { graph, meter, chrome } = opts;
  const stroke = chrome?.stroke && chrome.stroke > 0 ? chrome.stroke : 1;
  const font = chrome?.font && chrome.font !== "auto" ? FONT_STACKS[chrome.font] : undefined;
  const weight = chrome?.fontWeight && chrome.fontWeight !== "auto" ? Number(chrome.fontWeight) : undefined;
  return {
    skin,
    ...sk,
    graph: graph && graph !== "auto" ? graph : sk.graph ?? "area",
    meter: meter && meter !== "auto" ? meter : sk.meter ?? "bar",
    ring: (sk.ring ?? 1) * stroke,
    stroke,
    ...(font ? { font, num: font } : null),
    ...(weight ? { numWeight: weight } : null),
    ...(chrome?.gap !== undefined ? { gap: chrome.gap } : null),
    ...(chrome?.smoothing === "smooth" ? { smooth: true } : null),
    ...numGlowOf(chrome),
  };
}

/**
 * The shell's padding: the template's per-view classes, or the look's `padding` in px when set
 * (it overrides the tier padding; bleed widgets keep none).
 */
export function shellPad(o: {
  box: Box;
  studio: boolean;
  compact: boolean;
  bleed?: boolean;
  tui: boolean;
  padding?: number;
}): { className: string; style?: CSSProperties } {
  const { box, studio, compact, bleed, tui, padding } = o;
  if (bleed && !compact && !studio) return { className: "" };
  if (padding !== undefined) return { className: "", style: { padding } };
  if (studio) return { className: box.h < 100 || (box.w / box.h >= 2.6 && box.h < 130) ? "px-3 py-0" : "px-3 py-2.5" };
  if (tui) return { className: compact ? "px-[14px] pb-3 pt-[16px]" : "px-[14px] pb-[12px] pt-[16px]" };
  if (compact)
    return { className: box.shape === "strip" && box.h < 130 ? "px-4 py-2.5" : box.w < 132 || box.h < 132 ? "p-2.5" : "p-3" };
  return { className: pickBy(box.size, { xs: "p-2.5", sm: "p-3", md: "p-4", lg: "p-5" }) };
}

const DEFAULT_EDGE = "rgba(255, 255, 255, 0.1)";

/**
 * `fadeColors` for template backgrounds: rgb / hex / theme colours have their alpha scaled, and a
 * `color-mix()` (accent tints) is mixed with transparent instead, since its colours are not literals.
 */
export function fadeBackground(background: string, factor: number): string {
  const pct = Math.round(Math.min(1, Math.max(0, factor)) * 100);
  return background
    .split(/(color-mix\((?:[^()]|\([^()]*\))*\))/g)
    .map((part, i) => (i % 2 ? `color-mix(in oklab, ${part} ${pct}%, transparent)` : fadeColors(part, factor)))
    .join("");
}

/**
 * The surface's box style with the look's border, glow, opacity and blur. The app's materials go
 * through `surfaceBox` exactly as the modern widgets draw them; template surfaces keep their own
 * style and gain only what the look sets (the edge becomes an inset shadow of the chosen width).
 */
export function lookBox(surf: SurfaceDef, chrome: ModernChrome | undefined): CSSProperties {
  if (surf.colors) {
    const { color: _color, ...box } = surfaceBox(surf.colors, chrome);
    return box;
  }
  if (!chrome) return surf.s;
  const s = surf.s;
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

/**
 * The body's flags for the standard alignment and gap (the `[data-wp-body]` rules in
 * `src/index.css`): each is set only while its option is not "Auto", so those rules — which reach
 * into the template's own layout, where no `var()` fallback can know the template's value — never
 * match by default. `data-wp-x` carries the choice, as "Spread" also distributes column layouts.
 */
export function bodyFlags(chrome: ModernChrome | undefined): Record<string, string> {
  const f: Record<string, string> = {};
  if (chrome?.alignX && chrome.alignX !== "auto") f["data-wp-x"] = chrome.alignX;
  if (chrome?.alignY && chrome.alignY !== "auto") f["data-wp-y"] = chrome.alignY;
  if (chrome?.gap !== undefined) f["data-wp-gap"] = "";
  return f;
}

/** The share of the body one look gap may take at most (the `[data-wp-gap]` rule's `min(…, 6%)`). */
export const GAP_CAP = 0.06;

/**
 * The gap a template that sizes or counts its own items must use: the look's gap, capped at
 * `GAP_CAP` of the room along that axis like the CSS rule, else the template's own `def`.
 */
export function bodyGap(look: ModuleSettings | undefined, def: number, room: number): number {
  const gap = look ? chromeOf(look).gap : undefined;
  return gap === undefined ? def : Math.min(gap, room * GAP_CAP);
}
