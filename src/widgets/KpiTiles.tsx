import { readSystemFlat } from "@/lib/system-metrics";
import type { ModuleSettings } from "@/modules/types";
import { useFitRows, Widget, shell, get, num, fmt, rateParts, toMBps, pretty, Spark, useHistory, useSkin, numFont, hw, adapterOf, type ShellProps } from "./kit";
import { meta } from "./meta/KpiTiles";

export { meta };

type Metric = "cpu" | "gpu" | "ram" | "net" | "vram" | "power";
interface Kpi {
  l: string;
  v: number;
  u: string;
  /** The number as shown, where the unit scales with the value (a throughput). */
  text?: string;
  sub: string;
  d?: number;
  max?: number;
}

export interface KpiTilesProps extends ShellProps {
  look?: ModuleSettings;
  metrics?: Metric[];
  /** Readings back for the change figure. */
  lookback?: number;
}

export default function KpiTiles(p: KpiTilesProps) {
  const d = p.data;
  const sk = useSkin();
  const cpu = hw(d).cpu,
    gpu = hw(d).gpu;
  const sys = readSystemFlat(d ?? {}, p.names);
  const L = (k: string) => num(get(d, `libre.${k}`));
  // the busiest adapter, as Network Traffic picks it
  const net = adapterOf(d);
  const down = net ? L(`${net}_download_speed`) : NaN;
  const rate = rateParts(down);
  const ALL: Record<Metric, Kpi> = {
    cpu: { l: "CPU", v: L(`${cpu}_cpu_total`), u: "%", sub: (sys.cpu.name ?? pretty(cpu ?? "")).replace(/^AMD Ryzen/, "Ryzen"), max: 100 },
    gpu: { l: "GPU", v: L(`${gpu}_gpu_core_load`), u: "%", sub: (sys.gpu.name ?? pretty(gpu ?? "")).replace(/^NVIDIA /, ""), max: 100 },
    ram: { l: "Memory", v: L("total_memory_memory_used"), u: "GB", d: 1, sub: `of ${fmt(L("total_memory_memory_used") + L("total_memory_memory_available"), 0)} GB` },
    net: { l: "Download", v: toMBps(down), text: rate.text, u: rate.unit, sub: net ? pretty(net) : "Network" },
    vram: { l: "VRAM", v: L(`${gpu}_gpu_memory_used`) / 1024, u: "GB", d: 1, sub: `of ${fmt(L(`${gpu}_gpu_memory_total`) / 1024, 0)} GB` },
    power: { l: "Power", v: (sys.cpu.power ?? NaN) + L(`${gpu}_gpu_package`), u: "W", sub: "CPU + GPU" },
  };
  const keys = p.metrics ?? (["cpu", "gpu", "ram", "net"] as Metric[]);
  const H: Record<Metric, number[]> = {
    cpu: useHistory(ALL.cpu.v, 48, 0.55),
    gpu: useHistory(ALL.gpu.v, 48, 0.55),
    ram: useHistory(ALL.ram.v, 48, 0.55),
    net: useHistory(ALL.net.v, 48, 0.55),
    vram: useHistory(ALL.vram.v, 48, 0.55),
    power: useHistory(ALL.power.v, 48, 0.55),
  };
  const back = p.lookback ?? 10;
  const first = ALL[keys[0] ?? "cpu"];
  const firstHist = H[keys[0] ?? "cpu"];
  return (
    <Widget
      {...shell(p)}
      showHeader={false}
      studio={{ label: first.l, value: first.v, unit: first.u, hist: firstHist, min: 0, rows: keys.map((key) => ({ n: ALL[key].l, v: `${ALL[key].text ?? fmt(ALL[key].v, ALL[key].d ?? 0)} ${ALL[key].u}`, pct: ALL[key].max ? ALL[key].v : undefined })) }}
      compact={(box) => (box.shape === "tile" ? { label: first.l, value: first.v, unit: first.u, hist: firstHist, min: 0 } : undefined)}
    >
      {({ w, h }) => {
        const cols = Math.max(1, Math.min(keys.length, Math.floor((w + 12) / 160)));
        const shown = keys.slice(0, cols * useFitRows(h, 88, 12));
        const tileH = (h - (Math.ceil(shown.length / cols) - 1) * 12) / Math.ceil(shown.length / cols);
        const tileW = (w - (cols - 1) * 20) / cols - 8;
        return (
          <div className="grid h-full gap-x-5 gap-y-3" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0,1fr))`, gridAutoRows: "minmax(0,1fr)" }}>
            {shown.map((key) => {
              const m = ALL[key],
                hist = H[key],
                prev = hist[Math.max(0, hist.length - 1 - back)],
                delta = m.v - prev,
                pct = prev ? (delta / Math.abs(prev)) * 100 : 0;
              const shown = m.text ?? fmt(m.v, m.d ?? 0);
              const len = shown.length + m.u.length * 0.5;
              const big = Math.max(14, Math.min(36, Math.max(20, Math.min(tileH * 0.32, tileH - 62)), tileW / (Math.max(2.5, len) * 0.66)));
              const last = hist[hist.length - 1] ?? 0;
              return (
                <div key={key} className="relative flex min-h-0 min-w-0 flex-col gap-1 overflow-hidden pr-2">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="truncate text-[11px] font-medium uppercase tracking-[0.06em] text-[color:var(--w-muted)]">{m.l}</span>
                    {tileW >= 112 && <span className="whitespace-nowrap text-xs tabular-nums" style={{ color: Math.abs(pct) < 1 ? "var(--w-muted)" : delta > 0 ? "#EDB232" : "#3CC97F" }}>
                      {Math.abs(pct) < 1 ? "→ 0%" : `${delta > 0 ? "▲" : "▼"} ${fmt(Math.abs(pct), 0)}%`}
                    </span>}
                  </div>
                  <span className="whitespace-nowrap font-bold leading-none tracking-[-0.01em] tabular-nums" style={{ fontSize: big, ...numFont(sk) }}>
                    {shown}
                    <span className="ml-0.5 text-[0.5em] font-semibold text-[color:var(--w-muted)]">{m.u}</span>
                  </span>
                  {tileH > 126 && m.sub && <span className="truncate text-xs text-[color:var(--w-faint)]">{m.sub}</span>}
                  {tileH > 100 && (
                    <div className="relative mt-auto h-[38%] min-h-[18px] max-h-10">
                      <Spark values={hist} min={0} max={m.max} className="absolute inset-0 h-full" />
                      <span className="absolute right-0 h-[7px] w-[7px] -translate-y-1/2 translate-x-1/2 rounded-full bg-[var(--accent)]" style={{ top: `${100 - ((last - 0) / ((m.max ?? Math.max(...hist) * 1.08) || 1)) * 94 - 3}%`, boxShadow: "0 0 0 3px color-mix(in oklab, var(--accent) 22%, transparent)" }} />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        );
      }}
    </Widget>
  );
}
