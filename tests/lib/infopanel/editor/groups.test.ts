import { describe, expect, it } from "vitest";
import { unitPick } from "@/lib/infopanel/editor/arrange.ts";
import { groupItems, moveItems, ungroupAt } from "@/lib/infopanel/editor/groups.ts";
import { itemAt } from "@/lib/infopanel/editor/ops.ts";
import { flatPaths } from "@/lib/infopanel/canvas-edit.ts";
import { newComposite, newCores, type CompositeType } from "@/lib/infopanel/elements/create.ts";
import { defaultItem, type DisplayItem, type GroupItem } from "@/lib/infopanel/schema.ts";
import { palette, profile } from "../elements/fixture.ts";

const text = (Name: string, X: number): DisplayItem => ({ ...defaultItem("Text"), Name, X, Y: X + 1 });
const grp = (Name: string, kids: DisplayItem[], over: Partial<GroupItem> = {}): GroupItem => ({ ...defaultItem("Group"), Name, X: 0, Y: 0, DisplayItems: kids, ...over });

/** 0 a, 1 g { 1.0 b, 1.1 c, 1.2 h { 1.2.0 e } }, 2 d, 3 Cores { 3.0 3.1 3.2 }, 4 f, 5 locked { 5.0 k } */
const tree = (): DisplayItem[] => [
  text("a", 10),
  grp("g", [text("b", 20), text("c", 30), grp("h", [text("e", 35)])]),
  text("d", 40),
  newCores(profile, palette, [], 300, 300),
  text("f", 50),
  grp("locked", [text("k", 60)], { IsLocked: true }),
];

type Shape = string | { [name: string]: Shape[] };
const shape = (items: readonly DisplayItem[]): Shape[] => items.map((i) => (i.kind === "Group" ? { [i.Name]: shape(i.DisplayItems) } : i.Name));
/** Cores is named by its element, not its bars, in these shapes. */
const flat = (s: Shape[]): Shape[] => s.map((x) => (typeof x === "string" ? x : Object.keys(x)[0] === "Cores" ? "{cores}" : { [Object.keys(x)[0]]: flat(Object.values(x)[0]) }));
/** Every leaf's position on the canvas, by name. */
const places = (items: readonly DisplayItem[]) =>
  Object.fromEntries(flatPaths(items).flatMap((p) => (itemAt(items, p)!.kind === "Group" ? [] : [[itemAt(items, p)!.Name, [itemAt(items, p)!.X, itemAt(items, p)!.Y]]])));
/** The leaves in tree order, which is draw order. */
const order = (items: readonly DisplayItem[]) => flatPaths(items).flatMap((p) => (itemAt(items, p)!.kind === "Group" ? [] : [itemAt(items, p)!.Name]));

const CORES = "Cores places its own bars";

describe("groupItems", () => {
  const cases: { name: string; select: string[]; shape?: Shape[]; path?: string; refused?: string }[] = [
    {
      name: "siblings, at the first one's place",
      select: ["2", "0"],
      path: "0",
      shape: [{ Group: ["a", "d"] }, { g: ["b", "c", { h: ["e"] }] }, "{cores}", "f", { locked: ["k"] }],
    },
    {
      name: "items from different parents, in tree order",
      select: ["4", "1.0", "1.2.0"],
      path: "1.0",
      shape: ["a", { g: [{ Group: ["b", "e", "f"] }, "c", { h: [] }] }, "d", "{cores}", { locked: ["k"] }],
    },
    {
      name: "a group and its child: the group carries the child",
      select: ["1.0", "1"],
      path: "1",
      shape: ["a", { Group: [{ g: ["b", "c", { h: ["e"] }] }] }, "d", "{cores}", "f", { locked: ["k"] }],
    },
    {
      name: "a Cores group goes in whole",
      select: ["3", "4"],
      path: "3",
      shape: ["a", { g: ["b", "c", { h: ["e"] }] }, "d", { Group: ["{cores}", "f"] }, { locked: ["k"] }],
    },
    { name: "a Cores bar is refused", select: ["0", "3.1"], refused: CORES },
    { name: "an item of a locked group is refused", select: ["5.0"], refused: "locked" },
    { name: "nothing selected is refused", select: [], refused: "Nothing" },
  ];

  it.each(cases)("$name", ({ select, shape: want, path, refused }) => {
    const before = tree();
    const r = groupItems(before, select);
    if (refused) {
      expect(r.ok).toBe(false);
      expect(!r.ok && r.reason).toContain(refused);
      return;
    }
    if (!r.ok) throw new Error(r.reason);
    // Cores has four placeholder bars: the tree's shape is checked with them named.
    expect(flat(shape(r.items))).toEqual(want);
    expect(r.path).toBe(path);
    // Children are not offset, and nothing is lost or reordered: same places, same draw order.
    expect(places(r.items)).toEqual(places(before));
    expect(order(r.items).sort()).toEqual(order(before).sort());
    expect(itemAt(r.items, r.path)).toMatchObject({ kind: "Group", Name: "Group", IsExpanded: true });
    // The input tree is untouched.
    expect(shape(before)).toEqual(shape(tree()));
  });
});

