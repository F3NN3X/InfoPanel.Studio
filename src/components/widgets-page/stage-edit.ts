// The builder's stage edits (builder plan Phase 1, D2 A: the flow model, no format change), pure: where a tile or a dragged block
// lands, what a press on the stage drags, and the share handles between two blocks side by side. The DOM half (the hit under the
// pointer, its box and its parent's direction) is `builder.tsx`'s; a move is `moveBlocks`, a share edit `setShares` (builder-model).
import { ownLine } from "@/widgets/recipe/RecipeView";
import type { BlockType, Recipe } from "@/widgets/recipe/types";
import { addRefusal, blockAt, layerName, moveRefusal, repeatAbove, topLevel, type Path } from "./builder-model";

/** Where a tile or the dragged blocks land on the stage: into a container at its end, or before or after a block in its parent. */
export interface StageDrop {
  key: string;
  where: "inside" | "before" | "after";
  /** The block's parent lays its blocks out side by side (the mark is a line at its left or right). */
  across: boolean;
  toParent: number[];
  index: number;
  /** "into Row", "after Ring". */
  text: string;
  why?: string;
}

/** What is dropped: a tile from "Add a block", or the blocks dragged on the stage. */
export type Carry = { tile: BlockType } | { from: readonly Path[] };

/** The part of a container's length at each end where a dragged block goes before or after it rather than into it. */
const EDGE = 0.2;

const keyOf = (p: Path): string => p.join(".");
const within = (p: Path, outer: Path): boolean => p.length >= outer.length && outer.every((k, i) => p[i] === k);

/**
 * What a press on the block at `at` drags, and what a drag over it is aimed at: the outermost Repeat holding it, since a Repeat's items
 * are drawn as many times as there are items but are one block (drag the Repeat, not an item); else the block itself.
 */
export function dragTarget(recipe: Recipe, at: Path): number[] {
  for (let n = 1; n <= at.length; n++) if (blockAt(recipe, at.slice(0, n))?.type === "repeat") return at.slice(0, n);
  return [...at];
}

/**
 * Where a drop on the block at `at` lands, `f` the pointer's place across the block (0 its start, 1 its end) along its parent's axis
 * (`across`: side by side). A tile goes into a container, else before or after the block by the half it is over. Dragged blocks go
 * before or after a container from its ends as well, so a block can leave a Row by the Row's edge; a drop on a dragged block (or in
 * one) is none. `why`: the validator's refusal of that place.
 */
export function dropAt(recipe: Recipe, at: Path, f: number, across: boolean, carry: Carry): StageDrop | null {
  const b = blockAt(recipe, at);
  if (!b) return null;
  const moving = "from" in carry ? topLevel(carry.from) : [];
  if (moving.some((p) => within(at, p))) return null;
  const container = "children" in b;
  const edge = moving.length > 0 && container && at.length > 0 && (f < EDGE || f > 1 - EDGE);
  const where = container && !edge ? "inside" : f < 0.5 ? "before" : "after";
  const toParent = where === "inside" ? [...at] : at.slice(0, -1);
  const index = where === "inside" ? (container ? b.children.length : 0) : at[at.length - 1] + (where === "after" ? 1 : 0);
  const why = "tile" in carry ? addRefusal(recipe, carry.tile, toParent) : moving.map((p) => moveRefusal(recipe, p, toParent)).find(Boolean);
  const name = layerName(recipe, b);
  return { key: keyOf(at), where, across, toParent, index, text: where === "inside" ? `into ${name}` : `${where} ${name}`, why };
}

/**
 * Where an arrow on the focused stage takes the selection, as in Layers: Up and Down the block before and after it in its container,
 * Left the container, Right its first block. Undefined where there is none.
 */
