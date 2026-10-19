// Shared helpers of the registry groups: narrowing stored settings into widget props, and builders for
// the inspector schema (docs/redesign/phase9/brief-9.5-inspector.md).
import { critKey, QUANTITIES, warnKey } from "@/lib/theme-model";
import type { DeviceKind, FormatKey, ModuleSetting, ModuleSettings, ThresholdQuantity } from "@/modules/types";
import { RATE_UNITS, type RateUnit } from "../core/data";

/* ───────── stored settings → props ───────── */

/** The stored settings whose key equals a widget prop name, passed straight through (unset / empty = the widget's default). */
export const pass =
  <P extends object>(...keys: (keyof P & string)[]) =>
  (s: ModuleSettings): P =>
    Object.fromEntries(keys.filter((k) => s[k] !== undefined && s[k] !== "").map((k) => [k, s[k]])) as P;

/** The stored settings whose key is one of the widget's prop names, passed straight through (an empty string is kept). */
export const pick =
  <P extends object>(keys: readonly (keyof P & string)[]) =>
  (s: ModuleSettings): P =>
    Object.fromEntries(keys.filter((k) => s[k] !== undefined).map((k) => [k, s[k]])) as P;

/** A stored number, or undefined when unset or not numeric. */
export const numberOf = (v: unknown): number | undefined => (v === undefined || v === "" || v === null || !Number.isFinite(Number(v)) ? undefined : Number(v));
/** A stored value that is one of `allowed`, or undefined. */
export const oneOf = <T extends string>(v: unknown, allowed: readonly T[]): T | undefined => allowed.find((a) => a === v);
/** A stored list, narrowed item by item; undefined when it is not a list. */
export const listOf = <T>(v: unknown, item: (x: unknown) => T | undefined): T[] | undefined =>
  Array.isArray(v) ? v.map(item).filter((x): x is T => x !== undefined) : undefined;
/** A stored non-empty string, or undefined. */
export const stringOf = (v: unknown): string | undefined => (typeof v === "string" && v ? v : undefined);
/** A stored boolean, or undefined. */
export const boolOf = (v: unknown): boolean | undefined => (typeof v === "boolean" ? v : undefined);

/** A comma-separated list ("" = none) as its trimmed items. */
export const splitKeys = (v: unknown): string[] => (typeof v === "string" && v ? v.split(",").map((k) => k.trim()).filter(Boolean) : []);
/** Items as a comma-separated string. */
export const joinKeys = (keys: readonly string[]): string => keys.join(",");
/** `keys` with `key` removed when present, else appended (the order is the binding order). */
export const toggleKey = (keys: readonly string[], key: string): string[] => (keys.includes(key) ? keys.filter((k) => k !== key) : [...keys, key]);

/* ───────── schema builders ───────── */

/** What a builder leaves to the caller: group, tab, advanced, hint, visibleIf, … */
type Extra = Partial<Omit<ModuleSetting, "key" | "label" | "type" | "default">>;
type Option = NonNullable<ModuleSetting["options"]>[number];

/** A select (a segmented control up to four options). */
export const enumSetting = (key: string, label: string, def: string, options: Option[], extra: Extra = {}): ModuleSetting => ({ key, label, type: "select", default: def, options, ...extra });

export const boolSetting = (key: string, label: string, def: boolean, extra: Extra = {}): ModuleSetting => ({ key, label, type: "boolean", default: def, ...extra });

export const numberSetting = (key: string, label: string, def: number, extra: Extra = {}): ModuleSetting => ({ key, label, type: "number", default: def, ...extra });

/** A text field. */
export const textSetting = (key: string, label: string, def = "", extra: Extra = {}): ModuleSetting => ({ key, label, type: "text", default: def, ...extra });

/** A colour; "" = the widget's own. Filed in Style › Widget colors, behind More. */
export const colorSetting = (key: string, label: string, extra: Extra = {}): ModuleSetting => ({ key, label, type: "color", default: "", tab: "style", advanced: true, ...extra });

