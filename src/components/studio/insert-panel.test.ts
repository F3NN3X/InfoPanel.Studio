import { describe, expect, it } from "vitest";
import { CARDS_ID } from "@/lib/layout";
import { filterInsertables, insertDropSize, insertables, type Insertable } from "./insert-panel";

const item = (
  id: string,
  title: string,
  category: Insertable["category"],
  description?: string
): Insertable => ({ kind: "module", id, title, description, cols: 2, rows: 1, category });

const items = [
  item("SystemOverview", "System Overview", "System"),
  item("NowPlaying", "Now Playing", "Media"),
  item("NetworkThroughput", "Network", "Network"),
  item("clock", "Clock", "Info", "Time and date with a system clock"),
];

const ids = (list: Insertable[]) => list.map((i) => i.id);

describe("filterInsertables", () => {
  it("returns everything for an empty query and All", () => {
    expect(ids(filterInsertables(items, "", "All"))).toEqual(ids(items));
    expect(ids(filterInsertables(items, "   ", "All"))).toEqual(ids(items));
  });

  it("matches title, id and description case-insensitively", () => {
    expect(ids(filterInsertables(items, "SYS", "All"))).toEqual(["SystemOverview", "clock"]);
    expect(ids(filterInsertables(items, "nowplay", "All"))).toEqual(["NowPlaying"]);
  });

});

describe("insertables", () => {
  const INSERTABLES = insertables();

  it("lists widgets (including Other sensors) and panel presets", () => {
    const cards = INSERTABLES.find((i) => i.id === CARDS_ID);
    expect(cards).toMatchObject({ kind: "module", title: "Other sensors", category: "Generic" });
    expect(INSERTABLES.some((i) => i.kind === "panel")).toBe(true);
  });

});

describe("insertables with saved panels", () => {
  const saved = {
    id: "panelpreset-1",
    name: "Desk stats",
    colSpan: 3,
    rowSpan: 2,
    panel: { id: "pd", title: "Stats", titleVisible: true, visible: true, background: "panel" as const, widgets: [] },
  };
  const list = insertables([saved]);

  it("files saved panels under My panels and the starters under Layouts", () => {
    expect(list.find((i) => i.id === "panelpreset-1")).toMatchObject({
      kind: "panel",
      title: "Desk stats",
      category: "My panels",
      cols: 3,
      rows: 2,
    });
    expect(list.filter((i) => i.category === "Layouts").map((i) => i.title)).toEqual([
      "Blank zone",
      "Row of stats",
      "2×2 stats",
      "Hero overlay",
      "Gauge row",
      "Clock + date",
      "Label / value list",
    ]);
    expect(list.find((i) => i.id === "cpu")?.category).toBe("System");
  });

});

describe("insertDropSize", () => {
  const grid = { cols: 12, rows: 6 };

  it("drops a widget at its declared default size, never below its minimum", () => {
    const tpl: Insertable = { ...item("t", "T", "System"), cols: 3, rows: 2, defaultSize: [4, 3] };
    expect(insertDropSize(tpl, grid)).toEqual({ cols: 4, rows: 3 });
    expect(insertDropSize({ ...tpl, defaultSize: [2, 1] }, grid)).toEqual({ cols: 3, rows: 2 });
    expect(insertDropSize(tpl, { cols: 3, rows: 2 })).toEqual({ cols: 3, rows: 2 });
  });

});

