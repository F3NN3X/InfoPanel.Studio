import type { ModuleSettings } from "@/modules/types";
import { Widget, shell, get, num, fmt, roomy, Metric, Ring, RING_TEXT, Spark, Stat, Bar, useHistory, tone, Num, type ShellProps } from "../kit";
import { meta } from "./meta";

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
        <span className="text-micro tabular-nums text-[color:var(--w-faint)]">
          {fmt(v.used, 1)} / {fmt(v.used + v.free, 0)} GB
        </span>
        <span className="ml-auto font-medium tabular-nums">{fmt(v.pct, 0)}%</span>
      </div>
      <Bar ipKey={key} value={v.pct} t={tone(v.pct, warn, crit)} className="h-2" />
    </div>
  );
  const ring = (className: string) => (
    <Ring ipKey={pctKey} value={phys.pct} t={tone(phys.pct, warn, crit)} className={className}>
      <Num ipKey={pctKey} ipUnit="%" className="font-semibold" style={RING_TEXT.value}>
        {fmt(phys.pct, 0)}
        <span className="text-[color:var(--w-muted)]" style={RING_TEXT.unit}>%</span>
      </Num>
      <span className="text-[color:var(--w-muted)]" style={RING_TEXT.sub}>{fmt(phys.used, 1)} GB</span>
    </Ring>
  );
  return (
    <Widget
      {...shell(p)}
      title={p.title ?? "Memory"}
      icon="memory_alt"
      compact={{ label: "RAM", value: phys.pct, unit: "%", sub: `${fmt(phys.used, 1)} / ${fmt(phys.used + phys.free, 0)} GB`, pct: phys.pct, kind: "ring", t: tone(phys.pct, warn, crit) }}
    >
      {({ size, w, h }) =>
        size === "xs" ? (
          <Metric ipKey={pctKey} label="RAM" value={phys.pct} unit="%" scale="lg" sub={`${fmt(phys.used, 1)} GB used`} t={tone(phys.pct, warn, crit)} className="h-full justify-center" />
        ) : size === "sm" ? (
          <div className="flex h-full flex-col justify-center gap-3">
            {row("Physical", phys, pctKey)}
            {row("Virtual", virt, "libre.virtual_memory_memory")}
          </div>
        ) : (
          <div className={`flex h-full ${roomy(w, h) ? "flex-col gap-3" : "gap-5"}`}>
            {roomy(w, h) ? <div className="shrink-0 self-center" style={{ width: Math.min(w - 32, h * 0.46) }}>{ring("w-full")}</div> : ring("h-full max-h-45 shrink-0")}
            <div className={`flex min-w-0 flex-1 flex-col gap-3 ${roomy(w, h) ? "min-h-0" : "justify-center"}`}>
              <div className="grid grid-cols-2 gap-3">
                <Stat label="Available" value={`${fmt(phys.free, 1)} GB`} />
                <Stat label="Total" value={`${fmt(phys.used + phys.free, 0)} GB`} />
              </div>
              {roomy(w, h) ? (
                <>
                  <Spark ipKey={pctKey} values={hist} className="min-h-0 flex-1" />
                  <div className="mt-auto">{row("Virtual", virt, "libre.virtual_memory_memory")}</div>
                </>
              ) : (
                <>
                  {row("Virtual", virt, "libre.virtual_memory_memory")}
                  {size === "lg" && <Spark ipKey={pctKey} values={hist} className="min-h-0 flex-1" />}
                </>
              )}
            </div>
          </div>
        )
      }
    </Widget>
  );
}
