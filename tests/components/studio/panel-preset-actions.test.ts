import { describe, expect, it } from "vitest";
import { PANEL_ID, defaultConfig, type DashboardConfig, type Placement } from "@/lib/layout";
import { isUserPanelPreset } from "@/lib/panel-model";
import { deletePanelPreset, panelPresetFrom, renamePanelPreset, savePanelPreset } from "@/components/studio/panel-preset-actions";

const zone: Placement = {
  id: "z",
  module: PANEL_ID,
  colStart: 2,
  rowStart: 1,
  colSpan: 4,
  rowSpan: 2,
  visible: true,
  settings: { radius: "8", source: "not a style key" },
  panel: {
    id: "pd",
    title: "Stats",
    titleVisible: true,
    visible: true,
    background: "bordered",
    layout: "grid",
    columns: 2,
    widgets: [{ id: "w1", kind: "stat", sensor: "s", visible: true }],
  },
};

const config = (): DashboardConfig => ({ ...defaultConfig(), panelPresets: undefined });

describe("panelPresetFrom", () => {
  it("keeps the arrangement, widgets (fresh ids), footprint and the panel's look", () => {
    const p = panelPresetFrom(zone, "u1", "Desk");
    expect(p).toMatchObject({ id: "u1", name: "Desk", colSpan: 4, rowSpan: 2 });
    expect(p.panel).toMatchObject({ layout: "grid", columns: 2, title: "Stats" });
    expect(p.panel.id).not.toBe("pd");
    expect(p.panel.widgets[0]).toMatchObject({ kind: "stat", sensor: "s" });
    expect(p.panel.widgets[0].id).not.toBe("w1");
    // Legacy look migrated; keys that aren't panel style settings dropped.
    expect(p.settings).toEqual({ radius: "8", label: "Stats", surface: "bordered" });
    expect(isUserPanelPreset(p)).toBe(true);
  });
});

describe("save / rename / delete", () => {
  it("appends, renames and deletes saved panels; the last delete leaves no list", () => {
    const one = savePanelPreset(config(), zone, "u1", "Desk");
    const two = savePanelPreset(one, zone, "u2", "Wall");
    expect(two.panelPresets?.map((p) => p.name)).toEqual(["Desk", "Wall"]);
    expect(renamePanelPreset(two, "u2", "Hall").panelPresets?.map((p) => p.name)).toEqual(["Desk", "Hall"]);
    expect(deletePanelPreset(two, "u1").panelPresets?.map((p) => p.id)).toEqual(["u2"]);
    expect(deletePanelPreset(one, "u1").panelPresets).toBeUndefined();
  });

  it("ignores zones without a panel", () => {
    const before = config();
    expect(savePanelPreset(before, { ...zone, panel: undefined }, "u1", "x")).toBe(before);
  });
});
