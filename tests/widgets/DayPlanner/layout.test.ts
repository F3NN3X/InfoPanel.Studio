import { describe, expect, it } from "vitest";
import { allDayTitles, hourMarks, nowFraction, placeEvents, railWindow, type RailEvent } from "@/widgets/DayPlanner/layout";

const H = 3_600_000;
const win = { start: 0, end: 10 * H };
const ev = (id: string, startH: number, endH: number, allDay = false): RailEvent => ({ id, title: id, start: startH * H, end: endH * H, allDay });

describe("placeEvents", () => {
  it("puts a lone event at its place on the rail, full width", () => {
    expect(placeEvents([ev("a", 2, 4)], win)).toMatchObject([{ from: 0.2, to: 0.4, lane: 0, lanes: 1 }]);
  });

  it("sets overlapping events side by side and leaves a later one alone", () => {
    const out = placeEvents([ev("a", 1, 4), ev("b", 2, 3), ev("c", 3, 5), ev("d", 6, 7)], win);
    const by = Object.fromEntries(out.map((p) => [p.event.id, p]));
    expect([by.a.lane, by.b.lane, by.c.lane]).toEqual([0, 1, 1]);
    expect([by.a.lanes, by.b.lanes, by.c.lanes]).toEqual([2, 2, 2]);
    expect(by.d).toMatchObject({ lane: 0, lanes: 1 });
  });

  it("does not treat events that only touch as overlapping", () => {
    const out = placeEvents([ev("a", 1, 2), ev("b", 2, 3)], win);
    expect(out.map((p) => p.lanes)).toEqual([1, 1]);
  });

  it("clamps an event that runs past either end of the window", () => {
    expect(placeEvents([ev("a", -3, 2), ev("b", 8, 14)], win).map((p) => [p.from, p.to])).toEqual([
      [0, 0.2],
      [0.8, 1],
    ]);
  });

  it("drops events outside the window and all-day events, and gives a zero-length one a visible height", () => {
    const out = placeEvents([ev("before", -5, -1), ev("after", 11, 12), ev("day", 0, 24, true), ev("ping", 5, 5)], win);
    expect(out.map((p) => p.event.id)).toEqual(["ping"]);
    expect(out[0].to - out[0].from).toBeGreaterThan(0);
  });

  it("gives nothing for an empty window", () => {
    expect(placeEvents([ev("a", 1, 2)], { start: 5, end: 5 })).toEqual([]);
  });
});

describe("rail helpers", () => {
  it("opens the window an hour before now, on the hour", () => {
    expect(railWindow(5 * H + 1234, 12)).toEqual({ start: 4 * H, end: 16 * H });
  });

  it("places the now line only inside the window", () => {
    expect(nowFraction(5 * H, win)).toBe(0.5);
    expect(nowFraction(11 * H, win)).toBeNull();
  });

  it("lists the all-day titles that touch the window", () => {
    expect(allDayTitles([ev("a", 0, 24, true), ev("b", 30, 40, true), ev("c", 1, 2)], win)).toEqual(["a"]);
  });

  it("counts each mark's day from the day of now", () => {
    const now = new Date(2026, 5, 10, 22, 30).getTime();
    const marks = hourMarks(railWindow(now, 6), 20, now);
    expect(marks.find((m) => m.hour === 23)!.day).toBe(0);
    expect(marks.find((m) => m.hour === 0)!.day).toBe(1);
  });

  it("thins the hour marks to the room", () => {
    expect(hourMarks(win, 100)).toHaveLength(11);
    expect(hourMarks(win, 4).length).toBeLessThanOrEqual(4);
  });
});
