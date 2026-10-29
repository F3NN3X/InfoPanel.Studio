// An imported profile's canvas through the page model (Edit v3 SPEC §3.4, §3.6, §3.7, acceptance 2 and 11): read and
// written back, with Snap items toggled or the grid changed, it is the same canvas and exports the same bytes; each
// op lands in the items it names and nothing else.
import { upgradeConfig } from "@/lib/config-upgrade";
import { describe, expect, it } from "vitest";
import { importAsProfile } from "@/components/studio/import-actions";
import { assetFile, type Doc } from "@/lib/infopanel/assets/assets.ts";
import { openCanvas } from "@/lib/infopanel/canvas";
import { itemAt } from "@/lib/infopanel/editor/ops.ts";
import { elementSignature, setElementFile, staleElements, staticOf } from "@/lib/infopanel/elements/bake.ts";
import { infopanelFile, staleGauges } from "@/lib/infopanel/export/studio-export.ts";
import { bakeSignature, setFrameFiles, vectorOf } from "@/lib/infopanel/gauges/frames.ts";
import { buildCanvas, openStored, openZip } from "@/lib/infopanel/import/session.ts";
import { encodeItem, newStored, readStored, type StoredCanvas, type StoredItem } from "@/lib/infopanel/import/stored.ts";
import { newWidgetItem } from "@/lib/infopanel/native/widget-item";
import { defaultItem, type DisplayItem } from "@/lib/infopanel/schema.ts";
import { TEMPLATES } from "@/lib/infopanel/templates/catalog.ts";
import { instantiate } from "@/lib/infopanel/templates/instantiate.ts";
import { MOCK_SENSORS } from "@/lib/infopanel/templates/mock.ts";
import { fitFreePages } from "@/lib/free-pages";
import { CANVAS_ID, newProfile, type DashboardConfig, type MonitorProfile, type StoredConfig } from "@/lib/layout";
import { applyPage, cellRect, findNode, readPage, writePage, type PartNode } from "@/lib/page-model";
import { applyCanvas, readCanvas } from "@/lib/page-model/canvas-adapter";

const now = new Date("2026-10-25T00:00:00Z");
const png = (n: number) => Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10, n % 256, (n >> 8) % 256]);

/** Stand-in bakes (no canvas under Node), as the frozen export test makes them. */
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

/** A template's .infopanel file imported as a screen (no remap, no edits), kept in the config as JSON. */
async function imported(id: string): Promise<{ file: Uint8Array; config: DashboardConfig; byHash: Map<string, Uint8Array> }> {
  const template = TEMPLATES.find((t) => t.id === id)!;
  const { stored } = instantiate(template, { name: "Desk", width: 800, height: 480, sensors: MOCK_SENSORS, now });
  const fixed = { ...stored, profile: { ...stored.profile, Guid: "5f0c2a52-6c2e-4d0b-9a59-6c1a2f0e0b11" } };
  const open = await openStored(JSON.parse(JSON.stringify(fixed)), async () => null);
  const file = infopanelFile(open.parsed.profile, await baked(open.parsed.items)).bytes;
  const source = await openZip("Desk.infopanel", file);
  const canvas = buildCanvas({ source, name: "Desk", mode: "infopanel", resolved: new Map(), overrides: new Map(), dataApi: null, uploaded: new Map(), now });
  const placed = importAsProfile({ profiles: [newProfile("Main", 1920, 1080)] } as unknown as DashboardConfig, canvas, "Desk", { width: 800, height: 480 }, false);
  const config = upgradeConfig(JSON.parse(JSON.stringify(placed.config)) as StoredConfig);
  return { file, config, byHash: new Map([...source.assets.values()].map((f) => [f.hash, f.bytes])) };
}

/** The export dialog's bytes for the config's imported page. */
async function exported(config: DashboardConfig, byHash: Map<string, Uint8Array>): Promise<Uint8Array> {
  const zone = config.profiles.flatMap((p) => p.pages.flatMap((pg) => pg.placements)).find((z) => z.module === CANVAS_ID && z.canvas)!;
  const opened = await openStored(zone.canvas as StoredCanvas, async (hash) => byHash.get(hash) ?? null);
  return infopanelFile(opened.parsed.profile, { items: opened.parsed.items, assets: opened.assets }).bytes;
}

const importedProfile = (c: DashboardConfig) => c.profiles.find((p) => p.name === "Desk")!;

