// The recipe builder's model (Phase 5b), pure: a recipe is edited as a whole value, each edit a new recipe, so undo is a list of
// recipes (`history.ts`). Blocks are found by their path of child indices from the root card (`[]` is the root, `[0, 1]` the
// second child of its first), the same path the renderer writes on each block (`data-recipe-path`), so a click on the stage and
// a row in Layers name the same block. What the validator says (`validate.ts`) is the builder's validation line; nothing here
// writes to the server.
import { get, hw } from "@/widgets/core/data";
import type { Data } from "@/widgets/core/types";
import { readingUnit } from "@/widgets/recipe/convert";
import { cellBasePx, TEXT_FLOOR } from "@/widgets/recipe/metrics";
import { recipeBytes } from "@/widgets/recipe/package";
import { boundSensors, expandKey } from "@/widgets/recipe/reads";
import { BLOCK_TYPES, type Binding, type Block, type BlockType, type CardBlock, type Cells, type Container, type FollowOption, type LabelPart, type PackageFile, type Place, type Recipe, type RecipeDeviceKind, type RecipeOption, type Thresholds } from "@/widgets/recipe/types";
import { DEPTH_MAX, DEVICE_SLOT, format2Keys, ITEMS_MAX, type RecipeIssue, validateRecipe } from "@/widgets/recipe/validate";
import type { WidgetPreset } from "@/widgets/define";

/** A block's place: its child indices from the root card's. */
export type Path = readonly number[];

/** The names "Add a block" and Layers give each block type, in the mockup's order. */
export const BLOCK_LABEL: Readonly<Record<BlockType, string>> = {
  ring: "Ring",
  gauge: "Gauge",
  bar: "Bar",
  sparkline: "Sparkline",
  value: "Value",
  label: "Label",
  "weather-icon": "Weather icon",
  image: "Image",
  heatmap: "Heatmap",
  row: "Row",
  repeat: "Repeat",
  card: "Card",
};
/** "Add a block" in the mockup's order. */
export const ADD_ORDER: readonly BlockType[] = ["ring", "gauge", "bar", "sparkline", "value", "label", "weather-icon", "image", "heatmap", "row", "repeat", "card"];

/** What a device option is called ("Let people pick the CPU"). */
export const DEVICE_LABEL: Readonly<Record<RecipeDeviceKind, string>> = { cpu: "CPU", gpu: "GPU", disk: "Drive", adapter: "Network adapter" };

const isContainer = (b: Block): b is Container => b.type === "card" || b.type === "row" || b.type === "repeat";
const childrenOf = (b: Block): Block[] => (isContainer(b) ? b.children : []);

/* ───────── the tree ───────── */

/** The block at `path` (the root card for `[]`), or undefined. */
export function blockAt(recipe: Recipe, path: Path): Block | undefined {
  let b: Block | undefined = recipe.root;
  for (const k of path) b = b && childrenOf(b)[k];
  return b;
}

/** The Repeat a path runs inside (its nearest), or undefined. */
export function repeatAbove(recipe: Recipe, path: Path): Extract<Block, { type: "repeat" }> | undefined {
  let found: Extract<Block, { type: "repeat" }> | undefined;
  for (let n = 0; n < path.length; n++) {
    const b = blockAt(recipe, path.slice(0, n));
    if (b?.type === "repeat") found = b;
  }
  return found;
}

/** `recipe` with the block at `path` replaced by `fn`'s. */
function mapAt(recipe: Recipe, path: Path, fn: (b: Block) => Block): Recipe {
  const go = (b: Block, rest: Path): Block => {
    if (!rest.length) return fn(b);
    if (!isContainer(b)) return b;
    return { ...b, children: b.children.map((c, k) => (k === rest[0] ? go(c, rest.slice(1)) : c)) } as Block;
  };
  return { ...recipe, root: go(recipe.root, path) as CardBlock };
}

/** Sets a block's fields; a field set to undefined is removed. */
export function updateBlock(recipe: Recipe, path: Path, patch: Record<string, unknown>): Recipe {
  return mapAt(recipe, path, (b) => {
    const next: Record<string, unknown> = { ...b, ...patch };
    for (const [k, v] of Object.entries(patch)) if (v === undefined) delete next[k];
    return next as unknown as Block;
  });
}

/** A new block of a type, bound to what fits where it goes: a Repeat item's field inside a Repeat, else `sensor`. */
export function newBlock(type: BlockType, opts: { sensor: string; inRepeat: boolean; over?: string }): Block {
  const bind: Binding = { sensor: opts.sensor };
  const field = (f: string): Binding => (opts.inRepeat ? { field: f } : bind);
  switch (type) {
    case "card":
      return { type, name: "Card", title: "Card", children: [] };
    case "row":
      return { type, name: "Row", children: [] };
    case "repeat":
      return { type, name: "Repeat", over: opts.over ?? "places", source: "weather-by-place", direction: "rows", max: 4, dividers: true, children: [] };
    case "ring":
    case "gauge":
    case "bar":
      return { type, bind: field("temp"), min: 0, max: 100, color: "accent" };
    case "sparkline":
      return { type, bind: field("hourly"), style: opts.inRepeat ? "bars" : "area", color: "accent" };
    case "value":
      return opts.inRepeat ? { type, bind: field("temp"), unit: "°", decimals: 0 } : { type, bind, label: "Value" };
    case "label":
      return opts.inRepeat ? { type, bind: field("name") } : { type, text: "Label" };
    case "weather-icon":
      return { type, bind: field("condition"), scale: 1.6, grow: 0.6 };
    case "image":
      return { type, file: "images/image.png", fit: "contain" };
    case "heatmap":
      return opts.inRepeat ? { type, bind: field("hourly") } : { type, cells: [bind], min: 0, max: 100 };
  }
}

/**
 * Adds a block next to the selection: into it when it holds blocks, else after it in its parent; the root card when nothing is
 * selected. A Repeat needs a place list to run over: the recipe's first, else a new "Locations" option. Returns the new block's path.
 */
export function addBlock(recipe: Recipe, at: Path, type: BlockType, sensor: string): { recipe: Recipe; path: number[] } {
  const { into, index } = landing(recipe, at);
  return addBlockAt(recipe, into, index, type, sensor);
}

/** Where Add and Paste put a block next to the selection `at`: into it when it holds blocks (at its end), else right after it. */
export function landing(recipe: Recipe, at: Path): { into: number[]; index: number } {
  const target = blockAt(recipe, at);
  return target && isContainer(target) ? { into: [...at], index: target.children.length } : { into: at.slice(0, -1), index: (at[at.length - 1] ?? -1) + 1 };
}

