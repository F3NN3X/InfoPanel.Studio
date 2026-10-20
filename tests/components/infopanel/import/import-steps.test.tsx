import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { ImportReport } from "@/lib/infopanel/import/report";
import { groupBindings, indexCatalog, resolveAll } from "@/lib/infopanel/remap/remap";
import { parseDisplayItemsXml } from "@/lib/infopanel/parse";
import { buildCatalog } from "@/lib/infopanel/sensors";
import { RemapPanel } from "@/components/infopanel/remap-panel";
import { reviewModel } from "@/components/infopanel/import/import-steps";

const report: ImportReport = {
  items: { total: 10, byKind: { Text: 6, Group: 1, Image: 3 } },
  native: { possible: 7, stays: [{ reason: "rotated", count: 2 }], needs: [{ need: "text glow", count: 3 }] },
  sensors: { groups: 3, items: 5, byStatus: { exact: 1, name: 1, unresolved: 1 }, attention: 2 },
  assets: { files: 4, bytes: 2_500_000, unused: 1, duplicates: 1, missing: ["gone.png"], urls: 0, absolute: [] },
  fonts: { requests: 3, missing: ["Rajdhani"], supplied: 0 },
  gauges: { total: 2, vector: 1, withoutFrames: 1 },
  issues: { "unknown-field": 2 },
  dataApi: null,
};

describe("the Review step's model", () => {
  const { tiles, rows } = reviewModel(report, { unresolved: 1, failed: [{ name: "big.svg", reason: "too large" }], online: false });

  it("sums up the report in tiles, flagging what needs a look", () => {
    expect(tiles.map((t) => [t.label, t.value, t.detail, t.tone])).toEqual([
      ["Items", "10", "3 kinds", undefined],
      ["Native", "7", "2 stay InfoPanel", undefined],
      ["Sensors", "2", "to fix · 1 unresolved", "bad"],
      ["Assets", "2.4 MB", "4 files · 4 findings", "warn"],
      ["Fonts", "3", "1 missing", "warn"],
      ["Gauges", "2", "1 vector", undefined],
    ]);
  });

  it("drills down per row; an unreachable Data API and refused uploads are said plainly", () => {
    expect(rows.map((r) => r.id)).toEqual(["native", "needs", "kinds", "assets", "fonts", "api", "issues"]);
    expect(rows.find((r) => r.id === "api")).toMatchObject({ summary: "Not reachable" });
    expect(rows.find((r) => r.id === "assets")!.rows.at(-1)).toEqual(["big.svg", "Not stored", "too large"]);
    expect(rows.find((r) => r.id === "issues")!.rows).toEqual([["unknown-field", "2", "Kept read-only and exported back"]]);
  });
});

describe("RemapPanel", () => {
  const items = parseDisplayItemsXml(
    '<ArrayOfDisplayItem xmlns:xsi="x"><DisplayItem xsi:type="SensorDisplayItem"><SensorName>FPS</SensorName><SensorType>Plugin</SensorType><PluginSensorId>/fps-plugin/fps/fps</PluginSensorId></DisplayItem>' +
      '<DisplayItem xsi:type="SensorDisplayItem"><SensorName>Gone</SensorName><SensorType>Plugin</SensorType><PluginSensorId>/x/y/z</PluginSensorId></DisplayItem></ArrayOfDisplayItem>',
  ).items;
  const index = indexCatalog(buildCatalog({ "plugins.fps-plugin.fps.fps": { value: 144, unit: "FPS", name: "FPS", ref: "plugin:/fps-plugin/fps/fps" } }));
  const groups = groupBindings(items);

  it("shows each group's state, its key and live value, and the counts", () => {
    const html = renderToString(
      <RemapPanel groups={groups} resolved={resolveAll(groups, index, new Map())} index={index} overrides={new Map()} onOverrides={() => {}} />,
    );
    expect(html).toContain("Matched");
    expect(html).toContain("Unresolved");
    expect(html).toContain("144 FPS");
    expect(html).toContain("2 bindings in 2 groups · 1 done · 0 to check · 1 unresolved");
    expect(html).toContain("Leave unbound");
  });

  it("says when nothing reads a sensor", () => {
    expect(renderToString(<RemapPanel groups={[]} resolved={new Map()} index={index} overrides={new Map()} onOverrides={() => {}} />)).toContain("nothing to remap");
  });
});
