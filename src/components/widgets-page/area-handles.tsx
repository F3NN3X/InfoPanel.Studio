// The stage's layout handles (builder plan Phase 5 and the owner's "resize from all four sides"). In a grid with tracks the selected
// block's area has a handle on each edge and corner that drags it to the nearest track line, over a dotted outline of the tracks; its
// body drags it a track at a time (`builder.tsx`). In a column (a card, a Row set to Column) the selected block has a handle on its left
// and right edges that sets its part of the column's width, in a Row on its top and bottom edges for its part of the row's height; each
// snaps to 25, 33, 50, 67, 75 and 100 % and says the part as it goes. Every handle takes the arrows (a track, or the next part) and Esc
// puts a drag back; a release or a key is one undo step.
import { type KeyboardEvent, type PointerEvent, useLayoutEffect, useState } from "react";
import { pastDragThreshold, trackPointer } from "@/components/studio/pointer-drag";
import type { ZoneRect } from "@/components/studio/zone-geometry";
import { cn } from "@/lib/utils";
import type { Recipe } from "@/widgets/recipe/types";
import { blockAt, layerName, type Path } from "./builder-model";
import { flagged } from "./editor-flags";
import { type AreaEdges, areaGrid, areaNow, fillAxis, fillText, nearestLine, resizeArea, setArea, setFill, snapFill, stepFill, trackAt } from "./layout-model";

const keyOf = (p: Path): string => p.join(".");

/** A grid's track lines on screen (client px): each column's and row's start, and the grid's right and bottom edges. */
export interface GridLines {
  cols: number[];
  colEnd: number;
  rows: number[];
  rowEnd: number;
}

/** The track lines of a drawn grid, from its laid-out template (the stage's scale applied), `cols` × `rows` of them. */
export function gridLines(el: HTMLElement, cols: number, rows: number): GridLines {
  const r = el.getBoundingClientRect();
  const scale = r.width / (el.offsetWidth || 1) || 1;
  const cs = getComputedStyle(el);
  const sizes = (v: string) => v.split(/\s+/).map(parseFloat).filter(Number.isFinite);
  const starts = (list: number[], gap: number, from: number, n: number) => {
    let at = from;
    return list.slice(0, n).map((s) => {
      const x = at;
      at += (s + gap) * scale;
      return x;
    });
  };
  return { cols: starts(sizes(cs.gridTemplateColumns), parseFloat(cs.columnGap) || 0, r.left, cols), colEnd: r.right, rows: starts(sizes(cs.gridTemplateRows), parseFloat(cs.rowGap) || 0, r.top, rows), rowEnd: r.bottom };
}

/** The tracks a drawn block covers (a block with no area of its own is drawn in the next free cell). */
export function drawnArea(box: DOMRect, lines: GridLines): ZoneRect {
  const col = trackAt(box.left + 1, lines.cols);
  const row = trackAt(box.top + 1, lines.rows);
  return { col: col + 1, row: row + 1, cols: Math.max(1, trackAt(box.right - 1, lines.cols) - col + 1), rows: Math.max(1, trackAt(box.bottom - 1, lines.rows) - row + 1) };
}

/** The selected block's grid element and its lines, and its area as drawn; undefined when it is not in a grid with tracks. */
export function measureArea(zone: HTMLElement | null, recipe: Recipe, path: Path): { lines: GridLines; drawn: ZoneRect; cols: number; rows: number } | undefined {
  const grid = areaGrid(recipe, path);
  const el = grid && zone?.querySelector<HTMLElement>(`[data-recipe-grid="${keyOf(grid.path)}"]`);
  const box = zone?.querySelector<HTMLElement>(`[data-recipe-path="${keyOf(path)}"]`)?.getBoundingClientRect();
  if (!grid || !el || !box) return undefined;
  const [cols, rows] = [grid.tracks.cols.length, grid.tracks.rows.length];
  const lines = gridLines(el, cols, rows);
  return { lines, drawn: drawnArea(box, lines), cols, rows };
}

