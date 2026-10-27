// @vitest-environment happy-dom
// The .infopanel writer for a screen page's item placements (Edit v3 SPEC §11.4, DECISIONS "After phase 2"): a
// migrated beta.35 Free page and a migrated free area export every item they hold, as the items they are, at their
// box, in layer order, with the page's files; hidden parts and hidden groups stay out, as on the kiosk.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CANVAS_ID, ITEM_ID, mergeConfig, type MonitorProfile, type Placement, type ProfilePage, type StoredConfig } from "@/lib/layout";
import { cellBox } from "@/lib/free-pages";
import { toFree } from "@/lib/page-layout";
import { profileWithPage } from "@/lib/pages";
import { applyPage, cellRect } from "@/lib/page-model";
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

const load = (profiles: unknown[]): MonitorProfile => mergeConfig(JSON.parse(JSON.stringify({ version: 14, activeProfile: "auto", profiles })) as StoredConfig).profiles[0];

/** What a whole screen's conversion writes for its first page (no zone is drawn here, so widgets are only reported). */
async function exportOf(profile: MonitorProfile, page: ProfilePage = profile.pages[0]) {
  const view = profileWithPage(profile, page.id);
  return convertView({ placements: view.placements.filter((p) => p.visible), scope: document, sensors: {}, look: LOOK, titleOf: (id) => id, page: { screen: profile, page } });
}

const names = (items: readonly DisplayItem[]): string[] => items.flatMap((i) => (i.kind === "Group" ? names(i.DisplayItems) : [i.Name]));

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(async () => new Response(PNG)));
});
afterEach(() => vi.unstubAllGlobals());

describe("exporting a migrated free area", () => {
  const profile = load([{ id: "s", name: "Desk", ...FILL, madeFor: "infopanel", pages: [{ id: "pg", name: "Main", placements: [zone("clock", "Clock", [1, 1, 1, 1]), { ...AREA, canvas: areaCanvas(box.width, box.height) }] }] }]);

  it("writes every visible item at the pixels the area drew it, in layer order, with the page's file", async () => {
    const out = await exportOf(profile);
    expect(names(out.items)).toEqual(["Background", "Logo", "One", "Two"]);
    expect(out.items.find((i) => i.Name === "Logo")).toMatchObject({ X: Math.round(box.left + 40), Y: Math.round(box.top + 50), Width: 60, Height: 30, FilePath: "logo.png" });
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
    expect(out.items.find((i) => i.Name === "Logo")).toMatchObject({ X: 7, Y: 9, Width: 60, Height: 30 });
    const cell = cellRect(screenGrid(moved), { col: 2, row: 3, cols: 1, rows: 1 });
    expect(out.items.find((i) => i.Name === "One")).toMatchObject({ X: Math.round(cell.x), Y: Math.round(cell.y) });
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
    for (const p of parts) expect(out.items.find((i) => i.Name === p.item!.Name)).toMatchObject({ X: p.px!.x, Y: p.px!.y });
    expect(out.report.map((row) => row.outcome)).toContain("kept: they are InfoPanel items");
  });
});