describe("an unedited imported profile through the page model (acceptance 2, 11)", () => {
  it.each(TEMPLATES.map((t) => t.id))("%s: opened, Snap items toggled and the grid changed, it exports the bytes it was imported from", async (id) => {
    const { file, config, byHash } = await imported(id);
    const profile = importedProfile(config);
    const page = profile.pages[0];
    // Opened: read into the model and written back, the same page.
    const model = readPage(profile, page)!;
    expect(writePage(profile, page, model)).toBe(page);
    // Snap items off and on again: the canvas is the same object.
    const off = applyPage(config, profile.id, page.id, [{ type: "setSnapItems", snapItems: false }]);
    const on = applyPage(off, profile.id, page.id, [{ type: "setSnapItems", snapItems: true }]);
    expect(importedProfile(on).pages[0].placements[0].canvas).toBe(page.placements[0].canvas);
    // The grid changed (6 × 4): the canvas still fills it, every item where it was.
    const regridded = fitFreePages(profile, { ...profile, cols: 6, rows: 4 });
    expect(regridded.pages[0].placements[0]).toMatchObject({ colSpan: 6, rowSpan: 4 });
    expect(regridded.pages[0].placements[0].canvas).toBe(page.placements[0].canvas);
    const after = { ...on, profiles: on.profiles.map((p) => (p.id === profile.id ? regridded : p)) };
    expect(await exported(after, byHash)).toEqual(file);
  });
});

/** Neon Rig, 800 × 480 on 8 × 5 cells of 100 × 96: a title, a group of two values, a widget on cells. */
function neon(): MonitorProfile {
  const base = { ...newStored({ name: "Neon", width: 800, height: 480, now }), source: { name: "Neon", origin: "file" as const, importedAt: "" } };
  const { profile } = readStored(base);
  const enc = (it: DisplayItem) => encodeItem(it, () => null);
  const title = enc({ ...defaultItem("Text"), Name: "NEON RIG", X: 32, Y: 24, FontSize: 30 } as DisplayItem);
  const a = enc({ ...defaultItem("Sensor"), Name: "CPU temp", X: 30, Y: 100 } as DisplayItem);
  const b = enc({ ...defaultItem("Bar"), Name: "CPU bar", X: 30, Y: 200, Width: 220, Height: 20 } as DisplayItem);
  const temps: StoredItem = { ...enc({ ...defaultItem("Group"), Name: "Temps" } as DisplayItem), DisplayItems: [a, b] };
  const weather = enc(newWidgetItem({ module: "Weather", cell: { col: 7, row: 5, cols: 2, rows: 1 } }, { x: 600, y: 384, w: 200, h: 96 }, "Weather"));
  const canvas: StoredCanvas = { ...base, profile: { ...base.profile, ...profile, unknown: {} } as unknown as StoredCanvas["profile"], items: [title, temps, weather] };
  return {
    id: "neon", name: "Neon Rig", width: 800, height: 480, cols: 8, rows: 5, fit: "fill", gap: 0, padding: 0, madeFor: "infopanel",
    pages: [{ id: "main", name: "Main", placements: [{ id: "c", module: CANVAS_ID, colStart: 1, rowStart: 1, colSpan: 8, rowSpan: 5, visible: true, canvas }] }],
  };
}
const canvasOf = (p: { placements: { canvas?: StoredCanvas }[] }) => p.placements[0].canvas!;

describe("reading an imported page", () => {
  const profile = neon();
  const model = readCanvas(profile, profile.pages[0])!;

  it("lists the canvas's items top first, a Group as a group, the widget on its cells, items placed freely", () => {
    expect(model.root.map((n) => n.name)).toEqual(["Weather", "Temps", "NEON RIG"]);
    const temps = model.root[1];
    expect(temps.type === "group" && temps.children.map((c) => c.name)).toEqual(["CPU bar", "CPU temp"]);
    const weather = model.root[0] as PartNode;
    expect([weather.kind, weather.place]).toEqual(["widget", { cell: { col: 7, row: 5, cols: 2, rows: 1 } }]);
    const title = model.root[2] as PartNode;
    expect(title.kind).toBe("item");
    expect("px" in title.place && [title.place.px.x, title.place.px.y]).toEqual([32, 24]);
  });

  it("has the canvas's grid: its own size, the screen's columns and rows, no padding", () => {
    expect(model.grid).toEqual({ cols: 8, rows: 5, gap: 0, padding: 0, width: 800, height: 480 });
    expect(cellRect(model.grid, { col: 7, row: 5, cols: 2, rows: 1 })).toEqual({ x: 600, y: 384, w: 200, h: 96 });
  });

  it("is null for a canvas not loaded yet", () => {
    const p = neon();
    const { canvas: _c, ...zone } = p.pages[0].placements[0];
    expect(readPage(p, { ...p.pages[0], placements: [{ ...zone, canvasRef: "r" }] })).toBeNull();
  });
});