/** The handles: four edges, four corners, each with the edges it drags and its cursor. */
const HANDLES: readonly { id: string; edges: AreaEdges; x: number; y: number; cursor: string; label: string }[] = [
  { id: "left", edges: { left: true }, x: 0, y: 0.5, cursor: "cursor-ew-resize", label: "left edge" },
  { id: "right", edges: { right: true }, x: 1, y: 0.5, cursor: "cursor-ew-resize", label: "right edge" },
  { id: "top", edges: { top: true }, x: 0.5, y: 0, cursor: "cursor-ns-resize", label: "top edge" },
  { id: "bottom", edges: { bottom: true }, x: 0.5, y: 1, cursor: "cursor-ns-resize", label: "bottom edge" },
  { id: "top-left", edges: { top: true, left: true }, x: 0, y: 0, cursor: "cursor-nwse-resize", label: "top left corner" },
  { id: "top-right", edges: { top: true, right: true }, x: 1, y: 0, cursor: "cursor-nesw-resize", label: "top right corner" },
  { id: "bottom-left", edges: { bottom: true, left: true }, x: 0, y: 1, cursor: "cursor-nesw-resize", label: "bottom left corner" },
  { id: "bottom-right", edges: { bottom: true, right: true }, x: 1, y: 1, cursor: "cursor-nwse-resize", label: "bottom right corner" },
];

/** "Columns 2 to 3, rows 1 to 2": an area as the handles say it. */
export const areaText = (a: ZoneRect): string => `Columns ${a.col} to ${a.col + a.cols - 1}, rows ${a.row} to ${a.row + a.rows - 1}`;

export interface LayoutHandlesProps {
  zone: HTMLElement | null;
  recipe: Recipe;
  path: Path;
  locked: readonly string[];
  tick: unknown;
  /** A step of a drag, shown on the stage and not yet an undo step; null puts the stage back. */
  onLive: (recipe: Recipe | null) => void;
  /** The edit made (a release, a key): one undo step, `text` said to a screen reader. */
  onDone: (recipe: Recipe, text: string) => void;
}

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** A box in the zone's own px from a client rect. */
const inZone = (zone: HTMLElement, r: { left: number; top: number; right: number; bottom: number }): Box => {
  const z = zone.getBoundingClientRect();
  const scale = z.width / (zone.offsetWidth || 1) || 1;
  return { x: (r.left - z.left) / scale, y: (r.top - z.top) / scale, w: (r.right - r.left) / scale, h: (r.bottom - r.top) / scale };
};

