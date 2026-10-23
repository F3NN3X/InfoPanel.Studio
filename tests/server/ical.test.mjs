import { describe, expect, it } from "vitest";
import { occurrences, parseIcs, parseTime, toInstant, zoneOf } from "../../server/ical.mjs";

const feed = (...events) => ["BEGIN:VCALENDAR", "VERSION:2.0", ...events.flatMap((e) => ["BEGIN:VEVENT", ...e, "END:VEVENT"]), "END:VCALENDAR"].join("\r\n");
const utc = (s) => Date.parse(s);
const DAY = 86_400_000;

describe("parseTime and zones", () => {
  it("reads UTC, zoned and all-day times", () => {
    expect(parseTime("20261015T090000Z")).toEqual({ wall: utc("2026-10-15T09:00:00Z"), zone: "UTC", allDay: false });
    expect(parseTime("20261015T090000", { TZID: "Europe/Oslo" })?.zone).toBe("Europe/Oslo");
    expect(parseTime("20261015", { VALUE: "DATE" })?.allDay).toBe(true);
    expect(parseTime("garbage")).toBeNull();
  });

  it("maps Windows zone names and drops unknown ones", () => {
    expect(zoneOf("W. Europe Standard Time")).toBe("Europe/Berlin");
    expect(zoneOf("Not/AZone")).toBeNull();
  });

  it("converts a wall time in a zone across DST", () => {
    // Oslo is UTC+2 in summer and UTC+1 in winter.
    expect(toInstant(utc("2026-07-01T09:00:00Z"), "Europe/Oslo")).toBe(utc("2026-07-01T07:00:00Z"));
    expect(toInstant(utc("2026-12-01T09:00:00Z"), "Europe/Oslo")).toBe(utc("2026-12-01T08:00:00Z"));
  });
});

