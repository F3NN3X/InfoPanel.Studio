import { inUnit } from "@/modules/setting-readers";
import type { ModuleSettings } from "@/modules/types";
import { fitRows, StatGrid, Widget, shell, get, num, fmt, pretty, has, Metric, Ring, Spark, Stat, useHistory, tone, Empty, heat, hw, Num, type ShellProps, type WidgetMeta } from "./kit";

export const meta: WidgetMeta = {
  id: "CpuMonitor",
  name: "CPU Monitor",
  category: "Hardware",
  icon: "memory",
  prefixes: ["libre.amd_", "libre.intel_", "libre.embedded_controller"],
  defaultSize: [3, 2],
  minSize: [1, 1],
  description: "Total + per-core load, clocks, temperature, package power, VID, VRM and fan.",
};

export interface CpuMonitorProps extends ShellProps {
  look?: ModuleSettings;
  cpu?: string;
  coreView?: "bars" | "heatmap" | "off";
  coreMetric?: "load" | "clock";
  heatRamp?: "accent" | "thermal";
  warn?: number;
  crit?: number;
  /** The unit its temperatures read in (default °C). */
  tempUnit?: "c" | "f";
  /** The temperatures' decimals; unset: none in the header and card, one for Tctl/Tdie. */
  decimals?: number;
}

interface Core {
  i: number;
  load: number;
  mhz: number;
  vid: number;
  w: number;
}

