import { useEffect } from "react";

/** The scroll position after a pan that started at `from` and has moved by `dx`, `dy`. */
export const panScroll = (from: { left: number; top: number }, dx: number, dy: number) => ({ left: from.left - dx, top: from.top - dy });

/**
 * Middle-button drag pans the canvas: the scroll container follows the pointer (a grabbing
 * cursor while it does). The browser's own middle-click autoscroll is cancelled on it.
 */
export function useMiddlePan(el: HTMLElement | null): void {
  useEffect(() => {
    if (!el) return;
    let start: { x: number; y: number; left: number; top: number; id: number } | null = null;
    const end = () => {
      if (!start) return;
      if (el.hasPointerCapture?.(start.id)) el.releasePointerCapture(start.id);
      start = null;
      el.style.cursor = "";
    };
    const onDown = (e: PointerEvent) => {
      if (e.button !== 1) return;
      e.preventDefault();
      start = { x: e.clientX, y: e.clientY, left: el.scrollLeft, top: el.scrollTop, id: e.pointerId };
      el.setPointerCapture?.(e.pointerId);
      el.style.cursor = "grabbing";
    };
    const onMove = (e: PointerEvent) => {
      if (!start || e.pointerId !== start.id) return;
      const to = panScroll(start, e.clientX - start.x, e.clientY - start.y);
      el.scrollLeft = to.left;
      el.scrollTop = to.top;
    };
    // Chromium starts its autoscroll on the middle button's mousedown.
    const onMouseDown = (e: MouseEvent) => e.button === 1 && e.preventDefault();
    const onAux = (e: MouseEvent) => e.button === 1 && e.preventDefault();
    el.addEventListener("pointerdown", onDown);
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerup", end);
    el.addEventListener("pointercancel", end);
    el.addEventListener("mousedown", onMouseDown);
    el.addEventListener("auxclick", onAux);
    return () => {
      end();
      el.removeEventListener("pointerdown", onDown);
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerup", end);
      el.removeEventListener("pointercancel", end);
      el.removeEventListener("mousedown", onMouseDown);
      el.removeEventListener("auxclick", onAux);
    };
  }, [el]);
}
