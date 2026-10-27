// The layer menu's actions, its keys and Layers' drops on a screen page (Edit v3 SPEC §8.3, acceptance 13, 15, 16, 18):
// each one set of page model ops (one undo step), the same from the menu and the keys; drops change z only; a group
// holding a widget moves by cells and is refused when a widget would land on one outside it.
import { describe, expect, it } from "vitest";
import { ITEM_ID, type MonitorProfile, type Placement, type ProfilePage } from "@/lib/layout";
import { findNode, partsOf, type LayerNode } from "@/lib/page-model/model";
import { partKeyOps } from "@/lib/page-model/keys";
import { dropBlocked, dropOps, groupMoveOps, layerActionOps, layerActionsFor, lockedInTree, unionBox } from "@/lib/page-model/layer-actions";
import { moveOps } from "@/lib/page-model/gesture";
import { applyPlacements, readPlacements } from "@/lib/page-model/placements-adapter";

const zone = (id: string, module: string, c: [number, number, number, number], extra: Partial<Placement> = {}): Placement => ({
  id, module, colStart: c[0], rowStart: c[1], colSpan: c[2], rowSpan: c[3], visible: true, ...extra,
});
const item = (id: string, px: { x: number; y: number; w: number; h: number }, extra: Partial<Placement> = {}): Placement =>
  zone(id, ITEM_ID, [1, 1, 1, 1], { item: { kind: "Text", Name: id, X: px.x, Y: px.y, unknown: {} }, px, ...extra });

// 4 × 3, 1024 × 600: cells 256 × 200. Bottom first: CPU and GPU gauge (Gauges), Clock, Weather, Title (Overlay), Note.
const profile: MonitorProfile = { id: "s", name: "S", width: 1024, height: 600, cols: 4, rows: 3, fit: "fill", gap: 0, padding: 0, pages: [] };
const page: ProfilePage = {
  id: "p",
  name: "P",
  groups: [{ id: "gauges", name: "Gauges" }, { id: "overlay", name: "Overlay" }],
  placements: [
    zone("cpu", "Clock", [1, 1, 2, 2], { groupId: "gauges" }),
    zone("gpu", "Clock", [3, 1, 2, 2], { groupId: "gauges" }),
    zone("clock", "Clock", [1, 3, 1, 1]),
    zone("weather", "Weather", [2, 3, 1, 1]),
    item("title", { x: 48, y: 28, w: 140, h: 36 }, { groupId: "overlay" }),
    item("note", { x: 600, y: 450, w: 100, h: 30 }),
  ],
};
const model = readPlacements(profile, page);
let n = 0;
const newId = (prefix: string) => `${prefix}-${++n}`;
const after = (ops: Parameters<typeof applyPlacements>[2], on: ProfilePage = page) => applyPlacements(profile, on, ops);
/** The tree's names, top first, a group as `{ name: children }`. */
const tree = (nodes: readonly LayerNode[]): unknown[] => nodes.map((x) => (x.type === "group" ? { [x.name]: tree(x.children) } : x.id));

