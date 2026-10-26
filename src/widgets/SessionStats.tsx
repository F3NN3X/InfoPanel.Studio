import { useContext, useRef, useState } from "react";
import { Widget, shell, get, num, fmt, pretty, sensorLabel, fitRows, IpTagCtx, Num, type ShellProps, type WidgetMeta } from "./kit";
import { useOnData } from "./core/history";
import { average, durationText, observe, type SessionStat } from "./core/session-stats";
import { roleData, unitOf } from "./role-data";

export const meta: WidgetMeta = {
  id: "SessionStats",
  name: "Session Stats",
  category: "Generic",
  icon: "query_stats",
  prefixes: [],
  defaultSize: [4, 3],
  minSize: [2, 1],
  blurb: "Min, max, average and time above a level",
  tags: "session min max average peak history statistics time above",
  description: "Min, max, average and the time above a level for up to six sensors, counted since the page loaded. Nothing is stored: a reload starts again, and Reset in the studio starts over.",
};

export interface SessionStatsProps extends ShellProps {
  /** Sensor keys (at most six); unset: CPU and GPU load and temperature. */
  sensors?: string[];
  /** The level time is counted above; default 80. */
  above?: number;
}

export const MAX_SENSORS = 6;

const decimals = (v: number): number => (Math.abs(v) >= 100 ? 0 : 1);

export default function SessionStats(p: SessionStatsProps) {
  const d = p.data;
  const onCanvas = useContext(IpTagCtx);
  const { roles } = roleData(d, p.names);
  const above = p.above ?? 80;
  const keys = (p.sensors?.length ? p.sensors : (["cpu.load", "gpu.load", "cpu.temp", "gpu.temp"] as const).flatMap((r) => (roles[r] ? [roles[r]!.key] : []))).slice(0, MAX_SENSORS);
  // Totals per sensor and level, not samples: a few numbers however long the page runs. Changing the level starts them over.
  const stats = useRef(new Map<string, SessionStat>());
  const [, setEpoch] = useState(0);
  useOnData(d, (now) => {
    const next = new Map<string, SessionStat>();
    for (const k of keys) next.set(`${k}@${above}`, observe(stats.current.get(`${k}@${above}`), num(get(d, k)), now, above));
    stats.current = next;
  });
  const rows = keys.map((key) => {
    const raw = get(d, key);
    return {
      key,
      label: sensorLabel(key, p.names, pretty(key.split(".").pop() ?? key)),
      unit: unitOf(raw),
      stat: stats.current.get(`${key}@${above}`),
    };
  });
  const reset = () => {
    stats.current = new Map();
    setEpoch((n) => n + 1);
  };
  const first = rows[0];
  const cols = [
    { id: "min", head: "Min", show: 340, text: (s: SessionStat) => fmt(s.min, decimals(s.min)) },
    { id: "avg", head: "Avg", show: 240, text: (s: SessionStat) => fmt(average(s), decimals(average(s))) },
    { id: "max", head: "Max", show: 0, text: (s: SessionStat) => fmt(s.max, decimals(s.max)) },
    { id: "above", head: `Above ${above}`, show: 480, text: (s: SessionStat) => durationText(s.aboveMs) },
  ];
  return (
    <Widget
      {...shell(p)}
      title={p.title ?? "Session stats"}
      icon="query_stats"
      compact={(box) =>
        box.shape !== "tile" && box.shape !== "column"
          ? undefined
          : first?.stat
          ? { label: first.label, value: first.stat.max, d: decimals(first.stat.max), unit: first.unit, sub: `min ${fmt(first.stat.min, decimals(first.stat.min))} · avg ${fmt(average(first.stat), decimals(average(first.stat)))}`, kind: "value" }
          : { label: "Session stats", value: "—" }
      }
      studio={{ label: first?.label ?? "Session stats", live: !!first?.stat, value: first?.stat ? first.stat.max : "—", d: first?.stat ? decimals(first.stat.max) : 0, unit: first?.unit, sub: first?.stat ? `peak · ${rows.length} sensors` : "Pick sensors" }}
      right={
        onCanvas ? (
          <button type="button" onClick={reset} className="rounded px-1.5 py-0.5 text-[11px] text-[color:var(--w-muted)] hover:text-[color:var(--w-fg)]">
            Reset
          </button>
        ) : undefined
      }
    >
      {({ w, h }) => {
        if (!rows.length) return <div className="grid h-full place-content-center text-xs text-[color:var(--w-faint)]">Pick sensors</div>;
        const shown = cols.filter((c) => w >= c.show);
        const head = h >= 120;
        const rowH = 30;
        const fit = fitRows(h - (head ? 22 : 0), rowH);
        const grid = { gridTemplateColumns: `minmax(0,1.6fr) repeat(${shown.length}, minmax(0,1fr))` };
        return (
          <div className="flex h-full min-w-0 flex-col justify-center">
            {head && (
              <div className="mb-1 grid gap-2 text-[10.5px] font-medium uppercase tracking-[0.06em] text-[color:var(--w-faint)]" style={grid}>
                <span />
                {shown.map((c) => (
                  <span key={c.id} className="truncate text-right">
                    {c.head}
                  </span>
                ))}
              </div>
            )}
            {rows.slice(0, fit).map((r) => (
              <div key={r.key} className="grid items-baseline gap-2 py-1" style={{ ...grid, minHeight: rowH }}>
                <span className="truncate text-[13px] text-[color:var(--w-muted)]">{r.label}</span>
                {shown.map((c) => (
                  <span key={c.id} className="truncate whitespace-nowrap text-right text-[15px]">
                    {r.stat ? <Num weight={600}>{c.text(r.stat)}</Num> : "–"}
                    {c.id !== "above" && r.unit && <span className="ml-0.5 text-[10.5px] text-[color:var(--w-faint)]">{r.unit}</span>}
                  </span>
                ))}
              </div>
            ))}
          </div>
        );
      }}
    </Widget>
  );
}
