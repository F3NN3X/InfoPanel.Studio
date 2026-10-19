import { critKey, OFF, warnKey } from "@/lib/theme-model";
import type { ModuleSettings, ModuleSettingValue, ThresholdQuantity } from "./types";

/**
 * Readers of the shared keys of widget settings v2 (config v7): each
 * prefers the new key and falls back to the one it replaced, so a caller
 * holding settings from before the migration still reads them (the old
 * keys go in PR 8). Pure; the renderers, `chromeOf`, `shellProps` and the
 * island sources read through these.
 */

/** Small zones (`compact`, SPEC §4.6): what a 1×1, one-row or one-column zone shows. */
export type CompactMode = "auto" | "full" | "card" | "dense";
export const COMPACT_MODES: readonly CompactMode[] = ["auto", "full", "card", "dense"];

/** A forced size tier (`sizeTier`, the old `layout`). */
export type SizeTier = "lg" | "md" | "sm" | "xs";
export const SIZE_TIERS: readonly SizeTier[] = ["lg", "md", "sm", "xs"];

/** The old `layout` choices and the tier each forced. */
export const LAYOUT_TIERS: Readonly<Record<string, SizeTier>> = { card: "lg", standard: "md", compact: "sm", simple: "xs" };

/** The 9-cell alignment codes (row t/m/b, column l/c/r). */
export const ALIGN_CODES = ["tl", "tc", "tr", "ml", "mc", "mr", "bl", "bc", "br"] as const;
export type AlignCode = (typeof ALIGN_CODES)[number];

export type AlignX = "auto" | "start" | "center" | "end" | "between";
export type AlignY = "auto" | "start" | "center" | "end";

const ROWS: Readonly<Record<string, AlignY>> = { t: "start", m: "center", b: "end" };
const COLS: Readonly<Record<string, AlignX>> = { l: "start", c: "center", r: "end" };
const ROW_OF: Readonly<Record<string, string>> = { start: "t", center: "m", end: "b" };
const COL_OF: Readonly<Record<string, string>> = { start: "l", center: "c", end: "r" };

const isAlignCode = (v: unknown): v is AlignCode => ALIGN_CODES.includes(v as AlignCode);
const oneOf = <T extends string>(v: unknown, allowed: readonly T[]): T | undefined => allowed.find((a) => a === v);

/** A device / select value that means "pick for me": unset, empty or `auto`. */
const chosen = (v: unknown): string | undefined => (v === undefined || v === "" || v === "auto" ? undefined : String(v));

/** Small zones: `compact` set off Auto, else the old `variant` (studio = dense) and `compactView` (on = card, off = full). */
export function compactOf(s: ModuleSettings): CompactMode {
  const mode = oneOf(s.compact, COMPACT_MODES);
  if (mode && mode !== "auto") return mode;
  if (s.variant === "studio") return "dense";
  return s.compactView === "on" ? "card" : s.compactView === "off" ? "full" : "auto";
}

/** The forced size tier: `sizeTier`, else the old `layout`; undefined = measured from the zone. */
export function sizeTierOf(s: ModuleSettings): SizeTier | undefined {
  return oneOf(s.sizeTier, SIZE_TIERS) ?? LAYOUT_TIERS[String(s.layout)];
}

/** The two axes of a cell code (`auto` / unknown: both auto). */
export function alignAxes(code: unknown): { alignX: AlignX; alignY: AlignY } {
  if (!isAlignCode(code)) return { alignX: "auto", alignY: "auto" };
  return { alignX: COLS[code[1]], alignY: ROWS[code[0]] };
}

/**
 * The cell code of two axes ("between" picks no column: the spread is its
 * own key); an axis left auto takes the centre. Neither set: `auto`.
 */
export function alignCodeOf(x: unknown, y: unknown): AlignCode | "auto" {
  const col = COL_OF[String(x)];
  const row = ROW_OF[String(y)];
  if (!col && !row) return "auto";
  return `${row ?? "m"}${col ?? "c"}` as AlignCode;
}

/**
 * The content alignment as the shell reads it: `align` (+ `alignSpread`:
 * the horizontal axis spreads) once either is set off Auto, else the old
 * `alignX` / `alignY`.
 */
