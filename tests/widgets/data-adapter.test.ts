import { describe, expect, it } from "vitest";
import type { SensorMap } from "@/modules/types";
import { get, hw, num } from "@/widgets/core/data";
import snapshot from "@/widgets/__fixtures__/snapshot.json";
import { neverReported, toFlat, toNames, widgetImage } from "@/widgets/data-adapter";

describe("toFlat", () => {
  it("joins a value and its unit with a space", () => {
    expect(toFlat({ a: { value: 62.5, unit: "%" } }).a).toBe("62.5 %");
  });

  it("gives the number alone for an empty unit", () => {
    expect(toFlat({ a: { value: 3, unit: "" } }).a).toBe("3");
  });

  it("prefers non-empty text over the value", () => {
    const flat = toFlat({ a: { value: 1, text: "Hi", unit: "x" }, b: { value: 7, text: "", unit: "W" } });
    expect(flat.a).toBe("Hi");
    expect(flat.b).toBe("7 W");
  });

  it("leaves out NaN and valueless keys", () => {
    const flat = toFlat({ a: { value: NaN, unit: "%" }, b: { unit: "" }, c: { text: "", unit: "" } });
    expect(flat).toEqual({});
    expect(get(flat, "a", "fb")).toBe("fb");
    expect(num(flat.a)).toBeNaN();
  });

  it("is memoised per map identity", () => {
    const map: SensorMap = { a: { value: 1, unit: "" } };
    expect(toFlat(map)).toBe(toFlat(map));
    expect(toFlat({ ...map })).not.toBe(toFlat(map));
  });

  it("flattens a real snapshot the core can read", () => {
    const flat = toFlat(snapshot.sensors as SensorMap);
    const found = hw(flat);
    expect(found.cpu).toBeTruthy();
    expect(found.gpu).toBeTruthy();
    expect(found.disks.length).toBeGreaterThanOrEqual(1);
    expect(found.adapters.length).toBeGreaterThanOrEqual(1);
    expect(Number.isFinite(num(get(flat, "system.cpu.load")))).toBe(true);
  });
});

describe("widgetImage", () => {
  it("passes through remote URLs and drops empty values", () => {
    expect(widgetImage("https://example.com/a.png")).toBe("https://example.com/a.png");
    expect(widgetImage("")).toBeUndefined();
    expect(widgetImage(undefined)).toBeUndefined();
  });

  it("resolves Data API image paths against the API", () => {
    expect(widgetImage("/api/images/p/i")).toMatch(/\/api\/images\/p\/i$/);
  });
});

describe("toNames", () => {
  it("collects the display names by key, trimmed, leaving blanks out", () => {
    const map: SensorMap = { a: { value: 1, unit: "", name: " CPU Package " }, b: { value: 2, unit: "", name: "  " }, c: { value: 3, unit: "" } };
    expect(toNames(map)).toEqual({ a: "CPU Package" });
  });

  it("is memoised per map identity", () => {
    const map: SensorMap = { a: { value: 1, unit: "", name: "A" } };
    expect(toNames(map)).toBe(toNames(map));
    expect(toNames({ ...map })).not.toBe(toNames(map));
  });
});

describe("a reading that has never reported", () => {
  const dead = { value: 0, unit: "W", min: 0, max: 0 };

  it("is left out, so widgets show – instead of 0", () => {
    const flat = toFlat({ "libre.cpu_package": dead, "libre.cpu_tctl": { value: 0, unit: "°C", min: 0, max: 0 } });
    expect(flat).toEqual({});
    expect(neverReported("libre.cpu_package", dead)).toBe(true);
  });

  it("keeps a 0 that has read something, and a 0 in units where 0 is real", () => {
    const flat = toFlat({
      "libre.cpu_package": { value: 0, unit: "W", min: 0, max: 45 },
      "libre.fan": { value: 0, unit: "RPM", min: 0, max: 0 },
      "libre.load": { value: 0, unit: "%", min: 0, max: 0 },
      "libre.no_range": { value: 0, unit: "W" },
      "plugins.weather.temp": { value: 0, unit: "°C", min: 0, max: 0 },
    });
    expect(Object.keys(flat).sort()).toEqual(["libre.cpu_package", "libre.fan", "libre.load", "libre.no_range", "plugins.weather.temp"]);
  });
});