/** Why a new block of `type` may not go into the container at `toParent` (a tile dropped there), or undefined. */
export function addRefusal(recipe: Recipe, type: BlockType, toParent: Path): string | undefined {
  const target = blockAt(recipe, toParent);
  const inRepeat = !!target && (target.type === "repeat" || !!repeatAbove(recipe, [...toParent, 0]));
  return placeRefusal(recipe, newBlock(type, { sensor: "x.y", inRepeat }), toParent);
}

/** Adds a block of `type` into the container at `into`, before its child `index` (a tile dropped on a row). Returns its path. */
export function addBlockAt(recipe: Recipe, into: Path, index: number, type: BlockType, sensor: string): { recipe: Recipe; path: number[] } {
  let next = recipe;
  let over = recipe.options.find((o) => o.type === "place-list")?.key;
  if (type === "repeat" && !over) {
    over = "places";
    next = addOption(next, { key: over, label: "Locations", type: "place-list", default: DEFAULT_PLACES });
  }
  const inRepeat = !!repeatAbove(next, [...into, 0]);
  const block = newBlock(type, { sensor, inRepeat, over });
  const at = Math.max(0, Math.min(index, childrenOf(blockAt(next, into)!).length));
  next = mapAt(next, into, (b) => ({ ...b, children: [...childrenOf(b).slice(0, at), block, ...childrenOf(b).slice(at)] }) as Block);
  return { recipe: type === "repeat" ? withSampleItems(next) : next, path: [...into, at] };
}

/** Takes a block (and what it holds) out; the root stays. Returns the path to select next: its previous sibling, else its parent. */
export function removeBlock(recipe: Recipe, path: Path): { recipe: Recipe; path: number[] } {
  if (!path.length) return { recipe, path: [] };
  const parent = path.slice(0, -1);
  const k = path[path.length - 1];
  const next = mapAt(recipe, parent, (b) => ({ ...b, children: childrenOf(b).filter((_, i) => i !== k) }) as Block);
  const left = childrenOf(blockAt(next, parent)!).length;
  return { recipe: next, path: left === 0 ? parent : [...parent, Math.max(0, k - 1)] };
}

/** A copy of a block (and what it holds) right after it. Returns the copy's path. */
export function duplicateBlock(recipe: Recipe, path: Path): { recipe: Recipe; path: number[] } {
  if (!path.length) return { recipe, path: [] };
  const parent = path.slice(0, -1);
  const k = path[path.length - 1];
  const copy = structuredClone(blockAt(recipe, path)!);
  const next = mapAt(recipe, parent, (b) => ({ ...b, children: [...childrenOf(b).slice(0, k + 1), copy, ...childrenOf(b).slice(k + 1)] }) as Block);
  return { recipe: next, path: [...parent, k + 1] };
}

/** How many levels a block and what it holds take (a block holding nothing is 1). */
const heightOf = (b: Block): number => 1 + Math.max(0, ...childrenOf(b).map(heightOf));
/** Whether a block is or holds a Repeat. */
const holdsRepeat = (b: Block): boolean => b.type === "repeat" || childrenOf(b).some(holdsRepeat);
/** Whether a block, or one it holds outside a Repeat of its own, reads a Repeat item's field. */
const readsField = (b: Block): boolean =>
  b.type !== "repeat" && (bindingsOf(b).some((x) => "field" in x) || childrenOf(b).some(readsField));

/**
 * Why the block at `from` may not go into the container at `toParent`, in the words the drop line shows, or undefined. The rules
 * are the validator's: no Repeat inside a Repeat, no deeper than `DEPTH_MAX`, a field of each place only inside a Repeat.
 */
export function moveRefusal(recipe: Recipe, from: Path, toParent: Path): string | undefined {
  const b = blockAt(recipe, from);
  if (!from.length || !b) return "The widget's card stays where it is";
  const target = blockAt(recipe, toParent);
  if (!target || !isContainer(target)) return "Only a Row, a Card or a Repeat holds blocks";
  if (toParent.length >= from.length && from.every((k, i) => toParent[i] === k)) return "A block can't go inside itself";
  return placeRefusal(recipe, b, toParent);
}

/** Why block `b` (one of the recipe's, or one from elsewhere: a paste) may not go into the container at `toParent`, or undefined. */
export function placeRefusal(recipe: Recipe, b: Block, toParent: Path): string | undefined {
  const target = blockAt(recipe, toParent);
  if (!target || !isContainer(target)) return "Only a Row, a Card or a Repeat holds blocks";
  const inRepeat = target.type === "repeat" || !!repeatAbove(recipe, [...toParent, 0]);
  if (inRepeat && holdsRepeat(b)) return "A Repeat can't go inside another Repeat";
  if (!inRepeat && readsField(b)) return `${layerName(recipe, b)} reads each place's weather: it goes inside a Repeat only`;
  if (toParent.length + 1 + heightOf(b) > DEPTH_MAX) return `Blocks nest at most ${DEPTH_MAX} deep`;
  return undefined;
}

/**
 * Moves a block (and what it holds) into the container at `toParent`, before that container's child `index` as the tree is now (its
 * length: at the end). A move `moveRefusal` refuses, or one to where the block already is, returns the recipe as it was. Returns the
 * block's path after the move.
 */
export function moveBlock(recipe: Recipe, from: Path, toParent: Path, index: number): { recipe: Recipe; path: number[] } {
  if (moveRefusal(recipe, from, toParent)) return { recipe, path: [...from] };
  const parent = from.slice(0, -1);
  const k = from[from.length - 1];
  const same = parent.length === toParent.length && parent.every((x, i) => toParent[i] === x);
  if (same && (index === k || index === k + 1)) return { recipe, path: [...from] };
  const block = blockAt(recipe, from)!;
  const without = mapAt(recipe, parent, (b) => ({ ...b, children: childrenOf(b).filter((_, i) => i !== k) }) as Block);
  // the target's path once the block has left its place: a later sibling of the block (or one inside it) moves up one
  const to = toParent.map((x, i) => (i === parent.length && x > k && parent.every((y, j) => toParent[j] === y) ? x - 1 : x));
  const at = Math.max(0, Math.min(same && index > k ? index - 1 : index, childrenOf(blockAt(without, to)!).length));
  const next = mapAt(without, to, (b) => ({ ...b, children: [...childrenOf(b).slice(0, at), block, ...childrenOf(b).slice(at)] }) as Block);
  return { recipe: next, path: [...to, at] };
}

