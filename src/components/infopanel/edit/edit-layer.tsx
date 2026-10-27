/**
 * The editing surface over the drawn profile (spec §7): click to select (Shift or Ctrl adds),
 * drag to move, drag a handle to resize. It finds what is under the pointer through the drawn
 * items' `data-path` attributes, so the renderer has no editing code; the click goes to the
 * topmost item the mouse takes (`hitTest`: locked and hidden items let it through). A move or
 * resize snaps to the canvas and the other items with guides drawn (Alt: off), Shift keeps a move
 * on one axis and a resize in proportion. A selected item gets an accent outline, and its size while
 * it is dragged or resized (its mode and kind are in the inspector); Show modes tints every item. On a screen made for
 * InfoPanel every part (never a group) carries its Export check badge in its top-right corner (Edit v3 SPEC §7.1).
 * Coordinates are profile pixels.
 * Ported from the lab's EditLayer.
 */
import { useEffect, useLayoutEffect, useRef, useState, type MouseEvent, type PointerEvent } from "react";
import { flatPaths } from "@/lib/infopanel/canvas-edit";
import { hitTest, unitPick } from "@/lib/infopanel/editor/arrange";
import { itemAt, moveBy, setBox, type Box, type Path } from "@/lib/infopanel/editor/ops";
import { cellDelta, holdsWidget, moveOnCells, resizeOnCells } from "@/lib/infopanel/editor/cells";
import { cellRect, type PageGrid } from "@/lib/page-model/model";
import { placesFreely } from "@/lib/page-model/gesture";
import { CellLines } from "@/components/studio/alt-hint";
import {
  constrainAxis,
  guidesAt,
  keepAspect,
  snapMove,
  snapResize,
  snapTargets,
  snapThreshold,
  unionBox,
  type Guide,
  type Handle,
  type SnapTargets,
} from "@/lib/infopanel/editor/snap";
import type { DisplayItem } from "@/lib/infopanel/schema";
import type { ModeState } from "@/lib/infopanel/canvas-edit";
import { cn } from "@/lib/utils";
import { elementOf } from "@/lib/infopanel/elements/apply";
import { STATUS_UI, useExportCheck } from "../export-check-panel";
import type { CanvasEditor } from "./use-canvas-editor";

const HANDLES: Handle[] = ["nw", "n", "ne", "e", "se", "s", "sw", "w"];
const DRAG_THRESHOLD = 2;

interface Drag {
  x: number;
  y: number;
  /** Profile pixels per client pixel. */
  k: number;
  base: CanvasEditor["committed"];
  paths: Path[];
  handle?: Handle;
  box?: Box;
  /** The moved items' box at the start (a move snaps it as one). */
  start: Box | null;
  targets: SnapTargets;
  moved: boolean;
  /** The moving parts hold a Studio widget item: they move by whole cells, never onto another widget. */
  widget: boolean;
  /** The last pointer step (Alt pressed or released re-runs it). */
  last?: { x: number; y: number; shift: boolean };
}

/** A drag that holds Alt: the hint over the canvas, and (for items) the dashed start box and the faded cell lines. */
interface AltDrag {
  widget: boolean;
  free: boolean;
  from: Box | null;
}

/** The cell edges a move or resize snaps to, besides the canvas and the other items (Edit v3 SPEC §7.3). */
function withCells(targets: SnapTargets, grid: PageGrid): SnapTargets {
  const xs: number[] = [];
  const ys: number[] = [];
  for (let col = 1; col <= grid.cols; col++) {
    const r = cellRect(grid, { col, row: 1, cols: 1, rows: 1 });
    xs.push(r.x, r.x + r.w);
  }
  for (let row = 1; row <= grid.rows; row++) {
    const r = cellRect(grid, { col: 1, row, cols: 1, rows: 1 });
    ys.push(r.y, r.y + r.h);
  }
  return { x: [...new Set([...targets.x, ...xs])], y: [...new Set([...targets.y, ...ys])] };
}


/** The union box of an item's drawn elements (a group's children included), in profile pixels. */
export function measure(root: HTMLElement, layer: HTMLElement, path: Path, k: number): Box | null {
  const r = root.getBoundingClientRect();
  const parts = [...root.querySelectorAll(`[data-path="${path}"], [data-path^="${path}."]`)]
    .filter((e) => !layer.contains(e))
    // An SVG group's own box includes canvas-sized gradient layers; measure its drawn paths.
    .flatMap((e) => (e instanceof SVGGElement ? [...e.querySelectorAll(":scope > path, :scope > g > path")] : [e]))
    .map((e) => e.getBoundingClientRect())
    .filter((b) => b.width > 0 || b.height > 0);
  if (parts.length === 0) return null;
  const l = Math.min(...parts.map((p) => p.left));
  const t = Math.min(...parts.map((p) => p.top));
  return {
    x: (l - r.left) * k,
    y: (t - r.top) * k,
    width: (Math.max(...parts.map((p) => p.right)) - l) * k,
    height: (Math.max(...parts.map((p) => p.bottom)) - t) * k,
  };
}

