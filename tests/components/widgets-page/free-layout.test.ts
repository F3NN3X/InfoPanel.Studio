import { describe, expect, it } from "vitest";
import { blockAt, moveBlocks, recipeIssues, withFormat } from "@/components/widgets-page/builder-model";
import { arrangeBoxes, boxText, clampBox, defaultBox, fitFree, freeParent, freeRefusal, moveGroup, nudgeBoxes, setBoxes, setFree } from "@/components/widgets-page/free-layout";
import { fitLayout } from "@/components/widgets-page/layout-model";
import type { Block, Recipe } from "@/widgets/recipe/types";
import { fixtureRecipe } from "../../widgets/recipe/fixture-files";

// The builder's free layout (format 2): a container switched to Free gives each block the box it is drawn at, back to a flow drops the
// boxes and keeps the order; boxes kept inside their container, moved as a group, nudged, aligned and distributed; the tidy-up after
// any edit keeps a box only where it means something.

const SENSOR = "libre.amd_ryzen_9_9950x3d_cpu_total";
const value = (name: string, extra: Record<string, unknown> = {}): Block => ({ type: "value", name, bind: { sensor: SENSOR }, ...extra }) as Block;
const recipeWith = (blocks: Block[], layout?: "free"): Recipe => {
  const r = fixtureRecipe("cpu-card");
  r.root.children = blocks;
  if (layout) r.root.layout = layout;
  return r;
};
const boxAt = (r: Recipe, path: number[]) => blockAt(r, path)?.box;
const errorsOf = (r: Recipe) => recipeIssues(withFormat(r)).filter((i) => i.severity === "error");
const done = (r: Recipe | { why: string }): Recipe => {
  if ("why" in r) throw new Error(r.why);
  return r;
};

describe("switching a container to Free and back", () => {
  it("gives each block the box it is drawn at, so nothing jumps; a block not drawn takes a default; a background none", () => {
    const r = recipeWith([value("A", { grow: 2 }), value("B"), { type: "label", text: "Behind", background: { opacity: 40 } } as Block]);
    const on = done(setFree(r, [], true, { 0: [0, 0, 0.6, 0.5] }));
    expect(on.root.layout).toBe("free");
    expect(boxAt(on, [0])).toEqual([0, 0, 0.6, 0.5]);
    expect(boxAt(on, [1])).toEqual(defaultBox(1));
    expect(boxAt(on, [2])).toBeUndefined();
    expect(errorsOf(on)).toEqual([]);
  });

  it("back to a flow drops the boxes and keeps the order and the shares: flow, Free, flow is the recipe it was", () => {
    const r = recipeWith([value("A", { grow: 2 }), value("B"), value("C")]);
    const on = done(setFree(r, [], true, { 0: [0.5, 0, 0.5, 0.3], 1: [0, 0, 0.5, 0.3], 2: [0, 0.5, 1, 0.5] }));
    const off = done(setFree(on, [], false));
    expect(off.root.children.map((c) => c.name)).toEqual(["A", "B", "C"]);
    expect(off.root).toEqual(r.root);
  });

  it("drops what a box replaces (an area, a part of its row) and a grid's columns and tracks", () => {
    const r = recipeWith([{ type: "grid", columns: 2, children: [value("A", { fill: 0.5 })] } as Block]);
    const on = done(setFree(r, [0], true));
    expect(blockAt(on, [0])).toEqual({ type: "grid", layout: "free", children: [{ ...value("A"), box: defaultBox(0) }] });
  });

  it("is refused on a Repeat, a block holding none, and inside a Repeat", () => {
    const repeat = { type: "repeat", source: "cores", children: [{ type: "card", children: [] }] } as unknown as Block;
    const r = recipeWith([repeat, value("A")]);
    expect(setFree(r, [0], true)).toEqual({ why: "Only a card, a row or a grid places its blocks freely" });
    expect(setFree(r, [1], true)).toEqual({ why: "Only a card, a row or a grid places its blocks freely" });
    expect(freeRefusal(r, [0, 0])).toBe("A Repeat's items lay their blocks out in order");
    expect(freeRefusal(r, [])).toBeUndefined();
  });

  it("a Free container with no blocks is valid", () => {
    expect(errorsOf(done(setFree(recipeWith([]), [], true)))).toEqual([]);
  });
});

