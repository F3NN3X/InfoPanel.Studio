// A small iCalendar (RFC 5545) reader for the calendar links: the VEVENTs of a feed expanded to the
// occurrences in a time window. It covers what Google, Outlook and iCloud publish: UTC, floating,
// TZID (IANA and the common Windows names) and all-day times; RRULE with FREQ, INTERVAL, COUNT,
// UNTIL, BYDAY, BYMONTHDAY and BYMONTH; EXDATE; and RECURRENCE-ID overrides. Cancelled events are
// left out. Anything it cannot read is skipped rather than failing the feed.
//
// Node built-ins only. Pure: `parseIcs(text)` and `occurrences(events, from, to)`.

/** Windows time zone names Outlook writes as TZID, to IANA. */
const WINDOWS_TZ = {
  "UTC": "UTC",
  "Coordinated Universal Time": "UTC",
  "GMT Standard Time": "Europe/London",
  "Greenwich Standard Time": "Atlantic/Reykjavik",
  "W. Europe Standard Time": "Europe/Berlin",
  "Central Europe Standard Time": "Europe/Budapest",
  "Central European Standard Time": "Europe/Warsaw",
  "Romance Standard Time": "Europe/Paris",
  "FLE Standard Time": "Europe/Kiev",
  "GTB Standard Time": "Europe/Bucharest",
  "E. Europe Standard Time": "Europe/Chisinau",
  "Russian Standard Time": "Europe/Moscow",
  "Turkey Standard Time": "Europe/Istanbul",
  "Israel Standard Time": "Asia/Jerusalem",
  "Arabian Standard Time": "Asia/Dubai",
  "India Standard Time": "Asia/Kolkata",
  "China Standard Time": "Asia/Shanghai",
  "Singapore Standard Time": "Asia/Singapore",
  "Tokyo Standard Time": "Asia/Tokyo",
  "Korea Standard Time": "Asia/Seoul",
  "AUS Eastern Standard Time": "Australia/Sydney",
  "E. Australia Standard Time": "Australia/Brisbane",
  "New Zealand Standard Time": "Pacific/Auckland",
  "Eastern Standard Time": "America/New_York",
  "Central Standard Time": "America/Chicago",
  "Mountain Standard Time": "America/Denver",
  "US Mountain Standard Time": "America/Phoenix",
  "Pacific Standard Time": "America/Los_Angeles",
  "Alaskan Standard Time": "America/Anchorage",
  "Hawaiian Standard Time": "Pacific/Honolulu",
  "Atlantic Standard Time": "America/Halifax",
  "E. South America Standard Time": "America/Sao_Paulo",
  "SA Pacific Standard Time": "America/Bogota",
  "South Africa Standard Time": "Africa/Johannesburg",
};

const DAY_MS = 86_400_000;
const WEEKDAYS = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];
/** Occurrences tried per event before giving up (a daily rule over 50 years). */
const MAX_STEPS = 20_000;

/** The content lines, unfolded (a line starting with a space or tab continues the one before). */
function lines(text) {
  return String(text).replace(/\r\n[ \t]|\n[ \t]/g, "").split(/\r?\n/).filter(Boolean);
}

/** "DTSTART;TZID=Europe/Oslo:20261015T090000" → { name, params, value }. */
function property(line) {
  // The value starts at the first colon outside a quoted parameter.
  let quoted = false;
  let at = -1;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') quoted = !quoted;
    else if (ch === ":" && !quoted) {
      at = i;
      break;
    }
  }
  if (at < 0) return null;
  const [name, ...rest] = line.slice(0, at).split(";");
  const params = {};
  for (const p of rest) {
    const eq = p.indexOf("=");
    if (eq > 0) params[p.slice(0, eq).toUpperCase()] = p.slice(eq + 1).replace(/^"|"$/g, "");
  }
  return { name: name.toUpperCase(), params, value: line.slice(at + 1) };
}

const unescape = (v) => v.replace(/\\n/gi, "\n").replace(/\\([,;\\])/g, "$1").trim();