/** The area handles and the tracks' outline for a block of a grid with tracks. */
export function AreaHandles({ zone, recipe, path, locked, tick, onLive, onDone }: LayoutHandlesProps) {
  const on = !!areaGrid(recipe, path) && !flagged(locked, path);
  const [placed, setPlaced] = useState<{ box: Box; lines: Box[] } | null>(null);
  const [drag, setDrag] = useState<string | null>(null);
  useLayoutEffect(() => {
    const m = on && zone ? measureArea(zone, recipe, path) : undefined;
    const el = zone?.querySelector<HTMLElement>(`[data-recipe-path="${keyOf(path)}"]`);
    if (!zone || !m || !el) return setPlaced(null);
    const r = el.getBoundingClientRect();
    const { lines } = m;
    const [top, bottom, left, right] = [lines.rows[0] ?? r.top, lines.rowEnd, lines.cols[0] ?? r.left, lines.colEnd];
    setPlaced({
      box: inZone(zone, r),
      lines: [...lines.cols.slice(1).map((x) => inZone(zone, { left: x, right: x, top, bottom })), ...lines.rows.slice(1).map((y) => inZone(zone, { left, right, top: y, bottom: y }))],
    });
  }, [zone, keyOf(path), on, tick]);
  if (!on || !placed) return null;
  const name = layerName(recipe, blockAt(recipe, path)!);

  const press = (edges: AreaEdges, e: PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    e.preventDefault();
    const m = measureArea(zone, recipe, path);
    if (!m) return;
    const from = areaNow(recipe, path, m.drawn);
    const [x0, y0] = [e.clientX, e.clientY];
    let started = false;
    let last: ZoneRect | null = null;
    trackPointer(
      (p) => {
        if (!started && !pastDragThreshold(p.clientX - x0, p.clientY - y0)) return;
        started = true;
        last = resizeArea(from, edges, { col: nearestLine(p.clientX, m.lines.cols, m.lines.colEnd), row: nearestLine(p.clientY, m.lines.rows, m.lines.rowEnd) }, m.cols, m.rows);
        setDrag(areaText(last));
        onLive(setArea(recipe, path, last));
      },
      (cancelled) => {
        setDrag(null);
        if (cancelled || !last) return onLive(null);
        onDone(setArea(recipe, path, last), `${name}: ${areaText(last)}`);
      },
    );
  };

  const key = (edges: AreaEdges, e: KeyboardEvent<HTMLDivElement>) => {
    const by = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key];
    if (!by || e.altKey || e.ctrlKey || e.metaKey) return;
    e.preventDefault();
    e.stopPropagation();
    const m = measureArea(zone, recipe, path);
    if (!m) return;
    const a = areaNow(recipe, path, m.drawn);
    // the edge's line, one track on: a corner moves both of its edges
    const line = { col: (edges.left ? a.col - 1 : a.col - 1 + a.cols) + by[0], row: (edges.top ? a.row - 1 : a.row - 1 + a.rows) + by[1] };
    const next = resizeArea(a, edges, line, m.cols, m.rows);
    onDone(setArea(recipe, path, next), `${name}: ${areaText(next)}`);
  };

  const { box } = placed;
  return (
    <>
      <div aria-hidden data-track-lines="" className="pointer-events-none absolute inset-0 z-10">
        {placed.lines.map((l, k) => (
          <div key={k} className="absolute border-ui-accent/50 border-dashed" style={{ left: l.x, top: l.y, width: Math.max(l.w, 0), height: Math.max(l.h, 0), borderLeftWidth: l.w < 1 ? 1 : 0, borderTopWidth: l.h < 1 ? 1 : 0 }} />
        ))}
      </div>
      {HANDLES.map((h) => (
        <div
          key={h.id}
          role="button"
          tabIndex={0}
          aria-label={`Resize ${name}'s area from its ${h.label}`}
          aria-keyshortcuts="ArrowLeft ArrowRight ArrowUp ArrowDown"
          data-area-handle={h.id}
          onPointerDown={(e) => press(h.edges, e)}
          onKeyDown={(e) => key(h.edges, e)}
          className={cn("absolute z-20 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-4 border-2 border-ui-accent bg-white focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ui-accent", h.cursor)}
          style={{ left: box.x + box.w * h.x, top: box.y + box.h * h.y }}
        />
      ))}
      {drag && (
        <span data-area-text="" className="pointer-events-none absolute z-20 whitespace-nowrap rounded-4 bg-ui-accent px-1.5 py-0.5 font-ui text-micro font-medium text-white" style={{ left: box.x, top: box.y + box.h + 6 }}>
          {drag}
        </span>
      )}
    </>
  );
}

/**
 * The cross handles: a block's part of its column's width (left and right) or its row's height (top and bottom). The dragged edge follows
 * the pointer and the other stays where it was at the press; on release the block sits at its place (start, centre or end) in what it
 * leaves.
 */