/** Moves a block one place up or down among its siblings (Alt+↑/↓). Returns its new path (the same one at an end). */
export function stepBlock(recipe: Recipe, path: Path, by: -1 | 1): { recipe: Recipe; path: number[] } {
  if (!path.length) return { recipe, path: [] };
  const k = path[path.length - 1];
  const length = childrenOf(blockAt(recipe, path.slice(0, -1))!).length;
  if (k + by < 0 || k + by >= length) return { recipe, path: [...path] };
  return moveBlock(recipe, path, path.slice(0, -1), by < 0 ? k - 1 : k + 2);
}

/**
 * Where Alt+← (`out`: right after its container, in the container's parent) or Alt+→ (`in`: to the end of the Row, Card or Repeat
 * just above it) takes a block, or why it can't go there.
 */
export function keyMove(recipe: Recipe, path: Path, way: "out" | "in"): { toParent: number[]; index: number } | { why: string } {
  if (!path.length) return { why: "The widget's card stays where it is" };
  const parent = path.slice(0, -1);
  const k = path[path.length - 1];
  if (way === "out") {
    if (!parent.length) return { why: "It is in the widget's card already" };
    const toParent = parent.slice(0, -1);
    const why = moveRefusal(recipe, path, toParent);
    return why ? { why } : { toParent, index: parent[parent.length - 1] + 1 };
  }
  const above = k > 0 ? blockAt(recipe, [...parent, k - 1]) : undefined;
  if (!above || !isContainer(above)) return { why: "There is no Row, Card or Repeat just above it" };
  const toParent = [...parent, k - 1];
  const why = moveRefusal(recipe, path, toParent);
  return why ? { why } : { toParent, index: above.children.length };
}

/* ───────── a selection of blocks (G11) ───────── */

const keyOf = (p: Path): string => p.join(".");
const isInside = (p: Path, outer: Path): boolean => p.length > outer.length && outer.every((k, i) => p[i] === k);
/** Paths in tree order (a parent before what it holds, siblings left to right). */
const byTree = (a: Path, b: Path): number => {
  for (let i = 0; i < Math.min(a.length, b.length); i++) if (a[i] !== b[i]) return a[i] - b[i];
  return a.length - b.length;
};

/** A selection as the blocks it acts on: the root and paths inside another selected block left out, the rest in tree order, once each. */
export function topLevel(paths: readonly Path[]): number[][] {
  const real = paths.filter((p) => p.length > 0);
  const once = [...new Map(real.map((p) => [keyOf(p), [...p]])).values()];
  return once.filter((p) => !once.some((q) => isInside(p, q))).sort(byTree);
}

/** Where each block stands now, found by the object itself (edits keep the blocks they do not touch). */
export function pathsOf(recipe: Recipe, blocks: readonly Block[]): number[][] {
  const rows = flatten(recipe);
  return blocks.flatMap((b) => {
    const row = rows.find((r) => r.block === b);
    return row ? [[...row.path]] : [];
  });
}

/** The tree with `drop` taken out wherever they are; `rebuilt` maps each container to the one that replaces it. */
function without(b: Block, drop: ReadonlySet<Block>, rebuilt: Map<Block, Block>): Block {
  if (!isContainer(b)) return b;
  const kids = b.children.filter((c) => !drop.has(c)).map((c) => without(c, drop, rebuilt));
  const next = kids.length === b.children.length && kids.every((c, i) => c === b.children[i]) ? b : ({ ...b, children: kids } as Block);
  rebuilt.set(b, next);
  return next;
}

/** Takes the selected blocks out (what they hold goes with them). Returns the path to select next, as `removeBlock` does for the first. */
export function removeBlocks(recipe: Recipe, paths: readonly Path[]): { recipe: Recipe; path: number[] } {
  const top = topLevel(paths);
  if (top.length <= 1) return removeBlock(recipe, top[0] ?? []);
  const first = top[0];
  const parent = first.slice(0, -1);
  const before = first[first.length - 1] > 0 ? blockAt(recipe, [...parent, first[first.length - 1] - 1]) : undefined;
  const next = { ...recipe, root: without(recipe.root, new Set(top.map((p) => blockAt(recipe, p)!)), new Map()) as CardBlock };
  const stays = before && pathsOf(next, [before])[0];
  return { recipe: next, path: stays ?? (blockAt(next, parent) ? parent : []) };
}

/**
 * Moves the selected blocks (tree order kept) into the container at `toParent`, before its child `index` as the tree is now: a drag
 * of a selection. Refused, with the first reason, when any of them may not go there. A move that changes nothing returns the recipe
 * as it was. Returns the blocks' paths after it.
 */
export function moveBlocks(recipe: Recipe, from: readonly Path[], toParent: Path, index: number): { recipe: Recipe; paths: number[][] } | { why: string } {
  const top = topLevel(from);
  if (!top.length) return { why: "The widget's card stays where it is" };
  for (const p of top) {
    const why = moveRefusal(recipe, p, toParent);
    if (why) return { why };
  }
  const blocks = top.map((p) => blockAt(recipe, p)!);
  const target = blockAt(recipe, toParent)!;
  const drop = new Set(blocks);
  const rebuilt = new Map<Block, Block>();
  const root = without(recipe.root, drop, rebuilt) as CardBlock;
  const left = { ...recipe, root };
  const into = rebuilt.get(target) ?? target;
  const intoPath = pathsOf(left, [into])[0] ?? [];
  // the gap before the first child at or after `index` that stays, else the end
  const anchor = childrenOf(target).slice(index).find((c) => !drop.has(c));
  const at = anchor ? childrenOf(into).indexOf(rebuilt.get(anchor) ?? anchor) : childrenOf(into).length;
  const next = mapAt(left, intoPath, (b) => ({ ...b, children: [...childrenOf(b).slice(0, at), ...blocks, ...childrenOf(b).slice(at)] }) as Block);
  if (JSON.stringify(next.root) === JSON.stringify(recipe.root)) return { recipe, paths: top };
  return { recipe: next, paths: blocks.map((_, k) => [...intoPath, at + k]) };
}

/**
 * "Wrap in a row" (Ctrl+G): the selected blocks, side by side in one container, go into a new Row where the first was. Refused when
 * they are in different containers, or when the extra level would nest deeper than `DEPTH_MAX`. Returns the Row's path.
 */