/** A TZID as an IANA zone Intl knows, or null (then the time is read as the server's local time). */
export function zoneOf(tzid) {
  if (!tzid) return null;
  const name = WINDOWS_TZ[tzid] ?? tzid.replace(/^\/[^/]+\/[^/]+\//, "");
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: name });
    return name;
  } catch {
    return null;
  }
}

/** The offset of `zone` from UTC at the instant `utcMs`, ms. */
function offsetAt(zone, utcMs) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", { timeZone: zone, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" })
      .formatToParts(new Date(utcMs))
      .map((p) => [p.type, p.value])
  );
  const asUtc = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second);
  return asUtc - Math.floor(utcMs / 1000) * 1000;
}

/**
 * A wall-clock time (kept as if it were UTC: `wall`) in `zone` as a real instant. `zone` null =
 * the server's local time; "UTC" = as is.
 */
export function toInstant(wall, zone) {
  if (zone === "UTC") return wall;
  if (!zone) {
    const d = new Date(wall);
    return new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), d.getUTCHours(), d.getUTCMinutes(), d.getUTCSeconds()).getTime();
  }
  // Two passes settle the offset across a DST change.
  let t = wall - offsetAt(zone, wall);
  t = wall - offsetAt(zone, t);
  return t;
}

/** "20261015T090000Z" / "20261015T090000" / "20261015" → { wall, zone, allDay }, or null. */
export function parseTime(value, params = {}) {
  const m = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?$/.exec(String(value).trim());
  if (!m) return null;
  const [, y, mo, d, h, mi, s, z] = m;
  const allDay = h === undefined || params.VALUE === "DATE";
  const wall = Date.UTC(+y, +mo - 1, +d, +(h ?? 0), +(mi ?? 0), +(s ?? 0));
  return { wall, zone: z ? "UTC" : allDay ? null : zoneOf(params.TZID), allDay };
}

/** "PT1H30M" / "P1D" → ms, or 0. */
function duration(v) {
  const m = /^([+-])?P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/.exec(String(v).trim());
  if (!m) return 0;
  const [, sign, w, d, h, mi, s] = m;
  const ms = ((+(w ?? 0) * 7 + +(d ?? 0)) * 24 * 3600 + +(h ?? 0) * 3600 + +(mi ?? 0) * 60 + +(s ?? 0)) * 1000;
  return sign === "-" ? -ms : ms;
}

function parseRule(value) {
  const r = Object.fromEntries(
    String(value)
      .split(";")
      .map((p) => p.split("="))
      .filter((p) => p.length === 2)
      .map(([k, v]) => [k.toUpperCase(), v])
  );
  if (!["DAILY", "WEEKLY", "MONTHLY", "YEARLY"].includes(r.FREQ)) return null;
  const list = (v) => (v ? v.split(",").filter(Boolean) : []);
  return {
    freq: r.FREQ,
    interval: Math.max(1, Number(r.INTERVAL) || 1),
    count: r.COUNT ? Number(r.COUNT) : undefined,
    until: r.UNTIL ? parseTime(r.UNTIL) : undefined,
    byDay: list(r.BYDAY).map((d) => {
      const m = /^([+-]?\d+)?(SU|MO|TU|WE|TH|FR|SA)$/.exec(d);
      return m ? { n: m[1] ? Number(m[1]) : 0, day: WEEKDAYS.indexOf(m[2]) } : null;
    }).filter(Boolean),
    byMonthDay: list(r.BYMONTHDAY).map(Number).filter(Number.isFinite),
    byMonth: list(r.BYMONTH).map(Number).filter(Number.isFinite),
    weekStart: WEEKDAYS.indexOf(r.WKST ?? "MO"),
  };
}

/**
 * The VEVENTs of a feed: { uid, title, location, start, end (both { wall, zone, allDay }), rule,
 * exdates (walls), recurrenceId (wall) }.
 */
