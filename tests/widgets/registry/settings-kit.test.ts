import { describe, expect, it } from "vitest";
import {
  boolSetting,
  colorSettings,
  colorsOf,
  deviceSetting,
  devicesSetting,
  formatSetting,
  thresholdSetting,
  enumSetting,
  joinKeys,
  listOf,
  numberOf,
  numberSetting,
  oneOf,
  pass,
  pick,
  sensorSetting,
  splitKeys,
  stringOf,
  toggleKey,
} from "@/widgets/registry/settings-kit";

describe("narrowing", () => {
  it("pass skips unset and empty values, pick keeps an empty string", () => {
    const s = { a: 1, b: "", c: undefined as unknown as string, d: "x" };
    expect(pass<Record<string, unknown>>("a", "b", "c", "d")(s)).toEqual({ a: 1, d: "x" });
    expect(pick<Record<string, unknown>>(["a", "b", "c"])(s)).toEqual({ a: 1, b: "" });
  });

  it("numberOf, oneOf, stringOf and listOf narrow what is stored", () => {
    expect(numberOf("12")).toBe(12);
    expect(numberOf("")).toBeUndefined();
    expect(numberOf("abc")).toBeUndefined();
    expect(oneOf("b", ["a", "b"] as const)).toBe("b");
    expect(oneOf("z", ["a", "b"] as const)).toBeUndefined();
    expect(stringOf("")).toBeUndefined();
    expect(stringOf("x")).toBe("x");
    expect(listOf([1, "a", 2], (x) => (typeof x === "number" ? x : undefined))).toEqual([1, 2]);
    expect(listOf("nope", () => 1)).toBeUndefined();
  });
});

describe("sensor key lists", () => {
  it("splits, joins and toggles in binding order", () => {
    expect(splitKeys("a, b,,c")).toEqual(["a", "b", "c"]);
    expect(splitKeys("")).toEqual([]);
    expect(joinKeys(["a", "b"])).toBe("a,b");
    expect(toggleKey(["a", "b"], "c")).toEqual(["a", "b", "c"]);
    expect(toggleKey(["a", "b", "c"], "b")).toEqual(["a", "c"]);
  });
});

describe("builders", () => {
  it("build the schema entries with their defaults", () => {
    expect(enumSetting("k", "K", "a", [{ value: "a", label: "A" }], { group: "G" })).toMatchObject({ type: "select", default: "a", group: "G" });
    expect(boolSetting("k", "K", true)).toMatchObject({ type: "boolean", default: true });
    expect(numberSetting("k", "K", 3, { min: 1 })).toMatchObject({ type: "number", default: 3, min: 1 });
    expect(sensorSetting("k", "K", { multiple: true })).toMatchObject({ type: "sensor", default: "", multiple: true });
    expect(deviceSetting("CPU", "cpu")).toMatchObject({ key: "device", type: "select", default: "auto", optionsFrom: "cpu" });
    expect(devicesSetting("Channels", "audio")).toMatchObject({ key: "devices", type: "select", default: "", optionsFrom: "audio", multiple: true });
    expect(thresholdSetting("temp")).toMatchObject({ key: "warn.temp", keyY: "crit.temp", type: "thresholds", quantity: "temp", default: 80, defaultY: 90, section: "thresholds" });
    expect(thresholdSetting("value", { default: "off", defaultY: "off" })).toMatchObject({ default: "off", defaultY: "off" });
    expect(formatSetting("tempUnit")).toMatchObject({ key: "tempUnit", default: "c", section: "format" });
    expect(formatSetting("clock", { default: "24" })).toMatchObject({ key: "clock", default: "24", section: "format" });
    expect(formatSetting("rateUnit")).toMatchObject({ key: "rateUnit", default: "auto", section: "format" });
  });

  it("flattens a colour object to one setting per entry and rebuilds it", () => {
    const entries = [
      { entry: "cpu", key: "cpuColor", label: "CPU" },
      { entry: "gpu", key: "gpuColor", label: "GPU" },
    ];
    expect(colorSettings(entries, { group: "Colors" }).map((d) => [d.key, d.type, d.default, d.advanced])).toEqual([
      ["cpuColor", "color", "", true],
      ["gpuColor", "color", "", true],
    ]);
    expect(colorsOf({ cpuColor: " #fff ", gpuColor: "" }, entries)).toEqual({ cpu: "#fff" });
    expect(colorsOf({}, entries)).toBeUndefined();
  });
});