describe("the layer menu's actions", () => {
  it("reads the page top first: Note, Overlay (Title), Weather, Clock, Gauges (GPU, CPU)", () => {
    expect(tree(model.root)).toEqual(["note", { Overlay: ["title"] }, "weather", "clock", { Gauges: ["gpu", "cpu"] }]);
  });

  it("brings a group to the front and sends a widget to the back, z only", () => {
    const front = after(layerActionOps(model, ["gauges"], "front", newId)!.ops);
    expect(tree(readPlacements(profile, front).root)[0]).toEqual({ Gauges: ["gpu", "cpu"] });
    expect(front.placements.find((p) => p.id === "cpu")).toMatchObject({ colStart: 1, rowStart: 1 });
    const back = after(layerActionOps(model, ["note"], "back", newId)!.ops);
    expect(back.placements[0].id).toBe("note");
    expect(back.placements[0].px).toEqual(page.placements[5].px);
  });

  it("forward and backward step one sibling; at the end they do nothing", () => {
    expect(tree(readPlacements(profile, after(layerActionOps(model, ["weather"], "forward", newId)!.ops)).root).slice(0, 3)).toEqual(["note", "weather", { Overlay: ["title"] }]);
    expect(tree(readPlacements(profile, after(layerActionOps(model, ["gpu"], "backward", newId)!.ops)).root).at(-1)).toEqual({ Gauges: ["cpu", "gpu"] });
    expect(layerActionOps(model, ["note"], "forward", newId)).toBeNull();
  });

  it("the keys run the same ops as the menu and the LAYER buttons", () => {
    const pairs: [Parameters<typeof partKeyOps>[2], Parameters<typeof layerActionOps>[2]][] = [
      [{ key: "}", code: "BracketRight", ctrl: true, shift: true, alt: false }, "front"],
      [{ key: "]", code: "BracketRight", ctrl: true, shift: false, alt: false }, "forward"],
      [{ key: "[", code: "BracketLeft", ctrl: true, shift: false, alt: false }, "backward"],
      [{ key: "{", code: "BracketLeft", ctrl: true, shift: true, alt: false }, "back"],
      [{ key: "l", ctrl: true, shift: false, alt: false }, "lock"],
      [{ key: "h", ctrl: true, shift: false, alt: false }, "hide"],
    ];
    for (const [key, action] of pairs) {
      expect(partKeyOps(model, ["weather", "title"], key, () => "x")).toEqual(layerActionOps(model, ["weather", "title"], action, () => "x"));
    }
  });

  it("groups a widget with an item and ungroups it back, each one set of ops", () => {
    const grouped = after(layerActionOps(model, ["weather", "note"], "group", () => "g-new")!.ops);
    expect(grouped.groups?.map((g) => g.name)).toEqual(["Gauges", "Overlay", "Group 3"]);
    expect(grouped.placements.filter((p) => p.groupId === "g-new").map((p) => p.id)).toEqual(["weather", "note"]);
    const r = layerActionOps(readPlacements(profile, grouped), ["g-new"], "ungroup", newId)!;
    expect(r.select).toEqual(["note", "weather"]);
    const back = after(r.ops, grouped);
    expect(back.groups?.map((g) => g.id)).toEqual(["gauges", "overlay"]);
    expect(back.placements.some((p) => p.groupId === "g-new")).toBe(false);
  });

  it("locks and hides a group and its rows as one, toggling back", () => {
    const locked = after(layerActionOps(model, ["overlay", "note"], "lock", newId)!.ops);
    expect(locked.groups?.find((g) => g.id === "overlay")?.locked).toBe(true);
    expect(locked.placements.find((p) => p.id === "note")?.locked).toBe(true);
    const unlocked = after(layerActionOps(readPlacements(profile, locked), ["overlay", "note"], "lock", newId)!.ops, locked);
    expect(unlocked.groups?.find((g) => g.id === "overlay")?.locked).toBeUndefined();
    const hidden = layerActionOps(model, ["weather"], "hide", newId)!;
    expect(hidden.select).toEqual([]);
    expect(after(hidden.ops).placements.find((p) => p.id === "weather")?.visible).toBe(false);
  });

  it("snaps a group's placed-freely items to cells; widgets never offer it", () => {
    expect(layerActionsFor(model, ["weather"]).snap).toBe(false);
    expect(layerActionsFor(model, ["overlay"]).snap).toBe(true);
    const snapped = after(layerActionOps(model, ["overlay"], "snap", newId)!.ops);
    expect(snapped.placements.find((p) => p.id === "title")).toMatchObject({ colStart: 1, rowStart: 1 });
    expect(snapped.placements.find((p) => p.id === "title")?.px).toBeUndefined();
  });

  it("deletes what isn't locked; a locked part stays", () => {
    const locked = after([{ type: "setLocked", id: "note", locked: true }]);
    const r = layerActionOps(readPlacements(profile, locked), ["note", "weather"], "delete", newId)!;
    expect(after(r.ops, locked).placements.map((p) => p.id)).toEqual(["cpu", "gpu", "clock", "title", "note"]);
    expect(r.select).toEqual([]);
  });

  it("disables Ungroup when nothing selected is or sits in a group", () => {
    expect(layerActionsFor(model, ["note"]).ungroup).toBe(false);
    expect(layerActionsFor(model, ["title"]).ungroup).toBe(true);
    expect(layerActionsFor(model, []).front).toBe(false);
  });
});