describe("occurrences", () => {
  const from = utc("2026-10-15T00:00:00Z");
  const to = from + 3 * DAY;

  it("lists single events in the window, soonest first, and skips cancelled ones", () => {
    const events = parseIcs(
      feed(
        ["UID:b", "SUMMARY:Later", "DTSTART:20261016T120000Z", "DTEND:20261016T130000Z"],
        ["UID:a", "SUMMARY:Standup\\, daily", "LOCATION:Room 1", "DTSTART:20261015T090000Z", "DURATION:PT15M"],
        ["UID:c", "SUMMARY:Gone", "STATUS:CANCELLED", "DTSTART:20261015T100000Z"],
        ["UID:d", "SUMMARY:Past", "DTSTART:20261001T100000Z", "DTEND:20261001T110000Z"]
      )
    );
    const list = occurrences(events, from, to);
    expect(list.map((o) => o.title)).toEqual(["Standup, daily", "Later"]);
    expect(list[0]).toMatchObject({ start: utc("2026-10-15T09:00:00Z"), end: utc("2026-10-15T09:15:00Z"), location: "Room 1", allDay: false });
  });

  it("unfolds long lines", () => {
    const text = feed(["UID:x", "SUMMARY:A very", "  long title", "DTSTART:20261015T090000Z"]);
    expect(occurrences(parseIcs(text), from, to)[0].title).toBe("A very long title");
  });

  it("expands a weekly rule with BYDAY, EXDATE and an override", () => {
    const events = parseIcs(
      feed(
        ["UID:w", "SUMMARY:Sync", "DTSTART;TZID=Europe/Oslo:20261005T100000", "DTEND;TZID=Europe/Oslo:20261005T103000", "RRULE:FREQ=WEEKLY;BYDAY=MO,TH", "EXDATE;TZID=Europe/Oslo:20261019T100000"],
        ["UID:w", "SUMMARY:Sync (moved)", "RECURRENCE-ID;TZID=Europe/Oslo:20261015T100000", "DTSTART;TZID=Europe/Oslo:20261015T140000", "DTEND;TZID=Europe/Oslo:20261015T143000"]
      )
    );
    const list = occurrences(events, from, from + 8 * DAY);
    // Thu 15 moved to 14:00, Mon 19 excluded, Thu 22 regular. Oslo is UTC+2 until 25 Oct.
    expect(list.map((o) => [o.title, new Date(o.start).toISOString()])).toEqual([
      ["Sync (moved)", "2026-10-15T12:00:00.000Z"],
      ["Sync", "2026-10-22T08:00:00.000Z"],
    ]);
  });

  it("honours COUNT, UNTIL and INTERVAL", () => {
    const counted = parseIcs(feed(["UID:c", "SUMMARY:C", "DTSTART:20261014T080000Z", "RRULE:FREQ=DAILY;COUNT=3"]));
    expect(occurrences(counted, from, to).map((o) => new Date(o.start).getUTCDate())).toEqual([15, 16]);
    const until = parseIcs(feed(["UID:u", "SUMMARY:U", "DTSTART:20261015T080000Z", "RRULE:FREQ=DAILY;UNTIL=20261016"]));
    expect(occurrences(until, from, to).map((o) => new Date(o.start).getUTCDate())).toEqual([15, 16]);
    const every2 = parseIcs(feed(["UID:i", "SUMMARY:I", "DTSTART:20261015T080000Z", "RRULE:FREQ=DAILY;INTERVAL=2"]));
    expect(occurrences(every2, from, to).map((o) => new Date(o.start).getUTCDate())).toEqual([15, 17]);
  });

  it("expands weekdays-only daily rules and monthly nth-weekday rules", () => {
    const weekdays = parseIcs(feed(["UID:d", "SUMMARY:D", "DTSTART:20261016T080000Z", "RRULE:FREQ=DAILY;BYDAY=MO,TU,WE,TH,FR"]));
    // Fri 16, (Sat, Sun skipped), Mon 19.
    expect(occurrences(weekdays, from, from + 5 * DAY).map((o) => new Date(o.start).getUTCDate())).toEqual([16, 19]);
    const lastFriday = parseIcs(feed(["UID:m", "SUMMARY:M", "DTSTART:20260925T080000Z", "RRULE:FREQ=MONTHLY;BYDAY=-1FR"]));
    expect(occurrences(lastFriday, from, from + 20 * DAY).map((o) => new Date(o.start).toISOString().slice(0, 10))).toEqual(["2026-10-30"]);
  });

  it("skips a month without the day and goes on to the next that has it", () => {
    const thirtyFirst = parseIcs(feed(["UID:31", "SUMMARY:31", "DTSTART:20261031T080000Z", "RRULE:FREQ=MONTHLY;BYMONTHDAY=31"]));
    // November has no 31st: December's still shows, and so does January's after it.
    expect(occurrences(thirtyFirst, utc("2026-11-01T00:00:00Z"), utc("2027-01-31T23:00:00Z")).map((o) => new Date(o.start).toISOString().slice(0, 10))).toEqual(["2026-12-31", "2027-01-31"]);
    // A yearly 29 February waits for the next leap year.
    const leap = parseIcs(feed(["UID:29", "SUMMARY:29", "DTSTART:20240229T080000Z", "RRULE:FREQ=YEARLY;BYMONTH=2;BYMONTHDAY=29"]));
    expect(occurrences(leap, utc("2025-01-01T00:00:00Z"), utc("2028-12-31T00:00:00Z")).map((o) => new Date(o.start).toISOString().slice(0, 10))).toEqual(["2028-02-29"]);
  });

  it("marks all-day events", () => {
    const list = occurrences(parseIcs(feed(["UID:h", "SUMMARY:Holiday", "DTSTART;VALUE=DATE:20261016", "DTEND;VALUE=DATE:20261017"])), from, to);
    expect(list).toHaveLength(1);
    expect(list[0].allDay).toBe(true);
  });
});
