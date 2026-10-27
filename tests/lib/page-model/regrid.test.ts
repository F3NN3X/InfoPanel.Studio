// Columns × rows from the page inspector (Edit v3 SPEC §10.1, decision Q5; acceptance 10 and 11): parts on cells
// reflow with the grid, parts placed freely keep their pixels, an imported profile's own items never move, and a grid
// a widget wouldn't fit in is refused with one message naming every such widget.
import { describe, expect, it } from "vitest";
import { importAsProfile } from "@/components/studio/import-actions";
import { encodeItem, newStored, type StoredCanvas, type StoredItem } from "@/lib/infopanel/import/stored";
import { newWidgetItem } from "@/lib/infopanel/native/widget-item";
import { defaultItem, type DisplayItem } from "@/lib/infopanel/schema";
import { defaultConfig, ITEM_ID, type MonitorProfile, type Placement } from "@/lib/layout";
import { canvasGrid } from "@/lib/page-model/canvas-adapter";
import { cellRect } from "@/lib/page-model/model";
import { nameList, regrid } from "@/lib/page-model/regrid";

const zone = (id: string, col: number, row: number, cols: number, rows: number, extra: Partial<Placement> = {}): Placement => ({
  id, module: "Clock", colStart: col, rowStart: row, colSpan: cols, rowSpan: rows, visible: true, ...extra,
});
const names: Record<string, string> = { cpu: "CPU gauge", weather: "Weather", clock: "Clock" };
const nameOf = (p: Placement) => names[p.id] ?? p.id;

const screen: MonitorProfile = {
  id: "s", name: "Desk", width: 1024, height: 600, cols: 4, rows: 3, fit: "fill",
  pages: [
    {
      id: "main", name: "Main",
      placements: [
        zone("cpu", 1, 1, 2, 2),
        zone("weather", 3, 3, 2, 1),
        zone("onCells", 4, 1, 1, 1, { module: ITEM_ID, item: { kind: "Text", Name: "On cells", unknown: {} } as StoredItem }),
        zone("free", 1, 1, 1, 1, { module: ITEM_ID, px: { x: 700, y: 20, w: 100, h: 30 }, item: { kind: "Text", Name: "Free", unknown: {} } as StoredItem }),
      ],
    },
    { id: "stats", name: "Stats", placements: [zone("clock", 2, 2, 1, 1)] },
  ],
};

describe("regrid on a screen", () => {
  it("names every widget that wouldn't fit, on any page, and changes nothing", () => {
    expect(regrid(screen, 2, 1, nameOf)).toEqual({ refused: "CPU gauge, Weather and Clock don't fit in 2 × 1. Make room first." });
    expect(regrid(screen, 4, 2, nameOf)).toEqual({ refused: "Weather doesn't fit in 4 × 2. Make room first." });
  });

  it("grows or shrinks around the widgets: widgets keep their cells, items on cells stay inside, items placed freely keep their pixels", () => {
    const r = regrid(screen, 6, 4, nameOf);
    if (!("profile" in r)) throw new Error(r.refused);
    expect([r.profile.cols, r.profile.rows]).toEqual([6, 4]);
    expect(r.profile.pages).toEqual(screen.pages);
    const shrunk = regrid({ ...screen, pages: [{ ...screen.pages[0], placements: screen.pages[0].placements.filter((p) => p.id !== "weather") }, screen.pages[1]] }, 3, 3, nameOf);
    if (!("profile" in shrunk)) throw new Error(shrunk.refused);
    const [, onCells, free] = shrunk.profile.pages[0].placements;
    expect([onCells.colStart, onCells.colSpan]).toEqual([3, 1]);
    expect(free).toBe(screen.pages[0].placements[3]);
  });

  it("keeps the limits Screens keeps, and the same profile when nothing changes", () => {
    expect(regrid(screen, 4, 3, nameOf)).toEqual({ profile: screen });
    const r = regrid(screen, 40, 3, nameOf);
    expect("profile" in r && r.profile.cols).toBe(24);
  });

  it("lists names as a sentence", () => {
    expect(nameList(["A", "B", "C"])).toBe("A, B and C");
  });
});

describe("regrid on an imported profile", () => {
  const imported = (): { profile: MonitorProfile; canvas: StoredCanvas } => {
    const base = newStored({ name: "Rig", width: 800, height: 480 });
    const grid = canvasGrid({ cols: 8, rows: 5, gap: 0, padding: 0, fit: "fill" }, base);
    const cell = { col: 7, row: 5, cols: 2, rows: 1 };
    const enc = (it: DisplayItem) => encodeItem(it, () => null);
    const items = [
      enc({ ...defaultItem("Text"), Name: "Title", X: 33, Y: 17 } as DisplayItem),
      enc(newWidgetItem({ module: "Weather", cell }, cellRect(grid, cell), "Weather") as DisplayItem),
      { ...enc({ ...defaultItem("Sensor"), Name: "CPU temp", X: 100, Y: 96, Width: 100, Height: 96 } as DisplayItem), $: { cell: { col: 2, row: 2, cols: 1, rows: 1 } } } as StoredItem,
    ];
    const canvas = { ...base, source: { ...base.source, origin: "file" }, items } as StoredCanvas;
    const made = importAsProfile(defaultConfig(), canvas, "Rig", { width: 800, height: 480 });
    return { profile: made.config.profiles.find((p) => p.id === made.profileId)!, canvas };
  };

  it("keeps every imported item's X / Y / W / H, reflows the widget and the item on cells, and spans the canvas over the new grid", () => {
    const { profile, canvas } = imported();
    const r = regrid(profile, 10, 6, nameOf);
    if (!("profile" in r)) throw new Error(r.refused);
    const zoneOut = r.profile.pages[0].placements[0];
    expect([zoneOut.colSpan, zoneOut.rowSpan]).toEqual([10, 6]);
    const [title, weather, cpu] = zoneOut.canvas!.items;
    expect(title).toBe(canvas.items[0]);
    expect(weather).toMatchObject({ X: 480, Y: 320, Width: 160, Height: 80 });
    expect(cpu).toMatchObject({ X: 80, Y: 80, Width: 80, Height: 80 });
  });

  it("refuses a grid the widget item wouldn't fit in", () => {
    expect(regrid(imported().profile, 6, 5, nameOf)).toEqual({ refused: "Weather doesn't fit in 6 × 5. Make room first." });
  });
});
