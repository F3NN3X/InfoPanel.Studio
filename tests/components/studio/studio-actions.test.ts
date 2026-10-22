import { describe, expect, it } from "vitest";
import {
  BLANK_MODULE,
  PANEL_ID,
  type MonitorProfile,
  type ProfileView,
  type PanelDef,
  type Placement,
} from "@/lib/layout";
import { userPanelPreset, type PanelPreset } from "@/lib/panelPresets";
import {
  addBlankZone,
  canGrowTo,
  canToggleZonesVisible,
  followGlobalStyle,
  moveZonesToPage,
  ownStyle,
  pasteStyleToZones,
  withSampleZones,
  addModuleAt,
  addModulePlacement,
  addPresetPlacement,
  assignModule,
  assignPreset,
  changeCols,
  changeRows,
  clearWidget,
  duplicatePlacement,
  duplicateZones,
  removePlacement,
  toggleZonesVisible,
  updatePlacement,
  } from "@/components/studio/studio-actions";

const zone = (
  id: string,
  colStart: number,
  rowStart: number,
  colSpan: number,
  rowSpan: number,
  extra: Partial<Placement> = {}
): Placement => ({
  id,
  module: "mod",
  colStart,
  rowStart,
  colSpan,
  rowSpan,
  visible: true,
  ...extra,
});

const profile = (placements: Placement[], cols = 12, rows = 6): ProfileView => ({
  id: "prof",
  name: "Test",
  width: 1920,
  height: 1080,
  cols,
  rows,
  fit: "scroll",
  placements,
});

const panel: PanelDef = {
  id: "panel",
  title: "Preset panel",
  titleVisible: true,
  visible: true,
  background: "panel",
  widgets: [],
};

const preset = (colSpan: number, rowSpan: number): PanelPreset => ({
  id: "pp",
  title: "Preset",
  colSpan,
  rowSpan,
  make: () => ({ ...panel }),
});

describe("updatePlacement", () => {
  it("maps only the matching placement and leaves the input untouched", () => {
    const before = profile([zone("a", 1, 1, 2, 1), zone("b", 3, 1, 2, 1)]);
    const after = updatePlacement(before, "b", (p) => ({ ...p, module: "x" }));
    expect(after.placements.map((p) => p.module)).toEqual(["mod", "x"]);
    expect(after.placements[0]).toBe(before.placements[0]);
    expect(before.placements[1].module).toBe("mod");
  });
});

describe("addModulePlacement", () => {
  it("appends at the first free slot, visible, with the given id", () => {
    const after = addModulePlacement(profile([zone("a", 1, 1, 4, 1)]), "new", "cpu", {
      cols: 3,
      rows: 2,
    });
    expect(after.placements).toHaveLength(2);
    expect(after.placements[1]).toEqual({
      id: "new",
      module: "cpu",
      colStart: 5,
      rowStart: 1,
      colSpan: 3,
      rowSpan: 2,
      visible: true,
    });
  });

  it("clamps the size to the grid and falls back to the top-left when full", () => {
    const full = profile([zone("a", 1, 1, 4, 2)], 4, 2);
    const after = addModulePlacement(full, "new", "cpu", { cols: 9, rows: 9 });
    expect(after.placements[1]).toMatchObject({
      colStart: 1,
      rowStart: 1,
      colSpan: 4,
      rowSpan: 2,
    });
  });
});

/** The preset's panel as a new zone gets it: normalized (a wrapping row stack). */
const normalized: PanelDef = { ...panel, layout: "stack", direction: "row", wrap: true };

/** A saved panel with its own look. */
const saved = userPanelPreset({
  id: "mine",
  name: "Mine",
  colSpan: 3,
  rowSpan: 2,
  panel: { ...panel, layout: "grid", columns: 2, widgets: [{ id: "w1", kind: "stat", sensor: "s", visible: true }] },
  settings: { label: "Mine", surface: "glass", accent: "#ff0000" },
});

describe("addModuleAt", () => {
  const rect = { col: 2, row: 1, cols: 3, rows: 2 };
  it("adds the zone at the box, with no settings unless a view's are given", () => {
    expect(addModuleAt(profile([]), "w", "Weather", rect).placements[0]).toEqual({ id: "w", module: "Weather", colStart: 2, rowStart: 1, colSpan: 3, rowSpan: 2, visible: true });
    expect(addModuleAt(profile([]), "w", "Weather", rect, { view: "minimal" }).placements[0].settings).toEqual({ view: "minimal" });
  });
});

