// Save to Library on a screen's page (decision Q10): a mixed selection (widgets, an item placement, nested groups, a
// hidden part) saved as a component and placed back, on a screen's page and in an imported profile, gives the same tree.
import { describe, expect, it } from "vitest";
import { defaultConfig, ITEM_ID, type DashboardConfig, type MonitorProfile, type PageGroup, type Placement, type ProfilePage } from "@/lib/layout";
import { profileWithPage } from "@/lib/pages";
import { findNode, type LayerNode } from "@/lib/page-model";
import { readPlacements } from "@/lib/page-model/placements-adapter";
import { saveSelection } from "@/lib/page-model/save-selection";
import { importIntoProfile } from "@/components/studio/import-actions";
import { openCanvas } from "@/lib/infopanel/canvas";
import { editItems } from "@/lib/infopanel/canvas-edit";
import { withComponent } from "@/lib/infopanel/component";
import { newStored, widgetOf, type StoredItem } from "@/lib/infopanel/import/stored";
import { withoutItems } from "@/lib/page-model/stored-items";
import type { DisplayItem } from "@/lib/infopanel/schema";

const zone = (id: string, module: string, c: [number, number, number, number], extra: Partial<Placement> = {}): Placement => ({
  id, module, colStart: c[0], rowStart: c[1], colSpan: c[2], rowSpan: c[3], visible: true, ...extra,
});
const logo = { kind: "Image", Name: "Logo", X: 0, Y: 200, Width: 600, Height: 200, Scale: 100, FilePath: "logo.png", RelativePath: true, unknown: {} } as StoredItem;

/** 1200 × 600 on 6 × 3 cells of 200 px: Stats (a picture placed freely and the group Gauges: a CPU widget and a hidden Weather), a Net widget renamed Uplink, a Clock. */
function screen(): MonitorProfile {
  const groups: PageGroup[] = [
    { id: "g-stats", name: "Stats" },
    { id: "g-gauges", name: "Gauges", parentId: "g-stats" },
  ];
  const canvas = newStored({ name: "Main", width: 1200, height: 600 });
  const page: ProfilePage = {
    id: "main",
    name: "Main",
    groups,
    freeCanvas: withoutItems({
      ...canvas,
      assets: [
        { name: "logo.png", hash: "a".repeat(64), type: "png", size: 10 },
        { name: "unused.png", hash: "b".repeat(64), type: "png", size: 10 },
      ],
    }),
    placements: [
      zone("cpu", "CpuMonitor", [1, 1, 1, 1], { groupId: "g-gauges", settings: { decimals: 1, label: "CPU" }, design: { accent: "#ff3300" } }),
      zone("weather", "Weather", [2, 1, 1, 1], { groupId: "g-gauges", visible: false }),
      zone("logo", ITEM_ID, [1, 2, 3, 1], { groupId: "g-stats", item: logo, px: { x: 0, y: 200, w: 600, h: 200 } }),
      zone("net", "Network", [3, 1, 1, 1], { name: "Uplink" }),
      zone("clock", "Clock", [6, 3, 1, 1]),
    ],
  };
  return { id: "desk", name: "Desk", width: 1200, height: 600, cols: 6, rows: 3, gap: 0, padding: 0, fit: "fill", pages: [page] };
}

function save() {
  const profile = screen();
  const page = profile.pages[0];
  const made = saveSelection({ profile, page, model: readPlacements(profile, page), selection: ["g-stats", "net"], name: "Stats card" });
  if (!made) throw new Error("nothing saved");
  return made;
}

/** A tree's shape: names, kinds, hidden flags, top first. */
type Shape = { name: string; kind: string; hidden?: true; children?: Shape[] };
const shapeOf = (nodes: readonly LayerNode[]): Shape[] =>
  nodes.map((n) => ({ name: n.name, kind: n.type === "group" ? "group" : n.kind, ...(n.hidden ? { hidden: true as const } : {}), ...(n.type === "group" ? { children: shapeOf(n.children) } : {}) }));
const itemShape = (items: readonly DisplayItem[]): Shape[] =>
  [...items].reverse().map((it) => ({
    name: it.Name,
    kind: it.kind === "Group" ? "group" : widgetOf(it) ? "widget" : "item",
    ...(it.Hidden ? { hidden: true as const } : {}),
    ...(it.kind === "Group" ? { children: itemShape(it.DisplayItems) } : {}),
  }));

const TREE: Shape[] = [
  { name: "Uplink", kind: "widget" },
  {
    name: "Stats",
    kind: "group",
    children: [
      { name: "Logo", kind: "item" },
      { name: "Gauges", kind: "group", children: [{ name: "Weather", kind: "widget", hidden: true }, { name: "CpuMonitor", kind: "widget" }] },
    ],
  },
];

