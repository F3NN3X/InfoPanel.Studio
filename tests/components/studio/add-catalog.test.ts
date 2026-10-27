import { describe, expect, it } from "vitest";
import { BLANK_MODULE } from "@/lib/layout";
import type { UserPanelPreset } from "@/lib/panel-model";
import { addCatalog, addGroups, categoriesOf, firstSentence, sameDrop, searchItems, type AddItem } from "@/components/studio/add-catalog";

const catalog = addCatalog();
const names = (list: AddItem[]) => list.map((i) => i.name);

describe("addCatalog", () => {
  it("gives every widget a one-line blurb of at most 44 characters, a default size and a min size", () => {
    for (const w of catalog.widget) {
      expect(w.blurb, w.id).not.toBe("");
      expect(w.blurb.length, w.id).toBeLessThanOrEqual(44);
      expect(w.blurb.endsWith("."), w.id).toBe(false);
      expect(w.w >= w.mw && w.h >= w.mh, w.id).toBe(true);
    }
  });

  it("takes the widget's own blurb and size", () => {
    expect(catalog.widget.find((w) => w.id === "CpuMonitor")).toMatchObject({
      blurb: "Load, clocks, temperature and power",
      w: 3,
      h: 2,
      mw: 1,
      mh: 1,
    });
  });

  it("lists a widget with views once per view: the first as the widget itself, the others added with their settings", () => {
    const rows = catalog.widget.filter((w) => w.drop.id === "Weather");
    expect(rows.map((w) => [w.id, w.name])).toEqual([
      ["Weather", "Weather"],
      ["Weather:now", "Weather · Now"],
      ["Weather:forecast", "Weather · Forecast"],
      ["Weather:minimal", "Weather · Minimal"],
      ["Weather:glance", "Weather · Glance"],
      ["Weather:week", "Weather · Week"],
    ]);
    expect(rows[0].drop).toEqual({ kind: "module", id: "Weather" });
    expect(rows[3]).toMatchObject({ category: "Info", icon: rows[0].icon, w: 3, h: 2, blurb: "Temperature and conditions only" });
    expect(rows[3].drop).toEqual({ kind: "module", id: "Weather", settings: { view: "minimal", showForecast: false, showStats: false, showFeels: false } });
  });

  it("stores a view under the widget's own key and takes the view's size", () => {
    const ticker = catalog.widget.find((w) => w.id === "GameSpotlight:ticker")!;
    expect(ticker).toMatchObject({ name: "Game Spotlight · Ticker", w: 4, h: 1, mw: 1, mh: 1 });
    expect(ticker.drop.settings).toEqual({ spotlightLayout: "ticker" });
  });

  it("lists a widget without views, or with one, once", () => {
    expect(catalog.widget.filter((w) => w.drop.id === "CpuMonitor").map((w) => w.id)).toEqual(["CpuMonitor"]);
    expect(catalog.widget.filter((w) => w.drop.id === "KpiTiles").map((w) => w.id)).toEqual(["KpiTiles"]);
  });

  it("tells a widget's views apart by their settings", () => {
    const [full, now] = catalog.widget.filter((w) => w.drop.id === "Weather");
    expect(sameDrop(full.drop, { kind: "module", id: "Weather" })).toBe(true);
    expect(sameDrop(now.drop, { kind: "module", id: "Weather" })).toBe(false);
    expect(sameDrop(now.drop, { ...now.drop, settings: { ...now.drop.settings } })).toBe(true);
  });

  it("splits panels into My panels and presets, and layouts into Blank space and starters", () => {
    const saved: UserPanelPreset = {
      id: "mine",
      name: "Session",
      panel: { id: "p", title: "Session", widgets: [{ id: "w1", kind: "stat", label: "Session", visible: true }, { id: "w2", kind: "value", label: "Avg", visible: true }] },
    } as UserPanelPreset;
    const withSaved = addCatalog([saved]);
    expect(withSaved.panel[0]).toMatchObject({ id: "mine", category: "My panels", saved: true, blurb: "Session, Avg" });
    expect(withSaved.panel.slice(1).every((p) => p.category === "Panel presets")).toBe(true);
    expect(withSaved.layout[0]).toMatchObject({ id: BLANK_MODULE, category: "Empty" });
    expect(withSaved.layout.slice(1).every((l) => l.category === "Layout starters" && l.id.startsWith("layout-"))).toBe(true);
  });
});

describe("firstSentence", () => {
  it("is the description up to its first full stop, without it", () => {
    expect(firstSentence("Time since boot. More here.")).toBe("Time since boot");
    expect(firstSentence("No stop at all")).toBe("No stop at all");
    expect(firstSentence(undefined)).toBe("");
  });
});

describe("searchItems", () => {
  it("needs every word and ranks name matches first", () => {
    const hits = names(searchItems(catalog.widget, "gpu vram"));
    expect(hits.slice(0, 2).sort()).toEqual(["GPU Monitor", "GPU Rings"]);
    expect(hits).toContain("System Overview");
  });

  it("matches tags and keeps catalog order within a rank", () => {
    const hits = searchItems(catalog.widget, "temp").map((i) => i.id);
    expect(hits).toEqual(expect.arrayContaining(["Thermals", "CpuMonitor", "GpuRings", "GpuMonitor", "StorageHealth", "Weather"]));
    const ranked = hits.filter((id) => ["CpuMonitor", "GpuRings", "GpuMonitor"].includes(id));
    expect(ranked).toEqual(["CpuMonitor", "GpuRings", "GpuMonitor"]);
  });

  it("finds nothing for nonsense", () => {
    expect(searchItems(catalog.widget, "zzz")).toEqual([]);
  });
});

describe("addGroups", () => {
  it("puts Recent first under All, and drops ids that no longer exist", () => {
    const groups = addGroups("widget", catalog.widget, { query: "", category: "All", recent: ["Clock", "gone"] });
    expect(groups[0]).toMatchObject({ title: "Recent", items: [expect.objectContaining({ id: "Clock" })] });
    expect(groups.slice(1).map((g) => g.title)).toEqual(categoriesOf(catalog.widget));
  });

  it("shows one category, or one Best matches group while searching (ignoring the category)", () => {
    expect(addGroups("widget", catalog.widget, { query: "", category: "Audio", recent: [] }).map((g) => g.title)).toEqual(["Audio"]);
    const search = addGroups("widget", catalog.widget, { query: "clock", category: "Audio", recent: ["Clock"] });
    expect(search.map((g) => g.title)).toEqual(["Best matches"]);
  });

  it("orders the chips as the spec does, unknown categories before Generic", () => {
    const fake = [{ category: "Generic" }, { category: "Zeta" }, { category: "Audio" }, { category: "System" }] as AddItem[];
    expect(categoriesOf(fake)).toEqual(["System", "Audio", "Zeta", "Generic"]);
  });
});
