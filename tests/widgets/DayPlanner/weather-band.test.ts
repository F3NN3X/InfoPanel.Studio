import { describe, expect, it } from "vitest";
import { forecastDay, weatherBand } from "@/widgets/DayPlanner/weather-band";

const H = 3_600_000;

describe("forecastDay", () => {
  it("reads the plugin's row", () => {
    expect(forecastDay("Mon 26 Oct", "14 °C / 8 °C", "9.1mm")).toEqual({ day: 26, month: 9, hi: 14, lo: 8, rain: 9.1 });
  });

  it("gives null for a date or range it cannot read", () => {
    expect(forecastDay("tomorrow", "14 / 8", "0mm")).toBeNull();
    expect(forecastDay("Mon 26 Oct", "warm", "0mm")).toBeNull();
  });
});

describe("weatherBand", () => {
  const now = new Date(2026, 9, 25, 12, 0).getTime();
  const win = { start: now - H, end: now + 12 * H };

  it("is null with no temperature and no forecast", () => {
    expect(weatherBand(win, now, { temp: NaN, rain: NaN, days: [] })).toBeNull();
  });

  it("meets the current temperature now and swings by the forecast's range", () => {
    const band = weatherBand(win, now, { temp: 10, rain: 0, days: [{ day: 26, month: 9, hi: 14, lo: 8, rain: 0 }] })!;
    expect(band.find((b) => b.at === now)!.temp).toBeCloseTo(10, 5);
    const temps = band.map((b) => b.temp);
    expect(Math.max(...temps) - Math.min(...temps)).toBeLessThanOrEqual(6.01);
  });

  it("uses a day's own range for its hours and spreads its rain", () => {
    const tomorrow = { day: 26, month: 9, hi: 14, lo: 8, rain: 48 };
    const band = weatherBand({ start: new Date(2026, 9, 26, 0).getTime(), end: new Date(2026, 9, 26, 23).getTime() }, now, { temp: 10, rain: 0, days: [tomorrow] })!;
    expect(Math.max(...band.map((b) => b.temp))).toBeCloseTo(14, 5);
    expect(band[3].rain).toBeCloseTo(2 / 2, 5);
  });

  it("lets today's rain follow the current rate and fade out", () => {
    const band = weatherBand(win, now, { temp: 10, rain: 2, days: [] })!;
    const at = (t: number) => band.find((b) => b.at === t)!.rain;
    expect(at(now)).toBeCloseTo(1, 5);
    expect(at(now + 3 * H)).toBe(0);
  });
});
