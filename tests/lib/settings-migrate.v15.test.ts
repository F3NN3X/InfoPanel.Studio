// v15 (Edit v3 SPEC §3.8, decisions Q1, Q2, Q8; acceptance 1, 6, 11): every page one kind, nothing a user has lost or
// moved. Each case loads a v14 config through `mergeConfig`, as the app does, and checks the parts one by one.
import { describe, expect, it } from "vitest";
import { BLANK_MODULE, CANVAS_ID, CONFIG_VERSION, ITEM_ID, PANEL_ID, mergeConfig, type DashboardConfig, type MonitorProfile, type Placement, type ProfilePage, type StoredConfig } from "@/lib/layout";
import { cellBox } from "@/lib/free-pages";
import { toFree } from "@/lib/page-layout";
import { migrateProfileV15 } from "@/lib/page-model/migrate";
import { readPlacements, writePlacements } from "@/lib/page-model/placements-adapter";
import { withItemLayers } from "@/lib/page-model/items-layer";
import { openCanvas } from "@/lib/infopanel/canvas";
import { storeItems } from "@/lib/infopanel/canvas-edit";
import { newItem } from "@/lib/infopanel/editor/create";
import { newStored, readStored, type StoredCanvas, type StoredItem } from "@/lib/infopanel/import/stored";
import { newWidgetItem } from "@/lib/infopanel/native/widget-item";
import { defaultItem, type DisplayItem } from "@/lib/infopanel/schema";

const NOW = new Date("2026-10-27T00:00:00Z");
const HASH_A = "a".repeat(64);
const HASH_B = "b".repeat(64);

const zone = (id: string, module: string, c: [number, number, number, number], extra: Partial<Placement> = {}): Placement => ({
  id, module, colStart: c[0], rowStart: c[1], colSpan: c[2], rowSpan: c[3], visible: true, ...extra,
});

/** A free area's canvas, `w`×`h`: a bound sensor, a picture, a group of two texts, a hidden and a locked text. */
function areaCanvas(w: number, h: number, opts: { file?: string; hash?: string; name?: string; extra?: DisplayItem[] } = {}): StoredCanvas {
  const base = newStored({ name: opts.name ?? "Area", width: w, height: h, now: NOW });
  const { profile } = readStored(base);
  const sensor = { ...newItem("Sensor", profile), Name: "CPU", X: 10, Y: 12, $import: { key: "cpu.load", via: "exact" } } as unknown as DisplayItem;
  const pic = { ...defaultItem("Image"), Name: "Logo", X: 40, Y: 50, Width: 60, Height: 30, FilePath: opts.file ?? "logo.png", RelativePath: true } as DisplayItem;
  const pair = { ...defaultItem("Group"), Name: "Pair", X: 5, Y: 90, DisplayItems: [{ ...newItem("Text", profile), Name: "One", X: 5, Y: 90 }, { ...newItem("Text", profile), Name: "Two", X: 5, Y: 120 }] } as DisplayItem;
  const hidden = { ...newItem("Text", profile), Name: "Hidden", X: 70, Y: 10, Hidden: true } as DisplayItem;
  const locked = { ...newItem("Text", profile), Name: "Locked", X: 70, Y: 40, IsLocked: true } as DisplayItem;
  const stored = storeItems(base, profile, [sensor, pic, pair, hidden, locked, ...(opts.extra ?? [])]);
  return { ...stored, source: { name: opts.name ?? "Area", origin: "new", importedAt: "" }, assets: [{ name: opts.file ?? "logo.png", hash: opts.hash ?? HASH_A, type: "png", size: 10 }] };
}

const FILL = { width: 1024, height: 600, cols: 4, rows: 3, fit: "fill" as const };
const probe = { ...FILL, id: "probe", name: "probe", pages: [] } as MonitorProfile;

/** A v14 config holding `profiles`. */
const v14 = (profiles: unknown[]): StoredConfig => JSON.parse(JSON.stringify({ version: 14, activeProfile: "auto", profiles })) as StoredConfig;
const load = (c: StoredConfig, log?: string[]): DashboardConfig => mergeConfig(c, log);
const itemsOn = (page: ProfilePage) => page.placements.filter((p) => p.module === ITEM_ID);
const named = (page: ProfilePage, name: string) => page.placements.find((p) => p.item?.Name === name)!;
const groupNamed = (page: ProfilePage, name: string) => page.groups!.find((g) => g.name === name)!;