describe("ops on an imported page", () => {
  const run = (ops: Parameters<typeof applyCanvas>[2]) => {
    const profile = neon();
    const page = profile.pages[0];
    return { before: canvasOf(page), after: canvasOf(applyCanvas(profile, page, ops)) };
  };

  it("moves an item to the pixel; only that item changes", () => {
    const { before, after } = run([{ type: "move", id: "0", to: { x: 50, y: 60 } }]);
    expect(after.items[0]).toMatchObject({ X: 50, Y: 60, Name: "NEON RIG" });
    expect(after.items[1]).toBe(before.items[1]);
    expect(after.items[2]).toBe(before.items[2]);
  });

  it("Snap to grid puts an item on cells (`$.cell`) at their box; moving it to px again drops the cells", () => {
    const { after } = run([{ type: "snapToGrid", id: "0" }]);
    expect(after.items[0].$).toEqual({ cell: { col: 1, row: 1, cols: 2, rows: 1 } });
    expect(after.items[0]).toMatchObject({ X: 0, Y: 0 });
    const profile = neon();
    const page = { ...profile.pages[0], placements: [{ ...profile.pages[0].placements[0], canvas: after }] };
    const freed = canvasOf(applyCanvas(profile, page, [{ type: "move", id: "0", to: { x: 7, y: 9 } }]));
    expect(freed.items[0]).not.toHaveProperty("$");
    expect(freed.items[0]).toMatchObject({ X: 7, Y: 9 });
    // Read back, the snapped one is on its cells (NEON RIG at 30 px spans two).
    expect((findNode(readCanvas(profile, page)!.root, "0")!.node as PartNode).place).toEqual({ cell: { col: 1, row: 1, cols: 2, rows: 1 } });
  });

  it("moves a widget by cells, its box and `$.widget.cell` in step", () => {
    const { after } = run([{ type: "move", id: "2", to: { col: 1, row: 4 } }]);
    expect(after.items[2]).toMatchObject({ X: 0, Y: 288, Width: 200, Height: 96 });
    expect((after.items[2].$ as { widget: { cell: unknown; module: string } }).widget).toEqual({ module: "Weather", cell: { col: 1, row: 4, cols: 2, rows: 1 } });
  });

  it("hides, locks and renames through the item's own fields", () => {
    const { after } = run([
      { type: "setHidden", id: "0", hidden: true },
      { type: "setLocked", id: "1", locked: true },
      { type: "rename", id: "1.0", name: "CPU °C" },
    ]);
    expect(after.items[0].Hidden).toBe(true);
    expect(after.items[1].IsLocked).toBe(true);
    expect((after.items[1].DisplayItems as StoredItem[])[0].Name).toBe("CPU °C");
  });

  it("groups as a canvas Group item, ungroups back into the list, keeping z-order", () => {
    const { after } = run([{ type: "group", ids: ["0", "2"], id: "new", name: "Header" }]);
    expect(after.items.map((i) => i.Name)).toEqual(["Temps", "Header"]);
    expect((after.items[1].DisplayItems as StoredItem[]).map((i) => i.Name)).toEqual(["NEON RIG", "Weather"]);
    expect(after.items[1].kind).toBe("Group");
    const profile = neon();
    const page = { ...profile.pages[0], placements: [{ ...profile.pages[0].placements[0], canvas: after }] };
    const back = canvasOf(applyCanvas(profile, page, [{ type: "ungroup", id: "1" }]));
    expect(back.items.map((i) => i.Name)).toEqual(["Temps", "NEON RIG", "Weather"]);
  });

  it("adds a widget from a screen as a widget item on its cells, on top; removes an item", () => {
    const part: PartNode = {
      type: "part", id: "w", kind: "widget", name: "Clock", place: { cell: { col: 1, row: 1, cols: 2, rows: 1 } },
      ref: { backing: "placement", placement: { id: "clk", module: "Clock", colStart: 1, rowStart: 1, colSpan: 2, rowSpan: 1, visible: true, settings: { face: "digital" } } },
    };
    const { after } = run([{ type: "add", part }, { type: "remove", id: "0" }]);
    expect(after.items.map((i) => i.Name)).toEqual(["Temps", "Weather", "Clock"]);
    const host = openCanvas(after).items[2] as DisplayItem & { widget?: { module: string; cell: unknown; settings: unknown } };
    expect(host.widget).toMatchObject({ module: "Clock", id: "clk", settings: { face: "digital" }, cell: { col: 1, row: 1, cols: 2, rows: 1 } });
    expect(host).toMatchObject({ X: 0, Y: 0, Width: 200, Height: 96 });
  });

  it("Snap items lives on the page, never in the canvas", () => {
    const profile = neon();
    const page = profile.pages[0];
    const off = applyCanvas(profile, page, [{ type: "setSnapItems", snapItems: false }]);
    expect(off.snapItems).toBe(false);
    expect(canvasOf(off)).toBe(canvasOf(page));
  });
});
