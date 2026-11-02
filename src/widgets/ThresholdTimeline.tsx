import { Widget, shell, get, num, fmt, pretty, sensorLabel, fitRows, rowsFor, roomy, tone, TONES, STATE, Num, type ShellProps, type Tone } from "./kit";
import { useSeries, type SeriesLimits, type SeriesStore } from "./core/history";
import { laneColumns, laneRuns, laneStats, type LaneRun } from "./core/lanes";
import { roleData, unitOf } from "./role-data";
import { meta, MAX_LANES } from "./meta/ThresholdTimeline";

export { meta, MAX_LANES };

export interface ThresholdTimelineProps extends ShellProps {
  /** Sensor keys (at most six); unset: CPU and GPU load and temperature. */
  sensors?: string[];
  /** Minutes shown; default 5. */
  window?: number;
  warn?: number;
  crit?: number;
}

/** Columns a lane is folded into; adjacent columns of one colour draw as one rect. */
const COLUMNS = 120;
/** Samples one sensor keeps, whatever the window: the gap between samples widens with it. */
const MAX_SAMPLES = 600;

const LANE_COLOR: Record<Tone, string> = { ok: STATE.ok, warn: TONES.warn, crit: TONES.crit };

export default function ThresholdTimeline(p: ThresholdTimelineProps) {
  const d = p.data;
  const { roles } = roleData(d, p.names);
  const keys = (p.sensors?.length ? p.sensors : (["cpu.load", "gpu.load", "cpu.temp", "gpu.temp"] as const).flatMap((r) => (roles[r] ? [roles[r]!.key] : []))).slice(0, MAX_LANES);
  const minutes = p.window ?? 5;
  const windowMs = minutes * 60_000;
  const warn = p.warn ?? 70,
    crit = p.crit ?? 90;
  const limits: SeriesLimits = { maxAgeMs: windowMs, maxCount: MAX_SAMPLES, minGapMs: Math.max(1000, windowMs / MAX_SAMPLES) };
  const store = useSeries(d, Object.fromEntries(keys.map((k) => [k, num(get(d, k))])), limits);
  store.retain(keys);
  const now = Date.now();
  const lanes = keys.map((key) => {
    const raw = get(d, key);
    const v = num(raw);
    return {
      key,
      label: sensorLabel(key, p.names, pretty(key.split(".").pop() ?? key)),
      v,
      unit: unitOf(raw),
      runs: laneRuns(laneColumns(store.read(key), now, windowMs, COLUMNS), warn, crit),
    };
  });
  const first = lanes[0];
  const span = `−${minutes} min`;
  return (
    <Widget
      {...shell(p)}
      title={p.title ?? "Timeline"}
      icon="health_metrics"
      compact={(box) => (box.shape !== "tile" && box.shape !== "column" ? undefined : first ? { label: first.label, value: first.v, d: Math.abs(first.v) >= 100 ? 0 : 1, unit: first.unit, sub: `last ${minutes} min`, t: tone(first.v, warn, crit), hist: store.read(first.key).map((s) => s.v), kind: "spark" } : { label: "Timeline", value: "—" })}
      studio={{ label: first?.label ?? "Timeline", live: !!first, value: first ? first.v : "—", d: first && Math.abs(first.v) >= 100 ? 0 : 1, unit: first?.unit, sub: first ? `${lanes.length} lanes · ${span}` : "Pick sensors", t: first ? tone(first.v, warn, crit) : undefined }}
    >
      {({ w, h }) => {
        if (!lanes.length) return <div className="grid h-full place-content-center text-xs text-[color:var(--w-faint)]">Pick sensors</div>;
        if (roomy(w, h)) return <RoomyLanes lanes={lanes} store={store} w={w} h={h} warn={warn} crit={crit} minutes={minutes} span={span} />;
        const axis = h >= 110;
        // Narrow zones put each label over its lane; wide ones set it beside.
        const stacked = w < 260;
        const fit = fitRows(h - (axis ? 18 : 0), stacked ? 38 : 22, 6);
        const shown = lanes.slice(0, fit);
        const labelW = stacked ? 0 : Math.min(150, w * 0.28);
        return (
          <div className="flex h-full min-w-0 flex-col justify-center gap-1.5">
            <div className="flex min-h-0 flex-1 flex-col justify-center gap-1.5">
              {shown.map((l) => (
                <div key={l.key} className={`flex min-w-0 flex-1 gap-2 ${stacked ? "flex-col justify-center gap-0.5" : "min-h-[14px] items-center"}`} style={{ maxHeight: stacked ? 38 : 34 }}>
                  {!stacked && (
                    <span className="truncate text-[12px] text-[color:var(--w-muted)]" style={{ width: labelW }} title={l.label}>
                      {l.label}
                    </span>
                  )}
                  {stacked && <span className="truncate text-[11px] leading-tight text-[color:var(--w-muted)]" title={l.label}>{l.label}</span>}
                  <svg viewBox={`0 0 ${COLUMNS} 1`} preserveAspectRatio="none" shapeRendering="crispEdges" className={`min-w-0 rounded-[3px] bg-[color:var(--w-track)] ${stacked ? "h-3.5 w-full shrink-0" : "h-full flex-1"}`} aria-hidden>
                    {l.runs.map((r) => (r.tone ? <rect key={r.from} x={r.from} y={0} width={r.to - r.from} height={1} fill={LANE_COLOR[r.tone]} /> : null))}
                  </svg>
                  {w >= 340 && (
                    <span className="w-[4.5em] shrink-0 whitespace-nowrap text-right text-[13px]">
                      <Num weight={600}>{fmt(l.v, Math.abs(l.v) >= 100 ? 0 : 1)}</Num>
                      <span className="ml-0.5 text-micro text-[color:var(--w-faint)]">{l.unit}</span>
                    </span>
                  )}
                </div>
              ))}
            </div>
            {axis && (
              <div className="flex shrink-0 justify-between text-micro leading-none text-[color:var(--w-faint)]" style={{ paddingLeft: labelW ? labelW + 8 : 0, paddingRight: w >= 340 ? "calc(4.5em + 8px)" : 0 }}>
                <span>{span}</span>
                <span>now</span>
              </div>
            )}
          </div>
        );
      }}
    </Widget>
  );
}

