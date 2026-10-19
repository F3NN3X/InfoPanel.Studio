import type { CSSProperties } from "react";
import type { ModernChrome } from "@/components/modern-chrome";
import { makeSurface } from "@/components/surfaces";
import { CROSS, MAIN, safe, surfaceBox, ws, type SurfaceColors } from "@/components/widget-style";
import { defaultBoxW, type BoxAlign, type BoxSize, type PanelDef, type PanelJustify, type Widget } from "@/lib/panel-model";

/**
 * A panel's arrangement as CSS. The panel's own layout fields are written
 * as `--panel-*` variables on its root (`panelVars`); the stack / grid /
 * cells read them through `var(--panel-*, …)` with the Style tab's
 * `--wp-*` value and then the old literal spacing as fallbacks — so a
 * panel that sets nothing renders as it always did, and panel CSS can
 * set the variables too (`.wp-panel { --panel-gap: 4px }`).
 */

/** The card choices of a panel: the theme cards plus the module surfaces. */
export const PANEL_SURFACES = ["none", "panel", "bordered", "glass", "matte-light", "matte-dark", "theme"] as const;
export type PanelSurface = (typeof PANEL_SURFACES)[number];

export const panelSurfaceOf = (value: unknown): PanelSurface =>
  PANEL_SURFACES.includes(value as PanelSurface) ? (value as PanelSurface) : "panel";

/** The old literal spacing (Tailwind gap-x-5 / gap-y-3, gap-x-4, p-3, p-1). */
export const PANEL_SPACING = {
  stack: { x: 20, y: 12 },
  grid: { x: 16, y: 12 },
  pad: 12,
  padBare: 4,
} as const;

const ALIGN: Record<BoxAlign, string> = {
  start: "flex-start",
  center: "center",
  end: "flex-end",
  stretch: "stretch",
};

const alignValue = (a: BoxAlign): string => (a === "stretch" ? "stretch" : safe(ALIGN[a]));

/** Main-axis distribution (a stack's justify, an overlay band's). */
export const justifyValue = (j: PanelJustify): string => safe(MAIN[j]);

/** A gap: the panel's, else the Style tab's, else `px`. */
export const panelGap = (px: number): string => `var(--panel-gap, ${ws.gap(px)})`;

/** Padding inside the panel: the panel's, else the Style tab's, else `px`. */
export const panelPad = (px: number): string => `var(--panel-pad, ${ws.pad(px)})`;

/** The panel's layout fields as `--panel-*` variables (unset ones are omitted). */
export function panelVars(panel: PanelDef): CSSProperties {
  const v: Record<string, string> = {};
  if (panel.gap !== undefined) v["--panel-gap"] = `${panel.gap}px`;
  if (panel.padding !== undefined) v["--panel-pad"] = `${panel.padding}px`;
  if (panel.direction) v["--panel-direction"] = panel.direction;
  if (panel.wrap !== undefined) v["--panel-wrap"] = panel.wrap ? "wrap" : "nowrap";
  // In a grid there is no free main-axis space: justify places within the cell.
  if (panel.justify)
    v["--panel-justify"] = panel.layout === "grid" ? safe(CROSS[panel.justify]) : justifyValue(panel.justify);
  if (panel.align) v["--panel-align"] = alignValue(panel.align);
  return v as CSSProperties;
}

/** The stack / grid container of a panel (reads `panelVars` from the root). */
export function panelLayoutStyle(panel: PanelDef): CSSProperties {
  if (panel.layout === "grid") {
    return {
      display: "grid",
      gridTemplateColumns: panel.gridCols ?? `repeat(${panel.columns ?? 3}, minmax(0, 1fr))`,
      gridTemplateRows: panel.gridRows,
      gridAutoRows: "minmax(0, 1fr)",
      columnGap: panelGap(PANEL_SPACING.grid.x),
      rowGap: panelGap(PANEL_SPACING.grid.y),
      justifyItems: "var(--panel-justify, stretch)",
      alignItems: "var(--panel-align, stretch)",
    };
  }
  const stack: Record<string, string> = {
    display: "flex",
    flexDirection: "var(--panel-direction, row)",
    flexWrap: "var(--panel-wrap, wrap)",
    justifyContent: "var(--panel-justify, flex-start)",
    alignItems: "var(--panel-align, flex-start)",
    columnGap: panelGap(PANEL_SPACING.stack.x),
    rowGap: panelGap(PANEL_SPACING.stack.y),
  };
  return stack as CSSProperties;
}

