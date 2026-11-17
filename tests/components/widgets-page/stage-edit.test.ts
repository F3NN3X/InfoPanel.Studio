import { describe, expect, it } from "vitest";
import { addBlock, blockAt, moveBlocks, newRecipe, recipeIssues, setShares, updateBlock } from "@/components/widgets-page/builder-model";
import { dragTarget, dropAt, shareEdges, shareText, splitShares, stageStep } from "@/components/widgets-page/stage-edit";
import type { Recipe } from "@/widgets/recipe/types";

// Builder plan Phase 1: the stage's direct edits in the flow model. Where a drop lands (a tile, a dragged block), what a press drags
// (a Repeat's item is its Repeat), the share handles' edges and math, and the arrows' walk. Every result is a recipe the validator takes.

const KEY = "libre.cpu_total";
const errorsOf = (r: Recipe) => recipeIssues(r).filter((i) => i.severity === "error").map((i) => i.message);

/** The root card: a Row of a Ring and a Value, a Label, then a Repeat holding a Value. */
function card(): Recipe {
  let r = addBlock(newRecipe("Stage", new Set()), [], "row", KEY).recipe;
  r = addBlock(r, [0], "ring", KEY).recipe;
  r = addBlock(r, [0], "value", KEY).recipe;
  r = addBlock(r, [], "label", KEY).recipe;
  r = addBlock(r, [], "repeat", KEY).recipe;
  return addBlock(r, [2], "value", KEY).recipe;
}

describe("a drop on the stage", () => {
  it("puts a tile into a container, else before or after a block by the half it is over", () => {
    const r = card();
    expect(dropAt(r, [0], 0.05, false, { tile: "bar" })).toMatchObject({ where: "inside", toParent: [0], index: 2, text: "into Row" });
    expect(dropAt(r, [0, 1], 0.3, true, { tile: "bar" })).toMatchObject({ where: "before", toParent: [0], index: 1, across: true });
    expect(dropAt(r, [0, 1], 0.7, true, { tile: "bar" })).toMatchObject({ where: "after", toParent: [0], index: 2 });
  });

  it("puts a dragged block before or after a container from its ends, into it from its middle", () => {
    const r = card();
    const from = { from: [[1]] };
    expect(dropAt(r, [0], 0.1, false, from)).toMatchObject({ where: "before", toParent: [], index: 0, text: "before Row" });
    expect(dropAt(r, [0], 0.9, false, from)).toMatchObject({ where: "after", toParent: [], index: 1 });
    expect(dropAt(r, [0], 0.5, false, from)).toMatchObject({ where: "inside", toParent: [0], index: 2, why: undefined });
  });

  it("is none on a dragged block or in one", () => {
    const r = card();
    expect(dropAt(r, [0], 0.5, false, { from: [[0]] })).toBeNull();
    expect(dropAt(r, [0, 1], 0.5, true, { from: [[0]] })).toBeNull();
  });

  it("is refused with the validator's reason: a Repeat into a Repeat, a block into what it holds", () => {
    let r = card();
    r = addBlock(r, [], "repeat", KEY).recipe;
    expect(dropAt(r, [2], 0.5, false, { from: [[3]] })?.why).toBe("A Repeat can't go inside another Repeat");
    // a Repeat's item field outside a Repeat
    expect(dropAt(r, [0], 0.5, false, { from: [[2, 0]] })?.why).toMatch(/inside a Repeat only/);
  });

  it("moves a Value from a Row into a nested Card as one edit the validator takes", () => {
    let r = addBlock(card(), [], "card", KEY).recipe;
    const d = dropAt(r, [3], 0.5, false, { from: [[0, 1]] })!;
    expect(d).toMatchObject({ where: "inside", toParent: [3], why: undefined });
    const moved = moveBlocks(r, [[0, 1]], d.toParent, d.index);
    if ("why" in moved) throw new Error(moved.why);
    r = moved.recipe;
    expect(blockAt(r, [2, 0])?.type).toBe("value");
    expect(blockAt(r, [0])).toMatchObject({ type: "row", children: [{ type: "ring" }] });
    expect(errorsOf(r)).toEqual([]);
  });
});

