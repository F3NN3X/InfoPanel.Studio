import { describe, expect, it, vi } from "vitest";
import { entriesFromZip, loadExport } from "@/lib/infopanel/archive.ts";
import { assetFile, type Doc } from "@/lib/infopanel/assets/assets.ts";
import { elementOf, ringVector } from "@/lib/infopanel/elements/apply.ts";
import { elementSignature, isElementStale, setElementFile, staleElements, staticOf } from "@/lib/infopanel/elements/bake.ts";
import type { RingSpec } from "@/lib/infopanel/elements/spec.ts";
import { loadIcons } from "@/lib/infopanel/elements/icons.ts";
import { elementSvg } from "@/lib/infopanel/elements/svg.ts";
import { infopanelFile, staleGauges } from "@/lib/infopanel/export/studio-export.ts";
import { itemAt } from "@/lib/infopanel/editor/ops.ts";
import { bakeSignature, setFrameFiles, vectorOf } from "@/lib/infopanel/gauges/frames.ts";
import { gaugeSvg } from "@/lib/infopanel/gauges/vector-svg.ts";
import { newItem } from "@/lib/infopanel/editor/create.ts";
import type { GaugeItem, GroupItem, ImageItem } from "@/lib/infopanel/schema.ts";
import { oneOfEach, palette, profile } from "./fixture.ts";

vi.mock("@/lib/infopanel/gauges/raster.ts", () => ({
  // A PNG header of the drawn size, its bytes changing with the markup (no canvas under Node).
  rasterSvg: async (svg: string, w: number, h: number) => png(w, h, svg.length),
}));

/** A PNG signature and IHDR of `w` × `h`, then `seed` as bytes, so different drawings hash differently. */
function png(w: number, h: number, seed: number): Uint8Array {
  const b = new Uint8Array(32);
  b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
  const dv = new DataView(b.buffer);
  dv.setUint32(16, w);
  dv.setUint32(20, h);
  dv.setUint32(28, seed);
  return b;
}

/** What the Export dialog does: every static element to one image, every vector gauge to `frames` frames. */
async function bakeAll(doc: Doc, frames = 3): Promise<Doc> {
  let next = doc;
  for (const path of staleElements(next.items)) {
    const el = staticOf(itemAt(next.items, path))!;
    const svg = elementSvg(el.spec, el.width, el.height);
    next = setElementFile(next, path, await assetFile(`el_${path}.png`, png(el.width, el.height, svg.length), "added"), elementSignature(el.spec, el.width, el.height));
  }
  for (const path of staleGauges(next.items)) {
    const spec = vectorOf(itemAt(next.items, path))!;
    const files = await Promise.all(Array.from({ length: frames }, (_, i) => assetFile(`g${path}_${i}.png`, png(spec.width, spec.height, i), "added")));
    next = setFrameFiles(next, path, files, bakeSignature(spec, frames));
  }
  return next;
}

describe("baking static elements", () => {
  it("bakes each card, glow, divider and icon image once, sized to its box, then they are up to date", async () => {
    const items = oneOfEach();
    expect(staleElements(items)).toEqual(["3", "5"]);
    const doc = await bakeAll({ items, assets: new Map() });
    expect(staleElements(doc.items)).toEqual([]);
    const glow = doc.items[3] as ImageItem;
    expect(glow).toMatchObject({ Type: "FILE", RelativePath: true, FilePath: "el_3.png" });
    expect(doc.assets.get("el_3.png")).toMatchObject({ type: "png", width: 240, height: 240 });
    // Moving it needs no new image; resizing it does.
    expect(isElementStale({ ...glow, X: 400 })).toBe(false);
    expect(isElementStale({ ...glow, Width: 100 })).toBe(true);
  });

  it("bakes through the canvas renderer with the element's markup", async () => {
    const { bakeElement } = await import("@/lib/infopanel/elements/raster.ts");
    const icon = staticOf(oneOfEach()[5])!;
    const file = await bakeElement(icon.spec, icon.width, icon.height, "CPU icon");
    expect(file).toMatchObject({ name: "CPU_icon_icon.png", type: "png", width: 48, height: 48 });
  });

  it("draws what each element is: the icon's own markup, a card's shadow and gradient, the glow's light", async () => {
    await loadIcons();
    const [, , , glow, , icon] = oneOfEach().map((i) => staticOf(i));
    expect(elementSvg(icon!.spec, 48, 48)).toContain('<rect x="4" y="4" width="16" height="16" rx="2">');
    expect(elementSvg(glow!.spec, 240, 240)).toMatch(/<radialGradient[^>]*r="120"/);
    const card = elementSvg({ type: "card", radius: 10, fill: [{ color: "#FF111111" }, { color: "#FF222222" }], angle: 90, stroke: null, shadow: { blur: 8, dx: 0, dy: 2, color: { color: "#80000000" } }, glow: null, pad: 14 }, 128, 100);
    expect(card).toContain("feGaussianBlur");
    expect(card).toMatch(/<linearGradient[^>]*x1="0" y1="0.5" x2="1" y2="0.5"/);
    expect(card).toContain('x="14" y="16" width="100" height="72"');
  });
});

describe("baking a ring", () => {
  it("draws a different frame per value, the end dot only past the start", () => {
    const ring = { ...(elementOf(oneOfEach()[0]) as RingSpec), dot: true };
    const g = ringVector(ring, 120, 120);
    const [zero, half, full] = [0, 0.5, 1].map((p) => gaugeSvg(g, p));
    expect(new Set([zero, half, full]).size).toBe(3);
    const circles = (svg: string) => (svg.match(/a[\d.]+ [\d.]+ 0 1 0 /g) ?? []).length;
    // Round-capped gradient ends, plus the dot: three circles of two arcs each.
    expect(circles(half)).toBe(circles(zero) + 6);
  });
});

describe("a mixed profile exported, then parsed", () => {
  it("reads back as InfoPanel items only, every baked file present and referenced relatively", async () => {
    const items = [...oneOfEach(), { ...newItem("Text", profile, palette), Name: "Load" }];
    const doc = await bakeAll({ items, assets: new Map() });
    const file = infopanelFile(profile, doc);
    const back = await loadExport(entriesFromZip(file.bytes));
    expect(back.issues.filter((i) => i.code !== "unknown-field")).toEqual([]);
    expect(back.items.map((i) => i.kind)).toEqual(["Gauge", "Gauge", "Shape", "Image", "Shape", "Image", "Group", "Graph", "Text"]);
    const names = new Set([...back.assets.keys()]);
    for (const i of [0, 1]) {
      const g = back.items[i] as GaugeItem;
      expect(g.Images).toHaveLength(3);
      for (const f of g.Images) {
        expect(f.RelativePath).toBe(true);
        expect(names.has(f.FilePath!.toLowerCase())).toBe(true);
      }
    }
    for (const i of [3, 5]) {
      const img = back.items[i] as ImageItem;
      expect(img.RelativePath).toBe(true);
      expect(names.has(img.FilePath!.toLowerCase())).toBe(true);
    }
    const cores = back.items[6] as GroupItem;
    expect(cores.DisplayItems.map((b) => [b.kind, (b as { SensorType?: string }).SensorType, (b as { LibreSensorId?: string }).LibreSensorId])).toEqual(
      [1, 2, 3, 4].map((n) => ["Bar", "Libre", `/intelcpu/0/load/${n}`]),
    );
    // Nothing studio-only in InfoPanel's files.
    expect(new TextDecoder().decode(file.bytes)).not.toMatch(/element|slots|accent1/);
  });
});