export function wrapInRow(recipe: Recipe, paths: readonly Path[]): { recipe: Recipe; path: number[] } | { why: string } {
  const top = topLevel(paths);
  if (!top.length) return { why: "The widget's card can't go into a Row" };
  const parent = top[0].slice(0, -1);
  if (top.some((p) => keyOf(p.slice(0, -1)) !== keyOf(parent))) return { why: "Only blocks in the same container wrap together" };
  const blocks = top.map((p) => blockAt(recipe, p)!);
  if (parent.length + 2 + Math.max(...blocks.map(heightOf)) > DEPTH_MAX) return { why: `Blocks nest at most ${DEPTH_MAX} deep` };
  const row: Block = { type: "row", name: "Row", children: blocks };
  const k = top[0][top[0].length - 1];
  const drop = new Set(blocks);
  const next = mapAt(recipe, parent, (b) => {
    const kids = childrenOf(b);
    return { ...b, children: [...kids.slice(0, k).filter((c) => !drop.has(c)), row, ...kids.slice(k).filter((c) => !drop.has(c))] } as Block;
  });
  return { recipe: next, path: [...parent, k] };
}

/** A copy of each selected block (and what it holds) right after it. Returns the copies' paths. */
export function duplicateBlocks(recipe: Recipe, paths: readonly Path[]): { recipe: Recipe; paths: number[][] } {
  const top = topLevel(paths);
  const copies: Block[] = [];
  let next = recipe;
  // last first, so the paths before it stay where they are
  for (const p of [...top].reverse()) {
    const copy = structuredClone(blockAt(next, p)!);
    copies.unshift(copy);
    const parent = p.slice(0, -1);
    const k = p[p.length - 1];
    next = mapAt(next, parent, (b) => ({ ...b, children: [...childrenOf(b).slice(0, k + 1), copy, ...childrenOf(b).slice(k + 1)] }) as Block);
  }
  return { recipe: next, paths: pathsOf(next, copies) };
}

/** A click with Shift in Layers: every row from the anchor's to `to`'s, in the rows' order (`keys`, top first). */
export function rangeOf(keys: readonly string[], anchor: string, to: string): number[][] {
  const a = keys.indexOf(anchor);
  const b = keys.indexOf(to);
  if (a < 0 || b < 0) return [to ? to.split(".").map(Number) : []];
  return keys.slice(Math.min(a, b), Math.max(a, b) + 1).map((k) => (k ? k.split(".").map(Number) : []));
}

/** Every block with its path, depth first (the root card first): Layers' rows. */
export function flatten(recipe: Recipe): { block: Block; path: number[]; depth: number }[] {
  const out: { block: Block; path: number[]; depth: number }[] = [];
  const walk = (b: Block, path: number[]) => {
    out.push({ block: b, path, depth: path.length });
    childrenOf(b).forEach((c, k) => walk(c, [...path, k]));
  };
  walk(recipe.root, []);
  return out;
}

/** The block count the validation line says. */
export const blockCount = (recipe: Recipe): number => flatten(recipe).length;

/** A block's Layers name: its own, else its type's; a Repeat says what it runs over ("Repeat · Locations"). */
export function layerName(recipe: Recipe, b: Block): string {
  if (b.type === "repeat") return `${b.name && b.name !== "Repeat" ? b.name : "Repeat"} · ${recipe.options.find((o) => o.key === b.over)?.label ?? b.over}`;
  if (b.name) return b.name;
  if (b.type === "card" && b.title) return b.title;
  if (b.type === "value" && b.label) return b.label;
  if (b.type === "label" && b.text) return b.text;
  return BLOCK_LABEL[b.type];
}

/** Whether a block reads data (Layers' link icon). */
export const isBound = (b: Block): boolean => bindingsOf(b).length > 0 || b.type === "repeat";

/* ───────── devices and "Let people pick" ───────── */

/** The device ids a set of readings names, by kind (`hw`): what a sensor key is matched against. */
export function devicesIn(data: Data): Partial<Record<RecipeDeviceKind, string[]>> {
  const found = hw(data);
  return { cpu: found.cpu ? [found.cpu] : [], gpu: found.gpu ? [found.gpu] : [], disk: found.disks, adapter: found.adapters };
}

/** The device a sensor key belongs to (`libre.<id>_...`), or undefined. */
export function deviceOfKey(key: string, devices: Partial<Record<RecipeDeviceKind, string[]>>): { kind: RecipeDeviceKind; id: string } | undefined {
  for (const kind of ["cpu", "gpu", "disk", "adapter"] as const) for (const id of devices[kind] ?? []) if (key.startsWith(`libre.${id}_`)) return { kind, id };
  return undefined;
}

/** The binding a block reads its value through (a card's sub-title for the root). */
function bindingOf(b: Block): Binding | undefined {
  return "bind" in b ? b.bind : b.type === "card" ? b.subtitle : undefined;
}

/** Every binding a block reads through itself: its own, a heatmap's cells, a label's parts. */
export function bindingsOf(b: Block): Binding[] {
  const own = bindingOf(b);
  return [...(own ? [own] : []), ...("cells" in b ? (b.cells ?? []) : []), ...(b.type === "label" ? (b.parts ?? []).flatMap((p) => ("bind" in p ? [p.bind] : [])) : [])];
}

/** The option a binding is open to people through: a sensor option, or the device option its key names. */
export function pickedOption(recipe: Recipe, b: Binding | undefined): RecipeOption | undefined {
  if (!b) return undefined;
  if ("option" in b) return recipe.options.find((o) => o.key === b.option && o.type === "sensor");
  if ("sensor" in b) {
    const slot = [...b.sensor.matchAll(DEVICE_SLOT)][0]?.[1];
    return slot ? recipe.options.find((o) => o.key === slot) : undefined;
  }
  return undefined;
}

/** What "Let people pick …" names for a block: the device its key belongs to, else "the sensor". Undefined for a block that cannot. */
export function pickWhat(recipe: Recipe, path: Path, devices: Partial<Record<RecipeDeviceKind, string[]>>): string | undefined {
  const b = blockAt(recipe, path);
  const bind = b && bindingOf(b);
  if (!bind || "field" in bind) return undefined;
  const picked = pickedOption(recipe, bind);
  if (picked?.type === "device") return `the ${DEVICE_LABEL[picked.kind!]}`;
  if (picked) return "the sensor";
  if ("option" in bind) return undefined;
  const device = deviceOfKey(bind.sensor, devices);
  return device ? `the ${DEVICE_LABEL[device.kind]}` : "the sensor";
}

