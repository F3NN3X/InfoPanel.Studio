import { useId, type CSSProperties, type ReactNode } from "react";
import type { GlowLevel } from "@/lib/effects/glow";
import type { FontId } from "@/lib/fonts";
import { widgetIcon } from "@/lib/widget-icons";
import { useElementSize } from "@/hooks/use-element-size";
import { cn } from "@/lib/utils";
import { chromeVars, numGlowAttr, scopedCss, ws, zoomFor, type DesignSizeSpec } from "./widget-style";

/**
 * The header text: the text color (the user's, else the theme's) at 75 %,
 * and the scrim over a background image: the theme's page color, so a
 * light theme lightens the image instead of darkening it.
 */
const HEADER_COLOR = `color-mix(in oklab, ${ws.fg("hsl(var(--foreground))")} 75%, transparent)`;
export const SCRIM = "hsl(var(--background) / 0.45)";

/**
 * The standard per-widget chrome (see `modules/standard-settings.ts` and
 * `docs/widget-settings.md`): a user-supplied background image behind the
 * surface, an optional header (icon + custom title), the accent color as
 * `--wp-accent`, and the style options — size, alignment, spacing, colors
 * and type — as `--wp-*` CSS variables the widget's layout reads through
 * the helpers in `widget-style.ts`.
 *
 * Scaling: the content sits in a `zoom`ed box, so text, rings and spacing
 * grow and shrink together. With "Scale with the zone" on, the zoom fits
 * the zone to the widget's `designSize` (the size its layout looks right
 * at), times the user's Size %. Inside the zoom, ResizeObserver reports the
 * unzoomed size, so the widget measures and lays out in its own space.
 *
 * Every modern widget wraps its body in this. Glass surfaces let the
 * background show through; matte surfaces cover it (that is intended).
 * The surface's border / glow / opacity / blur are the widget's to apply
 * (`surfaceBox`); custom CSS is scoped here to this widget's root, and the
 * theme tokens are re-scoped to the widget's colors (`tokenScope`).
 */
export type AlignX = "auto" | "start" | "center" | "end" | "between";
export type AlignY = "auto" | "start" | "center" | "end";
export type FontChoice = "auto" | Exclude<FontId, "system">;
export type FontWeightChoice = "auto" | "400" | "500" | "600" | "700" | "800";
export type LabelCase = "auto" | "uppercase" | "none" | "capitalize";
export type GlowChoice = "none" | "soft" | "strong";

export interface ModernChrome {
  /** Custom title line ("" = no header text). */
  label?: string;
  /** Widgets: false hides the title header (unset = shown). */
  showTitle?: boolean;
  /** A key from `lib/widget-icons.ts` ("" = no icon). */
  icon?: string;
  /** Accent color for fills / the header icon ("" = auto). */
  accent?: string;
  /** Background image URL. */
  background?: string;
  /** Use `background` behind the surface. */
  backgroundOn?: boolean;
  /** Fit the content to the zone (needs the widget's `designSize`). */
  autoScale?: boolean;
  /** User size multiplier (1 = 100 %). */
  scale?: number;
  alignX?: AlignX;
  alignY?: AlignY;
  /** Px overrides; undefined = the widget's own value. */
  padding?: number;
  gap?: number;
  radius?: number;
  /** "" = the surface's own colors. */
  textColor?: string;
  mutedColor?: string;
  font?: FontChoice;
  /** Weight of the big values. */
  fontWeight?: FontWeightChoice;
  labelCase?: LabelCase;
  /** Ring / bar thickness multiplier (1 = 100 %). */
  stroke?: number;
  /** Surface edge width in px; undefined = the widget's 1px edge. */
  borderWidth?: number;
  /** "" = the surface's own edge color. */
  borderColor?: string;
  glow?: GlowChoice;
  /** Number glow: auto keeps the skin's own, off removes it, soft / strong set it (`lib/effects/glow.ts`). */
  numGlow?: GlowLevel;
  /** "" = the accent color. */
  numGlowColor?: string;
  /** "" = the accent color. */
  glowColor?: string;
  /** Surface background opacity, 0–1 (1 = as designed). */
  surfaceOpacity?: number;
  /** Backdrop blur in px; undefined = the surface's own. */
  blur?: number;
  /** User CSS, scoped to this widget (`:scope` = the root). */
  customCss?: string;
  /** Graph updates: glide between samples (`smooth`) or jump to each (`stepped`, the default). */
  smoothing?: "smooth" | "stepped";
}

/** The room the title header takes at the top of the zone, px (`top-2` plus the icon row). */
const HEADER_PX = 28;

export function ModernChrome({
  chrome,
  designSize,
  className,
  children,
}: {
  chrome?: ModernChrome;
  /**
   * The size the widget's layout is designed for. Auto-scale zooms the
   * content so the zone holds at least this much; without it only the
   * user's Size % applies.
   */
  designSize?: DesignSizeSpec;
  className?: string;
  children: ReactNode;
}) {
  const { ref, w, h } = useElementSize();
  const scope = useId();
  const css = chrome?.customCss ? scopedCss(scope, chrome.customCss) : "";
  const Icon = chrome?.icon ? widgetIcon(chrome.icon) : undefined;
  const showHeader = Boolean(Icon || chrome?.label);
  // The content sits under the header, so auto-scale fits the room that is left; the offset is on the unzoomed parent.
  const zoom = zoomFor({ w, h: showHeader ? Math.max(0, h - HEADER_PX) : h }, designSize, chrome);
  const showBackground = Boolean(chrome?.backgroundOn && chrome?.background);

  return (
    <div
      ref={ref}
      className={cn("relative h-full w-full", className)}
      style={chromeVars(chrome)}
      data-wp-scope={css ? scope : undefined}
      {...numGlowAttr(chrome)}
    >
      {css && <style>{css}</style>}
      {showBackground && (
        <>
          <img
            src={chrome!.background!}
            alt=""
            aria-hidden
            className="absolute inset-0 h-full w-full object-cover"
          />
          <div className="absolute inset-0" style={{ background: SCRIM }} />
        </>
      )}
      <div className="relative z-10 h-full w-full" style={showHeader ? { paddingTop: HEADER_PX } : undefined}>
        <div className="h-full w-full" style={zoom !== 1 ? ({ zoom } as CSSProperties) : undefined}>
          {children}
        </div>
      </div>
      {showHeader && (
        <div
          className="absolute left-3 top-2 z-20 flex max-w-[calc(100%-1.5rem)] items-center gap-1.5 text-micro font-medium uppercase tracking-wider"
          style={{ color: HEADER_COLOR }}
        >
          {Icon && (
            <Icon
              className="h-3.5 w-3.5"
              style={chrome?.accent ? { color: chrome.accent } : undefined}
            />
          )}
          {chrome?.label ? <span className="min-w-0 truncate">{chrome.label}</span> : null}
        </div>
      )}
    </div>
  );
}
