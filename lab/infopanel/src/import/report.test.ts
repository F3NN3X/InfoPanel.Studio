import { describe, expect, it } from "vitest";
import { assetFile, tableOf } from "../assets/assets.ts";
import { DEFAULT_GAUGE } from "../gauges/vector.ts";
import { parseDisplayItemsXml } from "../parse.ts";
import { groupBindings } from "../remap/remap.ts";
import type { DisplayItem } from "../schema.ts";
import { buildReport, dataApiInfo } from "./report.ts";

const items = parseDisplayItemsXml(
  `<ArrayOfDisplayItem xmlns:xsi="x">
    <DisplayItem xsi:type="TextDisplayItem"><Rotation>90</Rotation></DisplayItem>
    <DisplayItem xsi:type="TextDisplayItem"><Rotation>45</Rotation></DisplayItem>
    <DisplayItem xsi:type="GroupDisplayItem"><DisplayItems>
      <DisplayItem xsi:type="SensorDisplayItem"><SensorName>A</SensorName><SensorType>Plugin</SensorType><PluginSensorId>a</PluginSensorId></DisplayItem>
      <DisplayItem xsi:type="SensorDisplayItem"><SensorName>B</SensorName><SensorType>Plugin</SensorType><PluginSensorId>b</PluginSensorId></DisplayItem>
    </DisplayItems></DisplayItem>
    <DisplayItem xsi:type="ImageDisplayItem"><FilePath>gone.png</FilePath><RelativePath>true</RelativePath></DisplayItem>
    <DisplayItem xsi:type="ImageDisplayItem"><FilePath>C:\\x.png</FilePath></DisplayItem>
    <DisplayItem xsi:type="GaugeDisplayItem"></DisplayItem>
  </ArrayOfDisplayItem>`,
).items;

describe("buildReport", () => {
  it("sums up items, native mode, sensors, assets, fonts and gauges", async () => {
    const withVector = items.map((it) => (it.kind === "Gauge" ? ({ ...it, vector: DEFAULT_GAUGE } as unknown as DisplayItem) : it));
    const groups = groupBindings(withVector);
    const spare = await assetFile("spare.png", new Uint8Array([1]), "export");
    const r = buildReport({
      doc: { items: withVector, assets: tableOf([spare]) },
      issues: [{ code: "unknown-field", path: "0", kind: "Text", field: "X2" }],
      groups,
      resolved: new Map([[groups[0].id, { key: "plugin.a", via: "plugin-key" }], [groups[1].id, null]]),
      overrides: new Map(),
      fontRows: [],
      convertCtx: { fontScale: 1, keyOf: () => null, assetUrl: () => null },
      dataApi: null,
    });
    expect(r.items).toEqual({ total: 8, byKind: { Text: 2, Group: 1, Sensor: 2, Image: 2, Gauge: 1 } });
    // The two images have no URL (one missing, one an absolute path); the rest convert.
    expect(r.native.stays.reduce((n, s) => n + s.count, 0)).toBe(2);
    expect(r.native.possible).toBe(5); // two rotated texts, two sensors and the vector gauge
    expect(r.native.needs).toEqual([{ need: "rotated panel items", count: 2 }, { need: "custom gauge widget", count: 1 }]);
    // The gauge reads a sensor too (unresolved here).
    expect(r.sensors).toEqual({ groups: 3, items: 3, byStatus: { exact: 1, unresolved: 2 }, attention: 2 });
    expect(r.assets).toMatchObject({ files: 1, bytes: 1, unused: 1, missing: ["gone.png"], absolute: ["C:\\x.png"] });
    expect(r.gauges).toEqual({ total: 1, vector: 1, withoutFrames: 1 });
    expect(r.issues).toEqual({ "unknown-field": 1 });
  });

  it("reads what the Data API offers", () => {
    expect(dataApiInfo("u", { a: { ref: "libre:/x" }, b: { table: { columns: [], rows: [] } } }, "u")).toEqual({ url: "u", ref: true, tables: true, fonts: true });
    expect(dataApiInfo("u", { a: {} }, null)).toEqual({ url: "u", ref: false, tables: false, fonts: false });
  });
});
