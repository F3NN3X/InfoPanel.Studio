import { describe, expect, it } from "vitest";
import {
  alignCodeOf,
  alignOf,
  clockOf,
  compactOf,
  decimalsOf,
  deviceOf,
  devicesOf,
  hour12Of,
  inUnit,
  sizeTierOf,
  tempUnitOf,
  thresholdsOf,
  toCelsius,
} from "@/modules/setting-readers";

describe("compactOf", () => {
  it("prefers compact off Auto, else reads the old variant / compactView", () => {
    expect(compactOf({ compact: "card", variant: "studio" })).toBe("card");
    expect(compactOf({ compact: "auto", variant: "studio" })).toBe("dense");
    expect(compactOf({ compactView: "on" })).toBe("card");
    expect(compactOf({ compactView: "off" })).toBe("full");
    expect(compactOf({})).toBe("auto");
  });
});

describe("sizeTierOf", () => {
  it("reads sizeTier, else the old layout; Auto = undefined", () => {
    expect(sizeTierOf({ sizeTier: "sm" })).toBe("sm");
    expect(sizeTierOf({ sizeTier: "auto", layout: "card" })).toBe("lg");
    expect(sizeTierOf({ sizeTier: "auto" })).toBeUndefined();
  });
});

describe("alignOf / alignCodeOf", () => {
  it("reads the 9-cell code and the spread", () => {
    expect(alignOf({ align: "tr" })).toEqual({ alignX: "end", alignY: "start" });
    expect(alignOf({ align: "bc", alignSpread: true })).toEqual({ alignX: "between", alignY: "end" });
    expect(alignOf({ align: "auto", alignSpread: false })).toEqual({ alignX: "auto", alignY: "auto" });
  });

  it("falls back to the old axes while align is Auto", () => {
    expect(alignOf({ align: "auto", alignSpread: false, alignX: "start", alignY: "end" })).toEqual({ alignX: "start", alignY: "end" });
  });

  it("codes two axes; between picks no column, neither = auto", () => {
    expect(alignCodeOf("end", "start")).toBe("tr");
    expect(alignCodeOf("between", "end")).toBe("bc");
    expect(alignCodeOf(undefined, undefined)).toBe("auto");
  });
});

describe("thresholdsOf", () => {
  it("reads warn.<q> / crit.<q>, off = Infinity, else the old keys", () => {
    expect(thresholdsOf({ "warn.load": 70, "crit.load": "off" }, "load")).toEqual({ warn: 70, crit: Number.POSITIVE_INFINITY });
    expect(thresholdsOf({ warnDb: -12, clipDb: -3 }, "db", ["warnDb", "clipDb"])).toEqual({ warn: -12, crit: -3 });
    expect(thresholdsOf({}, "temp")).toEqual({});
  });
});

describe("devices", () => {
  it("deviceOf: Auto / blank = undefined, else the old key", () => {
    expect(deviceOf({ device: "auto" })).toBeUndefined();
    expect(deviceOf({ device: "", cpu: "x" }, "cpu")).toBe("x");
    expect(deviceOf({ device: "y", cpu: "x" }, "cpu")).toBe("y");
  });

  it("devicesOf splits the list; none = all (undefined)", () => {
    expect(devicesOf({ devices: "a, b,," })).toEqual(["a", "b"]);
    expect(devicesOf({ devices: "", channels: "c" }, "channels")).toEqual(["c"]);
    expect(devicesOf({})).toBeUndefined();
  });
});

describe("units and format", () => {
  it("tempUnitOf reads tempUnit, else the old units", () => {
    expect(tempUnitOf({ tempUnit: "f" })).toBe("f");
    expect(tempUnitOf({ units: "F" })).toBe("f");
    expect(tempUnitOf({})).toBe("c");
  });

  it("converts °C both ways", () => {
    expect(inUnit(100, "f")).toBe(212);
    expect(toCelsius(212, "f")).toBe(100);
    expect(inUnit(40, "c")).toBe(40);
  });

  it("decimalsOf: 0–4, auto / blank = undefined, else the old key", () => {
    expect(decimalsOf({ decimals: "2" })).toBe(2);
    expect(decimalsOf({ decimals: "auto", groupDecimals: "3" }, "groupDecimals")).toBe(3);
    expect(decimalsOf({ decimals: "9" })).toBeUndefined();
  });

  it("clockOf / hour12Of", () => {
    expect(clockOf({ clock: "12" })).toBe("12");
    expect(clockOf({ format: "24h" })).toBe("24");
    expect(clockOf({})).toBe("auto");
    expect(hour12Of("12")).toBe(true);
    expect(hour12Of("24")).toBe(false);
    expect(hour12Of("auto")).toBeUndefined();
  });
});
