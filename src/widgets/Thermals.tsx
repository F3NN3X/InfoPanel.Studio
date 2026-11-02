import { readSystemFlat } from "@/lib/system-metrics";
import { inUnit } from "@/modules/setting-readers";
import type { ModuleSettings } from "@/modules/types";
import { useFitRows, Widget, shell, get, num, fmt, diskShort, tone, TONES, useHistory, Empty, Ring, Num, ToneCue, slideX, hw, type Tone, type ShellProps } from "./kit";
import { readings } from "./hardware-readings";
import { meta } from "./meta/Thermals";

export { meta };

export interface ThermalsProps extends ShellProps {
  look?: ModuleSettings;
  sortBy?: "hottest" | "fixed";
  /** Overrides the per-sensor warn / crit (°C; Infinity = that level is off). */
  warn?: number;
  crit?: number;
  /** The unit the temperatures read in (the levels and the bar scale stay °C). */
  tempUnit?: "c" | "f";
  /** Bar scale, default 100. */
  max?: number;
  /** `gauges` draws the hottest four sensors as rings with a fan row under them. */
  view?: "bars" | "gauges";
  /** Read every `libre.*` / `hwinfo.*` temperature instead of the curated CPU / GPU / disk / VRM list. */
  discover?: boolean;
  /** Gauges view: the fan readings row (default on) and its dot colour (empty = blue). */
  showFans?: boolean;
  fanColor?: string;
}

interface Sensor {
  id: string;
  label: string;
  v: number;
  warn: number;
  crit: number;
  t: Tone;
}