/**
 * What a move or resize snaps to: the canvas, and every drawn item but the moving ones (and what
 * they hold). Groups have no box of their own; their items count one by one.
 */
export function measureTargets(root: HTMLElement, layer: HTMLElement, items: readonly DisplayItem[], profile: { Width: number; Height: number }, moving: readonly Path[], k: number): SnapTargets {
  const others = flatPaths(items)
    .filter((p) => itemAt(items, p)?.kind !== "Group" && !moving.some((m) => p === m || p.startsWith(m + ".")))
    .flatMap((p) => measure(root, layer, p, k) ?? []);
  return snapTargets(profile, others);
}

const sameBoxes = (a: Record<string, Box>, b: Record<string, Box>) =>
  Object.keys(a).length === Object.keys(b).length &&
  Object.entries(a).every(([p, x]) => b[p] && (["x", "y", "width", "height"] as const).every((f) => Math.abs(x[f] - b[p][f]) < 0.25));

const ACCENT = "var(--ui-accent)";
const GUIDE = "oklch(0.72 0.24 340)";
const TINT: Record<ModeState, { bg: string; border: string }> = {
  native: { bg: "oklch(0.72 0.15 255 / 0.07)", border: "oklch(0.72 0.15 255 / 0.7)" },
  infopanel: { bg: "oklch(0.8 0.15 75 / 0.07)", border: "oklch(0.8 0.15 75 / 0.7)" },
  stuck: { bg: "repeating-linear-gradient(45deg, oklch(0.72 0.17 25 / 0.12) 0 6px, transparent 6px 12px)", border: "oklch(0.72 0.17 25 / 0.7)" },
};

export interface EditLayerProps {
  editor: CanvasEditor;
  profileWidth: number;
  profileHeight: number;
  showModes: boolean;
  /**
   * The page's grid in the profile's px (Edit v3 SPEC §3.7): its cell lines show, items snap to its cell edges, and
   * Studio widget items sit on its cells.
   */
  grid?: PageGrid;
  /** Items snap while dragging (the page's Snap items; Alt does the other). Unset = true. */
  snapItems?: boolean;
  /** A drag started or stopped holding Alt: the canvas shows the hint (a widget's, or placing freely), or hides it. */
  onAltDrag?: (drag: { widget: boolean } | null) => void;
}

