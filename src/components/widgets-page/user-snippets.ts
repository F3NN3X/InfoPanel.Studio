// The user's own snippets (builder plan Phase 6): blocks saved from a recipe under a name, kept in the config beside the other things a
// person saves (`config.recipeSnippets`, as `widgetPresets` and `stylePresets` are), and inserted from "Add a block" in any recipe the
// way a paste is (`pasteBlocks`: the options they name come along). A picture is a file of its recipe's package, which the config can't
// hold, so a selection with an Image is refused. The list is guarded here, in the builder's chunk, as it is read.
import type { RecipeSnippet } from "@/lib/layout";
import type { Block, Recipe } from "@/widgets/recipe/types";
import { blockAt, topLevel, type Path } from "./builder-model";
import { type Clip, copyOf } from "./clipboard";

/** How many snippets a person keeps, a name's length, and a snippet's JSON at most. */
export const SNIPPET_CAPS = { total: 32, name: 40, bytes: 16_384 } as const;

const isPlain = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const hasImage = (b: Block): boolean => b.type === "image" || ("children" in b && b.children.some(hasImage));

/**
 * The saved list, guarded: an id, a name, one to 64 blocks that are objects with a type, options that are objects, the whole within
 * its byte cap; a repeated id keeps its first, the list stops at its cap. What a snippet holds is checked again when it is inserted:
 * the recipe it lands in goes through the validator as any edit does.
 */
export function savedSnippets(v: unknown): RecipeSnippet[] {
  if (!Array.isArray(v)) return [];
  const seen = new Set<string>();
  const out: RecipeSnippet[] = [];
  for (const s of v) {
    if (out.length >= SNIPPET_CAPS.total) break;
    if (!isPlain(s) || typeof s.id !== "string" || !s.id || seen.has(s.id) || typeof s.name !== "string" || !s.name.trim()) continue;
    if (!Array.isArray(s.blocks) || !s.blocks.length || s.blocks.length > 64 || !s.blocks.every((b) => isPlain(b) && typeof b.type === "string")) continue;
    if (!Array.isArray(s.options) || !s.options.every(isPlain) || JSON.stringify(s).length > SNIPPET_CAPS.bytes) continue;
    seen.add(s.id);
    out.push({ id: s.id, name: s.name.trim().slice(0, SNIPPET_CAPS.name), blocks: s.blocks, options: s.options, created: typeof s.created === "string" ? s.created.slice(0, 40) : "" });
  }
  return out;
}

/** The selected blocks as a snippet named `name`, or why they can't be one. `id` and `created` are the caller's (the clock, a random id). */
export function snippetOf(recipe: Recipe, paths: readonly Path[], name: string, id: string, created: string): RecipeSnippet | { why: string } {
  const top = topLevel(paths);
  if (!top.length) return { why: "Pick the blocks to save first; the widget's card can't be a snippet" };
  if (top.some((p) => hasImage(blockAt(recipe, p)!))) return { why: "A snippet can't hold an Image: its picture belongs to this recipe's package" };
  const clip = copyOf(recipe, top, [], "")!;
  // an area or a background belongs to where the block stood: inserted elsewhere it starts in the flow
  const blocks = clip.blocks.map((b) => {
    const { area: _area, background: _background, ...rest } = b;
    return rest as Block;
  });
  const snippet = { id, name: name.trim().slice(0, SNIPPET_CAPS.name) || "Snippet", blocks, options: clip.options, created };
  if (JSON.stringify(snippet).length > SNIPPET_CAPS.bytes) return { why: `A snippet is at most ${SNIPPET_CAPS.bytes / 1024} KB; save fewer blocks` };
  return snippet;
}

/** A snippet as the clipboard holds blocks, for `pasteBlocks`: it brings its options along and no pictures. */
export const clipOf = (s: RecipeSnippet): Clip => ({ blocks: structuredClone(s.blocks) as Block[], options: structuredClone(s.options) as Clip["options"], images: [], from: `snippet:${s.id}` });

/** The list with `s` added at its end (refused past the cap) or the one of `id` taken out. */
export const withSnippet = (list: readonly RecipeSnippet[], s: RecipeSnippet): RecipeSnippet[] | { why: string } => (list.length >= SNIPPET_CAPS.total ? { why: `At most ${SNIPPET_CAPS.total} snippets; remove one first` } : [...list, s]);
export const withoutSnippet = (list: readonly RecipeSnippet[], id: string): RecipeSnippet[] => list.filter((s) => s.id !== id);
