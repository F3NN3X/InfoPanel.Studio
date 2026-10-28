// The Add panel's tiles (Edit v3 SPEC §9.2–§9.4, acceptance 19): the sections and their order for each Made for, the
// status sort, Recently used, the segment and chip filters, the flat search, and the arrow keys across the grid.
import { describe, expect, it } from "vitest";
import { addCatalog } from "@/components/studio/add-catalog";
import { addSections, chipsFor, ELEMENT_TILES, ITEM_TILES, moveInGrid, partKey, searchTiles, tileRows, widgetTile, type AddTile, type SectionOptions, type TileStatus } from "@/components/studio/add-tiles";
import { cardCategory, cardDescription, cardSize } from "@/components/studio/add-tile-card";
import { PALETTE } from "@/lib/infopanel/editor/palette-entries";
import { ELEMENTS } from "@/lib/infopanel/elements/entries";

const catalog = addCatalog();
const widgets = catalog.widget.map(widgetTile);
const base: SectionOptions = { widgets, items: ITEM_TILES, elements: ELEMENT_TILES, segment: "all", chip: "All", query: "", recent: [], infoPanel: false };
const titles = (o: Partial<SectionOptions>) => addSections({ ...base, ...o }).map((s) => s.title);
const tile = (key: string) => [...widgets, ...ITEM_TILES, ...ELEMENT_TILES].find((t) => t.key === key)!;

describe("Add sections", () => {
  it("lists Studio widgets first on a screen for Studio panels, InfoPanel items first when made for InfoPanel", () => {
    expect(titles({})).toEqual(["STUDIO WIDGETS", "INFOPANEL ITEMS", "ELEMENTS"]);
    expect(titles({ infoPanel: true })).toEqual(["INFOPANEL ITEMS", "ELEMENTS", "STUDIO WIDGETS"]);
  });

  it("counts every tile of a kind and groups items by Text, Data, Media and Layout", () => {
    const [w, i, e] = addSections(base);
    expect([w.count, i.count, e.count]).toEqual([widgets.length, PALETTE.length, ELEMENTS.length]);
    expect(i.groups.map((g) => [g.sub, g.tiles.map((t) => t.name)])).toEqual([
      ["Text", ["Text", "Value", "Clock", "Calendar"]],
      ["Data", ["Table", "Bar", "Graph", "Donut", "Gauge"]],
      ["Media", ["Image", "Web image", "Sensor image"]],
      ["Layout", ["Shape", "Group"]],
    ]);
    expect(e.groups.map((g) => g.sub)).toEqual([null]);
    expect(w.groups.every((g) => g.sub !== null && g.tiles.every((t) => t.category === g.sub))).toBe(true);
  });

  it("sorts each category by status when made for InfoPanel, keeping curated order within a status", () => {
    const rank: Record<TileStatus, number> = { ok: 0, approx: 1, pic: 2, out: 3 };
    // Every other widget left out, so the sort shows against the curated order.
    const status = (t: AddTile): TileStatus => (t.kind !== "widget" ? "ok" : (["pic", "out", "ok", "approx"] as const)[widgets.indexOf(t) % 4]);
    const [, , w] = addSections({ ...base, infoPanel: true, status });
    for (const g of w.groups) {
      const ranks = g.tiles.map((t) => rank[status(t)]);
      expect(ranks).toEqual([...ranks].sort((a, b) => a - b));
      for (const r of [0, 1, 2, 3]) {
        const same = g.tiles.filter((t) => rank[status(t)] === r).map((t) => widgets.indexOf(t));
        expect(same).toEqual([...same].sort((a, b) => a - b));
      }
    }
    // Not made for InfoPanel: curated order, whatever the statuses.
    const [plain] = addSections({ ...base, status });
    expect(plain.groups[0].tiles.map((t) => widgets.indexOf(t))).toEqual([...plain.groups[0].tiles.map((t) => widgets.indexOf(t))].sort((a, b) => a - b));
  });

  it("puts up to four Recently used tiles of any kind first, hidden when none, while searching or on a chip", () => {
    const recent = [widgets[0].key, partKey("Text"), partKey("element:ring"), widgets[1].key, widgets[2].key];
    const [r] = addSections({ ...base, recent });
    expect(r.title).toBe("RECENTLY USED");
    expect(r.groups[0].tiles.map((t) => t.key)).toEqual(recent.slice(0, 4));
    expect(titles({ recent: [] })[0]).toBe("STUDIO WIDGETS");
    expect(titles({ recent, query: "clock" })).toEqual([null]);
    expect(titles({ recent, chip: widgets[0].category })[0]).toBe("STUDIO WIDGETS");
    // The Widgets segment keeps only the widgets of it.
    expect(addSections({ ...base, recent, segment: "widgets" })[0].groups[0].tiles.map((t) => t.kind)).toEqual(["widget", "widget", "widget"]);
  });

  it("shows only Studio widgets on the Widgets segment, items and elements on the InfoPanel items one", () => {
    expect(titles({ segment: "widgets" })).toEqual(["STUDIO WIDGETS"]);
    expect(titles({ segment: "items" })).toEqual(["INFOPANEL ITEMS", "ELEMENTS"]);
  });

  it("offers widget categories as chips, or the item groups and Elements on the InfoPanel items segment", () => {
    expect(chipsFor("items", catalog.widget)).toEqual(["All", "Text", "Data", "Media", "Layout", "Elements"]);
    expect(chipsFor("all", catalog.widget)[0]).toBe("All");
    expect(chipsFor("all", catalog.widget)).toContain("System");
    expect(addSections({ ...base, segment: "items", chip: "Media" }).flatMap((s) => s.groups.flatMap((g) => g.tiles.map((t) => t.name)))).toEqual(["Image", "Web image", "Sensor image"]);
    expect(titles({ segment: "items", chip: "Elements" })).toEqual(["ELEMENTS"]);
  });

  it("leaves out InfoPanel items where the page takes none", () => {
    expect(titles({ items: [], elements: [] })).toEqual(["STUDIO WIDGETS"]);
  });
});

