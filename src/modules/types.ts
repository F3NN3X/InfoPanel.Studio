import type { ReactNode } from "react";
import type { SensorValue } from "@/hooks/useSensors";
import type { IslandSourceDef } from "@/lib/island/sources";
import type { WidgetView } from "@/widgets/core/types";

export type SensorMap = Record<string, SensorValue>;

export type ModuleSettingValue = string | number | boolean;
export type ModuleSettings = Record<string, ModuleSettingValue>;

/** The inspector tabs of a widget or panel zone. */
export type InspectorTab = "show" | "style" | "data" | "behaviour";

/**
 * The shared inspector sections (the same on every widget, `inspector-categories.ts`):
 * Header and Fit in Show, the look in Style, Units & format in Data, Thresholds,
 * Dynamic Island and Motion in Behaviour. `palette` is Style › Widget colors.
 */
export type SharedSectionId =
  | "header"
  | "fit"
  | "skin"
  | "colors"
  | "palette"
  | "surface"
  | "type"
  | "spacing"
  | "border"
  | "css"
  | "format"
  | "thresholds"
  | "island"
  | "motion";

/** A theme palette colour a widget colour row stands for (Style › Widget colors). */
export type PaletteRole = "s1" | "s2" | "s3" | "s4" | "s5" | "s6" | "ok" | "warn" | "crit" | "accent";

/** Whether a widget draws a header: always, only when a title is set, or never. */
export type HeaderMode = "yes" | "title-only" | "none";

/**
 * What a widget can draw in a small zone: a summary card (`compact` descriptor), and
 * a dense view (`studio` descriptor; "fallback" = the dense view shows the card).
 */
export interface CompactShape {
  card: boolean;
  dense: boolean | "fallback";
}

/** The Units & format rows a widget renders. */
export type FormatKey = "tempUnit" | "rateUnit" | "decimals" | "clock";

/** The threshold quantities a widget colours by. */
export type ThresholdQuantity = "load" | "temp" | "full" | "db" | "value";

/** The device kinds a select can list from the live keys (`optionsFrom`). */
export type DeviceKind = "cpu" | "gpu" | "disk" | "adapter" | "audio" | "drive";
/** Whether an `optionsFrom` value is one of the device kinds. */
export const isDeviceKind = (v: string | undefined): v is DeviceKind =>
  v === "cpu" || v === "gpu" || v === "disk" || v === "adapter" || v === "audio" || v === "drive";

/**
 * One inspector-editable option. The studio renders controls from this
 * schema; values are stored per-placement (see Placement.settings).
 */
