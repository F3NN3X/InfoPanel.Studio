// The builder's free layout (format 2, the owner's "freely move and place items"), pure: a card, a row or a grid switched to Free gives
// each of its blocks a box, `[x, y, width, height]` as fractions of its content box, from where the block is drawn now, so nothing
// jumps; switched back, the boxes go and the order stays. Boxes move as a group, nudge by 1 % or 10 %, and align and distribute with the
// InfoPanel editor's own arrange (`arrange.ts`, in the container's px). Every edit returns a new recipe (one undo step); a refused one
// says why. The snapping is `free-snap.ts`; the stage's half is `free-handles.tsx`.
import { type AlignEdge, align, distribute, type Placed } from "@/lib/infopanel/editor/arrange";
import type { Block, CardBlock, FreeBox, Recipe } from "@/widgets/recipe/types";
import { BOX_MIN } from "@/widgets/recipe/validate";
import { blockAt, layerName, repeatAbove, updateBlock, type Path } from "./builder-model";

const keyOf = (p: Path): string => p.join(".");
const FREE_TYPES = new Set<Block["type"]>(["card", "row", "grid"]);

/** Whether a block lays its blocks out free. */
export const isFree = (b: Block | undefined): boolean => !!b && "layout" in b && b.layout === "free";

/** Why the container at `path` can't be laid out free, or undefined. */
export function freeRefusal(recipe: Recipe, path: Path): string | undefined {
  const b = blockAt(recipe, path);
  if (!b || !FREE_TYPES.has(b.type)) return "Only a card, a row or a grid places its blocks freely";
  if (repeatAbove(recipe, path)) return "A Repeat's items lay their blocks out in order";
  return undefined;
}

/** The free container the block at `path` has a box in, or undefined (a background has none). */
export function freeParent(recipe: Recipe, path: Path): number[] | undefined {
  if (!path.length) return undefined;
  const b = blockAt(recipe, path);
  const parent = path.slice(0, -1);
  return b && !b.background && isFree(blockAt(recipe, parent)) ? parent : undefined;
}

/** A fraction in 0.0001 steps. */
const q = (n: number): number => Math.round(n * 10000) / 10000;

/** A box kept inside its container (0-1) and at least `BOX_MIN` each way, in 0.0001 steps. */
export function clampBox(b: readonly number[]): FreeBox {
  const w = q(Math.min(1, Math.max(BOX_MIN, b[2])));
  const h = q(Math.min(1, Math.max(BOX_MIN, b[3])));
  return [Math.min(q(1 - w), q(Math.max(0, b[0]))), Math.min(q(1 - h), q(Math.max(0, b[1]))), w, h];
}

/** The box a block put into a free container without one takes: half its width, a quarter of its height, each next one a step on. */
export const defaultBox = (k: number): FreeBox => clampBox([0.05 + (k % 6) * 0.05, 0.05 + (k % 6) * 0.1, 0.5, 0.25]);

/** A block without the keys a box replaces (an area, a part of its row) and, when `box` is undefined, without its box. */
function placed(b: Block, box: FreeBox | undefined): Block {
  const o: Record<string, unknown> = { ...b, box };
  for (const k of ["area", "fill", "place", ...(box ? [] : ["box"])]) delete o[k];
  return o as unknown as Block;
}

/**
 * The container at `path` laid out free (`on`): each of its blocks at the box it is drawn at now (`drawn`, by child index, fractions of
 * the container's content box, measured on the stage), else at `defaultBox`; a grid's columns and tracks go. Off: back to a flow, the
 * boxes dropped and the order kept (a block's share of its row stays, so the flow is the one it had).
 */
