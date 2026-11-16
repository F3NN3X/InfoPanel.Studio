import { describe, expect, it } from "vitest";
import { addBlock, addOption, newRecipe, recipeIssues, updateBlock } from "@/components/widgets-page/builder-model";
import { plainIssues } from "@/components/widgets-page/plain-issues";
import type { Block, Recipe } from "@/widgets/recipe/types";

// G6 and B10: the validation list in the builder's words. Each problem names its block by its Layers name and an option by its
// label, never a JSON path or a key; every error is listed, and each says what a click selects.

const listOf = (r: Recipe) => plainIssues(r, recipeIssues(r));
const NO_CODE_TERMS = /\$\.|children\[|\.parts\[|\bdecimals\b|\bhours\b/;

describe("validation messages in plain words", () => {
  it("a block's value out of range names the block and the field, with its limits (B10)", () => {
    const ring = addBlock(newRecipe("Card", new Set()), [], "ring", "libre.cpu_total");
    const r = updateBlock(ring.recipe, ring.path, { decimals: 9, name: "Big ring" });
    expect(listOf(r)).toEqual([{ text: "Big ring · Decimals: from 0 to 4", tab: "block", path: [0] }]);
  });

  it("an option's problem says its label, never its key, and opens the Options tab (B10)", () => {
    const r = addOption(newRecipe("Card", new Set()), { key: "hours", label: "Forecast hours", type: "number", default: 99, min: 1, max: 24 });
    expect(listOf(r)).toEqual([{ text: "Option “Forecast hours”: default 99 is outside 1 to 24", tab: "options" }]);
  });

  it("lists every error, not only the first, each pointing at its block", () => {
    const a = addBlock(newRecipe("Card", new Set()), [], "value", "libre.cpu_total");
    const b = addBlock(updateBlock(a.recipe, a.path, { decimals: 7 }), [], "ring", "libre.cpu_total");
    const r = updateBlock(updateBlock(b.recipe, b.path, { thickness: 40 }), [], {});
    const list = listOf(r);
    expect(list.map((x) => x.text)).toEqual(["Value · Decimals: from 0 to 4", "Ring · Thickness: from 2 to 24"]);
    expect(list.map((x) => x.path)).toEqual([[0], [1]]);
    for (const x of list) expect(x.text).not.toMatch(NO_CODE_TERMS);
  });

  it("a binding to an option that is gone, and a condition on one, by the block's name", () => {
    const v = addBlock(newRecipe("Card", new Set()), [], "value", "libre.cpu_total");
    const r = updateBlock(v.recipe, v.path, { bind: { option: "gone" }, when: { option: "gone", is: true } });
    const texts = listOf(r).map((x) => x.text);
    expect(texts).toEqual(["Value · Shows when: option gone is not one of the recipe's options", "Value · Data: option gone is not one of the recipe's options"]);
  });

  it("too deep a tree says the block limit, 6, not the JSON guard's 16 (B10)", () => {
    let r = newRecipe("Deep", new Set());
    let at: number[] = [];
    for (let n = 0; n < 8; n++) {
      const row = addBlock(r, at, "row", "x.y");
      r = row.recipe;
      at = row.path;
    }
    const list = listOf(r);
    expect(list).toEqual([{ text: "Row: blocks nest 7 deep, at most 6", tab: "block", path: [0, 0, 0, 0, 0, 0] }]);
    expect(recipeIssues(r).map((i) => i.message).join(" ")).not.toMatch(/16/);
  });

  it("a text under the floor names its block", () => {
    const v = addBlock(newRecipe("Card", new Set()), [], "value", "libre.cpu_total");
    const r = updateBlock(v.recipe, v.path, { scale: 0.5, name: "Small" });
    expect(listOf(r)[0].text).toMatch(/^Small: text is \d+(\.\d)? px at 2x2, under 11 px/);
  });

  it("a label's part names the part", () => {
    const l = addBlock(newRecipe("Card", new Set()), [], "label", "x.y");
    const r: Recipe = { ...updateBlock(l.recipe, l.path, { text: undefined, parts: [{ text: "a" }, { bind: { field: "temp" } }] }), format: 2 };
    expect(listOf(r).map((x) => x.text)).toEqual(["Label · Part 2 · Data: field temp is read only inside a Repeat"]);
    expect((r.root.children[0] as Block).type).toBe("label");
  });

  it("Phase C: a key format 1 has not got, and warning past critical, in plain words by the block's name", () => {
    const v = addBlock(newRecipe("Card", new Set()), [], "value", "libre.cpu_total");
    const r = updateBlock(v.recipe, v.path, { name: "Clock", align: "center", color: "thresholds", thresholds: { warn: 95, crit: 10 } });
    const list = listOf(r).map((x) => x.text);
    expect(list).toEqual(["Clock · Warning, critical: warning at 95 comes after critical at 10; when high is bad, warning is the lower level", "Clock · Align: text alignment needs recipe format 2"]);
    const low = updateBlock(v.recipe, v.path, { color: "thresholds", thresholds: { warn: 30, crit: 10, low: true } });
    expect(listOf(low).map((x) => x.text)).toEqual(["Value · Warning, critical · Direction: low is bad needs recipe format 2"]);
    for (const x of [...list]) expect(x).not.toMatch(NO_CODE_TERMS);
  });
});