export function parseIcs(text) {
  const events = [];
  let cur = null;
  for (const line of lines(text)) {
    const p = property(line);
    if (!p) continue;
    if (p.name === "BEGIN" && p.value.toUpperCase() === "VEVENT") {
      cur = { exdates: [] };
      continue;
    }
    if (!cur) continue;
    if (p.name === "END" && p.value.toUpperCase() === "VEVENT") {
      if (cur.start && cur.status !== "CANCELLED") {
        const end = cur.end ?? (cur.duration ? { ...cur.start, wall: cur.start.wall + cur.duration } : { ...cur.start, wall: cur.start.wall + (cur.start.allDay ? DAY_MS : 0) });
        events.push({ uid: cur.uid ?? `${cur.start.wall}:${cur.title ?? ""}`, title: cur.title ?? "", location: cur.location ?? "", start: cur.start, end, rule: cur.rule ?? null, exdates: cur.exdates, recurrenceId: cur.recurrenceId ?? null });
      }
      cur = null;
      continue;
    }
    switch (p.name) {
      case "UID":
        cur.uid = p.value.trim();
        break;
      case "SUMMARY":
        cur.title = unescape(p.value);
        break;
      case "LOCATION":
        cur.location = unescape(p.value);
        break;
      case "STATUS":
        cur.status = p.value.trim().toUpperCase();
        break;
      case "DTSTART":
        cur.start = parseTime(p.value, p.params) ?? cur.start;
        break;
      case "DTEND":
        cur.end = parseTime(p.value, p.params) ?? cur.end;
        break;
      case "DURATION":
        cur.duration = duration(p.value);
        break;
      case "RRULE":
        cur.rule = parseRule(p.value);
        break;
      case "EXDATE":
        for (const v of p.value.split(",")) {
          const t = parseTime(v, p.params);
          if (t) cur.exdates.push(t);
        }
        break;
      case "RECURRENCE-ID": {
        const t = parseTime(p.value, p.params);
        if (t) cur.recurrenceId = t;
        break;
      }
    }
  }
  return events;
}

const instant = (t) => (t.allDay ? toInstant(t.wall, null) : toInstant(t.wall, t.zone));

/** The day-of-month walls of `weekday` in a month: [first, second, ...]. */
function weekdaysOfMonth(y, m, weekday) {
  const out = [];
  for (let d = 1; d <= 31; d++) {
    const t = Date.UTC(y, m, d);
    if (new Date(t).getUTCMonth() !== m) break;
    if (new Date(t).getUTCDay() === weekday) out.push(d);
  }
  return out;
}

/** The candidate starts (walls) of one period of the rule, ascending. */
function periodStarts(rule, start, period) {
  const s = new Date(start);
  const time = start - Date.UTC(s.getUTCFullYear(), s.getUTCMonth(), s.getUTCDate());
  const at = (y, m, d) => Date.UTC(y, m, d) + time;
  switch (rule.freq) {
    case "DAILY": {
      const t = start + period * rule.interval * DAY_MS;
      // BYDAY on a daily rule keeps only those weekdays (FREQ=DAILY;BYDAY=MO,TU,WE,TH,FR).
      return rule.byDay.length && !rule.byDay.some((b) => b.day === new Date(t).getUTCDay()) ? [] : [t];
    }
    case "WEEKLY": {
      // The week (from WKST) holding the start, moved `period` intervals on.
      const base = start - ((s.getUTCDay() - rule.weekStart + 7) % 7) * DAY_MS + period * rule.interval * 7 * DAY_MS;
      const days = rule.byDay.length ? rule.byDay.map((b) => b.day) : [s.getUTCDay()];
      return days.map((day) => base + ((day - rule.weekStart + 7) % 7) * DAY_MS).sort((a, b) => a - b);
    }
    case "MONTHLY":
    case "YEARLY": {
      const months =
        rule.freq === "MONTHLY"
          ? [s.getUTCMonth() + period * rule.interval]
          : (rule.byMonth.length ? rule.byMonth.map((m) => m - 1) : [s.getUTCMonth()]).map((m) => m + 12 * period * rule.interval);
      const out = [];
      for (const mm of months) {
        const y = s.getUTCFullYear() + Math.floor(mm / 12);
        const m = ((mm % 12) + 12) % 12;
        if (rule.byDay.length) {
          for (const b of rule.byDay) {
            const all = weekdaysOfMonth(y, m, b.day);
            const pick = b.n === 0 ? all : [b.n > 0 ? all[b.n - 1] : all[all.length + b.n]];
            for (const d of pick) if (d) out.push(at(y, m, d));
          }
        } else {
          const days = rule.byMonthDay.length ? rule.byMonthDay : [s.getUTCDate()];
          for (const d of days) {
            const last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
            const day = d < 0 ? last + d + 1 : d;
            // A day the month does not have (the 31st) is skipped, as RFC 5545 says.
            if (day >= 1 && day <= last) out.push(at(y, m, day));
          }
        }
      }
      return out.sort((a, b) => a - b);
    }
  }
  return [];
}

