import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { Pin, TriangleAlert } from "lucide-react";
import { ContextMenu } from "@/components/ui/context-menu";
import { gridPinCell } from "@/components/pinned-grid";
import { PlacementFrame } from "@/components/studio/placement-frame";
import { LivePlacement } from "@/components/studio/placement-content";
import type { MonitorProfile, Placement, ProfileView } from "@/lib/layout";
import { pinConflicts, sharingPins } from "@/lib/pinned-edit";
import { cellAt } from "@/lib/profile-grid";
import { clampCells, type PinnedCells, type PinnedGridItem } from "@/lib/pinned";
import type { Appearance } from "@/lib/style-resolve";
import { cn } from "@/lib/utils";
import { pastDragThreshold, trackPointer } from "../pointer-drag";
import { fitZoneRect, type ZoneRect } from "../zone-geometry";
import { pinnedItemMenu } from "./pinned-menu";
import type { PinnedActions } from "./use-pinned-actions";

interface PinnedGridCanvasProps {
  /** The stored profile: the pages whose widgets the items may cover. */
  stored: MonitorProfile;
  profile: ProfileView;
  /** The page on the canvas. */
  pageId: string;
  /** The grid pins drawn on this page. */
  items: readonly PinnedGridItem[];
  appearance: Appearance;
  /** Pinned: the items move and resize on the grid; Page: locked, a click shows the pinned layer with the item selected. */
  editing: boolean;
  selectedId: string | null;
  onSelect: (id: string) => void;
  /** A move or resize let go: the item's new cells, one undo step. */
  onCells: (id: string, at: PinnedCells) => void;
  actions: Pick<PinnedActions, "remove" | "moveToPage">;
  /** The canvas zoom: the badge is drawn at 1/zoom, so it reads at any zoom. */
  zoom: number;
}

const toRect = (at: PinnedCells): ZoneRect => ({ col: at.colStart, row: at.rowStart, cols: at.colSpan, rows: at.rowSpan });
const toCells = (r: ZoneRect): PinnedCells => ({ colStart: r.col, rowStart: r.row, colSpan: r.cols, rowSpan: r.rows });

/**
 * The widgets pinned in place on Edit's canvas (config v21), on their cells over the page. With Page on they are locked
 * (a pin badge, a dashed edge) and a press shows the pinned layer with the item selected; with Pinned on a drag moves one
 * and its corner sizes it, kept off the other grid pins (a page widget under it is a conflict, listed in the inspector).
 */