export function alignOf(s: ModuleSettings): { alignX: AlignX; alignY: AlignY } {
  if (isAlignCode(s.align) || s.alignSpread === true || (s.alignX === undefined && s.alignY === undefined)) {
    const axes = alignAxes(s.align);
    return s.alignSpread === true ? { ...axes, alignX: "between" } : axes;
  }
  return {
    alignX: oneOf(s.alignX, ["auto", "start", "center", "end", "between"] as const) ?? "auto",
    alignY: oneOf(s.alignY, ["auto", "start", "center", "end"] as const) ?? "auto",
  };
}

/** A stored threshold level: a number, `off`, or undefined (unset / not a number). */
export function levelOf(v: ModuleSettingValue | undefined): number | typeof OFF | undefined {
  if (v === OFF) return OFF;
  if (v === undefined || v === "" || typeof v === "boolean") return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

/** A level as the widgets compare with it: `off` never trips (Infinity). */
const tripAt = (v: ModuleSettingValue | undefined): number | undefined => {
  const level = levelOf(v);
  return level === OFF ? Number.POSITIVE_INFINITY : level;
};

/**
 * A quantity's warning and critical levels (`warn.<q>` / `crit.<q>`), else
 * the widget's old keys; `off` reads as Infinity so the widget's own
 * default never takes over, unset as undefined.
 */
export function thresholdsOf(s: ModuleSettings, q: ThresholdQuantity, legacy?: readonly [string, string]): { warn?: number; crit?: number } {
  const warn = tripAt(s[warnKey(q)] ?? (legacy ? s[legacy[0]] : undefined));
  const crit = tripAt(s[critKey(q)] ?? (legacy ? s[legacy[1]] : undefined));
  return { ...(warn !== undefined ? { warn } : {}), ...(crit !== undefined ? { crit } : {}) };
}

/** The picked device (`device`, else the widget's old key); undefined = Auto. */
export const deviceOf = (s: ModuleSettings, legacy?: string): string | undefined =>
  chosen(s.device) ?? (legacy ? chosen(s[legacy]) : undefined);

/** The picked devices (`devices`, comma-separated, else the old key); undefined = all. */
export function devicesOf(s: ModuleSettings, legacy?: string): string[] | undefined {
  const raw = s.devices !== undefined && s.devices !== "" ? s.devices : legacy ? s[legacy] : undefined;
  const ids = typeof raw === "string" ? raw.split(",").map((k) => k.trim()).filter(Boolean) : [];
  return ids.length > 0 ? ids : undefined;
}

/** The temperature unit: `tempUnit` (c / f), else the old `units` (C / F); °C by default. */
export function tempUnitOf(s: ModuleSettings): "c" | "f" {
  const unit = s.tempUnit ?? (typeof s.units === "string" ? s.units.toLowerCase() : undefined);
  return unit === "f" ? "f" : "c";
}

/** A °C value in the unit (`f`: Fahrenheit). */
export const inUnit = (celsius: number, unit: "c" | "f"): number => (unit === "f" ? (celsius * 9) / 5 + 32 : celsius);

/** A value in the unit back to °C. */
export const toCelsius = (value: number, unit: "c" | "f"): number => (unit === "f" ? ((value - 32) * 5) / 9 : value);

/** The decimals (`decimals`, else the old key): a whole number 0–4, or undefined for auto / unset. */
export function decimalsOf(s: ModuleSettings, legacy?: string): number | undefined {
  const raw = s.decimals !== undefined && s.decimals !== "" && s.decimals !== "auto" ? s.decimals : legacy ? s[legacy] : undefined;
  if (raw === undefined || raw === "" || raw === "auto") return undefined;
  const n = Number(raw);
  return Number.isInteger(n) && n >= 0 && n <= 4 ? n : undefined;
}

/** The clock format: `clock` (auto = the locale's, 24, 12), else a Clock's old `format` (24h / 12h). */
export function clockOf(s: ModuleSettings): "auto" | "24" | "12" {
  const v = s.clock ?? (s.format === "12h" ? "12" : s.format === "24h" ? "24" : undefined);
  return v === "24" || v === "12" ? v : "auto";
}

/** The 12-hour switch of a clock format (`auto`: undefined, the locale decides). */
export const hour12Of = (clock: unknown): boolean | undefined => (clock === "12" ? true : clock === "24" ? false : undefined);