export default function Thermals(p: ThermalsProps) {
  const d = p.data;
  const cpu = hw(d).cpu,
    gpu = hw(d).gpu;
  const L = (k: string) => num(get(d, `libre.${k}`));
  const raw: { id: string; label: string; v: number; warn: number; crit: number }[] = [];
  if (p.discover) for (const r of readings(d, p.names)) if (r.kind === "temp") raw.push({ id: r.key, label: r.label, v: r.value, warn: 70, crit: 85 });
  if (cpu && !p.discover) raw.push({ id: "cpu", label: "CPU", v: readSystemFlat(d ?? {}).cpu.temp ?? NaN, warn: 80, crit: 90 });
  if (gpu && !p.discover) {
    raw.push({ id: "gpu", label: "GPU", v: L(`${gpu}_gpu_core`), warn: 75, crit: 85 });
    raw.push({ id: "hot", label: "GPU memory", v: L(`${gpu}_gpu_memory_junction`), warn: 90, crit: 100 });
  }
  for (const s of p.discover ? [] : hw(d).disks)
    raw.push({ id: s, label: diskShort(s, get(d, `libre.${s}_volumes`)), v: [`${s}_composite_temperature`, `${s}_temperature`, `${s}_temperature__2`].map(L).find(Number.isFinite) ?? NaN, warn: L(`${s}_warning_temperature`) || 70, crit: L(`${s}_critical_temperature`) || 85 });
  if (!p.discover) raw.push({ id: "vrm", label: "VRM", v: readSystemFlat(d ?? {}).board.vrm ?? NaN, warn: 90, crit: 105 });
  const list: Sensor[] = raw.filter((x) => Number.isFinite(x.v) && x.v > 0).map((x) => ({ ...x, t: tone(x.v, p.warn ?? x.warn, p.crit ?? x.crit) }));
  if (p.sortBy !== "fixed") list.sort((a, b) => b.v - a.v);
  const top = list[0];
  const hist = useHistory(top?.v ?? NaN);
  const max = p.max ?? 100;
  const unit = p.tempUnit ?? "c";
  const deg = unit === "f" ? "°F" : "°C";
  /** A temperature as shown, in the chosen unit. */
  const T = (c: number) => fmt(inUnit(c, unit), 0);
  if (!top)
    return (
      <Widget {...shell(p)} title="Thermals" icon="device_thermostat">
        <Empty />
      </Widget>
    );
  return (
    <Widget
      {...shell(p)}
      title={p.title ?? "Thermals"}
      icon="device_thermostat"
      studio={{ label: "Thermals", value: inUnit(top.v, unit), unit: deg, sub: `Hottest · ${top.label}`, t: top.t, rows: list.map((x) => ({ n: x.label, v: `${T(x.v)}${deg}`, pct: (x.v / max) * 100 })) }}
      compact={{ label: `Hottest · ${top.label}`, value: inUnit(top.v, unit), unit: deg, sub: list.slice(1, 3).map((x) => `${x.label} ${T(x.v)}°`).join(" · "), hist, t: top.t }}
    >
      {({ size, w, h }) => {
        if (p.view === "gauges") {
          const fans = p.showFans === false ? [] : readings(d, p.names).filter((r) => r.kind === "fan").slice(0, 4);
          const ring = Math.round(Math.min(96, Math.max(44, h * 0.24)));
          return (
            <div className="flex h-full flex-col items-center justify-center gap-3 overflow-hidden">
              <div className="grid grid-cols-2 justify-items-center gap-x-4 gap-y-3">
                {list.slice(0, 4).map((x) => (
                  <div key={x.id} className="flex flex-col items-center gap-1">
                    <div style={{ width: ring }}>
                      <Ring value={x.v} max={max} thickness={9} t={x.t}>
                        <Num className="text-sm font-semibold">{T(x.v)}°</Num>
                      </Ring>
                    </div>
                    <span className="max-w-[96px] truncate text-[11px] text-[color:var(--w-muted)]" title={x.label}>
                      {x.label}
                    </span>
                  </div>
                ))}
              </div>
              {fans.length > 0 && (
                <div className="flex flex-wrap justify-center gap-2">
                  {fans.map((r) => (
                    <span key={r.key} className="inline-flex items-center gap-1.5 rounded-full bg-[color:var(--w-track)] px-2.5 py-1 text-[11px]" title={r.label}>
                      <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: p.fanColor || "#38bdf8" }} />
                      <span className="max-w-[120px] truncate text-[color:var(--w-muted)]">{r.label}</span>
                      <span className="font-semibold tabular-nums">{r.text}</span>
                    </span>
                  ))}
                </div>
              )}
            </div>
          );
        }
        // Rows of a 16px line (20px large) 10px apart; under 180px wide the bar drops and a row is name + value.
        const n = useFitRows(h, size === "lg" ? 20 : 16, 10);
        const narrow = w > 0 && w < 180;
        return (
          <ul className="flex h-full flex-col justify-center gap-2.5 overflow-hidden">
            {list.slice(0, n).map((x) => (
              <li key={x.id} className={`grid items-center text-xs ${narrow ? "grid-cols-[minmax(0,1fr)_auto] gap-2" : "grid-cols-[minmax(40px,90px)_minmax(0,1fr)_48px] gap-3"}`}>
                <span className="truncate text-[color:var(--w-fg)]">{x.label}</span>
                {!narrow && (
                  <div className="relative h-2 overflow-hidden rounded-full bg-[color:var(--w-track)]">
                    <div className="absolute inset-0 rounded-full transition-transform duration-700 ease-out" style={{ ...slideX((x.v / max) * 100), background: `linear-gradient(90deg, ${TONES.ok}, ${TONES[x.t]})` }} />
                    {Number.isFinite(p.warn ?? x.warn) && <div className="absolute inset-y-0 w-0.5" style={{ left: `${((p.warn ?? x.warn) / max) * 100}%`, background: "color-mix(in oklab, #f59e0b 80%, var(--w-fg))" }} />}
                  </div>
                )}
                <span className="text-right font-medium tabular-nums" style={x.t !== "ok" ? { color: TONES[x.t] } : undefined}>
                  <ToneCue t={x.t} />
                  {T(x.v)}
                  {deg}
                </span>
              </li>
            ))}
          </ul>
        );
      }}
    </Widget>
  );
}
