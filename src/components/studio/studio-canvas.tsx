import { NO_PAN, type PanOffset } from "./use-hand-pan";
import {
  lazy,
  Suspense,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type DragEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  type RefCallback,
  type RefObject,
} from "react";
import { SquareDashedMousePointer } from "lucide-react";
import { PageBackground } from "@/components/page-background";
import { DynamicIsland } from "@/components/island/dynamic-island";
import { islandReserve } from "@/components/island/island-model";
import type { ActiveAlert } from "@/lib/alerts";
import type { PageBackground as Background } from "@/lib/appearance";
import type { Appearance } from "@/lib/style-resolve";
import { BLANK_MODULE, SCROLL_ROW_H, type MonitorProfile, type ProfilePage, type ProfileView, type Placement } from "@/lib/layout";
import { withItemLayers } from "@/lib/page-model/items-layer";
import type { PageOp } from "@/lib/page-model/model";
import { AltHint } from "./alt-hint";
import { PALETTE_DRAG_MIME as PALETTE_MIME } from "./add-tiles";
import { fontStack, resolveFont } from "@/lib/general";
import {
  cellAt as gridCellAt,
  profileGap,
  profilePadding,
  trackSize,
  zoneBox,
} from "@/lib/profile-grid";
import { useGeneral } from "@/hooks/use-general";
import { PageIslandProvider } from "@/hooks/use-page-island";
import { cn } from "@/lib/utils";
import { PlacementFrame } from "./placement-frame";
import { pastDragThreshold, trackPointer } from "./pointer-drag";
import { LivePlacement } from "./placement-content";
import { RulerLabels } from "./rulers";
import { ScreenFold } from "./screen-fold";
import { ItemParts, useAltHeld, type GroupMoves, type ItemGesture, type PressGrouped } from "./item-parts";
import { EmptyLayoutCard, QuickTipsCard } from "./canvas-cards";
import { canvasPointAt, canvasTakesDrop, dropGhost, dropSize, libraryItemOf, myLibraryDropOf, type CanvasDrop, type CanvasPoint, type LibraryItem } from "./drop-ghost";
import { addGhost, type Ghost } from "./add-place";
import { sizeText, type AddItem } from "./add-catalog";
import { activeLibraryDrag, LIBRARY_MIME } from "@/lib/my-library/drag";
import { DND_MIME, DND_MIME_PANEL, placementTitle } from "./studio-modules";
import type { SelectMode } from "./selection";
import { SelectionChipLayer } from "./selection-chip";
import { zoneMinSize } from "./studio-actions";
import type { CanvasInset } from "./studio-layout";
import { pageSize } from "./use-studio-layout";
import { zonesInRect } from "./zone-arrange";
import { enforceMinSize, fitZoneRect, moveZoneSet, type ZoneRect } from "./zone-geometry";

// The InfoPanel view's converter and renderer load only when the view is on.
const InfoPanelViewLayer = lazy(() => import("./infopanel-view-layer"));

/** The canvas' dot grid, at a fixed pitch on the scroll area (not scaled by the zoom). */
const DOTS = "radial-gradient(#1f1f25 1px, transparent 1px)";
const DOT_PITCH = "18px 18px";
/** The scroll area's padding around the page (see `CANVAS_PAD_X/Y`): room for the chip, ruler labels and zoom bar, plus `inset`. */
const scrollPad = (inset: CanvasInset) =>
  `${64 + (inset.top ?? 0)}px ${40 + (inset.right ?? 0)}px ${96 + (inset.bottom ?? 0)}px 40px`;
/** The optional grid: a line at the left / top edge of every cell, drawn over the tiles. */
const GRID_LINES =
  "linear-gradient(to right, rgba(255,255,255,0.07) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,0.07) 1px, transparent 1px)";
/** The drop ghost's colours: free (the accent) and "No room". */
const GHOST_OK = { line: "var(--ui-accent)", fill: "oklch(0.72 0.15 255 / 0.10)" };
const GHOST_DENIED = { line: "oklch(0.70 0.16 25)", fill: "oklch(0.70 0.16 25 / 0.08)" };

/** The drop ghost's text for an Add panel row (handoff SPEC §7.3). */
function ghostLabel(item: AddItem, ghost: Ghost): string {
  if (ghost.kind === "fill") return ghost.ok ? `Fill with ${item.name}` : `Needs ${sizeText(item.mw, item.mh)}`;
  return ghost.ok ? `${item.name} · ${sizeText(ghost.rect.cols, ghost.rect.rows)}` : "No room here";
}

const NO_ALERTS: readonly ActiveAlert[] = [];

