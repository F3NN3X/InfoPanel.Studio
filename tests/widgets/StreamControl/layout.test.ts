import { describe, expect, it } from "vitest";
import { clock, planTiles, type Cell } from "@/widgets/StreamControl/layout";

const scenes = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `s${i}`, i }));
const names = (cells: Cell[]) => cells.map((c) => (c.kind === "scene" ? c.scene.id : c.kind));

/** The inner size of a zone of `cols` x `rows` cells of `cell` px (the header takes about 40 px). */
const zone = (cols: number, rows: number, cell: number) => ({ w: cols * cell, h: rows * cell - 40 });

describe("planTiles", () => {
  it("lays out two scenes, live, the other scenes, mic and replay", () => {
    const plan = planTiles({ ...zone(4, 4, 150), scenes: scenes(4), current: "s0", showMic: true, showReplay: true });
    expect(names(plan.cells)).toEqual(["s0", "s1", "live", "s2", "s3", "mic", "replay"]);
    expect(plan.cells.find((c) => c.kind === "live")?.span).toBe(2);
  });

  it("at 4x4 and cell 110 still fits every tile in the grid", () => {
    const plan = planTiles({ ...zone(4, 4, 110), scenes: scenes(4), current: "s1", showMic: true, showReplay: true });
    expect(plan.cells.reduce((n, c) => n + c.span, 0)).toBeLessThanOrEqual(plan.cols * plan.rows);
    expect(names(plan.cells)).toContain("live");
  });

  it("fits only the current scene and the mic in a 2x1 zone (it used to be the live tile alone, with no scene to tap)", () => {
    for (const cell of [110, 150]) {
      const small = planTiles({ ...zone(2, 1, cell), scenes: scenes(3), current: "s2", showMic: true, showReplay: true });
      expect(names(small.cells)).toEqual(["s2", "mic"]);
    }
  });

  it("keeps live, mic and the current scene before the other scenes and the replay in a 4x2 zone", () => {
    for (const cell of [110, 150]) {
      const mid = planTiles({ ...zone(4, 2, cell), scenes: scenes(8), current: "s7", showMic: true, showReplay: true });
      const kept = names(mid.cells);
      expect(kept).toEqual(expect.arrayContaining(["live", "mic", "s7"]));
      expect(kept).not.toContain("replay");
      expect(mid.cells.reduce((n, c) => n + c.span, 0)).toBeLessThanOrEqual(mid.cols * mid.rows);
    }
  });

  it("keeps a scene tappable in a zone of two cells: the live tile is one cell and ranks after the current scene", () => {
    const plan = planTiles({ w: 300, h: 100, scenes: scenes(2), current: "s1", showMic: true, showReplay: true });
    expect(plan.cols * plan.rows).toBe(2);
    expect(names(plan.cells)).toEqual(["s1", "mic"]);
    // With no mic, the live tile takes the second cell.
    const noMic = planTiles({ w: 300, h: 100, scenes: scenes(2), current: "s0", showMic: false, showReplay: false });
    expect(names(noMic.cells)).toEqual(["s0", "live"]);
    expect(noMic.cells.find((c) => c.kind === "live")?.span).toBe(1);
  });

  it("uses only the rows it needs and then spreads the columns", () => {
    const plan = planTiles({ ...zone(4, 4, 150), scenes: scenes(1), current: "s0", showMic: false, showReplay: false });
    expect(names(plan.cells)).toEqual(["s0", "live"]);
    expect(plan.rows).toBe(1);
    expect(plan.cols).toBe(3);
  });

  it("keeps columns between 2 and 6 and at least one row", () => {
    expect(planTiles({ w: 50, h: 20, scenes: [], current: "", showMic: false, showReplay: false })).toMatchObject({ cols: 2, rows: 1 });
    const wide = planTiles({ w: 2400, h: 700, scenes: scenes(30), current: "s0", showMic: true, showReplay: true });
    expect(wide.cols).toBe(6);
  });

  it("gives a tile its size from the gap", () => {
    const plan = planTiles({ w: 440, h: 190, scenes: scenes(2), current: "s0", showMic: false, showReplay: false });
    expect(plan.colW).toBeCloseTo((440 - 8 * (plan.cols - 1)) / plan.cols);
    expect(plan.tileH).toBeCloseTo((190 - 8 * (plan.rows - 1)) / plan.rows);
  });
});

describe("clock", () => {
  it("writes h:mm:ss and survives junk", () => {
    expect(clock(3725)).toBe("1:02:05");
    expect(clock(0)).toBe("0:00:00");
    expect(clock(-5)).toBe("0:00:00");
    expect(clock(Number.NaN)).toBe("0:00:00");
  });
});
