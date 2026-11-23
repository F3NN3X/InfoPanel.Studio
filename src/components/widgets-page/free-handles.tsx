// The stage's half of the free layout (format 2): a free container's frame and its blocks' boxes measured in its own px, the selected
// block's eight resize handles (Shift keeps its shape, Alt sizes it from its centre, the arrows step an edge 1 % and Shift+arrows 10 %),
// the smart guides with their distance markers and the live readout, the rubber band, and the Arrange bar shown while two or more free
// blocks are selected. The snapping is `free-snap.ts`, the edits `free-layout.ts`; a release or a key is one undo step, Esc puts a drag back.
import { AlignCenterHorizontal, AlignCenterVertical, AlignEndHorizontal, AlignEndVertical, AlignHorizontalDistributeCenter, AlignStartHorizontal, AlignStartVertical, AlignVerticalDistributeCenter } from "lucide-react";
import { type KeyboardEvent, type PointerEvent, type ReactNode, useLayoutEffect, useState } from "react";
import { pastDragThreshold, trackPointer } from "@/components/studio/pointer-drag";
import { IconButton } from "@/components/ui/icon-button";
import { cn } from "@/lib/utils";
import type { FreeBox, Recipe } from "@/widgets/recipe/types";
import { BOX_MIN } from "@/widgets/recipe/validate";
import { blockAt, layerName, type Path } from "./builder-model";
import { flagged } from "./editor-flags";
import { ARRANGE_LABEL, boxText, clampBox, type FreeArrange, freeParent, setBoxes } from "./free-layout";
import { type Box, clipTo, freeTargets, type Gap, type Guide, type Handle, resizeBy, snapDistance, snapFreeResize } from "./free-snap";

const keyOf = (p: Path): string => p.join(".");

/** A container's content box on the stage: where it is in the zone's px, its size in its own px, and the stage's screen px per px. */
export interface Frame {
  x: number;
  y: number;
  w: number;
  h: number;
  scale: number;
  /** Its client rect, to read a pointer against. */
  left: number;
  top: number;
}

/** The content box of the container at `path` (its blocks' frame, flow or free), or undefined where it is not drawn. */
export function frameOf(zone: HTMLElement | null, path: Path): Frame | undefined {
  const el = zone?.querySelector<HTMLElement>(`[data-recipe-children="${keyOf(path)}"]`);
  if (!zone || !el) return undefined;
  const z = zone.getBoundingClientRect();
  const r = el.getBoundingClientRect();
  const scale = z.width / (zone.offsetWidth || 1) || 1;
  return { x: (r.left - z.left) / scale, y: (r.top - z.top) / scale, w: r.width / scale, h: r.height / scale, scale, left: r.left, top: r.top };
}

/** The drawn box of the block at `path` in `frame`'s px, or undefined where it is not drawn (hidden by a condition). */
export function boxIn(zone: HTMLElement | null, frame: Frame, path: Path): Box | undefined {
  const r = zone?.querySelector<HTMLElement>(`[data-recipe-path="${keyOf(path)}"]`)?.getBoundingClientRect();
  return r && r.width > 0 && r.height > 0 ? { x: (r.left - frame.left) / frame.scale, y: (r.top - frame.top) / frame.scale, width: r.width / frame.scale, height: r.height / frame.scale } : undefined;
}

/** A box in a frame's px as fractions of it. */
export const fractionOf = (b: Box, frame: { w: number; h: number }): FreeBox => clampBox([b.x / (frame.w || 1), b.y / (frame.h || 1), b.width / (frame.w || 1), b.height / (frame.h || 1)]);
/** Fractions as a box in a frame's px. */
export const pxOf = (b: readonly number[], frame: { w: number; h: number }): Box => ({ x: b[0] * frame.w, y: b[1] * frame.h, width: b[2] * frame.w, height: b[3] * frame.h });

/**
 * Where each block of the container at `path` is drawn now, as fractions of its content box, by child index: what Free starts from. Not
 * clamped: a block drawn past the box's edge (a flow that overflowed it) reads past 0-1, and `setFree` grows the container to hold it.
 */
