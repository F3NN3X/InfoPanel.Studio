import { describe, expect, it } from "vitest";
import { specFile } from "@/lib/infopanel/gauges/spec-file";
import { DEFAULT_GAUGE } from "@/lib/infopanel/gauges/vector";
import { exportFileName, importGauge } from "@/lib/gauge-studio/import-file";

describe("importing a gauge file", () => {
  it("reads a .gauge.json spec, with its name", () => {
    const got = importGauge("ring.gauge.json", specFile("My ring", DEFAULT_GAUGE));
    expect(got).toMatchObject({ name: "My ring", removed: [] });
    expect(got.gauge).toEqual(DEFAULT_GAUGE);
  });

  it("names a spec without a name after its file", () => {
    expect(importGauge("fast-dial.gauge.json", specFile("Gauge", DEFAULT_GAUGE)).name).toBe("fast-dial");
  });

  it("refuses a file that is not a spec, and an SVG over 256 KB", () => {
    expect(() => importGauge("x.gauge.json", "not json")).toThrow("Not a JSON file");
    expect(() => importGauge("x.json", JSON.stringify({ hello: 1 }))).toThrow("Not a gauge spec");
    expect(() => importGauge("big.svg", `<svg>${"a".repeat(256 * 1024)}</svg>`)).toThrow("over 256 KB");
  });
});

describe("export name", () => {
  it("makes a safe .gauge.json file name", () => {
    expect(exportFileName("My ring / v2")).toBe("My-ring-v2.gauge.json");
    expect(exportFileName("???")).toBe("gauge.gauge.json");
  });
});