describe("moveItems", () => {
  const cases: { name: string; paths: string[]; into: string; at: number; shape?: Shape[]; moved?: string[]; refused?: string }[] = [
    { name: "into a group, at its end", paths: ["0"], into: "1", at: 3, moved: ["0.3"], shape: [{ g: ["b", "c", { h: ["e"] }, "a"] }, "d", "{cores}", "f", { locked: ["k"] }] },
    { name: "into a nested group", paths: ["0"], into: "1.2", at: 1, moved: ["0.2.1"], shape: [{ g: ["b", "c", { h: ["e", "a"] }] }, "d", "{cores}", "f", { locked: ["k"] }] },
    { name: "within a list, before another item", paths: ["0"], into: "", at: 3, moved: ["2"], shape: [{ g: ["b", "c", { h: ["e"] }] }, "d", "a", "{cores}", "f", { locked: ["k"] }] },
    { name: "onto its own place changes nothing", paths: ["0"], into: "", at: 0, moved: ["0"], shape: ["a", { g: ["b", "c", { h: ["e"] }] }, "d", "{cores}", "f", { locked: ["k"] }] },
    { name: "out of a group, to the top", paths: ["1.0"], into: "", at: 0, moved: ["0"], shape: ["b", "a", { g: ["c", { h: ["e"] }] }, "d", "{cores}", "f", { locked: ["k"] }] },
    { name: "out of a nested group, one level up", paths: ["1.2.0"], into: "1", at: 0, moved: ["1.0"], shape: ["a", { g: ["e", "b", "c", { h: [] }] }, "d", "{cores}", "f", { locked: ["k"] }] },
    { name: "several, from different parents, keep their tree order", paths: ["4", "0", "1.0"], into: "1.2", at: 1, moved: ["0.1.1", "0.1.2", "0.1.3"], shape: [{ g: ["c", { h: ["e", "a", "b", "f"] }] }, "d", "{cores}", { locked: ["k"] }] },
    { name: "a Cores group moves in whole", paths: ["3"], into: "1", at: 0, moved: ["1.0"], shape: ["a", { g: ["{cores}", "b", "c", { h: ["e"] }] }, "d", "f", { locked: ["k"] }] },
    { name: "a group into itself is refused", paths: ["1"], into: "1", at: 0, refused: "into itself" },
    { name: "a group into its descendant is refused", paths: ["1"], into: "1.2", at: 0, refused: "into itself" },
    { name: "a Cores bar out is refused", paths: ["3.0"], into: "", at: 0, refused: CORES },
    { name: "an item into Cores is refused", paths: ["0"], into: "3", at: 0, refused: CORES },
    { name: "into a locked group is refused", paths: ["0"], into: "5", at: 0, refused: "locked" },
    { name: "out of a locked group is refused", paths: ["5.0"], into: "", at: 0, refused: "locked" },
    { name: "into an item that isn't a group is refused", paths: ["0"], into: "2", at: 0, refused: "only go into a group" },
  ];

  it.each(cases)("$name", ({ paths, into, at, shape: want, moved, refused }) => {
    const before = tree();
    const r = moveItems(before, paths, into, at);
    if (refused) {
      expect(r.ok).toBe(false);
      expect(!r.ok && r.reason).toContain(refused);
      return;
    }
    if (!r.ok) throw new Error(r.reason);
    expect(flat(shape(r.items))).toEqual(want);
    expect(r.paths).toEqual(moved);
    // Positions are absolute: a move never changes X or Y.
    expect(places(r.items)).toEqual(places(before));
    // The moved items are where the paths say, in the order they had.
    expect(r.paths.map((p) => itemAt(r.items, p)!.Name)).toEqual(flatPaths(before).filter((p) => paths.includes(p)).map((p) => itemAt(before, p)!.Name));
    expect(shape(before)).toEqual(shape(tree()));
  });
});

