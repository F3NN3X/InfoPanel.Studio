import { describe, expect, it } from "vitest";
import { breakdownOf, dateLine, isDate, isTime, phaseOf, targetOf, tickMs, unitWord } from "@/lib/countdown";

const at = (y: number, m: number, d: number, h = 0, mi = 0, s = 0) => new Date(y, m - 1, d, h, mi, s);
const flat = (now: Date, target: Date, b: Parameters<typeof breakdownOf>[2]) => breakdownOf(now, target, b).map((p) => `${p.value} ${unitWord(p)}`);

describe("targetOf", () => {
  it("is local time; no time is midnight", () => {
    expect(targetOf("2030-12-31", "")).toEqual(at(2030, 12, 31));
    expect(targetOf("2032-10-12", "13:24")).toEqual(at(2032, 10, 12, 13, 24));
  });
  it("is null for a malformed or impossible date or time", () => {
    for (const [d, t] of [["", ""], ["2030-13-01", ""], ["2030-02-30", ""], ["12/31/2030", ""], ["2030-12-31", "24:00"], ["2030-12-31", "9:30"]]) expect(targetOf(d, t)).toBeNull();
  });
  it("accepts a leap day only in a leap year", () => {
    expect(targetOf("2028-02-29", "")).not.toBeNull();
    expect(targetOf("2027-02-29", "")).toBeNull();
  });
  it("is checked by isDate and isTime", () => {
    expect([isDate("2030-12-31"), isDate("nope"), isDate(5), isTime("07:05"), isTime(""), isTime("7:05")]).toEqual([true, false, false, true, false, false]);
  });
});

describe("phaseOf", () => {
  const t = at(2030, 6, 1, 12);
  it("counts down before the target in every mode", () => {
    for (const m of ["auto", "until", "since"] as const) expect(phaseOf(at(2030, 6, 1, 11, 59, 59), t, m, false)).toBe("until");
  });
  it("is now exactly at the target; until stays now after it", () => {
    expect(phaseOf(t, t, "auto", false)).toBe("now");
    expect(phaseOf(at(2031, 1, 1), t, "until", false)).toBe("now");
  });
  it("since counts up from the target", () => {
    expect(phaseOf(t, t, "since", false)).toBe("since");
  });
  it("auto holds now for an hour when timed, then counts since", () => {
    expect(phaseOf(at(2030, 6, 1, 12, 59, 59), t, "auto", false)).toBe("now");
    expect(phaseOf(at(2030, 6, 1, 13), t, "auto", false)).toBe("since");
  });
  it("auto holds now to the end of the day when all-day", () => {
    const day = at(2030, 6, 1);
    expect(phaseOf(at(2030, 6, 1, 23, 59, 59), day, "auto", true)).toBe("now");
    expect(phaseOf(at(2030, 6, 2), day, "auto", true)).toBe("since");
  });
});

describe("breakdownOf", () => {
  it("years: calendar years, months and days", () => {
    expect(flat(at(2026, 10, 22), at(2030, 12, 31), "years")).toEqual(["4 years", "2 months", "9 days"]);
  });
  it("counts up the same way once past the target", () => {
    expect(flat(at(2030, 12, 31), at(2026, 10, 22), "years")).toEqual(["4 years", "2 months", "9 days"]);
  });
  it("holds the day of month at a shorter month's end", () => {
    expect(flat(at(2027, 1, 31), at(2027, 2, 28), "years")).toEqual(["1 month", "0 days"]);
    expect(flat(at(2027, 1, 31), at(2027, 3, 1), "years")).toEqual(["1 month", "1 day"]);
  });
  it("handles a leap day", () => {
    expect(flat(at(2028, 2, 29), at(2029, 2, 28), "years")).toEqual(["1 year", "0 months", "0 days"]);
    expect(flat(at(2028, 2, 28), at(2028, 3, 1), "years")).toEqual(["2 days"]);
  });
  it("days: total days, hours and minutes", () => {
    expect(flat(at(2026, 11, 10), at(2026, 12, 20, 2, 30), "days")).toEqual(["40 days", "2 hours", "30 minutes"]);
  });
  it("live adds seconds and drops the leading zero units", () => {
    expect(flat(at(2026, 10, 22, 10), at(2026, 10, 22, 10, 0, 45), "live")).toEqual(["45 seconds"]);
    expect(flat(at(2026, 10, 22, 10), at(2026, 10, 22, 11, 0, 1), "live")).toEqual(["1 hour", "0 minutes", "1 second"]);
  });
  it("always keeps one unit", () => {
    expect(flat(at(2026, 10, 22), at(2026, 10, 22), "live")).toEqual(["0 seconds"]);
    expect(flat(at(2026, 10, 22), at(2026, 10, 22, 3), "years")).toEqual(["0 days"]);
    expect(flat(at(2026, 10, 22), at(2026, 10, 22, 0, 0, 30), "days")).toEqual(["0 minutes"]);
  });
  it("auto: years from a year, days from a day, else live", () => {
    expect(flat(at(2026, 10, 22), at(2027, 10, 22), "auto")).toEqual(["1 year", "0 months", "0 days"]);
    expect(flat(at(2026, 10, 22), at(2027, 10, 21, 23), "auto")).toEqual(["364 days", "23 hours", "0 minutes"]);
    expect(flat(at(2026, 10, 22), at(2026, 10, 23), "auto")).toEqual(["1 day", "0 hours", "0 minutes"]);
    expect(flat(at(2026, 10, 22), at(2026, 10, 22, 23, 59, 59), "auto")).toEqual(["23 hours", "59 minutes", "59 seconds"]);
  });
  it("words are singular at 1", () => {
    expect([unitWord({ value: 1, unit: "months" }), unitWord({ value: 0, unit: "months" }), unitWord({ value: 2, unit: "seconds" })]).toEqual(["month", "months", "seconds"]);
  });
});

describe("tickMs", () => {
  it("is a second for live, or auto under a day; else a minute", () => {
    expect(tickMs("live", "until")).toBe(1000);
    expect(tickMs("auto", "until", 3_600_000)).toBe(1000);
    expect(tickMs("auto", "since", 86_400_000)).toBe(60_000);
    expect(tickMs("days", "until", 1000)).toBe(60_000);
    expect(tickMs("live", "now")).toBe(60_000);
  });
});

describe("dateLine", () => {
  it("is the date for all-day and the time of day otherwise", () => {
    expect(dateLine(at(2030, 12, 31), true, "until", "auto", "en-US")).toBe("until December 31, 2030");
    expect(dateLine(at(2032, 10, 12, 13, 24), false, "until", "12", "en-US")).toBe("until October 12, 2032, 01:24 PM");
    expect(dateLine(at(2032, 10, 12, 13, 24), false, "until", "24", "en-US")).toBe("until October 12, 2032, 13:24");
  });
  it("shows only the date while it is happening, and since after", () => {
    expect(dateLine(at(2026, 9, 1), true, "now", "auto", "en-US")).toBe("September 1, 2026");
    expect(dateLine(at(2026, 9, 1), true, "since", "auto", "en-US")).toBe("since September 1, 2026");
  });
  it("writes midnight as 00:00 on a 24 h clock", () => {
    expect(dateLine(at(2030, 1, 1, 0, 5), false, "until", "24", "en-US")).toBe("until January 1, 2030, 00:05");
  });
});
