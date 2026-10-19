import { STARTERS } from "@/lib/infopanel/gauges/presets";
import { normalizeGauge, type VectorGauge } from "@/lib/infopanel/gauges/vector";
import { itemFollows, itemQuantity, withItemFollow } from "@/lib/panel-item";
import {
  defaultBoxW,
  ITEM_SECTIONS,
  THRESHOLD_KINDS,
  type BoxSize,
  type ItemLevel,
  type ItemSection,
  type Widget,
  type WidgetBox,
  type WidgetKind,
} from "@/lib/panel-model";
import { critKey, OFF, QUANTITIES, warnKey, type SectionFlags } from "@/lib/theme-model";
import type { InspectorTab, ModuleSetting, ModuleSettingValue, ModuleSettings, ThresholdQuantity } from "@/modules/types";
import { DEFAULT_GAUGE_SPEC } from "@/widgets/CustomGauge";
import type { InspectorSection, LookValues, PanelLayoutKind, SpecialSection } from "../inspector-model";
import type { FieldsApi } from "../settings-panel";
import { shownValue } from "./zone-fields";

/**
 * A panel widget's inspector (SPEC §8, the concept's `KIND_TABS`): the
 * zone's four tabs and row components over the widget's fields. Show =
 * Kind · Content · Size & placement; Style = Typography · Color · Custom
 * CSS; Data = Bound data · Binding · Units & format; Behaviour = Thresholds
 * · History · Fill. Only the sections and rows its kind reads, so a change
 * of kind (`convertKind`) drops the ones that no longer apply. Typography,
 * Color, Units & format and Thresholds follow the panel (`panel-item.ts`).
 * Rows edit virtual keys (`boxW`, `thr.warn`, …) mapped onto the widget.
 */

/** What an item's sections depend on. */
export interface ItemContext {
  kind: "item";
  widget: Widget;
  layout: PanelLayoutKind;
  /** The bound sensor's unit (else the widget's): picks the threshold quantity. */
  unit?: string;
}

/** Kinds that show a number (Units & format). */
const NUMERIC: readonly WidgetKind[] = ["stat", "value", "bar", "gauge", "sparkline", "text"];
/** Kinds that read a font size (a gauge's ring size). */
const SIZED: readonly WidgetKind[] = ["stat", "value", "gauge", "table", "text", "clock"];
/** Kinds whose text lines up left / center / right. */
const ALIGNABLE: readonly WidgetKind[] = ["stat", "value", "table", "text", "clock"];
/** Kinds that read `color`. */
const COLORED: readonly WidgetKind[] = ["stat", "value", "bar", "gauge", "sparkline", "text", "clock", "shape"];

/** Px a size gets when switched to Fixed. */
const FIXED_PX = 120;
/** The decimals a panel item offers besides Auto. */
const ITEM_DECIMALS: readonly string[] = ["0", "1", "2", "3", "4", "5", "6"];

/** What a row builder reads. */
interface RowContext {
  w: Widget;
  layout: PanelLayoutKind;
  quantity: ThresholdQuantity;
}

interface ItemSectionSpec {
  id: string;
  title: string;
  tab: InspectorTab;
  hint?: string;
  /** The kinds it applies to (unset: every kind). */
  kinds?: readonly WidgetKind[];
  special?: SpecialSection;
  terms?: string[];
  rows: (c: RowContext) => (ModuleSetting | false)[];
}

const opts = (list: [string, string][]) => list.map(([value, label]) => ({ value, label }));

const row = (key: string, label: string, type: ModuleSetting["type"], def: ModuleSettingValue, extra: Partial<ModuleSetting> = {}): ModuleSetting => ({
  key,
  label,
  type,
  default: def,
  ...extra,
});

const select = (key: string, label: string, options: [string, string][], def: string, extra: Partial<ModuleSetting> = {}) =>
  row(key, label, "select", def, { options: opts(options), ...extra });

const is = (w: Widget, kinds: readonly WidgetKind[]) => kinds.includes(w.kind);