const flexFor = (size: BoxSize, wrap: boolean): string =>
  size === "fill" ? (wrap ? "1 1 100%" : "1 1 0%") : typeof size === "number" ? `0 0 ${size}px` : "0 0 auto";

/**
 * A widget's cell in a stack or grid: fill / hug / px on each axis, its
 * own cross-axis placement, and its grid span or position.
 */
export function widgetBoxStyle(w: Widget, panel: PanelDef): CSSProperties {
  const box = w.box ?? {};
  const self: CSSProperties = box.self ? { alignSelf: alignValue(box.self) } : {};
  if (panel.layout === "grid") {
    const span = w.span ? Math.min(w.span, panel.columns ?? 3) : undefined;
    return {
      gridColumn: box.col ? `${box.col} / span ${span ?? 1}` : span ? `span ${span}` : undefined,
      gridRow: box.row ? `${box.row} / span ${w.rowSpan ?? 1}` : w.rowSpan ? `span ${w.rowSpan}` : undefined,
      ...(typeof box.w === "number" ? { width: box.w } : null),
      ...(typeof box.h === "number" ? { height: box.h } : null),
      ...self,
    };
  }
  const row = (panel.direction ?? "row") === "row";
  const width = box.w ?? defaultBoxW(w.kind);
  const height = box.h ?? "hug";
  const [main, cross] = row ? [width, height] : [height, width];
  return {
    flex: flexFor(main, panel.wrap ?? true),
    ...(typeof cross === "number" ? { [row ? "height" : "width"]: cross } : null),
    ...(cross === "fill" ? { alignSelf: "stretch" } : null),
    ...self,
  };
}

const round = (v: number) => Math.round(v * 100) / 100;
const FG = "var(--wp-fg, hsl(var(--foreground)))";

/** Colors of the theme cards (opacity baked in: their background is a theme token). */
function themeCard(surface: "none" | "panel" | "bordered", opacity: number): SurfaceColors {
  if (surface === "none") return { background: "transparent", fg: FG, ring: "transparent" };
  if (surface === "bordered")
    return { background: `hsl(var(--card) / ${round(0.3 * opacity)})`, fg: FG, ring: "hsl(var(--border))" };
  return { background: `hsl(var(--card) / ${round(0.5 * opacity)})`, fg: FG, ring: "transparent" };
}

/** The colors of a panel's card. */
export function panelSurfaceColors(surface: PanelSurface, chrome: ModernChrome | undefined): SurfaceColors {
  return surface === "none" || surface === "panel" || surface === "bordered"
    ? themeCard(surface, chrome?.surfaceOpacity ?? 1)
    : makeSurface(surface, null);
}

/**
 * A stack / grid panel's card: the surface box (border, glow, opacity,
 * blur), padding and corner radius. "none" keeps the old bare look.
 */
export function panelCardStyle(surface: PanelSurface, chrome: ModernChrome | undefined): CSSProperties {
  const themed = surface === "none" || surface === "panel" || surface === "bordered";
  const bare = surface === "none";
  return {
    ...surfaceBox(panelSurfaceColors(surface, chrome), themed ? { ...chrome, surfaceOpacity: 1 } : chrome),
    padding: panelPad(bare ? PANEL_SPACING.padBare : PANEL_SPACING.pad),
    borderRadius: ws.radius(bare ? 0 : "var(--radius)"),
  };
}

/** Kinds whose `color` is a fill (the accent's job); the others color text. */
const FILL_KINDS: ReadonlySet<Widget["kind"]> = new Set(["bar", "gauge", "sparkline", "shape"]);

/**
 * A panel whose profile theme locks Colors: its widgets' own colors give way —
 * fills take the resolved accent (`accent`, hex; else the theme's), text
 * takes the resolved text colors (the re-scoped theme tokens).
 */
export function enforcedPanel(panel: PanelDef, accent: string | undefined): PanelDef {
  if (!panel.widgets.some((w) => w.color !== undefined)) return panel;
  return {
    ...panel,
    widgets: panel.widgets.map((w) =>
      w.color === undefined ? w : { ...w, color: FILL_KINDS.has(w.kind) && accent ? accent : undefined }
    ),
  };
}
