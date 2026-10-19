import type { ModuleSettings, ModuleSettingValue } from "@/modules/types";
import {
  normalizeFlags,
  normalizeWidgetTheme,
  sectionsWithValues,
  themedOf,
  withAllLocked,
  withFlag,
  withThemeValues,
  type SectionFlags,
  type SectionId,
  type WidgetTheme,
} from "./theme-model";

/**
 * Stored-data migrations of widget settings v2 (one per config version),
 * pure. Each runs from `mergeConfig` and where outside data enters the
 * config (a saved panel or a style dropped in, a pasted style, appearance
 * presets), keyed on the old fields' presence; what only a pre-v6 config
 * can mean (an unset `styleMode`) is keyed on its stored version.
 *
 * v6 (the theme model, `theme-model.ts`):
 * - `Placement.styleMode` → `Placement.follow`: "follow" → every section
 *   follows; "custom" → every section with own themed values is custom;
 *   unset (pre-v6) → the same as "custom" (its own values won key by key).
 * - `MonitorProfile.style` → `widgetTheme.values`; `styleEnforce` (the
 *   profile's, else the dashboard's) → every section locked.
 * - `DashboardConfig.style` stays the base layer; `styleEnforce` goes.
 * - `autoScale`, `variant` and `compactView` are no longer themed: a
 *   profile's or the dashboard's value is written into each widget that
 *   rendered with it, then dropped from the style.
 */

/** v5 placement fields v6 replaces (read here only). */
export interface LegacyPlacementFields {
  styleMode?: "follow" | "custom";
}

/** v5 profile fields v6 replaces (read here only). */
export interface LegacyProfileFields {
  style?: ModuleSettings;
  styleEnforce?: boolean;
}

/** Look keys the old global style carried that are per widget from v6. */
export const UNTHEMED_LOOK_KEYS: readonly string[] = ["autoScale", "variant", "compactView"];

/** Zones with no look of their own: blank (`BLANK_MODULE`) and canvas (`CANVAS_ID`) zones (layout.ts imports this file). */
const NO_LOOK: ReadonlySet<string> = new Set(["blank", "infopanel"]);

interface MigratablePlacement {
  module: string;
  panel?: unknown;
  settings?: ModuleSettings;
  follow?: SectionFlags;
}

/** Follow flags for own values that won key by key: custom where the widget has own themed values. */
export function followFromOwn(settings: ModuleSettings | undefined): SectionFlags | undefined {
  const secs = sectionsWithValues(settings);
  return secs.length > 0 ? Object.fromEntries(secs.map((sec) => [sec, false])) : undefined;
}

export interface PlacementMigration {
  /** The stored config predates v6 (an unset `styleMode` means "own values win"). */
  legacy: boolean;
  /** The old global style's `UNTHEMED_LOOK_KEYS` this widget rendered under (profile's over dashboard's). */
  layered?: ModuleSettings;
  /** The old global style was forced on this widget. */
  enforced?: boolean;
}

/** A settings map without `undefined` entries (`undefined` when empty). */
const orNone = (s: ModuleSettings): ModuleSettings | undefined => (Object.keys(s).length > 0 ? s : undefined);

/** The widget's own `UNTHEMED_LOOK_KEYS` as it rendered them under the old global style. */
function bakeUnthemed(p: MigratablePlacement, followed: boolean, layered: ModuleSettings | undefined): ModuleSettings | undefined {
  if (p.panel || NO_LOOK.has(p.module)) return p.settings;
  const next: ModuleSettings = { ...p.settings };
  for (const key of UNTHEMED_LOOK_KEYS) {
    const global = layered?.[key];
    if (global !== undefined && (followed || next[key] === undefined)) next[key] = global;
    // Followed, the own value was ignored: the widget showed its default.
    else if (global === undefined && followed) delete next[key];
  }
  return orNone(next);
}

/** v6 for one placement (see the module comment); the same placement when nothing changes. */
export function migratePlacementV6<P extends MigratablePlacement>(input: P & LegacyPlacementFields, ctx: PlacementMigration): P {
  const { styleMode, ...p } = input;
  const old = styleMode !== undefined || ctx.legacy;
  const hasLayered = UNTHEMED_LOOK_KEYS.some((k) => ctx.layered?.[k] !== undefined);
  if (!old && !hasLayered) return input;
  const followed = Boolean(ctx.enforced) || styleMode === "follow";
  // An old threshold `warn` / `crit` is not a palette colour (the roles share the names since v7).
  const follow = p.follow !== undefined ? normalizeFlags(p.follow) : styleMode === "follow" || !old ? undefined : followFromOwn(withoutOldLevels(p.module, p.settings, true));
  const settings = old || hasLayered ? bakeUnthemed(p, followed, ctx.layered) : p.settings;
  const { follow: _f, settings: _s, ...rest } = p;
  return { ...rest, ...(settings ? { settings } : {}), ...(follow ? { follow } : {}) } as unknown as P;
}

