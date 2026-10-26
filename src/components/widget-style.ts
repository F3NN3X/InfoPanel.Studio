import type { CSSProperties } from "react";
import { FONT_STACKS } from "@/lib/general";
import { ensureFont } from "@/lib/fonts";
import { hexToHsl } from "@/lib/theme";
import type { ModernChrome } from "./modern-chrome";

/**
 * The style options as CSS: `ModernChrome` writes them as `--wp-*`
 * variables on the widget root, and the widget's layout reads them through
 * these helpers, each with the widget's own value as the fallback — so an
 * option left on "Auto" changes nothing.
 *
 *   <div style={{ padding: ws.pad(20), gap: ws.gap(24), borderRadius: ws.radius(12),
 *                 ...flow("row", { x: "start", y: "center" }) }}>
 *     <span style={labelStyle()}>CPU</span>
 *     <span style={{ fontWeight: ws.weight(700) }}>42%</span>
 */

export interface DesignSize {
  w: number;
  h: number;
}

/** A fixed design size, or one picked from the zone's shape. */
export type DesignSizeSpec = DesignSize | ((w: number, h: number) => DesignSize);

/**
 * The usual pick: wide zones, tall zones and square-ish zones each have
 * their own natural size.
 */
export const byShape =
  (sizes: { wide: DesignSize; tall: DesignSize; square: DesignSize }) =>
  (w: number, h: number): DesignSize =>
    w >= h * 1.4 ? sizes.wide : h >= w * 1.2 ? sizes.tall : sizes.square;

/**
 * Auto-scale bounds: it only grows content. Zones smaller than the design
 * size are the layout variants' job (compact / simple); the Size % option
 * still shrinks on request.
 */
export const MIN_AUTO_ZOOM = 1;
export const MAX_AUTO_ZOOM = 2.5;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/**
 * The content zoom: the user's Size %, times — with auto-scale on and a
 * measured zone — how much bigger (or a little smaller) the zone is than
 * the widget's design size.
 */
export function zoomFor(
  size: { w: number; h: number },
  design: DesignSizeSpec | undefined,
  chrome: ModernChrome | undefined
): number {
  const user = chrome?.scale && chrome.scale > 0 ? chrome.scale : 1;
  if (!design || chrome?.autoScale === false || !size.w || !size.h) return round(user);
  const d = typeof design === "function" ? design(size.w, size.h) : design;
  const fit = Math.min(size.w / d.w, size.h / d.h);
  // Rounded down, so the zoomed zone still holds the design size (and keeps its tier).
  return Math.floor(clamp(fit, MIN_AUTO_ZOOM, MAX_AUTO_ZOOM) * user * 100 + 1e-9) / 100;
}

/** Two decimals: avoids re-layout churn from sub-pixel size jitter. */
const round = (v: number) => Math.round(v * 100) / 100;

/** The Font option's stacks ("Theme" = auto inherits the page font, see Settings › Dashboard). */
const FONTS: Record<string, string> = FONT_STACKS;

export const MAIN: Record<string, string> = {
  start: "flex-start",
  center: "center",
  end: "flex-end",
  between: "space-between",
};
/** As a cross-axis value "spread" has no meaning: stretch instead. */
export const CROSS: Record<string, string> = {
  start: "flex-start",
  center: "center",
  end: "flex-end",
  between: "stretch",
};

const TEXT: Record<string, string> = { start: "left", center: "center", end: "right", between: "left" };

/**
 * A chosen center / end placement is `safe`: content wider than the zone
 * then overflows at the end (and is clipped there) instead of losing its
 * start off the left / top edge.
 */
export const safe = (value: string): string =>
  value === "center" || value === "flex-end" ? `safe ${value}` : value;

const HEX = /^#[0-9a-f]{6}/i;

/**
 * The theme tokens re-scoped to the widget's colors (hex only — the tokens
 * are HSL triplets): its accent, text and secondary text. Everything inside
 * that reads the theme (Tailwind's `text-foreground`, `hsl(var(--accent))`,
 * the "theme" surface) then follows the widget's — or the global — colors.
 */
