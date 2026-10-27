// Grid ↔ Free (one-editor SPEC §6, acceptance 6–8): a switch keeps every widget, item, setting and binding, puts
// each part where the kiosk drew it, and a switch back gives the page it came from.
import { describe, expect, it } from "vitest";
import { CANVAS_ID, ITEM_ID, PANEL_ID, type MonitorProfile, type Placement, type ProfilePage } from "@/lib/layout";
import { cellBox, fitFreePages, gridArea, isFreePage, withFreeCanvas } from "@/lib/free-pages";
import { FROM_FREE_KEY, NOT_LOADED, scaleFreePages, switchLayout, toFree, toGrid, type LayoutSwitch, type SwitchResult } from "@/lib/page-layout";
import { encodeItem, newStored, readStored, type StoredCanvas, type StoredItem } from "@/lib/infopanel/import/stored";
import { editItems, storeItems } from "@/lib/infopanel/canvas-edit";
import { openCanvas } from "@/lib/infopanel/canvas";
import { newItem } from "@/lib/infopanel/editor/create";
import { newWidgetItem } from "@/lib/infopanel/native/widget-item";
import { defaultItem, type DisplayItem } from "@/lib/infopanel/schema";

const NOW = new Date("2026-10-27T00:00:00Z");
const HASH_A = "a".repeat(64);
const HASH_B = "b".repeat(64);

const ok = (r: SwitchResult): LayoutSwitch => {
  if ("refused" in r) throw new Error(r.refused);
  return r;
};

/** A canvas of `w`×`h` holding a bound sensor, a picture and a group of two texts. */
function areaCanvas(w: number, h: number, file = "logo.png", hash = HASH_A): StoredCanvas {
  const base = newStored({ name: "Area", width: w, height: h, now: NOW });
  const { profile } = readStored(base);
  const text = { ...newItem("Sensor", profile), Name: "CPU", X: 10, Y: 12 } as DisplayItem;
  const pic = { ...defaultItem("Image"), Name: "Logo", X: 40, Y: 50, Width: 60, Height: 30, FilePath: file, RelativePath: true } as DisplayItem;
  const group = { ...defaultItem("Group"), Name: "Pair", X: 5, Y: 90, DisplayItems: [{ ...newItem("Text", profile), X: 5, Y: 90 }, { ...newItem("Text", profile), X: 5, Y: 120 }] } as DisplayItem;
  const stored = storeItems(base, profile, [{ ...text, $import: { key: "cpu.load", via: "exact" } } as unknown as DisplayItem, pic, group]);
  return { ...stored, source: { name: "Area", origin: "file", importedAt: "" }, assets: [{ name: file, hash, type: "png", size: 10 }] };
}

const zone = (id: string, module: string, col: number, row: number, cols: number, rows: number, extra: Partial<Placement> = {}): Placement => ({
  id, module, colStart: col, rowStart: row, colSpan: cols, rowSpan: rows, visible: true, ...extra,
});

/** A 1024×600 kiosk screen, 4×3, its widgets, a hidden one, a panel, a blank zone and a free area drawn 1:1. */
function screen(page: Partial<ProfilePage> = {}, extra: Partial<MonitorProfile> = {}): MonitorProfile {
  const base = { id: "s1", name: "Desk", width: 1024, height: 600, cols: 4, rows: 3, fit: "fill" as const, ...extra };
  const probe = { ...base, pages: [] };
  const areaBox = cellBox(probe, zone("x", CANVAS_ID, 3, 2, 2, 2));
  const placements: Placement[] = [
    zone("clock", "Clock", 1, 1, 1, 1, { settings: { face: "digital", $onInfoPanel: "snapshot" }, design: { accent: "#ff0000" }, follow: { colors: false } }),
    zone("weather", "Weather", 2, 1, 2, 1, { visible: false, settings: { units: "metric" } }),
    zone("panel", PANEL_ID, 1, 2, 2, 2, { panel: { id: "pn", title: "Stats", titleVisible: true, visible: true, background: "panel", widgets: [{ id: "w1", kind: "value", visible: true }] } as unknown as Placement["panel"] }),
    zone("blank", "blank", 4, 1, 1, 1),
    zone("area", CANVAS_ID, 3, 2, 2, 2, { canvas: areaCanvas(Math.round(areaBox.width), Math.round(areaBox.height)) }),
  ];
  return { ...base, pages: [{ id: "pg", name: "Main", placements, ...page }] };
}

