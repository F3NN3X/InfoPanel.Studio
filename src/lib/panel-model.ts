import type { VectorGauge } from "@/lib/infopanel/gauges/vector";
import type { ModuleSettings } from "@/modules/types";
import type { Placement } from "./layout";
import { migrateWidgetV9 } from "./settings-migrate";

/* ---------------------------------------------------------------- *
 * Panels + widgets — the "layers and groups" model.
 *
 * Mirrors the host InfoPanel display-item tree: a *panel* (group) is a
 * placed block holding an ordered list of *widgets* (atomic items: a
 * stat readout, a bar, a gauge, a sparkline, a table, an image, a
 * clock, …). Every widget is independently bindable to a live sensor,
 * toggleable, reorderable, and restylable — which is what lets a
 * dashboard be assembled from arbitrary pieces.
 *
 * The panel's look (title, accent, card, spacing, colors, CSS) lives in
 * its placement's `settings` under the standard style keys, like every
 * other widget; its arrangement (stack / grid / overlay) lives here.
 * ---------------------------------------------------------------- */

export type WidgetKind =
  | "stat" // label + big number tile
  | "value" // compact inline readout
  | "bar" // label + value + horizontal fill
  | "gauge" // circular ring
  | "customGauge" // a gauge designed in Gauges (the Custom gauge widget's drawing)
  | "sparkline" // rolling mini line graph
  | "table" // rows from a multi-line text sensor
  | "text" // static or bound text
  | "image" // image (game cover, logo, album art, …)
  | "clock" // live time / date
  | "shape"; // decorative vbar / hbar / rect / circle

/** Decorative shape kinds (the "simple shapes" you can drop into a panel). */
export type ShapeType = "vbar" | "hbar" | "rect" | "circle";

/** A widget's size on one axis: its content's, the free space, or fixed px. */
export type BoxSize = "hug" | "fill" | number;

/** Cross-axis placement of a widget (or of all widgets, `PanelDef.align`). */
export type BoxAlign = "start" | "center" | "end" | "stretch";

/**
 * The sections of a widget that follow its panel (SPEC §8), which follows
 * the theme: Typography, Color, Units & format and Thresholds.
 */
export type ItemSection = "type" | "colors" | "format" | "thresholds";

export const ITEM_SECTIONS: readonly ItemSection[] = ["type", "colors", "format", "thresholds"];

/** A threshold level of a widget: a value, or "off" (that level never trips). */
export type ItemLevel = number | "off";

/** A widget's own warning and critical levels (each unset: the panel's). */
export interface ItemThresholds {
  warn?: ItemLevel;
  crit?: ItemLevel;
}

/** How a widget sits in its panel's stack or grid. */
export interface WidgetBox {
  /** Width (default: "fill" for the full-row kinds, else "hug"). */
  w?: BoxSize;
  /** Height (default "hug"). */
  h?: BoxSize;
  /** Cross-axis placement overriding the panel's `align`. */
  self?: BoxAlign;
  /** Grid layout: 1-based start column (default: auto-placed). */
  col?: number;
  /** Grid layout: 1-based start row (default: auto-placed). */
  row?: number;
}