export function stageStep(recipe: Recipe, path: Path, key: string): number[] | undefined {
  const k = path[path.length - 1];
  const parent = path.slice(0, -1);
  const b = blockAt(recipe, path);
  const next = (() => {
    if (key === "ArrowUp" && path.length) return [...parent, k - 1];
    if (key === "ArrowDown" && path.length) return [...parent, k + 1];
    if (key === "ArrowLeft" && path.length) return parent;
    if (key === "ArrowRight" && b && "children" in b) return [...path, 0];
    return undefined;
  })();
  return next?.every((x) => x >= 0) && blockAt(recipe, next) ? next : undefined;
}

/* ───────── share handles ───────── */

/** An edge between two blocks side by side in a Row or a Card (`a` before `b`), whose shares a handle on it changes. */
export interface ShareEdge {
  a: number[];
  b: number[];
  /** The two lie side by side (a Row); else one over the other (a column, a Card). */
  across: boolean;
}

/** Whether a block takes a share of its row: a share over 0, and not a line of text that keeps its own height in a column. */
const takesShare = (recipe: Recipe, at: Path, direction: "row" | "column"): boolean => {
  const b = blockAt(recipe, at);
  return !!b && (b.grow ?? 1) > 0 && !ownLine(b, direction);
};

/**
 * The share edges of the block at `path`: with the block before it and the one after it, where both take a share of a Row or a Card. A
 * Grid's cells are equal and a Repeat's items one block drawn many times, so neither has any.
 */
export function shareEdges(recipe: Recipe, path: Path): ShareEdge[] {
  if (!path.length || repeatAbove(recipe, path)) return [];
  const parentPath = path.slice(0, -1);
  const parent = blockAt(recipe, parentPath);
  if (!parent || (parent.type !== "row" && parent.type !== "card")) return [];
  const direction = parent.type === "row" ? (parent.direction ?? "row") : "column";
  const k = path[path.length - 1];
  const at = (i: number) => [...parentPath, i];
  if (!takesShare(recipe, path, direction)) return [];
  return [k - 1, k + 1]
    .filter((i) => i >= 0 && i < parent.children.length && takesShare(recipe, at(i), direction))
    .map((i) => ({ a: at(Math.min(i, k)), b: at(Math.max(i, k)), across: direction === "row" }));
}

/** The ratios a share handle snaps to near them (1:3, 1:2, 1:1, 2:1, 3:1) as the first block's part, and how near is near. */
export const SHARE_SNAPS = [1 / 4, 1 / 3, 1 / 2, 2 / 3, 3 / 4] as const;
const SNAP_NEAR = 0.03;
/** The least share a block keeps, and the most the format allows (`grow` 0-12). */
const SHARE_MIN = 0.1;
const SHARE_MAX = 12;

const hundredth = (n: number): number => Math.round(n * 100) / 100;

/**
 * The two shares after their edge is dragged to `f` of their length together (0 the first's start, 1 the second's end): their sum
 * kept (the row's other blocks keep their width), in 0.01 steps (2:1 of 2 is 1.33 and 0.67), snapped to the nearest of `SHARE_SNAPS`
 * within 3 % unless `snap` is off. Refused when either would fall under 0.1 or go over 12.
 */
export function splitShares(sum: number, f: number, snap = true): { a: number; b: number } | { why: string } {
  const near = snap ? SHARE_SNAPS.find((s) => Math.abs(f - s) < SNAP_NEAR) : undefined;
  const a = hundredth(sum * (near ?? f));
  const b = hundredth(sum - a);
  if (a < SHARE_MIN || b < SHARE_MIN) return { why: `A share under ${SHARE_MIN} leaves its block no room` };
  if (a > SHARE_MAX || b > SHARE_MAX) return { why: `A share is at most ${SHARE_MAX}` };
  return { a, b };
}

/** The first block's part of the two, in whole per cent. */
export const sharePercent = (a: number, b: number): number => Math.round((a / (a + b || 1)) * 100);

/** What a share handle says while it is dragged: "60 % | 40 %". */
export const shareText = (a: number, b: number): string => `${sharePercent(a, b)} % | ${100 - sharePercent(a, b)} %`;
