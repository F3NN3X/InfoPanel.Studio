import { describe, expect, it } from "vitest";
import { dayFraction, nextEvent, rangeFraction, secondFraction, untilText, weekFraction, yearFraction } from "@/widgets/RadialClock/fractions";

const at = (y: number, mo: number, d: number, h = 0, mi = 0) => new Date(y, mo, d, h, mi).getTime();

describe("period fractions", () => {
  it("runs the day from local midnight", () => {
    expect(dayFraction(at(2026, 5, 10, 0))).toBe(0);
    expect(dayFraction(at(2026, 5, 10, 6))).toBeCloseTo(0.25, 6);
    expect(dayFraction(at(2026, 5, 10, 23, 59))).toBeLessThan(1);
  });

  it("runs the year from 1 January and counts a leap year's extra day", () => {
    expect(yearFraction(at(2026, 0, 1))).toBe(0);
    expect(yearFraction(at(2026, 6, 2, 12))).toBeCloseTo(0.5, 2);
    expect(yearFraction(at(2024, 1, 29))).toBeCloseTo(59 / 366, 6);
  });

  it("runs the week from the chosen first day", () => {
    const wed = at(2026, 5, 10, 12);
    expect(weekFraction(wed, 1)).toBeCloseTo(2.5 / 7, 6);
    expect(weekFraction(wed, 0)).toBeCloseTo(3.5 / 7, 6);
    expect(weekFraction(at(2026, 9, 26), 1)).toBe(0);
  });

  it("runs the minute", () => {
    expect(secondFraction(15_000)).toBe(0.25);
  });
});

describe("nextEvent", () => {
  const now = at(2026, 9, 25, 12);
  const min = 60_000;
  const e = (title: string, startMin: number, allDay = false) => ({ title, start: now + startMin * min, allDay });

  it("fills as the soonest timed event comes within the run-up", () => {
    const out = nextEvent(now, [e("later", 90), e("soon", 30)], 120);
    expect(out).toEqual({ fraction: 0.75, minutes: 30, title: "soon" });
  });

  it("is empty when the event is beyond the run-up, and full when it starts now", () => {
    expect(nextEvent(now, [e("far", 300)], 120)).toMatchObject({ fraction: 0, minutes: 300 });
    expect(nextEvent(now, [e("now", 0)], 120).fraction).toBe(1);
  });

  it("has no next event when none is ahead, or only past and all-day ones", () => {
    expect(nextEvent(now, [], 120)).toEqual({ fraction: 0, minutes: null, title: "" });
    expect(nextEvent(now, [e("past", -10), e("day", 20, true)], 120).minutes).toBeNull();
  });
});

describe("rangeFraction and untilText", () => {
  it("clamps a sensor into its range and reads an unknown as empty", () => {
    expect(rangeFraction(50, 0, 200)).toBe(0.25);
    expect(rangeFraction(300, 0, 200)).toBe(1);
    expect(rangeFraction(NaN, 0, 100)).toBe(0);
    expect(rangeFraction(5, 10, 10)).toBe(0);
  });

  it("words the time to the event", () => {
    expect(untilText(null)).toBe("–");
    expect(untilText(25)).toBe("25 min");
    expect(untilText(125)).toBe("2 h 5 min");
    expect(untilText(180)).toBe("3 h");
    expect(untilText(1620)).toBe("1 d 3 h");
  });
});