describe("what a press on the stage drags", () => {
  it("is the block, or the Repeat whose item it is in", () => {
    const r = card();
    expect(dragTarget(r, [0, 1])).toEqual([0, 1]);
    expect(dragTarget(r, [2, 0])).toEqual([2]);
    expect(dragTarget(r, [])).toEqual([]);
  });
});

describe("the share handles", () => {
  it("sit on a block's edges with the blocks before and after it in a Row", () => {
    const r = card();
    expect(shareEdges(r, [0, 0])).toEqual([{ a: [0, 0], b: [0, 1], across: true }]);
    expect(shareEdges(r, [0, 1])).toEqual([{ a: [0, 0], b: [0, 1], across: true }]);
    expect(shareEdges(r, [])).toEqual([]);
  });

  it("skip a line of text that keeps its own height in a column, a share of 0, a Grid and a Repeat's items", () => {
    let r = card();
    // the card's Row and its Label: the Label is a line of text with no share
    expect(shareEdges(r, [0])).toEqual([]);
    expect(shareEdges(updateBlock(r, [1], { grow: 1 }), [0])).toEqual([{ a: [0], b: [1], across: false }]);
    expect(shareEdges(updateBlock(r, [0, 1], { grow: 0 }), [0, 0])).toEqual([]);
    expect(shareEdges(r, [2, 0])).toEqual([]);
    r = addBlock(addBlock(addBlock(r, [], "grid", KEY).recipe, [3], "ring", KEY).recipe, [3], "ring", KEY).recipe;
    expect(shareEdges(r, [3, 0])).toEqual([]);
  });

  it("keep the two shares' sum, in 0.01 steps, snapped to 1:3, 1:2, 1:1, 2:1 and 3:1 near them", () => {
    expect(splitShares(2, 0.6)).toEqual({ a: 1.2, b: 0.8 });
    expect(splitShares(2, 0.655)).toEqual({ a: 1.33, b: 0.67 });
    expect(splitShares(3, 0.64)).toEqual({ a: 2, b: 1 });
    expect(splitShares(4, 0.27)).toEqual({ a: 1, b: 3 });
    expect(splitShares(2, 0.52)).toEqual({ a: 1, b: 1 });
    expect(splitShares(2, 0.52, false)).toEqual({ a: 1.04, b: 0.96 });
    expect(shareText(1.33, 0.67)).toBe("67 % | 33 %");
    expect(shareText(1.2, 0.8)).toBe("60 % | 40 %");
  });

  it("refuse a share under 0.1 or over 12", () => {
    expect(splitShares(2, 0.02)).toEqual({ why: "A share under 0.1 leaves its block no room" });
    expect(splitShares(2, 1.2)).toEqual({ why: "A share under 0.1 leaves its block no room" });
    expect(splitShares(20, 0.9)).toEqual({ why: "A share is at most 12" });
  });

  it("write a share of 1 as unset, except on a line of text in a column, where unset is its own height", () => {
    let r = card();
    r = setShares(r, [0, 0], [0, 1], [2, 1]);
    expect(blockAt(r, [0, 0])?.grow).toBe(2);
    expect(blockAt(r, [0, 1])?.grow).toBeUndefined();
    expect(errorsOf(r)).toEqual([]);
    r = setShares(r, [0], [1], [1, 1]);
    expect(blockAt(r, [0])?.grow).toBeUndefined();
    expect(blockAt(r, [1])?.grow).toBe(1);
  });
});

describe("the arrows on the focused stage", () => {
  it("walk to the block before and after, out to the container and into its first block", () => {
    const r = card();
    expect(stageStep(r, [0, 0], "ArrowDown")).toEqual([0, 1]);
    expect(stageStep(r, [0, 1], "ArrowDown")).toBeUndefined();
    expect(stageStep(r, [0, 0], "ArrowUp")).toBeUndefined();
    expect(stageStep(r, [0, 1], "ArrowLeft")).toEqual([0]);
    expect(stageStep(r, [0], "ArrowRight")).toEqual([0, 0]);
    expect(stageStep(r, [1], "ArrowRight")).toBeUndefined();
    expect(stageStep(r, [], "ArrowLeft")).toBeUndefined();
    expect(stageStep(r, [], "ArrowRight")).toEqual([0]);
  });
});