const pageOf = (p: MonitorProfile) => p.pages[0];
const withPage = (p: MonitorProfile, page: ProfilePage): MonitorProfile => ({ ...p, pages: [page] });
const itemsOf = (page: ProfilePage) => page.placements[0].canvas!.items;
const strip = (p: Placement) => {
  const { canvas: _c, ...rest } = p;
  return rest;
};

describe("Grid → Free", () => {
  const profile = screen();
  const free = ok(toFree(profile, pageOf(profile))).page;

  it("makes one canvas the screen's size, filling the grid", () => {
    // v15 keeps no layout flag: the page's shape says it is Free.
    expect(free).not.toHaveProperty("layout");
    expect(isFreePage(profile, free)).toBe(true);
    const canvas = free.placements[0].canvas!;
    expect(canvas.profile).toMatchObject({ Width: 1024, Height: 600, BackgroundColor: "#00000000" });
  });

  it("keeps every widget where the kiosk drew it, within 1 px, in placement order (acceptance 6)", () => {
    const items = itemsOf(free);
    expect(items.map((i) => (i.$?.widget ? i.$.widget.module : i.kind))).toEqual(["Clock", "Weather", PANEL_ID, "blank", "Group"]);
    for (const [i, id] of ["clock", "weather", "panel", "blank"].entries()) {
      const box = cellBox(profile, profile.pages[0].placements.find((p) => p.id === id)!);
      const it = items[i];
      expect(Math.abs((it.X as number) - box.left)).toBeLessThanOrEqual(1);
      expect(Math.abs((it.Y as number) - box.top)).toBeLessThanOrEqual(1);
      expect(Math.abs((it.Width as number) - box.width)).toBeLessThanOrEqual(1);
      expect(Math.abs((it.Height as number) - box.height)).toBeLessThanOrEqual(1);
    }
  });

  it("carries settings, design, follow, the panel, the export rule and the id; hidden stays hidden", () => {
    const [clock, weather, panel] = itemsOf(free);
    expect(clock.$?.widget).toEqual({ module: "Clock", id: "clock", settings: { face: "digital" }, design: { accent: "#ff0000" }, follow: { colors: false }, onInfoPanel: "snapshot" });
    expect(weather.Hidden).toBe(true);
    expect(panel.$?.widget?.panel).toMatchObject({ title: "Stats" });
  });

  it("turns a free area into a Group holding its items where they were drawn, bindings and files kept", () => {
    const group = itemsOf(free)[4];
    const area = profile.pages[0].placements[4];
    const box = cellBox(profile, area);
    expect(group).toMatchObject({ kind: "Group", Name: "Area", X: Math.round(box.left), Y: Math.round(box.top) });
    const kids = group.DisplayItems as StoredItem[];
    expect(kids.map((k) => k.Name)).toEqual(["CPU", "Logo", "Pair"]);
    expect(kids[0].$).toMatchObject({ key: "cpu.load", via: "exact" });
    expect(kids[1].X).toBe((group.X as number) + 40);
    expect(free.placements[0].canvas!.assets.map((a) => a.name)).toEqual(["logo.png"]);
    const open = openCanvas(free.placements[0].canvas);
    expect(open.keys).toContain("cpu.load");
  });

  it("joins two areas' files, a clashing name renamed with the item that uses it", () => {
    const p = screen();
    const page = { ...pageOf(p), placements: [...pageOf(p).placements.slice(0, 4), zone("a1", CANVAS_ID, 3, 2, 1, 1, { canvas: areaCanvas(100, 100) }), zone("a2", CANVAS_ID, 4, 2, 1, 1, { canvas: areaCanvas(100, 100, "logo.png", HASH_B) })] };
    const canvas = ok(toFree(p, page)).page.placements[0].canvas!;
    expect(canvas.assets.map((a) => [a.name, a.hash])).toEqual([["logo.png", HASH_A], ["logo_2.png", HASH_B]]);
    const second = canvas.items[5].DisplayItems as StoredItem[];
    expect(second[1].FilePath).toBe("logo_2.png");
  });

  it("is refused while a free area's canvas isn't loaded", () => {
    const p = screen();
    const { canvas: _c, ...unloaded } = p.pages[0].placements[4];
    const page = { ...p.pages[0], placements: [...p.pages[0].placements.slice(0, 4), { ...unloaded, canvasRef: "abc" }] };
    expect(toFree(p, page)).toEqual({ refused: NOT_LOADED });
  });

  it("maps a scrolling screen's padded, fixed-height rows through the kiosk's fit", () => {
    const p = screen({}, { fit: "scroll", width: 1920, height: 1080, cols: 4, rows: 3 });
    const page = { ...p.pages[0], placements: [zone("clock", "Clock", 2, 2, 1, 1)] };
    const free2 = ok(toFree(p, page)).page;
    const area = gridArea(p);
    const s = Math.min(area.width / 1920, area.height / 1080);
    const it = itemsOf(free2)[0];
    const box = cellBox(p, page.placements[0]);
    const drawn = { x: (area.width - 1920 * s) / 2 + (it.X as number) * s, w: (it.Width as number) * s };
    expect(Math.abs(drawn.x - box.left)).toBeLessThanOrEqual(1);
    expect(Math.abs(drawn.w - box.width)).toBeLessThanOrEqual(1);
  });
});

