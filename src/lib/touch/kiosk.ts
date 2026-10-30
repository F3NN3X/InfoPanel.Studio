// What the kiosk does with a touch panel's messages (experimental touch): which action a gesture runs, whether the page
// fills the panel, and what to tell the viewer about the touch connection.

import type { Action, Gesture, Setup, Status } from "./types";

/** The touch.json key for a gesture: `Tap`, `LongPress`, `Swipe Left x2`, `ThreeFingerTap`, ... */
export function gestureKey(g: Gesture): string {
  return g.type === "Swipe" ? `Swipe ${g.dir} x${g.fingers}` : g.type;
}

/** The action touch.json gives the gesture, if any. */
export function actionFor(actions: Record<string, Action>, g: Gesture): Action | undefined {
  return Object.hasOwn(actions, gestureKey(g)) ? actions[gestureKey(g)] : undefined;
}

/** Touches map 1:1 only when the page covers the panel: its CSS size × the pixel ratio is the panel's, within 2 px. */
export function fillsPanel(css: { width: number; height: number }, ratio: number, setup: Pick<Setup, "width_px" | "height_px">): boolean {
  return Math.abs(css.width * ratio - setup.width_px) <= 2 && Math.abs(css.height * ratio - setup.height_px) <= 2;
}

/** What the touch notice says for a status other than Connected; null while connected. */
export function statusText(status: Status | null, name: string): string | null {
  switch (status?.status) {
    case "Connected":
      return null;
    case undefined:
      return "Touch: waiting for InfoPanel Studio. Is Touch turned on in its settings?";
    case "Disconnected":
      return `Touch: ${name}'s touchscreen isn't connected.`;
    case "Error":
      return `Touch: ${status.message}`;
    case "Stopped":
      return "Touch is off in InfoPanel Studio's settings.";
    case "Offline":
      return "Touch: lost the connection to InfoPanel Studio; reconnecting.";
  }
}