export function FillHandles({ zone, recipe, path, locked, tick, onLive, onDone }: LayoutHandlesProps) {
  const axis = flagged(locked, path) ? undefined : fillAxis(recipe, path);
  const [box, setBox] = useState<Box | null>(null);
  const [drag, setDrag] = useState<{ id: string; text: string } | null>(null);
  useLayoutEffect(() => {
    const el = zone?.querySelector<HTMLElement>(`[data-recipe-path="${keyOf(path)}"]`);
    setBox(axis && zone && el ? inZone(zone, el.getBoundingClientRect()) : null);
  }, [zone, keyOf(path), axis, tick]);
  if (!axis || !box) return null;
  const b = blockAt(recipe, path)!;
  const name = layerName(recipe, b);
  const across = axis === "column";
  const ends = across ? (["left", "right"] as const) : (["top", "bottom"] as const);

  const press = (end: (typeof ends)[number], e: PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    e.preventDefault();
    const cell = zone?.querySelector<HTMLElement>(`[data-recipe-path="${keyOf(path)}"]`);
    const own = cell?.getBoundingClientRect();
    const room = cell?.parentElement?.getBoundingClientRect();
    if (!own || !room) return;
    const length = (across ? room.width : room.height) || 1;
    // the edge that stays, where it was at the press
    const stays = end === "left" ? own.right : end === "right" ? own.left : end === "top" ? own.bottom : own.top;
    const [x0, y0] = [e.clientX, e.clientY];
    let started = false;
    let last: number | null = null;
    trackPointer(
      (m) => {
        if (!started && !pastDragThreshold(m.clientX - x0, m.clientY - y0)) return;
        started = true;
        last = snapFill(Math.abs((across ? m.clientX : m.clientY) - stays) / length);
        setDrag({ id: end, text: fillText(last) });
        onLive(setFill(recipe, path, last, b.place));
      },
      (cancelled) => {
        setDrag(null);
        if (cancelled || last === null) return onLive(null);
        onDone(setFill(recipe, path, last, b.place), `${name}: ${fillText(last)} of its ${across ? "column's width" : "row's height"}`);
      },
    );
  };

  const key = (end: (typeof ends)[number], e: KeyboardEvent<HTMLDivElement>) => {
    const grow = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
    if (!grow || e.altKey || e.ctrlKey || e.metaKey) return;
    e.preventDefault();
    e.stopPropagation();
    // the far edge grows outward with Right or Down, the near one with Left or Up
    const by = (end === "left" || end === "top" ? -grow : grow) as 1 | -1;
    const next = stepFill(b.fill ?? 1, by);
    onDone(setFill(recipe, path, next, b.place), `${name}: ${fillText(next)} of its ${across ? "column's width" : "row's height"}`);
  };

  return (
    <>
      {ends.map((end) => {
        // just outside the block's edge, so a press or a right-click inside the block stays the block's
        const at = end === "left" ? { left: box.x - 9, top: box.y, width: 8, height: box.h } : end === "right" ? { left: box.x + box.w + 1, top: box.y, width: 8, height: box.h } : end === "top" ? { left: box.x, top: box.y - 9, width: box.w, height: 8 } : { left: box.x, top: box.y + box.h + 1, width: box.w, height: 8 };
        const shown = drag?.id === end ? drag : null;
        return (
          <div
            key={end}
            role="slider"
            tabIndex={0}
            aria-label={`${name}'s part of its ${across ? "column's width" : "row's height"}, ${end} edge`}
            aria-orientation={across ? "horizontal" : "vertical"}
            aria-valuemin={10}
            aria-valuemax={100}
            aria-valuenow={Math.round((b.fill ?? 1) * 100)}
            aria-valuetext={fillText(b.fill)}
            data-fill-handle={end}
            onPointerDown={(e) => press(end, e)}
            onKeyDown={(e) => key(end, e)}
            className={cn("group absolute z-20 flex items-center justify-center outline-none", across ? "cursor-ew-resize" : "cursor-ns-resize")}
            style={at}
          >
            <span aria-hidden className={cn("rounded-full bg-ui-accent opacity-60 group-hover:opacity-100 group-focus-visible:opacity-100 group-focus-visible:outline-2 group-focus-visible:outline-offset-2 group-focus-visible:outline-ui-accent", across ? "h-5 max-h-full w-1" : "h-1 w-5 max-w-full", shown && "opacity-100")} />
            {shown && <span data-fill-text="" className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 whitespace-nowrap rounded-4 bg-ui-accent px-1.5 py-0.5 font-ui text-micro font-medium text-white">{shown.text}</span>}
          </div>
        );
      })}
    </>
  );
}
