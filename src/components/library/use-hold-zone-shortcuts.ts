/**
 * The studio's zone shortcuts (Del, Ctrl+D, arrows …) would act on the canvas hidden behind a full page
 * (Library, Gauges): this holds them back while the page is open. Undo, redo, save and the palette still pass.
 */
import { useEffect } from "react";
import { canvasKeyAction } from "@/components/infopanel/edit/canvas-keys";

/** Focus is in a text field: shortcuts must not fire. */
export const isTyping = (el: Element | null): boolean =>
  el instanceof HTMLElement && (el.isContentEditable || el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT");

export function useHoldZoneShortcuts(): void {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.isComposing) return;
      const action = canvasKeyAction(
        { key: e.key, code: e.code, ctrlKey: e.ctrlKey, metaKey: e.metaKey, shiftKey: e.shiftKey, altKey: e.altKey },
        { typing: isTyping(document.activeElement), overlay: document.querySelector('[role="dialog"], [role="menu"]') !== null },
      );
      if (action && action.type !== "escape") e.preventDefault();
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, []);
}
