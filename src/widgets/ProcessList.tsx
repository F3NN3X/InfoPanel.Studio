import { useState } from "react";
import type { ModuleSettings } from "@/modules/types";
import { useFitRows, Widget, shell, get, num, fmt, fmtMB, rows, Metric, Stat, Bar, Segmented, type ShellProps } from "./kit";
import { meta } from "./meta/ProcessList";

export { meta };

type Sort = "cpu" | "utility" | "memory";

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
      {({ size, h }) => {
        if (size === "xs") return <Metric label="Processes" value={num(k("process-count"))} scale="lg" sub={`${fmt(num(k("thread-count")))} threads`} className="h-full justify-center" />;
        const n = p.rows ?? useFitRows(h - (size === "sm" ? 0 : 58), 26);
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
                  <li key={r.name + i} className="grid h-5 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 text-xs">
                    <span className="truncate text-[color:var(--w-fg)]">{r.name}</span>
                    <span className="tabular-nums text-[color:var(--w-muted)]">{sort === "memory" ? fmtMB(r.mem) : `${fmt(v, 1)}%`}</span>
                    <Bar value={v} max={maxV} className="col-span-2 h-[3px]" />
                  </li>
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
