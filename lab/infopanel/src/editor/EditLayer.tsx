/**
 * The editing surface over a ProfileView: click to select (Shift or Ctrl adds),
 * drag to move, drag a handle to resize. It sits on top of the drawn items and
 * finds what is under the pointer through their `data-path` attributes, so the
 * renderer needs no editing code. Coordinates are profile pixels.
 */
import { useLayoutEffect, useRef, useState, type PointerEvent } from "react";
import { itemAt, moveBy, setBox, type Box, type Path } from "@/lib/infopanel/editor/ops.ts";
import { isTyping, type Editor } from "./useEditor.ts";

type Handle = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";
const HANDLES: Handle[] = ["nw", "n", "ne", "e", "se", "s", "sw", "w"];
const DRAG_THRESHOLD = 2;

interface Drag {
  x: number;
  y: number;
  /** Profile pixels per client pixel. */
  k: number;
  base: Editor["present"];
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

export function EditLayer({ editor, profileWidth }: { editor: Editor; profileWidth: number }) {
  const layer = useRef<HTMLDivElement>(null);
  const drag = useRef<Drag | null>(null);
  const [boxes, setBoxes] = useState<Record<string, Box>>({});
  /** Profile pixels per screen pixel, so handles keep their screen size at any zoom. */
  const [zoomK, setZoomK] = useState(1);

  useLayoutEffect(() => {
    const el = layer.current;
    const root = el?.parentElement;
    if (!el || !root) return;
    const k = profileWidth / root.getBoundingClientRect().width;
    const next: Record<string, Box> = {};
    for (const p of editor.selection) {
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
  const gap = 2 * zoomK;
  const scaleOf = () => profileWidth / layer.current!.parentElement!.getBoundingClientRect().width;

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    // A text selection elsewhere on the page would turn the drag into a native
    // drag-and-drop, which cancels the pointer.
    e.preventDefault();
    window.getSelection()?.removeAllRanges();
    // Leaving an inspector field commits its draft; this press then only selects,
    // since a drag would start from the items as they were before that commit.
    const active = document.activeElement;
    const committing = active instanceof HTMLTextAreaElement || (active instanceof HTMLInputElement && active.type === "text");
    if (isTyping(active)) (active as HTMLElement).blur();
    const handle = (e.target as HTMLElement).dataset.handle as Handle | undefined;
    const additive = e.shiftKey || e.ctrlKey || e.metaKey;
    let paths = editor.selection;
    if (!handle) {
      // What is drawn under the pointer, below this layer.
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
    const movable = paths.filter((p) => !itemAt(editor.present, p)?.IsLocked);
    if (committing || movable.length === 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = {
      x: e.clientX, y: e.clientY, k: scaleOf(), base: editor.present, paths: movable, handle,
      box: handle && single ? boxes[single] : undefined, moved: false,
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
    if (d.moved) editor.apply(editor.items);
    else editor.preview(null);
  };

  /** A cancelled pointer leaves the items as they were. */
  const onPointerCancel = () => {
    drag.current = null;
    editor.preview(null);
  };

  return (
    <div
      ref={layer}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
      onDragStart={(e) => e.preventDefault()}
      style={{ position: "absolute", inset: 0, touchAction: "none", userSelect: "none" }}
    >
      {Object.entries(boxes).map(([p, b]) => (
        <div
          key={p}
          style={{ position: "absolute", left: b.x, top: b.y, width: b.width, height: b.height, outline: "1px dashed #ff00ff", outlineOffset: 1, pointerEvents: "none" }}
        >
          {p === single &&
            resizable &&
            HANDLES.map((h) => (
              <div
                key={h}
                data-handle={h}
                // Outside the box, so even a small item stays draggable from its middle.
                style={{
                  position: "absolute",
                  boxSizing: "border-box",
                  width: hs,
                  height: hs,
                  background: "#ff00ff",
                  border: `${zoomK}px solid white`,
                  pointerEvents: "auto",
                  cursor: `${h}-resize`,
                  left: h.includes("w") ? -hs - gap : h.includes("e") ? `calc(100% + ${gap}px)` : `calc(50% - ${hs / 2}px)`,
                  top: h.includes("n") ? -hs - gap : h.includes("s") ? `calc(100% + ${gap}px)` : `calc(50% - ${hs / 2}px)`,
                }}
              />
            ))}
        </div>
      ))}
    </div>
  );
}
