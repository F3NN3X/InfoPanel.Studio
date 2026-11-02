import { shortTokens } from "@/lib/agents";
import { Spark } from "../kit";

export type HistoryStyle = "bars" | "heatmap";

const DAY_MS = 86_400_000;
/** The most weeks the heatmap draws (the server keeps 35 days). */
const MAX_WEEKS = 6;
const LABELS_W = 24;
export const HEADER_H = 16;
/** The daily bars' height with their header. */
export const BARS_H = 52;

/** A local date's "YYYY-MM-DD", the server's day key. */
export const dayKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
/** The Monday that starts `d`'s week, at local midnight. */
const mondayOf = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate() - ((d.getDay() + 6) % 7));

export interface HeatCell {
  day: string;
  v: number;
  /** After today: drawn empty. */
  future: boolean;
}

/** The weeks from the first day with data to this one, a column of Monday…Sunday each, at most six. */
export function heatmapWeeks(byDay: ReadonlyMap<string, number>, today: Date): HeatCell[][] {
  const first = [...byDay.keys()].sort()[0];
  const end = mondayOf(today);
  const start = first ? mondayOf(new Date(`${first}T12:00:00`)) : end;
  const weeks = Math.max(1, Math.min(MAX_WEEKS, Math.round((end.getTime() - start.getTime()) / (7 * DAY_MS)) + 1));
  const todayKey = dayKey(today);
  return Array.from({ length: weeks }, (_, w) =>
    Array.from({ length: 7 }, (_, d) => {
      const date = new Date(end.getFullYear(), end.getMonth(), end.getDate() - (weeks - 1 - w) * 7 + d);
      const day = dayKey(date);
      return { day, v: byDay.get(day) ?? 0, future: day > todayKey };
    })
  );
}

/** 0 for nothing, else 1-4 on a square-root scale, so a light day still shows. */
export const levelOf = (v: number, max: number) => (v <= 0 || max <= 0 ? 0 : Math.max(1, Math.min(4, Math.ceil(Math.sqrt(v / max) * 4))));
const MIX = [0, 30, 52, 76, 100];

export interface HeatFit {
  cell: number;
  gap: number;
  labels: boolean;
  w: number;
  h: number;
}

/** The biggest cells for `weeks` columns in `w` × `h` (weekday labels when they fit), or null below 5 px. */
export function heatmapFit(weeks: number, w: number, h: number, maxCell = 16): HeatFit | null {
  for (const labels of [true, false]) {
    const gap = 2;
    const cell = Math.floor(Math.min((h - 6 * gap) / 7, (w - (labels ? LABELS_W : 0) - (weeks - 1) * gap) / weeks, maxCell));
    if (labels && cell < 9) continue;
    if (cell >= 5) return { cell, gap, labels, w: (labels ? LABELS_W : 0) + weeks * cell + (weeks - 1) * gap, h: 7 * cell + 6 * gap };
  }
  return null;
}

export function Heatmap({ weeks, fit, color, todayKey }: { weeks: HeatCell[][]; fit: HeatFit; color: string; todayKey: string }) {
  const max = Math.max(0, ...weeks.flat().map((c) => c.v));
  const { cell, gap } = fit;
  return (
    <div className="flex shrink-0" style={{ gap }} role="img" aria-label="Tokens per day">
      {fit.labels && (
        <div className="flex flex-col text-micro leading-none text-[color:var(--w-faint)]" style={{ width: LABELS_W - gap, gap }}>
          {["Mon", "", "Wed", "", "Fri", "", ""].map((l, i) => (
            <span key={i} className="flex items-center" style={{ height: cell }}>
              {l}
            </span>
          ))}
        </div>
      )}
      {weeks.map((col, i) => (
        <div key={i} className="flex flex-col" style={{ gap }}>
          {col.map((c) => {
            const lv = levelOf(c.v, max);
            return (
              <span
                key={c.day}
                title={c.future ? undefined : `${c.day}: ${shortTokens(c.v)} tokens`}
                className="rounded-[3px]"
                style={{
                  width: cell,
                  height: cell,
                  background: c.future ? "transparent" : lv ? `color-mix(in srgb, ${color} ${MIX[lv]}%, var(--w-track))` : "var(--w-track)",
                  boxShadow: c.day === todayKey ? "inset 0 0 0 1px color-mix(in srgb, var(--w-fg) 55%, transparent)" : undefined,
                }}
              />
            );
          })}
        </div>
      ))}
    </div>
  );
}

/** "Today 169M tokens", and this week's total when there is room. */
export function HistoryHeader({ today, week, wide }: { today: number; week: number; wide: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-2 text-[11px] text-[color:var(--w-muted)]" style={{ height: HEADER_H }}>
      <span className="truncate">
        Today <span className="tabular-nums text-[color:var(--w-fg)]">{shortTokens(today)}</span> tokens
      </span>
      {wide && (
        <span className="shrink-0 truncate tabular-nums text-[color:var(--w-faint)]">
          <span className="text-[color:var(--w-muted)]">{shortTokens(week)}</span> this week
        </span>
      )}
    </div>
  );
}

/** One bar per day: a count, not a stream (the smooth graph eases in like a live one). */
export const DailyBars = ({ values, color }: { values: number[]; color: string }) => <Spark values={values} min={0} graph="bars" className="h-8" color={color} />;
