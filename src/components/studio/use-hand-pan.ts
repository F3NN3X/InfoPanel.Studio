import { useCallback, useEffect, useRef, useState } from "react";
import { isTextField } from "@/lib/native-menu";

export interface PanOffset {
  x: number;
  y: number;
}

export const NO_PAN: PanOffset = { x: 0, y: 0 };

/** The offset after a drag that started at `from` and has moved by `dx`, `dy`. */
export const panBy = (from: PanOffset, dx: number, dy: number): PanOffset => ({ x: from.x + dx, y: from.y + dy });

/**
 * The hand tool: drag the canvas around at any zoom, with the middle button, or with the left
 * button while Space is held (with the canvas or nothing focused). The container shows a grab cursor while Space
 * is down and a grabbing one while dragging (`data-hand`, styled in index.css); the browser's
 * middle-click autoscroll is cancelled. Returns the offset to translate the page by.
 */
export function useHandPan(el: HTMLElement | null): { pan: PanOffset; resetPan: () => void } {
  const [pan, setPan] = useState<PanOffset>(NO_PAN);
  // The listeners read the offset here, so a reset from outside is where the next drag starts.
  const offset = useRef<PanOffset>(NO_PAN);
  const resetPan = useCallback(() => {
    offset.current = NO_PAN;
    setPan(NO_PAN);
  }, []);

  useEffect(() => {
    if (!el) return;
    let space = false;
    let drag: { x: number; y: number; from: PanOffset; id: number; moved: boolean } | null = null;
    const show = () => {
      if (drag) el.dataset.hand = "grabbing";
      else if (space) el.dataset.hand = "grab";
      else delete el.dataset.hand;
    };
    const end = () => {
      if (!drag) return;
      if (el.hasPointerCapture?.(drag.id)) el.releasePointerCapture(drag.id);
      // A drag that moved isn't a click (no deselect on release).
      if (drag.moved) el.addEventListener("click", (e) => e.stopPropagation(), { capture: true, once: true });
      drag = null;
      show();
    };
    const onDown = (e: PointerEvent) => {
      if (e.button !== 1 && !(e.button === 0 && space)) return;
      // Capture phase: a zone under the pointer doesn't start its own move or draw.
      e.preventDefault();
      e.stopPropagation();
      drag = { x: e.clientX, y: e.clientY, from: offset.current, id: e.pointerId, moved: false };
      el.setPointerCapture?.(e.pointerId);
      show();
    };
    const onMove = (e: PointerEvent) => {
      if (!drag || e.pointerId !== drag.id) return;
      const dx = e.clientX - drag.x;
      const dy = e.clientY - drag.y;
      if (Math.abs(dx) + Math.abs(dy) > 2) drag.moved = true;
      offset.current = panBy(drag.from, dx, dy);
      setPan(offset.current);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== "Space") return;
      const down = e.type === "keydown";
      // Only from the canvas or nothing focused: Space still presses a focused button, types in a field.
      const t = e.target;
      if (down && (isTextField(t) || !(t === document.body || t === document.documentElement || (t instanceof Node && el.contains(t))))) return;
      // Space held: no page scroll, no button press.
      if (down) e.preventDefault();
      if (space === down) return;
      space = down;
      show();
    };
    const onBlur = () => {
      space = false;
      end();
      show();
    };
    // Chromium starts its autoscroll on the middle button's mousedown.
    const onMouseDown = (e: MouseEvent) => e.button === 1 && e.preventDefault();
    el.addEventListener("pointerdown", onDown, { capture: true });
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerup", end);
    el.addEventListener("pointercancel", end);
    el.addEventListener("mousedown", onMouseDown);
    window.addEventListener("keydown", onKey);
    window.addEventListener("keyup", onKey);
    window.addEventListener("blur", onBlur);
    return () => {
      end();
      delete el.dataset.hand;
      el.removeEventListener("pointerdown", onDown, { capture: true });
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerup", end);
      el.removeEventListener("pointercancel", end);
      el.removeEventListener("mousedown", onMouseDown);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("keyup", onKey);
      window.removeEventListener("blur", onBlur);
    };
  }, [el]);

  return { pan, resetPan };
}
