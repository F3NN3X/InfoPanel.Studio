import { describe, expect, it } from "vitest";
import { blockAt, flatten, recipeIssues, withFormat } from "@/components/widgets-page/builder-model";
import { arrangeAreas, backgroundRefusal, dragArea, fillAxis, fitLayout, nearestLine, nudgeArea, parseTracks, resizeArea, restack, setArea, setBackground, setFill, setTracks, snapFill, stepAreaSize, stepFill, trackAt } from "@/components/widgets-page/layout-model";
import type { Block, Recipe } from "@/widgets/recipe/types";
import { fixtureRecipe } from "../../widgets/recipe/fixture-files";

// The builder's layout edits (builder plan Phase 5 and the owner's additions): tracks and areas moved and sized by whole tracks with
// Edit's zone geometry, background layers and the drawing order, a block's part of its column or row, and the tidy-up after any edit.

const SENSOR = "libre.amd_ryzen_9_9950x3d_cpu_total";
const value = (name: string, extra: Record<string, unknown> = {}): Block => ({ type: "value", name, bind: { sensor: SENSOR }, ...extra }) as Block;
const recipeWith = (blocks: Block[]): Recipe => {
  const r = fixtureRecipe("cpu-card");
  r.root.children = blocks;
  return r;
};
const areaAt = (r: Recipe, path: number[]) => blockAt(r, path)?.area;
const errorsOf = (r: Recipe) => recipeIssues(withFormat(r)).filter((i) => i.severity === "error");

describe("tracks", () => {
  it("parses shares typed as text, 1 to 24 of 0.1 to 12", () => {
    expect(parseTracks("1 2 1")).toEqual([1, 2, 1]);
    expect(parseTracks("1, 1.333")).toEqual([1, 1.33]);
    expect(parseTracks("")).toBeUndefined();
    expect(parseTracks("1 0")).toBeUndefined();
    expect(parseTracks("13")).toBeUndefined();
    expect(parseTracks(Array(25).fill("1").join(" "))).toBeUndefined();
  });

  it("on: each block takes the next free cell in reading order, a kept area is pulled inside; off: the areas go", () => {
    const r = recipeWith([{ type: "grid", children: [value("A"), value("B", { area: [5, 5, 2, 2] }), value("C"), { ...value("Bg"), background: {} } as Block] }]);
    const on = setTracks(r, [0], { cols: [1, 1, 1], rows: [1, 1] });
    expect([0, 1, 2, 3].map((k) => areaAt(on, [0, k]))).toEqual([[1, 1, 1, 1], [2, 1, 2, 2], [1, 2, 1, 1], undefined]);
    expect(errorsOf(on)).toEqual([]);
    const off = setTracks(on, [0], undefined);
    expect(blockAt(off, [0])).not.toHaveProperty("tracks");
    expect([0, 1, 2].map((k) => areaAt(off, [0, k]))).toEqual([undefined, undefined, undefined]);
  });
});

describe("areas", () => {
  const tracked = () => setTracks(recipeWith([{ type: "grid", children: [value("A"), value("B")] }]), [0], { cols: [1, 1, 1], rows: [1, 1] });

  it("resizes by an edge or a corner to the nearest track line, never under one track nor out of the grid", () => {
    const a = { col: 2, row: 1, cols: 1, rows: 1 };
    expect(resizeArea(a, { right: true }, { col: 3, row: 0 }, 3, 2)).toEqual({ col: 2, row: 1, cols: 2, rows: 1 });
    expect(resizeArea(a, { left: true, bottom: true }, { col: 0, row: 2 }, 3, 2)).toEqual({ col: 1, row: 1, cols: 2, rows: 2 });
    // dragged past the opposite edge: one track stays
    expect(resizeArea(a, { right: true }, { col: 0, row: 0 }, 3, 2)).toEqual({ col: 2, row: 1, cols: 1, rows: 1 });
    expect(resizeArea(a, { right: true }, { col: 9, row: 0 }, 3, 2)).toEqual({ col: 2, row: 1, cols: 2, rows: 1 });
  });

  it("drags by whole tracks, kept inside; nudges and sizes a track, refused at the edge", () => {
    expect(dragArea({ col: 1, row: 1, cols: 2, rows: 1 }, { col: 0, row: 0 }, { col: 5, row: 1 }, 3, 2)).toEqual({ col: 2, row: 2, cols: 2, rows: 1 });
    const r = tracked();
    const moved = nudgeArea(r, [0, 0], { cols: 1, rows: 0 });
    expect("why" in moved ? moved : areaAt(moved, [0, 0])).toEqual([2, 1, 1, 1]);
    expect(nudgeArea(r, [0, 0], { cols: -1, rows: 0 })).toEqual({ why: "It is at the grid's edge" });
    const grown = stepAreaSize(r, [0, 0], { cols: 0, rows: 1 });
    expect("why" in grown ? grown : areaAt(grown, [0, 0])).toEqual([1, 1, 1, 2]);
    expect(stepAreaSize(r, [0, 0], { cols: -1, rows: 0 })).toEqual({ why: "An area is at least one track" });
    // a block out of a grid with tracks has none to move in
    expect(nudgeArea(recipeWith([value("A")]), [0], { cols: 1, rows: 0 })).toHaveProperty("why");
  });

  it("sets an area pulled inside the tracks", () => {
    expect(areaAt(setArea(tracked(), [0, 1], { col: 3, row: 2, cols: 4, rows: 4 }), [0, 1])).toEqual([1, 1, 3, 2]);
  });

  it("aligns and distributes the selected areas with Edit's arrange, refused where they would overlap", () => {
    let r = tracked();
    r = setArea(setArea(r, [0, 0], { col: 1, row: 1, cols: 1, rows: 1 }), [0, 1], { col: 3, row: 2, cols: 1, rows: 1 });
    const top = arrangeAreas(r, [[0, 0], [0, 1]], [0, 0], "align-top");
    expect("why" in top ? top : areaAt(top, [0, 1])).toEqual([3, 1, 1, 1]);
    const side = setArea(r, [0, 1], { col: 2, row: 1, cols: 1, rows: 1 });
    expect(arrangeAreas(side, [[0, 0], [0, 1]], [0, 0], "align-left")).toHaveProperty("why");
    expect(arrangeAreas(recipeWith([value("A"), value("B")]), [[0], [1]], [0], "align-top")).toHaveProperty("why");
  });

  it("maps a point to its track and to the nearest line", () => {
    expect(trackAt(5, [0, 10, 20])).toBe(0);
    expect(trackAt(25, [0, 10, 20])).toBe(2);
    expect(nearestLine(14, [0, 10, 20], 30)).toBe(1);
    expect(nearestLine(29, [0, 10, 20], 30)).toBe(3);
  });
});

