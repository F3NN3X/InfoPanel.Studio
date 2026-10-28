import { describe, expect, it } from "vitest";
import { mergeConfig, newProfile, type Placement, type StoredProfile } from "@/lib/layout";
import { mainPage, pageOf } from "@/lib/pages";

const zone = (id: string, extra: Partial<Placement> = {}): Placement => ({
  id,
  module: "SystemOverview",
  colStart: 1,
  rowStart: 1,
  colSpan: 4,
  rowSpan: 1,
  visible: true,
  ...extra,
});

const base = { id: "mine", name: "Mine", width: 1920, height: 550, cols: 12, rows: 2, fit: "fill" as const };
const mergeOne = (p: StoredProfile) => mergeConfig({ profiles: [p] }).profiles.find((x) => x.id === p.id)!;

describe("mergeConfig pages migration", () => {
  it("wraps a v2 profile's placements into one Main page, keeping every zone as it was", () => {
    const zones = [
      zone("a", { colStart: 1, settings: { accent: "#ff0000" }, design: { accent: "#00ff00" } }),
      zone("b", { colStart: 5, rowStart: 2, colSpan: 3, rowSpan: 1, follow: { colors: false } }),
    ];
    const merged = mergeOne({ ...base, placements: zones });
    expect(merged.pages).toHaveLength(1);
    expect(merged.pages[0]).toMatchObject({ id: "main", name: "Main" });
    // v6: the own accent won before, so its section is custom.
    expect(merged.pages[0].placements).toEqual([{ ...zones[0], follow: { colors: false } }, zones[1]]);
    expect(merged).not.toHaveProperty("placements");
  });

  it("flows a v1 profile (no boxes, no rows) into the first page", () => {
    const { rows: _rows, ...noRows } = base;
    const merged = mergeOne({
      ...noRows,
      placements: [
        { id: "a", module: "SystemOverview", colSpan: 6, visible: true },
        { id: "b", module: "SystemOverview", colSpan: 6, visible: true },
        { id: "c", module: "SystemOverview", colSpan: 6, visible: true },
      ],
    } as unknown as StoredProfile);
    const [a, b, c] = merged.pages[0].placements;
    expect([a.colStart, a.rowStart]).toEqual([1, 1]);
    expect([b.colStart, b.rowStart]).toEqual([7, 1]);
    expect([c.colStart, c.rowStart]).toEqual([1, 2]);
    expect(merged.rows).toBe(4);
  });

  it("keeps a v3 profile's pages and normalises each one", () => {
    const merged = mergeOne({
      ...base,
      pages: [
        { id: "x", name: "X", icon: "Home", placements: [zone("x1", { colStart: 99, colSpan: 99 })] },
        { id: "y", name: "Y", placements: [zone("y1")] },
      ],
    });
    expect(merged.pages.map((p) => p.id)).toEqual(["x", "y"]);
    expect(merged.pages[0].icon).toBe("Home");
    expect(merged.pages[0].placements[0]).toMatchObject({ colStart: 12, colSpan: 1 });
    expect(merged.pages[1].placements[0].id).toBe("y1");
  });

  it("gives a profile with neither one empty Main page", () => {
    expect(mergeOne({ ...base }).pages).toEqual([mainPage()]);
  });

  it("treats an empty pages array like no pages, falling back to legacy zones", () => {
    expect(mergeOne({ ...base, pages: [] }).pages).toEqual([mainPage()]);
    expect(mergeOne({ ...base, pages: [], placements: [zone("a")] }).pages[0].placements.map((p) => p.id)).toEqual(["a"]);
  });

  it("repairs missing and duplicate page ids and missing names", () => {
    const merged = mergeOne({
      ...base,
      pages: [
        { id: "p", name: "One", placements: [] },
        { id: "p", name: "", placements: [] },
        { name: "No id", placements: [] },
      ],
    } as unknown as StoredProfile);
    const ids = merged.pages.map((p) => p.id);
    expect(ids[0]).toBe("p");
    expect(new Set(ids).size).toBe(3);
    expect(merged.pages.map((p) => p.name)).toEqual(["One", "Page 2", "No id"]);
  });

  it("clamps rotate and filters its pages to existing ids", () => {
    const merged = mergeOne({
      ...base,
      pages: [
        { id: "a", name: "A", placements: [] },
        { id: "b", name: "B", placements: [] },
      ],
      rotate: { enabled: true, seconds: 1, pages: ["b", "gone"] },
    });
    expect(merged.rotate).toEqual({ enabled: true, seconds: 3, pages: ["b"] });
    expect(mergeOne({ ...base }).rotate).toBeUndefined();
  });

  it("stamps the current version and is stable when merged again", () => {
    const once = mergeConfig({ version: 2, profiles: [{ ...base, placements: [zone("a")] }] });
    expect(once.version).toBe(16);
    expect(mergeConfig(JSON.parse(JSON.stringify(once)))).toEqual(JSON.parse(JSON.stringify(once)));
  });

  it("emits pages from the default profile and new profiles", () => {
    const config = mergeConfig({});
    for (const p of config.profiles) {
      expect(p.pages.length).toBeGreaterThan(0);
      expect(p).not.toHaveProperty("placements");
    }
    expect(pageOf(config.profiles[0]).placements).toEqual([]);
    expect(newProfile("n", 1920, 1080).pages).toEqual([mainPage()]);
  });
});