describe("Grid → Free → Grid", () => {
  it("gives the original placements back, boxes, settings and ids equal (acceptance 8)", () => {
    const profile = screen();
    const free = withPage(profile, ok(toFree(profile, pageOf(profile))).page);
    const back = ok(toGrid(free, pageOf(free)));
    expect(back.kept).toBe(0);
    const orig = pageOf(profile).placements;
    expect(back.page.placements.map(strip)).toEqual(orig.map(strip));
    expect(back.page.placements[4].canvas!.items).toEqual(orig[4].canvas!.items);
    expect(back.page.placements[4].canvas!.assets).toEqual(orig[4].canvas!.assets);
    expect(back.page.placements[4].canvas!.profile).toEqual(orig[4].canvas!.profile);
    expect(back.page).not.toHaveProperty("layout");
    expect(isFreePage(free, back.page)).toBe(false);
    expect(back.message).toBe("Page is now Grid. 4 widgets snapped to cells.");
  });

  it("survives an edit round trip of the Free page's canvas in between", () => {
    const profile = screen();
    const freePage = ok(toFree(profile, pageOf(profile))).page;
    const open = openCanvas(freePage.placements[0].canvas);
    const edited = storeItems(open.stored, open.profile, editItems(open));
    const free = withPage(profile, { ...freePage, placements: [{ ...freePage.placements[0], canvas: JSON.parse(JSON.stringify(edited)) }] });
    const back = ok(toGrid(free, pageOf(free)));
    expect(back.page.placements.map(strip)).toEqual(pageOf(profile).placements.map(strip));
    expect(back.page.placements[4].canvas!.items).toEqual(pageOf(profile).placements[4].canvas!.items);
  });

  it("restores a scaled free area untouched, and its edited items scaled back", () => {
    // The area's canvas is twice its box: the switch halves it, and notes it.
    const profile = screen();
    const box = cellBox(profile, pageOf(profile).placements[4]);
    const big = areaCanvas(Math.round(box.width * 2), Math.round(box.height * 2));
    const page = { ...pageOf(profile), placements: pageOf(profile).placements.map((p) => (p.id === "area" ? { ...p, canvas: big } : p)) };
    const sw = ok(toFree(profile, page));
    expect(sw.message).toContain("Area was resized to fit.");
    const group = itemsOf(sw.page)[4];
    expect((group.DisplayItems as StoredItem[])[1]).toMatchObject({ Width: 60, Scale: 50 });
    const free = withPage(profile, sw.page);
    expect(ok(toGrid(free, pageOf(free))).page.placements[4].canvas).toEqual(big);
    // Moved one item 2 px while Free: rebuilt from the items, scaled back up.
    const moved = { ...group, DisplayItems: (group.DisplayItems as StoredItem[]).map((k, i) => (i === 1 ? { ...k, X: (k.X as number) + 2 } : k)) };
    const edited = withPage(profile, { ...sw.page, placements: [{ ...sw.page.placements[0], canvas: { ...sw.page.placements[0].canvas!, items: [...itemsOf(sw.page).slice(0, 4), moved] } }] });
    const rebuilt = ok(toGrid(edited, pageOf(edited))).page.placements[4].canvas!;
    expect(rebuilt.items[1]).toMatchObject({ Name: "Logo", X: 44, Y: 50, Width: 60, Scale: 100 });
    expect(rebuilt.items[0].$).toMatchObject({ key: "cpu.load" });
  });
});

