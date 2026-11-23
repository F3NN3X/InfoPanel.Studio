/** Browser preference: the contextual tips were dismissed (one flag, so one dismissal hides them all). */
export const TIPS_KEY = "studio.tipDismissed";

type TipStorage = Pick<Storage, "getItem" | "setItem">;

/** Whether the tips were dismissed (storage that throws counts as not dismissed). */
export function tipsDismissed(storage?: TipStorage): boolean {
  try {
    return (storage ?? localStorage).getItem(TIPS_KEY) === "1";
  } catch {
    return false;
  }
}

/** Remember the dismissal (best effort). */
export function dismissTips(storage?: TipStorage): void {
  try {
    (storage ?? localStorage).setItem(TIPS_KEY, "1");
  } catch {
    // Private mode / blocked storage: the tip just comes back next time.
  }
}

/** The tips, each shown where it applies; `?` marks where the shortcuts keycap goes. */
export const TIPS = {
  /** Beside the page's grid settings. */
  move: "Drag to move · corner to resize · Shift-click to multi-select",
  /** Under the Layers header. */
  menu: "Right-click for more · ? for shortcuts",
} as const;
