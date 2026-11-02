/** The Countdown widget's maths: the target moment, which phase it is in and the units left (pure; local time). */

export type CountMode = "auto" | "until" | "since";
export type Breakdown = "auto" | "days" | "years" | "live";
export type Phase = "until" | "now" | "since";
export type Unit = "years" | "months" | "days" | "hours" | "minutes" | "seconds";
export interface Part {
  value: number;
  unit: Unit;
}

const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;
const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

/** Whether `v` is a real calendar date, "YYYY-MM-DD". */
export const isDate = (v: unknown): v is string => typeof v === "string" && targetOf(v, "") !== null;
/** Whether `v` is a 24 h "HH:MM" ("" = no time is not a time). */
export const isTime = (v: unknown): v is string => typeof v === "string" && TIME_RE.test(v);

/** The local moment of a date and time ("" = 00:00); null when either is malformed or the date does not exist (Feb 30). */
export function targetOf(date: string, time: string): Date | null {
  const d = DATE_RE.exec(date);
  const t = time === "" ? [null, "0", "0"] : TIME_RE.exec(time);
  if (!d || !t) return null;
  const [y, m, day] = [Number(d[1]), Number(d[2]), Number(d[3])];
  const at = new Date(y, m - 1, day, Number(t[1]), Number(t[2]));
  return at.getFullYear() === y && at.getMonth() === m - 1 && at.getDate() === day ? at : null;
}

/** Where `now` is relative to the event: counting down, happening now, or counting up. */
export function phaseOf(now: Date, target: Date, mode: CountMode, allDay: boolean): Phase {
  if (now < target) return "until";
  if (mode === "until") return "now";
  if (mode === "since") return "since";
  const end = allDay ? new Date(target.getFullYear(), target.getMonth(), target.getDate() + 1) : new Date(target.getTime() + HOUR_MS);
  return now < end ? "now" : "since";
}

const daysIn = (y: number, m: number): number => new Date(y, m + 1, 0).getDate();

/** `d` plus `n` calendar months, the day of month held to the last day of a shorter month (Jan 31 + 1 → Feb 28). */
function addMonths(d: Date, n: number): Date {
  const first = new Date(d.getFullYear(), d.getMonth() + n, 1, d.getHours(), d.getMinutes(), d.getSeconds(), d.getMilliseconds());
  first.setDate(Math.min(d.getDate(), daysIn(first.getFullYear(), first.getMonth())));
  return first;
}

const addDays = (d: Date, n: number): Date => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n, d.getHours(), d.getMinutes(), d.getSeconds(), d.getMilliseconds());

/** Whole calendar days from `a` to `b` (a <= b); corrects the 24 h estimate across a clock change. */
function wholeDays(a: Date, b: Date): number {
  let n = Math.floor((b.getTime() - a.getTime()) / DAY_MS);
  while (n > 0 && addDays(a, n) > b) n--;
  while (addDays(a, n + 1) <= b) n++;
  return n;
}

function calendarParts(from: Date, to: Date): Part[] {
  let months = (to.getFullYear() - from.getFullYear()) * 12 + to.getMonth() - from.getMonth();
  if (addMonths(from, months) > to) months--;
  const days = wholeDays(addMonths(from, months), to);
  return [
    { value: Math.floor(months / 12), unit: "years" },
    { value: months % 12, unit: "months" },
    { value: days, unit: "days" },
  ];
}

function clockParts(ms: number, seconds: boolean): Part[] {
  const s = Math.floor(ms / 1000);
  const parts: Part[] = [
    { value: Math.floor(s / 86_400), unit: "days" },
    { value: Math.floor(s / 3600) % 24, unit: "hours" },
    { value: Math.floor(s / 60) % 60, unit: "minutes" },
  ];
  return seconds ? [...parts, { value: s % 60, unit: "seconds" }] : parts;
}

/** The units between now and the target, the leading zero ones dropped (at least one is kept). */
export function breakdownOf(now: Date, target: Date, breakdown: Breakdown): Part[] {
  const [from, to] = now <= target ? [now, target] : [target, now];
  const ms = to.getTime() - from.getTime();
  const mode = breakdown === "auto" ? (addMonths(from, 12) <= to ? "years" : ms >= DAY_MS ? "days" : "live") : breakdown;
  const parts = mode === "years" ? calendarParts(from, to) : clockParts(ms, mode === "live");
  const first = parts.findIndex((p) => p.value > 0);
  return parts.slice(first < 0 ? parts.length - 1 : first);
}

/** The parts as a countdown shows them: trailing zero units dropped ("1 year 0 months 0 days" is "1 year"), the seconds of a live readout kept so it doesn't jump. At least one stays. */
export function trimTrailingZeros(parts: Part[]): Part[] {
  if (parts[parts.length - 1]?.unit === "seconds") return parts;
  let end = parts.length;
  while (end > 1 && parts[end - 1].value === 0) end--;
  return parts.slice(0, end);
}

/** The unit word for a value ("1 month", "2 months"). */
export const unitWord = (p: Part): string => (p.value === 1 ? p.unit.slice(0, -1) : p.unit);

/** How often (ms) the display changes: every second when it shows seconds, else every minute. `left` = ms to the target, for Auto. */
export function tickMs(breakdown: Breakdown, phase: Phase, left = Infinity): number {
  return phase !== "now" && (breakdown === "live" || (breakdown === "auto" && left < DAY_MS)) ? 1000 : 60_000;
}

/** The line under the numbers: "until December 31, 2030" (with the time of day when there is one); just the date while it is happening. */
export function dateLine(target: Date, allDay: boolean, phase: Phase, clock: "12" | "24" | "auto", locale = ""): string {
  const loc = locale || undefined;
  const date = target.toLocaleDateString(loc, { year: "numeric", month: "long", day: "numeric" });
  const time = allDay ? "" : `, ${target.toLocaleTimeString(loc, { hour: "2-digit", minute: "2-digit", ...(clock === "auto" ? {} : clock === "12" ? { hour12: true } : { hourCycle: "h23" as const }) })}`;
  return `${phase === "now" ? "" : `${phase} `}${date}${time}`;
}