/** An imported profile's Free page: the canvas the screen's size with InfoPanel items and widgets as given. */
function freeScreen(items: DisplayItem[]): MonitorProfile {
  const base = newStored({ name: "Imported", width: 1024, height: 600, now: NOW });
  const { profile } = readStored(base);
  const canvas = { ...storeItems(base, { ...profile, BackgroundColor: "#FF112233" }, items), source: { name: "Imported", origin: "file" as const, importedAt: "" } };
  return {
    id: "s2", name: "Imported", width: 1024, height: 600, cols: 4, rows: 3, fit: "fill",
    pages: [{ id: "pg", name: "Main", placements: [zone("z", CANVAS_ID, 1, 1, 4, 3, { canvas })] }],
  };
}
const profileLook = readStored(newStored({ name: "x", width: 1, height: 1 })).profile;

describe("Free → Grid", () => {
  const clock = newWidgetItem({ module: "Clock", settings: { face: "digital" } }, { x: 0, y: 0, w: 250, h: 195 }, "Clock");
  const weather = newWidgetItem({ module: "Weather" }, { x: 262, y: 0, w: 500, h: 195 }, "Weather");

  it("snaps widgets to the nearest cells and makes no free area when nothing overlaps (acceptance 7)", () => {
    const p = freeScreen([clock, weather]);
    const r = ok(toGrid(p, pageOf(p)));
    expect(r.kept).toBe(0);
    expect(r.page.placements.map((z) => [z.module, z.colStart, z.rowStart, z.colSpan, z.rowSpan])).toEqual([
      ["Clock", 1, 1, 1, 1],
      ["Weather", 2, 1, 2, 1],
    ]);
    expect(r.page.placements[0].settings).toEqual({ face: "digital" });
    expect(r.message).toBe("Page is now Grid. 2 widgets snapped to cells.");
    // The page keeps its canvas's profile for the next switch to Free.
    expect(r.page.freeCanvas?.profile).toMatchObject({ BackgroundColor: "#FF112233" });
  });

  it("keeps overlapping widgets and every InfoPanel item together in exactly one free area (D3)", () => {
    const overlap = newWidgetItem({ module: "Weather" }, { x: 20, y: 10, w: 200, h: 150 }, "Weather");
    const text = { ...newItem("Text", profileLook), Name: "Note", X: 600, Y: 420 } as DisplayItem;
    const p = freeScreen([clock, overlap, text]);
    const r = ok(toGrid(p, pageOf(p)));
    const areas = r.page.placements.filter((z) => z.module === CANVAS_ID);
    expect(areas).toHaveLength(1);
    // The Clock is under the area's cells too, so it joins: every part is in it, nothing is dropped.
    const names = areas[0].canvas!.items.map((i) => i.Name);
    expect(names).toEqual(["Clock", "Weather", "Note"]);
    expect(r.kept).toBe(3);
    expect(r.message).toContain("3 parts stayed together in a free area.");
    expect(areas[0].settings?.[FROM_FREE_KEY]).toBeTypeOf("string");
  });

  it("keeps a locked or rotated widget in the free area, its lock and hidden flag kept", () => {
    const locked = { ...weather, IsLocked: true, Hidden: true } as DisplayItem;
    const p = freeScreen([clock, locked]);
    const r = ok(toGrid(p, pageOf(p)));
    const area = r.page.placements.find((z) => z.module === CANVAS_ID)!;
    expect(area.canvas!.items[0]).toMatchObject({ Name: "Weather", IsLocked: true, Hidden: true });
    expect(r.page.placements.find((z) => z.module === "Clock")).toBeDefined();
  });

  it("gives a duplicated widget's copy its own id", () => {
    const a = newWidgetItem({ module: "Clock", id: "c1" }, { x: 0, y: 0, w: 250, h: 195 }, "Clock");
    const b = newWidgetItem({ module: "Clock", id: "c1" }, { x: 524, y: 0, w: 250, h: 195 }, "Clock");
    const p = freeScreen([a, b]);
    const ids = ok(toGrid(p, pageOf(p))).page.placements.map((z) => z.id);
    expect(ids[0]).toBe("c1");
    expect(ids[1]).not.toBe("c1");
  });

  it("is refused while the canvas isn't loaded", () => {
    const p = freeScreen([clock]);
    const { canvas: _c, ...unloaded } = p.pages[0].placements[0];
    expect(toGrid(p, { ...p.pages[0], placements: [{ ...unloaded, canvasRef: "abc" }] })).toEqual({ refused: NOT_LOADED });
  });
});