interface StudioCanvasProps {
  profile: ProfileView;
  /** The shown page as stored: its InfoPanel items (v15 item placements) draw over the zones, not editable yet. */
  page?: ProfilePage;
  /** The profile's resolved page background, drawn behind its grid. */
  background?: Background;
  /** The global style the zones render under (see `resolveStyle`). */
  appearance?: Appearance;
  /**
   * The profile's own theme as CSS variables (`themeVars`), scoped to the
   * canvas; unset = the dashboard theme the studio chrome uses.
   */
  themeScope?: CSSProperties;
  /** The theme's corner radius (rem): the chrome keeps fixed radii, the page follows the theme. */
  radius: number;
  zoom: number;
  showGrid: boolean;
  /** Draw the rulers (default on). */
  showRulers?: boolean;
  /** The hand tool's offset: the page and its surround move by it. */
  pan?: PanOffset;
  /** The scroll container (shared with the zoom hook for wheel + fit). */
  scrollRef: RefObject<HTMLDivElement | null>;
  /** Callback ref that attaches the scroll container to the zoom hook. */
  attachScroll: RefCallback<HTMLDivElement>;
  /** The selected zones, the primary last. */
  selectedIds: string[];
  /** Select a zone (see `SelectMode`); null clears the selection. */
  onSelect: (id: string | null, mode?: SelectMode) => void;
  /** A double-click on a zone: show all its settings (the floating inspector opens). */
  onOpenSettings?: (id: string) => void;
  /** Room the page keeps clear of (the open floating inspector). */
  inset?: CanvasInset;
  /** The primary panel zone's selected widget (outlined on the canvas). */
  selectedWidgetId: string | null;
  /** Select a panel zone's widget (null = the panel itself). */
  onSelectWidget: (zoneId: string, widgetId: string | null) => void;
  /** A zone was drawn on empty grid space (box already clamped). */
  onDrawZone: (rect: ZoneRect) => void;
  /** A Shift+drag box on empty grid space selected these zones (the last one primary). */
  onSelectMany: (ids: string[]) => void;
  /** A zone is being moved/resized (box already clamped, fires per cell). */
  onZoneRect: (id: string, rect: ZoneRect) => void;
  /**
   * The selection is being moved by dragging its zone `id` (boxes already
   * checked: all in the grid, no overlap; fires per cell).
   */
  onZoneRects: (id: string, rects: Record<string, ZoneRect>) => void;
  /** A move / resize begins: all its changes are one undo step until commit. */
  onDragBegin: () => void;
  /** The drag was released. */
  onDragCommit: () => void;
  /** Esc aborted the drag: restore the start. */
  onDragCancel: () => void;
  /** Open the widget picker for a (blank) zone. */
  onPickWidget: (id: string) => void;
  /** The footprint a library item drops with on this grid (null = unknown item). */
  dropSizeOf: (item: CanvasDrop) => { cols: number; rows: number } | null;
  /**
   * A library item was dropped: at the ghost's box, or null when the ghost said no room; `cell`
   * is the cell under the pointer (a style card applies to the zone there).
   */
  /**
   * An InfoPanel item or element from Add (its `PALETTE_DRAG` id) dropped on the page (Edit v3 SPEC §7.4): where it
   * fell in page px, and whether Alt was held (it goes free).
   */
  onPartDrop?: (data: string, at: { x: number; y: number }, alt: boolean) => void;
  /** `inCanvas`: the drop point as a fraction of a canvas zone's profile, when it fell on one. */
  onDropItem: (item: CanvasDrop, rect: ZoneRect | null, cell: { col: number; row: number } | null, inCanvas: CanvasPoint | null) => void;
  /** The Add panel row a widget or panel drag carries: its ghost shrinks to fit and fills blank zones. */
  addItemOf?: (item: LibraryItem) => AddItem | undefined;
  /** An Add panel row dropped on a valid ghost (a drop on an invalid one does nothing). */
  onAddDrop?: (item: AddItem, ghost: Ghost) => void;
  /** The blank zone the Add panel fills (drawn with the accent dashed border and "Filling · W×H"). */
  targetZoneId?: string;
  /** A click on the target again: it stops being the target. */
  onClearTarget?: () => void;
  /** The zone just added: a 2 px accent ring that fades (`seq` replays it). */
  flash?: { zoneId: string; seq: number } | null;
  /** Top centre of the canvas (the Add panel's toast). */
  toast?: ReactNode;
  /** Right-click (viewport px) on a zone, or on empty canvas (null). */
  onContextMenu: (id: string | null, x: number, y: number) => void;
  /** Open the Add drawer (the empty canvas card). */
  onOpenAdd: () => void;
  /** Import an .infopanel file onto the page (the empty canvas card). */
  onImport: () => void;
  /** A widget dropped where it has no free cells: refused. */
  onNoRoom?: () => void;
  /** Load the sample layout (the empty canvas card). */
  onUseSample: () => void;
  /** The selected zone's chip, kept above its frame. */
  selectionChip?: ReactNode;
  /** Alerts the profile's island shows (test alerts: the canvas is not a kiosk). */
  islandAlerts?: readonly ActiveAlert[];
  /** A zone's Export check badge, on a screen made for InfoPanel (Edit v3 SPEC §7.1). */
  badgeOf?: (zone: Placement) => ReactNode;
  /** The InfoPanel view (decision Q10): the zones the export leaves out aren't drawn; they keep their cells. */
  leftOut?: ReadonlySet<string>;
  /** The InfoPanel view's drawing (sign-off round 2): the page as the export makes it, over the zones (lazy). */
  infoPanelView?: { screen: MonitorProfile; page: ProfilePage };
  /** The page's InfoPanel items and elements (item placements): their selection, and their edits as page model ops. */
  items?: {
    selectedIds: readonly string[];
    onSelect: (id: string, toggle: boolean) => void;
    onOps: (ops: PageOp[], key: string) => void;
    onContextMenu?: (id: string, x: number, y: number) => void;
    badgeOf?: (p: Placement) => ReactNode;
    /** The selected page groups: their boxes, and their moves. */
    groups?: GroupMoves;
  };
}