describe("addPresetPlacement", () => {
  it("appends a panel placement built by the preset, migrated (title → label; the card stays a render-time layer)", () => {
    const after = addPresetPlacement(profile([]), "pnl", preset(6, 3));
    expect(after.placements[0]).toEqual({
      id: "pnl",
      module: PANEL_ID,
      colStart: 1,
      rowStart: 1,
      colSpan: 6,
      rowSpan: 3,
      visible: true,
      panel: normalized,
      settings: { label: "Preset panel" },
    });
  });

  it("adds a saved panel as a fresh copy with its own look, shown: its sections are custom", () => {
    const after = addPresetPlacement(profile([]), "pnl", saved).placements[0];
    expect(after).toMatchObject({ colSpan: 3, rowSpan: 2, settings: { label: "Mine", surface: "glass", accent: "#ff0000" } });
    expect(after.follow).toEqual({ colors: false, surface: false });
    expect(after.panel).toMatchObject({ layout: "grid", columns: 2 });
    expect(after.panel!.id).not.toBe("panel");
    expect(after.panel!.widgets).toHaveLength(1);
    expect(after.panel!.widgets[0]).toMatchObject({ kind: "stat", sensor: "s" });
    expect(after.panel!.widgets[0].id).not.toBe("w1");
    // Two uses never share ids.
    const again = addPresetPlacement(profile([]), "pnl", saved).placements[0];
    expect(again.panel!.widgets[0].id).not.toBe(after.panel!.widgets[0].id);
  });
});

describe("addBlankZone / setZoneRect", () => {
  it("adds a blank zone at the given box", () => {
    const after = addBlankZone(profile([]), "z", { col: 2, row: 3, cols: 4, rows: 2 });
    expect(after.placements[0]).toEqual({
      id: "z",
      module: BLANK_MODULE,
      colStart: 2,
      rowStart: 3,
      colSpan: 4,
      rowSpan: 2,
      visible: true,
    });
  });

});

describe("placement toggles", () => {

  it("removes by id", () => {
    const after = removePlacement(profile([zone("a", 1, 1, 2, 1), zone("b", 3, 1, 2, 1)]), "a");
    expect(after.placements.map((p) => p.id)).toEqual(["b"]);
  });
});

describe("duplicatePlacement", () => {
  it("inserts a copy with a new id right after the original", () => {
    const before = profile([
      zone("a", 1, 1, 2, 1, { settings: { x: 1 } }),
      zone("b", 3, 1, 2, 1),
    ]);
    const after = duplicatePlacement(before, "a");
    expect(after.placements).toHaveLength(3);
    expect(after.placements[0].id).toBe("a");
    expect(after.placements[2].id).toBe("b");
    const copy = after.placements[1];
    expect(copy.id).not.toBe("a");
    expect(copy.id.startsWith("mod-")).toBe(true);
    expect(copy.settings).toEqual({ x: 1 });
    expect(copy.settings).not.toBe(before.placements[0].settings);
  });

});