export interface Widget {
  id: string;
  kind: WidgetKind;
  /** Shown above/beside the value. */
  label?: string;
  /** Full sensor key this widget reads (set via the sensor picker). */
  sensor?: string;
  /** Static text for "text"; static image URL for "image". */
  text?: string;
  unit?: string;
  /** Decimals to render a numeric value with (0 = integer). */
  decimals?: number;
  /** Display-only multiplier for the number (e.g. B/s → GB/s). */
  scale?: number;
  /** Hex color override for this widget's accents. */
  color?: string;
  /** Bar/gauge denominator (percent = value / max). */
  max?: number;
  /** Invert the fill (e.g. frame time: higher = worse = less fill). */
  inverted?: boolean;
  /** Max rows for "table". */
  rows?: number;
  /** "clock" layout. */
  clock?: "time" | "date" | "both";
  /** "clock" showing time or date only: a .NET format string (`hh:mm:ss tt`, `dd/MM/yyyy`); empty: the Dashboard settings' own. */
  format?: string;
  /** "text": scroll when wider than the widget (InfoPanel's marquee). */
  scroll?: boolean;
  /** "text" scroll speed, px per second (default 50). */
  scrollSpeed?: number;
  /** "text" scroll: px between the repeats (default 40). */
  scrollSpacing?: number;
  /** Sparkline sample count. */
  history?: number;
  /**
   * Font size in px for the value/text. The label scales with it.
   */
  fontSize?: number;
  /** Text alignment for "text", "table" and "clock". */
  align?: "left" | "center" | "right";
  /** Grid layout: number of panel columns this widget spans. */
  span?: number;
  /** Grid layout: number of panel rows this widget spans. */
  rowSpan?: number;
  /** "customGauge": the gauge spec it draws (the default spec when absent). */
  vector?: VectorGauge;
  /** "gauge": the ring's diameter in px (default 80; config v9 moved it off `fontSize`). */
  size?: number;
  /** "customGauge": the drawing's width in px (default 120; config v9 moved it off `fontSize`). */
  width?: number;
  /** Shape kind for "shape". */
  shape?: ShapeType;
  /** Thickness (bars) / diameter (circle), in px. */
  thickness?: number;
  /** Second bound sensor, rendered small below the value (value/stat). */
  subSensor?: string;
  /** "table": split each line into N comma-separated columns. */
  columns?: number;
  /** "table": static comma-separated header row. */
  header?: string;
  /** "image": max height in px (capped by the widget's cell). */
  height?: number;
  /** "overlay" panel layout: render this image widget as the panel's background. */
  asBackground?: boolean;
  /** "overlay" panel layout: which zone of the background this widget sits in. */
  overlayZone?: OverlayBand;
  /** Size and placement in a stack / grid panel. */
  box?: WidgetBox;
  /** User CSS, scoped to this widget's cell (`:scope` = the cell). */
  css?: string;
  /** Extra class names on the widget's cell (hooks for panel CSS). */
  className?: string;
  /**
   * Stat, value, bar and gauge: the levels that colour the value / fill
   * warning or critical (the bound sensor's unit picks the quantity, see
   * `panel-item.ts`). Read while Thresholds is custom; absent: the panel's.
   */
  thr?: ItemThresholds;
  /**
   * Per section: false = the widget's own values, true = the panel's (own
   * values stay stored). Unset: custom while it has own values there.
   */
  follow?: Partial<Record<ItemSection, boolean>>;
  visible: boolean;
}

/** The arrangements a panel offers ("wrap" is the legacy name of a wrapping row stack). */
export type PanelLayout = "stack" | "grid" | "overlay";

/** Main-axis distribution of a stack (and of an overlay band). */
export type PanelJustify = "start" | "center" | "end" | "between";

/** The three bands of an "overlay" panel. */
export type OverlayBand = "top" | "middle" | "bottom";

