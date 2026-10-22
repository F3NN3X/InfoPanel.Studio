import { describe, expect, it } from "vitest";
import { appIconName, meteoconName, weatherKind } from "@/lib/weather-icons";

describe("weatherKind", () => {
  it.each([
    ["clearsky_day", "clear", false],
    ["fair_night", "partly-cloudy", true],
    ["partlycloudy_night", "partly-cloudy", true],
    ["lightrainshowers_day", "rain", false],
    ["heavyrain", "heavy-rain", false],
    ["lightrainandthunder_day", "thunder", false],
    ["lightsleet", "sleet", false],
    ["heavysnow", "snow", false],
    ["fog", "fog", false],
    ["clear-night", "clear", true],
  ])("reads the Yr-style code %s", (code, kind, night) => {
    expect(weatherKind(code, "")).toEqual({ kind, night });
  });

  it.each([
    ["01d", "clear", false],
    ["01n", "clear", true],
    ["02d", "mostly-clear", false],
    ["04n", "overcast", true],
    ["09d", "rain", false],
    ["11d", "thunder", false],
    ["13n", "snow", true],
    ["50d", "fog", false],
  ])("reads the OpenWeatherMap code %s", (code, kind, night) => {
    expect(weatherKind(code, "")).toEqual({ kind, night });
  });

  it("prefers a recognised code over the text", () => {
    expect(weatherKind("13d", "Clear Sky").kind).toBe("snow");
  });

  it.each([
    ["Moderate Rain", "rain"],
    ["Heavy rain showers", "heavy-rain"],
    ["Light drizzle", "drizzle"],
    ["Thunderstorm", "thunder"],
    ["Hail", "hail"],
    ["Sleet", "sleet"],
    ["Mist", "fog"],
    ["Windy", "wind"],
    ["Overcast", "overcast"],
    ["Mostly clear", "mostly-clear"],
    ["Partly Cloudy", "partly-cloudy"],
    ["Cloudy", "cloudy"],
    ["Clear Sky", "clear"],
    ["Whatever", "partly-cloudy"],
  ])("falls back to the text %s", (text, kind) => {
    expect(weatherKind("-", text).kind).toBe(kind);
  });

  it("takes night from the code, the text or the caller", () => {
    expect(weatherKind("-", "Clear night").night).toBe(true);
    expect(weatherKind("-", "Clear", true).night).toBe(true);
    expect(weatherKind("-", "Clear").night).toBe(false);
  });
});

describe("icon names", () => {
  it("keeps today's app icons", () => {
    expect(appIconName({ kind: "partly-cloudy", night: true })).toBe("partly_cloudy_night");
    expect(appIconName({ kind: "clear", night: false })).toBe("clear_day");
    expect(appIconName({ kind: "sleet", night: false })).toBe("weather_snowy");
    expect(appIconName({ kind: "heavy-rain", night: false })).toBe("rainy");
  });

  it("names a Meteocons file for every kind", () => {
    expect(meteoconName({ kind: "partly-cloudy", night: true })).toBe("partly-cloudy-night");
    expect(meteoconName({ kind: "thunder", night: false })).toBe("thunderstorms-day");
    expect(meteoconName({ kind: "heavy-rain", night: true })).toBe("extreme-night-rain");
    expect(meteoconName({ kind: "hail", night: false })).toBe("partly-cloudy-day-hail");
    expect(meteoconName({ kind: "cloudy", night: true })).toBe("cloudy");
  });
});