const AXIS_H = 14;
const LEGEND_H = 16;

/**
 * The 4x4 box: lanes top-aligned and as tall as the box allows (36 to 64px), each with a line under its strip that gives
 * the peak and the share of the window above `warn`, then a ticked axis and the colour legend.
 */
function RoomyLanes({ lanes, store, w, h, warn, crit, minutes, span }: { lanes: { key: string; label: string; v: number; unit: string; runs: LaneRun[] }[]; store: SeriesStore; w: number; h: number; warn: number; crit: number; minutes: number; span: string }) {
  const { n, rowH } = rowsFor(h - AXIS_H - LEGEND_H - 16, lanes.length, 36, 64, 8);
  const labelW = Math.min(110, w * 0.26);
  const pad = { paddingLeft: labelW + 8, paddingRight: "calc(4.5em + 8px)" };
  return (
    <div className="flex h-full min-w-0 flex-col gap-2">
      <div className="flex flex-col gap-2">
        {lanes.slice(0, n).map((l) => {
          const st = laneStats(store.read(l.key), warn);
          return (
            <div key={l.key} className="flex min-w-0 items-start gap-2" style={{ height: rowH }}>
              <span className="truncate pt-0.5 text-[12px] text-[color:var(--w-muted)]" style={{ width: labelW }} title={l.label}>{l.label}</span>
              <div className="flex h-full min-w-0 flex-1 flex-col gap-1">
                <svg viewBox={`0 0 ${COLUMNS} 1`} preserveAspectRatio="none" shapeRendering="crispEdges" className="min-h-0 w-full flex-1 rounded-[3px] bg-[color:var(--w-track)]" aria-hidden>
                  {l.runs.map((r) => (r.tone ? <rect key={r.from} x={r.from} y={0} width={r.to - r.from} height={1} fill={LANE_COLOR[r.tone]} /> : null))}
                </svg>
                <span className="truncate text-micro leading-none text-[color:var(--w-faint)]">
                  {Number.isFinite(st.peak) ? `peak ${fmt(st.peak, Math.abs(st.peak) >= 100 ? 0 : 1)} ${l.unit} · above ${fmt(warn, 0)}: ${fmt(st.pctAbove, 0)} %` : "no readings yet"}
                </span>
              </div>
              <span className="w-[4.5em] shrink-0 whitespace-nowrap pt-0.5 text-right text-[13px]">
                <Num weight={600}>{fmt(l.v, Math.abs(l.v) >= 100 ? 0 : 1)}</Num>
                <span className="ml-0.5 text-micro text-[color:var(--w-faint)]">{l.unit}</span>
              </span>
            </div>
          );
        })}
      </div>
      <div className="relative shrink-0" style={{ height: AXIS_H, ...pad }}>
        <div className="relative h-full">
          {[0, 25, 50, 75, 100].map((x) => (
            <i key={x} className="absolute top-0 h-1 w-px bg-[color:var(--w-faint)]" style={{ left: `${x}%` }} />
          ))}
          <span className="absolute left-0 top-1.5 text-micro leading-none text-[color:var(--w-faint)]">{span}</span>
          <span className="absolute left-1/2 top-1.5 -translate-x-1/2 text-micro leading-none text-[color:var(--w-faint)]">−{fmt(minutes / 2, 1)} min</span>
          <span className="absolute right-0 top-1.5 text-micro leading-none text-[color:var(--w-faint)]">now</span>
        </div>
      </div>
      <div className="mt-auto flex shrink-0 flex-wrap items-center gap-x-4 gap-y-1 text-micro text-[color:var(--w-faint)]" style={{ minHeight: LEGEND_H }}>
        {([["ok", `below ${fmt(warn, 0)}`], ["warn", `${fmt(warn, 0)} to ${fmt(crit, 0)}`], ["crit", `${fmt(crit, 0)} and up`]] as const).map(([t, text]) => (
          <span key={t} className="flex items-center gap-1.5">
            <i className="h-2 w-2 rounded-[2px]" style={{ background: LANE_COLOR[t] }} />
            {text}
          </span>
        ))}
      </div>
    </div>
  );
}