describe("v15: the version", () => {
  it("is stamped, and a v15 config loads again identical", () => {
    expect(CONFIG_VERSION).toBe(15);
    const box = cellBox(probe, zone("a", CANVAS_ID, [3, 2, 2, 2]));
    const out = load(v14([{ id: "s", name: "Desk", ...FILL, pages: [{ id: "pg", name: "Main", placements: [zone("clock", "Clock", [1, 1, 1, 1]), zone("area", CANVAS_ID, [3, 2, 2, 2], { canvas: areaCanvas(box.width, box.height) })] }] }]));
    expect(out.version).toBe(15);
    expect(load(JSON.parse(JSON.stringify(out)) as StoredConfig)).toEqual(out);
  });
});

describe("v15: an imported profile (acceptance 1, 11)", () => {
  const canvas = { ...areaCanvas(800, 480, { name: "Arc" }), source: { name: "Arc", origin: "file" as const, importedAt: "" } };
  const arc = { id: "arc", name: "Arc", width: 800, height: 480, cols: 2, rows: 1, fit: "fill", pages: [{ id: "a1", name: "Page 1", layout: "free", placements: [zone("c", CANVAS_ID, [1, 1, 2, 1], { canvas })] }] };

  it("stays one canvas, made for InfoPanel, on a grid of about 100 px cells with no gap or padding", () => {
    const log: string[] = [];
    const p = load(v14([arc]), log).profiles[0];
    expect(p).toMatchObject({ cols: 8, rows: 5, gap: 0, padding: 0, madeFor: "infopanel" });
    expect(p.pages[0]).not.toHaveProperty("layout");
    expect(p.pages[0].placements).toHaveLength(1);
    expect(p.pages[0].placements[0]).toMatchObject({ id: "c", module: CANVAS_ID, colStart: 1, rowStart: 1, colSpan: 8, rowSpan: 5 });
    // Every item keeps its exact X / Y / W / H: the canvas is untouched.
    expect(p.pages[0].placements[0].canvas).toEqual(canvas);
    expect(log).toEqual(["Arc: a grid of 8 × 5 cells; every item kept its place."]);
  });

  it("keeps a Made for the user set, and a scrolling page's grid", () => {
    const p = load(v14([{ ...arc, madeFor: "studio", fit: "scroll" }])).profiles[0];
    expect(p).toMatchObject({ cols: 2, rows: 1, madeFor: "studio" });
    expect(p.pages[0].placements[0].canvas).toEqual(canvas);
  });

  it("a canvas not loaded (only its ref) is left as it is, and so is its grid", () => {
    const { canvas: _c, ...ref } = arc.pages[0].placements[0];
    const log: string[] = [];
    const p = load(v14([{ ...arc, pages: [{ ...arc.pages[0], placements: [{ ...ref, canvasRef: "r1" }] }] }]), log).profiles[0];
    expect(p).toMatchObject({ cols: 2, rows: 1 });
    expect(p.pages[0].placements[0]).toMatchObject({ canvasRef: "r1", colSpan: 2 });
    expect(log).toEqual(["Arc › Page 1: left as it is, its canvas isn't loaded."]);
  });

  it("runs once: a v15 profile the user set to 2 × 1 stays so", () => {
    const once = load(v14([arc]));
    const stored = JSON.parse(JSON.stringify(once)) as { profiles: { cols: number; rows: number; pages: { placements: { colSpan: number; rowSpan: number }[] }[] }[] };
    Object.assign(stored.profiles[0], { cols: 2, rows: 1 });
    Object.assign(stored.profiles[0].pages[0].placements[0], { colSpan: 2, rowSpan: 1 });
    expect(load(stored as unknown as StoredConfig).profiles[0]).toMatchObject({ cols: 2, rows: 1 });
  });
});