export interface ModuleSetting {
  key: string;
  label: string;
  /** "preset": a bundle of toggles (see `options`); "status": a read-only line about the data source, never stored; "date": "YYYY-MM-DD"; "time": 24 h "HH:MM" ("" = none). */
  type: "text" | "date" | "time" | "number" | "select" | "preset" | "boolean" | "color" | "icon" | "image" | "align" | "sensor" | "thresholds" | "status";
  default: ModuleSettingValue;
  /**
   * A second key the row writes together with `key`: for type "align" the
   * spread toggle (`alignSpread`), for type "thresholds" the critical level
   * (`crit.<q>`, `key` being `warn.<q>`), for a `multiple` "sensor" row the
   * per-sensor overrides (a JSON object string, edited inline on each
   * sensor). Its default is `defaultY`.
   */
  keyY?: string;
  /** The default of `keyY` (unset: `default`). */
  defaultY?: ModuleSettingValue;
  /** For type "thresholds": the quantity (`theme-model.ts` `QUANTITIES`). */
  quantity?: ThresholdQuantity;
  /** Extra search terms (the settings search also matches label, key and options). */
  keywords?: string[];
  /**
   * Options for type "select" and "preset". A "preset" row stores its option
   * but shows the toggles it writes: the option whose bundle (`applies`)
   * they match reads selected, none "Custom". Its default option's bundle
   * holds the bundled keys' defaults; `bundleDefaults` holds those it leaves
   * out (a default option that applies nothing).
   */
  bundleDefaults?: ModuleSettings;
  options?: {
    value: string;
    label: string;
    /**
     * Preset bundle: extra values this option applies when selected (the
     * studio persists each one alongside the option's own value).
     */
    applies?: ModuleSettings;
  }[];
  /**
   * For type "select": where the option list comes from instead of the static
   * `options`.
   * - `"sources"` — the containers `sourcePlugin` currently exposes (live
   *   sensor data, no hardcoded device lists).
   * - `"media"` — the browser's audio *capture* devices (live
   *   `enumerateDevices()`, no Data API involved). Used for the Web-Audio
   *   live-capture source binding.
   * - `"wavelink"` — the Wave Link app's meter inventory (channels + output
   *   devices) from the wavelink-plugin; options are the meter keys the
   *   widget filters on, "" = all meters.
   * - `"cpu" | "gpu" | "disk" | "adapter" | "audio" | "drive"` — the devices
   *   found in the live keys (`deviceOptions`), "" = Auto first. Data tab by default.
   */
  optionsFrom?: "sources" | "media" | "wavelink" | DeviceKind;
  /** Key prefix whose containers become the dynamic select's options (type "status": whose containers it lists). */
  sourcePlugin?: string;
  /**
   * For type "select" (or "sensor"): allow picking several options. The value
   * is stored as a comma-separated string ("" = none), ordered. Rendered as a
   * checkbox list in the studio (a list of bound sensors for "sensor").
   */
  multiple?: boolean;
  /** For type "text": a multi-line editor (e.g. custom CSS). */
  multiline?: boolean;
  /**
   * For type "text": a list of names (stored comma-separated) edited as chips, with the names
   * listed at this sensor key (a JSON array or a comma list) offered while typing.
   */
  suggestKey?: string;
  /** For type "text": the value is a JSON object of icons by drive (`effects/icon.ts`), edited one drive per row. */
  driveIcons?: boolean;
  /** Bounds/step for type "number" (rendered as a slider when set). */
  min?: number;
  max?: number;
  step?: number;
  /**
   * The widget's own inspector section this setting belongs to (its title).
   * Settings sharing a group render together in a collapsible section,
   * placed where the group first appears.
   */
  group?: string;
  /** The shared section it is filed in instead of a group (the standard block's keys, a moved row). */
  section?: SharedSectionId;
  /**
   * The inspector tab of a widget's own setting. Unset: Data for data settings, else
   * Show. `style` files it in Style › Widget colors — see `inspector-categories.ts`.
   */
  tab?: InspectorTab;
  /** Listed after its section's "More (n)" link. */
  more?: boolean;
  /** The old name of `more`, read the same. */
  advanced?: boolean;
  /** For a colour row: the theme palette colour it stands for. */
  role?: PaletteRole;
  /** Never comes from a theme (Tint from cover art, Background image): stays editable while its section follows. */
  perWidget?: boolean;
  /** Kept in the schema (its default, its stored value) but never listed in the inspector (CustomGauge `gauge`). */
  hidden?: boolean;
  /** One-line explanation, shown behind an info icon. */
  hint?: string;
  /** Shown only while this holds for the zone's effective values (default: always). */
  visibleIf?: (values: ModuleSettings) => boolean;
}

/**
 * A dashboard module = one InfoPanel plugin (or value source) rendered as a
 * self-contained section. The App renders every registered module and feeds
 * unclaimed sensor keys to the generic fallback grid.
 */
