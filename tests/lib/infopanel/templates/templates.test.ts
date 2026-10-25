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
import { elementOf } from "@/lib/infopanel/elements/spec.ts";
import { isBound } from "@/lib/infopanel/sensors.ts";
import { TEMPLATES } from "@/lib/infopanel/templates/catalog.ts";
import { CORES_LABEL, DRIVES_LABEL, instantiate } from "@/lib/infopanel/templates/instantiate.ts";
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

describe("the Create dialog's sensor choices", () => {
  const graphite = TEMPLATES.find((t) => t.id === "graphite")!;
  const input = { name: "Desk", width: 480, height: 320, sensors: MOCK_SENSORS, now };
  const libreId = (stored: ReturnType<typeof instantiate>["stored"], name: string) => {
    const item = [...walkItems(readStored(JSON.parse(JSON.stringify(stored))).items)].find(({ item }) => item.Name === name)?.item;
    return item && isBound(item) ? String((item as unknown as Record<string, unknown>).LibreSensorId) : undefined;
  };

  it("lists every role the template reads with the sensor found for it", () => {
    const { roles } = instantiate(graphite, input);
    expect(roles.length).toBeGreaterThan(4);
    expect(roles.find((r) => r.role === "cpu.load")?.sensor?.ref).toBe("libre:/amdcpu/0/load/0");
  });

  it("binds a chosen sensor over the found one, and leaves a role unbound when let go", () => {
    const chosen = { key: "mock.gpu.load", name: "Mock GPU Core", unit: "%", ref: "libre:/gpu-nvidia/0/load/0" };
    const over = instantiate(graphite, { ...input, overrides: { "cpu.load": chosen, "gpu.temp": null } });
    expect(libreId(over.stored, "CPU load")).toBe("/gpu-nvidia/0/load/0");
    expect(over.roles.find((r) => r.role === "cpu.load")?.sensor).toEqual(chosen);
    expect(over.roles.find((r) => r.role === "gpu.temp")?.sensor).toBeNull();
    expect(over.unbound).toEqual(["GPU temperature"]);
    expect(libreId(over.stored, "GPU temperature")).toBe("");
    // The ones nobody touched still resolve as before.
    expect(libreId(over.stored, "RAM load")).toBe("/ram/load/0");
  });
});

describe("the Clock template's seconds ring", () => {
  const clock = TEMPLATES.find((t) => t.id === "clock")!;

  it("is bound to the clock plugin's second, 0 to 59, with a frame for each second and no CPU readout", () => {
    const { stored, unbound, roles } = instantiate(clock, { name: "Clock", width: 480, height: 320, sensors: MOCK_SENSORS, now });
    expect(unbound).toEqual([]);
    expect(roles.find((r) => r.role === "clock.second")?.sensor?.ref).toBe("plugin:/clock-plugin/clock/second");
    const items = [...walkItems(readStored(JSON.parse(JSON.stringify(stored))).items)].map(({ item }) => item);
    const ring = items.find((i) => i.Name === "Clock second ring") as unknown as GaugeItem & { element: { frames: number; segments: number } };
    expect(ring).toMatchObject({ MinValue: 0, MaxValue: 59, PluginSensorId: "/clock-plugin/clock/second" });
    expect(ring.element).toMatchObject({ frames: 60, segments: 60 });
    expect(items.some((i) => i.Name === "CPU load" || i.Name === "CPU")).toBe(false);
  });

  it("lists the ring for Remap when the PC has no clock plugin", () => {
    const sensors = Object.fromEntries(Object.entries(MOCK_SENSORS).filter(([k]) => !k.startsWith("mock.clock."))) as typeof MOCK_SENSORS;
    expect(instantiate(clock, { name: "Clock", width: 480, height: 320, sensors, now }).unbound).toEqual(["Clock second"]);
  });
});

