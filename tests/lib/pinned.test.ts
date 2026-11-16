// Where the kiosk draws a pinned item and how much room it takes (`lib/pinned.ts`); the guard on stored data is in
// tests/lib/settings-migrate.v20.test.ts, the kiosk itself in tests/e2e/pinned-layer.spec.ts.
import { describe, expect, it } from "vitest";
import { pinnedBox, pinnedOnPage, pinnedRoom, type PinnedItem } from "@/lib/pinned";

const item = (id: string, edge: PinnedItem["edge"], thickness: number, extra: Partial<PinnedItem> = {}): PinnedItem => ({
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