describe("widget assignment", () => {
  it("clears a zone back to blank", () => {
    const before = profile([zone("a", 1, 1, 2, 1, { panel, settings: { x: 1 } })]);
    expect(clearWidget(before, "a").placements[0]).toMatchObject({
      module: BLANK_MODULE,
      panel: undefined,
      settings: undefined,
    });
  });

  it("grows a zone to the module's minimum, shifting it back inside the grid", () => {
    const before = profile([zone("a", 11, 6, 1, 1, { settings: { x: 1 } })], 12, 6);
    expect(assignModule(before, "a", "cpu", { cols: 3, rows: 2 }).placements[0]).toEqual({
      id: "a",
      module: "cpu",
      colStart: 10,
      rowStart: 5,
      colSpan: 3,
      rowSpan: 2,
      visible: true,
      panel: undefined,
      settings: undefined,
    });
  });

  it("sets a view's settings in place of the old ones when given", () => {
    const before = profile([zone("a", 1, 1, 2, 1, { settings: { x: 1 } })]);
    expect(assignModule(before, "a", "Weather", { cols: 1, rows: 1 }, { view: "now", showForecast: false }).placements[0].settings).toEqual({ view: "now", showForecast: false });
  });

  it("keeps the zone's box when growing would cover a neighbour", () => {
    const before = profile([zone("a", 1, 1, 2, 1), zone("b", 3, 1, 2, 1)]);
    expect(assignModule(before, "a", "cpu", { cols: 3, rows: 1 }).placements[0]).toMatchObject({
      colStart: 1,
      rowStart: 1,
      colSpan: 2,
      rowSpan: 1,
    });
    expect(assignPreset(before, "a", preset(3, 2)).placements[0]).toMatchObject({
      colSpan: 2,
      rowSpan: 1,
    });
  });

  it("never shrinks a zone and caps growth at the grid size", () => {
    const before = profile([zone("a", 1, 1, 5, 3)], 4, 2);
    expect(assignModule(before, "a", "cpu", { cols: 2, rows: 1 }).placements[0]).toMatchObject({
      colSpan: 4,
      rowSpan: 2,
    });
  });

  it("assigns a preset panel and grows to its footprint, replacing the zone's settings with the panel's", () => {
    const before = profile([zone("a", 2, 2, 1, 1, { settings: { x: 1 } })]);
    expect(assignPreset(before, "a", preset(4, 2)).placements[0]).toEqual({
      id: "a",
      module: PANEL_ID,
      panel: normalized,
      settings: { label: "Preset panel" },
      colStart: 2,
      rowStart: 2,
      colSpan: 4,
      rowSpan: 2,
      visible: true,
    });
  });

  it("assigns a saved panel with its settings", () => {
    const before = profile([zone("a", 1, 1, 1, 1, { settings: { x: 1 } })]);
    const after = assignPreset(before, "a", saved).placements[0];
    expect(after.settings).toEqual({ label: "Mine", surface: "glass", accent: "#ff0000" });
    expect(after).toMatchObject({ colSpan: 3, rowSpan: 2, panel: { layout: "grid" } });
  });
});

describe("changeCols / changeRows", () => {
  it("clamps the column count to 2–24 and pulls zones inside", () => {
    const before = profile([zone("a", 10, 1, 3, 1), zone("b", 12, 1, 1, 1)], 12, 6);
    const after = changeCols(before, -4);
    expect(after.cols).toBe(8);
    expect(after.placements[0]).toMatchObject({ colStart: 8, colSpan: 1 });
    expect(after.placements[1]).toMatchObject({ colStart: 8, colSpan: 1 });
    expect(changeCols(profile([], 2), -1).cols).toBe(2);
    expect(changeCols(profile([], 24), 1).cols).toBe(24);
  });

  it("clamps the row count to 1–24 and pulls zones inside", () => {
    const before = profile([zone("a", 1, 3, 1, 4)], 12, 6);
    const after = changeRows(before, -2);
    expect(after.rows).toBe(4);
    expect(after.placements[0]).toMatchObject({ rowStart: 3, rowSpan: 2 });
    expect(changeRows(profile([], 12, 1), -1).rows).toBe(1);
    expect(changeRows(profile([], 12, 24), 1).rows).toBe(24);
  });
});

describe("toggleZonesVisible", () => {
  it("hides the whole set while any member shows", () => {
    const before = profile([
      zone("a", 1, 1, 1, 1, { visible: false }),
      zone("b", 2, 1, 1, 1),
      zone("c", 3, 1, 1, 1),
    ]);
    const after = toggleZonesVisible(before, ["a", "b"]);
    expect(after.placements.map((p) => p.visible)).toEqual([false, false, true]);
  });

  it("shows the whole set when every member is hidden", () => {
    const before = profile([zone("a", 1, 1, 1, 1, { visible: false }), zone("b", 2, 1, 1, 1, { visible: false })]);
    expect(toggleZonesVisible(before, ["a", "b"]).placements.map((p) => p.visible)).toEqual([true, true]);
  });
});

describe("duplicateZones", () => {
  it("copies each zone to the first free spot of its size, rows first", () => {
    const before = profile([zone("a", 1, 1, 2, 1, { settings: { x: 1 } }), zone("b", 3, 1, 4, 2)], 6, 4);
    const { profile: after, copies } = duplicateZones(before, ["a", "b"]);
    expect(copies).toHaveLength(2);
    const [ca, cb] = copies.map((id) => after.placements.find((p) => p.id === id)!);
    expect([ca.colStart, ca.rowStart, ca.colSpan, ca.rowSpan]).toEqual([1, 2, 2, 1]);
    // b's copy can't sit beside it; the earlier copy counts as taken.
    expect([cb.colStart, cb.rowStart, cb.colSpan, cb.rowSpan]).toEqual([1, 3, 4, 2]);
    expect(ca.settings).toEqual({ x: 1 });
    expect(ca.settings).not.toBe(before.placements[0].settings);
  });

  it("skips a zone with no free spot and keeps the profile when nothing fits", () => {
    const full = profile([zone("a", 1, 1, 2, 2)], 2, 2);
    const result = duplicateZones(full, ["a"]);
    expect(result.copies).toEqual([]);
    expect(result.profile).toBe(full);
  });
});

