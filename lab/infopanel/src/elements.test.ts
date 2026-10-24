/// <reference types="vite/client" />
// Studio elements on real profiles: every extracted corpus profile with one of each element added, baked (stand-in
// PNGs: no canvas under Node), kept through the stored form and exported. The profile's own items must come back
// exactly as they were, and the elements as plain InfoPanel items whose files travel in the zip. Skips when
// `npm run lab:extract` has not been run.
import { describe, expect, it } from "vitest";
import { entriesFromZip, loadExport, type ExportEntry } from "@/lib/infopanel/archive.ts";
import { assetFile, type Doc } from "@/lib/infopanel/assets/assets.ts";
import { bindItem, storeItems } from "@/lib/infopanel/canvas-edit.ts";
import { itemAt } from "@/lib/infopanel/editor/ops.ts";
import { elementSignature, setElementFile, staleElements, staticOf } from "@/lib/infopanel/elements/bake.ts";
import { newCores, newElement } from "@/lib/infopanel/elements/create.ts";
import { defaultPalette } from "@/lib/infopanel/elements/palette.ts";
import { infopanelFile, staleGauges } from "@/lib/infopanel/export/studio-export.ts";
import { bakeSignature, setFrameFiles, vectorOf } from "@/lib/infopanel/gauges/frames.ts";
import { newStored, readStored } from "@/lib/infopanel/import/stored.ts";
import { walkItems } from "@/lib/infopanel/parse.ts";
import type { DisplayItem, GaugeItem, ImageItem } from "@/lib/infopanel/schema.ts";

const xml = import.meta.glob<string>("../corpus/*/*.xml", { query: "?raw", import: "default", eager: true });
const indexFiles = import.meta.glob<{ id: string; entries: string[] }[]>("../corpus/index.json", { import: "default", eager: true });
const index = Object.values(indexFiles)[0] ?? [];
const enc = new TextEncoder();

const entriesFor = (id: string): ExportEntry[] =>
  ["Profile.xml", "DisplayItems.xml"].map((name) => ({ name, read: async () => enc.encode(xml[`../corpus/${id}/${name}`]) }));

/** A 1 × 1 PNG with a trailing byte, so each stand-in hashes apart. */
const png = (n: number) =>
  Uint8Array.from([...atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==")].map((c) => c.charCodeAt(0)).concat(n % 256));

const LAB_FIELDS = new Set(["vector", "vectorBaked", "element", "elementBaked", "slots", "native"]);
const plain = (items: readonly DisplayItem[]) => JSON.parse(JSON.stringify(items, (k, v) => (LAB_FIELDS.has(k) || k === "unknown" ? undefined : v)));

describe.skipIf(index.length === 0)("studio elements on corpus profiles", () => {
  describe.each(index.map((p) => [p.id] as const))("%s", (id) => {
    it("exports the profile's own items unchanged and every element as an InfoPanel item with its files", async () => {
      const { profile, items } = await loadExport(entriesFor(id));
      const palette = defaultPalette(profile);
      const cpu = { key: "libre.cpu", name: "CPU Total", unit: "%", ref: "libre:/amdcpu/0/load/0" };
      const cores = [1, 2].map((n) => ({ key: `libre.c${n}`, name: `Core #${n}`, unit: "%", ref: `libre:/amdcpu/0/load/${n + 1}`, core: n, thread: 0 }));
      const added = [
        ...(["ring", "ledbar", "sparkline"] as const).map((t) => bindItem(newElement(t, profile, palette), cpu)),
        ...(["card", "glow", "divider", "icon"] as const).map((t) => newElement(t, profile, palette)),
        newCores(profile, palette, cores, 10, 10),
      ];
      // Through the stored form first, as the editor keeps it.
      const stored = JSON.parse(JSON.stringify(storeItems(newStored({ name: id, width: profile.Width, height: profile.Height }), profile, [...items, ...added])));
      const read = readStored(stored);
      expect(read.issues.filter((i) => i.code !== "unknown-field")).toEqual([]);

      let doc: Doc = { items: read.items, assets: new Map() };
      let n = 0;
      for (const path of staleElements(doc.items)) {
        const el = staticOf(itemAt(doc.items, path))!;
        doc = setElementFile(doc, path, await assetFile(`el_${path}.png`, png(n++), "added"), elementSignature(el.spec, el.width, el.height));
      }
      // Only the added gauges: a corpus gauge with frames is not stale.
      for (const path of staleGauges(doc.items)) {
        const spec = vectorOf(itemAt(doc.items, path))!;
        const files = await Promise.all([0, 1].map(async (i) => assetFile(`g${path}_${i}.png`, png(n++ + i), "added")));
        doc = setFrameFiles(doc, path, files, bakeSignature(spec, 2));
      }

      const back = await loadExport(entriesFromZip(infopanelFile(read.profile, doc).bytes));
      expect(back.issues.filter((i) => i.code !== "unknown-field")).toEqual([]);
      const own = back.items.slice(0, items.length);
      expect(plain(own)).toEqual(plain(items));
      const mine = back.items.slice(items.length);
      expect(mine.map((i) => i.kind)).toEqual(["Gauge", "Gauge", "Graph", "Shape", "Image", "Shape", "Image", "Group"]);
      const names = new Set(back.assets.keys());
      const files = [...walkItems(mine)].flatMap(({ item }) => (item.kind === "Image" ? [item as ImageItem] : item.kind === "Gauge" ? (item as GaugeItem).Images : []));
      expect(files.length).toBe(2 + 2 + 2);
      for (const f of files) expect(f.RelativePath && names.has(f.FilePath!.toLowerCase()), f.FilePath ?? "").toBe(true);
    });
  });
});