/** The earliest wall a period of a monthly or yearly rule can hold: the first of its first month. */
function periodBegin(rule, start, period) {
  const s = new Date(start);
  const mm = rule.freq === "MONTHLY" ? s.getUTCMonth() + period * rule.interval : 12 * period * rule.interval;
  return Date.UTC(s.getUTCFullYear() + Math.floor(mm / 12), ((mm % 12) + 12) % 12, 1);
}

/**
 * The start walls of a recurring event up to `toWall`, from its start (so COUNT is right) and
 * until UNTIL (an instant). A period with no match (a daily rule's weekend) still counts as a step.
 */
function expand(ev, toWall) {
  const rule = ev.rule;
  const out = [];
  // A date-only UNTIL includes that whole day.
  const until = rule.until ? instant(rule.until) + (rule.until.allDay ? DAY_MS - 1 : 0) : Infinity;
  let n = 0;
  for (let period = 0, steps = 0; steps < MAX_STEPS; period++, steps++) {
    const starts = periodStarts(rule, ev.start.wall, period);
    // A period with no match (a month without the 31st) is skipped, not the end of the rule.
    const first = rule.freq === "DAILY" ? ev.start.wall + period * rule.interval * DAY_MS : (starts[0] ?? periodBegin(rule, ev.start.wall, period));
    if (first > toWall) break;
    for (const t of starts) {
      if (t < ev.start.wall) continue;
      if (t > toWall || instant({ ...ev.start, wall: t }) > until) return out;
      n++;
      if (rule.count !== undefined && n > rule.count) return out;
      out.push(t);
    }
  }
  return out;
}

/**
 * The occurrences overlapping [from, to] (unix ms), soonest first:
 * { id, title, location, start, end, allDay }.
 */
export function occurrences(events, from, to) {
  // Overrides and EXDATEs may be written in UTC against a zoned start: compare instants.
  const overrides = new Set();
  for (const ev of events) if (ev.recurrenceId) overrides.add(`${ev.uid}|${instant(ev.recurrenceId)}`);
  const out = [];
  const push = (ev, start, end) => {
    if (end <= from || start > to) return;
    out.push({ id: `${ev.uid}|${start}`, title: ev.title || "Event", ...(ev.location ? { location: ev.location } : {}), start, end, allDay: ev.start.allDay });
  };
  for (const ev of events) {
    if (ev.recurrenceId) {
      push(ev, instant(ev.start), instant(ev.end));
      continue;
    }
    const length = ev.end.wall - ev.start.wall;
    if (!ev.rule) {
      push(ev, instant(ev.start), instant(ev.end));
      continue;
    }
    // Expand in wall time a day past `to` (zones), then convert each start.
    const toWall = to + 2 * DAY_MS;
    const skip = new Set(ev.exdates.map(instant));
    for (const wall of expand(ev, toWall)) {
      const start = instant({ ...ev.start, wall });
      if (skip.has(start) || overrides.has(`${ev.uid}|${start}`)) continue;
      push(ev, start, instant({ ...ev.end, wall: wall + length }));
    }
  }
  return out.sort((a, b) => a.start - b.start);
}