describe("canGrowTo", () => {
  const blank = (id: string, c: number, r: number, w: number, h: number) =>
    zone(id, c, r, w, h, { module: BLANK_MODULE });

  it("is true when the zone has the room", () => {
    const p = profile([blank("b", 1, 1, 3, 2)]);
    expect(canGrowTo(p, "b", { cols: 3, rows: 2 })).toBe(true);
    expect(canGrowTo(p, "b", { cols: 5, rows: 2 })).toBe(true);
  });

  it("is false when growing would cover another zone", () => {
    const p = profile([blank("b", 1, 1, 1, 1), zone("o", 2, 1, 2, 1)], 4, 2);
    expect(canGrowTo(p, "b", { cols: 2, rows: 1 })).toBe(false);
  });

});

describe("pasteStyleToZones", () => {
  it("replaces the look of the set, skipping blanks and other zones", () => {
    const p = profile([
      zone("a", 1, 1, 2, 1, { module: "FpsMonitor", settings: { accent: "#f00" } }),
      zone("b", 3, 1, 2, 1, { module: BLANK_MODULE }),
      zone("c", 5, 1, 2, 1, { module: "FpsMonitor", settings: { accent: "#0f0" } }),
    ]);
    const out = pasteStyleToZones(p, ["a", "b"], { accent: "#00f" });
    expect(out.placements[0].settings?.accent).toBe("#00f");
    expect(out.placements[1]).toBe(p.placements[1]);
    expect(out.placements[2]).toBe(p.placements[2]);
  });

  it("makes the sections the style sets custom, so it shows; the others keep their state", () => {
    const p = profile([zone("a", 1, 1, 2, 1, { module: "FpsMonitor", follow: { type: false } })]);
    expect(pasteStyleToZones(p, ["a"], { accent: "#00f", glow: "soft" }).placements[0].follow).toEqual({
      type: false,
      colors: false,
      border: false,
    });
  });
});

describe("ownStyle", () => {
  it("takes the look values that apply: custom sections only (Small zones is no look key since config v7)", () => {
    const z = zone("a", 1, 1, 2, 1, { settings: { accent: "#f00", glow: "soft", compact: "dense", sensor: "x" }, follow: { colors: false } });
    expect(ownStyle(z, {})).toEqual({ accent: "#f00" });
    expect(ownStyle(z, { profile: { locks: { colors: true } } })).toEqual({});
  });
});

describe("followGlobalStyle", () => {
  it("follows in every section and drops the themed keys, keeping the rest", () => {
    const p = profile([zone("a", 1, 1, 2, 1, { module: "cpu", settings: { accent: "#f00", sensor: "x" }, follow: { colors: false } })]);
    const out = followGlobalStyle(p, ["a"]).placements[0];
    expect(out.follow).toBeUndefined();
    expect(out.settings).toEqual({ sensor: "x" });
  });

});

describe("withSampleZones", () => {
  it("takes the sample's grid and fresh copies of its zones", () => {
    const sample = profile([zone("s1", 1, 1, 2, 1), zone("s2", 3, 1, 2, 1)], 8, 3);
    const out = withSampleZones(profile([]), sample);
    expect(out).toMatchObject({ id: "prof", cols: 8, rows: 3 });
    expect(out.placements).toHaveLength(2);
    expect(out.placements.map((p) => p.id)).not.toContain("s1");
  });

  it("keeps the shared grid and scales the sample onto it when another page has zones", () => {
    const sample = profile([zone("s1", 1, 1, 6, 3), zone("s2", 7, 4, 6, 3)], 12, 6);
    const target = { ...profile([]), cols: 12, rows: 12 };
    const out = withSampleZones(target, sample, true);
    expect(out).toMatchObject({ cols: 12, rows: 12 });
    expect(out.placements.map((p) => [p.colStart, p.rowStart, p.colSpan, p.rowSpan])).toEqual([
      [1, 1, 6, 6],
      [7, 7, 6, 6],
    ]);
  });

  it("moves a zone that collides after shrinking, and leaves out one with no room", () => {
    const sample = profile([zone("a", 1, 1, 1, 1), zone("b", 2, 1, 1, 1), zone("c", 1, 2, 2, 1)], 2, 2);
    const target = { ...profile([]), cols: 1, rows: 2 };
    const out = withSampleZones(target, sample, true);
    expect(out).toMatchObject({ cols: 1, rows: 2 });
    // a and b both shrink onto column 1, row 1: b moves to row 2; c then has no room.
    expect(out.placements.map((p) => [p.colStart, p.rowStart])).toEqual([
      [1, 1],
      [1, 2],
    ]);
  });
});