describe("Free → Grid → Free", () => {
  it("keeps every item, binding, group, lock and hidden flag, and the profile (with a widget left on the grid)", () => {
    const text = { ...newItem("Sensor", profileLook), Name: "CPU", X: 600, Y: 420, $import: { key: "cpu.load", via: "exact" } } as unknown as DisplayItem;
    const hidden = { ...newItem("Text", profileLook), Name: "Off", X: 700, Y: 450, Hidden: true, IsLocked: true } as DisplayItem;
    const group = { ...defaultItem("Group"), Name: "G", X: 620, Y: 500, DisplayItems: [{ ...newItem("Text", profileLook), X: 620, Y: 500 }] } as DisplayItem;
    const clock = newWidgetItem({ module: "Clock", id: "c1", onInfoPanel: "leave" }, { x: 0, y: 0, w: 250, h: 195 }, "Clock");
    const p = freeScreen([clock, text, hidden, group]);
    const grid = withPage(p, ok(toGrid(p, pageOf(p))).page);
    expect(pageOf(grid).placements.find((z) => z.module === "Clock")?.settings).toEqual({ $onInfoPanel: "leave" });
    const again = ok(toFree(grid, pageOf(grid), () => "Clock")).page;
    const before = p.pages[0].placements[0].canvas!;
    const after = again.placements[0].canvas!;
    // The loose parts come back unwrapped, where they were; the widget at its cell box, its rule back on it.
    expect(after.items.slice(1)).toEqual(before.items.slice(1));
    expect(after.items[0].$?.widget).toEqual({ module: "Clock", id: "c1", onInfoPanel: "leave" });
    expect(after.profile).toEqual(before.profile);
    expect(after.assets).toEqual(before.assets);
    expect(again.freeCanvas).toBeUndefined();
  });
});