/** The starter a gauge spec is ("custom": none of them). */
function gaugeName(spec: VectorGauge): string {
  const json = JSON.stringify(spec);
  return STARTERS.find((s) => JSON.stringify(normalizeGauge(s.gauge)) === json)?.name ?? "custom";
}

/** Width / height: Hug, Fill or Fixed (a grid cell: Cell or Fixed), the px when fixed. */
function sizeRows(c: RowContext, axis: "w" | "h"): ModuleSetting[] {
  const grid = c.layout === "grid";
  const key = axis === "w" ? "boxW" : "boxH";
  const more = axis === "h";
  const options: [string, string][] = grid ? [["fill", "Cell"], ["px", "Fixed"]] : [["hug", "Hug"], ["fill", "Fill"], ["px", "Fixed"]];
  const sizing = select(key, axis === "w" ? "Width" : "Height", options, String(boxDefault(c.w, c.layout, axis)), { more });
  const px = typeof c.w.box?.[axis] === "number";
  return [sizing, ...(px ? [row(`${key}px`, `${axis === "w" ? "Width" : "Height"} (px)`, "number", FIXED_PX, { min: 1, more })] : [])];
}

/** An axis's size when the box doesn't set one. */
const boxDefault = (w: Widget, layout: PanelLayoutKind, axis: "w" | "h"): BoxSize =>
  layout === "grid" ? "fill" : axis === "w" ? defaultBoxW(w.kind) : "hug";