export function drawnBoxes(zone: HTMLElement | null, recipe: Recipe, path: Path): Record<number, number[]> {
  const b = blockAt(recipe, path);
  const frame = frameOf(zone, path);
  if (!frame || !b || !("children" in b)) return {};
  return Object.fromEntries(
    b.children.flatMap((_, k) => {
      const box = boxIn(zone, frame, [...path, k]);
      return box ? [[k, [box.x / (frame.w || 1), box.y / (frame.h || 1), box.width / (frame.w || 1), box.height / (frame.h || 1)]]] : [];
    }),
  );
}

/** The padding a guide marks inside a container: its room between blocks (a root card's or a grid's spacing, a row's gap), else 6 px. */
export function padOf(recipe: Recipe, path: Path): number {
  const b = blockAt(recipe, path);
  const spacing = b && "spacing" in b ? b.spacing : undefined;
  if (b?.type === "row") return b.gap ?? 6;
  return spacing === "tight" ? 2 : spacing === "roomy" ? 12 : 6;
}

/** The boxes of a free container's other blocks (the locked ones too: they stay snap targets), in its frame's px. */
export function siblingBoxes(zone: HTMLElement | null, recipe: Recipe, parent: Path, frame: Frame, except: readonly Path[]): Box[] {
  const b = blockAt(recipe, parent);
  const skip = new Set(except.map(keyOf));
  return (b && "children" in b ? b.children : []).flatMap((c, k) => (c.background || skip.has(keyOf([...parent, k])) ? [] : (boxIn(zone, frame, [...parent, k]) ?? [])));
}

/** What the stage shows while a box moves or resizes: the guides and gaps in `frame`'s px, and the readout by the box. */
export interface GuideView {
  frame: Frame;
  guides: Guide[];
  gaps: Gap[];
  /** The moving box (or the group's) in the frame's px, and what the readout says beside it. */
  box: Box;
  text: string;
}

/** The InfoPanel editor's guide colour, so a guide reads the same in both editors. */
const GUIDE = "var(--ui-guide)";

/** The smart guides across the container, a marker for each equal gap, and the readout under the moving box. */
export function FreeGuides({ view }: { view: GuideView }) {
  const { frame: f } = view;
  const line = (k: string, style: Record<string, number | string>, data: Record<string, string>): ReactNode => <div key={k} {...data} className="absolute" style={{ background: GUIDE, ...style }} />;
  return (
    <div aria-hidden data-free-guides="" className="pointer-events-none absolute inset-0 z-30">
      {view.guides.map((g) => line(`${g.axis}${g.at}`, g.axis === "x" ? { left: f.x + g.at, top: f.y, width: 1, height: f.h } : { left: f.x, top: f.y + g.at, width: f.w, height: 1 }, { "data-guide": g.axis }))}
      {view.gaps.map((g, k) => {
        const along = g.axis === "x";
        const [x, y] = along ? [f.x + g.from, f.y + g.at] : [f.x + g.at, f.y + g.from];
        const size = g.to - g.from;
        return (
          <div key={`gap${k}`} data-gap={g.axis} className="absolute" style={along ? { left: x, top: y - 4, width: size, height: 8 } : { left: x - 4, top: y, width: 8, height: size }}>
            <div className="absolute" style={{ background: GUIDE, ...(along ? { left: 0, right: 0, top: 3.5, height: 1 } : { top: 0, bottom: 0, left: 3.5, width: 1 }) }} />
            <div className="absolute" style={{ background: GUIDE, ...(along ? { left: 0, top: 0, width: 1, height: 8 } : { top: 0, left: 0, height: 1, width: 8 }) }} />
            <div className="absolute" style={{ background: GUIDE, ...(along ? { right: 0, top: 0, width: 1, height: 8 } : { bottom: 0, left: 0, height: 1, width: 8 }) }} />
          </div>
        );
      })}
      <span data-free-readout="" className="absolute whitespace-nowrap rounded-4 bg-ui-accent px-1.5 py-0.5 font-ui text-micro font-medium tabular-nums text-white" style={{ left: f.x + view.box.x, top: f.y + view.box.y + view.box.height + 6 }}>
        {view.text}
      </span>
    </div>
  );
}

