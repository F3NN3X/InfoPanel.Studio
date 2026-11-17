// The builder's layout edits (builder plan Phase 5, D2 B, and the owner's additions to it), pure: a grid's tracks and its blocks' areas
// in them, moved and sized by whole tracks with Edit's own zone geometry (`zone-geometry.ts`, `zone-arrange.ts`: an area is a zone box
// of 1-based tracks, so the same clamps, nudges and aligns apply); background layers and their stacking order; a block's part of its
// column's width or its row's height. Every edit returns a new recipe (one undo step); a refused one says why.
import type { Placement } from "@/lib/layout";
import { arrangeZones, type ArrangeOp } from "@/components/studio/zone-arrange";
import { clampZoneRect, enforceMinSize, firstFreeRect, nudgeZone, type ZoneRect } from "@/components/studio/zone-geometry";
import type { Block, CardBlock, GridArea, GridTracks, Recipe } from "@/widgets/recipe/types";
import { BACKGROUNDS_MAX, TRACKS_MAX } from "@/widgets/recipe/validate";
import { blockAt, layerName, repeatAbove, updateBlock, type Path } from "./builder-model";

const kidsOf = (b: Block | undefined): Block[] => (b && "children" in b ? b.children : []);
const keyOf = (p: Path): string => p.join(".");

/* ───────── tracks and areas ───────── */

/** A track's share at least and at most, and the steps it is kept in. */
const SHARE_MIN = 0.1;
const SHARE_MAX = 12;

/** "1 2 1" as tracks' shares, or undefined when it is not 1 to 24 numbers from 0.1 to 12. */
export function parseTracks(text: string): number[] | undefined {
  const parts = text.trim().split(/[\s,]+/).filter(Boolean);
  const list = parts.map(Number);
  if (!list.length || list.length > TRACKS_MAX || list.some((n) => !Number.isFinite(n) || n < SHARE_MIN || n > SHARE_MAX)) return undefined;
  return list.map((n) => Math.round(n * 100) / 100);
}

/** Tracks as they are typed: "1 2 1". */
export const tracksText = (list: readonly number[]): string => list.join(" ");

/** The grid with tracks that holds the block at `path` in an area (not as a background), or undefined. */
export function areaGrid(recipe: Recipe, path: Path): { path: number[]; tracks: GridTracks } | undefined {
  if (!path.length) return undefined;
  const b = blockAt(recipe, path);
  const parent = blockAt(recipe, path.slice(0, -1));
  if (!b || b.background || b.type === "repeat" || parent?.type !== "grid" || !parent.tracks) return undefined;
  return { path: path.slice(0, -1), tracks: parent.tracks };
}

export const rectOf = (a: GridArea): ZoneRect => ({ col: a[0], row: a[1], cols: a[2], rows: a[3] });
export const areaFrom = (r: ZoneRect): GridArea => [r.col, r.row, r.cols, r.rows];
/** An area as Edit's zone geometry takes a placement (`id` its block's path). */
const asZone = (id: string, r: ZoneRect): Placement => ({ id, module: "area", colStart: r.col, rowStart: r.row, colSpan: r.cols, rowSpan: r.rows, visible: true });

/** The grid's blocks with areas, as zones by path (a background or a Repeat has none). */
const zonesIn = (recipe: Recipe, gridPath: Path): Placement[] =>
  kidsOf(blockAt(recipe, gridPath)).flatMap((c, k) => (c.area && !c.background ? [asZone(keyOf([...gridPath, k]), rectOf(c.area))] : []));

/**
 * The grid at `path` laid out on tracks (`cols`, `rows`: each one's share), or back to equal cells (none). Each block keeps its area,
 * pulled inside the new tracks; one without an area takes the next free cell in reading order (a Repeat and a background take none), so
 * every block can be dragged at once. Back to equal cells, the areas go with the tracks.
 */
export function setTracks(recipe: Recipe, path: Path, tracks: GridTracks | undefined): Recipe {
  const grid = blockAt(recipe, path);
  if (grid?.type !== "grid") return recipe;
  if (!tracks) return { ...recipe, root: mapKids(recipe, path, (c) => ({ ...c, area: undefined }), { tracks: undefined }) };
  const [cols, rows] = [tracks.cols.length, tracks.rows.length];
  const placed: Placement[] = [];
  const kids = grid.children.map((c, k) => {
    if (c.background || c.type === "repeat") return { ...c, area: undefined };
    const r = c.area ? clampZoneRect(rectOf(c.area), [], cols, rows) : (firstFreeRect(cols, rows, { cols: 1, rows: 1 }, placed) ?? { col: 1, row: 1, cols: 1, rows: 1 });
    placed.push(asZone(String(k), r));
    return { ...c, area: areaFrom(r) };
  });
  return { ...recipe, root: mapKids(recipe, path, (_, k) => kids[k], { tracks, columns: undefined }) };
}