const SECTIONS: readonly ItemSectionSpec[] = [
  {
    id: "item-kind",
    title: "Kind",
    tab: "show",
    special: "itemKind",
    hint: "Changing the kind keeps the label, sensor, unit, color and placement",
    terms: ["Kind", "Change kind", "Stat", "Value", "Bar", "Gauge", "Sparkline", "Table", "Text", "Image", "Clock", "Shape"],
    rows: () => [],
  },
  {
    id: "item-content",
    title: "Content",
    tab: "show",
    rows: ({ w }) => [
      w.kind !== "shape" && row("label", "Label", "text", ""),
      w.kind === "clock" && select("clock", "Show", [["both", "Time + date"], ["time", "Time"], ["date", "Date"]], "both"),
      is(w, ["text", "image"]) && row("text", w.kind === "image" ? "Image URL" : "Static text", "text", "", w.kind === "image" ? { hint: "Or bind a sensor that holds a URL" } : {}),
      w.kind === "image" && row("height", "Max height (px)", "number", 0, { min: 0, max: 600, step: 4, hint: "0 = auto" }),
      w.kind === "shape" && select("shape", "Shape", [["vbar", "V-bar"], ["hbar", "H-bar"], ["rect", "Rect"], ["circle", "Circle"]], "vbar"),
      w.kind === "shape" && row("thickness", "Thickness (px)", "number", 4, { min: 1, max: 120, hint: "A bar's thickness, a circle's diameter" }),
      w.kind === "table" && row("rows", "Rows", "number", 7, { min: 1, max: 20 }),
      w.kind === "table" && row("columns", "Columns", "number", 0, { min: 0, max: 12, more: true, hint: "Split each line on “, ” (0 = a head and the rest)" }),
      w.kind === "table" && row("header", "Header", "text", "", { more: true, hint: "Comma-separated column titles" }),
      w.kind === "customGauge" &&
        select("gauge", "Gauge", [...STARTERS.map((s): [string, string] => [s.name, s.name]), ...(gaugeName(w.vector ?? DEFAULT_GAUGE_SPEC) === "custom" ? [["custom", "Custom"] as [string, string]] : [])], gaugeName(DEFAULT_GAUGE_SPEC), {
          hint: "Start from a preset; design it on the Gauges page",
        }),
      w.kind === "customGauge" && row("width", "Width (px)", "number", 120, { min: 8, max: 600, step: 4 }),
    ],
  },
  {
    id: "item-place",
    title: "Size & placement",
    tab: "show",
    terms: ["Size", "Placement", "Width", "Height", "Align self", "Span", "Band"],
    rows: (c) =>
      c.layout === "overlay"
        ? [
            c.w.kind === "image" && row("asBackground", "Use as panel background", "boolean", false),
            select("band", "Band", [["top", "Top"], ["middle", "Middle"], ["bottom", "Bottom"]], "top"),
          ]
        : [
            ...sizeRows(c, "w"),
            select("self", "Align self", [["auto", "Auto"], ["start", "Start"], ["center", "Center"], ["end", "End"], ["stretch", "Stretch"]], "auto", {
              hint: "Across the panel's direction: vertical in a row or grid, horizontal in a column",
            }),
            ...sizeRows(c, "h"),
            c.layout === "grid" && row("span", "Column span", "number", 1, { min: 1, max: 12, more: true }),
            c.layout === "grid" && row("rowSpan", "Row span", "number", 1, { min: 1, max: 6, more: true }),
            c.layout === "grid" && row("col", "Start column", "number", 0, { min: 0, max: 24, more: true, hint: "0 = auto-placed" }),
            c.layout === "grid" && row("row", "Start row", "number", 0, { min: 0, max: 24, more: true, hint: "0 = auto-placed" }),
          ],
  },
  {
    id: "type",
    title: "Typography",
    tab: "style",
    kinds: SIZED,
    rows: ({ w }) => [
      row("fontSize", w.kind === "gauge" ? "Ring size (px)" : "Font size (px)", "number", 0, { min: 0, max: 200, hint: "0 = the kind's own size" }),
      is(w, ALIGNABLE) && select("align", "Text alignment", [["left", "Left"], ["center", "Center"], ["right", "Right"]], "left"),
    ],
  },
  {
    id: "colors",
    title: "Color",
    tab: "style",
    kinds: COLORED,
    rows: () => [row("color", "Color", "color", "", { role: "accent" })],
  },
  {
    id: "css",
    title: "Custom CSS",
    tab: "style",
    rows: () => [
      row("className", "Class names", "text", "", { more: true, hint: "Hooks for the panel's CSS" }),
      row("css", "CSS", "text", "", { more: true, multiline: true, hint: ":scope = this widget's cell; .wp-label, .wp-value, .wp-unit, .wp-bar-fill" }),
    ],
  },
  { id: "panel-data", title: "Bound data", tab: "data", special: "panelData", terms: ["Sensors", "Data points"], rows: () => [] },
  {
    id: "item-bind",
    title: "Binding",
    tab: "data",
    kinds: ["stat", "value", "bar", "gauge", "customGauge", "sparkline", "table", "text", "image"],
    rows: ({ w }) => [
      row("sensor", "Sensor", "sensor", ""),
      is(w, ["stat", "value"]) && row("subSensor", "Sub sensor", "sensor", "", { more: true, hint: "Shown below the value" }),
    ],
  },
  {
    id: "format",
    title: "Units & format",
    tab: "data",
    kinds: NUMERIC,
    rows: ({ w }) => [
      row("unit", "Unit", "text", "", { perWidget: true, hint: "Empty: the sensor's" }),
      // 0–6, the range the panel editor always offered; a stored value outside it stays listed.
      select("decimals", "Decimals", [["auto", "Auto"], ...ITEM_DECIMALS.map((d): [string, string] => [d, d]), ...(w.decimals !== undefined && !ITEM_DECIMALS.includes(String(w.decimals)) ? [[String(w.decimals), String(w.decimals)] as [string, string]] : [])], "auto"),
      is(w, ["bar", "gauge"]) && row("max", "Maximum", "number", 100, { min: 0, perWidget: true, hint: "The fill's full scale (0: the value is a percent)" }),
      row("scale", "Multiply by", "number", 1, { min: 0, perWidget: true, more: true, hint: "e.g. B/s → GB/s" }),
    ],
  },
  {
    id: "thresholds",
    title: "Thresholds",
    tab: "behaviour",
    kinds: [...THRESHOLD_KINDS],
    rows: ({ quantity }) => [
      row("thr.warn", QUANTITIES[quantity].label, "thresholds", OFF, { keyY: "thr.crit", defaultY: OFF, quantity, hint: "The bound sensor's unit picks the scale: % load, ° temperature, else its value" }),
    ],
  },
  { id: "item-history", title: "History", tab: "behaviour", kinds: ["sparkline"], rows: () => [row("history", "Samples", "number", 40, { min: 5, max: 200, step: 5 })] },
  { id: "item-fill", title: "Fill", tab: "behaviour", kinds: ["bar", "gauge"], rows: () => [row("inverted", "Invert fill", "boolean", false)] },
];