/** The rubber band while it is dragged, in the zone's px. */
export function Band({ box }: { box: { x: number; y: number; w: number; h: number } }) {
  return <div aria-hidden data-band="" className="pointer-events-none absolute z-30 rounded-2 border border-dashed border-ui-accent bg-ui-accent/10" style={{ left: box.x, top: box.y, width: box.w, height: box.h }} />;
}

/** The resize handles: four corners, four edges, each with its cursor and what it says. */
const HANDLES: readonly { id: Handle; x: number; y: number; cursor: string; label: string }[] = [
  { id: "nw", x: 0, y: 0, cursor: "cursor-nwse-resize", label: "top left corner" },
  { id: "n", x: 0.5, y: 0, cursor: "cursor-ns-resize", label: "top edge" },
  { id: "ne", x: 1, y: 0, cursor: "cursor-nesw-resize", label: "top right corner" },
  { id: "e", x: 1, y: 0.5, cursor: "cursor-ew-resize", label: "right edge" },
  { id: "se", x: 1, y: 1, cursor: "cursor-nwse-resize", label: "bottom right corner" },
  { id: "s", x: 0.5, y: 1, cursor: "cursor-ns-resize", label: "bottom edge" },
  { id: "sw", x: 0, y: 1, cursor: "cursor-nesw-resize", label: "bottom left corner" },
  { id: "w", x: 0, y: 0.5, cursor: "cursor-ew-resize", label: "left edge" },
];

export interface FreeHandlesProps {
  zone: HTMLElement | null;
  recipe: Recipe;
  path: Path;
  locked: readonly string[];
  tick: unknown;
  /** A step of a drag, shown on the stage and not yet an undo step; null puts the stage back. */
  onLive: (recipe: Recipe | null) => void;
  /** The guides and readout while a handle is dragged; null when it ends. */
  onGuides: (view: GuideView | null) => void;
  /** The edit made (a release, a key): one undo step, `text` said to a screen reader. */
  onDone: (recipe: Recipe, text: string) => void;
}