export function PinnedGridCanvas({ stored, profile, pageId, items, appearance, editing, selectedId, onSelect, onCells, actions, zoom }: PinnedGridCanvasProps) {
  // the page widgets each item covers on this page (its conflicts, the badge's count)
  const covers = useMemo(() => new Map(items.map((it) => [it.id, pinConflicts(stored, it).filter((c) => c.pageId === pageId).length])), [stored, items, pageId]);
  const [menu, setMenu] = useState<{ x: number; y: number; item: PinnedGridItem } | null>(null);
  const [drag, setDrag] = useState<{ id: string; at: PinnedCells } | null>(null);
  const stop = useRef<(() => void) | null>(null);
  useEffect(() => () => stop.current?.(), []);

  const start = (e: ReactPointerEvent<HTMLElement>, it: PinnedGridItem, kind: "move" | "resize") => {
    if (!editing || it.locked || e.button !== 0) return;
    const grid = e.currentTarget.closest("[data-pinned-grid]")?.getBoundingClientRect();
    if (!grid) return;
    e.stopPropagation();
    const from = clampCells(it.at, profile.cols, profile.rows);
    const cell = (x: number, y: number) => cellAt(Math.max(0, Math.min(grid.width - 1, x - grid.left)), Math.max(0, Math.min(grid.height - 1, y - grid.top)), grid, profile.cols, profile.rows, 0);
    const first = cell(e.clientX, e.clientY);
    if (!first) return;
    // every grid pin that shares a page with this one, not only the ones drawn on this page
    const others: Placement[] = sharingPins(stored, it).map((o) => ({ id: o.id, module: o.placement.module, ...clampCells(o.at, profile.cols, profile.rows), visible: true }));
    const [x0, y0] = [e.clientX, e.clientY];
    let moved = false;
    let last = from;
    stop.current = trackPointer(
      (ev) => {
        if (!moved && !pastDragThreshold(ev.clientX - x0, ev.clientY - y0)) return;
        moved = true;
        const c = cell(ev.clientX, ev.clientY);
        if (!c) return;
        const want: ZoneRect =
          kind === "move"
            ? { ...toRect(from), col: from.colStart + c.col - first.col, row: from.rowStart + c.row - first.row }
            : { ...toRect(from), cols: Math.max(1, c.col - from.colStart + 1), rows: Math.max(1, c.row - from.rowStart + 1) };
        const fitted = fitZoneRect(want, others, profile.cols, profile.rows);
        if (!fitted) return;
        last = toCells(fitted);
        setDrag({ id: it.id, at: last });
      },
      (cancelled) => {
        stop.current = null;
        setDrag(null);
        if (!cancelled && moved && JSON.stringify(last) !== JSON.stringify(from)) onCells(it.id, last);
      }
    );
  };

  return (
    <>
      {items.map((it) => {
        const shown = drag?.id === it.id ? { ...it, at: drag.at } : it;
        const { box, zone } = gridPinCell(shown, profile);
        const selected = editing && it.id === selectedId;
        const covered = covers.get(it.id) ?? 0;
        return (
          <div key={it.id} className="pointer-events-auto relative" style={box} data-pinned-item={it.id} data-pinned-mode="grid">
            <LivePlacement placement={zone} appearance={appearance} studio>
              {({ content, hasData, title, scope }) => (
                <PlacementFrame placement={zone} profile={profile} studio={false} hasData={hasData} title={title} scope={scope}>
                  {content}
                </PlacementFrame>
              )}
            </LivePlacement>
            {/* over the widget: a press selects (and, in Pinned, moves) the item; the widget's own buttons never get it */}
            <button
              type="button"
              aria-label={`${it.name ?? "Pinned widget"}, pinned in place`}
              aria-pressed={editing ? selected : undefined}
              tabIndex={editing ? 0 : -1}
              onPointerDown={(e) => start(e, it, "move")}
              onClick={(e) => {
                e.stopPropagation();
                onSelect(it.id);
              }}
              onContextMenu={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onSelect(it.id);
                setMenu({ x: e.clientX, y: e.clientY, item: it });
              }}
              className={cn(
                "absolute inset-0 rounded-3 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ui-accent",
                selected
                  ? "outline outline-2 outline-ui-accent"
                  : editing
                    ? cn("hover:outline hover:outline-1 hover:outline-ui-accent", !it.locked && "cursor-grab")
                    : "cursor-pointer outline-dashed outline-1 outline-ui-strong"
              )}
            />
            {/* the pin badge: this widget is the pinned layer's, locked on the page; a warning when it covers page widgets */}
            <span
              aria-hidden
              data-shot-skip
              className={cn(
                "pointer-events-none absolute left-1 top-1 inline-flex h-5 items-center gap-1 rounded-ui-sm border px-1 font-ui text-micro",
                covered ? "border-ui-warn bg-ui-raised text-ui-warn" : "border-ui-edge bg-ui-raised text-ui-2"
              )}
              style={{ zoom: 1 / zoom }}
              title={covered ? `Covers ${covered === 1 ? "1 widget" : `${covered} widgets`} on this page` : undefined}
            >
              <Pin className="h-3 w-3" />
              {covered > 0 && (
                <>
                  <TriangleAlert className="h-3 w-3" />
                  {covered}
                </>
              )}
            </span>
            {selected && !it.locked && (
              <span
                aria-hidden
                data-shot-skip
                onPointerDown={(e) => start(e, it, "resize")}
                className="absolute bottom-0 right-0 h-3 w-3 cursor-se-resize rounded-2 border border-ui-accent bg-ui-raised"
              />
            )}
          </div>
        );
      })}
      {menu && <ContextMenu x={menu.x} y={menu.y} testId="pinned-item-menu" entries={pinnedItemMenu(menu.item, actions)} onClose={() => setMenu(null)} />}
    </>
  );
}