/** The old global style's per-widget look keys (profile's over dashboard's). */
function unthemedOf(style: ModuleSettings | undefined, base: ModuleSettings | undefined): ModuleSettings | undefined {
  const keys = UNTHEMED_LOOK_KEYS.filter((k) => (style?.[k] ?? base?.[k]) !== undefined);
  return keys.length > 0 ? Object.fromEntries(keys.map((k) => [k, (style?.[k] ?? base?.[k])!])) : undefined;
}

interface MigratableProfile {
  widgetTheme?: WidgetTheme;
  pages: { widgetTheme?: WidgetTheme; placements: MigratablePlacement[] }[];
}

export interface ProfileMigration {
  legacy: boolean;
  /** The dashboard's style (`DashboardConfig.style`, as stored). */
  base?: ModuleSettings;
  /** The dashboard's old force switch. */
  enforce?: boolean;
}

/** v6 for one profile: its style and force switch become its widget theme, its zones migrate. */
export function migrateProfileV6<P extends MigratableProfile>(input: P & LegacyProfileFields, ctx: ProfileMigration): P {
  const { style, styleEnforce, ...p } = input;
  const enforced = ctx.legacy || styleEnforce !== undefined ? (styleEnforce ?? ctx.enforce ?? false) : false;
  const placement: PlacementMigration = { legacy: ctx.legacy, layered: unthemedOf(style, ctx.base), enforced };
  const pages = p.pages.map((pg) => {
    const placements = pg.placements.map((pl) => migratePlacementV6(pl, placement));
    const widgetTheme = normalizeWidgetTheme(pg.widgetTheme);
    const same = placements.every((pl, i) => pl === pg.placements[i]) && widgetTheme === pg.widgetTheme;
    if (same) return pg;
    const { widgetTheme: _t, ...rest } = pg;
    return { ...rest, placements, ...(widgetTheme ? { widgetTheme } : {}) };
  });
  const stored = normalizeWidgetTheme(p.widgetTheme);
  // A stored style, even empty, stays the profile's own ("Style: Custom").
  const values = style !== undefined || stored?.values ? { ...themedOf(style), ...stored?.values } : undefined;
  const valued = withThemeValues(stored, values);
  const theme = enforced ? withAllLocked(valued, true) : valued;
  const { widgetTheme: _w, ...rest } = p;
  return { ...rest, pages, ...(theme ? { widgetTheme: theme } : {}) } as unknown as P;
}

/** The all-profiles style from v6: themed keys only (`UNTHEMED_LOOK_KEYS` went into the widgets). */
export const migrateBaseStyleV6 = (style: ModuleSettings | undefined): ModuleSettings | undefined =>
  style ? orNone(themedOf(style)) : undefined;

/* ───────── v7: shared controls and the shared keys (widget settings v2 PR 3) ───────── */

/**
 * v7 (SPEC §6.1, §6.2), per placement and keyed on the old keys' presence:
 * - `variant` + `compactView` → `compact` (studio → dense; on → card, off →
 *   full, auto → absent); a choice the widget cannot draw goes. `layout` →
 *   `sizeTier`; `alignX` + `alignY` → `align` (+ `alignSpread` for "between")
 *   only where the result is the same alignment: both axes set, or a lone
 *   "between" (a lone other axis stays, read by `alignOf`'s fallback);
 *   `autoScale` (dead: no widget passes a design size to `zoomFor`) is
 *   dropped; so is a stored `showTitle` on the title-only widgets.
 * - Thresholds → `warn.<q>` / `crit.<q>` (`THRESHOLD_KEYS`); text levels
 *   become numbers, blank `off`. A stored level is kept even when it equals
 *   the old default (SPEC §9: a CpuMonitor's stored 75 stays custom; an
 *   unstored one follows the theme's 80), and the other level of a pair
 *   with one stored keeps its old default as an own value (it would
 *   otherwise shift to the theme's). Only a number, numeric text or (pre-v7)
 *   blank is an old level: `warn` / `crit` are palette roles too. Thermals'
 *   "0 = per sensor" becomes `sensorLimits`; StatusTracker's `trackNWarn` →
 *   `track.N.warn`.
 * - Device keys → `device` ("" → absent), multi-device keys → `devices`,
 *   `units` → `tempUnit`, decimals normalised (`groupDecimals` → `decimals`),
 *   a Clock's `format` → `clock`.
 * - Keys that became themed drop an own value equal to the widget's frozen
 *   old default (`OLD_DEFAULTS`), so the widget follows the theme; a section
 *   left with own values of keys that only now became themed (Units & format,
 *   Thresholds, the meters' response) turns custom, so they keep applying,
 *   unless its flag is already custom; its own values of keys themed before
 *   (Motion's `smoothing`) were ignored while it followed, so they go.
 *   A value kept under its own key (`rateUnit`, `meterBallistics`, …) can
 *   only be told apart by the stored version: pre-v7 (`legacy`) only.
 * Outside the placements: theme and style values move `alignX` / `alignY`
 * (`migrateStyleV7`), and `general.hour12` becomes the all-profiles style's
 * themed `clock` (owner decision Q4, `migrateGeneralV7`).
 */

