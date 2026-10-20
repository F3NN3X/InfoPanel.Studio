import type { Diagnostics, Growth, Series } from "../types";

/** `371.3k`, `5.2M`, `15.5`; a dash for nothing. */
export function fmt(n: number | null | undefined): string {
  if (n === null || n === undefined) return "–";
  const abs = Math.abs(n);
  if (abs >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (abs >= 1e4) return `${(n / 1e3).toFixed(1)}k`;
  return `${Math.round(n * 10) / 10}`;
}

/** `+371.3k (+74%)`: the change over the window and, when there is a base, its percentage. */
export function fmtDelta(g: Growth | null): string {
  if (!g) return "–";
  const sign = g.to >= g.from ? "+" : "";
  const pct = g.pct === null ? "" : ` (${sign}${g.pct.toFixed(0)}%)`;
  return `${sign}${fmt(g.to - g.from)}${pct}`;
}

/** The same with the window it covers: the clipboard summary keeps this form. */
function fmtGrowth(g: Growth | null): string {
  return g ? `${fmtDelta(g)} over ${Math.round(g.minutes)} min` : "–";
}

/** A series that fell by 20% or more over a window. */
export function fell(g: Growth | null): boolean {
  return g?.pct != null && g.pct <= -20;
}

/** Flagged series (growing) and series that fell by 20% or more. */
export function isNotable(s: Series): boolean {
  return s.growing || fell(s.growth30) || fell(s.growth60);
}

export interface SeriesGroup {
  /** The first dotted segment: `app`, `server`, `sidecar`, `studio`, `webview`. */
  name: string;
  rows: { series: Series; name: string }[];
}

/** The series grouped by their first dotted segment, each row named without it. */
export function groupSeries(series: Series[]): SeriesGroup[] {
  const groups = new Map<string, SeriesGroup>();
  for (const s of [...series].sort((a, b) => a.name.localeCompare(b.name))) {
    const dot = s.name.indexOf(".");
    const prefix = dot < 0 ? s.name : s.name.slice(0, dot);
    const group = groups.get(prefix) ?? { name: prefix, rows: [] };
    group.rows.push({ series: s, name: dot < 0 ? s.name : s.name.slice(dot + 1) });
    groups.set(prefix, group);
  }
  return [...groups.values()];
}

export type DeltaTone = "flagged" | "fell" | "plain";

export function deltaTone(s: Series, g: Growth | null): DeltaTone {
  if (s.growing) return "flagged";
  return fell(g) ? "fell" : "plain";
}

/** The sample line: `5 samples, latest 02:30:51 · covers 2 min.` */
export function sampleSummary(d: Diagnostics): string {
  if (d.samples === 0) return `Sampling every ${d.sampleEverySecs} s; the first sample is on its way.`;
  const latest = d.latestTime ? new Date(d.latestTime * 1000) : null;
  const time = latest ? [latest.getHours(), latest.getMinutes(), latest.getSeconds()].map((n) => String(n).padStart(2, "0")).join(":") : "";
  const covers = Math.max(0, ...d.series.map((s) => s.growth60?.minutes ?? s.growth30?.minutes ?? 0));
  return `${d.samples} samples${time ? `, latest ${time}` : ""}${covers >= 1 ? ` · covers ${Math.round(covers)} min` : ""}.`;
}

/** The text "Copy diagnostics summary" puts on the clipboard (the format the old page wrote). */
export function diagnosticsSummary(d: Diagnostics): string {
  const st = d.status;
  const lines = [
    `InfoPanel Studio ${st.appVersion}, debug ${d.debug ? "on" : "off"}`,
    `Server: ${st.state} on ${st.host}:${st.port}${st.owned ? "" : " (not started by the app)"}${st.message ? ` - ${st.message}` : ""}`,
    `Logs: ${d.logsDir}`,
    `Samples: ${d.samples}`,
  ];
  for (const s of d.series) {
    lines.push(`${s.name}: ${fmt(s.latest)} | 30m ${fmtGrowth(s.growth30)} | 60m ${fmtGrowth(s.growth60)}${s.growing ? " | GROWING" : ""}`);
  }
  return lines.join("\n");
}
