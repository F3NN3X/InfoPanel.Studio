import { useCallback, useState } from "react";
import { useStorageKey, useStoredFlag } from "./use-stored-flag";

/**
 * Settings › Studio › Editor's Add panel rows (handoff SPEC §10): the left panel's width, the widget list's
 * density and the hover preview. Saved in this browser (localStorage), followed across windows.
 */

export type LeftPanelWidth = "narrow" | "default" | "wide";
export type AddListDensity = "comfortable" | "compact";

/** The left panel's width in px per option (Layers and Add). */
export const LEFT_PANEL_PX: Record<LeftPanelWidth, number> = { narrow: 300, default: 340, wide: 380 };

export const LEFT_WIDTH_KEY = "studio.editor.leftPanelWidth";
export const DENSITY_KEY = "studio.editor.addListDensity";
export const PREVIEW_KEY = "studio.editor.addPreviewOnHover";
/** The old free-form width (px), migrated to the nearest option on first read. */
export const OLD_WIDTH_KEY = "studio.drawerWidth";

const WIDTHS: readonly LeftPanelWidth[] = ["narrow", "default", "wide"];
const DENSITIES: readonly AddListDensity[] = ["comfortable", "compact"];

/** The option nearest an old stored pixel width: under 320 narrow, 360 and over wide, else default. */
export function widthFromPx(raw: string | null): LeftPanelWidth {
  const px = raw === null ? NaN : Number(raw);
  if (!Number.isFinite(px)) return "default";
  return px < 320 ? "narrow" : px >= 360 ? "wide" : "default";
}

/** The stored width option; nothing valid stored = the old pixel width's nearest option. */
export function parseLeftPanelWidth(raw: string | null, oldPx: string | null): LeftPanelWidth {
  return WIDTHS.includes(raw as LeftPanelWidth) ? (raw as LeftPanelWidth) : widthFromPx(oldPx);
}

export function parseDensity(raw: string | null): AddListDensity {
  return DENSITIES.includes(raw as AddListDensity) ? (raw as AddListDensity) : "comfortable";
}

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Storage unavailable (private mode, quota): keep the session state.
  }
}

/** The stored width, moving an old pixel width to its option once (the old key is then removed). */
function loadLeftPanelWidth(): LeftPanelWidth {
  const raw = read(LEFT_WIDTH_KEY);
  const old = read(OLD_WIDTH_KEY);
  const width = parseLeftPanelWidth(raw, old);
  if (raw !== width && old !== null) {
    write(LEFT_WIDTH_KEY, width);
    try {
      localStorage.removeItem(OLD_WIDTH_KEY);
    } catch {
      // As above.
    }
  }
  return width;
}

/** A stored choice of a fixed set, followed across windows. */
function useStoredChoice<T extends string>(key: string, load: () => T, parse: (raw: string | null) => T) {
  const [value, setValue] = useState(load);
  const set = useCallback(
    (next: T) => {
      setValue(next);
      write(key, next);
    },
    [key]
  );
  useStorageKey(key, (raw) => setValue(parse(raw)));
  return [value, set] as const;
}

/** Left panel width: Narrow, Default or Wide. */
export function useLeftPanelWidth() {
  return useStoredChoice<LeftPanelWidth>(LEFT_WIDTH_KEY, loadLeftPanelWidth, (raw) => parseLeftPanelWidth(raw, null));
}

/** Widget list: Comfortable or Compact (no blurb, smaller rows). */
export function useAddListDensity() {
  return useStoredChoice<AddListDensity>(DENSITY_KEY, () => parseDensity(read(DENSITY_KEY)), parseDensity);
}

/** Preview on hover (on by default); the keyboard always shows the preview. */
export function useAddPreviewOnHover() {
  return useStoredFlag(PREVIEW_KEY, true);
}