/** The recipe with the container at `path` given `patch` and each of its blocks put through `fn` (a key set to undefined goes). */
function mapKids(recipe: Recipe, path: Path, fn: (c: Block, k: number) => Block, patch: Record<string, unknown>): CardBlock {
  const tidy = (o: Record<string, unknown>) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined));
  const go = (b: Block, rest: Path): Block => {
    if (!("children" in b)) return b;
    if (rest.length) return { ...b, children: b.children.map((c, k) => (k === rest[0] ? go(c, rest.slice(1)) : c)) } as Block;
    return tidy({ ...b, ...patch, children: b.children.map((c, k) => tidy(fn(c, k) as unknown as Record<string, unknown>)) }) as unknown as Block;
  };
  return go(recipe.root, path) as CardBlock;
}

/** The block's area now: its own, else the cells it is drawn on (`drawn`, measured on the stage), else the first track. */
export const areaNow = (recipe: Recipe, path: Path, drawn?: ZoneRect): ZoneRect => {
  const a = blockAt(recipe, path)?.area;
  return a ? rectOf(a) : (drawn ?? { col: 1, row: 1, cols: 1, rows: 1 });
};

/** The block at `path` placed at `rect` in its grid's tracks, pulled inside them; the recipe as it was where it has no grid with tracks. */
export function setArea(recipe: Recipe, path: Path, rect: ZoneRect): Recipe {
  const grid = areaGrid(recipe, path);
  if (!grid) return recipe;
  const r = clampZoneRect(rect, [], grid.tracks.cols.length, grid.tracks.rows.length);
  return updateBlock(recipe, path, { area: areaFrom(r) });
}

/** The area moved by whole tracks (Alt+arrows on the stage), or why not: it would leave the grid. Areas may overlap, so nothing else stops it. */
export function nudgeArea(recipe: Recipe, path: Path, delta: { cols: number; rows: number }, drawn?: ZoneRect): Recipe | { why: string } {
  const grid = areaGrid(recipe, path);
  if (!grid) return { why: "Only a block in a grid with tracks moves by tracks" };
  const r = nudgeZone(asZone(keyOf(path), areaNow(recipe, path, drawn)), delta, [], grid.tracks.cols.length, grid.tracks.rows.length);
  return r ? updateBlock(recipe, path, { area: areaFrom(r) }) : { why: "It is at the grid's edge" };
}

/** An edge of an area a handle drags; a corner moves two. */
export interface AreaEdges {
  left?: boolean;
  right?: boolean;
  top?: boolean;
  bottom?: boolean;
}

/**
 * The area with the dragged edges at the track lines `col` and `row` (0-based lines: 0 the grid's start, n its end), the other edges
 * held, never under one track (`enforceMinSize`) nor outside the grid.
 */
export function resizeArea(area: ZoneRect, edges: AreaEdges, line: { col: number; row: number }, cols: number, rows: number): ZoneRect {
  const [l, r, t, b] = [area.col - 1, area.col - 1 + area.cols, area.row - 1, area.row - 1 + area.rows];
  const nl = edges.left ? Math.max(0, Math.min(line.col, r - 1)) : l;
  const nr = edges.right ? Math.min(cols, Math.max(line.col, l + 1)) : r;
  const nt = edges.top ? Math.max(0, Math.min(line.row, b - 1)) : t;
  const nb = edges.bottom ? Math.min(rows, Math.max(line.row, t + 1)) : b;
  const next = enforceMinSize({ col: nl + 1, row: nt + 1, cols: nr - nl, rows: nb - nt }, asZone("", area), { cols: 1, rows: 1 });
  return clampZoneRect(next, [], cols, rows);
}

/** The area grown or shrunk by one track on its right or bottom edge (Alt+Shift+arrows), or why not. */
export function stepAreaSize(recipe: Recipe, path: Path, delta: { cols: number; rows: number }, drawn?: ZoneRect): Recipe | { why: string } {
  const grid = areaGrid(recipe, path);
  if (!grid) return { why: "Only a block in a grid with tracks takes a size in tracks" };
  const a = areaNow(recipe, path, drawn);
  const [cols, rows] = [grid.tracks.cols.length, grid.tracks.rows.length];
  const next = { ...a, cols: a.cols + delta.cols, rows: a.rows + delta.rows };
  if (next.cols < 1 || next.rows < 1) return { why: "An area is at least one track" };
  if (next.col + next.cols - 1 > cols || next.row + next.rows - 1 > rows) return { why: "It is at the grid's edge" };
  return updateBlock(recipe, path, { area: areaFrom(next) });
}