/** The selected free block's resize handles (none for a locked one). */
export function FreeHandles({ zone, recipe, path, locked, tick, onLive, onGuides, onDone }: FreeHandlesProps) {
  const parent = flagged(locked, path) ? undefined : freeParent(recipe, path);
  const [placed, setPlaced] = useState<{ frame: Frame; box: Box } | null>(null);
  useLayoutEffect(() => {
    const frame = parent && frameOf(zone, parent);
    const box = frame && boxIn(zone, frame, path);
    setPlaced(frame && box ? { frame, box } : null);
  }, [zone, keyOf(path), parent && keyOf(parent), tick]);
  if (!parent || !placed) return null;
  const name = layerName(recipe, blockAt(recipe, path)!);

  const press = (handle: Handle, e: PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    e.preventDefault();
    const frame = frameOf(zone, parent);
    const start = frame && boxIn(zone, frame, path);
    if (!frame || !start) return;
    const targets = freeTargets(frame, padOf(recipe, parent), siblingBoxes(zone, recipe, parent, frame, [path]));
    const min = { w: BOX_MIN * frame.w, h: BOX_MIN * frame.h };
    const [x0, y0] = [e.clientX, e.clientY];
    let started = false;
    let last: FreeBox | null = null;
    trackPointer(
      (p) => {
        if (!started && !pastDragThreshold(p.clientX - x0, p.clientY - y0)) return;
        started = true;
        const s = snapFreeResize(start, handle, (p.clientX - x0) / frame.scale, (p.clientY - y0) / frame.scale, { aspect: p.shiftKey, centre: p.altKey }, targets, snapDistance(frame.scale, false), frame, min);
        last = fractionOf(s.box, frame);
        onGuides({ frame, guides: s.guides, gaps: s.gaps, box: s.box, text: boxText(last) });
        onLive(setBoxes(recipe, [{ path, box: last }]));
      },
      (cancelled) => {
        onGuides(null);
        if (cancelled || !last) return onLive(null);
        onDone(setBoxes(recipe, [{ path, box: last }]), `${name}: ${boxText(last)}`);
      },
    );
  };

  const key = (handle: Handle, e: KeyboardEvent<HTMLDivElement>) => {
    const by = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key];
    if (!by || e.altKey || e.ctrlKey || e.metaKey) return;
    e.preventDefault();
    e.stopPropagation();
    const own = blockAt(recipe, path)?.box;
    if (!own) return;
    // the handle's edges a step on, in fractions of the container: 1 %, 10 % with Shift
    const step = e.shiftKey ? 0.1 : 0.01;
    const box = clipTo(resizeBy(pxOf(own, { w: 1, h: 1 }), handle, by[0] * step, by[1] * step, false, { w: BOX_MIN, h: BOX_MIN }), { w: 1, h: 1 });
    const next = clampBox([box.x, box.y, box.width, box.height]);
    onDone(setBoxes(recipe, [{ path, box: next }]), `${name}: ${boxText(next)}`);
  };

  const { frame, box } = placed;
  return (
    <>
      {HANDLES.map((h) => (
        <div
          key={h.id}
          role="button"
          tabIndex={0}
          aria-label={`Resize ${name} from its ${h.label}`}
          aria-keyshortcuts="ArrowLeft ArrowRight ArrowUp ArrowDown Shift+ArrowLeft Shift+ArrowRight Shift+ArrowUp Shift+ArrowDown"
          data-free-handle={h.id}
          onPointerDown={(e) => press(h.id, e)}
          onKeyDown={(e) => key(h.id, e)}
          className={cn("absolute z-20 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-2 border-[1.5px] border-ui-accent bg-white focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ui-accent", h.cursor)}
          style={{ left: frame.x + box.x + box.width * h.x, top: frame.y + box.y + box.height * h.y }}
        />
      ))}
    </>
  );
}

const ARRANGE_ICONS: Readonly<Record<FreeArrange, ReactNode>> = {
  left: <AlignStartVertical className="h-4 w-4" />,
  centre: <AlignCenterVertical className="h-4 w-4" />,
  right: <AlignEndVertical className="h-4 w-4" />,
  top: <AlignStartHorizontal className="h-4 w-4" />,
  middle: <AlignCenterHorizontal className="h-4 w-4" />,
  bottom: <AlignEndHorizontal className="h-4 w-4" />,
  "distribute-h": <AlignHorizontalDistributeCenter className="h-4 w-4" />,
  "distribute-v": <AlignVerticalDistributeCenter className="h-4 w-4" />,
};
const ALIGNS: readonly FreeArrange[] = ["left", "centre", "right", "top", "middle", "bottom"];

/** The Arrange bar over the stage while two or more free blocks of one container are selected: align them, and with three distribute. */
export function ArrangeBar({ count, onArrange }: { count: number; onArrange: (op: FreeArrange) => void }) {
  return (
    <div role="toolbar" aria-label="Arrange" data-arrange-bar="" className="flex items-center gap-0.5 rounded-ui-md border border-ui-subtle bg-ui-panel px-1 py-0.5">
      <span className="whitespace-nowrap px-1.5 text-caption text-ui-3">Arrange {count}</span>
      {ALIGNS.map((op) => (
        <IconButton key={op} label={ARRANGE_LABEL[op]} size={28} data-arrange={op} onClick={() => onArrange(op)}>
          {ARRANGE_ICONS[op]}
        </IconButton>
      ))}
      <span aria-hidden className="mx-1 h-4 w-px bg-ui-subtle" />
      {(["distribute-h", "distribute-v"] as const).map((op) => (
        <IconButton key={op} label={ARRANGE_LABEL[op]} size={28} disabled={count < 3} data-arrange={op} onClick={() => onArrange(op)}>
          {ARRANGE_ICONS[op]}
        </IconButton>
      ))}
    </div>
  );
}