/** A bound sensor key ("" = none); `multiple` = ordered, comma-separated keys. On the Data tab. */
export const sensorSetting = (key: string, label: string, extra: Extra = {}): ModuleSetting => ({ key, label, type: "sensor", default: "", ...extra });

/** A throughput's unit (Network Traffic, Menu Bar), in Units & format: the readings are bytes per second (`fmtRate`). */
export const rateUnitSetting = (extra: Extra = {}): ModuleSetting => ({
  key: "rateUnit",
  label: "Speed units",
  type: "select",
  default: "auto",
  options: [
    { value: "auto", label: "Auto" },
    { value: "MB/s", label: "MB/s (megabytes)" },
    { value: "Mb/s", label: "Mb/s (megabits)" },
    { value: "KB/s", label: "KB/s (kilobytes)" },
    { value: "Kb/s", label: "Kb/s (kilobits)" },
    { value: "Mbps", label: "Mbps (megabits)" },
  ],
  hint: "From the raw bytes per second; decimal prefixes (1 MB = 1,000,000 bytes)",
  keywords: ["unit", "mbps", "megabit", "megabyte", "bits", "bytes", "speed"],
  section: "format",
  ...extra,
});
export const rateUnitOf = (v: unknown): RateUnit | undefined => oneOf(v, RATE_UNITS);

/** The Units & format rows (SPEC §4.7) besides Speed units: themed, so a profile sets them once. */
const FORMAT_ROWS: Record<Exclude<FormatKey, "rateUnit">, ModuleSetting> = {
  tempUnit: {
    key: "tempUnit",
    label: "Temperature",
    type: "select",
    default: "c",
    options: [
      { value: "c", label: "°C" },
      { value: "f", label: "°F" },
    ],
    keywords: ["unit", "celsius", "fahrenheit", "units"],
    section: "format",
  },
  decimals: {
    key: "decimals",
    label: "Decimals",
    type: "select",
    default: "auto",
    options: ["auto", "0", "1", "2"].map((value) => ({ value, label: value === "auto" ? "Auto" : value })),
    keywords: ["precision", "digits"],
    section: "format",
  },
  clock: {
    key: "clock",
    label: "Clock",
    type: "select",
    default: "auto",
    options: [
      { value: "auto", label: "Locale" },
      { value: "24", label: "24 h" },
      { value: "12", label: "12 h" },
    ],
    keywords: ["hours", "12-hour", "24-hour", "format", "time"],
    section: "format",
  },
};

/** A Units & format row: `tempUnit`, `rateUnit`, `decimals` or `clock`. */
export const formatSetting = (key: FormatKey, extra: Extra & { default?: ModuleSetting["default"] } = {}): ModuleSetting =>
  key === "rateUnit" ? rateUnitSetting(extra) : { ...FORMAT_ROWS[key], ...extra };

/**
 * A quantity's Thresholds row (SPEC §4.4): one control writing `warn.<q>`
 * and `crit.<q>`, defaulting to the theme's levels (a row default replaces
 * them where the widget's old behaviour must stay, e.g. "off").
 */
export const thresholdSetting = (q: ThresholdQuantity, extra: Partial<ModuleSetting> = {}): ModuleSetting => ({
  key: warnKey(q),
  keyY: critKey(q),
  label: QUANTITIES[q].label,
  type: "thresholds",
  quantity: q,
  default: QUANTITIES[q].warn,
  defaultY: QUANTITIES[q].crit,
  keywords: ["threshold", "warning", "critical", "warn", "crit", "alert"],
  section: "thresholds",
  ...extra,
});

/** The device a widget reads (`device`; absent / "auto" = Auto, SPEC §4.5), found in the live keys. On the Data tab. */
export const deviceSetting = (label: string, from: DeviceKind, extra: Extra = {}): ModuleSetting => ({ key: "device", label, type: "select", default: "auto", optionsFrom: from, ...extra });

