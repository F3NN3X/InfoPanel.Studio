import { useCallback, useState } from "react";
import { useStorageKey } from "@/components/studio/use-stored-flag";
import { parsePreviewData, PREVIEW_DATA_KEY, type PreviewData } from "@/lib/preview-data-pref";

/** The stored Design preview data setting ("live" when unset or unreadable). */
export function storedPreviewData(): PreviewData {
  try {
    return parsePreviewData(localStorage.getItem(PREVIEW_DATA_KEY));
  } catch {
    return "live";
  }
}

/**
 * The Design preview data setting, remembered in localStorage and followed across windows: Settings › Studio and
 * Settings › General › Window write it, the Studio follows.
 */
export function usePreviewDataSetting(): [PreviewData, (next: PreviewData) => void] {
  const [mode, setMode] = useState<PreviewData>(storedPreviewData);
  useStorageKey(PREVIEW_DATA_KEY, (raw) => setMode(parsePreviewData(raw)));
  const set = useCallback((next: PreviewData) => {
    setMode(next);
    try {
      localStorage.setItem(PREVIEW_DATA_KEY, next);
    } catch {
      // Storage unavailable: this session only.
    }
  }, []);
  return [mode, set];
}
