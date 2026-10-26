import type { ModuleSettings } from "@/modules/types";
import { Widget, shell, get, num, fmt, Metric, Ring, Spark, Stat, Bar, useHistory, tone, Num, type ShellProps } from "./kit";
import { meta } from "./meta/MemoryUsage";

export { meta };

export interface MemoryUsageProps extends ShellProps {
  look?: ModuleSettings;
  warn?: number;
  crit?: number;
}

interface Mem {
  pct: number;
  used: number;
  free: number;
}

export default function MemoryUsage(p: MemoryUsageProps) {
  const d = p.data;
  const m = (s: string) => num(get(d, `libre.${s}`));
  const phys: Mem = { pct: m("total_memory_memory"), used: m("total_memory_memory_used"), free: m("total_memory_memory_available") };
  const virt: Mem = { pct: m("virtual_memory_memory"), used: m("virtual_memory_memory_used"), free: m("virtual_memory_memory_available") };
  const pctKey = "libre.total_memory_memory";
  const hist = useHistory(phys.pct);
  const warn = p.warn ?? 80,
    crit = p.crit ?? 92;
  const row = (l: string, v: Mem, key: string) => (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline gap-2 text-xs">
        <span className="text-[color:var(--w-fg)]">{l}</span>
        <span className="text-[11px] tabular-nums text-[color:var(--w-faint)]">
          {fmt(v.used, 1)} / {fmt(v.used + v.free, 0)} GB
        </span>
        <span className="ml-auto font-medium tabular-nums">{fmt(v.pct, 0)}%</span>
      </div>
      <Bar ipKey={key} value={v.pct} t={tone(v.pct, warn, crit)} className="h-2" />
    </div>
  );
  return (
    <Widget
      {...shell(p)}
      title={p.title ?? "Memory"}
      icon="memory_alt"
      compact={{ label: "RAM", value: phys.pct, unit: "%", sub: `${fmt(phys.used, 1)} / ${fmt(phys.used + phys.free, 0)} GB`, pct: phys.pct, kind: "ring", t: tone(phys.pct, warn, crit) }}
    >
      {({ size }) =>
        size === "xs" ? (
          <Metric ipKey={pctKey} label="RAM" value={phys.pct} unit="%" scale="lg" sub={`${fmt(phys.used, 1)} GB used`} t={tone(phys.pct, warn, crit)} className="h-full justify-center" />
        ) : size === "sm" ? (
          <div className="flex h-full flex-col justify-center gap-3">
            {row("Physical", phys, pctKey)}
            {row("Virtual", virt, "libre.virtual_memory_memory")}
          </div>
        ) : (
          <div className="flex h-full gap-5">
            <Ring ipKey={pctKey} value={phys.pct} t={tone(phys.pct, warn, crit)} thickness={8} className="h-full max-h-[180px] shrink-0">
              <Num ipKey={pctKey} ipUnit="%" className={`${size === "lg" ? "text-4xl" : "text-2xl"} font-semibold`}>
                {fmt(phys.pct, 0)}
                <span className="text-sm text-[color:var(--w-muted)]">%</span>
              </Num>
              <span className="text-[11px] text-[color:var(--w-muted)]">{fmt(phys.used, 1)} GB</span>
            </Ring>
            <div className="flex min-w-0 flex-1 flex-col justify-center gap-3">
              <div className="grid grid-cols-2 gap-3">
                <Stat label="Available" value={`${fmt(phys.free, 1)} GB`} />
                <Stat label="Total" value={`${fmt(phys.used + phys.free, 0)} GB`} />
              </div>
              {row("Virtual", virt, "libre.virtual_memory_memory")}
              {size === "lg" && <Spark ipKey={pctKey} values={hist} className="min-h-0 flex-1" />}
            </div>
          </div>
        )
      }
    </Widget>
  );
}