/**
 * The design canvas: the zoomable board (with ruler labels) where zones are drawn,
 * moved and resized (biome-style, no overlap), drop target for the
 * library (with a drop ghost), and the move/resize ghosts.
 */
export function StudioCanvas({
  profile,
  page,
  background,
  appearance,
  themeScope,
  radius,
  zoom,
  showGrid,
  showRulers = true,
  pan = NO_PAN,
  scrollRef,
  attachScroll,
  selectedIds,
  onSelect,
  onOpenSettings,
  inset = {},
  selectedWidgetId,
  onSelectWidget,
  onDrawZone,
  onSelectMany,
  onZoneRect,
  onZoneRects,
  onDragBegin,
  onDragCommit,
  onDragCancel,
  onPickWidget,
  dropSizeOf,
  onDropItem,
  onPartDrop,
  addItemOf,
  onAddDrop,
  targetZoneId,
  onClearTarget,
  flash,
  toast,
  onContextMenu,
  onOpenAdd,
  onImport,
  onNoRoom,
  onUseSample,
  selectionChip,
  islandAlerts = NO_ALERTS,
  badgeOf,
  leftOut,
  infoPanelView,
  items,
}: StudioCanvasProps) {
  /** An item gesture in flight (Alt, free): the hint and the faded cell lines. */
  const [gesture, setGesture] = useState<ItemGesture | null>(null);
  /** A press on a widget in a page group: the item layer selects the group and drags it. */
  const pressGrouped = useRef<PressGrouped | null>(null);
  const [zoneDrag, setZoneDrag] = useState<{
    id: string;
    /** The zones moving with it (just `id` unless a selection moves). */
    ids: string[];
    rect: ZoneRect;
    x: number;
    y: number;
  } | null>(null);
  /** The zones' boxes when the drag in flight started. */
  const dragOrigin = useRef<Placement[] | null>(null);
  /** Alt held while a widget is dragged: the hint says widgets stay on their cells. */
  const widgetAlt = useAltHeld(zoneDrag !== null);
  const [drawing, setDrawing] = useState<ZoneRect | null>(null);
  /** Aborts a draw in flight (Esc / unmount are handled by `trackPointer`). */
  const stopDraw = useRef<(() => void) | null>(null);
  useEffect(() => () => stopDraw.current?.(), []);
  // A completed draw is followed by a click on the grid; it must not
  // deselect the zone just drawn (and selected).
  const drewRef = useRef(false);
  const [gridEl, setGridEl] = useState<HTMLDivElement | null>(null);
  const [gridWidth, setGridWidth] = useState(0);
  const [pageEl, setPageEl] = useState<HTMLDivElement | null>(null);
  // The page's size in design px, for the ruler labels.
  const [canvas, setCanvas] = useState({ w: 0, h: 0 });
  /** The library item being dragged (read at its dragstart; dragover can't read data). */
  const dragItem = useRef<CanvasDrop | null>(null);
  const [dropPreview, setDropPreview] = useState<{ rect: ZoneRect; ok: boolean; label?: string } | null>(null);

  // Measure the grid for resize calculations and alignment guides, in
  // design px: the on-screen width over the zoom (clientWidth inside a CSS
  // zoom is reported in different units by different Chromium versions).
  useLayoutEffect(() => {
    if (gridEl && zoom > 0) setGridWidth(gridEl.getBoundingClientRect().width / zoom);
  }, [gridEl, zoom, profile.id, profile.cols, profile.width, profile.padding, profile.fit]);
  useEffect(() => {
    const onResize = () => {
      if (gridEl && zoom > 0) setGridWidth(gridEl.getBoundingClientRect().width / zoom);
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [gridEl, zoom]);

  // The page's measurements for the rulers.
  useLayoutEffect(() => {
    if (!pageEl) return;
    const measure = () => {
      const p = pageEl.getBoundingClientRect();
      const [w, h] = [p.width / zoom, p.height / zoom];
      setCanvas((c) => (c.w === w && c.h === h ? c : { w, h }));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(pageEl);
    return () => observer.disconnect();
  }, [pageEl, zoom, profile.id, profile.cols, profile.width, profile.height, profile.padding]);

  // The library's drag data is only readable at its dragstart: remember the
  // item so the drop ghost can size itself while the pointer moves.
  useEffect(() => {
    const onStart = (e: globalThis.DragEvent) => {
      const data = e.dataTransfer;
      dragItem.current = data ? (libraryItemOf((type) => data.getData(type)) ?? myLibraryDropOf((type) => data.getData(type))) : null;
    };
    const onEnd = () => {
      dragItem.current = null;
      setDropPreview(null);
    };
    document.addEventListener("dragstart", onStart);
    document.addEventListener("dragend", onEnd);
    return () => {
      document.removeEventListener("dragstart", onStart);
      document.removeEventListener("dragend", onEnd);
    };
  }, []);

  /**
   * Commit a zone move/resize: apply the clamped box (a resize keeps the
   * widget's minimum size). When it can't be placed without overlapping,
   * the zone keeps its current box. Dragging a zone of a multi-zone
   * selection moves them all from where they started, or (when any would
   * leave the grid or overlap another zone) leaves them where they are.
   */
  const onZoneDrag = (
    id: string,
    rect: ZoneRect,
    pointer: { x: number; y: number },
    kind: "move" | "resize"
  ) => {
    const origin = (dragOrigin.current ??= profile.placements);
    const zone = origin.find((p) => p.id === id);
    if (!zone) return;
    const current = { col: zone.colStart, row: zone.rowStart, cols: zone.colSpan, rows: zone.rowSpan };
    if (kind === "move" && selectedIds.length > 1 && selectedIds.includes(id)) {
      const delta = { cols: rect.col - zone.colStart, rows: rect.row - zone.rowStart };
      const rects = moveZoneSet(origin, selectedIds, delta, profile.cols, profile.rows);
      if (rects) onZoneRects(id, rects);
      setZoneDrag((d) => ({
        id,
        ids: selectedIds,
        rect: rects?.[id] ?? d?.rect ?? current,
        x: pointer.x,
        y: pointer.y,
      }));
      return;
    }
    const box = kind === "resize" ? enforceMinSize(rect, zone, zoneMinSize(zone)) : rect;
    const clamped = fitZoneRect(box, origin, profile.cols, profile.rows, id) ?? current;
    onZoneRect(id, clamped);
    setZoneDrag({ id, ids: [id], rect: clamped, x: pointer.x, y: pointer.y });
  };

  const onZoneDragEnd = () => {
    dragOrigin.current = null;
    setZoneDrag(null);
    onDragCommit();
  };

  const onZoneDragCancel = () => {
    dragOrigin.current = null;
    setZoneDrag(null);
    onDragCancel();
  };

  /**
   * Draw a new zone: press on an empty grid cell and drag out a box; on
   * release a blank zone is created (the user then assigns a widget). A
   * press that never leaves the drag threshold is a plain click: it deselects.
   * With Shift held the box selects the zones it touches instead (a plain
   * Shift+click keeps the selection).
   */
  const startDraw = (e: ReactPointerEvent) => {
    if (e.button !== 0) return;
    if (e.target !== e.currentTarget) return; // only empty grid space starts a draw
    const start = cellAt(e.clientX, e.clientY);
    if (!start) return;
    e.preventDefault();
    const [startX, startY] = [e.clientX, e.clientY];
    const marquee = e.shiftKey;
    let rect: ZoneRect = { col: start.col, row: start.row, cols: 1, rows: 1 };
    let dragging = false;
    stopDraw.current = trackPointer(
      (ev) => {
        if (!dragging) {
          if (!pastDragThreshold(ev.clientX - startX, ev.clientY - startY)) return;
          dragging = true;
          setDrawing(rect);
        }
        const c = cellAt(ev.clientX, ev.clientY);
        if (!c) return;
        rect = {
          col: Math.min(start.col, c.col),
          row: Math.min(start.row, c.row),
          cols: Math.abs(c.col - start.col) + 1,
          rows: Math.abs(c.row - start.row) + 1,
        };
        setDrawing(rect);
      },
      (cancelled) => {
        setDrawing(null);
        if (cancelled) return;
        if (!dragging) return marquee ? undefined : onSelect(null);
        drewRef.current = true;
        setTimeout(() => (drewRef.current = false), 0);
        if (marquee) return onSelectMany(zonesInRect(profile.placements, rect));
        // No room for the drawn box (the grid is full there): nothing is added.
        const fitted = fitZoneRect(rect, profile.placements, profile.cols, profile.rows);
        if (fitted) onDrawZone(fitted);
      }
    );
  };

  const isLibraryDrag = (e: DragEvent) =>
    e.dataTransfer.types.includes(DND_MIME) || e.dataTransfer.types.includes(DND_MIME_PANEL) || e.dataTransfer.types.includes(LIBRARY_MIME);

  const isPaletteDrag = (e: DragEvent) => onPartDrop !== undefined && e.dataTransfer.types.includes(PALETTE_MIME);
  /** A screen point in the page's design px (the page is drawn zoomed). */
  const pagePointAt = (x: number, y: number): { x: number; y: number } | null => {
    const r = pageEl?.getBoundingClientRect();
    if (!r || r.width <= 0 || profile.width <= 0) return null;
    const k = r.width / profile.width;
    return { x: (x - r.left) / k, y: (y - r.top) / k };
  };

  /** Library drag over the board: the ghost follows the pointer's cell. */
  const onCanvasDragOver = (e: DragEvent) => {
    if (isPaletteDrag(e)) {
      // An item or element may sit on anything: it snaps to the cell under it, or goes free with Alt (no ghost).
      e.preventDefault();
      const cell = e.altKey ? null : cellAt(e.clientX, e.clientY);
      const next = cell ? { rect: { col: cell.col, row: cell.row, cols: 1, rows: 1 }, ok: true } : null;
      setDropPreview((prev) => (prev?.ok === next?.ok && prev?.rect.col === next?.rect.col && prev?.rect.row === next?.rect.row ? prev : next));
      return;
    }
    if (!isLibraryDrag(e)) return;
    e.preventDefault();
    const cell = cellAt(e.clientX, e.clientY);
    // A card dragged in from the Library page started before this canvas was there.
    const active = activeLibraryDrag();
    const dragged = dragItem.current ?? (active && e.dataTransfer.types.includes(LIBRARY_MIME) ? { kind: "mylib" as const, id: active.id, item: active } : null);
    const added = dragged && dragged.kind !== "mylib" ? addItemOf?.(dragged) : undefined;
    const size = (dragged && dropSizeOf(dragged)) ?? dropSize({ cols: 1, rows: 1 }, profile);
    // Over a canvas zone that takes the drop as an item, the grid ghost would only say "No room".
    const next: { rect: ZoneRect; ok: boolean; label?: string } | null = !cell
      ? null
      : added
        ? addPreview(added, cell)
        : !canvasTakesDrop(dragged, canvasPointAt(e.clientX, e.clientY))
          ? dropGhost(cell, size, profile, profile.placements)
          : null;
    // Re-rendered only when its cell, size, validity or label changes.
    setDropPreview((prev) =>
      prev?.ok === next?.ok &&
      prev?.label === next?.label &&
      prev?.rect.col === next?.rect.col &&
      prev?.rect.row === next?.rect.row &&
      prev?.rect.cols === next?.rect.cols &&
      prev?.rect.rows === next?.rect.rows
        ? prev
        : next
    );
  };

  /** An Add panel row's ghost at a cell, with its label; Blank zone over a blank zone has nothing to do. */
  const addPreview = (item: AddItem, cell: { col: number; row: number }) => {
    const ghost = addGhost(cell, profile, profile.placements, { cols: item.w, rows: item.h }, { cols: item.mw, rows: item.mh });
    const blankOnBlank = ghost.kind === "fill" && item.id === BLANK_MODULE;
    return { rect: ghost.rect, ok: ghost.ok && !blankOnBlank, label: blankOnBlank ? "Already blank" : ghostLabel(item, ghost), ghost };
  };

  /** Drop: the zone is created at the ghost's spot, or "No room there". */
  const onCanvasDrop = (e: DragEvent) => {
    e.preventDefault();
    dragItem.current = null;
    setDropPreview(null);
    const read = (type: string) => e.dataTransfer.getData(type);
    const palette = onPartDrop ? read(PALETTE_MIME) : "";
    if (palette) {
      const at = pagePointAt(e.clientX, e.clientY);
      if (at) onPartDrop?.(palette, at, e.altKey);
      return;
    }
    const item = libraryItemOf(read) ?? myLibraryDropOf(read);
    if (!item) return;
    // Sized from the dropped item itself: a drag from another window had no ghost size.
    const cell = cellAt(e.clientX, e.clientY);
    const added = item.kind !== "mylib" ? addItemOf?.(item) : undefined;
    if (added) {
      // A drop on an invalid ghost cancels; with no free cells under it, the toast says so (Edit v3 SPEC §15).
      const preview = cell && addPreview(added, cell);
      if (preview?.ok) onAddDrop?.(added, preview.ghost);
      else if (preview && !preview.ghost.ok) onNoRoom?.();
      return;
    }
    const size = dropSizeOf(item) ?? (item.kind === "mylib" ? dropSize({ cols: 1, rows: 1 }, profile) : null);
    const ghost = cell && size ? dropGhost(cell, size, profile, profile.placements) : null;
    onDropItem(item, ghost?.ok ? ghost.rect : null, cell, canvasPointAt(e.clientX, e.clientY));
  };

  // The profile's spacing (as the kiosk page shows it): the gap between
  // zones and the padding around the grid, inside the profile's size.
  const gap = profileGap(profile);
  const padding = profilePadding(profile, true);
  const islandPage = { width: profile.width, height: profile.height };
  const itemLayers = useMemo(() => withItemLayers(profile, page, []), [profile, page]);
  const pageIsland = useMemo(() => ({ island: profile.island?.enabled ? profile.island : undefined, page: { width: profile.width, height: profile.height } }), [profile.island, profile.width, profile.height]);
  /** "Reserve space": the zones start under the island, as on the kiosk. */
  const reserve = islandReserve(profile.island, islandPage);
  const fill = profile.fit === "fill" && profile.height > 0;
  /** Gap in display px. */
  const g = gap * zoom;

  // Design px: the ghosts sit inside the zoomed page (CSS zoom scales them).
  const colW = gridWidth > 0 ? trackSize(gridWidth, profile.cols, gap) : 0;

  // Row geometry: fill mode → uniform rows over the profile height;
  // scroll mode → fixed SCROLL_ROW_H rows (the canvas scrolls).
  const rowH = fill
    ? Math.max(24, trackSize(profile.height - 2 * padding - reserve, profile.rows, gap))
    : SCROLL_ROW_H;
  const getGridRect = () => gridEl?.getBoundingClientRect() ?? null;

  /** The 1-based grid cell under a screen point (null outside the grid). */
  const cellAt = (x: number, y: number): { col: number; row: number } | null => {
    const rect = getGridRect();
    if (!rect) return null;
    return gridCellAt(x - rect.left, y - rect.top, rect, profile.cols, profile.rows, g);
  };

  /** Grid-local display-px box for a ZoneRect (drawing / drag ghost). */
  const zoneBoxStyle = (r: ZoneRect) => {
    if (colW <= 0) return null;
    // The ghost sits inside the zoomed page, so its box is in design px
    // (CSS zoom scales it); display px here would apply the zoom twice.
    const rowHd = fill
      ? trackSize(profile.height - 2 * padding - reserve, profile.rows, gap)
      : SCROLL_ROW_H;
    return zoneBox(r, { width: colW, height: rowHd }, gap);
  };

  const font = fontStack(resolveFont(useGeneral(), profile));

  const dragged = zoneDrag
    ? profile.placements.find((x) => x.id === zoneDrag.id)
    : undefined;
  const primaryId = selectedIds.at(-1) ?? null;
  const selected = profile.placements.find((x) => x.id === primaryId);

  return (
    <PageIslandProvider value={pageIsland}>
    <div className="relative flex min-h-0 flex-1 flex-col bg-ui-app">
      <div
        className="relative min-h-0 flex-1"
        // On the wrapper, not the scroller: the cards over the canvas are drop targets too.
        onDragOver={onCanvasDragOver}
        onDragLeave={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDropPreview(null);
        }}
        onDrop={onCanvasDrop}
      >
        <div
          ref={attachScroll}
          className="h-full w-full overflow-auto"
          style={{ backgroundImage: DOTS, backgroundSize: DOT_PITCH }}
          onContextMenu={(e) => {
            e.preventDefault();
            onContextMenu(null, e.clientX, e.clientY);
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget) onSelect(null);
          }}
        >
          {/* A click on the empty canvas around the page deselects. */}
          <div
            onClick={(e) => {
              if (e.target === e.currentTarget) onSelect(null);
            }}
            className="flex min-h-full w-fit min-w-full"
            style={{ padding: scrollPad(inset), ...(pan.x || pan.y ? { transform: `translate(${pan.x}px, ${pan.y}px)` } : {}) }}
          >
            {/* The page: exactly the profile's design size (the kiosk
                window renders the same profile 1:1), its padding around
                the grid, and its own theme / font / radius scoped here. */}
            <div
              ref={setPageEl}
              data-studio-page=""
              // A move / resize / draw in flight: the page is not captured meanwhile (profile screenshots).
              data-dragging={zoneDrag || drawing ? "" : undefined}
              data-theme-scope={themeScope ? "" : undefined}
              className={cn(
                "relative isolate",
                // Centered while smaller than the view (both axes).
                profile.width > 0 ? "m-auto shrink-0" : "flex-1",
                themeScope && !background && "bg-background",
                themeScope && "text-foreground"
              )}
              style={
                {
                  zoom,
                  "--radius": `${radius}rem`,
                  "--radius-lg": "var(--radius)",
                  "--radius-md": "calc(var(--radius) - 2px)",
                  "--radius-sm": "calc(var(--radius) - 4px)",
                  ...themeScope,
                  padding,
                  // Always set: React warns when a longhand is removed from under the shorthand.
                  paddingTop: padding + reserve,
                  fontFamily: font,
                  // The board's dashed outline, 6px off the page.
                  outline: "1px dashed #2a2a31",
                  outlineOffset: 6,
                  ...(profile.width > 0 ? { width: profile.width } : {}),
                  ...(fill ? { height: profile.height } : {}),
                } as CSSProperties
              }
              onClick={(e) => {
                if (e.target === e.currentTarget) onSelect(null);
              }}
            >
              {showRulers && <RulerLabels width={canvas.w} height={canvas.h} />}
              {profile.island?.enabled && (
                <DynamicIsland config={profile.island} alerts={islandAlerts} placement="absolute" page={islandPage} />
              )}
                {/* Page background (as in the kiosk) behind the tiles */}
                {background && <PageBackground background={background} className="absolute inset-0 -z-20" />}
                {/* A scroll page longer than its screen: the design size stays the frame. */}
                {!fill && profile.height > 0 && (pageSize(profile).naturalHeight ?? 0) > profile.height && (
                  <ScreenFold height={profile.height} zoom={zoom} />
                )}
                <div
                  ref={setGridEl}
                  className={cn("relative isolate grid", fill && "h-full")}
                  style={{
                    gap,
                    gridTemplateColumns: `repeat(${profile.cols}, minmax(0, 1fr))`,
                    // Explicit uniform rows: fill mode stretches over the
                    // profile height, scroll mode uses fixed cell heights.
                    gridTemplateRows: fill
                      ? `repeat(${profile.rows}, minmax(0, 1fr))`
                      : `repeat(${profile.rows}, ${SCROLL_ROW_H}px)`,
                  }}
                  onPointerDown={startDraw}
                  onClick={(e) => {
                    if (e.target === e.currentTarget && !drewRef.current && !e.shiftKey) onSelect(null);
                  }}
                >
                  {/* Optional grid, over the tiles (below the selection) */}
                  {showGrid && (
                    <div
                      aria-hidden
                      data-cell-lines=""
                      data-shot-skip
                      className="pointer-events-none absolute inset-0 z-[12]"
                      style={{
                        // Faded while a part is placed freely (SPEC §7.1).
                        ...(gesture?.free && gesture.alt ? { opacity: 0.35 } : {}),
                        backgroundImage: GRID_LINES,
                        backgroundSize: `calc((100% + ${gap}px) / ${profile.cols}) calc((100% + ${gap}px) / ${profile.rows})`,
                      }}
                    />
                  )}

                  {/* Drawing / move-resize ghost */}
                  {(drawing || zoneDrag) &&
                    (() => {
                      const r = drawing ?? zoneDrag!.rect;
                      const style = zoneBoxStyle(r);
                      if (!style) return null;
                      return (
                        <div
                          data-shot-skip
                          className="pointer-events-none absolute z-30 rounded-[8px] border-2 border-dashed border-ui-accent bg-ui-accent/10"
                          style={style}
                        >
                          <span className="absolute left-1.5 top-0.5 font-ui-mono text-[10px] font-semibold tabular-nums text-ui-accent-text">
                            C{r.col} · R{r.row} · {r.cols}×{r.rows}
                          </span>
                        </div>
                      );
                    })()}

                  {/* Library drop ghost: where the dragged item would land */}
                  {dropPreview &&
                    (() => {
                      const style = zoneBoxStyle(dropPreview.rect);
                      if (!style) return null;
                      const tone = dropPreview.ok ? GHOST_OK : GHOST_DENIED;
                      return (
                        <div
                          data-shot-skip
                          className="pointer-events-none absolute z-30 flex items-center justify-center rounded-[8px] border-[1.5px] border-dashed font-ui text-[11px] font-medium"
                          style={{ ...style, borderColor: tone.line, background: tone.fill, color: tone.line }}
                        >
                          {dropPreview.label ?? (dropPreview.ok ? "Drop here" : "No room")}
                        </div>
                      );
                    })()}

                  {/* The blank zone the Add panel fills, and the zone just added (its ring fades) */}
                  {[
                    { id: targetZoneId, target: true },
                    { id: flash?.zoneId, target: false },
                  ].map(({ id, target }) => {
                    const p = id ? profile.placements.find((x) => x.id === id) : undefined;
                    const style = p && zoneBoxStyle({ col: p.colStart, row: p.rowStart, cols: p.colSpan, rows: p.rowSpan });
                    if (!p || !style) return null;
                    return target ? (
                      <div
                        key="target"
                        data-shot-skip
                        className="pointer-events-none absolute z-30 rounded-[8px] border-[1.5px] border-dashed border-ui-accent bg-ui-accent/10"
                        style={style}
                      >
                        <span className="absolute left-2 top-1.5 flex items-center gap-1 font-ui text-[11px] font-medium text-ui-accent-text">
                          <SquareDashedMousePointer className="h-3.5 w-3.5" strokeWidth={1.75} />
                          Filling · <span className="font-ui-mono">{sizeText(p.colSpan, p.rowSpan)}</span>
                        </span>
                      </div>
                    ) : (
                      <div key={`flash:${flash?.seq}`} data-shot-skip className="add-flash pointer-events-none absolute z-30 rounded-[8px]" style={style} />
                    );
                  })}

                  {profile.placements.filter((p) => !leftOut?.has(p.id)).map((p) => (
                    <LivePlacement
                      key={p.id}
                      placement={p}
                      appearance={appearance}
                      studio
                      selection={primaryId === p.id && p.panel ? { selectedWidgetId } : undefined}
                    >
                      {({ content, hasData, title, scope }) => (
                        <PlacementFrame
                          placement={p}
                          profile={profile}
                          studio
                          hasData={hasData}
                          title={title}
                          scope={scope}
                          gridWidth={gridWidth}
                          zoom={zoom}
                          rowHeight={rowH}
                          ghost={zoneDrag?.ids.includes(p.id)}
                          onZoneDrag={onZoneDrag}
                          onZoneDragStart={onDragBegin}
                          onZoneDragEnd={onZoneDragEnd}
                          onZoneDragCancel={onZoneDragCancel}
                          selected={selectedIds.includes(p.id)}
                          primary={primaryId === p.id}
                          canResize={primaryId === p.id && selectedIds.length === 1}
                          onSelect={(mode) => onSelect(p.id, mode)}
                          onSelectAgain={p.id === targetZoneId ? onClearTarget : undefined}
                          onOpenSettings={onOpenSettings && (() => onOpenSettings(p.id))}
                          onSelectWidget={p.panel ? (widgetId) => onSelectWidget(p.id, widgetId) : undefined}
                          onPressGrouped={p.groupId && !selectedIds.includes(p.id) ? (e) => pressGrouped.current?.(e, p.id) ?? false : undefined}
                          onPickWidget={() => onPickWidget(p.id)}
                          onContextMenu={(x, y) => onContextMenu(p.id, x, y)}
                          badge={badgeOf?.(p)}
                        >
                          {content}
                        </PlacementFrame>
                      )}
                    </LivePlacement>
                  ))}

                  {itemLayers.map((p) => (
                    <LivePlacement key={p.id} placement={p} appearance={appearance} studio>
                      {({ content }) => (
                        <div data-items-layer="" className="pointer-events-none relative z-[11]" style={{ gridColumn: "1 / -1", gridRow: "1 / -1" }}>
                          {content}
                        </div>
                      )}
                    </LivePlacement>
                  ))}

                  {infoPanelView && pageEl && gridEl && (
                    <Suspense fallback={null}>
                      <InfoPanelViewLayer
                        page={pageEl}
                        grid={gridEl}
                        zoom={zoom}
                        screen={infoPanelView.screen}
                        storedPage={infoPanelView.page}
                        placements={profile.placements.filter((p) => !leftOut?.has(p.id))}
                      />
                    </Suspense>
                  )}
                </div>
                {page && items && (
                  <ItemParts
                    profile={profile}
                    page={page}
                    zoom={zoom}
                    selectedIds={items.selectedIds}
                    onSelect={items.onSelect}
                    onOps={items.onOps}
                    onDragBegin={onDragBegin}
                    onDragCommit={onDragCommit}
                    onDragCancel={onDragCancel}
                    onGesture={setGesture}
                    onContextMenu={items.onContextMenu}
                    badgeOf={items.badgeOf}
                    groups={items.groups}
                    pressRef={pressGrouped}
                  />
                )}
              </div>
            </div>
          </div>

          {selected && selectionChip && !zoneDrag && !drawing && (
            <SelectionChipLayer
              scrollRef={scrollRef}
              zoneId={selected.id}
              layoutKey={[
                zoom,
                pan.x,
                pan.y,
                selected.colStart,
                selected.rowStart,
                selected.colSpan,
                selected.rowSpan,
                profile.cols,
                profile.rows,
                profile.fit,
                profile.width,
                profile.height,
                gap,
                padding,
                reserve,
                gridWidth,
              ].join("|")}
            >
              {selectionChip}
            </SelectionChipLayer>
          )}

          {profile.placements.length === 0 && !page?.placements.length && !drawing && (
            <EmptyLayoutCard onBrowse={onOpenAdd} onImport={onImport} onUseSample={onUseSample} />
          )}

          <QuickTipsCard />
        </div>

      {/* Alt while dragging (SPEC §7.3): an item goes free, a widget stays on its cells. */}
      {((gesture?.alt && gesture.free) || (zoneDrag && widgetAlt)) && (
        <AltHint widget={zoneDrag !== null} className="absolute left-1/2 top-3 z-40 -translate-x-1/2" />
      )}

      {/* Top centre of the canvas (Edit v3 SPEC §9.6). */}
      {toast && <div className="pointer-events-none absolute inset-x-0 top-3.5 z-40 flex justify-center">{toast}</div>}

      {/* Zone-drag ghost: follows the pointer (outside the zoomed canvas)
          so the zone being moved/resized is always visibly tracked. */}
      {zoneDrag && dragged && (
        <div
          className="pointer-events-none fixed z-50 rounded-md border border-ui-menu bg-ui-raised px-2 py-1 font-ui text-[11px] font-medium text-ui-1 shadow-ui-float"
          style={{ left: zoneDrag.x + 14, top: zoneDrag.y + 14 }}
        >
          {zoneDrag.ids.length > 1 ? `${zoneDrag.ids.length} widgets` : placementTitle(dragged)}{" "}
          <span className="font-ui-mono tabular-nums text-ui-3">
            → C{zoneDrag.rect.col} · R{zoneDrag.rect.row} · {zoneDrag.rect.cols}×{zoneDrag.rect.rows}
          </span>
        </div>
      )}
    </div>
    </PageIslandProvider>
  );
}
