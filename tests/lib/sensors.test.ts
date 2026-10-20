import { describe, expect, it } from "vitest";
import {
  bySuffixOrName,
  findEntry,
  groupByContainer,
  liveText,
  liveValue,
  sensorAt,
  YR_FORECAST_KEY,
} from "@/lib/sensors";

const t = (text: string, name?: string) => ({ text, unit: "", name });

const sensors = {
  "plugins.yr-weather-plugin.brevik-norway.forecast": t("Mon 12, Cloudy"),
  "plugins.yr-weather-plugin.brevik-norway.temp": t("5 °C"),
  "plugins.audio-level-meter.default-audio.audio-level": { value: 0.4, unit: "" },
  "plugins.audio-level-meter.dev-1.audio-level": { value: 0.1, unit: "" },
  "plugins.audio-level-meter.dev-1.device-name": t("Speakers"),
  "plugins.old-meter.dev.x": t("1", "Level"),
};

describe("sensorAt", () => {
  it("reads plain keys", () => {
    expect(sensorAt(sensors, "plugins.yr-weather-plugin.brevik-norway.temp")?.text).toBe("5 °C");
    expect(sensorAt(sensors, "nope")).toBeUndefined();
  });

  it("resolves the yr forecast placeholder to the first location", () => {
    expect(sensorAt(sensors, YR_FORECAST_KEY)?.text).toBe("Mon 12, Cloudy");
    expect(sensorAt({}, YR_FORECAST_KEY)).toBeUndefined();
  });
});

describe("container lookups", () => {
  const P = "plugins.audio-level-meter.";

  it("findEntry finds an entry id in any container", () => {
    expect(findEntry(sensors, P, "device-name")?.key).toBe(`${P}dev-1.device-name`);
    expect(findEntry(sensors, P, "missing")).toBeUndefined();
  });

  it("groupByContainer groups by the segment after the prefix", () => {
    const groups = groupByContainer(sensors, P);
    expect([...groups.keys()]).toEqual(["default-audio", "dev-1"]);
    expect(groups.get("dev-1")).toHaveLength(2);
  });

  it("bySuffixOrName prefers the key suffix, then a legacy display name", () => {
    const groups = groupByContainer(sensors, P);
    expect(bySuffixOrName(groups.get("dev-1")!, "audio-level")?.value).toBe(0.1);
    const old = groupByContainer(sensors, "plugins.old-meter.").get("dev")!;
    expect(bySuffixOrName(old, "audio-level", "Level")?.text).toBe("1");
    expect(bySuffixOrName(old, "audio-level")).toBeUndefined();
  });
});

describe("live values", () => {
  it("treats plugin placeholders as no value", () => {
    expect(liveText(t(" - "))).toBeUndefined();
    expect(liveText(t(" ok "))).toBe("ok");
    expect(liveText(undefined)).toBeUndefined();
    expect(liveValue({ value: 0, unit: "" })).toBeUndefined();
    expect(liveValue({ value: 3, unit: "" })).toBe(3);
  });
});