/** A custom panel (group) — a placed block of widgets. */
export interface PanelDef {
  id: string;
  /** The panel's name (layers, picker); also the legacy title text. */
  title: string;
  /** Legacy: shown title. Read only when `settings.label` is absent. */
  titleVisible: boolean;
  visible: boolean;
  /** Legacy: accent. Read only when `settings.accent` is absent. */
  accent?: string;
  /** Legacy: card. Read only when `settings.surface` is absent. */
  background: "none" | "panel" | "bordered";
  /**
   * "stack" lines widgets up in a row or column (wrapping by default);
   * "grid" arranges them in columns; "overlay" paints an image widget
   * across the panel and layers the rest in top / middle / bottom bands.
   * "wrap" (legacy) loads as a wrapping row stack.
   */
  layout?: PanelLayout | "wrap";
  /** "stack": main axis (default "row"). */
  direction?: "row" | "column";
  /** "stack": wrap onto new lines (default true). */
  wrap?: boolean;
  /** "stack": main-axis distribution; "grid": horizontal placement in cells. */
  justify?: PanelJustify;
  /** Cross-axis placement of the widgets (stack default "start", grid "stretch"). */
  align?: BoxAlign;
  /** Px between widgets (default: the Style tab's gap, else the layout's own). */
  gap?: number;
  /** Px inside the panel card (default: the Style tab's padding, else the card's own). */
  padding?: number;
  /** Column count for "grid" layout. */
  columns?: number;
  /**
   * "grid" layout: explicit CSS grid-template-columns, overriding the
   * equal `columns` split (arcv2's clock row sandwiches the time between
   * two thin accent bars).
   */
  gridCols?: string;
  /** "grid" layout: explicit CSS grid-template-rows (default: equal rows). */
  gridRows?: string;
  /**
   * "overlay" layout: the default dark scrim over the background keeps light
   * text readable over any banner. Set to false for background art that is
   * already a light or self-contrast design (arcv2's cream GPU/CPU panels,
   * the yellow SPOTIFY card).
   */
  scrim?: boolean;
  /**
   * "overlay" layout: render the bottom zone as an N-column grid instead of a
   * flex row, so value widgets line up under the pre-printed columns on the
   * background art (arcv2's cream GPU/CPU panels). Cells are centered.
   */
  bottomGridCols?: number;
  /** "overlay" layout: horizontal distribution per band (default "start"). */
  overlayAlign?: Partial<Record<OverlayBand, PanelJustify>>;
  /**
   * "fill" (default) stretches the panel over its zone; "hug" shrinks it
   * to its content, placed by the zone's horizontal / vertical alignment.
   */
  fit?: "fill" | "hug";
  /** User CSS, scoped to the panel (travels with the panel in presets). */
  css?: string;
  widgets: Widget[];
}

/** A panel the user saved for reuse (`DashboardConfig.panelPresets`). */
export interface UserPanelPreset {
  id: string;
  name: string;
  panel: PanelDef;
  /** The panel's look (its placement settings). */
  settings?: ModuleSettings;
  /** Zone footprint it was saved at (grid cells). */
  colSpan?: number;
  rowSpan?: number;
}

/** Kinds that want a full row of a stack panel (everything else hugs its content). */
export const FULL_ROW: ReadonlySet<WidgetKind> = new Set(["bar", "table", "image", "sparkline"]);

/** A widget's width when its box doesn't set one. */
export const defaultBoxW = (kind: WidgetKind): BoxSize => (FULL_ROW.has(kind) ? "fill" : "hug");

/** Kinds whose value or fill colours by thresholds. */
export const THRESHOLD_KINDS: ReadonlySet<WidgetKind> = new Set(["stat", "value", "bar", "gauge"]);

const isLevel = (v: unknown): v is ItemLevel => v === "off" || (typeof v === "number" && Number.isFinite(v));

/** Stored levels, guarded (undefined when none is usable). */
function normalizeThr(v: unknown): ItemThresholds | undefined {
  if (!isObject(v)) return undefined;
  const thr: ItemThresholds = {
    ...(isLevel(v.warn) ? { warn: v.warn } : {}),
    ...(isLevel(v.crit) ? { crit: v.crit } : {}),
  };
  return Object.keys(thr).length > 0 ? thr : undefined;
}

/** Stored follow flags, guarded: booleans of the widget's sections (undefined when none). */
function normalizeItemFlags(v: unknown): Widget["follow"] {
  if (!isObject(v)) return undefined;
  const kept = Object.entries(v).filter(([sec, on]) => ITEM_SECTIONS.includes(sec as ItemSection) && typeof on === "boolean");
  return kept.length > 0 ? Object.fromEntries(kept) : undefined;
}

/**
 * One widget brought up to the current model (idempotent): config v9's
 * Custom gauge width and Gauge ring size (`migrateWidgetV9`), `thr` and `follow` guarded (`thr`
 * on the threshold kinds only), and `box.w: "fill"` on the full-row kinds.
 */
/** The scroll and format fields as the widget reads them: anything of another type is dropped. */
function guardMarquee(w: Widget): Widget {
  const { scroll, scrollSpeed, scrollSpacing, format, ...rest } = w as Widget & Record<string, unknown>;
  if (scroll === undefined && scrollSpeed === undefined && scrollSpacing === undefined && format === undefined) return w;
  return {
    ...rest,
    ...(scroll === true ? { scroll } : {}),
    ...(typeof scrollSpeed === "number" && Number.isFinite(scrollSpeed) && scrollSpeed > 0 ? { scrollSpeed } : {}),
    ...(typeof scrollSpacing === "number" && Number.isFinite(scrollSpacing) && scrollSpacing >= 0 ? { scrollSpacing } : {}),
    ...(typeof format === "string" ? { format } : {}),
  } as Widget;
}