export function tokenScope(chrome: ModernChrome | undefined): Record<string, string> {
  const v: Record<string, string> = {};
  if (chrome?.accent && HEX.test(chrome.accent)) v["--accent"] = hexToHsl(chrome.accent);
  if (chrome?.textColor && HEX.test(chrome.textColor)) {
    v["--foreground"] = hexToHsl(chrome.textColor);
    v["--card-foreground"] = v["--foreground"];
  }
  if (chrome?.mutedColor && HEX.test(chrome.mutedColor)) v["--muted-foreground"] = hexToHsl(chrome.mutedColor);
  return v;
}

/** The look's Number glow as the attribute `index.css` draws the scope's numerals by (off, soft or strong; Auto sets none). */
export const numGlowAttr = (chrome: ModernChrome | undefined): { "data-wp-numglow"?: string } => (chrome?.numGlow && chrome.numGlow !== "auto" ? { "data-wp-numglow": chrome.numGlow } : {});

/**
 * The `--wp-*` variables for the chosen options (unset ones are omitted),
 * plus the re-scoped theme tokens (`tokenScope`).
 */
export function chromeVars(chrome: ModernChrome | undefined): CSSProperties | undefined {
  if (!chrome) return undefined;
  const v: Record<string, string> = tokenScope(chrome);
  if (chrome.numGlowColor) v["--w-num-c"] = chrome.numGlowColor;
  if (chrome.accent) v["--wp-accent"] = chrome.accent;
  if (chrome.padding !== undefined) v["--wp-pad"] = `${chrome.padding}px`;
  if (chrome.gap !== undefined) v["--wp-gap"] = `${chrome.gap}px`;
  if (chrome.radius !== undefined) v["--wp-radius"] = `${chrome.radius}px`;
  if (chrome.textColor) v["--wp-fg"] = chrome.textColor;
  if (chrome.mutedColor) v["--wp-muted"] = chrome.mutedColor;
  if (chrome.fontWeight && chrome.fontWeight !== "auto") v["--wp-weight"] = chrome.fontWeight;
  if (chrome.labelCase && chrome.labelCase !== "auto") v["--wp-label-case"] = chrome.labelCase;
  if (chrome.alignX && chrome.alignX !== "auto") {
    v["--wp-x"] = safe(MAIN[chrome.alignX]);
    v["--wp-x-cross"] = safe(CROSS[chrome.alignX]);
    v["--wp-text-align"] = TEXT[chrome.alignX];
    // Explicit placement: items keep their natural size instead of filling the row.
    v["--wp-flex"] = "0 1 auto";
  }
  if (chrome.alignY && chrome.alignY !== "auto") {
    v["--wp-y"] = safe(MAIN[chrome.alignY]);
    v["--wp-y-cross"] = safe(CROSS[chrome.alignY]);
  }
  const style = v as CSSProperties;
  if (chrome.font && chrome.font !== "auto") {
    ensureFont(chrome.font);
    style.fontFamily = FONTS[chrome.font];
  }
  return Object.keys(style).length > 0 ? style : undefined;
}

/** CSS values that fall back to the widget's own when the option is "Auto". */
export const ws = {
  pad: (px: number | string): string => `var(--wp-pad, ${typeof px === "number" ? `${px}px` : px})`,
  gap: (px: number | string): string => `var(--wp-gap, ${typeof px === "number" ? `${px}px` : px})`,
  radius: (px: number | string): string =>
    `var(--wp-radius, ${typeof px === "number" ? `${px}px` : px})`,
  weight: (w: number): string => `var(--wp-weight, ${w})`,
  /**
   * `flex` for items that share the row equally (`1 1 0`) unless the user
   * places them (then `0 1 auto`: natural size, aligned as chosen).
   */
  flex: (def = "1 1 0"): string => `var(--wp-flex, ${def})`,
  /** Text color: the user's override, else the given surface color. */
  fg: (color: string): string => `var(--wp-fg, ${color})`,
  muted: (color: string): string => `var(--wp-muted, ${color})`,
};

type Place = "start" | "center" | "end" | "between";

/**
 * Flex alignment honoring the user's horizontal / vertical choice, with the
 * widget's own as the default. `row` maps horizontal to the main axis,
 * `column` maps vertical to it.
 */
export function flow(
  direction: "row" | "column",
  def: { x: Place; y: Place }
): CSSProperties {
  if (direction === "row") {
    return {
      flexDirection: "row",
      justifyContent: `var(--wp-x, ${MAIN[def.x]})`,
      alignItems: `var(--wp-y-cross, ${CROSS[def.y]})`,
    };
  }
  return {
    flexDirection: "column",
    justifyContent: `var(--wp-y, ${MAIN[def.y]})`,
    alignItems: `var(--wp-x-cross, ${CROSS[def.x]})`,
  };
}