/** Several devices (`devices`, comma-separated; empty = all): the device picker's checkbox list. */
export const devicesSetting = (label: string, from: DeviceKind, extra: Extra = {}): ModuleSetting => ({ key: "devices", label, type: "select", default: "", optionsFrom: from, multiple: true, ...extra });

/* ───────── flattened colour objects ───────── */

/** One entry of a `colors`-style prop object, stored as the colour setting `key` (reuse the legacy key where there is one). */
export interface ColorEntry {
  entry: string;
  key: string;
  label: string;
}

/** One colour setting per entry. */
export const colorSettings = (entries: readonly ColorEntry[], extra: Extra = {}): ModuleSetting[] => entries.map((e) => colorSetting(e.key, e.label, extra));

/** The prop object rebuilt from the stored entries; undefined when none is set (the widget's palette applies). */
export function colorsOf(s: ModuleSettings, entries: readonly ColorEntry[]): Record<string, string> | undefined {
  const set = entries.flatMap((e) => {
    const v = String(s[e.key] ?? "").trim();
    return v ? [[e.entry, v] as const] : [];
  });
  return set.length ? Object.fromEntries(set) : undefined;
}

/* ───────── per-sensor overrides ───────── */

/** What one bound sensor overrides over the shared values of its widget (blank = the shared value). */
export interface ItemOverride {
  label?: string;
  max?: number;
  warn?: number;
  crit?: number;
  decimals?: number;
}
export type ItemField = keyof ItemOverride;

const finite = (v: unknown): number | undefined => (typeof v === "number" && Number.isFinite(v) ? v : undefined);

/** One stored override narrowed field by field; bad fields are dropped. */
function overrideOf(raw: unknown): ItemOverride {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return {};
  const r = raw as Record<string, unknown>;
  const label = typeof r.label === "string" && r.label.trim() ? r.label : undefined;
  const max = finite(r.max);
  const decimals = finite(r.decimals);
  const out: ItemOverride = {
    label,
    max: max !== undefined && max > 0 ? max : undefined,
    warn: finite(r.warn),
    crit: finite(r.crit),
    decimals: decimals !== undefined && Number.isInteger(decimals) && decimals >= 0 && decimals <= 4 ? decimals : undefined,
  };
  return Object.fromEntries(Object.entries(out).filter(([, v]) => v !== undefined));
}

/** The per-sensor overrides stored as a JSON object string (`{ [sensorKey]: ItemOverride }`); anything malformed is dropped, "" = none. */
export function itemsOf(v: unknown): Record<string, ItemOverride> {
  if (typeof v !== "string" || !v) return {};
  let parsed: unknown;
  try {
    parsed = JSON.parse(v);
  } catch {
    return {};
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return {};
  const entries = Object.entries(parsed).map(([key, raw]) => [key, overrideOf(raw)] as const).filter(([, o]) => Object.keys(o).length > 0);
  return Object.fromEntries(entries);
}

const encode = (items: Record<string, ItemOverride>): string => (Object.keys(items).length ? JSON.stringify(items) : "");

/** The stored string with one field of one sensor set (undefined = cleared); the other keys, even of unbound sensors, are kept. */
export function setItemField(stored: unknown, key: string, field: ItemField, value: string | number | undefined): string {
  const items = itemsOf(stored);
  const next = overrideOf({ ...items[key], [field]: value });
  const { [key]: _old, ...rest } = items;
  return encode(Object.keys(next).length ? { ...rest, [key]: next } : rest);
}

/** The stored string without one sensor's overrides. */
export function clearItem(stored: unknown, key: string): string {
  const { [key]: _old, ...rest } = itemsOf(stored);
  return encode(rest);
}

/** Per-sensor rows for the multi-sensor setting `of`, stored as a JSON string ("" = none). */
export const itemsSetting = (key: string, label: string, of: string, extra: Extra = {}): ModuleSetting => ({ key, label, type: "sensorItems", default: "", of, ...extra });