describe("boxes", () => {
  it("are kept inside their container and at least 3 % each way, their sum never past 1", () => {
    expect(clampBox([0.8, -0.2, 0.5, 0.5])).toEqual([0.5, 0, 0.5, 0.5]);
    expect(clampBox([0.1, 0.1, 0.01, 2])).toEqual([0.1, 0, 0.03, 1]);
    for (const b of [[0.66665, 0.1, 0.33335, 0.2], [0.123456, 0.9, 0.876544, 0.1]]) {
      const c = clampBox(b);
      expect(c[0] + c[2]).toBeLessThanOrEqual(1 + 1e-6);
    }
  });

  it("move as a group: held inside as one, so they keep their places to each other", () => {
    expect(moveGroup([[0.1, 0.1, 0.2, 0.2], [0.6, 0.1, 0.3, 0.2]], 0.5, -0.5)).toEqual([[0.2, 0, 0.2, 0.2], [0.7, 0, 0.3, 0.2]]);
  });

  it("nudge by a step together, and say why at the container's edge or across containers", () => {
    const r = recipeWith([value("A", { box: [0, 0, 0.5, 0.5] }), value("B", { box: [0.4, 0.4, 0.5, 0.5] })], "free");
    const moved = done(nudgeBoxes(r, [[0], [1]], 0.01, 0.1));
    expect([boxAt(moved, [0]), boxAt(moved, [1])]).toEqual([[0.01, 0.1, 0.5, 0.5], [0.41, 0.5, 0.5, 0.5]]);
    expect(nudgeBoxes(r, [[0]], -0.01, 0)).toEqual({ why: "A reaches the container's edge" });
    const flow = recipeWith([value("A")]);
    expect(nudgeBoxes(flow, [[0]], 0.01, 0)).toEqual({ why: "Only blocks placed freely in one container move this way" });
  });

  it("align on an edge or a centre line, and distribute with equal gaps, in the container's px", () => {
    const r = recipeWith([value("A", { box: [0, 0, 0.2, 0.2] }), value("B", { box: [0.3, 0.4, 0.2, 0.2] }), value("C", { box: [0.8, 0.1, 0.2, 0.2] })], "free");
    const size = { w: 400, h: 200 };
    const top = done(arrangeBoxes(r, [[0], [1], [2]], "top", size));
    expect([0, 1, 2].map((k) => boxAt(top, [k])![1])).toEqual([0, 0, 0]);
    const spread = done(arrangeBoxes(r, [[0], [1], [2]], "distribute-h", size));
    expect(boxAt(spread, [1])![0]).toBe(0.4);
    expect(arrangeBoxes(r, [[0], [1]], "distribute-v", size)).toEqual({ why: "Distribute needs 3 blocks or more" });
    expect(arrangeBoxes(r, [[0]], "left", size)).toEqual({ why: "Align needs 2 blocks or more" });
    expect(arrangeBoxes(top, [[0], [1], [2]], "top", size)).toEqual({ why: "They are lined up already" });
  });

  it("set one undo step's worth at once, each kept inside", () => {
    const r = recipeWith([value("A", { box: [0, 0, 0.5, 0.5] })], "free");
    expect(boxAt(setBoxes(r, [{ path: [0], box: [0.9, 0, 0.5, 0.5] }]), [0])).toEqual([0.5, 0, 0.5, 0.5]);
    expect(boxText([0.125, 0, 0.5, 0.25])).toBe("x 12.5 %  y 0 %  w 50 %  h 25 %");
  });
});

describe("the tidy-up after any edit", () => {
  it("a block moved into a free container takes a box, one moved out drops it; untouched blocks are kept as they were", () => {
    const r = recipeWith([{ type: "card", layout: "free", children: [value("In", { box: [0.2, 0.2, 0.5, 0.5] })] } as Block, value("Out")]);
    const moved = (from: number[], to: number[], index: number) => {
      const m = moveBlocks(r, [from], to, index);
      if ("why" in m) throw new Error(m.why);
      return m.recipe;
    };
    const fitted = fitFree(fitLayout(moved([1], [0], 1)));
    expect(boxAt(fitted, [0, 1])).toEqual(defaultBox(1));
    expect(errorsOf(fitted)).toEqual([]);
    const back = fitFree(moved([0, 0], [], 2));
    expect(boxAt(back, [2])).toBeUndefined();
    expect(fitFree(r)).toBe(r);
    expect(freeParent(r, [0, 0])).toEqual([0]);
    expect(freeParent(r, [1])).toBeUndefined();
  });

  it("a free layout pasted into a Repeat goes back to a flow", () => {
    const r = recipeWith([{ type: "repeat", source: "cores", children: [{ type: "card", layout: "free", children: [{ type: "value", bind: { field: "load" }, box: [0, 0, 1, 1] }] }] } as unknown as Block]);
    const fitted = fitFree(r);
    expect(blockAt(fitted, [0, 0])).toEqual({ type: "card", children: [{ type: "value", bind: { field: "load" } }] });
  });
});
