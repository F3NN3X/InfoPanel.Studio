// @vitest-environment happy-dom
// The .infopanel writer for a screen page's item placements (Edit v3 SPEC §11.4, DECISIONS "After phase 2"): a
// migrated beta.35 Free page and a migrated free area export every item they hold, as the items they are, at their
// box, in layer order, with the page's files; hidden parts and hidden groups stay out, as on the kiosk. Page groups
// export as InfoPanel Group items named after them (DECISIONS "After phase 3"), so an import shows the same tree.
import { upgradeConfig } from "@/lib/config-upgrade";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CANVAS_ID, ITEM_ID, type MonitorProfile, type Placement, type ProfilePage, type StoredConfig } from "@/lib/layout";
import { cellBox } from "@/lib/free-pages";
import { toFree } from "@/lib/page-layout";
import { profileWithPage } from "@/lib/pages";
import { applyPage, cellRect, readPage, type LayerNode } from "@/lib/page-model";
import { screenGrid } from "@/lib/page-model/placements-adapter";
import { exportCheck } from "@/lib/infopanel/export-check";
import { storeItems } from "@/lib/infopanel/canvas-edit";
import { newItem } from "@/lib/infopanel/editor/create";
import { displayItemsXml } from "@/lib/infopanel/export/write";
import { newStored, readStored, type StoredCanvas } from "@/lib/infopanel/import/stored";
import { convertView } from "@/lib/infopanel/native/convert-view";
import { defaultItem, type DisplayItem } from "@/lib/infopanel/schema";

const NOW = new Date("2026-10-27T00:00:00Z");
const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
const LOOK = { Font: "Segoe UI", FontSize: 20, Color: "#FFFFFFFF", BackgroundColor: "#FF0A0A0C" };

const zone = (id: string, module: string, c: [number, number, number, number], extra: Partial<Placement> = {}): Placement => ({
  id, module, colStart: c[0], rowStart: c[1], colSpan: c[2], rowSpan: c[3], visible: true, ...extra,
});

/** A free area's canvas `w`×`h`: a picture, a group of two texts, a hidden text; its dark background becomes a Shape. */
function areaCanvas(w: number, h: number): StoredCanvas {
  const base = newStored({ name: "Area", width: w, height: h, now: NOW });
  const { profile } = readStored(base);
  const pic = { ...defaultItem("Image"), Name: "Logo", X: 40, Y: 50, Width: 60, Height: 30, FilePath: "logo.png", RelativePath: true } as DisplayItem;
  const pair = { ...defaultItem("Group"), Name: "Pair", X: 5, Y: 90, DisplayItems: [{ ...newItem("Text", profile), Name: "One", X: 5, Y: 90 }, { ...newItem("Text", profile), Name: "Two", X: 5, Y: 120 }] } as DisplayItem;
  const hidden = { ...newItem("Text", profile), Name: "Hidden", X: 70, Y: 10, Hidden: true } as DisplayItem;
  const stored = storeItems(base, profile, [pic, pair, hidden]);
  return { ...stored, source: { name: "Area", origin: "new", importedAt: "" }, assets: [{ name: "logo.png", hash: "a".repeat(64), type: "png", size: PNG.length }] };
}

const FILL = { width: 1024, height: 600, cols: 4, rows: 3, fit: "fill" as const };
const probe = { ...FILL, id: "probe", name: "probe", pages: [] } as MonitorProfile;
const AREA = zone("area", CANVAS_ID, [3, 2, 2, 2]);
const box = cellBox(probe, AREA);

const load = (profiles: unknown[]): MonitorProfile => upgradeConfig(JSON.parse(JSON.stringify({ version: 14, activeProfile: "auto", profiles })) as StoredConfig).profiles[0];

/** What a whole screen's conversion writes for its first page (no zone is drawn here, so widgets are only reported). */
async function exportOf(profile: MonitorProfile, page: ProfilePage = profile.pages[0]) {
  const view = profileWithPage(profile, page.id);
  return convertView({ placements: view.placements.filter((p) => p.visible), scope: document, sensors: {}, look: LOOK, titleOf: (id) => id, page: { screen: profile, page } });
}

