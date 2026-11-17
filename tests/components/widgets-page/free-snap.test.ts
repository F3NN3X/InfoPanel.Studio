import { describe, expect, it } from "vitest";
import { areaGuides, clipTo, freeTargets, resizeBy, snapDistance, snapFreeMove, snapFreeResize, spacingSnap } from "@/components/widgets-page/free-snap";

// Smart guides (the free layout and grid areas), in a container's own px: each kind of guide snaps within the distance and is drawn,
// equal spacing shows its gaps, Alt places freely, and a resize holds its shape or its centre.

const SIZE = { w: 400, h: 200 };
const box = (x: number, y: number, width: number, height: number) => ({ x, y, width, height });
const T = 6;

describe("the snap distance", () => {
  it("is 6 screen px at any zoom, and none with Alt", () => {
    expect(snapDistance(1, false)).toBe(6);
    expect(snapDistance(2, false)).toBe(3);
    expect(snapDistance(0.5, false)).toBe(12);
    expect(snapDistance(2, true)).toBe(0);
  });
});

describe("a moved box", () => {
  const sibling = box(100, 50, 80, 40);
  const targets = freeTargets(SIZE, 6, [sibling]);

  it("snaps its edge to a sibling's edge and draws the guide", () => {
    const s = snapFreeMove(box(104, 120, 50, 30), targets, [sibling], T);
    expect(s.box.x).toBe(100);
    expect(s.guides).toContainEqual({ axis: "x", at: 100 });
  });

  it("snaps its centre to a sibling's centre", () => {
    // the sibling's centre line is at y 70; the box's centre at 71, its top and bottom farther from any line
    const s = snapFreeMove(box(300, 56, 40, 30), targets, [sibling], T);
    expect(s.box.y).toBe(55);
    expect(s.guides).toContainEqual({ axis: "y", at: 70 });
  });

  it("snaps to the container's edges, its centre lines and its padding", () => {
    expect(snapFreeMove(box(3, 150, 40, 20), freeTargets(SIZE, 0, []), [], T).box.x).toBe(0);
    expect(snapFreeMove(box(357, 150, 40, 20), freeTargets(SIZE, 0, []), [], T).box.x).toBe(360);
    const centred = snapFreeMove(box(178, 150, 40, 20), freeTargets(SIZE, 0, []), [], T);
    expect(centred.box.x).toBe(180);
    expect(centred.guides).toContainEqual({ axis: "x", at: 200 });
    const padded = snapFreeMove(box(9, 150, 40, 20), freeTargets(SIZE, 6, []), [], T);
    expect(padded.box.x).toBe(6);
    expect(padded.guides).toContainEqual({ axis: "x", at: 6 });
  });

  it("does not snap past the distance, nor with Alt (distance 0), and draws no guide then", () => {
    expect(snapFreeMove(box(230, 120, 50, 30), targets, [sibling], T)).toEqual({ box: box(230, 120, 50, 30), guides: [], gaps: [] });
    const free = snapFreeMove(box(104, 120, 50, 30), targets, [sibling], 0);
    expect(free).toEqual({ box: box(104, 120, 50, 30), guides: [], gaps: [] });
  });
});

describe("equal spacing", () => {
  const left = box(0, 50, 60, 40);
  const right = box(200, 50, 60, 40);

  it("puts a box right between its neighbours, with a marker for each equal gap", () => {
    // the room between them is 140 px: a 50 px box 45 px from each
    const s = spacingSnap(box(103, 60, 50, 20), [left, right], "x", T);
    expect(s?.d).toBe(2);
    expect(s?.gaps.map((g) => g.to - g.from)).toEqual([45, 45]);
  });

  it("repeats a gap two others keep, beside a neighbour", () => {
    const a = box(0, 50, 40, 40);
    const b = box(60, 50, 40, 40);
    // a and b keep a 20 px gap: a box after b lands 20 px on
    const s = spacingSnap(box(123, 55, 30, 30), [a, b], "x", T);
    expect(s?.d).toBe(-3);
    expect(s?.gaps).toHaveLength(2);
    expect(s!.gaps.every((g) => g.to - g.from === 20)).toBe(true);
  });

  it("counts only the blocks of its row, and snaps a move with its markers", () => {
    expect(spacingSnap(box(103, 150, 50, 20), [left, right], "x", T)).toBeNull();
    const targets = freeTargets(SIZE, 0, [left, right]);
    const s = snapFreeMove(box(103, 60, 50, 20), targets, [left, right], T);
    expect(s.box.x).toBe(105);
    expect(s.gaps).toHaveLength(2);
  });
});

describe("a resized box", () => {
  const start = box(100, 50, 100, 50);
  const min = { w: 12, h: 6 };

  it("follows the handle, its moved edge snapping to a sibling's edge", () => {
    const targets = freeTargets(SIZE, 0, [box(250, 0, 40, 40)]);
    const s = snapFreeResize(start, "e", 47, 0, {}, targets, T, SIZE, min);
    expect(s.box).toEqual(box(100, 50, 150, 50));
    expect(s.guides).toContainEqual({ axis: "x", at: 250 });
  });

  it("keeps its shape with Shift and its centre with Alt", () => {
    const targets = freeTargets(SIZE, 0, []);
    expect(snapFreeResize(start, "se", 100, 0, { aspect: true }, targets, T, SIZE, min).box).toEqual(box(100, 50, 200, 100));
    expect(snapFreeResize(start, "e", 20, 0, { centre: true }, targets, T, SIZE, min).box).toEqual(box(80, 50, 140, 50));
  });

  it("never goes under its least size, nor past its container", () => {
    expect(resizeBy(start, "w", 200, 0, false, min)).toEqual(box(188, 50, 12, 50));
    expect(clipTo(box(350, -10, 100, 50), SIZE)).toEqual(box(350, 0, 50, 40));
  });
});

describe("a grid area's guides", () => {
  it("are the track lines its edges or its centre share with another area", () => {
    expect(areaGuides({ col: 2, row: 1, cols: 1, rows: 1 }, [{ col: 1, row: 1, cols: 2, rows: 2 }])).toEqual({ cols: [1, 2], rows: [0, 1] });
    expect(areaGuides({ col: 3, row: 3, cols: 1, rows: 1 }, [{ col: 1, row: 1, cols: 1, rows: 1 }])).toEqual({ cols: [], rows: [] });
  });
});
