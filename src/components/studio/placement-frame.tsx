import {
  useEffect,
  useRef,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import { EyeOff, Plus } from "lucide-react";
import { BLANK_MODULE, type ProfileView, type Placement } from "@/lib/layout";
import { profileGap, trackPitch } from "@/lib/profile-grid";
import { hexToHsl } from "@/lib/theme";
import { cn } from "@/lib/utils";
import { ZoneErrorBoundary } from "@/components/zone-error-boundary";
import { pastDragThreshold, trackPointer } from "./pointer-drag";
import { isToggleClick, type SelectMode } from "./selection";
import type { ZoneRect } from "./zone-geometry";

/**
 * Zone resize handles: invisible hit areas along each edge, the corners on
 * top of them. Only the bottom-right one draws the design's 11x11 knob.
 */
type Handle = "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w";
// Above the widget content (which can carry its own z-10).
const EDGE = "z-20";
const CORNER = "z-30 h-3.5 w-3.5";
const HANDLES: { id: Handle; cursor: string; pos: string }[] = [
  { id: "n", cursor: "ns-resize", pos: `${EDGE} -top-1 left-2 right-2 h-2` },
  { id: "e", cursor: "ew-resize", pos: `${EDGE} -right-1 top-2 bottom-2 w-2` },
  { id: "s", cursor: "ns-resize", pos: `${EDGE} -bottom-1 left-2 right-2 h-2` },
  { id: "w", cursor: "ew-resize", pos: `${EDGE} -left-1 top-2 bottom-2 w-2` },
  { id: "nw", cursor: "nwse-resize", pos: `${CORNER} -left-[7px] -top-[7px]` },
  { id: "ne", cursor: "nesw-resize", pos: `${CORNER} -right-[7px] -top-[7px]` },
  { id: "se", cursor: "nwse-resize", pos: `${CORNER} -right-[7px] -bottom-[7px]` },
  { id: "sw", cursor: "nesw-resize", pos: `${CORNER} -left-[7px] -bottom-[7px]` },
];

interface PlacementFrameProps {
  placement: Placement;
  profile: ProfileView;
  studio: boolean;
  /** Whether the module currently has live data (kiosk hides empties). */
  hasData: boolean;
  title: string;
  /**
   * The theme tokens re-scoped to the zone's resolved colors
   * (`PlacementRender.scope`): the zone frame's header and card read them.
   */
  scope?: CSSProperties;
  /** Grid element width in design px (zoom not applied) — cell pitch math. */
  gridWidth?: number;
  /** Canvas zoom (screen px per design px). */
  zoom?: number;
  /** Grid row height in design px (fill: 1fr over the height, scroll: fixed). */
  rowHeight?: number;
  /**
   * Live zone box while a move/resize is in flight — the studio clamps it
   * (bounds + no overlap) and applies it; release commits (null = plain click).
   * A move of a zone in a multi-zone selection moves the whole selection.
   */
  onZoneDrag?: (
    id: string,
    rect: ZoneRect,
    pointer: { x: number; y: number },
    kind: "move" | "resize"
  ) => void;
  onZoneDragEnd?: (id: string, rect: ZoneRect | null) => void;
  /** A move / resize really started (past the drag threshold): the studio opens its undo transaction. */
  onZoneDragStart?: (id: string) => void;
  /** Esc aborted the drag: the studio puts the zone back. */
  onZoneDragCancel?: (id: string) => void;
  /** Being moved or resized: lifted with a shadow. */
  ghost?: boolean;
  /** Right-click (viewport px): the studio opens the zone menu. */
  onContextMenu?: (x: number, y: number) => void;
  /** Open the widget picker (the blank zone's "Pick a widget"). */
  onPickWidget?: () => void;
  /** In the selection: highlighted (studio view). */
  selected?: boolean;
  /** The primary selected zone: widget picking. */
  primary?: boolean;
  /** The only selected zone: its edges resize it, the corner shows the knob. */
  canResize?: boolean;
  /**
   * A press selects the zone (`primary`: a selected zone keeps the rest
   * of the selection, for dragging it along), a click without a drag
   * selects it alone (`only`), Shift / Ctrl / ⌘ toggles it (`toggle`).
   */
  onSelect?: (mode: SelectMode) => void;
  /** A double-click: show all the zone's settings. */
  onOpenSettings?: () => void;
  /**
   * Panel zones: a click (no drag) inside the already primary zone picks
   * the widget under the pointer, or the panel itself (null) on empty
   * space. A double-click on an unselected zone is select-then-pick.
   */
  onSelectWidget?: (widgetId: string | null) => void;
  children: ReactNode;
}

const clampSpan = (span: number, cols: number) =>
  Math.max(1, Math.min(cols, span));

/**
 * The studio chrome around a zone: drag the body to move it, drag the
 * corner knob or edges to resize it (the studio clamps to the grid + no
 * overlap). The selected zone's actions live in its selection chip.
 * Renders plain content in kiosk mode.
 */
export function PlacementFrame({
  placement,
  profile,
  studio,
  hasData,
  title,
  scope,
  gridWidth = 0,
  zoom = 1,
  rowHeight,
  onZoneDrag,
  onZoneDragEnd,
  onZoneDragStart,
  onZoneDragCancel,
  ghost,
  onContextMenu,
  onPickWidget,
  selected,
  primary,
  canResize,
  onSelect,
  onOpenSettings,
  onSelectWidget,
  children,
}: PlacementFrameProps) {
  const span = clampSpan(placement.colSpan, profile.cols);
  const rowSpan = Math.max(1, placement.rowSpan);
  const design = placement.design;
  // A panel draws its own card (Style › Surface): a saved zone-frame card
  // from before would be a second one around it.
  const frameCard = placement.panel ? undefined : design?.background;
  const blank = placement.module === BLANK_MODULE;

  // Cell pitch in display px (the design-px pitch × zoom, gaps included:
  // the full width plus one gap divided over the column count; rows the
  // row height plus a gap).
  const gap = profileGap(profile);
  const pitchX = gridWidth > 0 ? trackPitch(gridWidth, profile.cols, gap) * zoom : 0;
  const pitchY = rowHeight !== undefined ? (rowHeight + gap) * zoom : 0;

  // A drag in flight is aborted if the frame unmounts (a mode switch mid-drag).
  const stopDrag = useRef<(() => void) | null>(null);
  useEffect(() => () => stopDrag.current?.(), []);

  const body = (
    <ZoneErrorBoundary title={title} resetKey={placement}>
      {children}
    </ZoneErrorBoundary>
  );

  // Hide empty modules (and blank zones) in kiosk mode (they claim no space).
  if (!studio && (!hasData || blank)) return null;

  /**
   * Move: press anywhere on the frame (except controls/handles) and drag.
   * The top-left cell follows the pointer delta; the studio clamps. A
   * press without a drag in the selected panel zone picks a widget.
   */
  function startMove(e: ReactPointerEvent) {
    if (e.button !== 0) return;
    const target = e.target as HTMLElement;
    if (target.closest("button, input, select, a, [data-no-drag]")) return;
    e.preventDefault();
    // Shift / Ctrl / ⌘: toggle the zone in the selection (no drag).
    if (isToggleClick(e)) {
      onSelect?.("toggle");
      return;
    }
    // Captured at the press: the first click of a double-click selects the
    // zone, the second (now primary) one picks the widget.
    const pick = primary ? onSelectWidget : undefined;
    const widgetId = target.closest<HTMLElement>("[data-widget-id]")?.dataset.widgetId ?? null;
    // preventDefault() suppresses the click event in Chromium, so the
    // frame's onClick never fires — select on the press itself.
    onSelect?.("primary");
    const startX = e.clientX;
    const startY = e.clientY;
    const startCol = placement.colStart;
    const startRow = placement.rowStart;
    let active = false;
    let last: ZoneRect | null = null;

    stopDrag.current = trackPointer(
      (ev) => {
        if (!active && pastDragThreshold(ev.clientX - startX, ev.clientY - startY)) {
          active = true;
          onZoneDragStart?.(placement.id);
        }
        if (!active || pitchX <= 0) return;
        const dc = Math.round((ev.clientX - startX) / pitchX);
        const dr = pitchY > 0 ? Math.round((ev.clientY - startY) / pitchY) : 0;
        last = { col: startCol + dc, row: startRow + dr, cols: span, rows: rowSpan };
        onZoneDrag?.(placement.id, last, { x: ev.clientX, y: ev.clientY }, "move");
      },
      (cancelled) => {
        if (cancelled) return active ? onZoneDragCancel?.(placement.id) : undefined;
        onZoneDragEnd?.(placement.id, last);
        if (active) return;
        // A click without a drag selects just this zone.
        onSelect?.("only");
        pick?.(widgetId);
      }
    );
  }

  /** Resize: drag a handle; the opposite edge stays put. */
  function startResize(e: ReactPointerEvent, h: Handle) {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const startY = e.clientY;
    let last: ZoneRect | null = null;
    onZoneDragStart?.(placement.id);

    stopDrag.current = trackPointer(
      (ev) => {
        const dc = pitchX > 0 ? Math.round((ev.clientX - startX) / pitchX) : 0;
        const dr = pitchY > 0 ? Math.round((ev.clientY - startY) / pitchY) : 0;
        let col = placement.colStart;
        let row = placement.rowStart;
        let cols = span;
        let rows = rowSpan;
        if (h === "w" || h === "nw" || h === "sw") {
          col = placement.colStart + dc;
          cols = span - dc;
        }
        if (h === "e" || h === "ne" || h === "se") cols = span + dc;
        if (h === "n" || h === "nw" || h === "ne") {
          row = placement.rowStart + dr;
          rows = rowSpan - dr;
        }
        if (h === "s" || h === "se" || h === "sw") rows = rowSpan + dr;
        // Keep the box at least one cell: shrink-past-zero pushes the start.
        if (cols < 1) {
          col += 1 - cols;
          cols = 1;
        }
        if (rows < 1) {
          row += 1 - rows;
          rows = 1;
        }
        last = { col, row, cols, rows };
        onZoneDrag?.(placement.id, last, { x: ev.clientX, y: ev.clientY }, "resize");
      },
      (cancelled) => (cancelled ? onZoneDragCancel?.(placement.id) : onZoneDragEnd?.(placement.id, last))
    );
  }

  return (
    <div
      className={cn(
        "group/zone group relative min-w-0 transition-opacity",
        studio && (ghost ? "cursor-grabbing" : "cursor-grab"),
        // Hidden zones stay editable but show faded (the kiosk drops them).
        studio && !placement.visible && "opacity-35"
      )}
      style={{
        gridColumn: `${placement.colStart} / span ${span}`,
        gridRow: `${placement.rowStart} / span ${rowSpan}`,
        ...scope,
        // Per-placement accent override: scopes the theme's --accent token to
        // this frame's subtree (rings, gauges, highlights recolor with it).
        ...(design?.accent
          ? ({ "--accent": hexToHsl(design.accent) } as CSSProperties)
          : {}),
      }}
      data-zone-id={studio ? placement.id : undefined}
      data-shot-skip={!placement.visible ? "" : undefined}
      // Clicks the press doesn't handle (a control in the zone, a handle).
      onClick={(e) => {
        if (!selected && !isToggleClick(e)) onSelect?.("only");
      }}
      onPointerDown={studio ? startMove : undefined}
      onDoubleClick={studio && onOpenSettings ? onOpenSettings : undefined}
      onContextMenu={
        studio
          ? (e) => {
              e.preventDefault();
              e.stopPropagation();
              onContextMenu?.(e.clientX, e.clientY);
            }
          : undefined
      }
    >
      {studio && (
        <>
          {/* Selection: a 2px accent outline 5px outside the zone (screen px at any zoom); lifted while dragged */}
          {(selected || ghost) && (
            <div
              aria-hidden
              data-shot-skip
              className={cn(
                "pointer-events-none absolute z-[15] rounded-[10px] border-solid transition-[box-shadow,border-color] duration-150",
                selected ? "border-ui-accent" : "border-transparent"
              )}
              style={{
                inset: -5 / zoom,
                borderWidth: 2 / zoom,
                boxShadow: ghost ? "0 14px 36px rgba(0,0,0,.55)" : undefined,
              }}
            />
          )}
          {/* Hover: a 1px outline (screen px) on a zone that is not selected */}
          {!selected && !ghost && (
            <div
              aria-hidden
              data-shot-skip
              className="pointer-events-none absolute inset-0 z-[15] hidden rounded-lg border-solid border-[#3a3a42] group-hover/zone:block"
              style={{ borderWidth: 1 / zoom }}
            />
          )}
          {/* Hidden: still editable, faded with a dashed border and a badge */}
          {!placement.visible && (
            <div
              aria-hidden
              data-hidden-zone
              className="pointer-events-none absolute inset-0 z-[14] rounded-lg border-dashed border-[#8a8a94]"
              style={{ borderWidth: 1.5 / zoom }}
            >
              <span
                className="absolute right-1.5 top-1.5 flex h-6 w-6 origin-top-right items-center justify-center rounded-md bg-[#17171b] text-[#c8c8d0]"
                style={{ scale: String(1 / zoom) }}
              >
                <EyeOff className="h-3.5 w-3.5" />
              </span>
            </div>
          )}

          {/* Resize (the studio clamps to the grid + no overlap): invisible edges, the knob at the corner */}
          {canResize &&
            HANDLES.map((h) => (
              <div
                key={h.id}
                data-no-drag
                data-resize-handle={h.id}
                onPointerDown={(e) => startResize(e, h.id)}
                className={cn("absolute", h.pos)}
                style={{ cursor: h.cursor }}
                title={h.id === "se" ? "Drag to resize (Shift + arrows)" : undefined}
              >
                {h.id === "se" && (
                  <span
                    className="pointer-events-none absolute left-1/2 top-1/2 h-[11px] w-[11px] -translate-x-1/2 -translate-y-1/2 rounded-[3px] border-2 border-ui-accent bg-[#ededf0]"
                    // Same size on screen at any canvas zoom.
                    style={{ scale: String(1 / zoom) }}
                  />
                )}
              </div>
            ))}
        </>
      )}

      {/* The zone box is the truth: the widget content fills it (fluid),
          never its natural size, so the widget area always matches the zone. */}
      <div className="h-full min-w-0 w-full overflow-hidden">
        <div className="flex h-full w-full flex-col">
          {studio && blank ? (
            <div data-shot-skip className="flex h-full min-h-16 flex-col items-center justify-center rounded-lg border border-dashed border-[#3a3a44] p-3">
              {onPickWidget && (
                <button
                  type="button"
                  onClick={onPickWidget}
                  className="flex items-center gap-1 rounded-md px-2 py-1 font-ui text-[11px] text-[#8a8a94] transition-colors hover:bg-ui-hover hover:text-ui-1"
                >
                  <Plus className="h-[15px] w-[15px]" /> Pick a widget
                </button>
              )}
            </div>
          ) : studio && !hasData ? (
            <div data-shot-skip className="flex h-full min-h-24 flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-border bg-card/40 p-4">
              <div className="text-sm font-medium text-muted-foreground">
                {title}
              </div>
              <div className="text-xs text-muted-foreground/60">
                no live data yet — appears when the plugin sends data
              </div>
            </div>
          ) : (
            <>
              {design?.header && (
                <div className="mb-1.5 shrink-0 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                  {title}
                </div>
              )}
              {frameCard === "panel" ? (
                <div className="min-h-0 flex-1 overflow-hidden rounded-lg bg-card/50 p-2">
                  {body}
                </div>
              ) : frameCard === "bordered" ? (
                <div className="min-h-0 flex-1 overflow-hidden rounded-lg border border-border bg-card/30 p-2">
                  {body}
                </div>
              ) : (
                <div className="min-h-0 flex-1">{body}</div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