/** The sections of a panel widget, tab by tab: those its kind (and the panel's layout) has. */
export function itemSections(context: ItemContext): InspectorSection[] {
  const c: RowContext = { w: context.widget, layout: context.layout, quantity: itemQuantity(context.unit ?? context.widget.unit) };
  return SECTIONS.flatMap((spec): InspectorSection[] => {
    if (spec.kinds && !spec.kinds.includes(c.w.kind)) return [];
    const settings = spec.rows(c).filter((d): d is ModuleSetting => d !== false);
    if (settings.length === 0 && !spec.special) return [];
    return [{ id: spec.id, title: spec.title, tab: spec.tab, general: false, hint: spec.hint, settings, extras: [], special: spec.special, terms: spec.terms ?? [] }];
  });
}

/** The kinds the Kind chips offer: every kind but Custom gauge, which shows only on one already (owner decision). */
export const kindChoices = (all: readonly WidgetKind[], current: WidgetKind): WidgetKind[] =>
  all.filter((k) => k !== "customGauge" || current === "customGauge");

// -- values -------------------------------------------------------------------

/** The section a key's own value belongs to (the colour row reads its role, `accent`). */
const KEY_SECTION: Readonly<Record<string, ItemSection>> = {
  fontSize: "type",
  align: "type",
  color: "colors",
  accent: "colors",
  decimals: "format",
  "thr.warn": "thresholds",
  "thr.crit": "thresholds",
};

/** The follow section of an inspector section (the shared ids it takes), if any. */
const followedBy = (s: Pick<InspectorSection, "id">): ItemSection | undefined =>
  ITEM_SECTIONS.find((sec) => sec === s.id);

/** An axis's own size as the Width / Height row stores it (undefined: the default). */
function ownSize(w: Widget, layout: PanelLayoutKind, axis: "w" | "h"): string | undefined {
  const size = w.box?.[axis];
  if (size === undefined) return undefined;
  const mode = typeof size === "number" ? "px" : layout === "grid" && size === "hug" ? "fill" : size;
  return mode === boxDefault(w, layout, axis) ? undefined : mode;
}

/** The values a widget sets itself, under the rows' keys. */
export function itemOwn(w: Widget, layout: PanelLayoutKind): ModuleSettings {
  const box = w.box ?? {};
  const fields: [string, ModuleSettingValue | undefined][] = [
    ["label", w.label],
    ["clock", w.clock],
    ["text", w.text],
    ["height", w.height],
    ["shape", w.shape],
    ["thickness", w.thickness],
    ["rows", w.rows],
    ["columns", w.columns],
    ["header", w.header],
    ["gauge", w.vector ? gaugeName(w.vector) : undefined],
    ["width", w.width],
    ["boxW", ownSize(w, layout, "w")],
    ["boxWpx", typeof box.w === "number" ? box.w : undefined],
    ["boxH", ownSize(w, layout, "h")],
    ["boxHpx", typeof box.h === "number" ? box.h : undefined],
    ["self", box.self],
    ["span", w.span],
    ["rowSpan", w.rowSpan],
    ["col", box.col],
    ["row", box.row],
    ["band", w.overlayZone],
    ["asBackground", w.asBackground],
    ["fontSize", w.fontSize],
    ["align", w.align],
    ["color", w.color],
    ["className", w.className],
    ["css", w.css],
    ["sensor", w.sensor],
    ["subSensor", w.subSensor],
    ["unit", w.unit],
    ["decimals", w.decimals === undefined ? undefined : String(w.decimals)],
    ["max", w.max],
    ["scale", w.scale],
    ["thr.warn", w.thr?.warn],
    ["thr.crit", w.thr?.crit],
    ["history", w.history],
    ["inverted", w.inverted],
  ];
  return Object.fromEntries(fields.filter((f): f is [string, ModuleSettingValue] => f[1] !== undefined));
}

