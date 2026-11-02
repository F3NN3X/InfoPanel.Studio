import { useContext, useRef, useState } from "react";
import { Widget, shell, get, num, fmt, pretty, sensorLabel, fitRows, rowsFor, roomy, IpTagCtx, Num, type ShellProps } from "./kit";
import { useOnData } from "./core/history";
import { average, durationText, observe, type SessionStat } from "./core/session-stats";
import { roleData, unitOf } from "./role-data";
import { meta, MAX_SENSORS } from "./meta/SessionStats";

export { meta, MAX_SENSORS };

export interface SessionStatsProps extends ShellProps {
  /** Sensor keys (at most six); unset: CPU and GPU load and temperature. */
  sensors?: string[];
  /** The level time is counted above; default 80. */
  above?: number;
}

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
      v: num(raw),
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
        if (roomy(w, h)) return <RangeBlocks rows={rows} above={above} h={h} />;
        const shown = cols.filter((c) => w >= c.show);
        const head = h >= 120;
        const rowH = 30;
        const fit = fitRows(h - (head ? 22 : 0), rowH);
        const grid = { gridTemplateColumns: `minmax(0,1.6fr) repeat(${shown.length}, minmax(0,1fr))` };
        return (
          <div className="flex h-full min-w-0 flex-col justify-center">
            {head && (
              <div className="mb-1 grid gap-2 text-micro font-medium uppercase tracking-[0.06em] text-[color:var(--w-faint)]" style={grid}>
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
                <span className="truncate text-[13px] text-[color:var(--w-muted)]" title={r.label}>{r.label}</span>
                {shown.map((c) => (
                  <span key={c.id} className="truncate whitespace-nowrap text-right text-[15px]">
                    {r.stat ? <Num weight={600}>{c.text(r.stat)}</Num> : "–"}
                    {c.id !== "above" && r.unit && <span className="ml-0.5 text-micro text-[color:var(--w-faint)]">{r.unit}</span>}
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

/** Where `v` sits on a range bar, 0-100: percent sensors on their own 0-100 scale, the rest on 0 to a tenth over the session's peak. */
const rangePct = (v: number, unit: string, peak: number): number => Math.min(100, Math.max(0, (v / (unit === "%" ? 100 : peak * 1.1 || 1)) * 100));

/**
 * The 4x4 box: a block per sensor (56 to 72px, top-aligned): its label and current reading, a bar with the session's
 * min-to-max span, the average and the level as ticks, and the numbers and the time above the level under it.
 */
function RangeBlocks({ rows, above, h }: { rows: { key: string; label: string; unit: string; v: number; stat: SessionStat | undefined }[]; above: number; h: number }) {
  const { n } = rowsFor(h, rows.length, 56, 72, 6);
  return (
    <div className="flex h-full min-w-0 flex-col gap-3">
      {rows.slice(0, n).map((r) => {
        const s = r.stat;
        const dec = (v: number) => fmt(v, decimals(v));
        const lo = s ? rangePct(s.min, r.unit, s.max) : 0;
        const hi = s ? rangePct(s.max, r.unit, s.max) : 0;
        return (
          <div key={r.key} className="flex min-w-0 flex-col gap-1.5">
            <div className="flex min-w-0 items-baseline justify-between gap-2">
              <span className="truncate text-[13px] text-[color:var(--w-muted)]" title={r.label}>{r.label}</span>
              <span className="shrink-0 whitespace-nowrap text-[15px]">
                <Num weight={600}>{dec(r.v)}</Num>
                <span className="ml-0.5 text-micro text-[color:var(--w-faint)]">{r.unit} now</span>
              </span>
            </div>
            <div className="relative h-2 rounded-full bg-[color:var(--w-track)]" aria-hidden>
              {s && (
                <>
                  <div className="absolute inset-y-0 rounded-full" style={{ left: `${lo}%`, width: `${Math.max(1.5, hi - lo)}%`, background: "color-mix(in oklab, var(--accent) 55%, transparent)" }} />
                  <i className="absolute -inset-y-[3px] w-0.5 -translate-x-1/2 rounded-full bg-[color:var(--w-fg)]" style={{ left: `${rangePct(average(s), r.unit, s.max)}%` }} />
                  {r.unit === "%" || above <= s.max * 1.1 ? <i className="absolute -inset-y-px w-px -translate-x-1/2 bg-[color:var(--w-faint)]" style={{ left: `${rangePct(above, r.unit, s.max)}%` }} /> : null}
                </>
              )}
            </div>
            <div className="flex justify-between gap-2 whitespace-nowrap text-micro text-[color:var(--w-faint)]">
              {s ? (
                <>
                  <span>min {dec(s.min)}</span>
                  <span>avg {dec(average(s))}</span>
                  <span>max {dec(s.max)}</span>
                  <span>above {fmt(above, 0)}: {durationText(s.aboveMs)}</span>
                </>
              ) : (
                <span>waiting for a reading</span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