describe("hidden zones and no-op box changes", () => {
  it("refuses to show a zone whose cells were taken while it was hidden", () => {
    const p = profile([zone("a", 1, 1, 3, 2, { visible: false }), zone("b", 1, 1, 3, 2)]);
    expect(canToggleZonesVisible(p, ["a"])).toBe(false);
    expect(canToggleZonesVisible(p, ["b"])).toBe(true); // hiding is always fine
  });

  it("allows showing a hidden zone with free cells, and refuses a pair that overlap each other", () => {
    const free = profile([zone("a", 1, 1, 3, 2, { visible: false }), zone("b", 5, 1, 3, 2)]);
    expect(canToggleZonesVisible(free, ["a"])).toBe(true);
    const pair = profile([zone("a", 1, 1, 3, 2, { visible: false }), zone("b", 2, 1, 3, 2, { visible: false })]);
    expect(canToggleZonesVisible(pair, ["a", "b"])).toBe(false);
  });

});

describe("moveZonesToPage", () => {
  const stored = (a: Placement[], b: Placement[], cols = 12, rows = 6): MonitorProfile => ({
    id: "prof",
    name: "Test",
    width: 1920,
    height: 1080,
    cols,
    rows,
    fit: "scroll",
    pages: [
      { id: "a", name: "A", placements: a },
      { id: "b", name: "B", placements: b },
    ],
  });
  const min1 = () => ({ cols: 1, rows: 1 });

  it("keeps the box when it is free on the target page", () => {
    const out = moveZonesToPage(stored([zone("z", 3, 2, 4, 2)], [zone("y", 1, 1, 2, 2)]), ["z"], "a", "b", min1);
    expect(out?.pages[0].placements).toEqual([]);
    expect(out?.pages[1].placements.find((p) => p.id === "z")).toMatchObject({
      colStart: 3,
      rowStart: 2,
      colSpan: 4,
      rowSpan: 2,
    });
  });

  it("takes the first free spot for its size when the box is taken", () => {
    const out = moveZonesToPage(stored([zone("z", 1, 1, 3, 2)], [zone("y", 1, 1, 3, 2)]), ["z"], "a", "b", min1);
    expect(out?.pages[1].placements.find((p) => p.id === "z")).toMatchObject({
      colStart: 4,
      rowStart: 1,
      colSpan: 3,
      rowSpan: 2,
    });
  });

  it("refuses, changing nothing, when a zone has no room", () => {
    const p = stored([zone("z", 1, 1, 2, 2)], [zone("y", 1, 1, 4, 2)], 4, 2);
    expect(moveZonesToPage(p, ["z"], "a", "b", min1)).toBeNull();
  });

  it("moves several zones, placing each against the ones already landed", () => {
    const p = stored([zone("z1", 1, 1, 3, 2), zone("z2", 1, 1, 3, 2, { visible: false })], [zone("y", 1, 1, 3, 2)]);
    const out = moveZonesToPage(p, ["z1", "z2"], "a", "b", min1);
    const landed = out?.pages[1].placements ?? [];
    expect(landed.map((x) => x.id)).toEqual(["y", "z1", "z2"]);
    expect(landed[1]).toMatchObject({ colStart: 4, rowStart: 1 });
    expect(landed[2]).toMatchObject({ colStart: 7, rowStart: 1 }); // after z1, which landed first
    expect(out?.pages[0].placements).toEqual([]);
  });

  it("keeps ids and every other field, and leaves other zones alone", () => {
    const p = stored([zone("z", 1, 1, 2, 2, { module: "SystemOverview" }), zone("stay", 5, 1, 2, 2)], []);
    const out = moveZonesToPage(p, ["z"], "a", "b", min1);
    expect(out?.pages[1].placements[0]).toMatchObject({ id: "z", module: "SystemOverview" });
    expect(out?.pages[0].placements.map((x) => x.id)).toEqual(["stay"]);
  });

});