/** The track a point lands on: the line nearest `x` among `starts` (each track's start, px) and `end`, 0-based. */
export function nearestLine(x: number, starts: readonly number[], end: number): number {
  const lines = [...starts, end];
  let best = 0;
  for (let k = 1; k < lines.length; k++) if (Math.abs(lines[k] - x) < Math.abs(lines[best] - x)) best = k;
  return best;
}

/** The track holding `x` (0-based), the last one past the end. */
export const trackAt = (x: number, starts: readonly number[]): number => Math.max(0, starts.filter((s) => s <= x).length - 1);

/** The area dragged by its body: moved by whole tracks with the pointer's track (`from` where the press was), kept inside the grid. */
export function dragArea(area: ZoneRect, from: { col: number; row: number }, to: { col: number; row: number }, cols: number, rows: number): ZoneRect {
  return clampZoneRect({ ...area, col: area.col + to.col - from.col, row: area.row + to.row - from.row }, [], cols, rows);
}

/** Align or distribute the selected areas of one grid (`zone-arrange.ts`), the primary's size for a match; the selection overlapping itself is refused. */
export function arrangeAreas(recipe: Recipe, paths: readonly Path[], primary: Path, op: ArrangeOp): Recipe | { why: string } {
  const grid = paths.length ? areaGrid(recipe, paths[0]) : undefined;
  if (!grid || paths.some((p) => keyOf(areaGrid(recipe, p)?.path ?? [-1]) !== keyOf(grid.path) || !blockAt(recipe, p)?.area))
    return { why: "Align and distribute act on blocks with areas in one grid" };
  const zones = zonesIn(recipe, grid.path).filter((z) => paths.some((p) => keyOf(p) === z.id));
  const next = arrangeZones(op, zones, zones.map((z) => z.id), keyOf(primary), grid.tracks.cols.length, grid.tracks.rows.length);
  if (!next) return { why: op.startsWith("distribute") ? "Distribute needs three blocks with room between them" : "They would overlap or leave the grid, or they are there already" };
  return Object.entries(next).reduce((r, [id, rect]) => updateBlock(r, id.split(".").map(Number), { area: areaFrom(rect) }), recipe);
}

/* ───────── backgrounds and stacking ───────── */

/** Why the blocks at `paths` can't be backgrounds of their containers, or undefined. */
export function backgroundRefusal(recipe: Recipe, paths: readonly Path[]): string | undefined {
  for (const p of paths) {
    const b = blockAt(recipe, p);
    if (!p.length || !b) return "The widget's card can't be a background";
    if (b.type === "repeat") return "A Repeat lists items; it can't be a background";
  }
  const byParent = new Map<string, number>();
  for (const p of paths) {
    if (blockAt(recipe, p)?.background) continue;
    const parent = keyOf(p.slice(0, -1));
    const have = kidsOf(blockAt(recipe, p.slice(0, -1))).filter((c) => c.background).length;
    byParent.set(parent, (byParent.get(parent) ?? have) + 1);
    if (byParent.get(parent)! > BACKGROUNDS_MAX) return `A container holds at most ${BACKGROUNDS_MAX} background layers`;
  }
  return undefined;
}

/**
 * The blocks at `paths` made backgrounds of their containers (`on`), or content again. A background fills its container, so its area,
 * part of its row and share go; a picture covers it.
 */
export function setBackground(recipe: Recipe, paths: readonly Path[], on: boolean): Recipe | { why: string } {
  if (on) {
    const why = backgroundRefusal(recipe, paths);
    if (why) return { why };
  }
  return paths.reduce((r, p) => {
    const b = blockAt(r, p);
    if (!b || !!b.background === on) return r;
    return updateBlock(r, p, on ? { background: {}, area: undefined, fill: undefined, place: undefined, grow: undefined } : { background: undefined });
  }, recipe);
}

export type Restack = "forward" | "backward" | "front" | "back";

/**
 * The block's drawing order among the blocks of its own kind in its container (backgrounds with backgrounds, the rest with the rest):
 * one step later (forward: drawn over the next) or earlier, or to the last or first place. The order is the order of the container's
 * blocks, so this is a move among them. Returns its path after the move, or why it can't.
 */
export function restack(recipe: Recipe, path: Path, how: Restack): { recipe: Recipe; path: number[] } | { why: string } {
  const b = blockAt(recipe, path);
  if (!path.length || !b) return { why: "The widget's card is under everything" };
  const parentPath = path.slice(0, -1);
  const kids = kidsOf(blockAt(recipe, parentPath));
  const k = path[path.length - 1];
  const same = kids.map((c, i) => [c, i] as const).filter(([c]) => !!c.background === !!b.background).map(([, i]) => i);
  const at = same.indexOf(k);
  const to = how === "forward" ? same[at + 1] : how === "backward" ? same[at - 1] : how === "front" ? same[same.length - 1] : same[0];
  if (to === undefined || to === k) return { why: how === "forward" || how === "front" ? `${layerName(recipe, b)} is drawn over the others already` : `${layerName(recipe, b)} is drawn under the others already` };
  const list = kids.filter((_, i) => i !== k);
  list.splice(to, 0, b);
  return { recipe: { ...recipe, root: mapKids(recipe, parentPath, (_, i) => list[i], {}) }, path: [...parentPath, to] };
}

