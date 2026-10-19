/**
 * The Gauges page's keys. The studio's zone shortcuts are held back as on the Library page. While a
 * working copy is open in the editor, Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y act on it, and the studio's own undo
 * does not also fire.
 */
import { useEffect, useRef } from "react";
import { isTyping, useHoldZoneShortcuts } from "@/components/library/use-hold-zone-shortcuts";
import { historyKey } from "@/lib/gauge-studio/open";

export interface GaugeKeys {
  /** The working copy's undo and redo; absent when edits go to the config (the studio's undo applies). */
  history?: { undo: () => void; redo: () => void };
}

export function useGaugeKeys(keys: GaugeKeys): void {
  const latest = useRef(keys);
  latest.current = keys;
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.isComposing || !latest.current.history) return;
      if (document.querySelector('[role="dialog"], [role="menu"]') !== null) return;
      const step = historyKey(e, isTyping(document.activeElement));
      if (!step) return;
      e.preventDefault();
      e.stopPropagation();
      latest.current.history[step]();
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, []);
  // After the history keys, so Ctrl+Z is theirs before the zone shortcuts look at it.
  useHoldZoneShortcuts();
}

export type FrameKey = "previous" | "next" | "movePrevious" | "moveNext" | "delete";

/** The filmstrip's key for a keydown (Left / Right select, with Shift move, Delete and Backspace remove); null for any other. */
export function frameKeyOf(e: Pick<KeyboardEvent, "key" | "shiftKey" | "ctrlKey" | "metaKey" | "altKey">): FrameKey | null {
  if (e.ctrlKey || e.metaKey || e.altKey) return null;
  if (e.key === "ArrowLeft") return e.shiftKey ? "movePrevious" : "previous";
  if (e.key === "ArrowRight") return e.shiftKey ? "moveNext" : "next";
  return e.key === "Delete" || e.key === "Backspace" ? "delete" : null;
}

/**
 * The filmstrip's keys, while the strip is on screen: `act` takes the key and answers whether it did
 * something (then the key is spent). The page's held zone shortcuts have marked these keys handled already,
 * so that mark is not read here. Never while focus is in a text field, or over a dialog or menu.
 */
export function useFrameKeys(act: (key: FrameKey) => boolean): void {
  const latest = useRef(act);
  latest.current = act;
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.isComposing || isTyping(document.activeElement)) return;
      if (document.querySelector('[role="dialog"], [role="menu"]') !== null) return;
      const key = frameKeyOf(e);
      if (!key || !latest.current(key)) return;
      e.preventDefault();
      e.stopPropagation();
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, []);
}
