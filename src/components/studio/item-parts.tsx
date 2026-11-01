/**
 * The InfoPanel items and elements of a screen page on the studio canvas (Edit v3 SPEC §7): each item placement's
 * box takes the pointer over the drawn page (the items themselves draw in the page's item layers), so it can be
 * selected (Shift / Ctrl adds), moved and resized. A gesture snaps the part to cells, or places it freely to the pixel
 * while Alt is held (the page's Snap items off: the other way round); pressing or releasing Alt mid-drag switches at
 * once. While a part moves freely its start box shows dashed and a readout of its box follows it. Every change goes
 * through the page model's ops (`onOps`), and a drag is one undo step. A selected page group shows one accent box
 * around its members with a `{name} · group` chip (SPEC §7.1): dragging it moves the group (by cells when it holds a
 * widget, `layer-actions.ts` `groupMoveOps`), double-clicking it selects the part under the pointer. A press on a part
 * inside a group, a widget's too (`pressRef`), selects its outermost group first and drags it (SPEC §10.3 note).
 * Coordinates are the page's design px.
 */
import { useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent, type MutableRefObject, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import type { MonitorProfile, Placement, ProfilePage, ProfileView } from "@/lib/layout";
import { boxOf, findNode, partsOf, type GroupNode, type PageModel, type PageOp, type PartNode, type PixelBox } from "@/lib/page-model/model";
import { lockedInTree, unionBox } from "@/lib/page-model/layer-actions";
import { readPlacements } from "@/lib/page-model/placements-adapter";
import { moveOps, placesFreely, resizeOps, type Handle, type Start } from "@/lib/page-model/gesture";
import { hiddenByGroups } from "@/lib/page-model/items-layer";
import { cn } from "@/lib/utils";
import { pastDragThreshold, trackPointer } from "./pointer-drag";
import { isToggleClick } from "./selection";

/** What a gesture in flight shows over the canvas: whether Alt is held and whether the parts go free. */
export interface ItemGesture {
  alt: boolean;
  free: boolean;
}

/** Whether Alt is held, followed while `active` (a drag in flight); false otherwise. */
export function useAltHeld(active: boolean): boolean {
  const [alt, setAlt] = useState(false);
  useEffect(() => {
    if (!active) return setAlt(false);
    const read = (e: KeyboardEvent | PointerEvent) => setAlt(e instanceof KeyboardEvent && e.key === "Alt" ? e.type === "keydown" : e.altKey);
    window.addEventListener("keydown", read, true);
    window.addEventListener("keyup", read, true);
    window.addEventListener("pointermove", read, true);
    return () => {
      window.removeEventListener("keydown", read, true);
      window.removeEventListener("keyup", read, true);
      window.removeEventListener("pointermove", read, true);
    };
  }, [active]);
  return alt;
}

const HANDLES: Handle[] =["nw", "n", "ne", "e", "se", "s", "sw", "w"];
const HANDLE_PX = 8;

interface ItemPartsProps {
  /** The page's screen (its grid and size). */
  profile: ProfileView;
  /** The page as stored: its item placements. */
  page: ProfilePage;
  zoom: number;
  /** The selected item placements, the primary last. */
  selectedIds: readonly string[];
  onSelect: (id: string, toggle: boolean) => void;
  /** Apply ops to the page; `key` coalesces a drag's changes. */
  onOps: (ops: PageOp[], key: string) => void;
  onDragBegin: () => void;
  onDragCommit: () => void;
  onDragCancel: () => void;
  /** A gesture started, changed (Alt) or ended (null). */
  onGesture: (gesture: ItemGesture | null) => void;
  onContextMenu?: (id: string, x: number, y: number) => void;
  /** An item placement's Export check badge, on a screen made for InfoPanel. */
  badgeOf?: (p: Placement) => ReactNode;
  /** The selected page groups, drawn as one box each that drags the group. */
  groups?: GroupMoves;
  /** Filled with the press on a grouped widget (the canvas's zones call it). */
  pressRef?: MutableRefObject<PressGrouped | null>;
}

export interface GroupMoves {
  selected: readonly string[];
  /** Move the groups by a pointer delta from where they were in `from` (one drag, `key`); false when refused. */
  onMove: (from: PageModel, ids: readonly string[], dx: number, dy: number, free: boolean, key: string) => boolean;
  /** A drag ended where the group can't go (it went back). */
  onRefused: () => void;
  /** Double-click inside a group's box: select the part there. */
  onPick: (id: string) => void;
  /** A press on a part inside a group selects its outermost group first (`toggle`: Shift / Ctrl adds it). */
  onSelectGroup: (id: string, toggle: boolean) => void;
  onContextMenu?: (x: number, y: number) => void;
}

/** A press on a widget (it isn't drawn here): true when it was in a group, which the press then selected and drags. */
export type PressGrouped = (e: ReactPointerEvent, partId: string) => boolean;

interface Drag {
  starts: Start[];
  handle?: Handle;
  /** The primary part's box when the gesture started (the dashed outline while free). */
  from: PixelBox;
  x: number;
  y: number;
  alt: boolean;
  moved: boolean;
}

export function ItemParts({ profile, page, zoom, selectedIds, onSelect, onOps, onDragBegin, onDragCommit, onDragCancel, onGesture, onContextMenu, badgeOf, groups, pressRef }: ItemPartsProps) {
  const model = useMemo(() => readPlacements(profile as unknown as MonitorProfile, page), [profile, page]);
  const inHidden = useMemo(() => hiddenByGroups(page), [page]);
  const byId = useMemo(() => new Map(page.placements.map((p) => [p.id, p])), [page]);
  /** The page's items and elements bottom first (drawn in z-order, so the top one takes the pointer). */
  const parts = useMemo(
    () => partsOf(model.root).filter((p) => p.kind !== "widget" && !p.hidden && !inHidden(byId.get(p.id)?.groupId)).reverse(),
    [model, inHidden, byId],
  );
  const [drag, setDrag] = useState<{ from: PixelBox; free: boolean; id: string } | null>(null);
  const stop = useRef<(() => void) | null>(null);
  useEffect(() => () => stop.current?.(), []);
  const { grid } = model;

  const start = (e: ReactPointerEvent, part: PartNode, handle?: Handle) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    const toggle = isToggleClick(e);
    const selected = selectedIds.includes(part.id);
    // A part in a group: the press takes its outermost group (double-click picks the part inside).
    const outer = selected ? null : outermostGroup(part.id);
    if (outer) return pressGroup(e, outer, toggle);
    if (toggle || !selected) onSelect(part.id, toggle);
    if (toggle) return;
    // A press on a selected part moves the whole selection; on another part, that part alone.
    const ids = handle ? [part.id] : selected ? selectedIds : [part.id];
    const starts = parts.filter((p) => ids.includes(p.id)).map(({ id, kind, place, locked }) => ({ id, kind, place, locked }));
    if (starts.every((s) => s.locked)) return;
    const d: Drag = { starts, handle, from: boxOf(grid, part.place), x: e.clientX, y: e.clientY, alt: e.altKey, moved: false };
    const free = () => placesFreely(model.snapItems, d.alt);
    const apply = (cx: number, cy: number) => {
      const dx = (cx - d.x) / zoom;
      const dy = (cy - d.y) / zoom;
      const ops = d.handle ? resizeOps(grid, d.starts[0], d.handle, dx, dy, free()) : moveOps(grid, d.starts, dx, dy, free());
      onOps(ops, `item-drag:${part.id}`);
    };
    let last = { x: e.clientX, y: e.clientY };
    // Alt pressed or released mid-drag switches at once, without waiting for the pointer to move.
    const onKey = (k: KeyboardEvent) => {
      if (k.key !== "Alt" || !d.moved) return;
      k.preventDefault();
      d.alt = k.type === "keydown";
      onGesture({ alt: d.alt, free: free() });
      setDrag((s) => s && { ...s, free: free() });
      apply(last.x, last.y);
    };
    stop.current = trackPointer(
      (ev) => {
        last = { x: ev.clientX, y: ev.clientY };
        if (!d.moved) {
          if (!pastDragThreshold(ev.clientX - d.x, ev.clientY - d.y)) return;
          d.moved = true;
          onDragBegin();
          window.addEventListener("keydown", onKey, true);
          window.addEventListener("keyup", onKey, true);
        }
        if (ev.altKey !== d.alt) d.alt = ev.altKey;
        onGesture({ alt: d.alt, free: free() });
        setDrag({ from: d.from, free: free(), id: part.id });
        apply(ev.clientX, ev.clientY);
      },
      (cancelled) => {
        window.removeEventListener("keydown", onKey, true);
        window.removeEventListener("keyup", onKey, true);
        setDrag(null);
        if (!d.moved) return;
        // The click that ends a drag lands on whatever is under the pointer by then (the page, another part): it
        // mustn't change the selection.
        const swallow = (c: MouseEvent) => c.stopPropagation();
        window.addEventListener("click", swallow, true);
        setTimeout(() => window.removeEventListener("click", swallow, true), 0);
        onGesture(null);
        if (cancelled) onDragCancel();
        else onDragCommit();
      },
    );
  };

  /** The outermost group a node sits in (none at the top level). */
  const outermostGroup = (id: string): string | null => {
    let at = findNode(model.root, id)?.parentId ?? null;
    let outer: string | null = null;
    for (let n = 0; at !== null && n < 64; n++) {
      outer = at;
      at = findNode(model.root, at)?.parentId ?? null;
    }
    return outer;
  };

  /** A press on a part inside a group (SPEC §10.3 note): its outermost group is selected, and the press drags it. */
  const pressGroup = (e: ReactPointerEvent, outer: string, toggle: boolean) => {
    if (!groups) return;
    groups.onSelectGroup(outer, toggle);
    const node = findNode(model.root, outer)?.node;
    if (!toggle && node?.type === "group") startGroup(e, node, [outer], true);
  };
  if (pressRef) {
    pressRef.current = (e, partId) => {
      const outer = groups && e.button === 0 ? outermostGroup(partId) : null;
      if (!outer) return false;
      e.preventDefault();
      e.stopPropagation();
      pressGroup(e, outer, isToggleClick(e));
      return true;
    };
  }

  /**
   * A drag on a selected group's box: the group moves as one, Alt as for an item; one undo step. `fromPart`: the press
   * was on a part and selected the group, so the click that ends it lands on the new box and mustn't deselect.
   */
  const startGroup = (e: ReactPointerEvent, group: GroupNode, ids: readonly string[] = groups?.selected ?? [], fromPart = false) => {
    if (e.button !== 0 || !groups) return;
    e.preventDefault();
    e.stopPropagation();
    if (lockedInTree(model, group.id)) return;
    const from = model;
    const d = { x: e.clientX, y: e.clientY, moved: false, ok: true, alt: e.altKey };
    stop.current = trackPointer(
      (ev) => {
        if (!d.moved) {
          if (!pastDragThreshold(ev.clientX - d.x, ev.clientY - d.y)) return;
          d.moved = true;
          onDragBegin();
        }
        d.alt = ev.altKey;
        onGesture({ alt: d.alt, free: placesFreely(from.snapItems, d.alt) });
        d.ok = groups.onMove(from, ids, (ev.clientX - d.x) / zoom, (ev.clientY - d.y) / zoom, placesFreely(from.snapItems, d.alt), `group-drag:${group.id}`);
      },
      (cancelled) => {
        if (!d.moved && !fromPart) return;
        const swallow = (c: MouseEvent) => c.stopPropagation();
        window.addEventListener("click", swallow, true);
        setTimeout(() => window.removeEventListener("click", swallow, true), 0);
        if (!d.moved) return;
        onGesture(null);
        if (cancelled) return onDragCancel();
        onDragCommit();
        if (!d.ok) groups.onRefused();
      },
    );
  };
  /** The part of a group under a double-click, topmost first. */
  const pickIn = (e: ReactMouseEvent, group: GroupNode) => {
    const r = (e.currentTarget.parentElement as HTMLElement).getBoundingClientRect();
    const x = (e.clientX - r.left) / zoom;
    const y = (e.clientY - r.top) / zoom;
    const hit = partsOf(group.children).find((p) => {
      const b = boxOf(grid, p.place);
      return !p.hidden && x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h;
    });
    if (hit) groups?.onPick(hit.id);
  };
  const groupBoxes = (groups?.selected ?? []).flatMap((id) => {
    const node = findNode(model.root, id)?.node;
    const box = node?.type === "group" && !node.hidden ? unionBox(model, node) : null;
    return node?.type === "group" && box ? [{ node, box }] : [];
  });

  // Hidden parts and groups aren't drawn (SPEC §7.1); selected from Layers, each shows a dashed outline at its box.
  const hiddenOutlines = [
    ...partsOf(model.root)
      .filter((p) => p.kind !== "widget" && selectedIds.includes(p.id) && (p.hidden || inHidden(byId.get(p.id)?.groupId)))
      .map((p) => ({ id: p.id, box: boxOf(grid, p.place) })),
    ...(groups?.selected ?? []).flatMap((id) => {
      const node = findNode(model.root, id)?.node;
      const box = node?.type === "group" && node.hidden ? unionBox(model, node) : null;
      return box ? [{ id, box }] : [];
    }),
  ];

  const primary = selectedIds.at(-1);
  // Drawn over the parts, so a press inside a selected group drags the group and a double-click reaches its box.
  const boxes = groupBoxes.map(({ node, box }) => (
        <div
          key={node.id}
          data-shot-skip
          data-group-box={node.id}
          className={cn("pointer-events-auto absolute", lockedInTree(model, node.id) ? "cursor-default" : "cursor-move")}
          style={{
            left: box.x - 3 / zoom,
            top: box.y - 3 / zoom,
            width: box.w + 6 / zoom,
            height: box.h + 6 / zoom,
            border: `${2 / zoom}px solid var(--ui-accent)`,
            borderRadius: 6 / zoom,
          }}
          onPointerDown={(e) => startGroup(e, node)}
          onDoubleClick={(e) => pickIn(e, node)}
          onContextMenu={(e) => {
            if (!groups?.onContextMenu) return;
            e.preventDefault();
            e.stopPropagation();
            groups.onContextMenu(e.clientX, e.clientY);
          }}
        >
          {/* The chip, 26 px above the box at its screen size whatever the zoom. */}
          <span className="absolute left-0 whitespace-nowrap" style={{ zoom: 1 / zoom, top: -26 }}>
            <span data-testid="group-chip" className="rounded-[4px] bg-ui-accent px-1.5 py-0.5 text-micro font-semibold text-ui-inverse-fg">
              {node.name} · group
            </span>
          </span>
        </div>
  ));
  return (
    <div data-item-parts="" className="pointer-events-none absolute inset-0 z-[5]">
      {drag?.free && (
        <div
          data-shot-skip
          className="absolute rounded-[2px] border border-dashed border-[#ffffff40]"
          style={{ left: drag.from.x, top: drag.from.y, width: drag.from.w, height: drag.from.h }}
        />
      )}
      {hiddenOutlines.map(({ id, box }) => (
        <div
          key={`hidden:${id}`}
          data-shot-skip
          data-hidden-outline={id}
          className="absolute"
          style={{ left: box.x, top: box.y, width: Math.max(1, box.w), height: Math.max(1, box.h), outline: `${1.5 / zoom}px dashed var(--ui-accent)`, outlineOffset: 1 / zoom }}
        />
      ))}
      {parts.map((part) => {
        const b = boxOf(grid, part.place);
        const placement = byId.get(part.id);
        const selected = selectedIds.includes(part.id);
        const free = "px" in part.place;
        const resizable = selected && part.id === primary && selectedIds.length === 1 && !part.locked;
        return (
          <div
            key={part.id}
            data-testid="canvas-part"
            data-kind={part.kind}
            data-part-id={part.id}
            data-free={free ? "" : undefined}
            data-selected={selected ? "" : undefined}
            className={cn("pointer-events-auto absolute", part.locked ? "cursor-default" : "cursor-move")}
            style={{ left: b.x, top: b.y, width: Math.max(1, b.w), height: Math.max(1, b.h), outline: selected ? `${2 / zoom}px solid var(--ui-accent)` : undefined, outlineOffset: 1 / zoom }}
            onPointerDown={(e) => start(e, part)}
            onContextMenu={(e) => {
              if (!onContextMenu) return;
              e.preventDefault();
              e.stopPropagation();
              if (!selected) onSelect(part.id, false);
              onContextMenu(part.id, e.clientX, e.clientY);
            }}
          >
            {placement && badgeOf && (
              <span data-shot-skip className="pointer-events-none absolute right-0 top-0 origin-top-right" style={{ scale: String(1 / zoom) }}>
                {badgeOf(placement)}
              </span>
            )}
            {resizable &&
              HANDLES.map((h) => (
                <span
                  key={h}
                  data-shot-skip
                  data-handle={h}
                  onPointerDown={(e) => start(e, part, h)}
                  className="absolute box-border bg-white"
                  style={{
                    width: HANDLE_PX / zoom,
                    height: HANDLE_PX / zoom,
                    border: `${1.5 / zoom}px solid var(--ui-accent)`,
                    cursor: `${h}-resize`,
                    left: h.includes("w") ? -HANDLE_PX / zoom / 2 : h.includes("e") ? `calc(100% - ${HANDLE_PX / zoom / 2}px)` : `calc(50% - ${HANDLE_PX / zoom / 2}px)`,
                    top: h.includes("n") ? -HANDLE_PX / zoom / 2 : h.includes("s") ? `calc(100% - ${HANDLE_PX / zoom / 2}px)` : `calc(50% - ${HANDLE_PX / zoom / 2}px)`,
                  }}
                />
              ))}
            {drag?.free && drag.id === part.id && (
              // The live readout, 6 px under the part, at its screen size whatever the zoom.
              <span data-shot-skip data-testid="alt-readout" className="absolute left-0 top-full whitespace-pre" style={{ zoom: 1 / zoom, marginTop: 6 }}>
                <span className="rounded-[4px] bg-ui-accent px-1.5 py-px font-ui-mono text-micro font-semibold text-ui-inverse-fg">
                  X {Math.round(b.x)}  Y {Math.round(b.y)}  W {Math.round(b.w)}  H {Math.round(b.h)} · free
                </span>
              </span>
            )}
          </div>
        );
      })}
      {boxes}
    </div>
  );
}