describe("backgrounds and the drawing order", () => {
  it("sets and clears a background, dropping its area, part and share; refuses the root, a Repeat and a fifth layer", () => {
    const r = setTracks(recipeWith([{ type: "grid", children: [value("A", { grow: 2 }), value("B")] }]), [0], { cols: [1], rows: [1, 1] });
    const set = setBackground(r, [[0, 0]], true);
    if ("why" in set) throw new Error(set.why);
    expect(blockAt(set, [0, 0])).toEqual({ type: "value", name: "A", bind: { sensor: SENSOR }, background: {} });
    const cleared = setBackground(set, [[0, 0]], false);
    expect("why" in cleared ? cleared : blockAt(cleared, [0, 0])).not.toHaveProperty("background");
    expect(backgroundRefusal(r, [[]])).toBe("The widget's card can't be a background");
    const full = recipeWith([0, 1, 2, 3].map((k) => ({ ...value(`L${k}`), background: {} }) as Block).concat(value("E")));
    expect(setBackground(full, [[4]], true)).toEqual({ why: "A container holds at most 4 background layers" });
  });

  it("lists backgrounds at the bottom of their container in Layers", () => {
    const r = recipeWith([{ ...value("Bg"), background: {} } as Block, value("A")]);
    expect(flatten(r).map((x) => x.path.join("."))).toEqual(["", "1", "0"]);
  });

  it("moves a block forward, backward, to the front and back among its own kind", () => {
    const r = recipeWith([value("A"), { ...value("Bg"), background: {} } as Block, value("B"), value("C")]);
    const names = (x: Recipe) => x.root.children.map((c) => c.name).join(" ");
    const fwd = restack(r, [0], "forward");
    expect("why" in fwd ? fwd : [names(fwd.recipe), fwd.path]).toEqual(["Bg B A C", [2]]);
    const front = restack(r, [0], "front");
    expect("why" in front ? front : names(front.recipe)).toBe("Bg B C A");
    const back = restack(r, [3], "back");
    expect("why" in back ? back : names(back.recipe)).toBe("C A Bg B");
    expect(restack(r, [0], "backward")).toEqual({ why: "A is drawn under the others already" });
    expect(restack(r, [1], "front")).toEqual({ why: "Bg is drawn over the others already" });
  });
});

describe("a block's part of its column or row", () => {
  it("snaps to 25, 33, 50, 67, 75 and 100 %, and a key steps along them", () => {
    expect(snapFill(0.51)).toBe(0.5);
    expect(snapFill(0.34)).toBe(0.33);
    expect(snapFill(0.42)).toBe(0.42);
    expect(snapFill(0.42, false)).toBe(0.42);
    expect(snapFill(0.02)).toBe(0.1);
    expect(stepFill(1, -1)).toBe(0.75);
    expect(stepFill(0.5, 1)).toBe(0.67);
    expect(stepFill(0.25, -1)).toBe(0.25);
  });

  it("is a width in a card or a column, a height in a row, none in a grid or a Repeat", () => {
    const r = recipeWith([value("A"), { type: "row", children: [value("B")] }, { type: "row", direction: "column", children: [value("C")] }, { type: "grid", children: [value("D")] }]);
    expect([[0], [1, 0], [2, 0], [3, 0], []].map((p) => fillAxis(r, p))).toEqual(["column", "row", "column", undefined, undefined]);
    expect(blockAt(setFill(r, [0], 0.5, "center"), [0])).toMatchObject({ fill: 0.5, place: "center" });
    expect(blockAt(setFill(setFill(r, [0], 0.5, "end"), [0], 1, "end"), [0])).not.toHaveProperty("fill");
  });
});

describe("fitLayout", () => {
  it("drops what no longer has a meaning where a block stands, and keeps an untouched recipe as it is", () => {
    const r = recipeWith([value("A", { area: [1, 1, 1, 1], fill: 0.5 }), { type: "grid", tracks: { cols: [1], rows: [1] }, children: [value("B", { area: [3, 3, 1, 1], fill: 0.5, place: "end" })] }]);
    const fit = fitLayout(r);
    expect(blockAt(fit, [0])).toEqual({ type: "value", name: "A", bind: { sensor: SENSOR }, fill: 0.5 });
    expect(blockAt(fit, [1, 0])).toEqual({ type: "value", name: "B", bind: { sensor: SENSOR }, area: [1, 1, 1, 1] });
    const plain = fixtureRecipe("cpu-card");
    expect(fitLayout(plain)).toBe(plain);
  });
});