export default function CpuMonitor(p: CpuMonitorProps) {
  const d = p.data;
  const id = p.cpu ?? hw(d).cpu;
  const k = (s: string) => get(d, `libre.${id}_${s}`);
  const total = num(k("cpu_total")),
    maxCore = num(k("cpu_core_max"));
  const temp = num(k("core__tctl_tdie")),
    power = num(k("package")),
    clock = num(k("cores__average_effective"));
  const vrm = num(get(d, "libre.embedded_controller_vrm")),
    fan = num(get(d, "libre.embedded_controller_cpu_optional_fan"));
  const cores: Core[] = [];
  for (let i = 1; i <= 64; i++) {
    const l = k(`cpu_core__${i}`);
    if (!has(l)) break;
    cores.push({ i, load: num(l), mhz: num(k(`core__${i}__effective`)), vid: num(k(`core__${i}_vid`)), w: num(k(`core__${i}__smu`)) });
  }
  const hist = useHistory(total);
  if (!id)
    return (
      <Widget {...shell(p)} title="CPU" icon="memory">
        <Empty />
      </Widget>
    );
  const view = p.coreView ?? "bars",
    metric = p.coreMetric ?? "load";
  // a core without a clock reading (NaN) must not poison the scale, nor draw a NaN bar
  const maxMhz = Math.max(1, ...cores.map((c) => c.mhz).filter(Number.isFinite));
  const cv = (c: Core) => (metric === "clock" ? (Number.isFinite(c.mhz) ? (c.mhz / maxMhz) * 100 : 0) : c.load);
  const cols = cores.length > 8 ? 8 : cores.length;
  const sq = ["tui", "hud", "retro"].includes(p.skin ?? "") ? "rounded-none" : "rounded-[5px]";
  const warn = p.warn ?? 75,
    crit = p.crit ?? 90;
  const name = p.title ?? pretty(id).replace(/^AMD Ryzen (\d) /, "Ryzen $1 ");
  /** A °C reading in the temperature unit, with the chosen decimals (else `auto`). */
  const deg = (c: number, auto: number, space = "") => `${fmt(inUnit(c, p.tempUnit ?? "c"), p.decimals ?? auto)}${space}°${p.tempUnit === "f" ? "F" : "C"}`;
  return (
    <Widget
      {...shell(p)}
      title={name}
      icon="memory"
      compact={{ label: "CPU", value: total, unit: "%", sub: Number.isFinite(temp) && temp > 0 ? `${deg(temp, 0)} · ${fmt(power, 0)} W` : `${fmt(power, 0)} W`, hist, min: 0, max: 100, t: tone(total, warn, crit) }}
      right={Number.isFinite(temp) && temp > 0 && <span className="tabular-nums text-[color:var(--w-fg)]">{deg(temp, 0)}</span>}
    >
      {({ size, h }) =>
        size === "xs" ? (
          <div className="flex h-full items-center justify-between gap-2">
            <Metric label={h >= 72 ? "CPU" : undefined} value={total} unit="%" scale={h >= 100 ? "lg" : h >= 60 ? "md" : "sm"} t={tone(total, warn, crit)} />
            <Spark values={hist} min={0} max={100} className="h-8 w-1/2" />
          </div>
        ) : size === "sm" ? (
          <div className="flex h-full items-center gap-3">
            <Ring value={total} t={tone(total, warn, crit)} thickness={9} className="h-full max-h-28">
              <Num className="text-xl font-semibold">
                {fmt(total, 0)}
                <span className="text-xs text-[color:var(--w-muted)]">%</span>
              </Num>
            </Ring>
            <div className="grid min-w-0 flex-1 gap-1.5">
              {[
                <Stat key="max" label="Max core" value={`${fmt(maxCore, 0)}%`} />,
                <Stat key="pkg" label="Package" value={`${fmt(power, 1)} W`} />,
                <Stat key="clk" label="Clock" value={`${fmt(clock / 1000, 2)} GHz`} />,
              ].slice(0, h > 0 ? fitRows(h, 38, 6) : 3)}
            </div>
          </div>
        ) : (
          <div className="flex h-full flex-col gap-3">
            <div className="flex items-end gap-5">
              <Metric value={total} unit="%" scale={size === "lg" ? "xl" : "lg"} sub="Total load" t={tone(total, warn, crit)} />
              <div className="grid flex-1 grid-cols-3 gap-3">
                <Stat label="Max core" value={`${fmt(maxCore, 0)}%`} />
                <Stat label="Package" value={`${fmt(power, 1)} W`} />
                <Stat label="Avg clock" value={`${fmt(clock / 1000, 2)} GHz`} />
              </div>
            </div>
            {size === "md" && <Spark values={hist} min={0} max={100} className="min-h-0 flex-1" />}
            {cores.length > 0 && view === "heatmap" && (
              // rows share the height left over (20px at most below large), so a short box squeezes them instead of overflowing
              <div className="grid min-h-0 flex-1 gap-1" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0,1fr))`, gridAutoRows: "minmax(0,1fr)", maxHeight: size === "lg" ? undefined : Math.ceil(cores.length / cols) * 24 - 4 }}>
                {cores.map((c) => {
                  const v = cv(c);
                  return (
                    <div
                      key={c.i}
                      title={`Core ${c.i} · ${fmt(c.load, 0)}% · ${fmt(c.mhz, 0)} MHz · ${fmt(c.vid, 2)} V · ${fmt(c.w, 1)} W`}
                      className={`flex items-center justify-center ${sq} text-[10px] font-medium tabular-nums transition-colors duration-700`}
                      style={{ background: heat(v, p.heatRamp ?? "accent"), color: v > 55 ? "#0c0c0e" : "#a1a1aa" }}
                    >
                      {size === "lg" && (metric === "clock" ? fmt(c.mhz / 1000, 1) : fmt(c.load, 0))}
                    </div>
                  );
                })}
              </div>
            )}
            {cores.length > 0 && view === "bars" && (
              <div className="grid min-h-0 flex-1 gap-1" style={{ gridTemplateColumns: `repeat(${size === "lg" ? cores.length : cols}, minmax(0,1fr))`, gridAutoRows: "minmax(0,1fr)", maxHeight: size === "lg" ? undefined : Math.ceil(cores.length / cols) * 24 - 4 }}>
                {cores.map((c) => {
                  const v = cv(c);
                  return (
                    <div key={c.i} title={`Core ${c.i} · ${fmt(c.load, 0)}% · ${fmt(c.mhz, 0)} MHz · ${fmt(c.vid, 2)} V`} className={`relative flex h-full flex-col justify-end overflow-hidden ${sq} bg-[color:var(--w-track)]`}>
                      <div className={`w-full ${sq} transition-[height] duration-700 ease-out`} style={{ height: `${Math.max(4, v)}%`, background: "var(--accent)", opacity: 0.4 + v / 170 }} />
                      {size === "lg" && <span className="absolute inset-x-0 bottom-0.5 text-center text-[9px] tabular-nums text-[color:var(--w-fg)]/80">{c.i}</span>}
                    </div>
                  );
                })}
              </div>
            )}
            {size === "lg" && (
              <StatGrid
                cols={4}
                items={[
                  { label: "Tctl/Tdie", value: deg(temp, 1, " ") },
                  { label: "Core VID", value: `${fmt(cores[0]?.vid ?? NaN, 2)} V` },
                  { label: "VRM", value: Number.isFinite(vrm) ? deg(vrm, 0, " ") : "–" },
                  { label: "CPU fan", value: Number.isFinite(fan) ? `${fmt(fan, 0)} RPM` : "–" },
                ]}
              />
            )}
          </div>
        )
      }
    </Widget>
  );
}
