// A screen's page through the page model (Edit v3 SPEC §3.4, acceptance 10, 13, 14): read and written back with no
// change it is the same page, object for object; every op lands in the placements, groups and flags it names.
import { describe, expect, it } from "vitest";
import { ITEM_ID, mergeConfig, type MonitorProfile, type PageGroup, type Placement, type ProfilePage, type StoredConfig } from "@/lib/layout";
import { applyPage, cellRect, findNode, partsOf, readPage, writePage, type PartNode } from "@/lib/page-model";
import { applyPlacements, readPlacements, screenGrid, writePlacements } from "@/lib/page-model/placements-adapter";

const zone = (id: string, module: string, c: [number, number, number, number], extra: Partial<Placement> = {}): Placement => ({
  id, module, colStart: c[0], rowStart: c[1], colSpan: c[2], rowSpan: c[3], visible: true, ...extra,
});
const text = (name: string, x: number, y: number) => ({ kind: "Text", Name: name, X: x, Y: y, FontSize: 20, unknown: {} });
const item = (id: string, name: string, px: { x: number; y: number; w: number; h: number }, extra: Partial<Placement> = {}): Placement =>
  zone(id, ITEM_ID, [1, 1, 1, 1], { item: text(name, px.x, px.y), px, ...extra });

/** Desk panel (the reference's screen): 4 × 3, 1024 × 600, groups Gauges and Overlay (Title text, a free item over the gauges). */
function desk(): MonitorProfile {
  const groups: PageGroup[] = [
    { id: "g-gauges", name: "Gauges" },
    { id: "g-overlay", name: "Overlay", locked: true },
  ];
  const page: ProfilePage = {
    id: "main",
    name: "Main",
    groups,
    placements: [
      zone("cpu", "CpuMonitor", [1, 1, 1, 2], { groupId: "g-gauges" }),
      zone("gpu", "GpuMonitor", [2, 1, 1, 2], { groupId: "g-gauges" }),
      zone("clock", "Clock", [3, 1, 2, 1]),
      zone("weather", "Weather", [3, 2, 2, 1], { visible: false }),
      zone("agents", "CodingAgents", [1, 3, 4, 1], { locked: true }),
      item("title", "Title text", { x: 40, y: 30, w: 300, h: 40 }, { groupId: "g-overlay" }),
      item("glow", "Accent glow", { x: 20, y: 20, w: 400, h: 200 }, { groupId: "g-overlay", item: { kind: "Image", Name: "Accent glow", X: 20, Y: 20, $: { element: { type: "glow" } as never }, unknown: {} } }),
    ],
  };
  return { id: "desk", name: "Desk panel", width: 1024, height: 600, cols: 4, rows: 3, fit: "fill", pages: [page] };
}

describe("reading a screen page", () => {
  const profile = desk();
  const model = readPlacements(profile, profile.pages[0]);

  it("lists parts and groups top first: a group where its topmost member is", () => {
    expect(model.root.map((n) => n.id)).toEqual(["g-overlay", "agents", "weather", "clock", "g-gauges"]);
    const overlay = model.root[0];
    expect(overlay.type === "group" && overlay.children.map((c) => c.id)).toEqual(["glow", "title"]);
    expect(overlay.locked).toBe(true);
  });

  it("knows each part's kind, place and flags", () => {
    const by = (id: string) => findNode(model.root, id)!.node as PartNode;
    expect([by("cpu").kind, by("title").kind, by("glow").kind]).toEqual(["widget", "item", "element"]);
    expect(by("cpu").place).toEqual({ cell: { col: 1, row: 1, cols: 1, rows: 2 } });
    expect(by("title").place).toEqual({ px: { x: 40, y: 30, w: 300, h: 40 } });
    expect(by("title").name).toBe("Title text");
    expect(by("weather").hidden).toBe(true);
    expect(by("agents").locked).toBe(true);
  });

  it("has the screen's grid: the kiosk's padding and gap, a scrolling page's rows fixed", () => {
    expect(model.grid).toEqual({ cols: 4, rows: 3, gap: 12, padding: 0, width: 1024, height: 600 });
    expect(screenGrid({ ...profile, fit: "scroll", gap: 10 })).toEqual({ cols: 4, rows: 3, gap: 10, padding: 24, width: 1024, height: 24 * 2 + 3 * 120 + 2 * 10 });
    // A cell's box is where the kiosk draws it.
    expect(cellRect(model.grid, { col: 2, row: 1, cols: 1, rows: 2 })).toEqual({ x: (1024 - 36) / 4 + 12, y: 0, w: (1024 - 36) / 4, h: 2 * ((600 - 24) / 3) + 12 });
  });
});