type Quantity = "load" | "temp" | "full" | "db" | "value";

type Level = number | "off";

/**
 * The old threshold keys of each widget: quantity, warning key, critical
 * key, and their old defaults (frozen at v7). SystemOverview's VRAM / drive
 * critical was its load critical (`loadCrit`).
 */
const THRESHOLD_KEYS: Readonly<Record<string, readonly (readonly [Quantity, string, string, Level, Level])[]>> = {
  SystemStatus: [["load", "warn", "crit", 75, 90]],
  MemoryUsage: [["load", "warn", "crit", 80, 92]],
  CpuMonitor: [["load", "warn", "crit", 75, 90]],
  DriveSpace: [["full", "warn", "crit", 80, 92]],
  GpuMonitor: [["temp", "warnTemp", "critTemp", 75, 85]],
  SystemOverview: [
    ["load", "loadWarn", "loadCrit", 80, 92],
    ["temp", "tempWarn", "tempCrit", 80, 90],
    ["full", "vramWarn", "loadCrit", 90, 92],
  ],
  // Text fields until v7: blank = off.
  SensorValue: [["value", "warn", "crit", "off", "off"]],
  SensorGroup: [["value", "groupWarn", "groupCrit", "off", "off"]],
  MeterBridge: [["db", "warnDb", "clipDb", -18, -6]],
};

/** The threshold slots of StatusTracker (`trackNWarn` / `trackNCrit` → `track.N.warn` / `track.N.crit`) and their old defaults. */
const TRACK_SLOTS: readonly (readonly [number, Level, Level])[] = [
  [1, 50, 80],
  [2, 50, 80],
  [3, 80, 92],
];

/**
 * Thermals' one level with the other at 0 (per sensor): the other takes the
 * CPU sensor's old limit, the closest v7 has (one threshold for every sensor).
 */
const THERMALS_FALLBACK = { warn: 80, crit: 90 } as const;

/** Each widget's old single-device key (→ `device`). */
const DEVICE_KEYS: Readonly<Record<string, string>> = {
  CpuMonitor: "cpu",
  CoreHeatmap: "cpu",
  GpuRings: "gpu",
  GpuMonitor: "gpu",
  DriveSpace: "drive",
  StorageHealth: "disk",
  DiskIO: "disk",
  NetworkThroughput: "adapter",
  MenuBar: "adapter",
  NowPlaying: "liveSource",
};

/** Each widget's old multi-device key (→ `devices`). */
const DEVICES_KEYS: Readonly<Record<string, string>> = { MeterBridge: "channels", NowPlaying: "liveSources" };

/** The widgets that had `units` (C / F, → `tempUnit` c / f). */
const UNITS_WIDGETS: ReadonlySet<string> = new Set(["Weather", "Forecast"]);

/**
 * The frozen old widget defaults of the keys that became themed in v7: an
 * own value equal to one is dropped (the widget follows the theme).
 */
const OLD_DEFAULTS: Readonly<Record<string, ModuleSettings>> = {
  MenuBar: { rateUnit: "auto" },
  NetworkThroughput: { rateUnit: "auto" },
  SystemOverview: { tempUnit: "c", decimals: "0" },
  Weather: { tempUnit: "c" },
  Forecast: { tempUnit: "c" },
  AudioMeter: { meterBallistics: "peak" },
  MeterBridge: { meterBallistics: "peak" },
  WaveLink: { meterBallistics: "peak" },
  Clock: { clock: "24" },
};

/** The widgets that draw a header only when a title is set (a stored `showTitle` goes, PR 1). */
const TITLE_ONLY: ReadonlySet<string> = new Set(["Clock", "SystemOverview"]);
/** The widgets without a summary card (Small zones has no Card), and those without a dense view either. */
const NO_CARD: ReadonlySet<string> = new Set(["Clock", "CoreHeatmap", "CustomGauge", "GpuRings", "MeterBridge", "SystemOverview", "Timer", "Visualizer", "WebPage"]);
const NO_SUMMARY: ReadonlySet<string> = new Set(["CustomGauge", "Timer", "WebPage"]);

