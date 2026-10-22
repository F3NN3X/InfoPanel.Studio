import { useCallback, useState } from "react";

/** The Add panel's Recent group (handoff SPEC §3.3): the last widgets added, in this browser. */
export const RECENT_KEY = "studio.addPanel.recent";
export const RECENT_MAX = 3;

/** The stored ids (newest first); anything but an array of strings = none. */
export function parseRecent(raw: string | null): string[] {
  try {
    const v: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string").slice(0, RECENT_MAX) : [];
  } catch {
    return [];
  }
}

/** `id` moved to the front, without repeats, at most three. */
export function withRecent(list: string[], id: string): string[] {
  return [id, ...list.filter((x) => x !== id)].slice(0, RECENT_MAX);
}

/** The Recent ids and `push` (on every widget add). */
export function useRecentWidgets() {
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
