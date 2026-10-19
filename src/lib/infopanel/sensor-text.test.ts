import { describe, expect, it } from "vitest";
import { parseDisplayItemsXml } from "./parse.ts";
import { dateText, sensorColor, sensorText, type SensorReading } from "./sensor-text.ts";
import type { DisplayItem } from "./schema.ts";

function one<K extends DisplayItem["kind"]>(kind: K, fields: Record<string, string | number | boolean> = {}) {
  const xml = Object.entries(fields)
    .map(([k, v]) => `<${k}>${v}</${k}>`)
    .join("");
  const { items } = parseDisplayItemsXml(
    `<ArrayOfDisplayItem xmlns:xsi="x"><DisplayItem xsi:type="${kind}DisplayItem">${xml}</DisplayItem></ArrayOfDisplayItem>`,
  );
  return items[0] as Extract<DisplayItem, { kind: K }>;
}

const reading = (now: number, unit = "", extra: Partial<SensorReading> = {}): SensorReading => ({
  now,
  min: 0,
  max: 0,
  avg: 0,
  unit,
  ...extra,
});

describe("sensorText", () => {
  it('shows "-" without a reading', () => {
    expect(sensorText(one("Sensor"), null)).toBe("-");
  });

  it.each([
    ["°C", 45.5, "46°C"],
    ["GB", 12.25, "12.3GB"],
    ["MB/s", 1.005, "1.01MB/s"],
    ["mbar", 3, "3.00mbar"],
    ["V", 1.2345, "1.235V"],
    ["%", 99.5, "100%"],
  ])("picks decimals from the unit %s", (unit, v, out) => {
    expect(sensorText(one("Sensor"), reading(v, unit))).toBe(out);
  });

  it("overrides precision, flooring for anything but 1-3", () => {
    expect(sensorText(one("Sensor", { OverridePrecision: true, Precision: 2 }), reading(45.375, "W"))).toBe("45.38W");
    expect(sensorText(one("Sensor", { OverridePrecision: true, Precision: 0 }), reading(45.9, "W"))).toBe("45W");
    expect(sensorText(one("Sensor", { OverridePrecision: true, Precision: 5 }), reading(45.9, "W"))).toBe("45W");
  });

  it("applies the modifiers, then AbsoluteAddition", () => {
    expect(sensorText(one("Sensor", { MultiplicationModifier: 0.001, AdditionModifier: 5 }), reading(2000))).toBe("7");
    expect(sensorText(one("Sensor", { DivisionToggle: true, MultiplicationModifier: 4 }), reading(10))).toBe("3");
    expect(sensorText(one("Sensor", { DivisionToggle: true, MultiplicationModifier: 0, AdditionModifier: 1 }), reading(10))).toBe("11");
    expect(sensorText(one("Sensor"), reading(-5))).toBe("5");
    expect(sensorText(one("Sensor", { AbsoluteAddition: false }), reading(-5))).toBe("-5");
  });

  it("reads MIN, MAX and AVERAGE", () => {
    const r = reading(50, "", { min: 10, max: 90, avg: 40 });
    expect(["MIN", "MAX", "AVERAGE"].map((t) => sensorText(one("Sensor", { ValueType: t }), r))).toEqual(["10", "90", "40"]);
  });

  it("shows text readings verbatim, and still groups numeric ones", () => {
    expect(sensorText(one("Sensor"), reading(0, "", { text: "Bohemian Rhapsody" }))).toBe("Bohemian Rhapsody");
    expect(sensorText(one("Sensor", { ShowThousandsSeparator: true }), reading(0, "", { text: "1234" }))).toBe("1,234");
    expect(sensorText(one("Sensor", { ShowThousandsSeparator: true }), reading(0, "", { text: "12:30" }))).toBe("12:30");
  });

  it("groups thousands with the invariant culture, keeping the decimals", () => {
    expect(sensorText(one("Sensor", { ShowThousandsSeparator: true }), reading(12345.64, "GB"))).toBe("12,345.6GB");
    expect(sensorText(one("Sensor", { ShowThousandsSeparator: true }), reading(1234567, "RPM"))).toBe("1,234,567RPM");
  });

  it("adds the unit and the name", () => {
    expect(sensorText(one("Sensor", { ShowUnit: false }), reading(45, "°C"))).toBe("45");
    expect(sensorText(one("Sensor", { OverrideUnit: true, Unit: "°" }), reading(45, "°C"))).toBe("45°");
    expect(sensorText(one("Sensor", { ShowName: true, Name: "CPU" }), reading(45, "°C"))).toBe("CPU 45°C");
  });
});

describe("sensorColor", () => {
  const item = one("Sensor", {
    Color: "#FFFFFFFF",
    Threshold1: 50,
    Threshold1Color: "#FFFFFF00",
    Threshold2: 80,
    Threshold2Color: "#FFFF0000",
  });

  it("switches at >= threshold, the second winning", () => {
    expect([49.9, 50, 79, 80, 120].map((v) => sensorColor(item, reading(v)))).toEqual([
      "#FFFFFFFF",
      "#FFFFFF00",
      "#FFFFFF00",
      "#FFFF0000",
      "#FFFF0000",
    ]);
  });

  it("uses the modified value, and ignores zero thresholds", () => {
    const scaled = one("Sensor", { Threshold1: 50, Threshold1Color: "#FF00FF00", MultiplicationModifier: 10 });
    expect(sensorColor(scaled, reading(5))).toBe("#FF00FF00");
    expect(sensorColor(one("Sensor", { Color: "#FF123456" }), reading(1e9))).toBe("#FF123456");
    expect(sensorColor(item, null)).toBe("#FFFFFFFF");
  });
});

describe("dateText", () => {
  const at = new Date(2026, 9, 16, 15, 45, 52);

  it("formats the clock, uppercased on request", () => {
    expect(dateText(one("Clock"), at)).toBe("03:45:52 PM");
    expect(dateText(one("Clock", { Format: "dddd", Uppercase: true }), at)).toBe("FRIDAY");
  });

  it("formats the calendar from midnight today", () => {
    expect(dateText(one("Calendar", { Format: "dd/MM/yyyy HH:mm" }), at)).toBe("16/10/2026 00:00");
  });

  it("keeps the default format when the file's one is invalid", () => {
    expect(one("Clock", { Format: "'open" }).Format).toBe("hh:mm:ss tt");
  });
});