/** Every sensor key of the tree rewritten by `fn` (bindings, a card's sub-title, heatmap cells). */
export function mapKeys(recipe: Recipe, fn: (key: string) => string): Recipe {
  const bind = (b: Binding | undefined) => (b && "sensor" in b ? { sensor: fn(b.sensor) } : b);
  const go = (b: Block): Block => {
    const next = { ...b } as Record<string, unknown>;
    if ("bind" in b && b.bind) next.bind = bind(b.bind);
    if ("cells" in b && b.cells) next.cells = b.cells.map((c) => bind(c));
    if (b.type === "label" && b.parts) next.parts = b.parts.map((p) => ("bind" in p ? { ...p, bind: bind(p.bind) } : p));
    if (b.type === "card" && b.subtitle) next.subtitle = bind(b.subtitle);
    if (isContainer(b)) next.children = b.children.map(go);
    return next as unknown as Block;
  };
  return { ...recipe, root: go(recipe.root) as CardBlock };
}

/**
 * "Replace sensor…" (G16): every binding of the key `from` (a block's, a heatmap cell's, a label part's, a card's sub-title) and every
 * sensor option holding it as its default reads `to` instead, in one edit. Returns what changed, by Layers name and option label.
 */
export function replaceSensor(recipe: Recipe, from: string, to: string): { recipe: Recipe; changed: string[] } {
  if (!from || from === to) return { recipe, changed: [] };
  const blocks = flatten(recipe)
    .filter(({ block }) => bindingsOf(block).some((b) => "sensor" in b && b.sensor === from))
    .map(({ block }) => layerName(recipe, block));
  const options = recipe.options.filter((o) => o.type === "sensor" && o.default === from);
  const changed = [...blocks, ...options.map((o) => `Option “${o.label}”`)];
  if (!changed.length) return { recipe, changed };
  const keyed = mapKeys(recipe, (k) => (k === from ? to : k));
  return { recipe: { ...keyed, options: keyed.options.map((o) => (options.includes(o) ? { ...o, default: to } : o)) }, changed };
}

const uniqueKey = (base: string, taken: (k: string) => boolean): string => {
  // "Show clock" is showClock
  const words = base.split(/[^A-Za-z0-9]+/).filter(Boolean);
  const stem = words.map((w, k) => (k ? w[0].toUpperCase() + w.slice(1) : w)).join("").replace(/^\d+/, "").slice(0, 28) || "option";
  const key = stem[0].toLowerCase() + stem.slice(1);
  if (!taken(key)) return key;
  for (let n = 2; ; n++) if (!taken(`${key}${n}`)) return `${key}${n}`;
};

/**
 * "Let people pick …" turned on: a block's sensor becomes an option. A key of a device (`libre.<cpu id>_cpu_total`) becomes a
 * device option, and every key of that device in the recipe names it (`libre.{cpu}_…`), so the whole card follows the pick; any
 * other key becomes a sensor option holding it as its default.
 */
export function pickBinding(recipe: Recipe, path: Path, devices: Partial<Record<RecipeDeviceKind, string[]>>): Recipe {
  const b = blockAt(recipe, path);
  const bind = b && bindingOf(b);
  if (!b || !bind || !("sensor" in bind) || bind.sensor.includes("{")) return recipe;
  const device = deviceOfKey(bind.sensor, devices);
  const has = (k: string) => recipe.options.some((o) => o.key === k);
  if (device) {
    const existing = recipe.options.find((o) => o.type === "device" && o.kind === device.kind);
    const key = existing?.key ?? uniqueKey(device.kind, has);
    const withOption = existing ? recipe : addOption(recipe, { key, label: DEVICE_LABEL[device.kind], type: "device", kind: device.kind, default: "auto" });
    return mapKeys(withOption, (k) => (k.startsWith(`libre.${device.id}_`) ? `libre.{${key}}_${k.slice(`libre.${device.id}_`.length)}` : k));
  }
  const key = uniqueKey(layerName(recipe, b), has);
  const next = addOption(recipe, { key, label: layerName(recipe, b).slice(0, 40), type: "sensor", default: bind.sensor });
  return updateBlock(next, path, b.type === "card" ? { subtitle: { option: key } } : { bind: { option: key } });
}

/**
 * "Let people pick …" turned off: the block reads one sensor again. A device option's keys take the device it stands for (its
 * default, or with Auto the one in `data`) everywhere, and the option goes; a sensor option's default comes back into the block,
 * and the option goes once nothing else reads it.
 */
export function unpickBinding(recipe: Recipe, path: Path, data: Data): Recipe {
  const b = blockAt(recipe, path);
  const bind = b && bindingOf(b);
  const option = pickedOption(recipe, bind);
  if (!b || !bind || !option) return recipe;
  if (option.type === "device") {
    const values = { [option.key]: option.default };
    const fixed = mapKeys(recipe, (k) => (k.includes(`{${option.key}}`) ? (expandKey(recipe, k, values, data).key ?? k.replace(`{${option.key}}`, String(option.default))) : k));
    return removeOption(fixed, option.key);
  }
  const back = updateBlock(recipe, path, b.type === "card" ? { subtitle: { sensor: String(option.default) } } : { bind: { sensor: String(option.default) } });
  return optionUses(back, option.key) === 0 ? removeOption(back, option.key) : back;
}

/* ───────── options ───────── */

/** Adds an option (its key made unique). */
export function addOption(recipe: Recipe, option: RecipeOption): Recipe {
  const key = uniqueKey(option.key, (k) => recipe.options.some((o) => o.key === k));
  return { ...recipe, options: [...recipe.options, { ...option, key }] };
}

/** Changes an option's label, default or choices (its key stays: blocks and presets name it). */
export function updateOption(recipe: Recipe, key: string, patch: Partial<Omit<RecipeOption, "key" | "type">>): Recipe {
  return { ...recipe, options: recipe.options.map((o) => (o.key === key ? { ...o, ...patch } : o)) };
}

/** How many blocks name an option (a binding, a key's device, a Repeat, a condition). */
export function optionUses(recipe: Recipe, key: string): number {
  return flatten(recipe).filter(({ block: b }) => {
    return (
      bindingsOf(b).some((bind) => ("option" in bind && bind.option === key) || ("sensor" in bind && bind.sensor.includes(`{${key}}`))) ||
      (b.type === "repeat" && b.over === key) ||
      b.when?.option === key
    );
  }).length;
}

/** Takes an option out, and its values out of every preset. A block that still names it is the validator's to report. */
export function removeOption(recipe: Recipe, key: string): Recipe {
  return {
    ...recipe,
    options: recipe.options.filter((o) => o.key !== key),
    presets: recipe.presets.map((p) => ({ ...p, settings: Object.fromEntries(Object.entries(p.settings).filter(([k]) => k !== key)) })),
  };
}

/** Moves an option from one place in the list to another (drag to order). */
export function moveOption(recipe: Recipe, from: number, to: number): Recipe {
  if (from === to || from < 0 || to < 0 || from >= recipe.options.length || to >= recipe.options.length) return recipe;
  const list = [...recipe.options];
  const [moved] = list.splice(from, 1);
  list.splice(to, 0, moved);
  return { ...recipe, options: list };
}

