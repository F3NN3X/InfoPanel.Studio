import { describe, expect, it } from "vitest";
import { commonValue, setAll, sharedFields } from "@/components/widgets-page/multi-inspector";
import type { Block, Recipe } from "@/widgets/recipe/types";
import { fixtureRecipe } from "../../widgets/recipe/fixture-files";

// The multi-block inspector (builder plan Phase 6): the fields every selected block has, their common value or none when mixed, and
// a value set on all of them as one recipe (one undo step).

const recipeWith = (blocks: Block[]): Recipe => {
  const r = fixtureRecipe("cpu-card");
  r.root.children = blocks;
  return r;
};

describe("the multi-block inspector", () => {
  const v = (extra: Record<string, unknown> = {}) => ({ type: "value", bind: { sensor: "libre.x_y" }, ...extra }) as Block;

  it("offers the fields every selected block has", () => {
    expect(sharedFields([v(), { type: "label", text: "x" } as Block]).map((f) => f.key)).toEqual(["opacity", "scale", "weight", "case", "align", "motion", "grow"]);
    expect(sharedFields([v(), { type: "row", children: [] } as Block]).map((f) => f.key)).toEqual(["motion", "grow"]);
  });

  it("shows a common value, or none for mixed, and sets one on all as one recipe", () => {
    expect(commonValue([v({ weight: "medium" }), v({ weight: "medium" })], "weight")).toBe("medium");
    expect(commonValue([v({ weight: "medium" }), v()], "weight")).toBeUndefined();
    expect(commonValue([v(), v()], "weight")).toBe("");
    const r = setAll(recipeWith([v(), v({ weight: "medium" })]), [[0], [1]], "weight", "semibold");
    expect(r.root.children.map((b) => (b as { weight?: string }).weight)).toEqual(["semibold", "semibold"]);
    const unset = setAll(r, [[0], [1]], "weight", undefined);
    expect(unset.root.children.every((b) => !("weight" in b))).toBe(true);
  });
});