const names = (items: readonly DisplayItem[]): string[] => items.flatMap((i) => (i.kind === "Group" ? names(i.DisplayItems) : [i.Name]));
/** Every item, a group's children in its place (the groups left out). */
const flat = (items: readonly DisplayItem[]): DisplayItem[] => items.flatMap((i) => (i.kind === "Group" ? flat(i.DisplayItems) : [i]));

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(async () => new Response(PNG)));
});
afterEach(() => vi.unstubAllGlobals());

describe("exporting a migrated free area", () => {
  const profile = load([{ id: "s", name: "Desk", ...FILL, madeFor: "infopanel", pages: [{ id: "pg", name: "Main", placements: [zone("clock", "Clock", [1, 1, 1, 1]), { ...AREA, canvas: areaCanvas(box.width, box.height) }] }] }]);

  it("writes every visible item at the pixels the area drew it, in layer order, with the page's file", async () => {
    const out = await exportOf(profile);
    expect(names(out.items)).toEqual(["Background", "Logo", "One", "Two"]);
    expect(flat(out.items).find((i) => i.Name === "Logo")).toMatchObject({ X: Math.round(box.left + 40), Y: Math.round(box.top + 50), Width: 60, Height: 30, FilePath: "logo.png" });
    expect(out.assets.map((a) => a.name)).toEqual(["logo.png"]);
    expect(out.size).toEqual({ width: 1024, height: 600 });
    // The .infopanel's item list holds them, in the same order.
    const xml = displayItemsXml(out.items);
    const at = ["Background", "Logo", "One", "Two"].map((n) => xml.indexOf(`<Name>${n}</Name>`));
    expect(at.every((x, i) => x > 0 && (i === 0 || x > at[i - 1]))).toBe(true);
    expect(xml).not.toContain("<Name>Hidden</Name>");
  });

  it("lists the same items in the grid page's Export check", () => {
    const check = exportCheck(profile, profile.pages[0]);
    expect(check.rows.filter((r) => r.kind === "item").map((r) => r.name)).toEqual(["Background", "Logo", "One", "Two"]);
  });

  it("writes an item moved on the canvas at its new box, and one on cells at its cells' box", async () => {
    const page = profile.pages[0];
    const logo = page.placements.find((p) => p.item?.Name === "Logo")!;
    const one = page.placements.find((p) => p.item?.Name === "One")!;
    const config = applyPage({ version: 15, activeProfile: "auto", profiles: [profile] } as never, profile.id, page.id, [
      { type: "move", id: logo.id, to: { x: 7, y: 9 } },
      { type: "move", id: one.id, to: { col: 2, row: 3 } },
    ]);
    const moved = config.profiles[0];
    const out = await exportOf(moved);
    expect(flat(out.items).find((i) => i.Name === "Logo")).toMatchObject({ X: 7, Y: 9, Width: 60, Height: 30 });
    const cell = cellRect(screenGrid(moved), { col: 2, row: 3, cols: 1, rows: 1 });
    expect(flat(out.items).find((i) => i.Name === "One")).toMatchObject({ X: Math.round(cell.x), Y: Math.round(cell.y) });
  });

  it("leaves out a hidden group's items, in the export and in the check", async () => {
    const page = profile.pages[0];
    const hidden = { ...page, groups: page.groups!.map((g) => (g.name === "Pair" ? { ...g, hidden: true } : g)) };
    const out = await exportOf({ ...profile, pages: [hidden] }, hidden);
    expect(names(out.items)).toEqual(["Background", "Logo"]);
    expect(exportCheck(profile, hidden).rows.map((r) => r.name)).not.toContain("One");
  });
});

describe("exporting a migrated beta.35 Free page", () => {
  it("writes the page's items, which no zone holds any more", async () => {
    const grid: MonitorProfile = { id: "s", name: "Desk", ...FILL, pages: [{ id: "pg", name: "Main", placements: [zone("clock", "Clock", [1, 1, 1, 1]), { ...AREA, canvas: areaCanvas(box.width, box.height) }] }] };
    const r = toFree(grid, grid.pages[0]);
    if ("refused" in r) throw new Error(r.refused);
    const profile = load([{ ...grid, pages: [{ ...r.page, layout: "free" }] }]);
    const page = profile.pages[0];
    expect(page.placements.some((p) => p.module === CANVAS_ID)).toBe(false);
    const parts = page.placements.filter((p) => p.module === ITEM_ID && p.visible);
    const out = await exportOf(profile);
    expect(names(out.items)).toEqual(parts.map((p) => p.item!.Name));
    for (const p of parts) expect(flat(out.items).find((i) => i.Name === p.item!.Name)).toMatchObject({ X: p.px!.x, Y: p.px!.y });
    expect(out.report.map((row) => row.outcome)).toContain("kept: they are InfoPanel items");
  });
});