/**
 * What a widget's followed rows show while following (and under a custom
 * row it has not set): the panel's resolved look — its accent, decimals and
 * the levels a theme sets for the quantity.
 */
export function itemInherited(look: ModuleSettings, quantity: ThresholdQuantity): ModuleSettings {
  const fields: [string, ModuleSettingValue | undefined][] = [
    ["accent", look.accent],
    ["decimals", look.decimals === undefined ? undefined : String(look.decimals)],
    ["thr.warn", look[warnKey(quantity)]],
    ["thr.crit", look[critKey(quantity)]],
  ];
  return Object.fromEntries(fields.filter((f): f is [string, ModuleSettingValue] => f[1] !== undefined && f[1] !== ""));
}

// -- edits ----------------------------------------------------------------------

const text = (v: ModuleSettingValue | undefined) => (v === undefined || v === "" ? undefined : String(v));
const num = (v: ModuleSettingValue | undefined) => {
  const n = Number(v);
  return v === undefined || v === "" || !Number.isFinite(n) ? undefined : n;
};
/** A number where 0 means unset (auto). */
const positive = (v: ModuleSettingValue | undefined) => {
  const n = num(v);
  return n !== undefined && n > 0 ? n : undefined;
};
const level = (v: ModuleSettingValue | undefined): ItemLevel | undefined => (v === OFF ? OFF : num(v));

/** The widget with a field set (`undefined`: dropped). */
function put(w: Widget, field: keyof Widget, value: unknown): Widget {
  if (value === undefined) {
    if (w[field] === undefined) return w;
    return Object.fromEntries(Object.entries(w).filter(([key]) => key !== field)) as unknown as Widget;
  }
  return { ...w, [field]: value };
}

/** A box without its unset fields (`undefined` when nothing is left). */
function cleanBox(box: WidgetBox): WidgetBox | undefined {
  const rest = Object.entries(box).filter(([, v]) => v !== undefined);
  return rest.length > 0 ? (Object.fromEntries(rest) as WidgetBox) : undefined;
}

const withBox = (w: Widget, field: keyof WidgetBox, value: unknown): Widget => put(w, "box", cleanBox({ ...w.box, [field]: value }));

/** The widget with one row's key set (`undefined`: its own value dropped). */
function withKey(w: Widget, key: string, v: ModuleSettingValue | undefined): Widget {
  switch (key) {
    case "label":
    case "text":
    case "header":
    case "className":
    case "css":
    case "sensor":
    case "subSensor":
    case "unit":
    case "color":
    case "clock":
    case "shape":
    case "align":
      return put(w, key, text(v));
    case "thickness":
    case "rows":
    case "width":
    case "span":
    case "rowSpan":
    case "max":
    case "scale":
    case "history":
      return put(w, key, num(v));
    case "columns":
    case "height":
    case "fontSize":
      return put(w, key, positive(v));
    case "decimals":
      return put(w, "decimals", v === "auto" ? undefined : num(v));
    case "inverted":
      return put(w, "inverted", v === undefined ? undefined : v === true);
    case "asBackground":
      return put(w, "asBackground", v === true || undefined);
    case "band":
      return put(w, "overlayZone", text(v));
    case "gauge": {
      if (v === undefined) return put(w, "vector", undefined);
      const starter = STARTERS.find((s) => s.name === v);
      return starter ? put(w, "vector", normalizeGauge(starter.gauge)) : w;
    }
    case "boxW":
    case "boxH": {
      const axis = key === "boxW" ? "w" : "h";
      const current = w.box?.[axis];
      return withBox(w, axis, v === "px" ? (typeof current === "number" ? current : FIXED_PX) : text(v));
    }
    case "boxWpx":
    case "boxHpx":
      return withBox(w, key === "boxWpx" ? "w" : "h", positive(v));
    case "self":
      return withBox(w, "self", v === "auto" ? undefined : text(v));
    case "col":
    case "row":
      return withBox(w, key, positive(v));
    case "thr.warn":
    case "thr.crit": {
      const which = key === "thr.warn" ? "warn" : "crit";
      const { [which]: _old, ...rest } = w.thr ?? {};
      const value = level(v);
      const thr = value === undefined ? rest : { ...rest, [which]: value };
      return put(w, "thr", Object.keys(thr).length > 0 ? thr : undefined);
    }
    default:
      return w;
  }
}