/* ───────── a block's part of its column or row ───────── */

/** The parts a cross handle snaps to (25 %, 33 %, 50 %, 67 %, 75 %, 100 %), and how near is near. */
export const FILL_SNAPS = [0.25, 1 / 3, 0.5, 2 / 3, 0.75, 1] as const;
const FILL_NEAR = 0.03;
const FILL_MIN = 0.1;

/** A fill dragged to `f` of its container: snapped to a part within 3 % (unless `snap` is off), in whole per cent, 10 % to 100 %. */
export function snapFill(f: number, snap = true): number {
  const near = snap ? FILL_SNAPS.find((s) => Math.abs(f - s) < FILL_NEAR) : undefined;
  return Math.max(FILL_MIN, Math.min(1, Math.round((near ?? f) * 100) / 100));
}

/** The next part a key press takes a fill to (`by` 1 up, -1 down), along the snaps. */
export function stepFill(fill: number, by: 1 | -1): number {
  const list = by > 0 ? FILL_SNAPS.filter((s) => s > fill + 0.001) : [...FILL_SNAPS].reverse().filter((s) => s < fill - 0.001);
  return snapFill(list[0] ?? (by > 0 ? 1 : FILL_SNAPS[0]));
}

/**
 * Where the block at `path` lies across its container: `"column"` in a card or a Row set to Column (its width is the part), `"row"` in a
 * Row (its height), or undefined where it has no part to set (the root, a background, a grid's block, a Repeat's item).
 */
export function fillAxis(recipe: Recipe, path: Path): "column" | "row" | undefined {
  const b = blockAt(recipe, path);
  if (!path.length || !b || b.background || repeatAbove(recipe, path)) return undefined;
  const parent = blockAt(recipe, path.slice(0, -1));
  // a free container's blocks have boxes instead
  if (parent && "layout" in parent && parent.layout === "free") return undefined;
  if (parent?.type === "card") return "column";
  if (parent?.type === "row") return parent.direction === "column" ? "column" : "row";
  return undefined;
}

/** The block's part of its column or row (`fill`, 1 or none: all of it) and where it sits in what is left (start: unset). */
export function setFill(recipe: Recipe, path: Path, fill: number | undefined, place?: "start" | "center" | "end"): Recipe {
  const all = fill === undefined || fill >= 1;
  return updateBlock(recipe, path, { fill: all ? undefined : fill, place: all || !place || place === "start" ? undefined : place });
}

/** "50 %": a part in whole per cent. */
export const fillText = (fill: number | undefined): string => `${Math.round((fill ?? 1) * 100)} %`;

/* ───────── the builder's tidy-up ───────── */

/**
 * The layout keys kept where they stand after any edit (a move, a paste, a wrap, an unwrap, a snippet): an area only on a block of a
 * grid with tracks, pulled inside them; a part of its column or row only in a card, a row or a Repeat; a background never on the root.
 * Each one left elsewhere would be a validator error with no meaning there, so the builder drops it. Untouched subtrees are kept as they were.
 */
export function fitLayout(recipe: Recipe): Recipe {
  const go = (b: Block, parent: Block | undefined, root: boolean): Block => {
    let next = b;
    const patch: Record<string, unknown> = {};
    const tracks = parent?.type === "grid" ? parent.tracks : undefined;
    if (b.area && (!tracks || b.background || b.type === "repeat")) patch.area = undefined;
    else if (b.area && tracks) {
      const r = clampZoneRect(rectOf(b.area), [], tracks.cols.length, tracks.rows.length);
      if (keyOf(areaFrom(r)) !== keyOf(b.area)) patch.area = areaFrom(r);
    }
    if ((b.fill !== undefined || b.place !== undefined) && (b.background || !(parent && (parent.type === "card" || parent.type === "row" || parent.type === "repeat")))) Object.assign(patch, { fill: undefined, place: undefined });
    if (root && b.background) patch.background = undefined;
    if (Object.keys(patch).length) {
      const o: Record<string, unknown> = { ...b, ...patch };
      for (const [k, v] of Object.entries(patch)) if (v === undefined) delete o[k];
      next = o as unknown as Block;
    }
    if (!("children" in next)) return next;
    const kids = next.children.map((c) => go(c, next, false));
    return kids.every((c, i) => c === (next as { children: Block[] }).children[i]) ? next : ({ ...next, children: kids } as Block);
  };
  const root = go(recipe.root, undefined, true) as CardBlock;
  return root === recipe.root ? recipe : { ...recipe, root };
}
