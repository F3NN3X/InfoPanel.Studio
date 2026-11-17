// The stage's share handles (builder plan Phase 1): on each edge the selected block shares with the block before or after it in a Row
// or a Card (`shareEdges`), a handle that moves the edge by changing the two blocks' shares, their sum kept, so the edge stays where it
// is set at every size. Dragged, it snaps to 1:3, 1:2, 1:1, 2:1 and 3:1 and says "60 % | 40 %"; Esc puts it back. Focused (a
// separator, as the APG window splitter), the arrows move it 5 % a press. The stage shows each step as it is dragged; the release is
// one undo step.
import { type KeyboardEvent, type PointerEvent, useLayoutEffect, useState } from "react";
import { pastDragThreshold, trackPointer } from "@/components/studio/pointer-drag";
import { cn } from "@/lib/utils";
import type { Recipe } from "@/widgets/recipe/types";
import { blockAt, layerName, setShares, type Path } from "./builder-model";
import { flagged } from "./editor-flags";
import { type ShareEdge, sharePercent, shareEdges, shareText, splitShares } from "./stage-edit";

/** How far a key press moves a handle, as a part of the two blocks' length. */
const KEY_STEP = 0.05;

interface Placed {
  edge: ShareEdge;
  /** The handle's box in the zone's own px. */
  x: number;
  y: number;
  w: number;
  h: number;
}

const keyOf = (p: Path): string => p.join(".");
const growOf = (recipe: Recipe, at: Path): number => blockAt(recipe, at)?.grow ?? 1;

export interface ShareHandlesProps {
  zone: HTMLElement | null;
  /** The recipe the stage draws (a handle's drag shows there as it goes). */
  recipe: Recipe;
  path: Path;
  locked: readonly string[];
  tick: unknown;
  /** A step of a drag, shown on the stage and not yet an undo step; null puts the stage back. */
  onLive: (recipe: Recipe | null) => void;
  /** The shares set (a release, a key): one undo step, `text` said to a screen reader. */
  onDone: (recipe: Recipe, text: string) => void;
}

