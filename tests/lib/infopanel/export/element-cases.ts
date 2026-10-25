/**
 * A profile holding one of each composite element (Row, Rows, Graph stack, Dual graph, Double ring, Drives, Shadow text),
 * a Sparkline in bars mode with a fill opacity, and a Ring and an LED bar with threshold colours, bound where they can be,
 * baked with stand-in PNGs (no canvas under Node; the readers look at the XML) and exported. Used by the export test and,
 * as one more input, by import-check (lab/infopanel/scripts/import-check.mts).
 */
import { assetFile, type Doc } from "../../../../src/lib/infopanel/assets/assets.ts";
import { bindItem, storeItems } from "../../../../src/lib/infopanel/canvas-edit.ts";
import { itemAt } from "../../../../src/lib/infopanel/editor/ops.ts";
import { applyElement, elementOf } from "../../../../src/lib/infopanel/elements/apply.ts";
import { elementSignature, setElementFile, staleElements, staticOf } from "../../../../src/lib/infopanel/elements/bake.ts";
import { newComposite, newElement, type CompositeType } from "../../../../src/lib/infopanel/elements/create.ts";
import { detectDrives } from "../../../../src/lib/infopanel/elements/drives.ts";
import { defaultPalette } from "../../../../src/lib/infopanel/elements/palette.ts";
import { infopanelFile, staleGauges } from "../../../../src/lib/infopanel/export/studio-export.ts";
import { bakeSignature, setFrameFiles, vectorOf } from "../../../../src/lib/infopanel/gauges/frames.ts";
import { newStored, readStored } from "../../../../src/lib/infopanel/import/stored.ts";
import type { DisplayItem, GroupItem, Profile } from "../../../../src/lib/infopanel/schema.ts";
import type { DataApiValue } from "../../../../src/lib/infopanel/sensors.ts";

export const ELEMENTS_CASE = "Elements-8a";
export const COMPOSITES: CompositeType[] = ["row", "rows", "stack", "dual", "doublering", "drives", "shadowtext"];

const drive = (n: number, name: string): Record<string, DataApiValue> => ({
  [`used${n}`]: { value: 40, unit: "%", name: `${name} Used Space`, ref: `libre:/nvme/${n}/load/${50 + n}` },
  [`free${n}`]: { value: 900, unit: "GB", name: `${name} Free Space`, ref: `libre:/nvme/${n}/data/${3 + n}` },
  [`temp${n}`]: { value: 44, unit: "°C", name: `${name} Composite Temperature`, ref: `libre:/nvme/${n}/temperature/0` },
});
export const DRIVE_SENSORS: Record<string, DataApiValue> = { ...drive(2, "Disk A"), ...drive(3, "Disk B") };

const cpu = { key: "libre.cpu", name: "CPU Total", unit: "%", ref: "libre:/amdcpu/0/load/0" };

/** A header-only PNG of the drawn size, its last bytes `seed`, so different drawings hash apart. */
function png(w: number, h: number, seed: number): Uint8Array {
  const b = new Uint8Array(32);
  b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
  const dv = new DataView(b.buffer);
  dv.setUint32(16, w);
  dv.setUint32(20, h);
  dv.setUint32(28, seed);
  return b;
}

/** The elements, bound where the element has a sensor of its own to bind. */
export function elementItems(profile: Profile): DisplayItem[] {
  const palette = defaultPalette(profile);
  const composites = COMPOSITES.map((type, i) => {
    const g = newComposite(type, profile, palette, type === "drives" ? detectDrives(DRIVE_SENSORS) : [], 20, 20 + i * 60);
    // A Row's value gets a sensor; its bar follows.
    return type === "row" ? applyElement({ ...g, DisplayItems: g.DisplayItems.map((k, j) => (j === 1 ? bindItem(k, cpu) : k)) } as DisplayItem) : g;
  });
  const ring = bindItem(newElement("ring", profile, palette), cpu);
  const led = bindItem(newElement("ledbar", profile, palette), cpu);
  const thresholds = [{ at: 70, ink: { color: "#FFEDB232" } }, { at: 90, ink: { color: "#FFF2665E" } }];
  const spark = bindItem(newElement("sparkline", profile, palette), cpu);
  return [
    ...composites,
    applyElement({ ...ring, element: { ...elementOf(ring)!, thresholds } } as unknown as DisplayItem),
    applyElement({ ...led, element: { ...elementOf(led)!, thresholds } } as unknown as DisplayItem),
    applyElement({ ...spark, element: { ...elementOf(spark)!, style: "bars", dot: false, gradient: false, fillAlpha: 0.6 } } as unknown as DisplayItem),
  ];
}

/** The profile, its baked doc and the exported .infopanel bytes. */
export async function elementExport(profile: Profile): Promise<{ name: string; profile: Profile; doc: Doc; bytes: Uint8Array; items: DisplayItem[] }> {
  const named = { ...profile, Name: ELEMENTS_CASE };
  const stored = JSON.parse(JSON.stringify(storeItems(newStored({ name: ELEMENTS_CASE, width: profile.Width, height: profile.Height }), named, elementItems(named))));
  const read = readStored(stored);
  let doc: Doc = { items: read.items, assets: new Map() };
  let n = 0;
  for (const path of staleElements(doc.items)) {
    const el = staticOf(itemAt(doc.items, path))!;
    doc = setElementFile(doc, path, await assetFile(`el_${path}.png`, png(el.width, el.height, n++), "added"), elementSignature(el.spec, el.width, el.height));
  }
  for (const path of staleGauges(doc.items)) {
    const spec = vectorOf(itemAt(doc.items, path))!;
    const files = await Promise.all([0, 1, 2].map((i) => assetFile(`g${path}_${i}.png`, png(spec.width, spec.height, n++ + i), "added")));
    doc = setFrameFiles(doc, path, files, bakeSignature(spec, 3));
  }
  return { name: ELEMENTS_CASE, profile: read.profile, doc, items: read.items, bytes: infopanelFile(read.profile, doc).bytes };
}

export const groupOf = (items: readonly DisplayItem[], i: number) => items[i] as GroupItem;