describe("a screen page round trip", () => {
  it("writes back the same page, object for object", () => {
    const profile = desk();
    const page = profile.pages[0];
    expect(writePlacements(page, readPlacements(profile, page))).toBe(page);
    expect(writePage(profile, page, readPage(profile, page)!)).toBe(page);
  });

  it("survives a save and load (mergeConfig) unchanged, and reads the same model again", () => {
    const profile = desk();
    const loaded = mergeConfig(JSON.parse(JSON.stringify({ version: 15, profiles: [profile] })) as StoredConfig).profiles[0];
    expect(loaded.pages[0]).toEqual(profile.pages[0]);
    expect(writePlacements(loaded.pages[0], readPlacements(loaded, loaded.pages[0]))).toBe(loaded.pages[0]);
  });

  it("keeps an empty group, and a page with nothing on it", () => {
    const profile = desk();
    const page: ProfilePage = { ...profile.pages[0], groups: [...profile.pages[0].groups!, { id: "g-empty", name: "Empty" }] };
    const model = readPlacements(profile, page);
    expect(model.root.at(-1)?.id).toBe("g-empty");
    expect(writePlacements(page, model)).toBe(page);
    const empty: ProfilePage = { id: "e", name: "E", placements: [] };
    expect(writePlacements(empty, readPlacements(profile, empty))).toBe(empty);
  });

  it("keeps every member when a group's members aren't together in the z-order, putting them together at its topmost", () => {
    const profile = desk();
    const page = profile.pages[0];
    // Gauges' members split by the clock.
    const split: ProfilePage = { ...page, placements: [page.placements[0], page.placements[2], page.placements[1], ...page.placements.slice(3)] };
    const out = writePlacements(split, readPlacements(profile, split));
    expect(out.placements.map((p) => p.id).sort()).toEqual(split.placements.map((p) => p.id).sort());
    expect(out.placements.map((p) => p.id).slice(0, 3)).toEqual(["clock", "cpu", "gpu"]);
    expect(out.placements.find((p) => p.id === "cpu")).toBe(split.placements[0]);
  });
});

