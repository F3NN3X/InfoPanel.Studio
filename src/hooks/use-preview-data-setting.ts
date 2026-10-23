import { useCallback, useEffect, useState } from "react";
import { useStorageKey } from "@/components/studio/use-stored-flag";
import { PREVIEW_DATA_DEFAULT, PREVIEW_DATA_KEY, parsePreviewData, type PreviewData } from "@/lib/preview-data-pref";
import { fetchStudioPrefs, saveStudioPref } from "@/lib/studio-prefs";

/** The Design preview data setting as this browser last saw it (the default when unset or unreadable). */
export function storedPreviewData(): PreviewData {
  try {
    return parsePreviewData(localStorage.getItem(PREVIEW_DATA_KEY));
  } catch {
    return PREVIEW_DATA_DEFAULT;
  }
}

function remember(mode: PreviewData): void {
  try {
    localStorage.setItem(PREVIEW_DATA_KEY, mode);
  } catch {
    // Storage unavailable: this page only.
  }
}

/**
 * The Design preview data setting. The server keeps it (/api/studio-prefs), so it follows the user between the app
 * window and a browser studio; localStorage holds this browser's copy, read at once and followed across its windows.
 * The server's is read on mount and whenever the page comes back to the front, after a change made elsewhere.
 */
export function usePreviewDataSetting(): [PreviewData, (next: PreviewData) => void] {
  const [mode, setMode] = useState<PreviewData>(storedPreviewData);
  useStorageKey(PREVIEW_DATA_KEY, (raw) => setMode(parsePreviewData(raw)));
  useEffect(() => {
    let alive = true;
    const pull = () =>
      void fetchStudioPrefs()
        .then((prefs) => {
          const saved = prefs[PREVIEW_DATA_KEY];
          if (!alive || saved === undefined) return;
          const next = parsePreviewData(saved);
          setMode(next);
          remember(next);
        })
        .catch(() => {
          // Server unreachable: this browser's copy stands.
        });
    const onVisible = () => {
      if (document.visibilityState === "visible") pull();
    };
    pull();
    window.addEventListener("focus", pull);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      alive = false;
      window.removeEventListener("focus", pull);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);
  const set = useCallback((next: PreviewData) => {
    setMode(next);
    remember(next);
    void saveStudioPref(PREVIEW_DATA_KEY, next).catch(() => {
      // Server unreachable: saved in this browser only.
    });
  }, []);
  return [mode, set];
}
