import { describe, expect, it } from "vitest";
import { EMPTY_EXTRAS, parseExtras, type CalendarEvent } from "@/lib/extras";
import { calendarUpdate, pageNotice, pluginChanges } from "@/lib/island/dashboard-notices";

const MIN = 60_000;

describe("page and plugin notices", () => {
  it("names a new page, not the first one shown or the same one", () => {
    expect(pageNotice(null, "Main")).toBeNull();
    expect(pageNotice("Main", "Main")).toBeNull();
    expect(pageNotice("Main", "Games")).toMatchObject({ id: "page", title: "Games", refresh: true });
  });

  it("raises a plugin coming back after it was gone, once", () => {
    const all = new Map([
      ["a", "Alpha"],
      ["b", "Beta"],
    ]);
    const onlyA = new Map([["a", "Alpha"]]);
    const base = pluginChanges(null, all, new Set());
    expect(base.notices).toEqual([]);
    const gone = pluginChanges(all, onlyA, base.gone);
    expect([...gone.gone]).toEqual(["b"]);
    expect(gone.notices).toEqual([]);
    // Still gone on the next poll, then back.
    const still = pluginChanges(onlyA, onlyA, gone.gone);
    const back = pluginChanges(onlyA, all, still.gone);
    expect(back.notices).toEqual([{ id: "plugin:b", severity: "info", title: "Beta is back", body: "Plugin reporting again", ttl: 4000 }]);
    expect(back.gone.size).toBe(0);
  });
});

describe("calendar countdown", () => {
  const now = Date.parse("2026-10-15T08:00:00Z");
  const ev = (id: string, inMin: number, extra: Partial<CalendarEvent> = {}): CalendarEvent => ({ id, title: id, start: now + inMin * MIN, end: now + (inMin + 30) * MIN, allDay: false, ...extra });

  it("counts down the next event within the lead and opens once", () => {
    const events = [ev("Standup", 8, { location: "Room 1" }), ev("Later", 90)];
    const first = calendarUpdate(events, now, 10, new Set());
    expect(first.activity).toMatchObject({ title: "Standup", subtitle: "in 8 min", priority: 1 });
    expect(first.notices).toEqual([{ id: "cal:Standup", severity: "info", title: "Standup", body: "in 8 min · Room 1", ttl: 6000 }]);
    expect(calendarUpdate(events, now + MIN, 10, first.announced).notices).toEqual([]);
    const starting = calendarUpdate(events, now + 8 * MIN, 10, first.announced);
    expect(starting.notices?.[0]).toMatchObject({ severity: "warning", body: "Starting now · Room 1" });
  });

});

describe("parseExtras", () => {
  it("reads the server's state tolerantly", () => {
    expect(parseExtras(null)).toEqual(EMPTY_EXTRAS);
    const s = parseExtras({
      obs: { configured: true, connected: true, streaming: "yes", recording: true },
      calendar: {
        configured: true,
        events: [{ id: "a", title: "", start: 1, end: 2 }, { id: 3 }],
        error: "x: HTTP 404",
      },
    });
    expect(s.obs).toEqual({ ...EMPTY_EXTRAS.obs, configured: true, connected: true, streaming: false, recording: true });
    expect(s.calendar).toEqual({ configured: true, events: [{ id: "a", title: "Event", start: 1, end: 2, allDay: false }], error: "x: HTTP 404" });
  });
});
