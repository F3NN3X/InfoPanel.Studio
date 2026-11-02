import { cn } from "@/lib/utils";
import { OFF, QUANTITIES, type QuantitySpec } from "@/lib/theme-model";
import { inUnit, levelOf } from "@/modules/setting-readers";
import type { ModuleSettingValue, ThresholdQuantity } from "@/modules/types";
import { FIELD, StackRow, type RowLabelProps } from "./setting-rows";

/**
 * One quantity's thresholds (SPEC §4.4): a zone bar (green / amber / red,
 * widths from the levels) over a Warning and a Critical slider, each with an
 * Off chip (stores "off"). Critical never sits below Warning: moving one past
 * the other takes it along. Temperatures are stored in °C and read in °F when
 * the widget's temperature unit is f. The Value quantity has no fixed range:
 * number boxes instead of sliders, the bar spans 0 to a little past the levels.
 */

/** A stored level: a number or "off". */
export type Level = number | typeof OFF;

export interface Levels {
  warn: Level;
  crit: Level;
}

/** A stored value as a level (anything unreadable: the fallback). */
export const asLevel = (v: ModuleSettingValue | undefined, fallback: Level): Level => levelOf(v) ?? fallback;

/** The levels with one changed; Critical stays at or above Warning (the other one follows). */
export function nextLevels(levels: Levels, which: keyof Levels, value: Level): Levels {
  const next = { ...levels, [which]: value };
  if (typeof next.warn !== "number" || typeof next.crit !== "number" || next.crit >= next.warn) return next;
  return which === "warn" ? { ...next, crit: next.warn } : { ...next, warn: next.crit };
}

/** The bar's range: the quantity's own, or for Value 0 to a little past the highest level (at least 100). */
export function rangeOf(q: ThresholdQuantity, levels: Levels): { min: number; max: number } {
  const spec = QUANTITIES[q];
  if (q !== "value") return { min: spec.min, max: spec.max };
  const top = Math.max(0, ...[levels.warn, levels.crit].filter((v): v is number => typeof v === "number"));
  return { min: Math.min(0, ...[levels.warn, levels.crit].filter((v): v is number => typeof v === "number")), max: Math.max(100, Math.ceil((top * 1.25) / 10) * 10) };
}

/** The zone bar's widths in percent: ok up to the first level that is on, amber to Critical, red after it. */
export function zoneWidths(levels: Levels, range: { min: number; max: number }): { ok: number; warn: number; crit: number } {
  const at = (v: Level) => (typeof v === "number" ? Math.min(100, Math.max(0, ((v - range.min) / (range.max - range.min || 1)) * 100)) : 100);
  const w = at(levels.warn);
  const c = at(levels.crit);
  const ok = Math.min(w, c);
  return { ok, warn: Math.max(0, c - ok) * (levels.warn === OFF ? 0 : 1), crit: 100 - c };
}

/** A level as shown: "Off", or the value in the shown unit (temperatures in °F when the unit is f). */
export function levelText(level: Level, q: ThresholdQuantity, tempUnit: "c" | "f" = "c"): string {
  if (level === OFF) return "Off";
  if (q === "temp") return `${Math.round(inUnit(level, tempUnit))}${tempUnit === "f" ? "°F" : "°C"}`;
  // A widget's own default can sit between steps (Audio Meter's old hot zone, −0.9 dB).
  if (q === "db") return `${Math.round(level * 10) / 10} dB`;
  return `${level}${QUANTITIES[q].unit}`;
}

const ZONES = { ok: "oklch(0.74 0.16 150)", warn: "oklch(0.78 0.15 75)", crit: "oklch(0.68 0.19 25)" };

function ZoneBar({ levels, range }: { levels: Levels; range: { min: number; max: number } }) {
  const z = zoneWidths(levels, range);
  return (
    <div aria-hidden className="flex h-1.5 overflow-hidden rounded-full bg-ui-app">
      <span style={{ width: `${z.ok}%`, background: ZONES.ok }} />
      <span style={{ width: `${z.warn}%`, background: ZONES.warn }} />
      <span style={{ width: `${z.crit}%`, background: ZONES.crit }} />
    </div>
  );
}

