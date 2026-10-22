import { describe, expect, it } from "vitest";
import { weekDays } from "@/widgets/WeatherViews";

const cond = { kind: "rain", night: false } as const;
const fc = [
  { date: "Tue 13 Oct", cond, hi: 8, lo: 4 },
  { date: "Wed 14 Oct", cond, hi: 14, lo: 7 },
];

describe("weekDays", () => {
  it("builds Today from the current reading when the forecast starts tomorrow", () => {
    const days = weekDays(fc, { cond, temp: 6 }, new Date(2026, 9, 12));
    expect(days.map((d) => d.label)).toEqual(["Today", "Tue", "Wed"]);
    expect(days[0].hi).toBe(6);
    expect(days[0].lo).toBeUndefined();
  });

  it("labels a first row that is today as Today", () => {
    const days = weekDays(fc, { cond, temp: 6 }, new Date(2026, 9, 13));
    expect(days.map((d) => d.label)).toEqual(["Today", "Wed"]);
    expect(days[0]).toMatchObject({ hi: 8, lo: 4 });
  });
});
