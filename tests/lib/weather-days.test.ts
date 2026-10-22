import { describe, expect, it } from "vitest";
import { isToday, weekdayLabel } from "@/lib/weather-days";

describe("weather days", () => {
  it("reads the weekday off a forecast date", () => {
    expect(weekdayLabel("Tue 13 Oct")).toBe("Tue");
    expect(weekdayLabel("")).toBe("");
  });

  it("matches a forecast date to the day, by day and month", () => {
    const now = new Date(2026, 9, 13, 23, 59);
    expect(isToday("Tue 13 Oct", now)).toBe(true);
    expect(isToday("Wed 14 Oct", now)).toBe(false);
    expect(isToday("Tue 13 Nov", now)).toBe(false);
    expect(isToday("soon", now)).toBe(false);
  });
});
