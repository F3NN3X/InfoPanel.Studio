import { inUnit } from "@/modules/setting-readers";
import type { ModuleSettings } from "@/modules/types";
import Discovered from "./SensorGroup/Discovered";
import { Widget, shell, get, num, fmt, has, hw, sensorLabel, useFitRows, Bar, Num, tone, TONES, type ShellProps } from "./kit";
import { meta } from "./meta/SensorGroup";

export { meta };

export interface SensorItem {
  key: string;
  /** Blank = the sensor's display name. */
  label?: string;
  max?: number;
  warn?: number;
  crit?: number;
  decimals?: number;
}

/** The list for an empty `sensors`: this machine's own CPU, GPU, memory and volume (no hardware is assumed). */
function sampleItems(d: ShellProps["data"]): SensorItem[] {
  const gpu = hw(d).gpu;
  return [
    { key: "system.cpu.load", label: "CPU", max: 100 },
    ...(gpu ? [{ key: `libre.${gpu}_gpu_core_load`, label: "GPU", max: 100 }, { key: `libre.${gpu}_gpu_core`, label: "GPU temp", max: 100, warn: 75 }] : []),
    { key: "system.ram.load", label: "RAM", max: 100 },
    { key: "plugins.volume-plugin.default.volume", label: "Volume", max: 100 },
  ];
}

/** Fewer decimals for big readings: 0.85 V keeps two, 4.5 one, 62 none. */
export const autoDecimals = (v: number): number => (!Number.isFinite(v) || v === 0 ? 0 : Math.abs(v) < 1 ? 2 : Math.abs(v) < 10 ? 1 : 0);

export interface SensorGroupProps extends ShellProps {
  look?: ModuleSettings;
  sensors?: SensorItem[];
  layout?: "auto" | "rows" | "grid";
  /** Show a bar per item (default true). */
  bars?: boolean;
  /** The unit a °C reading is shown in (its levels and bar stay °C). */
  tempUnit?: "c" | "f";
  /** List every `libre.*` / `hwinfo.*` reading instead of `sensors` (temps, fans, power first). */
  auto?: boolean;
  /** Auto mode: rows shown, 0 = all (default 12). */
  maxRows?: number;
  /** Auto mode: the dot colour per reading kind; empty = temperature red, fan blue, power amber. */
  tempColor?: string;
  fanColor?: string;
  powerColor?: string;
}

export default function SensorGroup(p: SensorGroupProps) {
  return p.auto ? <Discovered {...p} /> : <Listed {...p} />;
}

function Listed(p: SensorGroupProps) {
  const d = p.data;
  const items = (p.sensors ?? sampleItems(d)).map((s) => {
    const raw = get(d, s.key);
    const v = num(raw);
    const unit = String(raw).replace(/^[-\d.,\s]+/, "").trim();
    const label = s.label || sensorLabel(s.key, p.names, (s.key.split(".").pop() ?? s.key).replace(/[_-]+/g, " "));
    // no stored maximum: a percentage or a temperature fills to 100 (as SensorValue), anything else has no bar
    const max = s.max ?? (unit === "%" || unit.includes("°") ? 100 : undefined);
    // a °C reading reads in °F when the unit is f; the thresholds and the bar compare the °C value
    const fahrenheit = p.tempUnit === "f" && /^°C?$/.test(unit);
    const shown = fahrenheit ? inUnit(v, "f") : v;
    return { ...s, label, raw, v, unit: fahrenheit ? "°F" : unit, shown, max, decimals: s.decimals ?? autoDecimals(shown), t: tone(v, s.warn, s.crit) };
  });
  const first = items[0];
  return (
    <Widget
      {...shell(p)}
      title={p.title ?? "Sensors"}
      icon="view_list"
      studio={first && { label: p.title ?? "Sensors", value: first.shown, unit: first.unit, rows: items.map((x) => ({ n: x.label, v: `${Number.isFinite(x.v) ? fmt(x.shown, x.decimals) : x.raw} ${x.unit}`, pct: x.max ? (x.v / x.max) * 100 : undefined })) }}
      compact={first && { label: first.label, value: first.shown, unit: first.unit, sub: items.slice(1, 3).map((x) => `${x.label} ${fmt(x.shown, 0)}${x.unit}`).join(" · "), pct: first.max ? (first.v / first.max) * 100 : undefined, t: first.t }}
    >
      {({ w, h }) => {
        const grid = p.layout === "grid" || (p.layout !== "rows" && w / h > 1.6 && w > 400);
        if (grid) {
          const cols = Math.max(1, Math.min(items.length, Math.floor((w + 8) / 128)));
          return (
            <div className="grid h-full gap-2" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0,1fr))`, gridAutoRows: "minmax(0,1fr)" }}>
              {items.slice(0, cols * useFitRows(h, p.bars !== false ? 76 : 68, 8)).map((x) => (
                <div key={x.key} className="flex min-w-0 flex-col justify-between gap-1 rounded-xl bg-[color:var(--w-track)] p-2.5">
                  <span className="truncate text-[11px] text-[color:var(--w-muted)]">{x.label}</span>
                  <Num className="text-xl font-semibold" style={x.t !== "ok" ? { color: TONES[x.t] } : undefined}>
                    {Number.isFinite(x.v) ? fmt(x.shown, x.decimals) : x.raw}
                    <span className="ml-0.5 text-[11px] text-[color:var(--w-faint)]">{x.unit}</span>
                  </Num>
                  {p.bars !== false && x.max && <Bar value={x.v} max={x.max} t={x.t} className="h-1" />}
                </div>
              ))}
            </div>
          );
        }
        return (
          <ul className="flex h-full flex-col justify-center gap-2.5 overflow-hidden">
            {items.slice(0, useFitRows(h, p.bars !== false ? 28 : 20, 10)).map((x) => (
              <li key={x.key} className="flex flex-col gap-1">
                <div className="flex items-baseline gap-2 text-xs">
                  <span className="truncate text-[color:var(--w-fg)]">{x.label}</span>
                  <span className="ml-auto font-medium tabular-nums" style={x.t !== "ok" ? { color: TONES[x.t] } : undefined}>
                    {Number.isFinite(x.v) ? fmt(x.shown, x.decimals) : has(x.raw) ? x.raw : "–"}
                    <span className="text-[color:var(--w-faint)]"> {x.unit}</span>
                  </span>
                </div>
                {p.bars !== false && x.max && <Bar value={x.v} max={x.max} t={x.t} className="h-1" />}
              </li>
            ))}
          </ul>
        );
      }}
    </Widget>
  );
}
