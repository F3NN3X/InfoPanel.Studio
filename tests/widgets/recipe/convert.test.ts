import { describe, expect, it } from "vitest";
import { CONVERT_UNITS, convertValue, familyOf, readingUnit, tableUnit, UNIT_TABLE, unitsLike } from "@/widgets/recipe/convert";
import recipeSchema from "@/widgets/recipe/recipe.schema.json";

// "Show in" (G23, owner Q4): the fixed table of units a Value or a Ring converts its reading to, each row and its boundaries.

describe("the unit table", () => {
  it("is the schema's list, unit for unit", () => {
    expect((recipeSchema as unknown as { $defs: { convert: { enum: string[] } } }).$defs.convert.enum).toEqual(CONVERT_UNITS);
  });

  it("frequency: Hz, kHz, MHz, GHz by thousands (the CPU card's clock in GHz)", () => {
    expect(convertValue(5120, "MHz", "GHz")).toBeCloseTo(5.12, 10);
    expect(convertValue(1, "GHz", "Hz")).toBe(1e9);
    expect(convertValue(1500, "kHz", "MHz")).toBe(1.5);
    expect(convertValue(0, "MHz", "GHz")).toBe(0);
  });

  it("size: B to TB by 1024, as the app's memory and drive widgets show them", () => {
    expect(convertValue(1024, "MB", "GB")).toBe(1);
    expect(convertValue(1, "TB", "GB")).toBe(1024);
    expect(convertValue(1024 ** 3, "B", "GB")).toBe(1);
    expect(convertValue(512, "KB", "MB")).toBe(0.5);
  });

  it("rate: B/s to GB/s by 1000, as fmtRate shows them", () => {
    expect(convertValue(2500, "KB/s", "MB/s")).toBe(2.5);
    expect(convertValue(920_111, "B/s", "MB/s")).toBeCloseTo(0.920111, 10);
    expect(convertValue(1, "GB/s", "KB/s")).toBe(1e6);
  });

  it("power: W and kW", () => {
    expect(convertValue(1500, "W", "kW")).toBe(1.5);
    expect(convertValue(0.25, "kW", "W")).toBe(250);
  });

  it("temperature: °C and °F both ways, the freezing and boiling points and -40, where the two meet", () => {
    expect(convertValue(0, "°C", "°F")).toBe(32);
    expect(convertValue(100, "°C", "°F")).toBe(212);
    expect(convertValue(-40, "°C", "°F")).toBe(-40);
    expect(convertValue(212, "°F", "°C")).toBe(100);
    expect(convertValue(67.5, "°C", "°C")).toBe(67.5);
  });

  it("the same unit is the same number; another family, or a unit the table has not got, is no conversion", () => {
    for (const [family, units] of Object.entries(UNIT_TABLE)) for (const u of Object.keys(units)) expect(convertValue(7, u, u as never), `${family} ${u}`).toBe(7);
    expect(convertValue(5120, "MHz", "GB")).toBeUndefined();
    expect(convertValue(64, "%", "GHz")).toBeUndefined();
    expect(convertValue(64, "", "GHz")).toBeUndefined();
    // bits are not bytes: Mb/s is not in the table
    expect(convertValue(100, "Mb/s", "MB/s")).toBeUndefined();
  });

  it("reads the units sources write: kB, kB/s, KHz, ℃ and ℉; case otherwise counts (MB is not Mb)", () => {
    expect(tableUnit("kB")).toBe("KB");
    expect(tableUnit(" kB/s ")).toBe("KB/s");
    expect(tableUnit("KHz")).toBe("kHz");
    expect(tableUnit("℃")).toBe("°C");
    expect(convertValue(50, "℉", "°C")).toBe(10);
    expect(tableUnit("Mb")).toBeUndefined();
    expect(tableUnit("mhz")).toBeUndefined();
  });

  it("lists a reading's family to pick from, and none for a unit outside the table", () => {
    expect(familyOf("MHz")).toBe("frequency");
    expect(unitsLike("MHz")).toEqual(["Hz", "kHz", "MHz", "GHz"]);
    expect(unitsLike("GB")).toEqual(["B", "KB", "MB", "GB", "TB"]);
    expect(unitsLike("°C")).toEqual(["°C", "°F"]);
    expect(unitsLike("%")).toEqual([]);
    expect(unitsLike("")).toEqual([]);
  });
});

describe("a reading's unit", () => {
  it("is what follows its number", () => {
    expect(readingUnit("libre.cpu_cores__average", "5120 MHz")).toBe("MHz");
    expect(readingUnit("libre.cpu_total", "-3.5 °C")).toBe("°C");
    expect(readingUnit(undefined, "12")).toBe("");
  });

  // B20: the source labels the throughput keys KB/s, but they carry bytes per second (core/data.ts fmtRate)
  it("is bytes per second for the Data API's throughput keys, whatever the label says (B20)", () => {
    for (const k of ["download_speed", "upload_speed", "read_rate", "write_rate"]) expect(readingUnit(`libre.ethernet_${k}`, "920111.6875 KB/s"), k).toBe("B/s");
    expect(readingUnit("plugins.net.download_speed", "3 KB/s")).toBe("KB/s");
  });
});
