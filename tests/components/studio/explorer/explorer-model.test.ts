import { describe, expect, it } from "vitest";
import { buildDataModel, type DataPoint } from "@/lib/data-points";
import type { UsageIndex } from "@/lib/data-usage";
import type { ApiSources } from "@/lib/catalog";
import type { SensorMap } from "@/modules/types";
import {
  POINT_ROW_H,
  displayValue,
  filterPoints,
  filterSources,
  matchesType,
  rowOffsets,
  windowRange,
  type PointFilter,
} from "@/components/studio/explorer/explorer-model";

const sources: ApiSources = {
  plugins: [
    {
      id: "meter",
      name: "Audio Meter",
      containers: [
        {
          id: "main",
          name: "Main",
          entries: [
            { id: "l", name: "Level", type: "sensor", key: "plugins.meter.main.level" },
            { id: "n", name: "Device", type: "text", key: "plugins.meter.main.device" },
          ],
        },
        { id: "aux", name: "Aux", entries: [{ id: "l", name: "Level", type: "sensor", key: "plugins.meter.aux.level" }] },
      ],
    },
  ],
};
const sensors: SensorMap = {
  "plugins.meter.main.level": { value: 42, unit: "%" },
  "plugins.meter.main.device": { text: "Speakers", unit: "" },
  "plugins.meter.aux.level": { value: 0, unit: "%" },
  "system.bridge.status": { text: "running", unit: "" },
  "system.empty": { text: "", unit: "" },
};
const model = buildDataModel(sources, sensors);
const noUsage: UsageIndex = { byKey: new Map(), byZone: new Map() };
const base: PointFilter = {
  scope: { kind: "all" },
  query: "",
  type: "all",
  hideEmpty: false,
  inUse: false,
  usage: noUsage,
};
const keys = (points: DataPoint[]) => points.map((p) => p.key);

describe("filterPoints", () => {
  it("keeps everything by default", () => {
    expect(filterPoints(model.points, base)).toHaveLength(model.points.length);
  });

  it("narrows by source and container scope", () => {
    const source = filterPoints(model.points, { ...base, scope: { kind: "source", id: "meter" } });
    expect(source).toHaveLength(3);
    const container = filterPoints(model.points, {
      ...base,
      scope: { kind: "container", id: "meter/aux", sourceId: "meter" },
    });
    expect(keys(container)).toEqual(["plugins.meter.aux.level"]);
  });

  it("filters by type", () => {
    expect(keys(filterPoints(model.points, { ...base, type: "number" }))).toContain("plugins.meter.main.level");
    const text = filterPoints(model.points, { ...base, type: "text" });
    expect(text.every((p) => matchesType(p, "text"))).toBe(true);
    expect(keys(text)).toContain("plugins.meter.main.device");
    expect(filterPoints(model.points, { ...base, type: "list" })).toHaveLength(0);
  });

  it("keeps only points in use", () => {
    const usage: UsageIndex = {
      byKey: new Map([["plugins.meter.main.level", [{ zoneId: "z", label: "Meter" }]]]),
      byZone: new Map(),
    };
    expect(keys(filterPoints(model.points, { ...base, inUse: true, usage }))).toEqual(["plugins.meter.main.level"]);
  });

});

describe("filterSources", () => {
  it("filters by health", () => {
    const warn = filterSources(model.sources, "", "warn");
    expect(warn.every((s) => s.status === "warn")).toBe(true);
  });

});

describe("virtual window", () => {

  it("windows a long list with overscan and clamps at the ends", () => {
    const many = Array.from({ length: 1000 }, (): { kind: "point"; point: DataPoint } => ({
      kind: "point",
      point: model.points[0],
    }));
    const long = rowOffsets(many);
    const mid = windowRange(long, POINT_ROW_H * 500, POINT_ROW_H * 10, 5);
    expect(mid).toEqual({ start: 495, end: 516 });
    expect(windowRange(long, 0, POINT_ROW_H * 10, 5).start).toBe(0);
    expect(windowRange(long, POINT_ROW_H * 1000, POINT_ROW_H * 10, 5).end).toBe(1000);
    expect(windowRange([0], 0, 100)).toEqual({ start: 0, end: 0 });
  });

});

describe("displayValue and streamPrefix", () => {
  const point = model.byKey.get("plugins.meter.main.level")!;

  it("prefers the live reading over the snapshot", () => {
    expect(displayValue(point, { [point.key]: { value: 55, unit: "%" } })).toBe("55 %");
    expect(displayValue(point, {})).toBe(point.raw);
  });

});