export interface DashboardModule {
  /** Stable id, e.g. "SystemOverview" | "NowPlaying" | "Thermals" */
  id: string;
  /** Section title */
  title: string;
  /** Minimum zone footprint this widget renders well in (grid cells). */
  minCols?: number;
  minRows?: number;
  /**
   * Key prefixes this module owns: the generic fallback skips these keys,
   * and the placement re-renders when one of them changes.
   */
  prefixes: string[];
  /** Further prefixes the module reads without owning them. */
  reads?: string[];
  /** Reads keys it cannot name up front (no prefixes, but needs data): the zone subscribes to every stream. */
  readsAll?: boolean;
  /** Render the module's cards. Return null to hide the section. */
  render: (sensors: SensorMap, settings?: ModuleSettings) => ReactNode;
  /** Inspector-editable options; omit for modules with no settings. */
  settings?: ModuleSetting[];
  /** Library chip (`INSERT_CATEGORIES`); unset: "Generic". */
  category?: string;
  /** Library card icon: a Material Symbols or widget-icon name (`widgets/core/icons.ts`). */
  icon?: string;
  /** Library card description. */
  description?: string;
  /** The Add list's one-line summary and search synonyms (`WidgetMeta.blurb`, `.tags`). */
  blurb?: string;
  tags?: string;
  /** Footprint (cols, rows) a drop gets when larger than the minimum; unset: 3×2 or the minimum. */
  defaultSize?: [number, number];
  /** The layouts it offers and the key they are stored under (`WidgetMeta.views`, `.viewKey`). */
  views?: WidgetView[];
  viewKey?: string;
  /** What the widget sends to the Dynamic Island when its "Send to island" is on (`src/lib/island/sources.ts`). */
  island?: IslandSourceDef;
  /** Whether it draws a header (the inspector's Header section); unset: "yes". */
  header?: HeaderMode;
  /** What it draws in small zones (the inspector's Fit section); unset: neither. */
  compact?: CompactShape;
  /** The Units & format rows it renders (its schema has one row per key). */
  fmt?: FormatKey[];
  /** The threshold quantities it colours by (its schema has one Thresholds row per quantity). */
  thr?: ThresholdQuantity[];
  /** The device kind its `device` (or `devices`) row picks from. */
  deviceKind?: DeviceKind;
  /** The look sections it offers when not all of them (`section` or `section:key,key`, `styleSubsetSettings`). */
  styleSubset?: string[];
  /** Binds and picks nothing: no Bound data card, so its Data tab is empty (shown disabled). */
  noData?: boolean;
}

/** Whether a setting sits behind its section's "More (n)" (`more`, or the old `advanced`). */
export const isMore = (def: ModuleSetting): boolean => def.more ?? def.advanced ?? false;

/** The keys a setting stores (two for an "align" picker or a thresholds row). */
export function settingKeys(def: ModuleSetting): string[] {
  return def.keyY ? [def.key, def.keyY] : [def.key];
}

/** The default of one of a setting's keys (`defaultY` for its `keyY`). */
export const defaultOf = (def: ModuleSetting, key: string): ModuleSettingValue =>
  key === def.keyY && def.defaultY !== undefined ? def.defaultY : def.default;

/** The module's defaults, merged with a placement's saved settings. */
export function effectiveSettings(
  mod: Pick<DashboardModule, "settings">,
  saved?: ModuleSettings
): ModuleSettings {
  const out: ModuleSettings = {};
  for (const def of mod.settings ?? []) {
    for (const key of settingKeys(def)) out[key] = saved?.[key] ?? defaultOf(def, key);
  }
  return out;
}

/**
 * A placement's saved settings over the profile's style defaults: the
 * widget's own value wins, then the profile's, then (in
 * `effectiveSettings`) the module default. Rendering resolves the full
 * dashboard → profile → own layering with follow / force instead
 * (`resolveStyle` in `lib/style-resolve.ts`).
 */
export function withProfileStyle(
  saved: ModuleSettings | undefined,
  profileStyle: ModuleSettings | undefined
): ModuleSettings | undefined {
  if (!profileStyle || Object.keys(profileStyle).length === 0) return saved;
  return { ...profileStyle, ...saved };
}
