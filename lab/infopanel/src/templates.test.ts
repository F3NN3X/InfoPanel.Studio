// Profile templates at every size: each template made at every New InfoPanel profile size (and a portrait one), on
// the gallery's mock machine and on one with no Data API, kept through the stored form, baked (stand-in PNGs: no
// canvas under Node) and exported. The export must parse back item for item with every referenced file in the zip.
// npm test keeps one size per template; this sweep is the heavy check.
import { describe, expect, it } from "vitest";
import { SIZE_PRESETS } from "@/components/infopanel/new-profile-dialog";
import { entriesFromZip, loadExport } from "@/lib/infopanel/archive.ts";
import { assetFile, type Doc } from "@/lib/infopanel/assets/assets.ts";
import { itemAt } from "@/lib/infopanel/editor/ops.ts";
import { elementSignature, setElementFile, staleElements, staticOf } from "@/lib/infopanel/elements/bake.ts";
import { infopanelFile, staleGauges } from "@/lib/infopanel/export/studio-export.ts";
import { bakeSignature, setFrameFiles, vectorOf } from "@/lib/infopanel/gauges/frames.ts";
import { readStored } from "@/lib/infopanel/import/stored.ts";
import { walkItems } from "@/lib/infopanel/parse.ts";
import type { GaugeItem, ImageItem } from "@/lib/infopanel/schema.ts";
import { TEMPLATES } from "@/lib/infopanel/templates/catalog.ts";
import { instantiate } from "@/lib/infopanel/templates/instantiate.ts";
import { MOCK_SENSORS } from "@/lib/infopanel/templates/mock.ts";

const png = (n: number) => Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10, n % 256, (n >> 8) % 256]);
const sizes = [...SIZE_PRESETS, { width: 480, height: 1920 }];
const machines = { mock: MOCK_SENSORS, none: {} } as const;

describe.each(TEMPLATES.map((t) => [t.id, t] as const))("template %s", (_, t) => {
  it.each(sizes.flatMap((s) => (["mock", "none"] as const).map((m) => [s.width, s.height, m] as const)))("%i × %i on the %s machine exports and reads back", async (width, height, machine) => {
    const { stored } = instantiate(t, { name: t.name, width, height, sensors: machines[machine], variant: t.variants.at(-1)!.id });
    const read = readStored(JSON.parse(JSON.stringify(stored)));
    expect(read.issues.filter((i) => i.code !== "unknown-field")).toEqual([]);

    let doc: Doc = { items: read.items, assets: new Map() };
    let n = 0;
    for (const path of staleElements(doc.items)) {
      const el = staticOf(itemAt(doc.items, path))!;
      expect(el.width * el.height).toBeGreaterThan(0);
      doc = setElementFile(doc, path, await assetFile(`el_${path}.png`, png(n++), "added"), elementSignature(el.spec, el.width, el.height));
    }
    for (const path of staleGauges(doc.items)) {
      const spec = vectorOf(itemAt(doc.items, path))!;
      const files = [await assetFile(`g${path}_0.png`, png(n++), "added"), await assetFile(`g${path}_1.png`, png(n++), "added")];
      doc = setFrameFiles(doc, path, files, bakeSignature(spec, 2));
    }
    expect(staleElements(doc.items)).toEqual([]);
    expect(staleGauges(doc.items)).toEqual([]);

    const back = await loadExport(entriesFromZip(infopanelFile(read.profile, doc).bytes));
    expect(back.issues.filter((i) => i.code !== "unknown-field")).toEqual([]);
    expect(back.profile).toMatchObject({ Width: width, Height: height });
    const kinds = (list: typeof back.items) => [...walkItems(list)].map(({ item }) => item.kind);
    expect(kinds(back.items)).toEqual(kinds(doc.items));
    const names = new Set(back.assets.keys());
    const files = [...walkItems(back.items)].flatMap(({ item }) => (item.kind === "Image" ? [item as ImageItem] : item.kind === "Gauge" ? (item as GaugeItem).Images : []));
    for (const f of files) expect(f.RelativePath && names.has(f.FilePath!.toLowerCase()), f.FilePath ?? "").toBe(true);
  });
});