describe("Layers drops", () => {
  // Acceptance 13: a widget dragged into a group that holds an item; the tree, the z-order and the saved page agree.
  it("drops a widget into the Overlay group above its item, keeping its cells", () => {
    const ops = dropOps(model, ["weather"], "overlay", 0)!;
    const next = after(ops);
    const read = readPlacements(profile, next);
    expect(tree(read.root)).toEqual(["note", { Overlay: ["weather", "title"] }, "clock", { Gauges: ["gpu", "cpu"] }]);
    expect(next.placements.map((p) => p.id)).toEqual(["cpu", "gpu", "clock", "title", "weather", "note"]);
    expect(next.placements.find((p) => p.id === "weather")).toMatchObject({ groupId: "overlay", colStart: 2, rowStart: 3, colSpan: 1, rowSpan: 1 });
  });

  it("drops two rows between others, in their order, and ignores a drop where they already are", () => {
    const ops = dropOps(model, ["note", "clock"], null, 5)!;
    expect(tree(readPlacements(profile, after(ops)).root)).toEqual([{ Overlay: ["title"] }, "weather", { Gauges: ["gpu", "cpu"] }, "note", "clock"]);
    expect(dropOps(model, ["weather"], null, 2)).toEqual([]);
  });

  it("refuses a group into itself or one inside it, and a part as a parent", () => {
    expect(dropBlocked(model, ["gauges"], "gauges")).toBe("A group can’t go into itself.");
    expect(dropBlocked(model, ["note"], "weather")).toBe("Only a group can hold parts.");
    expect(dropOps(model, ["gauges"], "gauges", 0)).toBeNull();
    expect(dropBlocked(model, ["note"], null)).toBeNull();
  });

  // Acceptance 18: lock blocks canvas moves but not a Layers reorder.
  it("reorders a locked part; the canvas doesn't move it", () => {
    const locked = readPlacements(profile, after([{ type: "setLocked", id: "note", locked: true }]));
    const note = findNode(locked.root, "note")!.node as Parameters<typeof moveOps>[1][number];
    expect(moveOps(locked.grid, [note], 50, 50, true)).toEqual([]);
    expect(dropOps(locked, ["note"], null, 3)).toHaveLength(1);
  });
});

describe("group moves", () => {
  const roomy: ProfilePage = { ...page, placements: page.placements.filter((p) => p.id !== "clock" && p.id !== "weather") };
  const open = readPlacements(profile, roomy);

  // Acceptance 15.
  it("moves a group with widgets by whole cells, every member keeping its offset", () => {
    const ops = groupMoveOps(open, ["gauges"], 10, 190, false)!;
    const next = applyPlacements(profile, roomy, ops);
    expect(next.placements.filter((p) => p.groupId === "gauges").map((p) => [p.id, p.colStart, p.rowStart])).toEqual([["cpu", 1, 2], ["gpu", 3, 2]]);
  });

  it("refuses a move that puts a widget on one outside the group", () => {
    expect(groupMoveOps(model, ["gauges"], 0, 200, false)).toBeNull();
    expect(groupMoveOps(open, ["gauges"], 600, 0, false)).toBeNull();
  });

  it("moves a group of items only like an item: to the pixel free, else its corner onto a cell", () => {
    const free = applyPlacements(profile, roomy, groupMoveOps(open, ["overlay"], 7, 9, true)!);
    expect(free.placements.find((p) => p.id === "title")?.px).toEqual({ x: 55, y: 37, w: 140, h: 36 });
    const snapped = applyPlacements(profile, roomy, groupMoveOps(open, ["overlay"], 230, 180, false)!);
    expect(snapped.placements.find((p) => p.id === "title")?.px).toMatchObject({ x: 256, y: 200 });
  });

  it("leaves a locked group where it is", () => {
    const locked = readPlacements(profile, applyPlacements(profile, roomy, [{ type: "setLocked", id: "gauges", locked: true }]));
    expect(lockedInTree(locked, "cpu")).toBe(true);
    expect(groupMoveOps(locked, ["gauges"], 0, 200, false)).toEqual([]);
  });

  it("boxes a group around its members", () => {
    expect(unionBox(model, findNode(model.root, "gauges")!.node)).toEqual({ x: 0, y: 0, w: 1024, h: 400 });
    expect(partsOf(model.root)).toHaveLength(6);
  });
});