export function normalizeWidget(input: Widget): Widget {
  let w = migrateWidgetV9(input);
  if (w.thr !== undefined || w.follow !== undefined) {
    const { thr: _thr, follow: _follow, ...rest } = w;
    const thr = THRESHOLD_KINDS.has(w.kind) ? normalizeThr(w.thr) : undefined;
    const follow = normalizeItemFlags(w.follow);
    w = { ...rest, ...(thr ? { thr } : {}), ...(follow ? { follow } : {}) };
  }
  w = guardMarquee(w);
  if (!FULL_ROW.has(w.kind) || w.box?.w !== undefined) return w;
  return { ...w, box: { ...w.box, w: "fill" } };
}

/**
 * Bring a saved panel up to the current model. Idempotent, and every
 * field it doesn't know is kept:
 * - "wrap" / no layout → a wrapping row stack (the old inline flow);
 * - each widget as `normalizeWidget` has it.
 */
export function normalizePanel(panel: PanelDef): PanelDef {
  const legacyFlow = panel.layout === undefined || panel.layout === "wrap";
  return {
    ...panel,
    ...(legacyFlow
      ? { layout: "stack" as const, direction: panel.direction ?? "row", wrap: panel.wrap ?? true }
      : null),
    widgets: (Array.isArray(panel.widgets) ? panel.widgets : []).map(normalizeWidget),
  };
}

/**
 * A panel placement's own settings, with the legacy PanelDef look as the
 * fallback for keys it doesn't set: title → `label` ("" when hidden),
 * accent → `accent`, background → `surface`. `undefined` = no settings.
 */
export function panelSettings(pl: Placement): ModuleSettings | undefined {
  const panel = pl.panel;
  if (!panel) return pl.settings;
  const own = pl.settings ?? {};
  const fallback: ModuleSettings = {};
  if (own.label === undefined) fallback.label = panel.titleVisible ? panel.title : "";
  if (own.accent === undefined && panel.accent) fallback.accent = panel.accent;
  if (own.surface === undefined && panel.background) fallback.surface = panel.background;
  return Object.keys(fallback).length > 0 ? { ...own, ...fallback } : pl.settings;
}

/**
 * A panel placement's own settings with the legacy title as the `label`
 * fallback — no legacy look (see `panelLegacyLook`).
 */
export function panelOwnSettings(pl: Placement): ModuleSettings | undefined {
  const panel = pl.panel;
  if (!panel || pl.settings?.label !== undefined) return pl.settings;
  return { ...pl.settings, label: panel.titleVisible ? panel.title : "" };
}

/**
 * The legacy PanelDef look (accent → `accent`, background → `surface`):
 * the panel's lowest style layer, below the dashboard and profile style.
 * Read at render time only, never written to the settings.
 */
export function panelLegacyLook(pl: Placement): ModuleSettings | undefined {
  const panel = pl.panel;
  if (!panel) return undefined;
  const look: ModuleSettings = {};
  if (panel.accent) look.accent = panel.accent;
  if (panel.background) look.surface = panel.background;
  return Object.keys(look).length > 0 ? look : undefined;
}

/**
 * Migrate a panel placement (D5): normalize its panel and copy the legacy
 * title into its settings. The legacy accent / card stay render-time
 * fallbacks (`panelLegacyLook`) so the global style can reach the panel;
 * panels migrated by older builds keep the copies they hold (their zone's
 * "Follow global" lets the global style through). The PanelDef fields stay
 * (older builds still read them). Other placements pass through.
 */
export function normalizePanelPlacement(pl: Placement): Placement {
  if (!pl.panel) return pl;
  return { ...pl, panel: normalizePanel(pl.panel), settings: panelOwnSettings(pl) };
}

/**
 * Set one legacy look field on a panel placement and keep the matching
 * setting in step (the inspector's Title / Show title / Accent / Background
 * controls), so both readers agree.
 */