/** The line under an option in the Options tab: its kind and default ("Device · Auto", "Toggle · On", "Place list · Oslo, Brevik"). */
export function optionLine(o: RecipeOption): string {
  const kind = { text: "Text", number: "Number", select: "Choice", boolean: "Toggle", color: "Colour", sensor: "Sensor", date: "Date", time: "Time", "place-list": "Place list", device: "Device" }[o.type];
  return `${kind} · ${valueText(o, o.default)}`;
}

/** An option's value as people read it. */
export function valueText(o: RecipeOption, v: unknown): string {
  if (o.type === "boolean") return v ? "On" : "Off";
  if (o.type === "device") return v === "auto" || !v ? "Auto" : String(v);
  if (o.type === "select") return o.options?.find((c) => c.value === v)?.label ?? String(v);
  if (o.type === "place-list") return (Array.isArray(v) ? (v as Place[]) : []).map((p) => p.name).join(", ") || "None";
  return String(v ?? "");
}

/* ───────── presets ───────── */

/** The option values a preset sets over the defaults (a place list as the recipe holds it, not as JSON text). */
export function presetValues(recipe: Recipe, preset: WidgetPreset | undefined): Record<string, unknown> {
  return Object.fromEntries(
    recipe.options.map((o) => {
      const v = preset?.settings[o.key];
      if (v === undefined) return [o.key, o.default];
      return [o.key, o.type === "place-list" && typeof v === "string" ? JSON.parse(v) : v];
    }),
  );
}

const slug = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").replace(/^[^a-z]+/, "").slice(0, 40) || "preset";

/** "Save current as a preset": the values that differ from the defaults and the stage's size, under a unique id. */
export function savePreset(recipe: Recipe, name: string, values: Record<string, unknown>, size: Cells): Recipe {
  const ids = new Set(recipe.presets.map((p) => p.id));
  let id = slug(name);
  for (let n = 2; ids.has(id); n++) id = `${slug(name)}-${n}`;
  const settings = Object.fromEntries(
    recipe.options.flatMap((o) => {
      const v = values[o.key];
      if (v === undefined || JSON.stringify(v) === JSON.stringify(o.default)) return [];
      return [[o.key, o.type === "place-list" ? JSON.stringify(v) : v]];
    }),
  ) as WidgetPreset["settings"];
  const preset: WidgetPreset = { id, name: name.slice(0, 40), settings, size: [...size] as Cells, ...(recipe.presets.length ? {} : { default: true as const }) };
  return { ...recipe, presets: [...recipe.presets, preset] };
}

/**
 * One option's value in a preset. The default preset is what a fresh add is, and Add writes no settings for it (FORMAT.md §13), so
 * there the value is the option's default; any other preset keeps the values that differ from the defaults.
 */
export function setPresetValue(recipe: Recipe, id: string, key: string, value: unknown): Recipe {
  const preset = recipe.presets.find((p) => p.id === id);
  const o = recipe.options.find((x) => x.key === key);
  if (!preset || !o) return recipe;
  if (preset.default) return updateOption(recipe, key, { default: value as RecipeOption["default"] });
  const { [key]: _old, ...rest } = preset.settings;
  const same = JSON.stringify(value) === JSON.stringify(o.default);
  const settings = same ? rest : { ...rest, [key]: (o.type === "place-list" ? JSON.stringify(value) : value) as string | number | boolean };
  return { ...recipe, presets: recipe.presets.map((p) => (p.id === id ? { ...p, settings } : p)) };
}

/** Changes a preset's name, blurb or size. */
export function updatePreset(recipe: Recipe, id: string, patch: Partial<Pick<WidgetPreset, "name" | "blurb" | "size">>): Recipe {
  return { ...recipe, presets: recipe.presets.map((p) => (p.id === id ? { ...p, ...patch } : p)) };
}

/** Makes a preset the default (what a fresh add is). */
export function setDefaultPreset(recipe: Recipe, id: string): Recipe {
  return { ...recipe, presets: recipe.presets.map(({ default: _d, ...p }) => (p.id === id ? { ...p, default: true as const } : p)) };
}

/** Takes a preset out; the last one stays (a recipe has one), and a removed default passes to the first left. */
export function removePreset(recipe: Recipe, id: string): Recipe {
  if (recipe.presets.length <= 1) return recipe;
  const left = recipe.presets.filter((p) => p.id !== id);
  return left.some((p) => p.default) ? { ...recipe, presets: left } : setDefaultPreset({ ...recipe, presets: left }, left[0].id);
}

/** The line under a preset: its blurb, else what it sets, and its size ("Ring and temperature · 2×2"). */
export function presetLine(recipe: Recipe, p: WidgetPreset): string {
  const set = Object.entries(p.settings).map(([k, v]) => {
    const o = recipe.options.find((x) => x.key === k);
    return o ? `${o.label} ${valueText(o, o.type === "place-list" && typeof v === "string" ? JSON.parse(v) : v)}` : k;
  });
  return `${p.blurb ?? (set.join(", ") || "Every option at its default")} · ${p.size[0]}×${p.size[1]}`;
}

/* ───────── recipes ───────── */

/** A free `recipe:<id>` for a name. */
export function recipeIdFor(name: string, taken: ReadonlySet<string>): string {
  const base = `recipe:${slug(name).slice(0, 40)}`.replace(/-$/, "");
  if (!taken.has(base)) return base;
  for (let n = 2; ; n++) if (!taken.has(`${base}-${n}`)) return `${base}-${n}`;
}

/** A new, empty recipe: a card at 3×2, from 2×2 to 4×3, one default preset. */
export function newRecipe(name: string, taken: ReadonlySet<string>): Recipe {
  return {
    format: 1,
    id: recipeIdFor(name, taken),
    name,
    version: "1.0.0",
    author: "Made in Studio",
    category: "Recipes",
    icon: "dashboard",
    size: { min: [2, 2], max: [4, 3], default: [3, 2] },
    options: [],
    presets: [{ id: "default", name: "Default", settings: {}, size: [3, 2], default: true }],
    root: { type: "card", title: name, children: [] },
    sample: { sensors: {} },
  };
}

/** A copy under a new name and id, at version 1.0.0 ("Duplicate"). */
export function duplicateRecipe(recipe: Recipe, name: string, taken: ReadonlySet<string>): Recipe {
  return { ...structuredClone(recipe), id: recipeIdFor(name, taken), name, version: "1.0.0", author: "Made in Studio" };
}

