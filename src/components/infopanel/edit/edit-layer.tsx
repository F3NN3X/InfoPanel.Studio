/**
 * The editing surface over the drawn profile (spec §7): click to select (Shift or Ctrl adds),
 * drag to move, drag a handle to resize. It finds what is under the pointer through the drawn
 * items' `data-path` attributes, so the renderer has no editing code. A selected item gets an
 * accent outline and a badge naming its mode and kind; Show modes tints every item. Coordinates
 * are profile pixels. Ported from the lab's EditLayer.
 */
import { useLayoutEffect, useRef, useState, type PointerEvent } from "react";
import { Lock } from "lucide-react";
import { itemAt, moveBy, setBox, type Box, type Path } from "@/lib/infopanel/editor/ops";
import type { ModeState } from "@/lib/infopanel/canvas-edit";
import type { CanvasEditor } from "./use-canvas-editor";

type Handle = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";
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
  moved: boolean;
}

/** The union box of an item's drawn elements (a group's children included), in profile pixels. */
function measure(root: HTMLElement, layer: HTMLElement, path: Path, k: number): Box | null {
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

const sameBoxes = (a: Record<string, Box>, b: Record<string, Box>) =>
  Object.keys(a).length === Object.keys(b).length &&
  Object.entries(a).every(([p, x]) => b[p] && (["x", "y", "width", "height"] as const).every((f) => Math.abs(x[f] - b[p][f]) < 0.25));

const ACCENT = "var(--ui-accent)";
const TINT: Record<ModeState, { bg: string; border: string }> = {
  native: { bg: "oklch(0.72 0.15 255 / 0.16)", border: "oklch(0.72 0.15 255 / 0.7)" },
  infopanel: { bg: "oklch(0.8 0.15 75 / 0.16)", border: "oklch(0.8 0.15 75 / 0.7)" },
  stuck: { bg: "repeating-linear-gradient(45deg, oklch(0.72 0.17 25 / 0.26) 0 6px, transparent 6px 12px)", border: "oklch(0.72 0.17 25 / 0.7)" },
};
const BADGE_BORDER: Record<ModeState, string> = { native: ACCENT, infopanel: "var(--ui-warning)", stuck: "var(--ui-danger)" };

/** "Native · Bar", "InfoPanel · Text", "InfoPanel · Gauge · can't convert". */
export function badgeText(kind: string, state: ModeState | undefined): string {
  if (!state) return kind;
  return state === "native" ? `Native · ${kind}` : state === "stuck" ? `InfoPanel · ${kind} · can’t convert` : `InfoPanel · ${kind}`;
}

export function EditLayer({ editor, profileWidth, showModes }: { editor: CanvasEditor; profileWidth: number; showModes: boolean }) {
  const layer = useRef<HTMLDivElement>(null);
  const drag = useRef<Drag | null>(null);
  const [boxes, setBoxes] = useState<Record<string, Box>>({});
  /** Profile pixels per screen pixel, so handles and badges keep their screen size at any zoom. */
  const [zoomK, setZoomK] = useState(1);
  const measured = showModes ? [...new Set([...editor.modes.keys(), ...editor.selection])] : editor.selection;

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
    if (!handle) {
      const root = layer.current!.parentElement!;
      const hit = document
        .elementsFromPoint(e.clientX, e.clientY)
        .find((el) => root.contains(el) && !layer.current!.contains(el) && el.closest("[data-path]"))
        ?.closest("[data-path]")
        ?.getAttribute("data-path");
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
    drag.current = {
      x: e.clientX,
      y: e.clientY,
      k: scaleOf(),
      base: editor.committed,
      paths: movable,
      handle,
      box: handle && single ? boxes[single] : undefined,
      moved: false,
    };
  };

  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d) return;
    const dx = (e.clientX - d.x) * d.k;
    const dy = (e.clientY - d.y) * d.k;
    if (!d.moved && Math.hypot(e.clientX - d.x, e.clientY - d.y) < DRAG_THRESHOLD) return;
    d.moved = true;
    if (d.handle && d.box && single) {
      const b = { ...d.box };
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
      editor.preview(setBox(d.base, single, b));
    } else {
      editor.preview(moveBy(d.base, d.paths, Math.round(dx), Math.round(dy)));
    }
  };

  const onPointerUp = () => {
    const d = drag.current;
    drag.current = null;
    if (!d) return;
    // One drag, one undo step.
    if (d.moved) editor.commit(editor.items);
    else editor.preview(null);
  };

  const onPointerCancel = () => {
    drag.current = null;
    editor.preview(null);
  };

  const fontPx = 11 * zoomK;
  return (
    <div
      ref={layer}
      data-canvas-edit-layer=""
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
      onDragStart={(e) => e.preventDefault()}
      style={{ position: "absolute", inset: 0, touchAction: "none", userSelect: "none" }}
    >
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
      {editor.selection.map((p) => {
        const b = boxes[p];
        if (!b) return null;
        const item = itemAt(editor.items, p);
        const state = editor.modes.get(p)?.state;
        return (
          <div
            key={p}
            style={{
              position: "absolute",
              left: b.x,
              top: b.y,
              width: b.width,
              height: b.height,
              outline: `${1.5 * zoomK}px solid ${ACCENT}`,
              outlineOffset: zoomK,
              pointerEvents: "none",
            }}
          >
            {p === single && item && (
              <span
                style={{
                  position: "absolute",
                  left: -2 * zoomK,
                  bottom: `calc(100% + ${6 * zoomK}px)`,
                  whiteSpace: "nowrap",
                  padding: `${2 * zoomK}px ${7 * zoomK}px`,
                  borderRadius: 5 * zoomK,
                  background: "#16161b",
                  border: `${zoomK}px solid ${state ? BADGE_BORDER[state] : "#3a3a42"}`,
                  color: "#ededf0",
                  fontSize: fontPx,
                  lineHeight: 1.3,
                  fontFamily: "var(--font-ui, sans-serif)",
                  display: "flex",
                  alignItems: "center",
                  gap: 4 * zoomK,
                }}
              >
                {badgeText(item.kind, state)}
                {item.IsLocked && <Lock style={{ width: fontPx, height: fontPx }} aria-label="Locked" />}
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
    </div>
  );
}