export function withPanelField<K extends "title" | "titleVisible" | "accent" | "background">(
  pl: Placement,
  key: K,
  value: PanelDef[K]
): Placement {
  const panel = { ...pl.panel!, [key]: value };
  const current = panelSettings(pl) ?? {};
  const shown = current.label !== undefined && current.label !== "";
  const next: ModuleSettings = { ...pl.settings };
  if (key === "title" && shown) next.label = panel.title;
  if (key === "titleVisible") next.label = panel.titleVisible ? panel.title : "";
  if (key === "accent") {
    if (panel.accent) next.accent = panel.accent;
    else delete next.accent;
  }
  if (key === "background") next.surface = panel.background;
  return { ...pl, panel, settings: Object.keys(next).length > 0 ? next : undefined };
}

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/** Unset, or a whole number of grid cells. */
const isSpan = (v: unknown) => v === undefined || (Number.isInteger(v) && (v as number) >= 1);

/** Whether a stored value is a usable saved panel preset (hand-written guard). */
export function isUserPanelPreset(v: unknown): v is UserPanelPreset {
  return (
    isObject(v) &&
    typeof v.id === "string" &&
    typeof v.name === "string" &&
    isObject(v.panel) &&
    Array.isArray(v.panel.widgets) &&
    (v.settings === undefined || isObject(v.settings)) &&
    isSpan(v.colSpan) &&
    isSpan(v.rowSpan)
  );
}

/** The usable saved panel presets of a stored config, normalized (`undefined` = none). */
export function normalizePanelPresets(v: unknown): UserPanelPreset[] | undefined {
  if (!Array.isArray(v)) return undefined;
  return v.filter(isUserPanelPreset).map((p) => ({ ...p, panel: normalizePanel(p.panel) }));
}

/* ---------------------------------------------------------------- *
 * Widget list edits (the studio's layers list, menus and Code view).
 * Pure: each returns a new panel. New ids come from the caller.
 * ---------------------------------------------------------------- */

/** Every widget kind, in menu order. */
export const WIDGET_KINDS: readonly WidgetKind[] = [
  "stat",
  "value",
  "bar",
  "gauge",
  "customGauge",
  "sparkline",
  "table",
  "text",
  "image",
  "clock",
  "shape",
];

/** Move a widget so it ends up at `index` (clamped); unknown ids are a no-op. */
export function moveWidget(panel: PanelDef, id: string, index: number): PanelDef {
  const from = panel.widgets.findIndex((w) => w.id === id);
  if (from < 0) return panel;
  const rest = panel.widgets.filter((w) => w.id !== id);
  const to = Math.max(0, Math.min(rest.length, index));
  if (to === from) return panel;
  return { ...panel, widgets: [...rest.slice(0, to), panel.widgets[from], ...rest.slice(to)] };
}

/** Insert a widget right after `afterId` (at the end when it is null or unknown). */
export function insertAfter(panel: PanelDef, afterId: string | null, widget: Widget): PanelDef {
  const i = afterId === null ? -1 : panel.widgets.findIndex((w) => w.id === afterId);
  const at = i < 0 ? panel.widgets.length : i + 1;
  return { ...panel, widgets: [...panel.widgets.slice(0, at), widget, ...panel.widgets.slice(at)] };
}

/** Copy a widget under a new id, right after the original. */
export function duplicateWidget(panel: PanelDef, id: string, newId: string): PanelDef {
  const w = panel.widgets.find((x) => x.id === id);
  if (!w) return panel;
  const copy: Widget = { ...w, id: newId, ...(w.box ? { box: { ...w.box } } : null) };
  return insertAfter(panel, id, copy);
}

/**
 * Switch a panel's layout, dropping what the new one can't show: a grid
 * has no free main-axis space, so a stack's "between" (Spread) goes back
 * to auto. Everything else carries over (an overlay ignores justify /
 * align, and a stack picks them up again on the way back).
 */
export function withLayout(panel: PanelDef, layout: PanelLayout): PanelDef {
  const next: PanelDef = { ...panel, layout };
  if (layout === "grid" && next.justify === "between") delete next.justify;
  return next;
}

