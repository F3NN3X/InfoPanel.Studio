import { describe, expect, it } from "vitest";
import { assetFile, tableOf, type Doc } from "@/lib/infopanel/assets/assets.ts";
import { itemAt } from "@/lib/infopanel/editor/ops.ts";
import { parseDisplayItemsXml } from "@/lib/infopanel/parse.ts";
import type { GaugeItem } from "@/lib/infopanel/schema.ts";
import {
  bakeSignature, duplicateOrder, frameNames, gaugePaths, insertFramesGauge, insertVectorGauge, isStale, moveOrder, removeOrder,
  reorderFrames, resampleOrder, reverseOrder, safeStem, setFrameFile, setFrameFiles, setVector, vectorOf,
} from "@/lib/infopanel/gauges/frames.ts";
import { DEFAULT_GAUGE } from "@/lib/infopanel/gauges/vector.ts";

const frameXml = (n: string) => `<ImageDisplayItem><Name>${n}</Name><FilePath>${n}</FilePath><RelativePath>true</RelativePath><Scale>80</Scale></ImageDisplayItem>`;
const items = parseDisplayItemsXml(
  `<ArrayOfDisplayItem xmlns:xsi="x"><DisplayItem xsi:type="GroupDisplayItem"><DisplayItems><DisplayItem xsi:type="GaugeDisplayItem"><Name>Fan</Name><Images>${["a.png", "B.png", "c.png"].map(frameXml).join("")}</Images></DisplayItem></DisplayItems></DisplayItem></ArrayOfDisplayItem>`,
).items;
const gauge = (d: Doc | typeof items, path = "0.0") => itemAt(Array.isArray(d) ? d : d.items, path) as GaugeItem;
const png = (seed: number) => new Uint8Array([0x89, 0x50, 0x4e, 0x47, 13, 10, 26, 10, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52, 0, 0, 0, 1, 0, 0, 0, 1, seed]);

describe("frame order", () => {
  it("reverses, moves, removes, duplicates and resamples", () => {
    expect(reverseOrder(3)).toEqual([2, 1, 0]);
    expect([moveOrder(3, 0, 1), moveOrder(3, 0, -1)]).toEqual([[1, 0, 2], [0, 1, 2]]);
    expect(removeOrder(3, 1)).toEqual([0, 2]);
    expect(duplicateOrder(3, 1)).toEqual([0, 1, 1, 2]);
    expect(resampleOrder(87, 5)).toEqual([0, 22, 43, 65, 86]);
    expect(resampleOrder(3, 5)).toEqual([0, 1, 1, 2, 2]);
    expect([resampleOrder(0, 3), resampleOrder(4, 1)]).toEqual([[], [0]]);
  });

  it("applies an order to the gauge inside its group", () => {
    expect(frameNames(gauge(reorderFrames(items, "0.0", [2, 0, 9])))).toEqual(["c.png", "a.png"]);
    expect(gaugePaths(items)).toEqual(["0.0"]);
  });
});

describe("frame files", () => {
  it("sets all frames from files as one change, keeping each slot's fields", async () => {
    const doc: Doc = { items, assets: new Map() };
    const files = await Promise.all([0, 1].map((i) => assetFile(`Fan_${i}.png`, png(i), "added")));
    const next = setFrameFiles(doc, "0.0", files, "sig");
    expect(frameNames(gauge(next))).toEqual(["fan_0.png", "fan_1.png"]);
    expect(gauge(next).Images[1]).toMatchObject({ Scale: 80, RelativePath: true, Type: "FILE" });
    expect((gauge(next) as GaugeItem & { vectorBaked?: string }).vectorBaked).toBe("sig");
    expect([...next.assets.keys()]).toEqual(["fan_0.png", "fan_1.png"]);
  });

  it("replaces one frame, reusing stored identical bytes", async () => {
    const stored = await assetFile("B.png", png(7), "export");
    const doc: Doc = { items, assets: tableOf([stored]) };
    const next = setFrameFile(doc, "0.0", 0, await assetFile("copy.png", png(7), "added"));
    expect(frameNames(gauge(next))).toEqual(["b.png", "b.png", "c.png"]);
    expect(next.assets.size).toBe(1);
  });

  it("inserts a frames gauge at the end", async () => {
    const r = insertFramesGauge({ items, assets: new Map() }, [await assetFile("x.png", png(1), "added")], "Lib", { MaxValue: 3000 });
    expect(r.path).toBe("1");
    expect(gauge(r.doc, "1")).toMatchObject({ Name: "Lib", MaxValue: 3000, Scale: 100 });
    expect(frameNames(gauge(r.doc, "1"))).toEqual(["x.png"]);
  });
});

describe("vector gauges", () => {
  it("keeps the spec on the item and knows when its frames are stale", () => {
    const { items: withNew, path } = insertVectorGauge(items, DEFAULT_GAUGE, "Ring");
    expect(vectorOf(itemAt(withNew, path))).toEqual(DEFAULT_GAUGE);
    expect(isStale(itemAt(withNew, path))).toBe(true);
    const baked = { ...gauge(withNew, path), Images: [], vectorBaked: bakeSignature(DEFAULT_GAUGE, 0) };
    expect(isStale(baked)).toBe(false);
    expect(isStale({ ...baked, vector: { ...DEFAULT_GAUGE, sweep: 180 } } as GaugeItem)).toBe(true);
    const dropped = setVector(withNew, path, null);
    expect(vectorOf(itemAt(dropped, path))).toBeNull();
    expect(isStale(itemAt(items, "0.0"))).toBe(false);
  });

  it("makes file-name stems from gauge names", () => {
    expect([safeStem("GPU Fan #1"), safeStem("///")]).toEqual(["GPU_Fan_1", "gauge"]);
  });
});
