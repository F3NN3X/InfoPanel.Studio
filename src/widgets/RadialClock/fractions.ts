// The Radial Clock Stack's ring fractions (0-1). Pure; `now` is a Unix ms time, read in local time.

/** The share of the local day gone; follows a 23 or 25 hour day across a clock change. */
export function dayFraction(now: number): number {
  const d = new Date(now);
  const a = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const b = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1).getTime();
  return (now - a) / (b - a);
}

/** The share of the year gone. */
export function yearFraction(now: number): number {
  const y = new Date(now).getFullYear();
  const a = new Date(y, 0, 1).getTime();
  const b = new Date(y + 1, 0, 1).getTime();
  return (now - a) / (b - a);
}

/** The share of the week gone, the week starting on `weekStart` (0 = Sunday). */
export function weekFraction(now: number, weekStart: number): number {
  const d = new Date(now);
  const back = (d.getDay() - weekStart + 7) % 7;
  const a = new Date(d.getFullYear(), d.getMonth(), d.getDate() - back).getTime();
  const b = new Date(d.getFullYear(), d.getMonth(), d.getDate() - back + 7).getTime();
  return (now - a) / (b - a);
}

/** The share of the minute gone. */
export const secondFraction = (now: number): number => (now % 60_000) / 60_000;

export interface NextEvent {
  /** How full the ring is: 0 when the event is `horizonMin` or more away (or there is none), 1 when it starts. */
  fraction: number;
  /** Minutes to the start; null when no timed event is ahead. */
  minutes: number | null;
  title: string;
}

/** The soonest timed event that has not started, and its ring fraction over a `horizonMin` run-up. */
export function nextEvent(now: number, events: readonly { title: string; start: number; allDay: boolean }[], horizonMin: number): NextEvent {
  const ahead = events.filter((e) => !e.allDay && e.start >= now).sort((a, b) => a.start - b.start)[0];
  if (!ahead) return { fraction: 0, minutes: null, title: "" };
  const minutes = (ahead.start - now) / 60_000;
  const fraction = horizonMin > 0 ? Math.min(1, Math.max(0, 1 - minutes / horizonMin)) : 0;
  return { fraction, minutes, title: ahead.title };
}

/** A sensor value as a ring fraction over `min`..`max`; 0 when it is unknown or the range is empty. */
export function rangeFraction(value: number, min: number, max: number): number {
  if (!Number.isFinite(value) || !(max > min)) return 0;
  return Math.min(1, Math.max(0, (value - min) / (max - min)));
}

/** Minutes as "25 min", "2 h 5 min" or "1 d 3 h"; "–" for none. */
export function untilText(minutes: number | null): string {
  if (minutes === null) return "–";
  const m = Math.max(0, Math.round(minutes));
  if (m < 60) return `${m} min`;
  if (m < 1440) return m % 60 ? `${Math.floor(m / 60)} h ${m % 60} min` : `${m / 60} h`;
  return `${Math.floor(m / 1440)} d ${Math.floor((m % 1440) / 60)} h`;
}