describe("ungroupAt", () => {
  it("puts the children in the group's place, with their positions and order", () => {
    const before = tree();
    const r = ungroupAt(before, "1")!;
    expect(shape(r.items).slice(0, 5)).toEqual(["a", "b", "c", { h: ["e"] }, "d"]);
    expect(r.paths).toEqual(["1", "2", "3"]);
    expect(places(r.items)).toEqual(places(before));
  });

  it("works inside a group, and a hidden or locked group leaves its children hidden or locked", () => {
    const hidden = [grp("o", [grp("i", [text("x", 5), text("y", 6)], { Hidden: true, IsLocked: true })])];
    const r = ungroupAt(hidden, "0.0")!;
    expect(shape(r.items)).toEqual([{ o: ["x", "y"] }]);
    expect(r.paths).toEqual(["0.0", "0.1"]);
    expect(itemAt(r.items, "0.1")).toMatchObject({ Hidden: true, IsLocked: true });
  });

  it("leaves a Cores group and a non-group alone", () => {
    expect(ungroupAt(tree(), "3")).toBeNull();
    expect(ungroupAt(tree(), "0")).toBeNull();
  });
});

describe("unitPick", () => {
  it("selects the outermost group, unless going in", () => {
    expect(unitPick("1.2.0", [], false)).toBe("1");
    expect(unitPick("1.2.0", [], true)).toBe("1.2.0");
    expect(unitPick("1.0", ["1.1"], false)).toBe("1.0");
    expect(unitPick("4", [], false)).toBe("4");
  });
});

describe("every element-managed group keeps its parts", () => {
  const drives = [{ id: "/nvme/2", name: "Disk A" }];
  const parts: [CompositeType | "cores", string, string][] = [
    ["cores", "Cores places its own bars", "0.0"],
    ["row", "A Row places its own parts", "0.0"],
    ["rows", "Rows places its own rows", "0.0"],
    ["rows", "A Row places its own parts", "0.0.0"],
    ["stack", "A Graph stack places its own graphs and labels", "0.1"],
    ["dual", "A Dual graph places its own graphs", "0.0"],
    ["doublering", "A Double ring places its own rings and value", "0.2"],
    ["drives", "Drives places its own tiles", "0.0"],
    ["drives", "Drives places its own tiles", "0.0.4"],
    ["shadowtext", "Shadow text places its own text and its copy", "0.1"],
  ];
  const make = (type: CompositeType | "cores"): DisplayItem[] => [
    type === "cores" ? newCores(profile, palette, [], 0, 0) : newComposite(type, profile, palette, type === "drives" ? drives : [], 0, 0),
    text("loose", 500),
  ];

  it.each(parts)("%s: a part (%s at %s) can't leave, group or ungroup", (type, reason, part) => {
    const items = make(type);
    expect(itemAt(items, part)).toBeDefined();
    expect(moveItems(items, [part], "", 0)).toMatchObject({ ok: false, reason: expect.stringContaining(reason) });
    expect(groupItems(items, [part])).toMatchObject({ ok: false, reason: expect.stringContaining(reason) });
    if (part.split(".").length === 3) expect(ungroupAt(items, part.split(".").slice(0, 2).join("."))).toBeNull();
  });

  it.each([...new Set(parts.map((p) => p[0]))])("%s: nothing can be dropped into it, and it groups whole", (type) => {
    const items = make(type);
    expect(moveItems(items, ["1"], "0", 0)).toMatchObject({ ok: false, reason: expect.stringContaining("so they can’t be moved in or out") });
    expect(ungroupAt(items, "0")).toBeNull();
    expect(groupItems(items, ["0"]).ok).toBe(true);
  });
});