describe("ops on a screen page", () => {
  const run = (ops: Parameters<typeof applyPlacements>[2]) => {
    const profile = desk();
    return { before: profile.pages[0], after: applyPlacements(profile, profile.pages[0], ops) };
  };
  const byId = (page: ProfilePage, id: string) => page.placements.find((p) => p.id === id)!;

  it("moves a widget by cells only: a px target snaps to the nearest cells", () => {
    const { after } = run([{ type: "move", id: "clock", to: { x: 10, y: 400 } }]);
    expect(byId(after, "clock")).toMatchObject({ colStart: 1, rowStart: 3, colSpan: 2, rowSpan: 1 });
    expect(byId(after, "clock")).not.toHaveProperty("px");
  });

  it("an item moved to px is placed freely; Snap to grid puts it on the nearest cells and drops its px", () => {
    const moved = run([{ type: "move", id: "title", to: { x: 600, y: 410 } }]).after;
    expect(byId(moved, "title").px).toEqual({ x: 600, y: 410, w: 300, h: 40 });
    expect(byId(moved, "title").item).toMatchObject({ X: 600, Y: 410, Name: "Title text" });
    // Its cells are the ones it covers.
    expect(byId(moved, "title")).toMatchObject({ colStart: 3, rowStart: 3, colSpan: 2, rowSpan: 1 });
    const profile = desk();
    const snapped = applyPlacements(profile, moved, [{ type: "snapToGrid", id: "title" }]);
    expect(byId(snapped, "title")).not.toHaveProperty("px");
    expect(byId(snapped, "title")).toMatchObject({ colStart: 3, rowStart: 3, colSpan: 1, rowSpan: 1 });
  });

  it("changing the grid moves on-grid parts with it and never a placed-freely item (acceptance 10)", () => {
    const profile = { ...desk(), cols: 6, rows: 4 };
    const page = profile.pages[0];
    const model = readPlacements(profile, page);
    const title = findNode(model.root, "title")!.node as PartNode;
    expect(title.place).toEqual({ px: { x: 40, y: 30, w: 300, h: 40 } });
    expect(writePlacements(page, model)).toBe(page);
  });

  it("hides, locks and renames as one change each, the rest of the page untouched", () => {
    const { before, after } = run([
      { type: "setHidden", id: "clock", hidden: true },
      { type: "setLocked", id: "g-gauges", locked: true },
      { type: "rename", id: "title", name: "Heading" },
    ]);
    expect(byId(after, "clock").visible).toBe(false);
    expect(after.groups!.find((g) => g.id === "g-gauges")!.locked).toBe(true);
    expect(byId(after, "title").item!.Name).toBe("Heading");
    expect(byId(after, "agents")).toBe(byId(before, "agents"));
    expect(after.groups![1]).toBe(before.groups![1]);
  });

  it("renames a widget in its own name field; renamed to nothing it takes its widget's name again", () => {
    const { before, after } = run([{ type: "rename", id: "clock", name: "Desk clock" }]);
    expect(byId(after, "clock")).toEqual({ ...byId(before, "clock"), name: "Desk clock" });
    expect(findNode(readPlacements(desk(), after).root, "clock")!.node.name).toBe("Desk clock");
    // Read with the studio's names, a widget renamed reads by its name; an untouched one by the studio's.
    const named = readPlacements(desk(), after, (p) => `the ${p.module}`);
    expect([findNode(named.root, "clock")!.node.name, findNode(named.root, "cpu")!.node.name]).toEqual(["Desk clock", "the CpuMonitor"]);
    const cleared = applyPlacements(desk(), after, [{ type: "rename", id: "clock", name: "" }]);
    expect(byId(cleared, "clock")).not.toHaveProperty("name");
    expect(findNode(readPlacements(desk(), cleared).root, "clock")!.node.name).toBe("Clock");
  });

  it("a widget dragged into a group that holds an item: tree, z-order and saved data agree (acceptance 13)", () => {
    const { after } = run([{ type: "moveToGroup", ids: ["clock"], groupId: "g-overlay" }]);
    expect(byId(after, "clock").groupId).toBe("g-overlay");
    // On top inside the group, so the topmost part of the page.
    expect(after.placements.at(-1)!.id).toBe("clock");
    const back = readPlacements(desk(), after);
    const overlay = back.root[0];
    expect(overlay.type === "group" && overlay.children.map((c) => c.id)).toEqual(["clock", "glow", "title"]);
  });

  it("an item sent to the back goes under the widgets; brought to the front over them (acceptance 14)", () => {
    const back = run([{ type: "reorder", id: "title", parentId: null, index: 99 }]).after;
    expect(back.placements[0].id).toBe("title");
    expect(byId(back, "title")).not.toHaveProperty("groupId");
    const front = run([{ type: "reorder", id: "title", parentId: null, index: 0 }]).after;
    expect(front.placements.at(-1)!.id).toBe("title");
    // Reordering changes z only, never position.
    expect(byId(front, "title").px).toEqual({ x: 40, y: 30, w: 300, h: 40 });
  });

  it("groups and ungroups: a new group takes the topmost member's place, ungrouping puts its children back there", () => {
    const grouped = run([{ type: "group", ids: ["clock", "weather"], id: "g-right", name: "Right" }]).after;
    expect(grouped.groups!.map((g) => g.id)).toEqual(["g-gauges", "g-overlay", "g-right"]);
    expect(grouped.placements.map((p) => p.id)).toEqual(["cpu", "gpu", "clock", "weather", "agents", "title", "glow"]);
    expect([byId(grouped, "clock").groupId, byId(grouped, "weather").groupId]).toEqual(["g-right", "g-right"]);
    const ungrouped = applyPlacements(desk(), grouped, [{ type: "ungroup", id: "g-right" }]);
    expect(ungrouped.groups!.map((g) => g.id)).toEqual(["g-gauges", "g-overlay"]);
    expect(byId(ungrouped, "clock")).not.toHaveProperty("groupId");
  });

  it("adds a part on top (inside a group when asked) and removes one, nothing else touched", () => {
    const part: PartNode = { type: "part", id: "new", kind: "item", name: "Value", place: { px: { x: 5, y: 5, w: 50, h: 20 } }, ref: { backing: "item", item: text("Value", 5, 5) } };
    const added = run([{ type: "add", part, parentId: "g-overlay" }]).after;
    expect(added.placements.at(-1)).toMatchObject({ id: "new", module: ITEM_ID, groupId: "g-overlay", px: { x: 5, y: 5, w: 50, h: 20 }, visible: true });
    const removed = run([{ type: "remove", id: "weather" }]).after;
    expect(removed.placements.map((p) => p.id)).not.toContain("weather");
    expect(removed.placements).toHaveLength(6);
  });

  it("refuses what makes no sense: a group into itself, an unknown id, an id already there", () => {
    const profile = desk();
    const page = profile.pages[0];
    expect(applyPlacements(profile, page, [{ type: "reorder", id: "g-overlay", parentId: "g-overlay", index: 0 }])).toBe(page);
    expect(applyPlacements(profile, page, [{ type: "move", id: "nope", to: { col: 1, row: 1 } }])).toBe(page);
    const dup: PartNode = { type: "part", id: "cpu", kind: "widget", name: "x", place: { cell: { col: 1, row: 1, cols: 1, rows: 1 } }, ref: { backing: "placement", placement: zone("cpu", "Clock", [1, 1, 1, 1]) } };
    expect(applyPlacements(profile, page, [{ type: "add", part: dup }])).toBe(page);
  });

  it("Snap items is stored only when off", () => {
    const off = run([{ type: "setSnapItems", snapItems: false }]).after;
    expect(off.snapItems).toBe(false);
    const on = applyPlacements(desk(), off, [{ type: "setSnapItems", snapItems: true }]);
    expect(on).not.toHaveProperty("snapItems");
  });

  it("applyPage changes one page of the config as one change; nothing changed gives the same config", () => {
    const config = mergeConfig({ version: 15, profiles: [desk()] } as unknown as StoredConfig);
    expect(applyPage(config, "desk", "main", [])).toBe(config);
    expect(applyPage(config, "desk", "nope", [{ type: "remove", id: "cpu" }])).toBe(config);
    const next = applyPage(config, "desk", "main", [{ type: "remove", id: "cpu" }]);
    expect(partsOf(readPage(next.profiles[0], next.profiles[0].pages[0])!.root).map((p) => p.id)).not.toContain("cpu");
    expect(next.theme).toBe(config.theme);
  });
});
