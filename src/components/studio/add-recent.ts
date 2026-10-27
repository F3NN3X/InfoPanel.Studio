import { useCallback, useState } from "react";

/**
 * The Add panel's Recently used section (Edit v3 SPEC §9.2, decision Q9): the last adds of any kind (a widget row's
 * id, `item:{Kind}`, `element:{type}`: `add-tiles.ts` keys), global across the app, in this browser.
 */
export const RECENT_KEY = "studio.addPanel.recent";
export const RECENT_MAX = 4;

/** The stored ids (newest first); anything but an array of strings = none. */
export function parseRecent(raw: string | null): string[] {
  try {
    const v: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string").slice(0, RECENT_MAX) : [];
  } catch {
    return [];
  }
}

/** `id` moved to the front, without repeats, at most four. */
export function withRecent(list: string[], id: string): string[] {
  return [id, ...list.filter((x) => x !== id)].slice(0, RECENT_MAX);
}

/** The Recently used keys and `push` (on every add). */
export function useRecentAdds() {
  const [recent, setRecent] = useState(() => {
    try {
      return parseRecent(localStorage.getItem(RECENT_KEY));
    } catch {
      return [];
    }
  });
  const push = useCallback((id: string) => {
    setRecent((list) => {
      const next = withRecent(list, id);
      try {
        localStorage.setItem(RECENT_KEY, JSON.stringify(next));
      } catch {
        // Storage unavailable: Recent lasts the session.
      }
      return next;
    });
  }, []);
  return [recent, push] as const;
}