describe("exporting a page's groups", () => {
  const base = newStored({ name: "Desk", width: 1024, height: 600, now: NOW });
  const { profile: look } = readStored(base);
  const text = (id: string, x: number, extra: Partial<Placement> = {}): Placement =>
    zone(id, ITEM_ID, [1, 1, 1, 1], { item: storeItems(base, look, [{ ...newItem("Text", look), Name: id, X: x, Y: 20 } as DisplayItem]).items[0], px: { x, y: 20, w: 80, h: 30 }, ...extra });
  // Bottom first: Clock (a widget, not drawn here), A and B in Outer, C in Inner (inside Outer), D at the top level.
  const page: ProfilePage = {
    id: "pg",
    name: "Main",
    placements: [zone("clock", "Clock", [4, 3, 1, 1]), text("A", 10, { groupId: "outer" }), text("C", 200, { groupId: "inner" }), text("B", 100, { groupId: "outer" }), text("D", 300)],
    groups: [{ id: "outer", name: "Outer" }, { id: "inner", name: "Inner", parentId: "outer" }],
  };
  const screen: MonitorProfile = { id: "s", name: "Desk", ...FILL, gap: 0, padding: 0, madeFor: "infopanel", pages: [page] };

  /** A tree's names and nesting, top first, widgets left out (they export by their own choice). */
  const shape = (nodes: readonly LayerNode[]): unknown[] =>
    nodes.flatMap((n): unknown[] => (n.type === "group" ? [{ [n.name]: shape(n.children) }] : n.kind === "widget" ? [] : [n.name]));

  it("writes each group as an InfoPanel Group named after it, its items inside in layer order", async () => {
    const out = await exportOf(screen);
    const tree = (items: readonly DisplayItem[]): unknown[] => items.map((i) => (i.kind === "Group" ? { [i.Name]: tree(i.DisplayItems) } : i.Name));
    expect(tree(out.items)).toEqual([{ Outer: ["A", { Inner: ["C"] }, "B"] }, "D"]);
    expect(flat(out.items).find((i) => i.Name === "C")).toMatchObject({ X: 200, Y: 20 });
  });

  it("imports back as the same tree", async () => {
    const out = await exportOf(screen);
    const canvas: StoredCanvas = { ...storeItems(base, look, out.items), source: { name: "Desk", origin: "file", importedAt: "" } };
    const imported: MonitorProfile = { ...screen, pages: [{ id: "pg", name: "Main", placements: [zone("c", CANVAS_ID, [1, 1, 4, 3], { canvas })] }] };
    const before = readPage(screen, page)!;
    const after = readPage(imported, imported.pages[0])!;
    expect(shape(after.root)).toEqual(shape(before.root));
    expect(shape(before.root)).toEqual(["D", { Outer: ["B", { Inner: ["C"] }, "A"] }]);
  });

  it("lists each part in the grid page's Export check with the Group it exports inside", () => {
    const rows = exportCheck(screen, page).rows;
    expect(rows.find((r) => r.name === "C")?.why).toMatch(/; inside the Group Inner$/);
    expect(rows.find((r) => r.name === "A")?.why).toMatch(/; inside the Group Outer$/);
    expect(rows.find((r) => r.name === "D")?.why).not.toContain("inside the Group");
  });

  it("leaves out a hidden group and an empty one", async () => {
    const hidden: ProfilePage = { ...page, groups: [{ id: "outer", name: "Outer" }, { id: "inner", name: "Inner", parentId: "outer", hidden: true }, { id: "empty", name: "Empty" }] };
    const out = await exportOf({ ...screen, pages: [hidden] }, hidden);
    expect(JSON.stringify(out.items)).not.toContain("Inner");
    expect(JSON.stringify(out.items)).not.toContain("Empty");
    expect(names(out.items)).toEqual(["A", "B", "D"]);
  });
});
