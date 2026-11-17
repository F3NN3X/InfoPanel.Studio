// The builder's clipboard (Phase B1, G10): Copy, Cut and Paste of blocks, inside a recipe and across the recipes open in this session.
// What is copied is the blocks (and what they hold), the options they name and the pictures they show, so a paste into another
// recipe brings what the blocks need along. Pure but for the one session slot; nothing is written to the system clipboard.
// Builder plan Phase 2: Copy style and Paste style, a slot of its own holding one block's look keys (`STYLE_KEYS`).
import { isFollow } from "@/widgets/recipe/follow";
import type { Binding, Block, BlockType, Condition, LabelPart, PackageFile, Recipe, RecipeOption } from "@/widgets/recipe/types";
import { DEVICE_SLOT } from "@/widgets/recipe/validate";
import { addOption, blockAt, bindingsOf, landing, layerName, placeRefusal, topLevel, updateBlock, withSampleItems, type Path } from "./builder-model";

/** What Copy or Cut took: the blocks, the options they name, their pictures, and where from. */
export interface Clip {
  blocks: Block[];
  options: RecipeOption[];
  images: PackageFile[];
  /** The open recipe it came from (its draft key). */
  from: string;
  /** After a Cut: the recipe as the cut left it. A paste into that same recipe, with no edit between, is one undo step with the cut (a move). */
  cut?: Recipe;
}

let slot: Clip | null = null;
/** The session's clipboard (every open recipe shares it). */
export const clipboard = (): Clip | null => slot;
export const setClipboard = (clip: Clip | null): void => {
  slot = clip;
};

/* ───────── Copy style and Paste style (builder plan Phase 2) ───────── */

/** The keys of each block type that are its look, not its data or its place: what Copy style takes. */
export const STYLE_KEYS: Readonly<Record<BlockType, readonly string[]>> = {
  ring: ["color", "thresholds", "opacity", "center", "scale", "thickness", "tone"],
  gauge: ["color", "thresholds", "opacity", "center", "scale", "thickness", "tone", "sweep"],
  bar: ["color", "thresholds", "opacity", "style", "height"],
  sparkline: ["color", "thresholds", "opacity", "style"],
  heatmap: ["color", "opacity"],
  value: ["color", "thresholds", "opacity", "scale", "align", "weight", "case"],
  label: ["tone", "opacity", "scale", "align", "weight", "case"],
  "weather-icon": ["scale"],
  image: ["fit"],
  row: ["direction", "gap", "align"],
  grid: ["columns", "spacing"],
  card: ["surface", "padding", "spacing"],
  repeat: ["direction", "dividers"],
};

const COLOURS = ["accent", "series-1", "series-2", "series-3", "series-4", "series-5", "series-6", "thresholds"];
const ALIGNS = ["start", "center", "end"];
/** The values a key of the same name takes on each type where those differ: a paste of one a type can't hold leaves that key. */
const DOMAIN: Readonly<Record<string, Partial<Record<BlockType, readonly unknown[]>>>> = {
  color: { value: [...COLOURS, "fg", "muted"], ring: COLOURS, gauge: COLOURS, bar: COLOURS, sparkline: COLOURS, heatmap: COLOURS },
  tone: { ring: ["fg", "muted"], gauge: ["fg", "muted"], label: ["fg", "muted", "accent"] },
  align: { value: ALIGNS, label: ALIGNS, row: [...ALIGNS, "stretch"] },
  style: { bar: ["bar", "segments"], sparkline: ["line", "area", "bars"] },
  direction: { row: ["row", "column"], repeat: ["rows", "columns", "grid"] },
};
/** A style key in the words the builder shows. */
const STYLE_WORD: Readonly<Record<string, string>> = {
  color: "colour", thresholds: "warning levels", opacity: "opacity", center: "centre value", scale: "size", thickness: "thickness", tone: "text colour",
  sweep: "arc", style: "style", height: "height", align: "alignment", weight: "weight", case: "case", fit: "fit", direction: "direction", gap: "gap",
  columns: "columns", spacing: "spacing", surface: "ground", padding: "padding", dividers: "dividers",
};