describe("Add search", () => {
  it("is one flat list ranked name prefix, then word prefix, then any other match", () => {
    const pool = [
      { ...tile(partKey("Text")), name: "A big clock", description: "x" },
      { ...tile(partKey("Text")), key: "b", name: "Clock face", description: "x" },
      { ...tile(partKey("Text")), key: "c", name: "Timer", description: "Like a clock" },
      { ...tile(partKey("Text")), key: "d", name: "Gauge", description: "x" },
    ];
    expect(searchTiles(pool, "clock").map((t) => t.name)).toEqual(["Clock face", "A big clock", "Timer"]);
    const [s] = addSections({ ...base, query: "graph" });
    expect(s.title).toBeNull();
    expect(s.groups).toHaveLength(1);
    expect(s.groups[0].tiles.some((t) => t.kind === "item")).toBe(true);
  });

  it("finds nothing for a query no tile holds", () => {
    expect(addSections({ ...base, query: "zzzz-none" })).toEqual([]);
  });
});

describe("Arrow keys across the tiles", () => {
  // Three groups: Text's four tiles (rows of 3 and 1), Data's one, then four elements (3 and 1).
  const sections = addSections({ ...base, widgets: [], items: ITEM_TILES.slice(0, 5), elements: ELEMENT_TILES.slice(0, 4), segment: "items" });
  const { rows, tiles } = tileRows(sections, 3);

  it("wraps each group's tiles into rows of the grid's columns", () => {
    expect(rows.map((r) => r.length)).toEqual([3, 1, 1, 3, 1]);
    expect(tiles).toHaveLength(9);
  });

  it("moves left and right through the list, up and down to the same column or the shorter row's last tile", () => {
    expect(moveInGrid(rows, null, "ArrowDown")).toBe(0);
    expect(moveInGrid(rows, null, "ArrowUp")).toBe(8);
    expect(moveInGrid(rows, 2, "ArrowRight")).toBe(3);
    expect(moveInGrid(rows, 0, "ArrowLeft")).toBe(0);
    expect(moveInGrid(rows, 2, "ArrowDown")).toBe(3);
    expect(moveInGrid(rows, 3, "ArrowUp")).toBe(0);
    expect(moveInGrid(rows, 4, "ArrowDown")).toBe(5);
    expect(moveInGrid(rows, 8, "ArrowDown")).toBe(8);
  });
});

describe("The details card", () => {
  it("names the kind and adds the kind's sentence (§9.5)", () => {
    const weather = widgets.find((t) => t.key === "Weather")!;
    expect(cardCategory(weather)).toBe("Info · Studio widget");
    expect(cardDescription(weather)).toMatch(/\. Always sits on the grid; uses your theme, colors and fonts\.$/);
    expect(cardCategory(tile(partKey("Bar")))).toBe("InfoPanel item · Data");
    expect(cardDescription(tile(partKey("Bar")))).toBe("A reading as a filled bar. Snaps to cells; hold Alt to place it freely, even on top of widgets.");
    expect(cardCategory(tile(partKey("element:glow")))).toBe("Element");
  });

  it("shows a widget's size and what it adapts to, else any size", () => {
    const weather = widgets.find((t) => t.key === "Weather")!;
    expect(cardSize(weather).chip).toMatch(/^\d+×\d+$/);
    expect(cardSize(tile(partKey("Text")))).toEqual({ chip: "any size", note: "InfoPanel item" });
    expect(cardSize(tile(partKey("element:card")))).toEqual({ chip: "any size", note: "Studio element" });
  });
});