/** The next patch version, for a save over a stored recipe (a placement keeps the version it was added with). */
export const nextVersion = (v: string): string => {
  const [a, b, c] = v.split("-")[0].split(".").map(Number);
  return `${a}.${b}.${(c || 0) + 1}`;
};

/** The places a new Locations option starts with (the mockup's). */
export const DEFAULT_PLACES: Place[] = [
  { name: "Oslo", lat: 59.91, lon: 10.75 },
  { name: "Brevik", lat: 59.05, lon: 9.7 },
  { name: "Tokyo", lat: 35.68, lon: 139.69 },
];

/** Sample weather by place name (the builder's Sample and a new recipe's preview); any other place gets one made from its coordinates. */
const SAMPLE_WEATHER: Record<string, { condition: string; temp: number; high: number; low: number; hourly: number[] }> = {
  Oslo: { condition: "Cloudy", temp: 4, high: 6, low: 1, hourly: [3, 3, 4, 4, 5, 5, 4, 4] },
  Brevik: { condition: "Light rain", temp: 5, high: 7, low: 3, hourly: [4, 4, 5, 5, 6, 5, 5, 4] },
  Tokyo: { condition: "Clear", temp: 14, high: 17, low: 9, hourly: [10, 12, 14, 16, 17, 15, 13, 11] },
};
const CONDITIONS = ["Clear", "Partly cloudy", "Cloudy", "Light rain", "Rain", "Snow"];

/** One place's sample weather. */
export function sampleWeather(p: Place): Record<string, string | number | number[]> {
  const known = SAMPLE_WEATHER[p.name];
  if (known) return { name: p.name, ...known };
  const temp = Math.round(25 - Math.abs(p.lat) * 0.4);
  const condition = CONDITIONS[Math.abs(Math.round(p.lat * 7 + p.lon * 3)) % CONDITIONS.length];
  return { name: p.name, condition, temp, high: temp + 3, low: temp - 4, hourly: Array.from({ length: 8 }, (_, k) => temp - 2 + Math.round(3 * Math.sin(k / 2))) };
}

/** The recipe's sample items: for every place-list option, its default places' sample weather. */
export function withSampleItems(recipe: Recipe): Recipe {
  const lists = recipe.options.filter((o) => o.type === "place-list");
  if (!lists.length) {
    const { items: _i, ...sensors } = recipe.sample;
    return { ...recipe, sample: sensors };
  }
  const items = Object.fromEntries(lists.map((o) => [o.key, (Array.isArray(o.default) ? (o.default as Place[]) : []).slice(0, ITEMS_MAX).map(sampleWeather)]));
  return { ...recipe, sample: { ...recipe.sample, items } };
}

/**
 * The sample a save writes: every sensor the recipe reads (its keys with the devices of `data` filled in, its sensor options'
 * defaults) at its reading in `data` where there is one, else the sample's own; nothing it does not read.
 */
export function withSample(recipe: Recipe, data: Data): Recipe {
  const devices = Object.fromEntries(recipe.options.filter((o) => o.type === "device").map((o) => [o.key, o.default]));
  const keys = [
    ...boundSensors(recipe).map((k) => expandKey(recipe, k, devices, { ...recipe.sample.sensors, ...data } as Data).key),
    ...recipe.options.filter((o) => o.type === "sensor").map((o) => String(o.default)),
  ].filter((k): k is string => !!k && k.includes("."));
  const reading = (k: string) => {
    const v = data[k] ?? recipe.sample.sensors[k];
    return typeof v === "object" && v ? v.value : v;
  };
  const sensors = Object.fromEntries(keys.flatMap((k) => (reading(k) === undefined ? [] : [[k, reading(k)!]])));
  return withSampleItems({ ...recipe, sample: { ...recipe.sample, sensors } });
}

/**
 * The sample the stage's Sample draws before a save writes one (G18): the recipe's own sample readings, and for every key it reads
 * that the sample has not got (never saved, or bound since) the reading in `data` at the time it is asked.
 */
export function draftSample(recipe: Recipe, data: Data): Recipe {
  const filled = withSample(recipe, data);
  return { ...recipe, sample: { ...filled.sample, ...recipe.sample, sensors: { ...filled.sample.sensors, ...recipe.sample.sensors } } };
}

/* ───────── settings that follow an option (5c) ───────── */

/** The options a block setting can follow: a select (its choices, mapped where they are not values the setting takes), and for a number a number option too. */
export const followable = (recipe: Recipe, number: boolean): RecipeOption[] => recipe.options.filter((o) => o.type === "select" || (number && o.type === "number"));

/**
 * A setting following option `o`: a number option as it is, a select whose choices are all values the setting takes as it is, any
 * other select by a map of its choices (each to itself where `takes` has it, else to `fallback`), which the builder then edits.
 */
export function followOf<T extends string | number>(o: RecipeOption, takes: (x: unknown) => x is T, fallback: T): FollowOption<T> {
  const choices = o.type === "select" ? (o.options ?? []) : [];
  if (o.type !== "select" || choices.every((c) => takes(c.value))) return { option: o.key };
  return { option: o.key, map: Object.fromEntries(choices.map((c) => [c.value, takes(c.value) ? (c.value as T) : fallback])) };
}

/* ───────── what the validator says ───────── */

/** The validator's issues for a recipe as the builder holds it (the manifest made for it; hashes are export's). */
export function recipeIssues(recipe: Recipe, images: readonly PackageFile[] = []): RecipeIssue[] {
  const bytes = recipeBytes(recipe);
  const files = [{ path: "recipe.json", bytes }, ...images];
  const manifest = {
    format: 1,
    kind: "recipe",
    id: recipe.id,
    version: recipe.version,
    author: recipe.author,
    name: recipe.name,
    files: files.map((f) => ({ path: f.path, bytes: f.bytes.length, sha256: "0".repeat(64) })),
  };
  return validateRecipe({ files: [{ path: "manifest.json", bytes: new TextEncoder().encode(JSON.stringify(manifest)) }, ...files] });
}

const count = (n: number, word: string): string => `${n} ${word}${n === 1 ? "" : "s"}`;

/**
 * The validation line: "No code · 7 blocks · 3 options · sizes 2×2 to 4×3", and the floor's half ("Text stays above 11 px at every
 * size", else the first text under it). It says only what the validator checks: the sizes are the recipe's range, not a claim that
 * every block fits at each (that is the stage's to measure).
 */