describe("v15: a free area becomes a group (acceptance 6)", () => {
  const box = cellBox(probe, zone("a", CANVAS_ID, [3, 2, 2, 2]));
  const area = areaCanvas(box.width, box.height);
  const screen = (extra: Record<string, unknown> = {}) => ({
    id: "s", name: "Desk", ...FILL,
    pages: [{ id: "pg", name: "Main", placements: [zone("clock", "Clock", [1, 1, 1, 1], { settings: { face: "digital" } }), zone("area", CANVAS_ID, [3, 2, 2, 2], { canvas: area, ...extra })] }],
  });
  const log: string[] = [];
  const page = load(v14([screen()]), log).profiles[0].pages[0];

  it("a group named after the area, holding every item at the same pixels", () => {
    const g = groupNamed(page, "Area");
    expect(g.from).toMatchObject({ zone: { id: "area", colStart: 3, rowStart: 2 } });
    // Drawn 1:1 in its cells: an item's screen px is the area's corner plus its X / Y.
    const at = { x: box.left, y: box.top };
    expect(named(page, "CPU").px).toMatchObject({ x: Math.round(at.x + 10), y: Math.round(at.y + 12) });
    expect(named(page, "Logo").px).toEqual({ x: Math.round(at.x + 40), y: Math.round(at.y + 50), w: 60, h: 30 });
    expect(named(page, "Logo").item).toMatchObject({ X: Math.round(at.x + 40), Y: Math.round(at.y + 50), Width: 60, Height: 30, FilePath: "logo.png" });
    for (const name of ["CPU", "Logo", "Hidden", "Locked"]) expect(named(page, name).groupId).toBe(g.id);
  });

  it("keeps bindings, groups, hidden and locked items, and the area's files and fonts on the page", () => {
    expect((named(page, "CPU").item!.$ as { key?: string }).key).toBe("cpu.load");
    const pair = groupNamed(page, "Pair");
    expect(pair.parentId).toBe(groupNamed(page, "Area").id);
    expect([named(page, "One").groupId, named(page, "Two").groupId]).toEqual([pair.id, pair.id]);
    expect(named(page, "Hidden").visible).toBe(false);
    expect(named(page, "Locked").locked).toBe(true);
    expect(page.freeCanvas!.assets).toEqual(area.assets);
    expect(page.freeCanvas!.profile.FontScale).toBe(area.profile.FontScale);
  });

  it("loses nothing: every item of the area is a part, the area's canvas settings kept on the group", () => {
    const parts = itemsOn(page).map((p) => p.item!.Name);
    // The area's dark background became a locked shape behind its items.
    expect(parts).toEqual(["Background", "CPU", "Logo", "One", "Two", "Hidden", "Locked"]);
    expect(named(page, "Background")).toMatchObject({ locked: true, px: { x: Math.round(box.left), y: Math.round(box.top) } });
    expect(named(page, "Background").item).toMatchObject({ kind: "Shape", FillColor: area.profile.BackgroundColor, ShowFill: true, ShowFrame: false });
    expect((groupNamed(page, "Area").from as { canvas: Record<string, unknown> }).canvas).toMatchObject({ profile: area.profile, assets: area.assets });
    expect(page.placements.find((p) => p.id === "clock")).toEqual(zone("clock", "Clock", [1, 1, 1, 1], { settings: { face: "digital" } }));
    expect(page.placements.some((p) => p.module === CANVAS_ID)).toBe(false);
  });

  it("draws each item where the area drew it: the layer's canvas puts them at the same screen pixels", () => {
    const profile = load(v14([screen()])).profiles[0];
    const layers = withItemLayers(profile, profile.pages[0], profile.pages[0].placements.filter((p) => p.module !== ITEM_ID));
    const layer = layers.find((p) => p.module === CANVAS_ID)!;
    const drawn = openCanvas(layer.canvas!).items;
    // The layer spans the grid's area (no padding here), so its px are the screen's; hidden items aren't drawn.
    expect(drawn.map((i) => i.Name)).toEqual(["Background", "CPU", "Logo", "One", "Two", "Locked"]);
    expect(drawn.find((i) => i.Name === "Logo")).toMatchObject({ X: Math.round(box.left + 40), Y: Math.round(box.top + 50) });
    expect(drawn.some((i) => i.Name === "Hidden")).toBe(false);
  });

  it("is logged", () => {
    expect(log).toEqual(['Desk › Main: the free area "Area" is a group now, 6 parts at the same pixels.']);
  });

  it("a hidden area is a hidden group, and nothing in it is drawn", () => {
    const p = load(v14([screen({ visible: false })])).profiles[0];
    expect(groupNamed(p.pages[0], "Area").hidden).toBe(true);
    const layers = withItemLayers(p, p.pages[0], p.pages[0].placements.filter((z) => z.module !== ITEM_ID));
    expect(layers.map((z) => z.id)).toEqual(["clock"]);
  });

  it("an area drawn smaller than its canvas: items and fonts scaled by the same fit, and logged", () => {
    const big = areaCanvas(box.width * 2, box.height * 2);
    const log2: string[] = [];
    const p = load(v14([{ ...screen(), pages: [{ id: "pg", name: "Main", placements: [zone("area", CANVAS_ID, [3, 2, 2, 2], { canvas: big })] }] }]), log2).profiles[0].pages[0];
    expect(named(p, "Logo").px).toEqual({ x: Math.round(box.left + 20), y: Math.round(box.top + 25), w: 30, h: 15 });
    const font = (name: string, pg: { placements: Placement[] }) => named(pg as ProfilePage, name).item!.FontSize as number;
    expect(font("CPU", p)).toBe(Math.round((big.items[0].FontSize as number) / 2));
    expect(log2[0]).toContain("Scaled by 0.5 as the area drew it.");
  });

  it("two areas with a file of the same name but other bytes: the second is renamed, its item follows", () => {
    const two = {
      ...screen(),
      pages: [{
        id: "pg", name: "Main",
        placements: [
          zone("a1", CANVAS_ID, [1, 1, 2, 1], { canvas: areaCanvas(cellBox(probe, zone("x", CANVAS_ID, [1, 1, 2, 1])).width, cellBox(probe, zone("x", CANVAS_ID, [1, 1, 2, 1])).height, { name: "Left" }) }),
          zone("a2", CANVAS_ID, [3, 2, 2, 2], { canvas: areaCanvas(box.width, box.height, { name: "Right", hash: HASH_B }) }),
        ],
      }],
    };
    const p = load(v14([two])).profiles[0].pages[0];
    expect(p.freeCanvas!.assets.map((a) => [a.name, a.hash])).toEqual([["logo.png", HASH_A], ["logo_2.png", HASH_B]]);
    const logos = itemsOn(p).filter((z) => z.item!.Name === "Logo");
    expect(logos.map((z) => [groupNamed(p, "Left").id === z.groupId ? "Left" : "Right", z.item!.FilePath])).toEqual([["Left", "logo.png"], ["Right", "logo_2.png"]]);
  });

  it("an area whose canvas isn't loaded is left as it is", () => {
    const log2: string[] = [];
    const p = load(v14([screen({ canvas: undefined, canvasRef: "ref" })]), log2).profiles[0].pages[0];
    expect(p.placements.find((z) => z.id === "area")).toMatchObject({ module: CANVAS_ID, canvasRef: "ref" });
    expect(p.groups).toBeUndefined();
    expect(log2).toEqual(["Desk › Main: a free area was left as it is, its canvas isn't loaded."]);
  });
});

