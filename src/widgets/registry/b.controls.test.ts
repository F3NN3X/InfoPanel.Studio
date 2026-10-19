import { describe, expect, it } from "vitest";
import { renderModule } from "@/widgets/test-render";
import type { SensorMap } from "@/modules/types";
import { fixtureSensors } from "../__fixtures__";
import { DEFAULT_GAUGE_SPEC, parseGaugeSetting } from "../CustomGauge";
import { autoDecimals } from "../SensorGroup";
import { GROUP_A } from "./a";
import { GROUP_B } from "./b";

const mod = (id: string) => GROUP_B.find((m) => m.id === id)!;
const drive = (usedPct: number): SensorMap => {
  const text = (s: string, t: string) => [`plugins.drive-info-plugin.c.${s}`, { text: t }] as const;
  const value = (s: string, v: number) => [`plugins.drive-info-plugin.c.${s}`, { value: v }] as const;
  return Object.fromEntries([text("name", "C:"), text("volume_label", "System"), text("type", "Fixed"), text("format", "NTFS"), value("total_size", 100), value("used_space", usedPct), value("available_space", 100 - usedPct)]);
};

// React inserts a comment between adjacent text nodes
const critical = /1(<!-- -->)? critical/;

describe("DriveSpace thresholds", () => {
  it("uses the theme's Fullness critical (95) for the pill until the widget sets its own", () => {
    expect(renderModule(mod("DriveSpace"), {}, drive(94))).not.toMatch(critical);
    expect(renderModule(mod("DriveSpace"), {}, drive(96))).toMatch(critical);
  });
  it("reads its own level, and Off never trips", () => {
    expect(renderModule(mod("DriveSpace"), { "crit.full": 90 }, drive(91))).toMatch(critical);
    expect(renderModule(mod("DriveSpace"), { "crit.full": "off" }, drive(99))).not.toMatch(critical);
  });
});

// A server render has no height, so a list shows its first item: one sensor per case.
describe("SensorGroup", () => {
  const one = (key: string, value: number, unit: string, s: object = {}) => renderModule(mod("SensorGroup"), { sensors: key, groupLayout: "rows", ...s }, { [key]: { value, unit } });

  it("picks decimals from the size of the reading", () => {
    expect([0, 0.85, 4.5, 62, NaN].map(autoDecimals)).toEqual([0, 2, 1, 0, 0]);
    expect(one("x.volt", 0.85, "V")).toContain("0.85");
  });
  it("draws a bar for a percentage without a maximum, none for a bare unit", () => {
    expect(one("x.load", 62, "%")).toContain("width:62%");
    expect(one("x.rpm", 1200, "RPM")).not.toContain("width:");
  });
  it("reads a stored text maximum, and 0 or blank as automatic", () => {
    expect(one("x.rpm", 600, "RPM", { groupMax: "1200" })).toContain("width:50%");
    expect(one("x.load", 62, "%", { groupMax: "0" })).toContain("width:62%");
    expect(one("x.load", 62, "%", { groupMax: "" })).toContain("width:62%");
  });
  it("lists this machine's readings, not a fixed set of hardware, when empty", () => {
    const out = renderModule(mod("SensorGroup"), {}, fixtureSensors());
    expect(out).toContain("CPU");
    expect(out).not.toContain("NVMe temp");
  });
});

describe("SensorValue", () => {
  it("parses stored text for decimals and the range, and 0 or blank as automatic", () => {
    const sensors: SensorMap = { "x.t": { value: 61.234, unit: "°C" } };
    expect(renderModule(mod("SensorValue"), { sensor: "x.t", decimals: "2" }, sensors)).toContain("61.23");
    expect(renderModule(mod("SensorValue"), { sensor: "x.t", decimals: "", max: "", warn: "0", crit: "0" }, sensors)).toContain("61");
  });
});

describe("CustomGauge", () => {
  const spec = { ...DEFAULT_GAUGE_SPEC, scale: { min: 0, max: 200, unit: "W", decimals: 0 } };
  it("reads the gauge setting as JSON, and falls back to the default spec for blank or bad JSON", () => {
    const toProps = (gauge: unknown) => {
      const m = mod("CustomGauge") as unknown as { settings: { key: string; default: unknown }[] };
      expect(m.settings.find((d) => d.key === "gauge")?.default).toBe(JSON.stringify(DEFAULT_GAUGE_SPEC));
      return parseGaugeSetting(gauge);
    };
    expect(toProps(JSON.stringify(spec)).scale).toMatchObject({ max: 200, unit: "W" });
    expect(toProps("{not json")).toEqual(DEFAULT_GAUGE_SPEC);
    expect(toProps("")).toEqual(DEFAULT_GAUGE_SPEC);
    expect(toProps(undefined)).toEqual(DEFAULT_GAUGE_SPEC);
  });
  it("draws the bound value on the spec's scale, and 0 for no value", () => {
    const sensors: SensorMap = { "x.w": { value: 100, unit: "W" } };
    const bound = renderModule(mod("CustomGauge"), { sensor: "x.w", gauge: JSON.stringify(spec) }, sensors);
    const unbound = renderModule(mod("CustomGauge"), { gauge: JSON.stringify(spec) }, sensors);
    expect(bound).toContain("<svg");
    expect(unbound).toContain("<svg");
    expect(bound).not.toBe(unbound);
  });
});

describe("StorageHealth", () => {
  it("shows a drive of any vendor", () => {
    const sensors: SensorMap = { "libre.acme_x100_power_on_hours": { value: 12, unit: "" }, "libre.acme_x100_life": { value: 97, unit: "%" }, "libre.acme_x100_total_space": { value: 1000, unit: "GB" } };
    expect(renderModule(mod("StorageHealth"), {}, sensors)).toContain("97");
  });
});

describe("DiskIO", () => {
  it("pins one disk, and lists from the first while unset", () => {
    const disk = (id: string, name: string): SensorMap => ({ [`libre.${id}_power_on_hours`]: { value: 1, unit: "" }, [`libre.${id}_read_rate`]: { value: 1, unit: "KB/s" }, [`libre.${id}_write_rate`]: { value: 1, unit: "KB/s" }, [`libre.${id}_total_activity`]: { value: name.length, unit: "%" } });
    const sensors = { ...disk("alpha_1", "a"), ...disk("bravo_2", "b") };
    expect(renderModule(mod("DiskIO"), {}, sensors)).toContain("Alpha");
    const pinned = renderModule(mod("DiskIO"), { device: "bravo_2" }, sensors);
    expect(pinned).toContain("Bravo");
    expect(pinned).not.toContain("Alpha");
  });
});

describe("KpiTiles", () => {
  it("does not show a fixed CPU or GPU name", () => {
    const sensors: SensorMap = { "libre.cpu_x_cpu_total": { value: 10, unit: "%" }, "libre.gpu_y_gpu_core_load": { value: 5, unit: "%" } };
    const out = renderModule(GROUP_A.find((m) => m.id === "KpiTiles")!, {}, sensors);
    expect(out).not.toContain("9950X3D");
    expect(out).not.toContain("RTX 5090");
  });
});
