// A touch step asked for in the Studio and done in the Settings window, where every touch change is made (the Studio
// only reads touch state). Both windows load the server's origin, so they share localStorage: the Studio leaves the
// request there and opens Settings › Touch; Touch takes it once, if it is fresh.

export type TouchIntent =
  /** The guided setup, for the panel with this id or, with none, for a new panel named after `display`. */
  | { action: "setup"; panel?: string; display?: string }
  | { action: "identify" | "calibrate" | "remove"; panel: string };

const KEY = "infopanel.touch-intent";
/** An older request was left by a Settings window that never opened: ignore it. */
const FRESH_MS = 60_000;

export function leaveTouchIntent(intent: TouchIntent, now = Date.now()): void {
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...intent, at: now }));
  } catch {
    // Storage refused: Settings opens on Touch without the request.
  }
}

/** The request left for Touch, removed as it is read; null when there is none or it is stale. */
export function takeTouchIntent(now = Date.now()): TouchIntent | null {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(KEY);
    localStorage.removeItem(KEY);
  } catch {
    return null;
  }
  if (!raw) return null;
  try {
    const { at, ...intent } = JSON.parse(raw) as TouchIntent & { at: number };
    return typeof at === "number" && now - at <= FRESH_MS && typeof intent.action === "string" ? (intent as TouchIntent) : null;
  } catch {
    return null;
  }
}
