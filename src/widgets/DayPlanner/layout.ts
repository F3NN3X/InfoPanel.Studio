// The Day Planner's rail layout: where each event sits along the time rail and in which lane. Pure.

export interface RailEvent {
  id: string;
  title: string;
  /** Unix ms. */
  start: number;
  end: number;
  allDay: boolean;
}

export interface PlacedEvent {
  event: RailEvent;
  /** Position along the rail, 0 (start of the window) to 1 (end). */
  from: number;
  to: number;
  /** Side-by-side slot among the events it overlaps, and how many slots that group needs. */
  lane: number;
  lanes: number;
}

export interface RailWindow {
  start: number;
  end: number;
}

const HOUR = 3_600_000;

/** The window of `hours` that opens `lead` hours before `now`, on the hour. */
export function railWindow(now: number, hours: number, lead = 1): RailWindow {
  const start = Math.floor(now / HOUR) * HOUR - lead * HOUR;
  return { start, end: start + hours * HOUR };
}

/**
 * The timed events that touch `win`, clamped to it. Events that overlap in time sit in lanes side by side
 * (a group of chained overlaps shares its lane count); an event shorter than `minSpan` of the rail is drawn that long.
 */
export function placeEvents(events: readonly RailEvent[], win: RailWindow, minSpan = 0.02): PlacedEvent[] {
  const total = win.end - win.start;
  if (!(total > 0)) return [];
  const spans = events
    .filter((e) => !e.allDay && e.end >= e.start && e.end > win.start && e.start < win.end)
    .map((event) => {
      const from = Math.max(0, (event.start - win.start) / total);
      const to = Math.min(1, Math.max(from + minSpan, (event.end - win.start) / total));
      return { event, from, to };
    })
    .sort((a, b) => a.from - b.from || b.to - a.to);

  const placed: PlacedEvent[] = [];
  let group: Omit<PlacedEvent, "lanes">[] = [];
  let laneEnds: number[] = [];
  let groupEnd = -1;
  const flush = () => {
    for (const g of group) placed.push({ ...g, lanes: laneEnds.length });
    group = [];
    laneEnds = [];
  };
  for (const s of spans) {
    if (s.from >= groupEnd) flush();
    let lane = laneEnds.findIndex((end) => end <= s.from);
    if (lane < 0) lane = laneEnds.length;
    laneEnds[lane] = s.to;
    group.push({ ...s, lane });
    groupEnd = group.length === 1 ? s.to : Math.max(groupEnd, s.to);
  }
  flush();
  return placed;
}

/** The titles of the all-day events that touch the window. */
export function allDayTitles(events: readonly RailEvent[], win: RailWindow): string[] {
  return events.filter((e) => e.allDay && e.end > win.start && e.start < win.end).map((e) => e.title);
}

/** Where `now` falls on the rail (0-1), or null when it is outside the window. */
export function nowFraction(now: number, win: RailWindow): number | null {
  const f = (now - win.start) / (win.end - win.start);
  return f >= 0 && f <= 1 ? f : null;
}

export interface HourMark {
  at: number;
  hour: number;
  fraction: number;
  /** Calendar days after the day of `now` (0 = today). */
  day: number;
}

/** The whole hours inside the window, thinned to at most `max` marks; `day` counts from the day of `now`. */
export function hourMarks(win: RailWindow, max: number, now = win.start): HourMark[] {
  const first = Math.ceil(win.start / HOUR) * HOUR;
  const today = new Date(now);
  const midnight = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  const all: HourMark[] = [];
  for (let t = first; t <= win.end; t += HOUR) {
    const d = new Date(t);
    const day = Math.round((new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime() - midnight) / (24 * HOUR));
    all.push({ at: t, hour: d.getHours(), fraction: (t - win.start) / (win.end - win.start), day });
  }
  const step = Math.max(1, Math.ceil(all.length / Math.max(1, max)));
  return all.filter((_, i) => i % step === 0);
}
