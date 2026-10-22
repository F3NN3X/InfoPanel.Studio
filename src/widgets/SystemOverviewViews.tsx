import type { CSSProperties } from "react";
import { fitGrid, fitRows, Num, Ring, Spark, TONES, type Tone } from "./kit";

/** One metric of the Graphs / Gauges views, already read, formatted and coloured. */
export interface MetricRow {
  key: string;
  label: string;
  /** The value with its unit ("55%", "8 KB/s"), and the two parts a gauge stacks. */
  text: string;
  num: string;
  unit: string;
  value: number;
  /** The scale's top: 100 for a percentage, the peak or the set maximum for a rate. */
  top: number;
  hist: number[];
  tone: Tone;
  /** Sets the metric's `--accent`. */
  style?: CSSProperties;
}

const ROW_H = 28;
const ROW_GAP = 8;

/** One row per metric: its label, a sparkline filling the middle and the value right-aligned, as many rows as fit. */
export function MetricGraphs({ rows, w, h }: { rows: MetricRow[]; w: number; h: number }) {
  const shown = rows.slice(0, h > 0 ? fitRows(h, ROW_H, ROW_GAP) : rows.length);
  const sparks = w <= 0 || w >= 170;
  return (
    <div className="flex h-full min-h-0 flex-col justify-center gap-2">
      {shown.map((m) => (
        <div key={m.key} style={m.style} className="flex min-h-0 flex-1 items-center gap-3">
          <span className="w-12 shrink-0 truncate text-[11px] font-semibold uppercase tracking-[0.12em] text-[color:var(--w-muted)]">{m.label}</span>
          {sparks && <Spark values={m.hist} min={0} max={m.top} className="h-full max-h-9 min-w-0 flex-1" />}
          <Num className="ml-auto shrink-0 whitespace-nowrap text-right text-[13px]" weight={600} style={{ color: m.tone === "ok" ? "var(--accent)" : TONES[m.tone] }}>
            {m.text}
          </Num>
        </div>
      ))}
    </div>
  );
}

const LABEL_H = 18;

/** Open-arc dials in the grid that makes them biggest; a short last row is centred (5 → 3 + 2). */
export function MetricGauges({ rows, w, h }: { rows: MetricRow[]; w: number; h: number }) {
  const gap = 12;
  const { cols, cell } = fitGrid(rows.length, Math.max(1, w), Math.max(1, h - LABEL_H), { aspect: 1, gap: gap + LABEL_H });
  const lines = Array.from({ length: cols ? Math.ceil(rows.length / cols) : 0 }, (_, i) => rows.slice(i * cols, (i + 1) * cols));
  return (
    <div className="flex h-full min-h-0 flex-col items-center justify-center" style={{ gap }}>
      {lines.map((line, i) => (
        <div key={i} className="flex justify-center" style={{ gap }}>
          {line.map((m) => (
            <div key={m.key} style={{ ...m.style, width: cell }} className="flex min-w-0 flex-col items-center gap-1">
              <Ring value={Math.min(m.value, m.top)} max={m.top} t={m.tone} thickness={11} sweep={270} track="color-mix(in oklab, var(--accent) 22%, transparent)" className="w-full">
                <Num className="leading-none" style={{ fontSize: Math.max(10, Math.min(cell * 0.27, (cell * 0.62) / (Math.max(2, m.num.length) * 0.62))), color: m.tone === "ok" ? "var(--w-fg)" : TONES[m.tone] }}>
                  {m.num}
                </Num>
                {m.unit && <span className="leading-none text-[color:var(--w-faint)]" style={{ fontSize: Math.max(8, cell * 0.095) }}>{m.unit}</span>}
              </Ring>
              <span className="w-full truncate text-center text-[10px] font-semibold uppercase tracking-[0.14em] text-[color:var(--w-muted)]" style={{ height: LABEL_H - 4 }}>{m.label}</span>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
