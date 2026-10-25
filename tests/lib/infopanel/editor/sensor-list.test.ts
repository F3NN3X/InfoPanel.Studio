import { describe, expect, it } from "vitest";
import { buildDataModel } from "@/lib/data-points";
import { chosenOf, flatPoints, isNative, pickerSections } from "@/lib/infopanel/editor/sensor-list";
import type { DataApiValue } from "@/lib/infopanel/sensors";

const sensors: Record<string, DataApiValue> = {
  "libre.cpu.load": { value: 12, unit: "%", name: "CPU Total", ref: "libre:/amdcpu/0/load/0", source: "infopanel" },
  "plugins.clock-plugin.clock.second": { value: 43, unit: "", name: "Clock · Second", ref: "plugin:/clock-plugin/clock/second", source: "infopanel" },
  "plugins.demo.fps": { value: 60, unit: "fps", name: "FPS" },
  "plugins.demo.table": { text: "a", name: "Table", ref: "plugin:/demo/table", table: { format: "{0}" } } as DataApiValue,
};
const sources = {
  plugins: [
    { id: "clock-plugin", name: "Clock", containers: [{ id: "clock", name: "Clock", entries: [{ id: "second", name: "Second", type: "sensor", key: "plugins.clock-plugin.clock.second" }] }] },
    {
      id: "demo",
      name: "Demo",
      containers: [
        {
          id: "c",
          name: "C",
          entries: [
            { id: "fps", name: "FPS", type: "sensor", key: "plugins.demo.fps" },
            { id: "table", name: "Table", type: "table", key: "plugins.demo.table" },
          ],
        },
      ],
    },
  ],
};
const points = buildDataModel(sources, sensors as never).points;

describe("the sensor list model behind every sensor dropdown", () => {
  it.each([
    ["everything", "", false, ["libre.cpu.load", "plugins.clock-plugin.clock.second", "plugins.demo.fps", "plugins.demo.table"]],
    ["plugin sensors only (tables, web images)", "", true, ["plugins.clock-plugin.clock.second", "plugins.demo.fps", "plugins.demo.table"]],
    ["the query narrows it", "second", false, ["plugins.clock-plugin.clock.second"]],
    ["the query and plugin-only together", "cpu", true, []],
  ])("%s", (_name, query, pluginOnly, keys) => {
    expect(flatPoints(pickerSections(points, sensors, query, pluginOnly)).map((p) => p.key).sort()).toEqual([...keys].sort());
  });

  it("tells a native sensor from a preview-only one, and chooses a point with its ref, unit and table format", () => {
    expect(isNative("libre.cpu.load", sensors)).toBe(true);
    expect(isNative("plugins.demo.fps", sensors)).toBe(false);
    const byKey = new Map(points.map((p) => [p.key, p]));
    expect(chosenOf(byKey.get("libre.cpu.load")!, sensors)).toEqual({ key: "libre.cpu.load", name: "CPU Total", unit: "%", ref: "libre:/amdcpu/0/load/0" });
    expect(chosenOf(byKey.get("plugins.demo.table")!, sensors)).toMatchObject({ ref: "plugin:/demo/table", format: "{0}" });
    expect(chosenOf(byKey.get("plugins.demo.fps")!, sensors)).not.toHaveProperty("ref");
  });
});
