import { useCallback, useEffect, useRef, useState, type SetStateAction } from "react";

/** A stored "1" / "0"; anything else (nothing stored, unknown) = the default. */
export function parseFlag(raw: string | null, fallback: boolean): boolean {
  return raw === "1" ? true : raw === "0" ? false : fallback;
}

/** The canvas grid and rulers (Settings › Studio writes them from its own window). */
export const GRID_KEY = "studio.grid";
export const RULERS_KEY = "studio.rulers";

/**
 * Follow `key` when another window of this origin writes it (the Settings window's Studio page): `apply` gets the
 * new raw value (null when removed). A window never gets a `storage` event for its own writes.
 */
export function useStorageKey(key: string, apply: (raw: string | null) => void): void {
  const latest = useRef(apply);
  latest.current = apply;
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === key || e.key === null) latest.current(e.key === null ? null : e.newValue);
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [key]);
}

/** A boolean studio preference remembered across reloads (localStorage `key`), and followed across windows. */
export function useStoredFlag(key: string, fallback: boolean) {
  const [value, setValue] = useState(() => {
    try {
      return parseFlag(localStorage.getItem(key), fallback);
    } catch {
      return fallback;
    }
  });
  const current = useRef(value);
  const set = useCallback(
    (next: SetStateAction<boolean>) => {
      const resolved = typeof next === "function" ? next(current.current) : next;
      current.current = resolved;
      setValue(resolved);
      try {
        localStorage.setItem(key, resolved ? "1" : "0");
      } catch {
        // Storage unavailable (private mode, quota): keep the session state.
      }
    },
    [key]
  );
  useStorageKey(key, (raw) => {
    current.current = parseFlag(raw, fallback);
    setValue(current.current);
  });
  return [value, set] as const;
}