/** The keys only v7 made themed, by section (their own values applied until now). */
const NEWLY_THEMED: Readonly<Partial<Record<SectionId, readonly string[]>>> = {
  format: ["tempUnit", "rateUnit", "decimals", "clock"],
  thresholds: (["load", "temp", "full", "db", "value"] as const).flatMap((q) => [`warn.${q}`, `crit.${q}`]),
  motion: ["meterBallistics"],
};
/** The keys of those sections themed before v7 (an own value a following section already ignored). */
const THEMED_BEFORE: Readonly<Partial<Record<SectionId, readonly string[]>>> = { motion: ["smoothing"] };

const LAYOUT_TIERS: Readonly<Record<string, string>> = { card: "lg", standard: "md", compact: "sm", simple: "xs" };
const ALIGN_ROW: Readonly<Record<string, string>> = { start: "t", center: "m", end: "b" };
const ALIGN_COL: Readonly<Record<string, string>> = { start: "l", center: "c", end: "r" };

/** A stored threshold as a v7 level: a number, "off" (blank text), or undefined (unreadable: dropped). */
function levelV7(v: ModuleSettingValue | undefined): number | "off" | undefined {
  if (v === "" || v === "off") return "off";
  if (v === undefined || typeof v === "boolean") return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

/**
 * Whether a stored value under an old threshold key is a level: a number or
 * numeric text, or (pre-v7 only) blank = off. Anything else (a palette
 * colour under `warn` / `crit`) is not.
 */
function isOldLevel(v: ModuleSettingValue | undefined, legacy: boolean): boolean {
  if (typeof v === "number") return Number.isFinite(v);
  if (typeof v !== "string") return false;
  return v.trim() === "" ? legacy : Number.isFinite(Number(v));
}

/** The modules whose old threshold keys are `warn` / `crit` (the names of two palette roles). */
const WARN_CRIT_MODULES: ReadonlySet<string> = new Set([
  ...Object.entries(THRESHOLD_KEYS).filter(([, rows]) => rows.some(([, warn]) => warn === "warn")).map(([m]) => m),
  "Thermals",
]);

/** A widget's settings without its old threshold `warn` / `crit` levels (`isOldLevel`). */
function withoutOldLevels(module: string, settings: ModuleSettings | undefined, legacy: boolean): ModuleSettings | undefined {
  if (!settings || !WARN_CRIT_MODULES.has(module)) return settings;
  return Object.fromEntries(Object.entries(settings).filter(([key, v]) => !((key === "warn" || key === "crit") && isOldLevel(v, legacy))));
}

/**
 * `alignX` / `alignY` as `align` + `alignSpread` (see the v7 comment), or
 * undefined when that would change the alignment (one axis set, not a lone
 * "between"): the old keys stay.
 */
function alignV7(x: ModuleSettingValue | undefined, y: ModuleSettingValue | undefined): ModuleSettings | undefined {
  const col = ALIGN_COL[String(x)];
  const row = ALIGN_ROW[String(y)];
  const spread: ModuleSettings = x === "between" ? { alignSpread: true } : {};
  if (row && (col || x === "between")) return { align: `${row}${col ?? "c"}`, ...spread };
  if (!row && !col) return y === undefined || y === "auto" ? spread : undefined;
  return undefined;
}

/** A settings map with the look keys v7 renamed (`alignX` / `alignY` → `align`); the same map when none is there. */
export function migrateStyleV7(style: ModuleSettings): ModuleSettings;
export function migrateStyleV7(style: ModuleSettings | undefined): ModuleSettings | undefined;
export function migrateStyleV7(style: ModuleSettings | undefined): ModuleSettings | undefined {
  if (!style || (style.alignX === undefined && style.alignY === undefined)) return style;
  const { alignX, alignY, ...rest } = style;
  if (rest.align !== undefined || rest.alignSpread !== undefined) return rest;
  const next = alignV7(alignX, alignY);
  return next ? { ...rest, ...next } : style;
}

export interface SettingsMigration {
  /** The settings with the v7 keys (`undefined` when nothing is left). */
  settings: ModuleSettings | undefined;
  /** The sections that must turn custom so the own values the step kept still apply. */
  custom: SectionId[];
}

/**
 * v7 for one widget's settings (see the v7 comment); `legacy`: the stored
 * config predates v7; `follow`: the widget's flags (a section already custom
 * keeps its own values as they are).
 */
export function migrateSettingsV7(module: string, input: ModuleSettings | undefined, legacy: boolean, follow?: SectionFlags): SettingsMigration {
  if (!input) return { settings: input, custom: [] };
  const s: ModuleSettings = { ...migrateStyleV7(input) };
  /** The keys this step wrote (or, pre-v7, kept) that only now became themed. */
  const moved = new Set<string>();
  const take = (key: string): ModuleSettingValue | undefined => {
    const v = s[key];
    delete s[key];
    return v;
  };
  const put = (key: string, value: ModuleSettingValue | undefined) => {
    if (value === undefined || s[key] !== undefined) return;
    s[key] = value;
    moved.add(key);
  };

  // §6.1: the standard block
  if (s.variant !== undefined || s.compactView !== undefined) {
    const variant = take("variant");
    const view = take("compactView");
    const compact = variant === "studio" ? "dense" : view === "on" ? "card" : view === "off" ? "full" : undefined;
    const drawn = compact === "card" ? !NO_CARD.has(module) : !NO_SUMMARY.has(module);
    if (compact && drawn && s.compact === undefined) s.compact = compact;
  }
  if (s.layout !== undefined) {
    const tier = LAYOUT_TIERS[String(take("layout"))];
    if (tier && s.sizeTier === undefined) s.sizeTier = tier;
  }
  delete s.autoScale;
  if (TITLE_ONLY.has(module)) delete s.showTitle;

  // §6.2: thresholds (read from the input: SystemOverview's `loadCrit` is two levels)
  const oldLevel = (key: string) => (isOldLevel(input[key], legacy) ? levelV7(input[key]) : undefined);
  const pairs = THRESHOLD_KEYS[module] ?? [];
  for (const [q, warn, crit, warnWas, critWas] of pairs) {
    const w = oldLevel(warn);
    const c = oldLevel(crit);
    // One level stored: the other keeps its old default, so neither shifts.
    if (w !== undefined || c !== undefined) {
      put(`warn.${q}`, w ?? warnWas);
      put(`crit.${q}`, c ?? critWas);
    }
  }
  for (const key of new Set(pairs.flatMap(([, warn, crit]) => [warn, crit]))) if (isOldLevel(s[key], legacy)) delete s[key];
  if (module === "Thermals" && (isOldLevel(s.warn, legacy) || isOldLevel(s.crit, legacy))) {
    // 0 (or blank) = each sensor's own limits; a level set = one threshold for every sensor.
    const warn = isOldLevel(s.warn, legacy) ? Number(take("warn")) || undefined : undefined;
    const crit = isOldLevel(s.crit, legacy) ? Number(take("crit")) || undefined : undefined;
    if (warn !== undefined || crit !== undefined) {
      if (s.sensorLimits === undefined) s.sensorLimits = false;
      put("warn.temp", warn ?? THERMALS_FALLBACK.warn);
      put("crit.temp", crit ?? THERMALS_FALLBACK.crit);
    }
  }
  if (module === "StatusTracker") {
    for (const [n, warnWas, critWas] of TRACK_SLOTS) {
      const w = s[`track${n}Warn`] !== undefined ? levelV7(take(`track${n}Warn`)) : undefined;
      const c = s[`track${n}Crit`] !== undefined ? levelV7(take(`track${n}Crit`)) : undefined;
      if (w === undefined && c === undefined) continue;
      if (s[`track.${n}.warn`] === undefined) s[`track.${n}.warn`] = w ?? warnWas;
      if (s[`track.${n}.crit`] === undefined) s[`track.${n}.crit`] = c ?? critWas;
    }
  }

  // §6.2: devices, units, decimals, the clock
  const deviceKey = DEVICE_KEYS[module];
  if (deviceKey && s[deviceKey] !== undefined) {
    const v = take(deviceKey);
    if (v !== "" && v !== undefined && s.device === undefined) s.device = v;
  }
  if (s.device === "") delete s.device;
  const devicesKey = DEVICES_KEYS[module];
  if (devicesKey && s[devicesKey] !== undefined) {
    const v = take(devicesKey);
    if (v !== "" && v !== undefined && s.devices === undefined) s.devices = v;
  }
  if (UNITS_WIDGETS.has(module) && s.units !== undefined) put("tempUnit", String(take("units")).toLowerCase() === "f" ? "f" : "c");
  if (module === "SensorGroup" && s.groupDecimals !== undefined) {
    const raw = String(take("groupDecimals")).trim();
    const n = Number(raw);
    if (raw !== "" && Number.isInteger(n) && n >= 0 && n <= 4) put("decimals", String(n));
  }
  if (module === "SensorValue" && s.decimals !== undefined && s.decimals !== "auto") {
    // "" was Auto; 0–4 kept (3 and 4 only here and in Sensor Group); an own "auto" (v7) stays.
    const raw = String(s.decimals).trim();
    const n = Number(raw);
    delete s.decimals;
    if (raw !== "" && Number.isInteger(n) && n >= 0 && n <= 4) s.decimals = String(n);
    if (legacy && s.decimals !== undefined) moved.add("decimals");
  }
  if (module === "Clock" && s.format !== undefined) put("clock", take("format") === "12h" ? "12" : "24");

  // Kept under its own key: only a pre-v7 value is one that applied without a theme.
  for (const [key, old] of Object.entries(OLD_DEFAULTS[module] ?? {})) {
    if (s[key] === undefined || (!legacy && !moved.has(key))) continue;
    if (s[key] === old) {
      delete s[key];
      moved.delete(key);
    } else moved.add(key);
  }

  // A section with keys that only now became themed turns custom even when its flag says follow: a v6 config can
  // carry `follow.thresholds: true` (the section id already existed), but its own values applied regardless, so
  // custom keeps what was shown. On v7 data `moved` is empty, so an explicit Use theme is never flipped.
  const custom = (Object.keys(NEWLY_THEMED) as SectionId[]).filter((sec) => follow?.[sec] !== false && NEWLY_THEMED[sec]!.some((key) => moved.has(key)));
  // Those sections followed: their own values of keys themed before did not apply.
  for (const sec of custom) for (const key of THEMED_BEFORE[sec] ?? []) delete s[key];
  return { settings: orNone(s), custom };
}

/** A widget theme with its values' look keys renamed (`migrateStyleV7`); the same theme when nothing changes. */
function themeV7(theme: WidgetTheme | undefined): WidgetTheme | undefined {
  const values = theme?.values;
  const next = migrateStyleV7(values);
  return next === values ? theme : withThemeValues(theme, next);
}

/**
 * v7 for one placement: its settings migrated (`migrateSettingsV7`), and the
 * sections whose kept own values must still apply custom (they applied
 * without a theme until now, whatever the flag said).
 */
export function migratePlacementV7<P extends MigratablePlacement>(p: P, ctx: { legacy: boolean }): P {
  if (!p.settings || NO_LOOK.has(p.module)) return p;
  const { settings, custom } = migrateSettingsV7(p.panel ? "panel" : p.module, p.settings, ctx.legacy, p.follow);
  if (custom.length === 0 && JSON.stringify(settings) === JSON.stringify(p.settings)) return p;
  const follow = custom.reduce<SectionFlags | undefined>((f, sec) => withFlag(f, sec, false), p.follow);
  const { settings: _s, follow: _f, ...rest } = p;
  return { ...rest, ...(settings ? { settings } : {}), ...(follow ? { follow } : {}) } as P;
}

/** v7 for one profile: its zones, its theme's and its pages' themes' values. */
export function migrateProfileV7<P extends MigratableProfile>(p: P, ctx: { legacy: boolean }): P {
  const pages = p.pages.map((pg) => {
    const placements = pg.placements.map((pl) => migratePlacementV7(pl, ctx));
    const widgetTheme = themeV7(pg.widgetTheme);
    if (widgetTheme === pg.widgetTheme && placements.every((pl, i) => pl === pg.placements[i])) return pg;
    const { widgetTheme: _t, ...rest } = pg;
    return { ...rest, placements, ...(widgetTheme ? { widgetTheme } : {}) };
  });
  const widgetTheme = themeV7(p.widgetTheme);
  if (widgetTheme === p.widgetTheme && pages.every((pg, i) => pg === p.pages[i])) return p;
  const { widgetTheme: _w, ...rest } = p;
  return { ...rest, pages, ...(widgetTheme ? { widgetTheme } : {}) } as P;
}

/** v6 general settings as stored (`hour12` read here only). */
export interface LegacyGeneralFields {
  hour12?: unknown;
}

/**
 * `general.hour12` → the all-profiles style's themed `clock` (12 / 24; unset
 * stays auto, the locale's), then gone from `general`. A `clock` the style
 * already has wins (idempotent).
 */
export function migrateGeneralV7<G extends object>(
  general: (G & LegacyGeneralFields) | undefined,
  style: ModuleSettings | undefined
): { general: G | undefined; style: ModuleSettings | undefined } {
  if (!general || !("hour12" in general)) return { general, style };
  const { hour12, ...rest } = general;
  const clock = hour12 === true ? "12" : hour12 === false ? "24" : undefined;
  const next = clock && style?.clock === undefined ? { ...style, clock } : style;
  return { general: rest as G, style: next };
}

/* ───────── v8: the sample widgets refiled (widget settings v2 PR 4) ───────── */

/**
 * v8 (SPEC §6.3), per placement and keyed on the old keys' presence:
 * - NowPlaying: the visualiser keys under their v2 names (`VIZ_RENAMES`).
 *   The old engines' keys are read once into what they drew — the style
 *   (`vizStyle`), the bar gap and shape (`vizGap`, `vizShape`), and two keys
 *   no row offers: `vizMinPx` (the minimum bar height) and `vizScrollAs`
 *   (the Scroll style drawn as a line) — then dropped (`VIZ_DROPPED`), with
 *   the switches nothing reads any more.
 * - SensorGroup: the `auto` toggle → `mode` (auto, else pick: absent).
 * - Colour rows that gained a palette role (`ROLE_KEYS`) read the role's
 *   theme colour while Widget colors follows. Until now they applied
 *   whatever the flag said, so a widget with an own colour in one of them
 *   turns the section custom (pre-v8 only: on v8 data a following section
 *   is an explicit Use theme). The roles' theme defaults are "" (the
 *   widget's own colour), so a widget without own colours looks the same.
 * AudioMeter's hot zone needs no rename: it was a fixed share of the
 * meter, and its Audio level row defaults to that share in dB.
 */

/** NowPlaying's old visualiser keys and their v2 names (frozen at v8). */
const VIZ_RENAMES: Readonly<Record<string, string>> = {
  vizRamp: "vizColor1",
  waveformSensitivity: "vizGain",
  visualizerBarCount: "vizBars",
  visualizerAlign: "vizAlign",
  visualizerOrientation: "vizOrientation",
  visualizerMinLevel: "vizMinLevel",
  waveformLineWidth: "vizLine",
  waveformFadeEdges: "vizFade",
  waveformFadeWidth: "vizFadeWidth",
};

/** The old engines' keys and the switches nothing reads: read once (`nowPlayingV8`), then dropped. */
const VIZ_DROPPED: readonly string[] = [
  "vizEngine",
  "waveform",
  "visualizer",
  "waveformVariant",
  "visualizerMirrored",
  "liveSource",
  "waveformMode",
  "waveformBarWidth",
  "waveformBarGap",
  "waveformBarRadius",
  "waveformMinBarHeight",
  "waveformActive",
  "visualizerIdle",
  "visualizerLoading",
];

/** The visualiser styles at v8. */
const VIZ_STYLES_V8: readonly string[] = ["bars", "mirror", "wave", "line", "dots", "radial", "blob", "scroll"];

/** The old shape keys' defaults: a value equal to one was not a choice (the skin kept the shape). */
const VIZ_SHAPE_DEFAULTS = { waveformBarWidth: 3, waveformBarGap: 1, waveformBarRadius: 1.5, waveformMinBarHeight: 4 } as const;

/** The colour rows that gained a palette role in v8, per widget. */
const ROLE_KEYS: Readonly<Record<string, readonly string[]>> = {
  SystemOverview: ["cpuColor", "gpuColor", "ramColor", "vramColor", "diskColor", "netColor"],
  NowPlaying: ["vizColor1", "vizColor2", "vizColor3", "vizPeakColor"],
  SensorGroup: ["tempColor", "fanColor", "powerColor"],
  AudioMeter: ["levelColor", "hotColor"],
  GpuRings: ["outerColor", "innerColor"],
  Thermals: ["fanColor"],
  DiskIO: ["readColor", "writeColor"],
  NetworkThroughput: ["downloadColor", "uploadColor"],
  VolumeMixer: ["levelColor"],
  MeterBridge: ["levelColor", "hotColor"],
  Visualizer: ["ramp", "vizColor2", "vizColor3", "vizPeakColor"],
  WaveLink: ["levelColor", "liveColor", "muteColor"],
  FpsMonitor: ["ringColor", "sparkColor"],
  PlaytimeShare: ["color1", "color2", "color3", "color4", "color5", "color6"],
  SteamFriends: ["ingameColor", "onlineColor", "awayColor", "busyColor", "offlineColor"],
  Bluetooth: ["batteryMidColor", "batteryLowColor"],
};

/** A stored number, or undefined. */
const numOf = (v: ModuleSettingValue | undefined): number | undefined =>
  v === undefined || v === "" || typeof v === "boolean" || !Number.isFinite(Number(v)) ? undefined : Number(v);

/** An old shape key's stored value when it was a choice (away from its default). */
function chosenShape(s: ModuleSettings, key: keyof typeof VIZ_SHAPE_DEFAULTS): number | undefined {
  const n = numOf(s[key]);
  return n === undefined || n === VIZ_SHAPE_DEFAULTS[key] ? undefined : n;
}

/**
 * The style the old keys drew: `vizEngine` waveform (the live waveform): scrolling = scroll, static =
 * bars, line or mirror; bars (the bar visualiser): bars, or mirror; mini (or none): `waveformVariant`.
 */
function vizStyleV8(s: ModuleSettings): string {
  const engine = s.vizEngine === "waveform" || s.vizEngine === "bars" ? s.vizEngine : "mini";
  const v = String(s.waveformVariant);
  if (engine === "waveform") return (s.waveformMode ?? "scrolling") !== "static" ? "scroll" : v === "line" || v === "mirror" ? v : "bars";
  if (engine === "bars") return v === "mirror" || Boolean(s.visualizerMirrored) ? "mirror" : "bars";
  return VIZ_STYLES_V8.includes(v) ? v : "bars";
}

/** NowPlaying at v8, in place (see the v8 comment); a key already under its v2 name wins. */
function nowPlayingV8(s: ModuleSettings): void {
  const put = (key: string, value: ModuleSettingValue | undefined) => {
    if (value !== undefined && s[key] === undefined) s[key] = value;
  };
  for (const [old, key] of Object.entries(VIZ_RENAMES)) {
    if (s[old] === undefined) continue;
    put(key, s[old]);
    delete s[old];
  }
  if (!VIZ_DROPPED.some((key) => s[key] !== undefined)) return;
  if (["vizEngine", "waveformVariant", "waveformMode", "visualizerMirrored"].some((key) => s[key] !== undefined)) {
    const style = vizStyleV8(s);
    if (style !== "bars") put("vizStyle", style);
    if (style === "scroll" && s.waveformVariant === "line") put("vizScrollAs", "line");
  }
  const width = chosenShape(s, "waveformBarWidth");
  const gap = chosenShape(s, "waveformBarGap");
  const radius = chosenShape(s, "waveformBarRadius");
  // The gap as a share of the bar slot (`vizGap` is a percent).
  if (width !== undefined || gap !== undefined) put("vizGap", (100 * (gap ?? 1)) / ((width ?? 3) + (gap ?? 1)));
  const shaped = s.vizShape !== undefined && s.vizShape !== "" && s.vizShape !== "auto";
  if (radius !== undefined && !shaped) s.vizShape = radius === 0 ? "square" : "round";
  put("vizMinPx", chosenShape(s, "waveformMinBarHeight"));
  for (const key of VIZ_DROPPED) delete s[key];
}

/**
 * v8 for one widget's settings (see the v8 comment); `legacy`: the stored
 * config predates v8; `follow`: the widget's flags (Widget colors already
 * custom stays as it is).
 */
export function migrateSettingsV8(module: string, input: ModuleSettings | undefined, legacy: boolean, follow?: SectionFlags): SettingsMigration {
  if (!input) return { settings: input, custom: [] };
  const s: ModuleSettings = { ...input };
  if (module === "NowPlaying") nowPlayingV8(s);
  if (module === "SensorGroup" && s.auto !== undefined) {
    if (s.auto === true && s.mode === undefined) s.mode = "auto";
    delete s.auto;
  }
  // The Trend view is a preset now: it reads as its bundle (the sparkline on), which is what it drew.
  if (module === "FpsMonitor" && s.view === "trend") s.sparkline = true;
  const ownColor = (ROLE_KEYS[module] ?? []).some((key) => typeof s[key] === "string" && String(s[key]).trim() !== "");
  return { settings: orNone(s), custom: legacy && ownColor && follow?.palette !== false ? ["palette"] : [] };
}

/** v8 for one placement: its settings migrated (`migrateSettingsV8`), Widget colors custom where its own colours must still apply. */
export function migratePlacementV8<P extends MigratablePlacement>(p: P, ctx: { legacy: boolean }): P {
  if (!p.settings || p.panel || NO_LOOK.has(p.module)) return p;
  const { settings, custom } = migrateSettingsV8(p.module, p.settings, ctx.legacy, p.follow);
  if (custom.length === 0 && JSON.stringify(settings) === JSON.stringify(p.settings)) return p;
  const follow = custom.reduce<SectionFlags | undefined>((f, sec) => withFlag(f, sec, false), p.follow);
  const { settings: _s, follow: _f, ...rest } = p;
  return { ...rest, ...(settings ? { settings } : {}), ...(follow ? { follow } : {}) } as P;
}

/** v8 for one profile: its zones. */
export function migrateProfileV8<P extends MigratableProfile>(p: P, ctx: { legacy: boolean }): P {
  const pages = p.pages.map((pg) => {
    const placements = pg.placements.map((pl) => migratePlacementV8(pl, ctx));
    return placements.every((pl, i) => pl === pg.placements[i]) ? pg : { ...pg, placements };
  });
  return pages.every((pg, i) => pg === p.pages[i]) ? p : { ...p, pages };
}