export function validationLine(recipe: Recipe, issues: readonly RecipeIssue[]): { ok: boolean; summary: string; floor: string } {
  const { min, max } = recipe.size;
  const floor = issues.find((i) => i.rule === "text-floor");
  return {
    ok: !issues.some((i) => i.severity === "error"),
    summary: `No code · ${count(blockCount(recipe), "block")} · ${count(recipe.options.length, "option")} · sizes ${min[0]}×${min[1]} to ${max[0]}×${max[1]}`,
    floor: floor ? floor.message.replace(/^\$\.root(\.children\[\d+\])*: /, "") : `Text stays above ${TEXT_FLOOR} px at every size`,
  };
}

/* ───────── format ───────── */

/**
 * The recipe with the format its keys need: 2 where it uses a key format 1 has not got (a label's parts; Phase C's text alignment,
 * text colours, a ring's centre colour, Show in and low is bad: `format2Keys`), else 1, byte for byte.
 */
export function withFormat(recipe: Recipe): Recipe {
  const format = format2Keys(recipe.root).length ? 2 : 1;
  return recipe.format === format ? recipe : { ...recipe, format };
}

/* ───────── Show in ───────── */

/**
 * The unit of what a binding reads now (the stage's reading, else the sample's), for a Value's or a Ring's "Show in" (G23): a sensor
 * key with each device option on its default, a sensor option's default key. "" when it reads no sensor or nothing is there.
 */
export function unitOfBinding(recipe: Recipe, bind: Binding | undefined, data: Data): string {
  const defaults = Object.fromEntries(recipe.options.map((o) => [o.key, o.default]));
  const all = { ...recipe.sample.sensors, ...data } as Data;
  const sensorOption = bind && "option" in bind ? recipe.options.find((o) => o.key === bind.option && o.type === "sensor") : undefined;
  const key = bind && "sensor" in bind ? expandKey(recipe, bind.sensor, defaults, all).key : sensorOption ? String(sensorOption.default) : undefined;
  return key ? readingUnit(key, String(get(all, key))) : "";
}

/* ───────── thresholds ───────── */

/**
 * Thresholds turned to high is bad or low is bad (G27). `low` is written only for low is bad, so a recipe that never turns it keeps its
 * bytes; levels that would be out of order for the new direction swap, so the pair stays one the validator takes.
 */
export function withDirection(t: Thresholds | undefined, low: boolean): Thresholds {
  const { warn, crit } = t ?? { warn: 70, crit: 90 };
  const [w, c] = (low ? warn >= crit : warn <= crit) ? [warn, crit] : [crit, warn];
  return low ? { warn: w, crit: c, low: true } : { warn: w, crit: c };
}

/** The order of a block's levels in plain words, and whether it is one the validator takes (warning never past critical). */
export function thresholdLine(t: Thresholds): { ok: boolean; text: string } {
  if (t.low)
    return t.warn >= t.crit
      ? { ok: true, text: `Low is bad: warning at ${t.warn} and under, critical at ${t.crit} and under. Warning is the higher level.` }
      : { ok: false, text: `Warning at ${t.warn} is under critical at ${t.crit}: when low is bad, warning is the higher level, reached first as the reading falls.` };
  return t.warn <= t.crit
    ? { ok: true, text: `High is bad: warning from ${t.warn} up, critical from ${t.crit} up. Warning is the lower level.` }
    : { ok: false, text: `Warning at ${t.warn} is over critical at ${t.crit}: when high is bad, warning is the lower level, reached first as the reading rises.` };
}

/* ───────── labels ───────── */

/** A label's line as parts: its parts, else its one reading as one part; typed text has none. */
export const labelParts = (b: Extract<Block, { type: "label" }>): LabelPart[] => b.parts ?? (b.bind ? [{ bind: b.bind }] : []);

/**
 * A label's line set from parts. One reading with no decimals or unit of its own is written as `bind`, and one piece of text as
 * `text`, both format 1; anything more is `parts` (format 2, `withFormat`). No parts leaves typed text.
 */
export function setLabelParts(recipe: Recipe, path: Path, parts: readonly LabelPart[]): Recipe {
  const clear = { text: undefined, bind: undefined, parts: undefined };
  const [one] = parts;
  if (!parts.length) return updateBlock(recipe, path, { ...clear, text: "Label" });
  if (parts.length === 1 && "text" in one) return updateBlock(recipe, path, { ...clear, text: one.text });
  if (parts.length === 1 && "bind" in one && one.decimals === undefined && one.unit === undefined) return updateBlock(recipe, path, { ...clear, bind: one.bind });
  return updateBlock(recipe, path, { ...clear, parts: [...parts] });
}

/** "Typed" or "From data": a label's text, or a reading (`bind`, a Repeat item's name inside a Repeat). */
export function setLabelSource(recipe: Recipe, path: Path, source: "typed" | "data", sensor: string): Recipe {
  const b = blockAt(recipe, path);
  if (b?.type !== "label") return recipe;
  if (source === "typed") return updateBlock(recipe, path, { text: b.text ?? "Label", bind: undefined, parts: undefined });
  return updateBlock(recipe, path, { text: undefined, parts: undefined, bind: repeatAbove(recipe, path) ? { field: "name" } : { sensor } });
}

/* ───────── lists inside a block ───────── */

/** A list with one item moved from one place to another (a heatmap's cells, a label's parts: drag to order). */
export function moveItem<T>(list: readonly T[], from: number, to: number): T[] {
  if (from === to || from < 0 || to < 0 || from >= list.length || to >= list.length) return [...list];
  const next = [...list];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}

/* ───────── sizes ───────── */

/** Sets one of the recipe's sizes. "Opens at" is what Add uses, so it is the default preset's size too (B6). */
export function setRecipeSize(recipe: Recipe, key: "min" | "max" | "default", cells: Cells): Recipe {
  const size = { ...recipe.size, [key]: [...cells] as Cells };
  return key === "default" ? { ...recipe, size, presets: recipe.presets.map((p) => (p.default ? { ...p, size: [...cells] as Cells } : p)) } : { ...recipe, size };
}

/** A size the stage may show (G17): each side clamped to the recipe's smallest and largest, in whole cells. */
export function clampCells(recipe: Recipe, cells: readonly number[]): Cells {
  const { min, max } = recipe.size;
  const side = (k: 0 | 1) => Math.max(min[k], Math.min(max[k], Math.round(cells[k]) || min[k]));
  return [side(0), side(1)];
}

/** The base text size at a zone size (the stage's hint). */
export const baseAt = (cells: Cells): number => cellBasePx(cells[0], cells[1]);

/** Whether a block type is one this build draws. */
export const isBlockType = (t: string): t is BlockType => (BLOCK_TYPES as readonly string[]).includes(t);