/** Text alignment for a block of text, following the horizontal choice. */
export function textAlign(def: "left" | "center" | "right" = "left"): CSSProperties {
  return { textAlign: `var(--wp-text-align, ${def})` as CSSProperties["textAlign"] };
}

/** A small label: the user's case choice, else uppercase (or `def`). */
export function labelStyle(def: "uppercase" | "none" = "uppercase"): CSSProperties {
  return { textTransform: `var(--wp-label-case, ${def})` as CSSProperties["textTransform"] };
}

/** A ring / bar thickness scaled by the user's thickness option. */
export const strokeOf = (chrome: ModernChrome | undefined, base: number): number =>
  base * (chrome?.stroke && chrome.stroke > 0 ? chrome.stroke : 1);

/** The colors a widget's surface box is built from (see `makeSurface`). */
export interface SurfaceColors {
  background: string;
  fg: string;
  ring: string;
}

const GLOW_BLUR = { soft: 14, strong: 32 } as const;

/** The blur cap (`--wp-blur-cap`, set on the page root by Limit blur) keeps a large blur from costing more than it shows. */
const blurFilter = (px: number): string => (px > 0 ? `blur(min(${px}px, var(--wp-blur-cap, ${px}px)))` : "none");

/**
 * A widget's surface box: its background, text color and 1px edge, with
 * the user's border, edge glow, surface opacity and blur applied. The glow
 * sits inside the edge (an outer one would be clipped by the zone).
 */
export function surfaceBox(sv: SurfaceColors, chrome: ModernChrome | undefined): CSSProperties {
  const border = `inset 0 0 0 ${chrome?.borderWidth ?? 1}px ${chrome?.borderColor || sv.ring}`;
  const glow =
    chrome?.glow && chrome.glow !== "none"
      ? `inset 0 0 ${GLOW_BLUR[chrome.glow]}px ${chrome.glowColor || chrome.accent || "rgba(255, 255, 255, 0.45)"}`
      : undefined;
  const opacity = chrome?.surfaceOpacity ?? 1;
  return {
    background: opacity < 1 ? fadeColors(sv.background, opacity) : sv.background,
    color: sv.fg,
    boxShadow: glow ? `${border}, ${glow}` : border,
    // `none` rather than blur(0px): it still overrides a skin's blur, without a backdrop layer to keep.
    ...(chrome?.blur !== undefined
      ? { backdropFilter: blurFilter(chrome.blur), WebkitBackdropFilter: blurFilter(chrome.blur) }
      : null),
  };
}

/**
 * Multiply the alpha of every `rgb()` / `rgba()` / hex color and every
 * theme token color (`hsl(var(--x))`, `hsl(var(--x) / a)`) in a CSS
 * background (a plain color or a gradient) by `factor`.
 */
export function fadeColors(background: string, factor: number): string {
  const f = clamp(factor, 0, 1);
  const alpha = (a: number) => round(clamp(a, 0, 1) * f);
  return background
    .replace(/rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)/g, (_, r, g, b, a) =>
      `rgba(${r}, ${g}, ${b}, ${alpha(a === undefined ? 1 : Number(a))})`
    )
    .replace(/#([0-9a-f]{6}|[0-9a-f]{3})\b/gi, (_, hex: string) => {
      const full = hex.length === 3 ? [...hex].map((c) => c + c).join("") : hex;
      const [r, g, b] = [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16));
      return `rgba(${r}, ${g}, ${b}, ${alpha(1)})`;
    })
    .replace(/hsl\(\s*var\((--[\w-]+)\)\s*(?:\/\s*([\d.]+)\s*)?\)/g, (_, token: string, a) =>
      `hsl(var(${token}) / ${alpha(a === undefined ? 1 : Number(a))})`
    );
}

/**
 * The user's custom CSS, scoped to one widget root (`[data-wp-scope]`):
 * `:scope` is the root, other selectors match inside it only.
 */
export function scopedCss(scope: string, css: string): string {
  const body = css.trim();
  if (!body) return "";
  return `@scope ([data-wp-scope="${scope.replace(/["\\]/g, "")}"]) {\n${body}\n}`;
}
