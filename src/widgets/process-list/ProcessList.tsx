import { useState } from "react";
import type { ModuleSettings } from "@/modules/types";
import { roomy, fillRows, useFitRows, Widget, shell, get, num, fmt, fmtMB, rows, Metric, Stat, Bar, Segmented, Part, type ShellProps } from "../kit";
import { meta } from "./meta";

export { meta };

type Sort = "cpu" | "utility" | "memory";

/** A row's height and the gap between rows, px (`h-5`, `gap-1.5`; a roomy box keeps the count and shares the spare height between the rows); the stats row's and the footer's heights. */
const ROW_H = 20;
const ROW_GAP = 6;
// The stat row: 41px at 1x (15px value over a micro label), 51px when a roomy box grows the type.
const STATS_H = 49;
const STATS_H_ROOMY = 59;
const FOOTER_H = 60;

export interface ProcessListProps extends ShellProps {
  look?: ModuleSettings;
  sort?: Sort;
  /** Max rows; auto-fits the height by default. */
  rows?: number;
}

export default function ProcessList(p: ProcessListProps) {
  const d = p.data;
  const k = (s: string) => get(d, `plugins.system-info-plugin.processes.${s}`);
  const [sortSel, setSort] = useState<Sort | null>(null);
  const sort: Sort = sortSel ?? p.sort ?? "cpu";
  const src = { cpu: "top-cpu-usage", utility: "top-cpu-utility", memory: "top-memory-usage" }[sort];
  const list = rows(k(src))
    .filter((r) => r.length >= 4)
    .map(([name, cpu, util, mem]) => ({ name, cpu: num(cpu), util: num(util), mem: num(mem) }));
  const maxV = Math.max(1, ...list.map((r) => (sort === "memory" ? r.mem : sort === "utility" ? r.util : r.cpu)));
  return (
    <Widget
      {...shell(p)}
      title={p.title ?? "Processes"}
      icon="list_alt"
      studio={{ label: "Top processes", value: num(k("process-count")), sub: `${fmt(num(k("thread-count")))} threads`, rows: list.map((r) => ({ n: r.name, v: sort === "memory" ? fmtMB(r.mem) : `${fmt(r.cpu, 1)}%`, pct: ((sort === "memory" ? r.mem : r.cpu) / maxV) * 100 })) }}
      compact={{ label: "Processes", value: num(k("process-count")), sub: `${list[0]?.name ?? ""} · ${fmt(num(k("cpu-usage")), 1)}% CPU`, pct: num(k("cpu-usage")), kind: "bar" }}
      right={
        <Segmented
          value={sort === "memory" ? "memory" : "cpu"}
          options={[
            ["cpu", "CPU"],
            ["memory", "Memory"],
          ]}
          onChange={setSort}
        />
      }
    >
      {({ size, w, h }) => {
        if (size === "xs") return <Metric label="Processes" value={num(k("process-count"))} scale="lg" sub={`${fmt(num(k("thread-count")))} threads`} className="h-full justify-center" />;
        // Whole rows only: the room left by the stats above (md, lg) and the footer (lg), each with the 12px gap.
        const room = h - (size === "sm" ? 0 : (roomy(w, h) ? STATS_H_ROOMY : STATS_H) + 12) - (size === "lg" ? FOOTER_H + 12 : 0);
        const n = p.rows ?? useFitRows(room, ROW_H, ROW_GAP);
        const rowH = fillRows(room, Math.min(n, list.length), ROW_H, ROW_GAP, roomy(w, h)).rowH;
        return (
          <div className="flex h-full flex-col gap-3">
            {size !== "sm" && (
              <div className="grid grid-cols-4 gap-3">
                <Stat label="Processes" value={fmt(num(k("process-count")))} />
                <Stat label="Threads" value={fmt(num(k("thread-count")))} />
                <Stat label="CPU" value={`${fmt(num(k("cpu-usage")), 1)}%`} />
                <Stat label="Memory" value={fmtMB(num(k("memory-usage")))} />
              </div>
            )}
            <ol className="flex min-h-0 flex-1 flex-col gap-1.5 overflow-hidden">
              {list.slice(0, n).map((r, i) => {
                const v = sort === "memory" ? r.mem : sort === "utility" ? r.util : r.cpu;
                return (
                  <Part as="li" kind="row" current={i === 0} key={r.name + i} className="grid h-5 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 text-caption leading-[1.333]" style={rowH ? { height: rowH } : undefined}>
                    <span className="truncate text-[color:var(--w-fg)]">{r.name}</span>
                    <span className="tabular-nums text-[color:var(--w-muted)]">{sort === "memory" ? fmtMB(r.mem) : `${fmt(v, 1)}%`}</span>
                    <Bar value={v} max={maxV} className="col-span-2 h-0.75" />
                  </Part>
                );
              })}
            </ol>
            {size === "lg" && (
              <div className="grid grid-cols-3 gap-3 border-t border-[color:var(--w-track)] pt-3">
                <Stat label="Handles" value={fmt(num(k("handle-count")))} />
                <Stat label="CPU utility" value={`${fmt(num(k("cpu-utility")), 1)}%`} />
                <Stat label="Compressed" value={fmtMB(num(k("memory-compression")))} />
              </div>
            )}
          </div>
        );
      }}
    </Widget>
  );
}