export function EditLayer({ editor, profileWidth, profileHeight, showModes, grid, snapItems = true, onAltDrag }: EditLayerProps) {
  const [altDrag, setAltDrag] = useState<AltDrag | null>(null);
  const hint = altDrag ? altDrag.widget : null;
  useEffect(() => onAltDrag?.(hint === null ? null : { widget: hint }), [hint, onAltDrag]);
  const layer = useRef<HTMLDivElement>(null);
  const drag = useRef<Drag | null>(null);
  const { boxes, setBoxes } = editor;
  const [guides, setGuides] = useState<Guide[]>([]);
  /** A drag is moving or resizing: the size label shows only then. */
  const [sizing, setSizing] = useState(false);
  const profile = { Width: profileWidth, Height: profileHeight };
  /** Profile pixels per screen pixel, so handles and labels keep their screen size at any zoom. */
  const [zoomK, setZoomK] = useState(1);
  const check = useExportCheck();
  const badged = check.on ? [...check.byPath.keys()] : [];
  const measured = showModes || badged.length ? [...new Set([...(showModes ? editor.modes.keys() : []), ...badged, ...editor.selection])] : editor.selection;

  useLayoutEffect(() => {
    const el = layer.current;
    const root = el?.parentElement;
    if (!el || !root) return;
    const width = root.getBoundingClientRect().width;
    if (width === 0) return;
    const k = profileWidth / width;
    const next: Record<string, Box> = {};
    for (const p of measured) {
      const b = measure(root, el, p, k);
      if (b) next[p] = b;
    }
    if (!sameBoxes(boxes, next)) setBoxes(next);
    if (Math.abs(k - zoomK) > 0.001) setZoomK(k);
  });

  const single = editor.selection.length === 1 ? editor.selection[0] : null;
  const singleItem = single ? itemAt(editor.items, single) : undefined;
  const resizable =
    singleItem && singleItem.kind !== "Group" && singleItem.kind !== "TableSensor" && singleItem.Rotation === 0 && !singleItem.IsLocked;

  const hs = 8 * zoomK;
  const scaleOf = () => profileWidth / layer.current!.parentElement!.getBoundingClientRect().width;

  /** The topmost item the mouse takes at a client point, or null. */
  const hitAt = (x: number, y: number, k: number) => {
    const root = layer.current!.parentElement!;
    const under = document
      .elementsFromPoint(x, y)
      .filter((el) => root.contains(el) && !layer.current!.contains(el))
      .flatMap((el) => el.closest("[data-path]")?.getAttribute("data-path") ?? []);
    return hitTest(editor.committed, under, (p) => measure(root, layer.current!, p, k), profile);
  };

  /** Double-click goes into a group: it selects the item under the pointer. */
  const onDoubleClick = (e: MouseEvent<HTMLDivElement>) => {
    const hit = hitAt(e.clientX, e.clientY, scaleOf());
    if (hit !== null) editor.select([hit]);
  };

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    // A text selection elsewhere would turn the drag into a native drag-and-drop, which cancels the pointer.
    e.preventDefault();
    e.stopPropagation();
    window.getSelection()?.removeAllRanges();
    // Leaving an inspector field commits its value; this press then only selects.
    const active = document.activeElement;
    const typing = active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement || active instanceof HTMLSelectElement;
    if (typing) (active as HTMLElement).blur();
    const handle = (e.target as HTMLElement).dataset.handle as Handle | undefined;
    const additive = e.shiftKey || e.ctrlKey || e.metaKey;
    let paths = editor.selection;
    const root = layer.current!.parentElement!;
    const k = scaleOf();
    if (!handle) {
      const hit0 = hitAt(e.clientX, e.clientY, k);
      // A group's item selects the group as one; Alt-click goes in for the item.
      const hit = hit0 === null ? null : unitPick(hit0, editor.selection, e.altKey);
      if (hit == null) {
        if (!additive) editor.select([]);
        return;
      }
      const inSelection = paths.some((p) => hit === p || hit.startsWith(p + "."));
      if (additive) {
        editor.pick(hit, true);
        return;
      }
      if (!inSelection) {
        paths = [hit];
        editor.select(paths);
      }
    }
    const movable = paths.filter((p) => !itemAt(editor.committed, p)?.IsLocked);
    if (typing || movable.length === 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const targets = measureTargets(root, layer.current!, editor.committed, profile, movable, k);
    drag.current = {
      x: e.clientX,
      y: e.clientY,
      k,
      base: editor.committed,
      paths: movable,
      handle,
      box: handle && single ? boxes[single] : undefined,
      start: handle ? null : unionBox(movable.flatMap((p) => measure(root, layer.current!, p, k) ?? [])),
      targets: grid ? withCells(targets, grid) : targets,
      moved: false,
      widget: grid !== undefined && holdsWidget(editor.committed, movable),
    };
  };

  /**
   * A move or resize that takes widget items: they go by whole cells (a resize to the cells nearest the box), and
   * the rest of the selection by the same px; null when a widget would leave the grid or land on another widget, so
   * the parts stay where the last allowed step put them.
   */
  const onCells = (d: Drag, g: PageGrid, dx: number, dy: number, resized: Box | null): DisplayItem[] | null => {
    if (resized) return single ? resizeOnCells(g, d.base, single, { x: resized.x, y: resized.y, w: resized.width, h: resized.height }) : null;
    const { dc, dr } = cellDelta(g, dx, dy);
    return moveOnCells(g, d.base, d.paths, dc, dr);
  };

  /** One step of a drag to a client point, with Alt and Shift as held (Alt pressed or released mid-drag re-runs it). */
  const step = (d: Drag, cx: number, cy: number, alt: boolean, shift: boolean) => {
    const dx = (cx - d.x) * d.k;
    const dy = (cy - d.y) * d.k;
    d.last = { x: cx, y: cy, shift };
    // Snapping is in screen pixels, so it feels the same at any zoom; Alt places freely (with Snap items off, snaps).
    const free = placesFreely(snapItems, alt);
    const threshold = snapThreshold(d.k, free);
    const widget = d.widget;
    setAltDrag(alt && (free || widget) ? { widget, free: free && !widget, from: d.box ?? d.start } : null);
    if (d.handle && d.box && single) {
      let b = { ...d.box };
      if (d.handle.includes("e")) b.width = Math.max(1, d.box.width + dx);
      if (d.handle.includes("s")) b.height = Math.max(1, d.box.height + dy);
      if (d.handle.includes("w")) {
        b.width = Math.max(1, d.box.width - dx);
        b.x = d.box.x + d.box.width - b.width;
      }
      if (d.handle.includes("n")) {
        b.height = Math.max(1, d.box.height - dy);
        b.y = d.box.y + d.box.height - b.height;
      }
      if (grid && widget) {
        const items = onCells(d, grid, dx, dy, b);
        if (items) editor.preview(items);
        return;
      }
      const snapped = snapResize(b, d.handle, d.targets, threshold);
      b = snapped.box;
      // Shift keeps the shape; the guides show what the kept shape still lines up with.
      if (shift) b = keepAspect(d.box, b, d.handle);
      setGuides(shift ? (threshold > 0 ? guidesAt(b, d.targets) : []) : snapped.guides);
      editor.preview(setBox(d.base, single, b));
    } else {
      const moved = shift ? constrainAxis(dx, dy) : { dx, dy };
      if (grid && widget) {
        const items = onCells(d, grid, moved.dx, moved.dy, null);
        if (items) editor.preview(items);
        return;
      }
      const s = d.start ? snapMove({ ...d.start, x: d.start.x + moved.dx, y: d.start.y + moved.dy }, d.targets, threshold) : { dx: 0, dy: 0, guides: [] };
      // On one axis only that axis snaps.
      const lockX = shift && moved.dx === 0;
      const lockY = shift && moved.dy === 0;
      setGuides(s.guides.filter((g) => (g.axis === "x" ? !lockX : !lockY)));
      editor.preview(moveBy(d.base, d.paths, Math.round(moved.dx + (lockX ? 0 : s.dx)), Math.round(moved.dy + (lockY ? 0 : s.dy))));
    }
  };

  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d) return;
    if (!d.moved && Math.hypot(e.clientX - d.x, e.clientY - d.y) < DRAG_THRESHOLD) return;
    if (!d.moved) setSizing(true);
    d.moved = true;
    step(d, e.clientX, e.clientY, e.altKey, e.shiftKey);
  };

  // Alt pressed or released mid-drag switches between snapped and free at once.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const d = drag.current;
      if (e.key !== "Alt" || !d?.moved || !d.last) return;
      e.preventDefault();
      step(d, d.last.x, d.last.y, e.type === "keydown", d.last.shift);
    };
    window.addEventListener("keydown", onKey, true);
    window.addEventListener("keyup", onKey, true);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      window.removeEventListener("keyup", onKey, true);
    };
  });

  const onPointerUp = () => {
    const d = drag.current;
    drag.current = null;
    setGuides([]);
    setSizing(false);
    setAltDrag(null);
    if (!d) return;
    // One drag, one undo step.
    if (d.moved) editor.commit(editor.items);
    else editor.preview(null);
  };

  const onPointerCancel = () => {
    drag.current = null;
    setGuides([]);
    setSizing(false);
    setAltDrag(null);
    editor.preview(null);
  };

  return (
    <div
      ref={layer}
      data-canvas-edit-layer=""
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
      onDoubleClick={onDoubleClick}
      onDragStart={(e) => e.preventDefault()}
      style={{ position: "absolute", inset: 0, touchAction: "none", userSelect: "none" }}
    >
      {grid && <CellLines grid={grid} k={zoomK} faded={altDrag?.free === true} />}
      {altDrag?.free && altDrag.from && (
        <div
          data-start-outline=""
          style={{ position: "absolute", left: altDrag.from.x, top: altDrag.from.y, width: altDrag.from.width, height: altDrag.from.height, border: `${zoomK}px dashed #ffffff40`, pointerEvents: "none" }}
        />
      )}
      {showModes &&
        [...editor.modes].map(([p, m]) => {
          const b = boxes[p];
          return (
            b && (
              <div
                key={`tint-${p}`}
                style={{
                  position: "absolute",
                  left: b.x,
                  top: b.y,
                  width: b.width,
                  height: b.height,
                  background: TINT[m.state].bg,
                  boxShadow: `inset 0 0 0 ${zoomK}px ${TINT[m.state].border}`,
                  pointerEvents: "none",
                }}
              />
            )
          );
        })}
      {badged.map((p) => {
        const b = boxes[p];
        const row = check.byPath.get(p);
        if (!b || !row) return null;
        const { icon: Icon, text, border } = STATUS_UI[row.status];
        const size = 16 * zoomK;
        // A baked card's box has a margin for its shadow and glow: the badge sits on the card itself.
        const pad = (elementOf(itemAt(editor.items, p)) as { pad?: number } | null)?.pad ?? 0;
        return (
          <span
            key={`badge-${p}`}
            data-check-badge={row.status}
            data-testid="canvas-badge"
            data-status={row.status}
            className={cn("pointer-events-none absolute grid place-items-center rounded-full border bg-ui-chrome", text, border)}
            style={{ left: b.x + b.width - pad - 4 * zoomK - size, top: b.y + pad + 4 * zoomK, width: size, height: size, borderWidth: zoomK }}
          >
            <Icon style={{ width: 11 * zoomK, height: 11 * zoomK }} strokeWidth={2.25} />
          </span>
        );
      })}
      {editor.selection.map((p) => {
        const b = boxes[p];
        if (!b) return null;
        // A group (Edit v3 SPEC §7.1): one box around its members, 3 px out, with a "{name} · group" chip above it.
        const selectedItem = itemAt(editor.items, p);
        const group = selectedItem?.kind === "Group" && !elementOf(selectedItem) ? selectedItem : null;
        return (
          <div
            key={p}
            data-selected-path={p}
            style={{
              position: "absolute",
              left: b.x,
              top: b.y,
              width: b.width,
              height: b.height,
              outline: `${(group ? 2 : 1.5) * zoomK}px solid ${ACCENT}`,
              outlineOffset: (group ? 3 : 1) * zoomK,
              borderRadius: group ? 6 * zoomK : undefined,
              pointerEvents: "none",
            }}
          >
            {group && (
              <span
                data-testid="group-chip"
                style={{
                  position: "absolute",
                  left: -3 * zoomK,
                  top: -26 * zoomK,
                  whiteSpace: "nowrap",
                  padding: `${2 * zoomK}px ${6 * zoomK}px`,
                  borderRadius: 4 * zoomK,
                  background: ACCENT,
                  color: "var(--ui-inverse-fg)",
                  fontSize: 10.5 * zoomK,
                  fontWeight: 600,
                  lineHeight: 1.3,
                }}
              >
                {group.Name || "Group"} · group
              </span>
            )}
            {p === single && sizing && (
              <span
                data-size-label=""
                data-testid={altDrag?.free ? "alt-readout" : undefined}
                style={{
                  position: "absolute",
                  left: "50%",
                  ...(b.y + b.height < profileHeight - 28 * zoomK ? { top: `calc(100% + ${6 * zoomK}px)` } : { bottom: 4 * zoomK }),
                  transform: "translateX(-50%)",
                  whiteSpace: "pre",
                  padding: `${1 * zoomK}px ${6 * zoomK}px`,
                  borderRadius: 4 * zoomK,
                  background: ACCENT,
                  color: altDrag?.free ? "var(--ui-inverse-fg)" : "#fff",
                  fontSize: 10.5 * zoomK,
                  lineHeight: 1.3,
                  fontFamily: "var(--font-ui-mono, monospace)",
                }}
              >
                {altDrag?.free ? `X ${Math.round(b.x)}  Y ${Math.round(b.y)}  W ${Math.round(b.width)}  H ${Math.round(b.height)} · free` : `${Math.round(b.width)} × ${Math.round(b.height)}`}
              </span>
            )}
            {p === single &&
              resizable &&
              HANDLES.map((h) => (
                <div
                  key={h}
                  data-handle={h}
                  style={{
                    position: "absolute",
                    boxSizing: "border-box",
                    width: hs,
                    height: hs,
                    background: "#fff",
                    border: `${1.5 * zoomK}px solid ${ACCENT}`,
                    pointerEvents: "auto",
                    cursor: `${h}-resize`,
                    left: h.includes("w") ? -hs / 2 - zoomK : h.includes("e") ? `calc(100% - ${hs / 2 - zoomK}px)` : `calc(50% - ${hs / 2}px)`,
                    top: h.includes("n") ? -hs / 2 - zoomK : h.includes("s") ? `calc(100% - ${hs / 2 - zoomK}px)` : `calc(50% - ${hs / 2}px)`,
                  }}
                />
              ))}
          </div>
        );
      })}
      {guides.map((g) => (
        <div
          key={`${g.axis}${g.at}`}
          data-guide={g.axis}
          style={{
            position: "absolute",
            pointerEvents: "none",
            background: GUIDE,
            ...(g.axis === "x" ? { left: g.at - zoomK / 2, top: 0, width: zoomK, height: "100%" } : { top: g.at - zoomK / 2, left: 0, height: zoomK, width: "100%" }),
          }}
        />
      ))}
    </div>
  );
}
