import type { QuietHours, Severity } from "@/lib/alerts";
import type { IslandNotice } from "./types";

const RANK: Record<Severity, number> = { info: 0, warning: 1, critical: 2 };

const minutes = (hhmm: string): number | undefined => {
  const m = /^(\d{2}):(\d{2})$/.exec(hhmm);
  return m ? Number(m[1]) * 60 + Number(m[2]) : undefined;
};

/**
 * Whether `now` (local time) is inside the alerts' quiet window and `severity` is below its minimum:
 * the server's `isQuiet` (ips-server's alerts.rs), for the notices the dashboard raises itself.
 */
export function isQuiet(quiet: QuietHours | undefined, severity: Severity, now: number): boolean {
  if (!quiet) return false;
  const from = minutes(quiet.from);
  const to = minutes(quiet.to);
  if (from === undefined || to === undefined || from === to) return false;
  const d = new Date(now);
  const at = d.getHours() * 60 + d.getMinutes();
  const inside = from < to ? at >= from && at < to : at >= from || at < to;
  return inside && RANK[severity] < RANK[quiet.minSeverity];
}

/**
 * The bus gate for quiet hours: local notices below the minimum severity are dropped inside the
 * window. The `exempt` sources pass: server alerts (the server already marked and filtered them).
 */
export const quietGate =
  (quiet: QuietHours | undefined, exempt: readonly string[], now: () => number = Date.now) =>
  (n: IslandNotice): boolean =>
    exempt.includes(n.source) || !isQuiet(quiet, n.severity, now());
