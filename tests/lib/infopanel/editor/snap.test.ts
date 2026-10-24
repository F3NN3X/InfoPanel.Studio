import { describe, expect, it } from "vitest";
import { constrainAxis, guidesAt, keepAspect, SNAP_PX, snapMove, snapResize, snapTargets, snapThreshold, unionBox } from "@/lib/infopanel/editor/snap.ts";

const canvas = { Width: 400, Height: 200 };
const other = { x: 300, y: 50, width: 50, height: 20 };
const targets = snapTargets(canvas, [other]);

describe("snap targets", () => {
  it("are the canvas's edges and centre, then each other box's edges and centre", () => {
    expect(targets.x).toEqual([0, 200, 400, 300, 325, 350]);
    expect(targets.y).toEqual([0, 100, 200, 50, 60, 70]);
  });

  it("snap within 4 screen pixels at any zoom; Alt turns snapping off", () => {
    expect(snapThreshold(1, false)).toBe(SNAP_PX);
    // Zoomed out to half size, a screen pixel is two profile pixels.
    expect(snapThreshold(2, false)).toBe(8);
    expect(snapThreshold(2, true)).toBe(0);
  });
});

describe("snapMove", () => {
  it("snaps the nearest edge or centre within the threshold, and draws its guide", () => {
    // Left edge 3 px off the canvas centre; top 2 px off the other box's top.
    expect(snapMove({ x: 203, y: 48, width: 40, height: 10 }, targets, 4)).toEqual({ dx: -3, dy: 2, guides: [{ axis: "x", at: 200 }, { axis: "y", at: 50 }] });
    // The right edge (297) is 3 px short of the other box's left edge.
    expect(snapMove({ x: 257, y: 120, width: 40, height: 10 }, targets, 4)).toMatchObject({ dx: 3, dy: 0 });
  });

  it("leaves a box beyond the threshold, or with snapping off, where it is", () => {
    expect(snapMove({ x: 210, y: 120, width: 40, height: 10 }, targets, 4)).toEqual({ dx: 0, dy: 0, guides: [] });
    expect(snapMove({ x: 201, y: 49, width: 40, height: 10 }, targets, 0)).toEqual({ dx: 0, dy: 0, guides: [] });
  });

  it("snaps a box already on a line with no shift, still showing the guide", () => {
    expect(snapMove({ x: 0, y: 120, width: 40, height: 10 }, targets, 4)).toEqual({ dx: 0, dy: 0, guides: [{ axis: "x", at: 0 }] });
  });
});

describe("snapResize", () => {
  it("snaps only the edges the handle moves", () => {
    const r = snapResize({ x: 10, y: 10, width: 187, height: 30 }, "e", targets, 4);
    expect(r.box).toEqual({ x: 10, y: 10, width: 190, height: 30 });
    expect(r.guides).toEqual([{ axis: "x", at: 200 }]);
    const nw = snapResize({ x: 2, y: 47, width: 100, height: 30 }, "nw", targets, 4);
    expect(nw.box).toEqual({ x: 0, y: 50, width: 102, height: 27 });
  });
});

describe("Shift", () => {
  it("keeps a drag on the axis it moved further along", () => {
    expect(constrainAxis(12, -5)).toEqual({ dx: 12, dy: 0 });
    expect(constrainAxis(3, -5)).toEqual({ dx: 0, dy: -5 });
  });

  it("keeps a resize in proportion: a square stays square, from a side or a corner", () => {
    const sq = { x: 0, y: 0, width: 50, height: 50 };
    expect(keepAspect(sq, { x: 0, y: 0, width: 80, height: 60 }, "se")).toEqual({ x: 0, y: 0, width: 80, height: 80 });
    expect(keepAspect(sq, { x: 0, y: 0, width: 50, height: 70 }, "s")).toEqual({ x: -10, y: 0, width: 70, height: 70 });
    // A north-west corner keeps the south-east one where it was.
    expect(keepAspect({ x: 10, y: 10, width: 40, height: 20 }, { x: 0, y: 5, width: 50, height: 25 }, "nw")).toEqual({ x: 0, y: 5, width: 50, height: 25 });
    expect(keepAspect({ x: 10, y: 10, width: 40, height: 20 }, { x: -10, y: 10, width: 60, height: 20 }, "w")).toEqual({ x: -10, y: 5, width: 60, height: 30 });
  });
});

describe("guides and union", () => {
  it("finds the lines a box sits on, and the box around several", () => {
    expect(guidesAt({ x: 180, y: 0, width: 40, height: 60 }, targets)).toEqual([{ axis: "x", at: 200 }, { axis: "y", at: 0 }, { axis: "y", at: 60 }]);
    expect(unionBox([{ x: 0, y: 5, width: 10, height: 10 }, { x: 20, y: 0, width: 5, height: 5 }])).toEqual({ x: 0, y: 0, width: 25, height: 15 });
    expect(unionBox([])).toBeNull();
  });
});