export function setFree(recipe: Recipe, path: Path, on: boolean, drawn: Readonly<Record<number, readonly number[]>> = {}): Recipe | { why: string } {
  const b = blockAt(recipe, path);
  if (!b || !("children" in b)) return { why: "Only a card, a row or a grid places its blocks freely" };
  if (!on) return isFree(b) ? updateBlock(recipe, path, { layout: undefined, children: b.children.map((c) => (c.box ? placed(c, undefined) : c)) }) : recipe;
  const why = freeRefusal(recipe, path);
  if (why) return { why };
  const children = b.children.map((c, k) => (c.background ? c : placed(c, clampBox(drawn[k] ?? defaultBox(k)))));
  return updateBlock(recipe, path, { layout: "free", children, ...(b.type === "grid" ? { columns: undefined, tracks: undefined } : {}) });
}

/**
 * The free layout kept where it stands after any edit (a move, a paste, a wrap, a tile dropped): a box only on a content block of a free
 * container, one on every such block (a block moved or added into one takes `defaultBox`), and no free layout inside a Repeat. Untouched
 * subtrees are kept as they were, so the editor's flags follow their blocks.
 */
export function fitFree(recipe: Recipe): Recipe {
  const go = (b: Block, parent: Block | undefined, inRepeat: boolean, k: number): Block => {
    let next = b;
    const free = isFree(parent);
    if (b.box && (!free || b.background)) next = placed(next, undefined);
    else if (free && !b.background && !b.box) next = placed(next, defaultBox(k));
    else if (b.box && (b.area !== undefined || b.fill !== undefined || b.place !== undefined)) next = placed(next, b.box);
    if (inRepeat && isFree(next)) {
      const o: Record<string, unknown> = { ...next };
      delete o.layout;
      next = o as unknown as Block;
    }
    if (!("children" in next)) return next;
    const own = next;
    const kids = own.children.map((c, i) => go(c, own, inRepeat || own.type === "repeat", i));
    return kids.every((c, i) => c === own.children[i]) ? own : ({ ...own, children: kids } as Block);
  };
  const root = go(recipe.root, undefined, false, 0) as CardBlock;
  return root === recipe.root ? recipe : { ...recipe, root };
}

/** The boxes set on their blocks (each kept inside its container): one edit. */
export function setBoxes(recipe: Recipe, list: readonly { path: Path; box: readonly number[] }[]): Recipe {
  return list.reduce((r, x) => updateBlock(r, x.path, { box: clampBox(x.box) }), recipe);
}

/** Boxes moved together by `dx`, `dy` (fractions), the group held inside its container as one, so they keep their places to each other. */
export function moveGroup(boxes: readonly (readonly number[])[], dx: number, dy: number): FreeBox[] {
  if (!boxes.length) return [];
  const [x0, y0] = [Math.min(...boxes.map((b) => b[0])), Math.min(...boxes.map((b) => b[1]))];
  const [x1, y1] = [Math.max(...boxes.map((b) => b[0] + b[2])), Math.max(...boxes.map((b) => b[1] + b[3]))];
  const mx = Math.max(-x0, Math.min(1 - x1, dx));
  const my = Math.max(-y0, Math.min(1 - y1, dy));
  return boxes.map((b) => clampBox([b[0] + mx, b[1] + my, b[2], b[3]]));
}

/** How far a duplicate in a free container sits from its original, each way. */
export const COPY_STEP = 0.02;

/**
 * Duplicates in a free container (`paths`, the copies) moved `COPY_STEP` down and right of their originals, so they show; on an axis
 * where that would leave the container, up or left instead. Copies in a flow are left as they are.
 */
export function offsetCopies(recipe: Recipe, paths: readonly Path[]): Recipe {
  const step = (at: number, size: number) => (at + size + COPY_STEP <= 1 + 1e-9 ? at + COPY_STEP : at - COPY_STEP);
  return setBoxes(
    recipe,
    paths.flatMap((p) => {
      const box = freeParent(recipe, p) ? blockAt(recipe, p)?.box : undefined;
      return box ? [{ path: p, box: [step(box[0], box[2]), step(box[1], box[3]), box[2], box[3]] }] : [];
    }),
  );
}

/** A new block's box in a free container: `defaultBox`'s size centred at `at` (fractions of the container), kept inside it. */
export const boxAtPoint = (at: { x: number; y: number }): FreeBox => {
  const [, , w, h] = defaultBox(0);
  return clampBox([at.x - w / 2, at.y - h / 2, w, h]);
};