describe("free pages follow their screen", () => {
  const p = freeScreen([{ ...newItem("Text", profileLook), X: 30, Y: 40 } as DisplayItem]);

  it("span a changed grid and take a new size with every item kept (Keep positions)", () => {
    const next = fitFreePages(p, { ...p, cols: 6, width: 1280 });
    expect(next.pages[0].placements[0]).toMatchObject({ colSpan: 6, rowSpan: 3 });
    expect(next.pages[0].placements[0].canvas!.profile).toMatchObject({ Width: 1280, Height: 600 });
    expect(next.pages[0].placements[0].canvas!.items[0]).toMatchObject({ X: 30, Y: 40 });
    expect(isFreePage(next, next.pages[0])).toBe(true);
  });

  it("leave the profile as it is when neither size nor grid changed", () => {
    const same = { ...p, name: "Renamed" };
    expect(fitFreePages(p, same)).toBe(same);
  });

  it("scale their contents when asked", () => {
    const grown = fitFreePages(p, { ...p, width: 2048, height: 1200 });
    const scaled = scaleFreePages(grown, { width: 1024, height: 600 });
    expect(scaled.pages[0].placements[0].canvas!.items[0]).toMatchObject({ X: 60, Y: 80 });
  });

  it("resize the screen when the editor resizes the Free page's canvas", () => {
    const config = { profiles: [p] } as unknown as Parameters<typeof withFreeCanvas>[0];
    const canvas = p.pages[0].placements[0].canvas!;
    const next = withFreeCanvas(config, "z", { ...canvas, profile: { ...canvas.profile, Width: 800, Height: 480 } });
    expect(next.profiles[0]).toMatchObject({ width: 800, height: 480 });
  });
});

describe("switchLayout", () => {
  it("changes the one page in one config change, and refuses a page that is gone", () => {
    const profile = screen();
    const config = { profiles: [profile, { ...profile, id: "other" }] } as unknown as Parameters<typeof switchLayout>[0];
    const r = switchLayout(config, "s1", "pg", "free");
    if ("refused" in r) throw new Error(r.refused);
    expect(isFreePage(r.config.profiles[0], r.config.profiles[0].pages[0])).toBe(true);
    expect(r.config.profiles[1]).toBe(config.profiles[1]);
    expect(switchLayout(config, "s1", "nope", "free")).toEqual({ refused: "That page is gone." });
  });
});

describe("the area record", () => {
  it("survives the stored form only on a Group", () => {
    const profile = screen();
    const free = ok(toFree(profile, pageOf(profile))).page;
    const read = readStored(JSON.parse(JSON.stringify(free.placements[0].canvas)));
    expect((read.items[4] as unknown as { area?: unknown }).area).toBeDefined();
    const text = encodeItem(newItem("Text", profileLook), () => null);
    const bad = readStored({ ...newStored({ name: "x", width: 10, height: 10 }), items: [{ ...text, $: { area: { zone: {}, canvas: {}, w: 1, h: 1, k: 1 } } }] });
    expect(bad.issues.some((i) => i.field === "$.area")).toBe(true);
  });
});

describe("Grid → Free with item placements (v15)", () => {
  it("puts each item on the canvas at its screen pixels, hidden and locked kept, never as a widget", () => {
    const profile = screen();
    const text = encodeItem({ ...newItem("Text", profileLook), Name: "Title" } as DisplayItem, () => null);
    const items: Placement[] = [
      zone("t", ITEM_ID, 1, 1, 1, 1, { item: text, px: { x: 40, y: 30, w: 100, h: 20 }, locked: true }),
      zone("h", ITEM_ID, 2, 2, 1, 1, { item: { ...text, Name: "Hidden" }, visible: false }),
    ];
    const page = { ...pageOf(profile), placements: [...pageOf(profile).placements, ...items] };
    const canvasItems = itemsOf(ok(toFree(profile, page)).page);
    const title = canvasItems.find((i) => i.Name === "Title")!;
    // The screen's kiosk padding is 0 here and the canvas fills the grid 1:1, so screen px are canvas px.
    expect(title).toMatchObject({ kind: "Text", X: 40, Y: 30, IsLocked: true });
    expect(title.$?.widget).toBeUndefined();
    const hidden = canvasItems.find((i) => i.Name === "Hidden")!;
    expect(hidden.Hidden).toBe(true);
    const box = cellBox(profile, items[1]);
    expect([hidden.X, hidden.Y]).toEqual([Math.round(box.left), Math.round(box.top)]);
  });
});
