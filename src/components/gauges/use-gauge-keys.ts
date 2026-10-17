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
