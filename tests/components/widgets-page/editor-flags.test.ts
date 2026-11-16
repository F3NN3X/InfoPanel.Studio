import { describe, expect, it } from "vitest";
import { addBlock, moveBlock, newRecipe, removeBlock, updateBlock } from "@/components/widgets-page/builder-model";
import { flagged, followFlags, followPaths, hiddenRule, setKeys, stagePick } from "@/components/widgets-page/editor-flags";
import { recipeBytes } from "@/widgets/recipe/package";
import type { Recipe } from "@/widgets/recipe/types";

// Hide and lock in the builder (Phase D, G25): editor-only states that follow their blocks through each edit and never reach the recipe.

/** A card with a Row holding a Ring and a Value, then a Label: paths 0, 0.0, 0.1, 1. */
function card(): Recipe {
  const row = addBlock(newRecipe("Flags", new Set()), [], "row", "libre.cpu_total");
  const ring = addBlock(row.recipe, row.path, "ring", "libre.cpu_total");
  const value = addBlock(ring.recipe, row.path, "value", "libre.cpu_total");
  return addBlock(value.recipe, [], "label", "libre.cpu_total").recipe;
}

describe("hide and lock in the editor (G25)", () => {
  it("follows a block when it moves, stays on it when it is edited, and goes with it when it is deleted", () => {
    const r = card();
    // the Value moves out of the Row to the end of the card: its flag follows it there
    const moved = moveBlock(r, [0, 1], [], 2).recipe;
    expect(followPaths(r, moved, ["0.1"])).toEqual(["2"]);
    // the Ring edited (a new object at the same path, the same type): the flag stays; the Row holding it too
    const edited = updateBlock(r, [0, 0], { min: 10 });
    expect(followPaths(r, edited, ["0.0", "0"])).toEqual(["0.0", "0"]);
    // deleted: gone; the Label after the deleted Row moves up to 0
    const deleted = removeBlock(r, [0]).recipe;
    expect(followPaths(r, deleted, ["0", "0.0", "1"])).toEqual(["0"]);
    // the same recipe: as they were
    expect(followPaths(r, r, ["1"])).toEqual(["1"]);
  });

  it("followFlags keeps the same object while the recipe is the same, and moves both lists onto a new one", () => {
    const r = card();
    const flags = { recipe: r, hidden: ["0.1"], locked: ["1"] };
    expect(followFlags(flags, r)).toBe(flags);
    const moved = moveBlock(r, [1], [0], 0).recipe;
    expect(followFlags(flags, moved)).toEqual({ recipe: moved, hidden: ["0.2"], locked: ["0.0"] });
  });

  it("puts flags on and off a selection, never on the root card", () => {
    expect(setKeys(["1"], [[0, 1], [], [1]], true)).toEqual(["1", "0.1"]);
    expect(setKeys(["1", "0.1"], [[1]], false)).toEqual(["0.1"]);
    expect(flagged(["0"], [0, 1])).toBe(true);
    expect(flagged(["0"], [1])).toBe(false);
    expect(flagged(["0"], [])).toBe(false);
  });

  it("a click on the stage picks the block holding the outermost locked one, else the block clicked", () => {
    expect(stagePick([], [0, 1])).toEqual([0, 1]);
    expect(stagePick(["0.1"], [0, 1])).toEqual([0]);
    expect(stagePick(["0", "0.1"], [0, 1])).toEqual([]);
    expect(stagePick(["1"], [0, 1])).toEqual([0, 1]);
  });

  it("hides on the stage by a rule on its blocks, and the recipe's bytes never change", () => {
    expect(hiddenRule(["0.1", "1"])).toBe('[data-builder-stage] [data-recipe-path="0.1"]{visibility:hidden}\n[data-builder-stage] [data-recipe-path="1"]{visibility:hidden}');
    expect(hiddenRule([])).toBe("");
    const r = card();
    const before = recipeBytes(r);
    followFlags({ recipe: r, hidden: ["0"], locked: ["1"] }, moveBlock(r, [1], [0], 0).recipe);
    expect(recipeBytes(r)).toEqual(before);
  });
});
