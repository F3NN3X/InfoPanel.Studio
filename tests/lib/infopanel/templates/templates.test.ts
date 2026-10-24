import { describe, expect, it } from "vitest";
import { entriesFromZip, loadExport } from "@/lib/infopanel/archive.ts";
import { assetFile, type Doc } from "@/lib/infopanel/assets/assets.ts";
import { itemAt } from "@/lib/infopanel/editor/ops.ts";
import { elementSignature, setElementFile, staleElements, staticOf } from "@/lib/infopanel/elements/bake.ts";
import { infopanelFile, staleGauges } from "@/lib/infopanel/export/studio-export.ts";
import { bakeSignature, setFrameFiles, vectorOf } from "@/lib/infopanel/gauges/frames.ts";
import { readStored } from "@/lib/infopanel/import/stored.ts";
import { walkItems } from "@/lib/infopanel/parse.ts";
import type { DisplayItem, GaugeItem, ImageItem } from "@/lib/infopanel/schema.ts";
import { isBound } from "@/lib/infopanel/sensors.ts";
import { TEMPLATES } from "@/lib/infopanel/templates/catalog.ts";
import { CORES_LABEL, instantiate } from "@/lib/infopanel/templates/instantiate.ts";
import { MOCK_SENSORS } from "@/lib/infopanel/templates/mock.ts";

const now = new Date("2026-10-25T00:00:00Z");
const png = (n: number) => Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10, n % 256, (n >> 8) % 256]);

/** Stand-in bakes (no canvas under Node): one file per static element, two frames per gauge. */
async function baked(items: DisplayItem[]): Promise<Doc> {
  let doc: Doc = { items, assets: new Map() };
  let n = 0;
  for (const path of staleElements(doc.items)) {
    const el = staticOf(itemAt(doc.items, path))!;
    doc = setElementFile(doc, path, await assetFile(`el_${path}.png`, png(n++), "added"), elementSignature(el.spec, el.width, el.height));
  }
  for (const path of staleGauges(doc.items)) {
    const spec = vectorOf(itemAt(doc.items, path))!;
    const files = [await assetFile(`g${path}_0.png`, png(n++), "added"), await assetFile(`g${path}_1.png`, png(n++), "added")];
    doc = setFrameFiles(doc, path, files, bakeSignature(spec, 2));
  }
  return doc;
}

const ids = (item: DisplayItem) => (isBound(item) ? (item as unknown as Record<string, unknown>) : {});

describe("profile templates", () => {
  it("offers at least eight, each with distinct ids and 2 to 3 palette variants", () => {
    expect(TEMPLATES.length).toBeGreaterThanOrEqual(8);
    expect(new Set(TEMPLATES.map((t) => t.id)).size).toBe(TEMPLATES.length);
    for (const t of TEMPLATES) expect(t.variants.length).toBeGreaterThanOrEqual(2);
  });

  describe.each(TEMPLATES.map((t) => [t.id, t] as const))("%s", (_, t) => {
    it("instantiates bound to the machine, reads back, and exports with its baked files", async () => {
      const { stored, unbound } = instantiate(t, { name: t.name, width: 480, height: 320, variant: t.variants[1].id, sensors: MOCK_SENSORS, now });
      expect(unbound).toEqual([]);
      const read = readStored(JSON.parse(JSON.stringify(stored)));
      expect(read.issues.filter((i) => i.code !== "unknown-field")).toEqual([]);
      expect(read.profile).toMatchObject({ Width: 480, Height: 320, BackgroundColor: t.background, Font: t.type.family });
      expect(read.stored.palette).toEqual({ ...t.palette, ...t.variants[1].palette });
      // Every sensor item reads a mock sensor, natively.
      const bound = [...walkItems(read.items)].filter(({ item }) => isBound(item));
      expect(bound.length).toBeGreaterThan(0);
      for (const { item } of bound) expect(String(ids(item).LibreSensorId || ids(item).PluginSensorId), item.Name).not.toBe("");

      const doc = await baked(read.items);
      const back = await loadExport(entriesFromZip(infopanelFile(read.profile, doc).bytes));
      expect(back.issues.filter((i) => i.code !== "unknown-field")).toEqual([]);
      expect(back.items.map((i) => i.kind)).toEqual(read.items.map((i) => i.kind));
      const names = new Set(back.assets.keys());
      const files = [...walkItems(back.items)].flatMap(({ item }) => (item.kind === "Image" ? [item as ImageItem] : item.kind === "Gauge" ? (item as GaugeItem).Images : []));
      for (const f of files) expect(f.RelativePath && names.has(f.FilePath!.toLowerCase()), f.FilePath ?? "").toBe(true);
    });
  });

  it("leaves what it can't find unbound, without ids, and says what", () => {
    const t = TEMPLATES.find((x) => x.id === "cores")!;
    const { stored, unbound } = instantiate(t, { name: "Cores", width: 800, height: 480, sensors: {}, now });
    expect(unbound).toEqual(["CPU temperature", "CPU load", "CPU clock", "CPU power", CORES_LABEL]);
    const read = readStored(JSON.parse(JSON.stringify(stored)));
    const temp = [...walkItems(read.items)].find(({ item }) => item.Name === "CPU temperature")!.item;
    expect(temp).toMatchObject({ SensorType: "Libre", LibreSensorId: "", SensorName: "CPU temperature" });
    expect(read.keys.get([...read.keys.keys()][0])).toMatchObject({ via: "unresolved" });
  });

  it("recolours from the palette: each colour follows a slot", () => {
    const t = TEMPLATES[0];
    const { stored } = instantiate(t, { name: "G", width: 480, height: 320, sensors: MOCK_SENSORS, now });
    const slotted = stored.items.filter((i) => (i.$ as { slots?: object; element?: object } | undefined)?.slots || (i.$ as { element?: object } | undefined)?.element);
    expect(slotted.length).toBe(stored.items.length);
  });
});