/** What Copy style took: the block's type and name, and each of its type's style keys (undefined: unset, so a paste unsets it too). */
export interface StyleClip {
  type: BlockType;
  name: string;
  style: Record<string, unknown>;
}

let styleSlot: StyleClip | null = null;
/** The session's style clipboard (every open recipe shares it). */
export const styleClipboard = (): StyleClip | null => styleSlot;
export const setStyleClipboard = (clip: StyleClip | null): void => {
  styleSlot = clip;
};

/** Copy style of the block at `at`, or undefined for none there. */
export function copyStyle(recipe: Recipe, at: Path): StyleClip | undefined {
  const b = blockAt(recipe, at);
  if (!b) return undefined;
  const raw = b as unknown as Record<string, unknown>;
  return { type: b.type, name: layerName(recipe, b), style: Object.fromEntries(STYLE_KEYS[b.type].map((k) => [k, structuredClone(raw[k])])) };
}

/** Whether a block of `type` in `recipe` can hold `value` under `key`: its type has the key, and the value is one of its own there. */
function holdsStyle(recipe: Recipe, type: BlockType, key: string, value: unknown): boolean {
  if (!STYLE_KEYS[type].includes(key)) return false;
  // a Repeat's direction may follow an option: only one the recipe has
  if (isFollow(value)) return type === "repeat" && recipe.options.some((o) => o.key === (value as { option: string }).option);
  const allowed = DOMAIN[key]?.[type];
  return value === undefined || !allowed || allowed.includes(value);
}

/**
 * Paste style onto the selected blocks: each takes every style key of the copy its type can hold (set, or unset where the copy's is
 * unset). The keys a block can't hold, set on the copy, are left and named in `skipped` ("centre value", "arc"). Refused when no block
 * takes anything.
 */
export function pasteStyle(recipe: Recipe, paths: readonly Path[], clip: StyleClip): { recipe: Recipe; skipped: string[] } | { why: string } {
  let next = recipe;
  let took = false;
  const skipped = new Set<string>();
  for (const p of paths) {
    const b = blockAt(recipe, p);
    if (!b) continue;
    const patch: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(clip.style)) {
      if (holdsStyle(recipe, b.type, key, value)) patch[key] = structuredClone(value);
      else if (value !== undefined) skipped.add(STYLE_WORD[key] ?? key);
    }
    if (!Object.keys(patch).length) continue;
    took = true;
    next = updateBlock(next, p, patch);
  }
  if (!took) return { why: `${paths.length === 1 ? layerName(recipe, blockAt(recipe, paths[0]) ?? recipe.root) : "These blocks"} can't take the style of ${clip.name}` };
  return { recipe: next, skipped: [...skipped] };
}

/** The settings a block's own value may follow an option through (FORMAT.md §16). */
const FOLLOWS = ["direction", "max", "hours", "units", "window"] as const;

/** Every option key a block, or one it holds, names: a binding, a key's device, the list a Repeat runs over, a condition, a follow. */
export function optionKeysIn(b: Block, out: Set<string> = new Set()): Set<string> {
  for (const bind of bindingsOf(b)) {
    if ("option" in bind) out.add(bind.option);
    if ("sensor" in bind) for (const [, key] of bind.sensor.matchAll(DEVICE_SLOT)) out.add(key);
  }
  if (b.type === "repeat" && b.over) out.add(b.over);
  if (b.when?.option) out.add(b.when.option);
  const raw = b as unknown as Record<string, unknown>;
  for (const k of FOLLOWS) if (isFollow(raw[k])) out.add((raw[k] as { option: string }).option);
  if ("children" in b) for (const c of b.children) optionKeysIn(c, out);
  return out;
}