describe("v15: widgets a free area held (Q2)", () => {
  const box = cellBox(probe, zone("a", CANVAS_ID, [3, 2, 2, 2]));
  const cell = cellBox(probe, zone("c", "x", [1, 1, 1, 1]));
  /** A Weather widget item on the area's first cell (column 3, row 2). */
  const weather = newWidgetItem({ module: "Weather", id: "wx", settings: { units: "metric" } }, { x: 0, y: 0, w: cell.width, h: cell.height }, "Weather");
  const withArea = (others: Placement[]) => ({
    id: "s", name: "Desk", ...FILL,
    pages: [{ id: "pg", name: "Main", placements: [...others, zone("area", CANVAS_ID, [3, 2, 2, 2], { canvas: areaCanvas(box.width, box.height, { extra: [weather] }) })] }],
  });

  it("goes on the cells it was drawn over, keeping its id, settings and the area's group", () => {
    const p = load(v14([withArea([])])).profiles[0].pages[0];
    const w = p.placements.find((z) => z.module === "Weather")!;
    expect(w).toMatchObject({ id: "wx", colStart: 3, rowStart: 2, colSpan: 1, rowSpan: 1, settings: { units: "metric" }, groupId: groupNamed(p, "Area").id });
  });

  it("goes to the nearest free cells when a widget sits there, and says so", () => {
    const log: string[] = [];
    // A widget on 3,2 (it can't overlap the area in a real config: the free area's cells are taken by itself, so put one where the widget lands).
    const p = load(v14([withArea([zone("clk", "Clock", [3, 2, 1, 1])])]), log).profiles[0].pages[0];
    const w = p.placements.find((z) => z.module === "Weather")!;
    expect([w.colStart, w.rowStart]).not.toEqual([3, 2]);
    expect(log.some((l) => l.includes("Weather moved to the nearest free cells"))).toBe(true);
  });

  it("overlaps once, logged, when no cells are free", () => {
    const full = [1, 2, 3, 4].flatMap((c) => [1, 2, 3].map((r) => zone(`z${c}${r}`, "Clock", [c, r, 1, 1])));
    const log: string[] = [];
    const p = load(v14([withArea(full)]), log).profiles[0].pages[0];
    expect(p.placements.find((z) => z.module === "Weather")).toMatchObject({ colStart: 3, rowStart: 2 });
    expect(log.some((l) => l.includes("Weather has no free cells, so it overlaps another widget for now."))).toBe(true);
  });
});