/** Fields every kind keeps on a change of kind (identity, binding, layout, CSS). */
const SHARED_FIELDS: ReadonlySet<keyof Widget> = new Set<keyof Widget>([
  "id",
  "kind",
  "visible",
  "label",
  "sensor",
  "unit",
  "color",
  "span",
  "rowSpan",
  "overlayZone",
  "box",
  "css",
  "className",
  "follow",
]);

/** The further fields each kind reads. */
const KIND_FIELDS: Record<WidgetKind, readonly (keyof Widget)[]> = {
  stat: ["subSensor", "decimals", "scale", "fontSize", "align", "thr"],
  value: ["subSensor", "decimals", "scale", "fontSize", "align", "thr"],
  bar: ["decimals", "scale", "max", "inverted", "thr"],
  gauge: ["decimals", "scale", "max", "inverted", "size", "thr"],
  customGauge: ["vector", "width"],
  sparkline: ["decimals", "scale", "history"],
  table: ["text", "rows", "columns", "header", "align", "fontSize"],
  text: ["text", "decimals", "scale", "align", "fontSize", "scroll", "scrollSpeed", "scrollSpacing"],
  image: ["text", "height", "asBackground"],
  clock: ["clock", "format", "align", "fontSize"],
  shape: ["shape", "thickness"],
};

/**
 * The widget as another kind: label, sensor, unit, color, layout, CSS and
 * the follow flags stay; fields the new kind doesn't read are dropped (a
 * shape gets its defaults).
 */
export function convertKind(w: Widget, kind: WidgetKind): Widget {
  if (w.kind === kind) return w;
  const keep = new Set<string>([...SHARED_FIELDS, ...KIND_FIELDS[kind]]);
  const fields = Object.fromEntries(Object.entries(w).filter(([key]) => keep.has(key)));
  const shape = kind === "shape" ? { shape: w.shape ?? "vbar", thickness: w.thickness ?? 4 } : null;
  return { ...fields, ...shape, kind } as Widget;
}

/** What `parsePanelJson` returns. */
export type ParsedPanel = { ok: true; panel: PanelDef } | { ok: false; error: string };

const BACKGROUNDS: readonly PanelDef["background"][] = ["none", "panel", "bordered"];

/**
 * Read a panel from the Code view's JSON (hand-written guard): the shape
 * must be a panel object with a widget list of known kinds. Missing or
 * repeated widget ids get fresh ones from `newId`; missing flags get
 * their defaults; the result is normalized.
 */
export function parsePanelJson(text: string, newId: () => string): ParsedPanel {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (e) {
    return { ok: false, error: `Invalid JSON: ${(e as Error).message}` };
  }
  if (!isObject(raw)) return { ok: false, error: "The panel must be a JSON object." };
  if (!Array.isArray(raw.widgets)) return { ok: false, error: '"widgets" must be a list.' };
  const seen = new Set<string>();
  const widgets: Widget[] = [];
  for (const [i, w] of raw.widgets.entries()) {
    if (!isObject(w)) return { ok: false, error: `Widget ${i + 1} must be an object.` };
    if (!WIDGET_KINDS.includes(w.kind as WidgetKind))
      return { ok: false, error: `Widget ${i + 1}: unknown kind ${JSON.stringify(w.kind ?? null)}.` };
    const id = typeof w.id === "string" && w.id !== "" && !seen.has(w.id) ? w.id : newId();
    seen.add(id);
    widgets.push({ ...w, id, visible: typeof w.visible === "boolean" ? w.visible : true } as Widget);
  }
  const panel = {
    ...raw,
    id: typeof raw.id === "string" && raw.id !== "" ? raw.id : newId(),
    title: typeof raw.title === "string" ? raw.title : "",
    titleVisible: typeof raw.titleVisible === "boolean" ? raw.titleVisible : true,
    visible: typeof raw.visible === "boolean" ? raw.visible : true,
    background: BACKGROUNDS.includes(raw.background as PanelDef["background"]) ? raw.background : "panel",
    widgets,
  } as PanelDef;
  return { ok: true, panel: normalizePanel(panel) };
}