export function ShareHandles({ zone, recipe, path, locked, tick, onLive, onDone }: ShareHandlesProps) {
  const edges = flagged(locked, path) ? [] : shareEdges(recipe, path).filter((e) => !flagged(locked, e.a) && !flagged(locked, e.b));
  const shape = edges.map((e) => `${keyOf(e.a)}|${keyOf(e.b)}`).join(",");
  const [placed, setPlaced] = useState<Placed[]>([]);
  const [drag, setDrag] = useState<{ key: string; text: string; why?: string } | null>(null);
  useLayoutEffect(() => {
    if (!zone) return setPlaced([]);
    const z = zone.getBoundingClientRect();
    const scale = z.width / zone.offsetWidth || 1;
    const box = (at: Path) => zone.querySelector<HTMLElement>(`[data-recipe-path="${keyOf(at)}"]`)?.getBoundingClientRect();
    setPlaced(
      edges.flatMap((edge): Placed[] => {
        const a = box(edge.a);
        const b = box(edge.b);
        if (!a || !b) return [];
        const [left, top, right, bottom] = [Math.min(a.left, b.left), Math.min(a.top, b.top), Math.max(a.right, b.right), Math.max(a.bottom, b.bottom)].map((v, i) => (v - (i % 2 ? z.top : z.left)) / scale);
        const mid = ((edge.across ? a.right + b.left : a.bottom + b.top) / 2 - (edge.across ? z.left : z.top)) / scale;
        return [edge.across ? { edge, x: mid - 5, y: top, w: 10, h: bottom - top } : { edge, x: left, y: mid - 5, w: right - left, h: 10 }];
      }),
    );
  }, [zone, shape, tick]);

  const press = (edge: ShareEdge, e: PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    e.preventDefault();
    const a = zone?.querySelector<HTMLElement>(`[data-recipe-path="${keyOf(edge.a)}"]`)?.getBoundingClientRect();
    const b = zone?.querySelector<HTMLElement>(`[data-recipe-path="${keyOf(edge.b)}"]`)?.getBoundingClientRect();
    if (!a || !b) return;
    const start = edge.across ? a.left : a.top;
    const length = (edge.across ? b.right : b.bottom) - start || 1;
    const sum = growOf(recipe, edge.a) + growOf(recipe, edge.b);
    const key = `${keyOf(edge.a)}|${keyOf(edge.b)}`;
    const [x0, y0] = [e.clientX, e.clientY];
    let started = false;
    let last: { recipe: Recipe; text: string } | null = null;
    trackPointer(
      (m) => {
        if (!started && !pastDragThreshold(m.clientX - x0, m.clientY - y0)) return;
        started = true;
        const r = splitShares(sum, ((edge.across ? m.clientX : m.clientY) - start) / length);
        if ("why" in r) return setDrag({ key, text: last?.text ?? "", why: r.why });
        last = { recipe: setShares(recipe, edge.a, edge.b, [r.a, r.b]), text: shareText(r.a, r.b) };
        setDrag({ key, text: last.text });
        onLive(last.recipe);
      },
      (cancelled) => {
        setDrag(null);
        if (cancelled || !last) return onLive(null);
        onDone(last.recipe, `Shares ${last.text}`);
      },
    );
  };

  const key = (edge: ShareEdge, e: KeyboardEvent<HTMLDivElement>) => {
    const by = { ArrowLeft: -1, ArrowUp: -1, ArrowRight: 1, ArrowDown: 1 }[e.key];
    if (!by || e.altKey || e.ctrlKey || e.metaKey) return;
    e.preventDefault();
    e.stopPropagation();
    const [ga, gb] = [growOf(recipe, edge.a), growOf(recipe, edge.b)];
    const r = splitShares(ga + gb, ga / (ga + gb) + by * KEY_STEP, false);
    if ("why" in r) return;
    onDone(setShares(recipe, edge.a, edge.b, [r.a, r.b]), `Shares ${shareText(r.a, r.b)}`);
  };

  // the boxes are measured after the draw: until then those of an edit's edges may name blocks that have moved or gone
  const ids = new Set(shape.split(","));
  return (
    <>
      {placed.map(({ edge, x, y, w, h }) => {
        const id = `${keyOf(edge.a)}|${keyOf(edge.b)}`;
        if (!ids.has(id)) return null;
        const [ga, gb] = [growOf(recipe, edge.a), growOf(recipe, edge.b)];
        const shown = drag?.key === id ? drag : null;
        const names = `${layerName(recipe, blockAt(recipe, edge.a)!)} and ${layerName(recipe, blockAt(recipe, edge.b)!)}`;
        return (
          <div
            key={id}
            role="separator"
            tabIndex={0}
            aria-orientation={edge.across ? "vertical" : "horizontal"}
            aria-label={`Share between ${names}`}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={sharePercent(ga, gb)}
            aria-valuetext={shareText(ga, gb)}
            data-share-handle={id}
            onPointerDown={(e) => press(edge, e)}
            onKeyDown={(e) => key(edge, e)}
            className={cn("group absolute z-20 flex items-center justify-center outline-none", edge.across ? "cursor-col-resize" : "cursor-row-resize")}
            style={{ left: x, top: y, width: w, height: h }}
          >
            <span aria-hidden className={cn("rounded-full bg-ui-accent opacity-70 group-hover:opacity-100 group-focus-visible:opacity-100 group-focus-visible:outline-2 group-focus-visible:outline-offset-2 group-focus-visible:outline-ui-accent", edge.across ? "h-6 max-h-full w-1" : "h-1 w-6 max-w-full", shown && "opacity-100")} />
            {shown && (
              <span data-share-text="" className={cn("pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 whitespace-nowrap rounded-[4px] px-1.5 py-0.5 font-ui text-[11px] font-medium", shown.why ? "border border-ui-warn bg-ui-panel text-ui-warn" : "bg-ui-accent text-white")}>
                {shown.why ?? shown.text}
              </span>
            )}
          </div>
        );
      })}
    </>
  );
}