describe("v15: a Free page on a Studio screen (Q1)", () => {
  /** The page as beta.35 made it: a grid page switched to Free (`toFree`), flagged. */
  function freeScreen(): { grid: MonitorProfile; v14Profile: Record<string, unknown> } {
    const box = cellBox(probe, zone("a", CANVAS_ID, [3, 2, 2, 2]));
    const grid: MonitorProfile = {
      id: "s", name: "Desk", ...FILL,
      pages: [{
        id: "pg", name: "Main",
        placements: [
          zone("clock", "Clock", [1, 1, 1, 1], { settings: { face: "digital", $onInfoPanel: "snapshot" }, design: { accent: "#ff0000" }, follow: { colors: false } }),
          zone("weather", "Weather", [2, 1, 2, 1], { visible: false }),
          zone("panel", PANEL_ID, [1, 2, 2, 2], { panel: { id: "pn", title: "Stats", titleVisible: true, visible: true, background: "panel", widgets: [{ id: "w1", kind: "value", visible: true }] } as unknown as Placement["panel"] }),
          zone("blank", BLANK_MODULE, [4, 1, 1, 1]),
          zone("area", CANVAS_ID, [3, 2, 2, 2], { canvas: areaCanvas(box.width, box.height) }),
        ],
      }],
    };
    const r = toFree(grid, grid.pages[0]);
    if ("refused" in r) throw new Error(r.refused);
    return { grid, v14Profile: { ...grid, pages: [{ ...r.page, layout: "free" }] } };
  }

  it("becomes a normal page: every widget back on its cells, as it was before the switch", () => {
    const { grid, v14Profile } = freeScreen();
    const log: string[] = [];
    const p = load(v14([v14Profile]), log).profiles[0];
    const page = p.pages[0];
    const widgets = page.placements.filter((z) => z.module !== ITEM_ID);
    for (const before of grid.pages[0].placements.filter((z) => z.module !== CANVAS_ID)) {
      const after = widgets.find((z) => z.id === before.id)!;
      expect(after).toMatchObject({ module: before.module, colStart: before.colStart, rowStart: before.rowStart, colSpan: before.colSpan, rowSpan: before.rowSpan, visible: before.visible });
      expect(after.settings).toEqual(before.settings);
      expect(after.design).toEqual(before.design);
      expect(after.follow).toEqual(before.follow);
      expect(after.panel).toEqual(before.panel);
      expect(after).not.toHaveProperty("groupId");
    }
    expect(page.placements.some((z) => z.module === CANVAS_ID)).toBe(false);
    expect(log[0]).toBe('Desk › Main: the Free page is a normal page now. 4 widgets on cells, 1 part placed freely in the group "Main".');
  });

  it("its items keep their pixels inside a group named after the page; the area's group nests in it", () => {
    const { grid, v14Profile } = freeScreen();
    const page = load(v14([v14Profile])).profiles[0].pages[0];
    const main = groupNamed(page, "Main");
    const area = groupNamed(page, "Area");
    expect(area.parentId).toBe(main.id);
    const box = cellBox(grid, grid.pages[0].placements[4]);
    expect(named(page, "Logo").px).toEqual({ x: Math.round(box.left + 40), y: Math.round(box.top + 50), w: 60, h: 30 });
    expect(named(page, "Logo").groupId).toBe(area.id);
    expect((named(page, "CPU").item!.$ as { key?: string }).key).toBe("cpu.load");
    expect(page.freeCanvas).toBeDefined();
    expect(page).not.toHaveProperty("layout");
  });

  it("is a fixed point of the page model: read and written back it is the same page", () => {
    const { v14Profile } = freeScreen();
    const p = load(v14([v14Profile])).profiles[0];
    expect(writePlacements(p.pages[0], readPlacements(p, p.pages[0]))).toBe(p.pages[0]);
  });

  it("a profile made here as one InfoPanel canvas (2 × 1) gets cells for its widgets, its background behind everything", () => {
    const canvas = storeItems(newStored({ name: "Mine", width: 800, height: 480, now: NOW }), readStored(newStored({ name: "x", width: 800, height: 480 })).profile, [
      newWidgetItem({ module: "Clock" }, { x: 0, y: 0, w: 200, h: 96 }, "Clock"),
      { ...defaultItem("Text"), Name: "Hello", X: 300, Y: 200 } as DisplayItem,
    ]);
    const log: string[] = [];
    const p = load(v14([{ id: "m", name: "Mine", width: 800, height: 480, cols: 2, rows: 1, fit: "fill", madeFor: "infopanel", pages: [{ id: "pg", name: "Main", layout: "free", placements: [zone("c", CANVAS_ID, [1, 1, 2, 1], { canvas })] }] }]), log).profiles[0];
    expect(p).toMatchObject({ cols: 8, rows: 5, madeFor: "infopanel" });
    const page = p.pages[0];
    expect(page.placements[0].item).toMatchObject({ kind: "Shape", Name: "Background", FillColor: canvas.profile.BackgroundColor });
    expect(page.placements[0]).not.toHaveProperty("groupId");
    expect(page.placements.find((z) => z.module === "Clock")).toMatchObject({ colStart: 1, rowStart: 1, colSpan: 2, rowSpan: 1 });
    expect(named(page, "Hello").px).toMatchObject({ x: 300, y: 200 });
    expect(log[0]).toBe("Mine: a grid of 8 × 5 cells for its widgets.");
  });
});