describe("saving a selection on a screen's page", () => {
  it("is a canvas the bounds' size: groups nested, widgets as widget items with their settings, a hidden part hidden, only the files used", () => {
    const { stored } = save();
    expect(stored.profile).toMatchObject({ Name: "Stats card", Width: 600, Height: 400 });
    expect(stored.assets.map((a) => a.name)).toEqual(["logo.png"]);
    const items = editItems(openCanvas(stored));
    expect(itemShape(items)).toEqual(TREE);
    const [stats, net] = items;
    const [gauges, pic] = stats.kind === "Group" ? stats.DisplayItems : [];
    const [cpu, weather] = gauges?.kind === "Group" ? gauges.DisplayItems : [];
    // Re-based to the bounds' corner, each at its drawn box.
    expect([cpu.X, cpu.Y, weather.X, net.X, pic.X, pic.Y]).toEqual([0, 0, 200, 400, 0, 200]);
    expect(widgetOf(cpu)).toEqual({ module: "CpuMonitor", settings: { decimals: 1, label: "CPU" }, design: { accent: "#ff3300" } });
    expect(widgetOf(net)).toMatchObject({ module: "Network", name: "Uplink" });
  });

  it("is null with nothing selected", () => {
    const profile = screen();
    expect(saveSelection({ profile, page: profile.pages[0], model: readPlacements(profile, profile.pages[0]), selection: [], name: "x" })).toBeNull();
  });
});

describe("placing it back", () => {
  it("on a screen's page: the same tree in a group named after it, widgets on cells keeping their settings, the picture at the same offset", () => {
    const { stored } = save();
    const target: MonitorProfile = { ...screen(), id: "other", pages: [{ id: "p", name: "P", placements: [zone("clock", "Clock", [6, 3, 1, 1])] }] };
    const config: DashboardConfig = { ...defaultConfig(), profiles: [target], activeProfile: "other" };
    const r = importIntoProfile(config, profileWithPage(target), stored, { width: 600, height: 400 }, { col: 2, row: 2, cols: 3, rows: 2 });
    if (!r) throw new Error("not placed");
    const out = r.config.profiles[0];
    const model = readPlacements(out, out.pages[0]);
    const wrapper = findNode(model.root, r.zoneId)!.node;
    expect(wrapper.type === "group" && wrapper.name).toBe("Stats card");
    expect(wrapper.type === "group" && shapeOf(wrapper.children)).toEqual(TREE);
    const by = (module: string) => out.pages[0].placements.find((p) => p.module === module)!;
    expect(by("CpuMonitor")).toMatchObject({ colStart: 2, rowStart: 2, colSpan: 1, rowSpan: 1, settings: { decimals: 1, label: "CPU" }, design: { accent: "#ff3300" } });
    // A widget renamed here keeps its name; one that wasn't has none of its own (its widget's name shows).
    expect(by("Network")).toMatchObject({ colStart: 4, rowStart: 2, name: "Uplink" });
    expect(by("CpuMonitor").name).toBeUndefined();
    expect(by("Weather").visible).toBe(false);
    expect(by(ITEM_ID)).toMatchObject({ px: { x: 200, y: 400, w: 600, h: 200 }, item: { FilePath: "logo.png" } });
    expect(out.pages[0].freeCanvas?.assets.map((a) => a.name)).toEqual(["logo.png"]);
  });

  it("on a screen's page with no free cells for a widget: refused, never overlapping one", () => {
    const { stored } = save();
    const full = Array.from({ length: 6 }, (_, i) => zone(`w${i}`, "Clock", [i + 1, 1, 1, 3]));
    const target: MonitorProfile = { ...screen(), id: "other", pages: [{ id: "p", name: "P", placements: full }] };
    const config: DashboardConfig = { ...defaultConfig(), profiles: [target], activeProfile: "other" };
    expect(importIntoProfile(config, profileWithPage(target), stored, { width: 600, height: 400 }, { col: 1, row: 1, cols: 3, rows: 2 })).toBeNull();
  });

  it("in an imported profile: the same tree, widgets staying widget items with their settings", () => {
    const { stored } = save();
    const open = openCanvas(newStored({ name: "Imported", width: 1200, height: 600 }));
    const placed = withComponent(open.stored, open.profile, [], stored, { at: { x: 300, y: 200 } });
    const items = editItems(openCanvas(placed.stored));
    expect(itemShape(items)).toEqual(TREE);
    const stats = items[0];
    const cpu = stats.kind === "Group" && stats.DisplayItems[0].kind === "Group" ? stats.DisplayItems[0].DisplayItems[0] : undefined;
    expect(widgetOf(cpu)?.settings).toEqual({ decimals: 1, label: "CPU" });
    expect([cpu?.X, cpu?.Y, items[1].X]).toEqual([0, 0, 400]);
  });
});