interface LevelLineProps {
  name: string;
  level: Level;
  spec: QuantitySpec;
  free: boolean;
  text: string;
  /** The level "Off" goes back to. */
  fallback: number;
  onChange: (level: Level) => void;
}

/** One level: its slider (a number box for a free range), the value as shown, and the Off chip. */
function LevelLine({ name, level, spec, free, text, fallback, onChange }: LevelLineProps) {
  const off = level === OFF;
  const value = off ? fallback : level;
  return (
    <div className="flex min-h-[26px] items-center gap-2">
      <span className="w-[58px] shrink-0 text-[11.5px] text-ui-3">{name}</span>
      {free ? (
        <input
          type="number"
          aria-label={name}
          disabled={off}
          value={value}
          onChange={(e) => e.target.value !== "" && onChange(Number(e.target.value))}
          className={cn(FIELD, "h-[26px] min-w-0 flex-1 px-1.5 text-right font-ui-mono text-[11.5px] disabled:opacity-40")}
        />
      ) : (
        <input
          type="range"
          aria-label={name}
          disabled={off}
          min={spec.min}
          max={spec.max}
          step={spec.step}
          value={value}
          onChange={(e) => onChange(e.currentTarget.valueAsNumber)}
          className="m-0 h-4 min-w-0 flex-1 cursor-pointer accent-[var(--ui-accent)] disabled:cursor-default disabled:opacity-40"
        />
      )}
      <span className="min-w-[46px] text-right font-ui-mono text-micro text-ui-1">{text}</span>
      <button
        type="button"
        aria-pressed={off}
        aria-label={`${name} off`}
        title={off ? `Turn ${name.toLowerCase()} on` : `Turn ${name.toLowerCase()} off`}
        onClick={() => onChange(off ? fallback : OFF)}
        className={cn(
          "h-6 shrink-0 rounded-md border px-2 text-micro transition-colors",
          off ? "border-ui-edge bg-ui-active text-ui-1" : "border-ui-strong text-ui-3 hover:text-ui-1"
        )}
      >
        Off
      </button>
    </div>
  );
}

export interface ThresholdsRowProps extends RowLabelProps {
  quantity: ThresholdQuantity;
  /** The shown values of `warn.<q>` / `crit.<q>`. */
  warn: ModuleSettingValue | undefined;
  crit: ModuleSettingValue | undefined;
  /** The defaults "Off" goes back to (the row's, else the quantity's). */
  defaults?: { warn?: ModuleSettingValue; crit?: ModuleSettingValue };
  /** The widget's resolved temperature unit (temperatures read in °F for f). */
  tempUnit?: "c" | "f";
  /** The levels that changed (only those). */
  onChange: (patch: Partial<Levels>) => void;
}

export function ThresholdsRow({ quantity, warn, crit, defaults, tempUnit = "c", onChange, ...label }: ThresholdsRowProps) {
  const spec = QUANTITIES[quantity];
  const levels: Levels = { warn: asLevel(warn, spec.warn), crit: asLevel(crit, spec.crit) };
  const fallback = {
    warn: typeof levelOf(defaults?.warn) === "number" ? (levelOf(defaults?.warn) as number) : spec.warn,
    crit: typeof levelOf(defaults?.crit) === "number" ? (levelOf(defaults?.crit) as number) : spec.crit,
  };
  const set = (which: keyof Levels, value: Level) => {
    const next = nextLevels(levels, which, value);
    const patch: Partial<Levels> = {};
    if (next.warn !== levels.warn) patch.warn = next.warn;
    if (next.crit !== levels.crit) patch.crit = next.crit;
    if (Object.keys(patch).length > 0) onChange(patch);
  };
  const free = quantity === "value";
  return (
    <StackRow {...label}>
      <div className="space-y-1.5">
        <ZoneBar levels={levels} range={rangeOf(quantity, levels)} />
        <LevelLine name="Warning" level={levels.warn} spec={spec} free={free} text={levelText(levels.warn, quantity, tempUnit)} fallback={fallback.warn} onChange={(v) => set("warn", v)} />
        <LevelLine name="Critical" level={levels.crit} spec={spec} free={free} text={levelText(levels.crit, quantity, tempUnit)} fallback={fallback.crit} onChange={(v) => set("crit", v)} />
      </div>
    </StackRow>
  );
}
