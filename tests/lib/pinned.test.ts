// Where the kiosk draws a pinned item and how much room it takes (`lib/pinned.ts`); the guard on stored data is in
// tests/lib/settings-migrate.v20.test.ts, the kiosk itself in tests/e2e/pinned-layer.spec.ts.
import { describe, expect, it } from "vitest";
import { clampCells, normalizePinned, pinnedBox, pinnedOnPage, pinnedRoom, type PinnedEdge, type PinnedEdgeItem, type PinnedGridItem } from "@/lib/pinned";
import { chipOverrides } from "@/lib/rail";

const item = (id: string, edge: PinnedEdge, thickness: number, extra: Partial<PinnedEdgeItem> = {}): PinnedEdgeItem => ({
  id,
  edge,
  mode: "room",
  thickness,
  show: "all",
  visible: true,
  placement: { id: `${id}-w`, module: "Clock" },
  ...extra,
});

describe("pinnedOnPage", () => {
  const layer = { items: [item("all", "left", 84), item("some", "top", 40, { show: { pages: ["b"] } }), item("off", "right", 50, { visible: false })] };

  it("draws the visible items shown on the page, none where the page hides the layer", () => {
    expect(pinnedOnPage(layer, "a").map((i) => i.id)).toEqual(["all"]);
    expect(pinnedOnPage(layer, "b").map((i) => i.id)).toEqual(["all", "some"]);
    expect(pinnedOnPage(layer, "b", true)).toEqual([]);
    expect(pinnedOnPage(undefined, "a")).toEqual([]);
  });
});

describe("pinnedRoom and pinnedBox", () => {
  const rail = item("rail", "left", 84);
  const bar = item("bar", "bottom", 84, { inset: 12 });
  const second = item("second", "left", 60);
  const float = item("float", "left", 200, { mode: "float" });
  const all = [rail, bar, second, float];

  it("adds each room item's thickness and inset on its edge; a float takes none", () => {
    expect(pinnedRoom(all)).toEqual({ left: 144, right: 0, top: 0, bottom: 96 });
  });

  it("stacks items on an edge, runs a side item the whole height and a bar between the sides plus the padding", () => {
    expect(pinnedBox(all, rail, 12)).toEqual({ left: 0, top: 0, bottom: 0, width: 84 });
    expect(pinnedBox(all, second, 12)).toEqual({ left: 84, top: 0, bottom: 0, width: 60 });
    expect(pinnedBox(all, bar, 12)).toEqual({ bottom: 12, left: 156, right: 12, height: 84 });
  });

  it("lays a float over the page, past the room the others make on its edge", () => {
    expect(pinnedBox(all, float, 12)).toEqual({ left: 144, top: 0, bottom: 0, width: 200 });
  });
});

describe("pinnedBox with an inset on a side item", () => {
  it("keeps a side panel its inset off the top and bottom as well as its edge (QUESTIONS P3 1)", () => {
    const panel = item("panel", "right", 300, { inset: 12 });
    expect(pinnedBox([panel], panel, 12)).toEqual({ right: 12, top: 12, bottom: 12, width: 300 });
  });
});

describe("a rail's profile chip overrides are guarded as a slot's are", () => {
  const item = (chipItem: unknown) => ({ id: "rail", edge: "left", mode: "room", thickness: 84, show: "all", visible: true, placement: { id: "r", module: "PageRail", settings: { clock: false, chipItem } } });
  const stored = (chipItem: unknown) => normalizePinned({ items: [item(chipItem)] }, ["a"])!.items[0].placement.settings as Record<string, unknown>;

  it("keeps a valid touch, icon, shape, plate, tint, label and name", () => {
    const own = { touch: { hold: { op: "run", command: "calc.exe", confirm: true } }, icon: { from: "set", name: "zap" }, shape: "circle", plate: "card", tint: true, label: false, name: "Me" };
    expect(JSON.parse(stored(JSON.stringify(own)).chipItem as string)).toEqual(own);
    expect(stored(JSON.stringify(own)).clock).toBe(false);
  });

  it("drops an invalid touch action, icon, shape and plate, and a page that is gone; nothing left removes the key", () => {
    const bad = { touch: { tap: { op: "page", to: "gone" }, hold: { op: "format-disk" }, doubleTap: { op: "run", command: "" } }, icon: { from: "url", src: "x" }, shape: "star", plate: "gold", tint: "yes", label: 1, name: "" };
    expect(stored(JSON.stringify(bad))).toEqual({ clock: false });
    const mixed = stored(JSON.stringify({ ...bad, shape: "rounded", touch: { ...bad.touch, hold: { op: "lock" } } }));
    expect(JSON.parse(mixed.chipItem as string)).toEqual({ shape: "rounded", touch: { hold: { op: "lock" } } });
  });

  it("ignores text that is not JSON or not an object", () => {
    expect(stored("{nope")).toEqual({ clock: false });
    expect(stored("[1]")).toEqual({ clock: false });
    expect(chipOverrides({ chipItem: "{nope" })).toEqual({});
  });
});

describe("widgets pinned in place (config v21)", () => {
  const grid = (id: string, extra: Partial<PinnedGridItem> = {}): PinnedGridItem => ({ id, at: { colStart: 2, rowStart: 1, colSpan: 2, rowSpan: 1 }, show: "all", visible: true, placement: { id: `${id}-w`, module: "Clock" }, ...extra });

  it("take no room off the edges, and an edge item's box ignores them", () => {
    const rail = item("rail", "left", 84);
    const all = [grid("g"), rail];
    expect(pinnedRoom(all)).toEqual({ left: 84, right: 0, top: 0, bottom: 0 });
    expect(pinnedBox(all, rail, 12)).toEqual({ left: 0, top: 0, bottom: 0, width: 84 });
  });

  it("clamp cells into a grid: a span no larger than it, a start moved back so it ends inside", () => {
    expect(clampCells({ colStart: 3, rowStart: 1, colSpan: 2, rowSpan: 1 }, 4, 3)).toEqual({ colStart: 3, rowStart: 1, colSpan: 2, rowSpan: 1 });
    expect(clampCells({ colStart: 4, rowStart: 4, colSpan: 2, rowSpan: 9 }, 4, 3)).toEqual({ colStart: 3, rowStart: 1, colSpan: 2, rowSpan: 3 });
  });
});
