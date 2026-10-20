export type LogLevel = "error" | "warn" | "info" | "debug";

export const LOG_LEVELS: LogLevel[] = ["error", "warn", "info", "debug"];

/** Lines each source keeps. */
export const LOG_BUFFER = 2000;

export interface LogLine {
  /** Counts up per source, so a row keeps its key as the buffer slides. */
  id: number;
  /** HH:MM:SS, or HH:MM:SS.mmm for a line stamped on arrival. */
  ts: string;
  level: LogLevel;
  msg: string;
}

const LEVELS: Record<string, LogLevel> = {
  error: "error",
  warn: "warn",
  warning: "warn",
  info: "info",
  debug: "debug",
  trace: "debug",
};

const pad = (n: number, width = 2) => String(n).padStart(width, "0");

/** The time of day, `02:30:51.123`, in the local zone. */
export function stampOf(date: Date): string {
  return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}.${pad(date.getMilliseconds(), 3)}`;
}

// app.log: `[2026-10-20][02:02:05][infopanel_studio_lib::commands][DEBUG] ipc: report_metrics`
const APP_LINE = /^\[\d{4}-\d{2}-\d{2}\]\[(\d{2}:\d{2}:\d{2})\]\[[^\]]*\]\[([A-Za-z]+)\] ?/;
// server.log: `[debug] GET /api/debug/stats 200 0ms`, and the wrapper's `[23:39:54Z] --- starting server ...`
const SERVER_LEVEL = /^\[(error|warn|warning|info|debug)\] ?/i;
const SERVER_STAMP = /^\[(\d{2}):(\d{2}):(\d{2})Z\] ?/;

/** A log line's level, time and message. A line without a level is info; one without a time is stamped `now`. */
export function parseLine(raw: string, now: Date = new Date()): Omit<LogLine, "id"> {
  const app = APP_LINE.exec(raw);
  if (app) return { ts: app[1], level: LEVELS[app[2].toLowerCase()] ?? "info", msg: raw.slice(app[0].length) };
  const level = SERVER_LEVEL.exec(raw);
  if (level) return { ts: stampOf(now), level: LEVELS[level[1].toLowerCase()], msg: raw.slice(level[0].length) };
  const stamp = SERVER_STAMP.exec(raw);
  if (stamp) {
    // The wrapper writes UTC; show the local time of day.
    const utc = new Date(now);
    utc.setUTCHours(Number(stamp[1]), Number(stamp[2]), Number(stamp[3]), 0);
    return { ts: stampOf(utc).slice(0, 8), level: "info", msg: raw.slice(stamp[0].length) };
  }
  return { ts: stampOf(now), level: "info", msg: raw };
}

/** `lines` parsed and appended to `buffer`, the oldest dropped past `max`. `nextId` is the id of the first new line. */
export function pushLines(buffer: LogLine[], lines: string[], nextId: number, now: Date = new Date(), max = LOG_BUFFER): LogLine[] {
  if (lines.length === 0) return buffer;
  const added = lines.map((raw, i) => ({ id: nextId + i, ...parseLine(raw, now) }));
  const all = buffer.length === 0 ? added : [...buffer, ...added];
  return all.length > max ? all.slice(all.length - max) : all;
}

export type LevelFilter = LogLevel | "all";

/** How many buffered lines each level has, and the total under "all". */
export function countLevels(lines: LogLine[]): Record<LevelFilter, number> {
  const counts: Record<LevelFilter, number> = { all: lines.length, error: 0, warn: 0, info: 0, debug: 0 };
  for (const l of lines) counts[l.level] += 1;
  return counts;
}

/** The lines at `level` (or every level) whose message contains `query`, ignoring case. */
export function filterLines(lines: LogLine[], level: LevelFilter, query: string): LogLine[] {
  const q = query.trim().toLowerCase();
  if (level === "all" && !q) return lines;
  return lines.filter((l) => (level === "all" || l.level === level) && (!q || l.msg.toLowerCase().includes(q)));
}

/** A line as the Copy button writes it. */
export function lineText(l: LogLine): string {
  return `${l.ts} ${l.level.toUpperCase().padEnd(5)} ${l.msg}`;
}
