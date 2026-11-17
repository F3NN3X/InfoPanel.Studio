import { describe, expect, it } from "vitest";
import { addBlock, moveBlock, newRecipe, removeBlock, updateBlock } from "@/components/widgets-page/builder-model";
import { FLAGS_KEPT_MAX, FLAGS_KEY, flagged, flagsOf, flagsOn, flagsText, followFlags, followPaths, hiddenRule, loadFlags, saveFlags, setKeys, stagePick } from "@/components/widgets-page/editor-flags";
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

// D Q3 (builder plan Phase 4): hide and lock kept across a reload in this browser's storage, by open recipe, never in the recipe
describe("hide and lock across a reload", () => {
  /** A storage in memory. */
  const memory = () => {
    const items = new Map<string, string>();
    return { getItem: (k: string) => items.get(k) ?? null, setItem: (k: string, v: string) => void items.set(k, v), removeItem: (k: string) => void items.delete(k), items };
  };

  it("writes the flags and reads them back; with none on, the key goes", () => {
    const s = memory();
    saveFlags({ "recipe:a": { hidden: ["0.1"], locked: ["1"] }, "recipe:b": { hidden: [], locked: [] } }, s);
    expect(JSON.parse(s.items.get(FLAGS_KEY)!)).toEqual({ "recipe:a": { hidden: ["0.1"], locked: ["1"] } });
    expect(loadFlags(s)).toEqual({ "recipe:a": { hidden: ["0.1"], locked: ["1"] } });
    saveFlags({ "recipe:a": { hidden: [], locked: [] } }, s);
    expect(s.items.has(FLAGS_KEY)).toBe(false);
    expect(loadFlags(s)).toEqual({});
  });

  it("reads only block paths from what is kept, and nothing from a text that is not JSON", () => {
    expect(flagsOf('{"recipe:a":{"hidden":["0.1","", "x", 3, "1.2"],"locked":"0"},"recipe:b":null}')).toEqual({ "recipe:a": { hidden: ["0.1", "1.2"], locked: [] }, "recipe:b": { hidden: [], locked: [] } });
    expect(flagsOf("not json")).toEqual({});
    expect(flagsOf("[1]")).toEqual({});
    expect(flagsOf(null)).toEqual({});
  });

  it("keeps at most the last FLAGS_KEPT_MAX recipes", () => {
    const many = Object.fromEntries(Array.from({ length: FLAGS_KEPT_MAX + 5 }, (_, k) => [`recipe:${k}`, { hidden: ["0"], locked: [] }]));
    const kept = Object.keys(JSON.parse(flagsText(many)));
    expect(kept).toHaveLength(FLAGS_KEPT_MAX);
    expect(kept[0]).toBe("recipe:5");
  });

  it("puts kept flags on a recipe only where it has a block now", () => {
    const r = card();
    expect(flagsOn({ hidden: ["0.1", "5", "0.9"], locked: ["1"] }, r)).toEqual({ recipe: r, hidden: ["0.1"], locked: ["1"] });
  });

  it("a write the storage refuses (full) keeps what it had", () => {
    const s = memory();
    saveFlags({ "recipe:a": { hidden: ["0"], locked: [] } }, s);
    saveFlags({ "recipe:a": { hidden: ["1"], locked: [] } }, { ...s, setItem: () => { throw new Error("QuotaExceededError"); } });
    expect(loadFlags(s)).toEqual({ "recipe:a": { hidden: ["0"], locked: [] } });
  });
});