/** The widget with rows' keys set. */
export const withItemValues = (w: Widget, patch: ModuleSettings): Widget =>
  Object.entries(patch).reduce((acc, [key, v]) => withKey(acc, key, v), w);

/** The widget without rows' own values. */
export const withoutItemValues = (w: Widget, keys: readonly string[]): Widget => keys.reduce((acc, key) => withKey(acc, key, undefined), w);

// -- the fields -------------------------------------------------------------------

export interface ItemFieldsInput {
  widget: Widget;
  layout: PanelLayoutKind;
  /** The panel's resolved settings (`resolveStyle`): what following rows show. */
  look: ModuleSettings;
  /** The profile theme's locks (a locked section follows). */
  locks?: SectionFlags;
  panelName: string;
  /** The bound sensor's unit (the threshold quantity). */
  unit?: string;
  /** Edit the widget; `key` names the undo step quick edits coalesce into. */
  change: (fn: (w: Widget) => Widget, key?: string) => void;
  onOpenExplorer?: () => void;
}

/** Where a widget's values come from: its own (where they apply) over the panel's. */
export function itemLookValues(input: Pick<ItemFieldsInput, "widget" | "layout" | "look" | "locks" | "unit">): LookValues {
  const { widget: w, locks } = input;
  return {
    own: itemOwn(w, input.layout),
    inherited: itemInherited(input.look, itemQuantity(input.unit ?? w.unit)),
    applies: (key) => {
      const sec = KEY_SECTION[key];
      return !sec || !itemFollows(w, sec, locks);
    },
  };
}

/**
 * The fields of a panel widget: rows show its values over the panel's, a
 * following section is read-only with a Follow bar ("Follows panel “Rig”" ·
 * Customize; "Custom for this item" · Use panel; locked by the profile).
 */
export function itemFields(input: ItemFieldsInput): FieldsApi {
  const { widget: w, locks, change } = input;
  const values = itemLookValues(input);
  return {
    values,
    shown: (key, def) => shownValue(values, key, def),
    onChange: (key, v, editKey) => change((x) => withItemValues(x, { [key]: v }), editKey ?? key),
    onPatch: (patch) => change((x) => withItemValues(x, patch), Object.keys(patch).join()),
    onClear: (keys) => change((x) => withoutItemValues(x, keys)),
    onOpenExplorer: input.onOpenExplorer,
    follow: (s) => {
      const sec = followedBy(s);
      if (!sec) return undefined;
      return {
        mode: locks?.[sec] === true ? "locked" : itemFollows(w, sec) ? "theme" : "custom",
        from: `panel “${input.panelName}”`,
        level: "profile",
        scope: { kind: "item", panelName: input.panelName },
        onCustomize: () => change((x) => withItemFollow(x, sec, false), `follow:${sec}`),
        onUseTheme: () => change((x) => withItemFollow(x, sec, true), `follow:${sec}`),
      };
    },
    readOnly: (def) => {
      const sec = def.perWidget ? undefined : KEY_SECTION[def.key];
      return sec !== undefined && itemFollows(w, sec, locks);
    },
  };
}
