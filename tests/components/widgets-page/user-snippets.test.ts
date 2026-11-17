import { describe, expect, it } from "vitest";
import { blockAt, recipeIssues, withFormat } from "@/components/widgets-page/builder-model";
import { pasteBlocks } from "@/components/widgets-page/clipboard";
import { clipOf, SNIPPET_CAPS, savedSnippets, snippetOf, withoutSnippet, withSnippet } from "@/components/widgets-page/user-snippets";
import type { RecipeSnippet } from "@/lib/layout";
import type { Block, Recipe } from "@/widgets/recipe/types";
import { fixtureRecipe } from "../../widgets/recipe/fixture-files";

// The user's own snippets (builder plan Phase 6): saved from a selection into the config, guarded as read, and inserted into another
// recipe as a paste is, with the options they name.

const recipeWith = (blocks: Block[]): Recipe => {
  const r = fixtureRecipe("cpu-card");
  r.root.children = blocks;
  return r;
};

describe("snippets", () => {
  it("saves the selection with the options it reads, without an area or a background", () => {
    const cpu = fixtureRecipe("cpu-card");
    const s = snippetOf(cpu, [[0]], "  Top row  ", "s1", "2026-11-17");
    if ("why" in s) throw new Error(s.why);
    expect(s.name).toBe("Top row");
    expect(s.blocks).toEqual([cpu.root.children[0]]);
    const placed = recipeWith([{ type: "grid", tracks: { cols: [1], rows: [1] }, children: [{ type: "label", text: "A", area: [1, 1, 1, 1] }, { type: "label", text: "B", background: {} }] } as Block]);
    const two = snippetOf(placed, [[0, 0], [0, 1]], "Two", "s2", "");
    expect("why" in two ? two : two.blocks).toEqual([{ type: "label", text: "A" }, { type: "label", text: "B" }]);
  });

  it("refuses the root, an Image (its picture is the recipe's), and one over the byte cap", () => {
    const r = recipeWith([{ type: "row", children: [{ type: "image", file: "images/a.png" }] } as Block]);
    expect(snippetOf(r, [[]], "x", "s", "")).toHaveProperty("why");
    expect(snippetOf(r, [[0]], "x", "s", "")).toEqual({ why: "A snippet can't hold an Image: its picture belongs to this recipe's package" });
    const part = { text: "A part of forty characters, to fill it.." };
    const big = recipeWith(Array.from({ length: 60 }, () => ({ type: "label", parts: Array(8).fill(part) }) as Block));
    expect(snippetOf(big, big.root.children.map((_, k) => [k]), "Big", "s", "")).toHaveProperty("why");
  });

  it("inserts into another recipe as a paste, bringing its options, and the result validates", () => {
    const cpu = fixtureRecipe("cpu-card");
    const s = snippetOf(cpu, [[0]], "Top row", "s1", "") as RecipeSnippet;
    const target = recipeWith([]);
    target.options = [];
    target.presets = target.presets.filter((p) => p.default).map((p) => ({ ...p, settings: {} }));
    const r = pasteBlocks(target, [], clipOf(s), []);
    if ("why" in r) throw new Error(r.why);
    expect(blockAt(r.recipe, r.paths[0])).toEqual(cpu.root.children[0]);
    expect(r.recipe.options.length).toBeGreaterThan(0);
    expect(recipeIssues(withFormat(r.recipe)).filter((i) => i.severity === "error")).toEqual([]);
  });

  it("guards the saved list: bad entries out, a repeated id once, at most the cap", () => {
    const ok = { id: "a", name: " A ", blocks: [{ type: "label", text: "x" }], options: [], created: "t" };
    expect(savedSnippets(undefined)).toEqual([]);
    expect(savedSnippets([ok, { ...ok }, { ...ok, id: "b", blocks: [] }, { ...ok, id: "c", blocks: ["x"] }, { ...ok, id: "d", options: [1] }, null]).map((s) => [s.id, s.name])).toEqual([["a", "A"]]);
    const many = Array.from({ length: SNIPPET_CAPS.total + 3 }, (_, k) => ({ ...ok, id: `s${k}` }));
    expect(savedSnippets(many)).toHaveLength(SNIPPET_CAPS.total);
    expect(withSnippet(savedSnippets(many), { ...ok, id: "new" })).toHaveProperty("why");
    expect(withoutSnippet(savedSnippets([ok]), "a")).toEqual([]);
  });
});
