import { describe, expect, it } from "vitest";
import { addBlock, newRecipe, setRecipeSize, updateBlock } from "@/components/widgets-page/builder-model";
import { floorIssues, spansOf } from "@/components/widgets-page/size-check";

// "Check every size" (builder plan Phase 3): the sizes it draws and the floor findings it lists at each, by Layers name.

describe("Check every size", () => {
  it("checks every size from Smallest to Largest, columns then rows", () => {
    const r = setRecipeSize(setRecipeSize(newRecipe("W", new Set()), "min", [1, 1]), "max", [2, 3]);
    expect(spansOf(r)).toEqual([
      [1, 1],
      [1, 2],
      [1, 3],
      [2, 1],
      [2, 2],
      [2, 3],
    ]);
    // Largest Any from 2×2: every size up to 12×12
    expect(spansOf(newRecipe("W", new Set()))).toHaveLength(121);
  });

  it("names a text under the floor at a size by its Layers name, as a warning that selects it", () => {
    const r = addBlock(setRecipeSize(newRecipe("W", new Set()), "min", [1, 1]), [], "value", "libre.cpu_total").recipe;
    // a 1×1 base is 7.5 px: a Value at scale 1 is under 11 px there, and fits from 2×2 (15 px)
    expect(floorIssues(r, [1, 1])).toEqual([{ text: "At 1×1, Value's text is 7.5 px, under 11 px", tab: "block", path: [0], warn: true }]);
    expect(floorIssues(r, [2, 2])).toEqual([]);
    expect(floorIssues(updateBlock(r, [0], { name: "Load" }), [1, 1])[0].text).toMatch(/^At 1×1, Load's text/);
  });
});