/** A block (and what it holds) naming option `to` wherever it named `from`. */
export function renameOptionIn(b: Block, from: string, to: string): Block {
  const bind = (x: Binding): Binding => ("option" in x && x.option === from ? { option: to } : "sensor" in x ? { sensor: x.sensor.split(`{${from}}`).join(`{${to}}`) } : x);
  const next = { ...b } as Record<string, unknown>;
  if ("bind" in b && b.bind) next.bind = bind(b.bind);
  if ("cells" in b && b.cells) next.cells = b.cells.map(bind);
  if (b.type === "label" && b.parts) next.parts = b.parts.map((p): LabelPart => ("bind" in p ? { ...p, bind: bind(p.bind) } : p));
  if (b.type === "card" && b.subtitle) next.subtitle = bind(b.subtitle);
  if (b.type === "repeat" && b.over === from) next.over = to;
  if (b.when?.option === from) next.when = { ...b.when, option: to };
  if (b.when?.reading) next.when = { ...(next.when as Condition), reading: { ...b.when.reading, bind: bind(b.when.reading.bind) } };
  for (const k of FOLLOWS) if (isFollow(next[k]) && (next[k] as { option: string }).option === from) next[k] = { ...(next[k] as object), option: to };
  if ("children" in b) next.children = b.children.map((c) => renameOptionIn(c, from, to));
  return next as unknown as Block;
}

/** The pictures a block, or one it holds, shows. */
const filesIn = (b: Block): string[] => [...(b.type === "image" ? [b.file] : []), ...("children" in b ? b.children.flatMap(filesIn) : [])];

/** Copy of the selected blocks (the root left out): copies of them, the options they name, the pictures they show. Undefined for none. */
export function copyOf(recipe: Recipe, paths: readonly Path[], images: readonly PackageFile[], from: string): Clip | undefined {
  const top = topLevel(paths);
  if (!top.length) return undefined;
  const blocks = top.map((p) => structuredClone(blockAt(recipe, p)!));
  const keys = new Set<string>();
  for (const b of blocks) optionKeysIn(b, keys);
  const files = new Set(blocks.flatMap(filesIn));
  return { blocks, options: recipe.options.filter((o) => keys.has(o.key)), images: images.filter((f) => files.has(f.path)), from };
}

/** Whether the target's option of the same key serves a pasted block as well as its own: the same, a device of the same kind, or a place list. */
const serves = (have: RecipeOption, o: RecipeOption): boolean =>
  JSON.stringify(have) === JSON.stringify(o) || (have.type === o.type && (o.type === "place-list" || (o.type === "device" && have.kind === o.kind)));

/**
 * Paste: the clipboard's blocks where Add puts a block (into the selection when it holds blocks, else right after it), refused with the
 * reason a move would give (a Repeat in a Repeat, too deep, a place's field outside a Repeat). An option the blocks name that the
 * recipe lacks comes along (QUESTIONS B1 Q1): the recipe's own of that key is used when it serves, else the pasted one is added under a
 * free key. Returns the pasted blocks' paths, the pictures with the clipboard's added, and the labels of the options added.
 */
export function pasteBlocks(
  recipe: Recipe,
  at: Path,
  clip: Clip,
  images: readonly PackageFile[],
): { recipe: Recipe; paths: number[][]; images: PackageFile[]; added: string[] } | { why: string } {
  const { into, index } = landing(recipe, at);
  for (const b of clip.blocks) {
    const why = placeRefusal(recipe, b, into);
    if (why) return { why };
  }
  let next = recipe;
  let blocks = structuredClone(clip.blocks);
  const added: string[] = [];
  for (const o of clip.options) {
    const have = next.options.find((x) => x.key === o.key);
    if (have && serves(have, o)) continue;
    next = have ? addOption(next, o) : { ...next, options: [...next.options, o] };
    const key = next.options[next.options.length - 1].key;
    if (key !== o.key) blocks = blocks.map((b) => renameOptionIn(b, o.key, key));
    added.push(o.label);
  }
  const target = blockAt(next, into)!;
  const kids = "children" in target ? target.children : [];
  const root = (function put(b: Block, rest: readonly number[]): Block {
    if (!("children" in b)) return b;
    if (!rest.length) return { ...b, children: [...kids.slice(0, index), ...blocks, ...kids.slice(index)] } as Block;
    return { ...b, children: b.children.map((c, k) => (k === rest[0] ? put(c, rest.slice(1)) : c)) } as Block;
  })(next.root, into);
  next = { ...next, root: root as Recipe["root"] };
  if (added.length && next.options.some((o) => o.type === "place-list")) next = withSampleItems(next);
  const have = new Set(images.map((f) => f.path));
  return { recipe: next, paths: blocks.map((_, k) => [...into, index + k]), images: [...images, ...clip.images.filter((f) => !have.has(f.path))], added };
}