describe("v15: what a v15 config holds is kept, and checked", () => {
  const page = (extra: Record<string, unknown>) => ({ version: 15, activeProfile: "auto", profiles: [{ id: "s", name: "S", ...FILL, pages: [{ id: "pg", name: "Main", placements: [zone("clk", "Clock", [1, 1, 1, 1])], ...extra }] }] }) as unknown as StoredConfig;

  it("drops a stale layout flag and an unknown Made for, and nothing on the page", () => {
    const stored = page({ layout: "free" }) as unknown as { profiles: Record<string, unknown>[] };
    stored.profiles[0].madeFor = "everyone";
    const p = mergeConfig(stored as unknown as StoredConfig).profiles[0];
    expect(p.pages[0]).not.toHaveProperty("layout");
    expect(p.madeFor).toBeUndefined();
    expect(p.pages[0].placements.map((z) => z.id)).toEqual(["clk"]);
  });

  it("keeps groups and item placements as saved; drops a broken group, a loop and a group id that names nothing", () => {
    const saved = page({
      snapItems: false,
      groups: [{ id: "a", name: "A", parentId: "b" }, { id: "b", name: "B", parentId: "a", hidden: true }, { id: "a", name: "dup" }, { name: "no id" }, { id: "c", name: 5, locked: "yes" }],
      placements: [
        zone("clk", "Clock", [1, 1, 1, 1], { groupId: "a" }),
        zone("t", ITEM_ID, [1, 1, 1, 1], { item: { kind: "Text", Name: "T", X: 4, Y: 5, unknown: {} } as StoredItem, px: { x: 4, y: 5, w: 10, h: 10 }, groupId: "gone", locked: true }),
        zone("bad", ITEM_ID, [1, 1, 1, 1], { item: "nope" as unknown as StoredItem, px: { x: Number.NaN, y: 0, w: 1, h: 1 } }),
      ],
    });
    const pg = mergeConfig(saved).profiles[0].pages[0];
    expect(pg.snapItems).toBe(false);
    expect(pg.groups!.map((g) => [g.id, g.name, g.parentId, g.hidden, g.locked])).toEqual([
      ["a", "A", undefined, undefined, undefined],
      ["b", "B", "a", true, undefined],
      ["c", "Group", undefined, undefined, undefined],
    ]);
    expect(pg.placements.map((z) => z.id)).toEqual(["clk", "t", "bad"]);
    expect(pg.placements[0].groupId).toBe("a");
    expect(pg.placements[1]).toMatchObject({ px: { x: 4, y: 5, w: 10, h: 10 }, locked: true, item: { Name: "T" } });
    expect(pg.placements[1]).not.toHaveProperty("groupId");
    expect(pg.placements[2]).not.toHaveProperty("item");
    expect(pg.placements[2]).not.toHaveProperty("px");
  });

  it("migrateProfileV15 on a v15 profile returns it unchanged", () => {
    const p = mergeConfig(page({})).profiles[0];
    expect(migrateProfileV15(p, { legacy: false })).toBe(p);
    expect(migrateProfileV15({ ...p, pages: [] }, { legacy: true })).toEqual({ ...p, pages: [] });
  });
});
