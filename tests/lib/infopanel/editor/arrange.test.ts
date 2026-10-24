import { describe, expect, it } from "vitest";
import { align, distribute, drawnBefore, hitTest, profilePoint } from "@/lib/infopanel/editor/arrange.ts";
import { defaultItem, type DisplayItem, type GroupItem } from "@/lib/infopanel/schema.ts";

const box = (x: number, y: number, width: number, height: number) => ({ x, y, width, height });

describe("align", () => {
  const placed = [
    { path: "0", box: box(10, 10, 20, 10) },
    { path: "1", box: box(50, 40, 40, 20) },
  ];

  it("lines items up on an edge or centre of the box around them", () => {
    expect(align(placed, "left")).toEqual([{ path: "1", dx: -40, dy: 0 }]);
    expect(align(placed, "right")).toEqual([{ path: "0", dx: 60, dy: 0 }]);
    // The bounds run 10 to 90: centre 50.
    expect(align(placed, "centre")).toEqual([{ path: "0", dx: 30, dy: 0 }, { path: "1", dx: -20, dy: 0 }]);
    expect(align(placed, "top")).toEqual([{ path: "1", dx: 0, dy: -30 }]);
    expect(align(placed, "middle")).toEqual([{ path: "0", dx: 0, dy: 20 }, { path: "1", dx: 0, dy: -15 }]);
    expect(align(placed, "bottom")).toEqual([{ path: "0", dx: 0, dy: 40 }]);
  });

  it("needs two items", () => {
    expect(align(placed.slice(0, 1), "left")).toEqual([]);
  });
});

describe("distribute", () => {
  it("makes the gaps equal, the first and last staying put, whatever the selection order", () => {
    const placed = [
      { path: "2", box: box(100, 0, 20, 10) },
      { path: "0", box: box(0, 0, 10, 10) },
      { path: "1", box: box(20, 50, 30, 10) },
    ];
    // Span 0 to 120, 60 px of boxes: two gaps of 30. The middle one goes to x 40.
    expect(distribute(placed, "horizontal")).toEqual([{ path: "1", dx: 20, dy: 0 }]);
    expect(distribute(placed.slice(0, 2), "horizontal")).toEqual([]);
  });

  it("spreads down as well", () => {
    const placed = [
      { path: "0", box: box(0, 0, 10, 10) },
      { path: "1", box: box(0, 12, 10, 10) },
      { path: "2", box: box(0, 70, 10, 10) },
    ];
    expect(distribute(placed, "vertical")).toEqual([{ path: "1", dx: 0, dy: 23 }]);
  });
});

describe("hitTest", () => {
  const item = (name: string, over: Partial<DisplayItem> = {}) => ({ ...defaultItem("Text"), Name: name, ...over }) as DisplayItem;
  const group = (kids: DisplayItem[], over: Partial<GroupItem> = {}): GroupItem => ({ ...defaultItem("Group"), DisplayItems: kids, ...over });
  const canvas = { Width: 400, Height: 200 };
  const items = [item("background"), item("a"), group([item("b"), item("c")]), item("locked", { IsLocked: true }), group([item("d")], { IsLocked: true }), item("hidden", { Hidden: true })];
  const boxes: Record<string, ReturnType<typeof box>> = { "0": box(0, 0, 400, 200) };
  const boxOf = (p: string) => boxes[p] ?? box(10, 10, 10, 10);

  it("draws in list order, a group's items in its place", () => {
    expect(["2.1", "0", "2", "10", "2.0", "1"].sort(drawnBefore)).toEqual(["0", "1", "2", "2.0", "2.1", "10"]);
  });

  it("picks the topmost item the mouse takes", () => {
    expect(hitTest(items, ["1", "2.0", "2.1"], boxOf, canvas)).toBe("2.1");
  });

  it("lets a click through locked and hidden items, and the items of a locked group", () => {
    expect(hitTest(items, ["1", "3"], boxOf, canvas)).toBe("1");
    expect(hitTest(items, ["1", "4.0", "5"], boxOf, canvas)).toBe("1");
    expect(hitTest(items, ["3", "5"], boxOf, canvas)).toBeNull();
  });

  it("gives a full-canvas background the click only when nothing else is there", () => {
    const front = [item("a"), item("cover")];
    const covers = (p: string) => (p === "1" ? box(0, 0, 400, 200) : box(10, 10, 10, 10));
    expect(hitTest(front, ["0", "1"], covers, canvas)).toBe("0");
    expect(hitTest(front, ["1"], covers, canvas)).toBe("1");
    expect(hitTest(items, ["0"], boxOf, canvas)).toBe("0");
  });
});

describe("profilePoint", () => {
  it("maps a pointer to profile pixels through the fit's zoom and centring", () => {
    const area = { left: 100, top: 50, width: 1000, height: 600 };
    // An 800×480 profile at half size sits 300 px in from the left and 180 down.
    expect(profilePoint({ x: 100 + 300 + 200, y: 50 + 180 + 120 }, area, { Width: 800, Height: 480 }, 0.5)).toEqual({ x: 400, y: 240 });
    expect(profilePoint({ x: 400, y: 230 }, area, { Width: 800, Height: 480 }, 0.5)).toEqual({ x: 0, y: 0 });
    // At 2× the profile overflows the area: the offset is negative.
    expect(profilePoint({ x: 600, y: 350 }, area, { Width: 400, Height: 200 }, 2)).toEqual({ x: 200, y: 100 });
  });
});