/** The blocks of `paths` with boxes, all in one free container, or why not. */
function freeSet(recipe: Recipe, paths: readonly Path[]): { parent: number[]; list: { path: number[]; box: FreeBox }[] } | { why: string } {
  const parent = paths.length ? freeParent(recipe, paths[0]) : undefined;
  if (!parent || paths.some((p) => keyOf(freeParent(recipe, p) ?? [-1]) !== keyOf(parent))) return { why: "Only blocks placed freely in one container move this way" };
  return { parent, list: paths.map((p) => ({ path: [...p], box: blockAt(recipe, p)!.box ?? defaultBox(p[p.length - 1]) })) };
}

/** The arrows on the stage: the free blocks of `paths` moved by `dx`, `dy` (fractions: 0.01, or 0.1 with Shift) together, or why not. */
export function nudgeBoxes(recipe: Recipe, paths: readonly Path[], dx: number, dy: number): Recipe | { why: string } {
  const set = freeSet(recipe, paths);
  if ("why" in set) return set;
  const moved = moveGroup(set.list.map((x) => x.box), dx, dy);
  if (moved.every((b, i) => keyOf(b) === keyOf(set.list[i].box))) return { why: `${paths.length === 1 ? `${layerName(recipe, blockAt(recipe, paths[0])!)} reaches` : "They reach"} the container's edge` };
  return setBoxes(recipe, set.list.map((x, i) => ({ path: x.path, box: moved[i] })));
}

/** Align (an edge or a centre line) or distribute (equal gaps across or down) for blocks placed freely. */
export type FreeArrange = AlignEdge | "distribute-h" | "distribute-v";

export const ARRANGE_LABEL: Readonly<Record<FreeArrange, string>> = {
  left: "Align left",
  centre: "Align centre",
  right: "Align right",
  top: "Align top",
  middle: "Align middle",
  bottom: "Align bottom",
  "distribute-h": "Distribute horizontally",
  "distribute-v": "Distribute vertically",
};

/**
 * The free blocks of `paths` aligned or distributed in their container (`size`: its content box in px, so the gaps are equal on screen),
 * with the InfoPanel editor's `align` and `distribute`; or why not: two blocks to align, three to distribute, all in one free container.
 */
export function arrangeBoxes(recipe: Recipe, paths: readonly Path[], op: FreeArrange, size: { w: number; h: number }): Recipe | { why: string } {
  const set = freeSet(recipe, paths);
  if ("why" in set) return set;
  const many = op.startsWith("distribute") ? 3 : 2;
  if (set.list.length < many) return { why: `${op.startsWith("distribute") ? "Distribute" : "Align"} needs ${many} blocks or more` };
  const [W, H] = [size.w || 1, size.h || 1];
  const boxes: Placed[] = set.list.map((x) => ({ path: keyOf(x.path), box: { x: x.box[0] * W, y: x.box[1] * H, width: x.box[2] * W, height: x.box[3] * H } }));
  const shifts = op === "distribute-h" ? distribute(boxes, "horizontal") : op === "distribute-v" ? distribute(boxes, "vertical") : align(boxes, op);
  if (!shifts.length) return { why: "They are lined up already" };
  return setBoxes(
    recipe,
    shifts.map((s) => {
      const b = set.list.find((x) => keyOf(x.path) === s.path)!.box;
      return { path: s.path.split(".").map(Number), box: [b[0] + s.dx / W, b[1] + s.dy / H, b[2], b[3]] };
    }),
  );
}

/** A fraction as a readout says it: "12.5 %". */
const percent = (f: number): string => `${Math.round(f * 1000) / 10} %`;

/** "x 10 %  y 20 %  w 40 %  h 25 %": a box as the readout and the screen reader say it. */
export const boxText = (b: readonly number[]): string => `x ${percent(b[0])}  y ${percent(b[1])}  w ${percent(b[2])}  h ${percent(b[3])}`;