describe("the Console template's drives", () => {
  const console_ = TEMPLATES.find((t) => t.id === "console")!;
  const tiles = (sensors: typeof MOCK_SENSORS) => {
    const { stored, unbound } = instantiate(console_, { name: "Console", width: 1920, height: 720, sensors, now });
    const group = [...walkItems(readStored(JSON.parse(JSON.stringify(stored))).items)].find(({ item }) => elementOf(item)?.type === "drives")!.item;
    return { unbound, tiles: (group as unknown as { DisplayItems: DisplayItem[] }).DisplayItems.length };
  };

  it("makes a tile for each drive found on the machine", () => {
    expect(tiles(MOCK_SENSORS)).toEqual({ unbound: [], tiles: 3 });
  });

  it("keeps placeholder tiles and lists Drives for Remap when none are found", () => {
    expect(tiles({}).unbound).toContain(DRIVES_LABEL);
    expect(tiles({}).tiles).toBeGreaterThan(0);
  });
});

describe("profile templates", () => {
  it("offers at least eight, each with distinct ids and 2 to 3 palette variants", () => {
    expect(TEMPLATES.length).toBeGreaterThanOrEqual(8);
    expect(new Set(TEMPLATES.map((t) => t.id)).size).toBe(TEMPLATES.length);
    for (const t of TEMPLATES) expect(t.variants.length).toBeGreaterThanOrEqual(2);
  });

  describe.each(TEMPLATES.map((t) => [t.id, t] as const))("%s", (_, t) => {
    // 480 × 320, and the size a template is made for.
    it.each([{ width: 480, height: 320 }, ...(t.size ? [t.size] : [])])("instantiates bound to the machine at $width × $height, reads back, and exports with its baked files", async ({ width, height }) => {
      const { stored, unbound } = instantiate(t, { name: t.name, width, height, variant: t.variants[1].id, sensors: MOCK_SENSORS, now });
      expect(unbound).toEqual([]);
      const read = readStored(JSON.parse(JSON.stringify(stored)));
      expect(read.issues.filter((i) => i.code !== "unknown-field")).toEqual([]);
      expect(read.profile).toMatchObject({ Width: width, Height: height, BackgroundColor: t.background, Font: t.type.family });
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

describe("the Dark, White, Smoke and Float templates", () => {
  const family = ["deck", "meters", "orbit", "tower", "ticker"].map((id) => TEMPLATES.find((t) => t.id === id)!);
  const input = { name: "T", width: 480, height: 320, sensors: MOCK_SENSORS, now };
  const elementTypes = (stored: ReturnType<typeof instantiate>["stored"]) => {
    const items = [...walkItems(readStored(JSON.parse(JSON.stringify(stored))).items)].map(({ item }) => item as DisplayItem & { element?: { type: string } });
    return items.map((i) => i.element?.type);
  };

  it.each(family.map((t) => [t.id, t] as const))("%s has Dark, White, Smoke and Float, and its own size", (_, t) => {
    expect(t.variants.map((v) => v.id)).toEqual(expect.arrayContaining(["dark", "white", "smoke", "float"]));
    expect(t.size).toBeDefined();
  });

  it.each(family.map((t) => [t.id, t] as const))("%s in Float draws no cards and shadows its text", (_, t) => {
    const float = elementTypes(instantiate(t, { ...input, variant: "float" }).stored);
    const dark = elementTypes(instantiate(t, { ...input, variant: "dark" }).stored);
    expect(float).not.toContain("card");
    expect(float).toContain("shadowtext");
    expect(dark).toContain("card");
    expect(dark).not.toContain("shadowtext");
  });

  it("Deck's wide layout leaves out the performance and network tiles, and its standard one has them", () => {
    const deck = family[0];
    const names = (width: number, height: number) => [...walkItems(readStored(JSON.parse(JSON.stringify(instantiate(deck, { ...input, width, height }).stored))).items)].map(({ item }) => item.Name);
    expect(names(1920, 480)).not.toContain("Performance card");
    expect(names(1920, 480)).not.toContain("Network card");
    expect(names(1920, 1080)).toEqual(expect.arrayContaining(["Performance card", "Network card"]));
  });

  it("Deck's network graph is two series, and Meters' rings are double rings", () => {
    expect(elementTypes(instantiate(family[0], input).stored)).toEqual(expect.arrayContaining(["dual", "rows"]));
    expect(elementTypes(instantiate(family[1], { ...input, width: 1600, height: 300 }).stored)).toContain("doublering");
  });
});
