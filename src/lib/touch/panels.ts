// Where a touch panel stands (experimental touch), in the words Screens' display cards and Settings › Touch both use,
// and how a panel is tied to a display: its kiosk link (`?kiosk=1&touch=<id>`) reports the panel's id as its display
// name, so the display named after a panel is that panel's kiosk. Which screen it shows is chosen in Studio (the
// display's screen on the control channel), never in the link.

import { DISPLAY_FOLLOW, type ControlDisplay } from "@/lib/control";
import { isDisplayName } from "@/lib/screens/display-name";
import type { Touchscreen, TouchPanelEntry, TouchStatus } from "@/settings/types";

/** A panel's state, from the most to the least done: what its display card's touch row says. */
export type PanelState = "off" | "needs-driver" | "not-paired" | "not-connected" | "ready";

export const PANEL_STATE_TEXT: Record<PanelState, string> = {
  off: "Off",
  "needs-driver": "Needs driver",
  "not-paired": "Not paired",
  "not-connected": "Panel not connected",
  ready: "Ready",
};

interface PanelFacts {
  /** Touch panels are on in Settings. */
  enabled: boolean;
  /** The panel in touch.json; none: the display has no panel yet. */
  entry: Pick<TouchPanelEntry, "device"> | undefined;
  /** Its device's last status. */
  status: TouchStatus | null | undefined;
  /** The touchscreens plugged in; null when they could not be listed. */
  screens: readonly Pick<Touchscreen, "ready">[] | null;
}

/**
 * Where a panel stands. Connected and paired (its USB port pinned) is ready; connected and not pinned takes the first
 * free touchscreen, which is not paired. A touchscreen Windows still owns explains a panel that isn't connected.
 */
export function panelState({ enabled, entry, status, screens }: PanelFacts): PanelState {
  if (!enabled || !entry || status?.status === "Stopped") return "off";
  if (status?.status === "Connected") return entry.device.port ? "ready" : "not-paired";
  if (screens?.some((s) => !s.ready)) return "needs-driver";
  return "not-connected";
}

/** The kiosk URL of panel `id`: always this computer, since the touch stream answers only there. No `&profile=`. */
export const panelKioskUrl = (port: number, id: string): string => `http://127.0.0.1:${port}/?kiosk=1&touch=${encodeURIComponent(id)}`;

/** The display a panel's kiosk is: the one named after its id (an id that can't be a display name has none). */
export const panelDisplayName = (id: string): string | undefined => (isDisplayName(id) ? id : undefined);

/** The panel whose kiosk is display `name`. */
export function panelOfDisplay<T extends Pick<TouchPanelEntry, "id">>(panels: readonly T[], name: string | undefined): T | undefined {
  return name === undefined ? undefined : panels.find((p) => panelDisplayName(p.id) === name);
}

/** The display a panel's kiosk is, when the server has seen it. */
export function displayOfPanel(displays: readonly ControlDisplay[], panel: Pick<TouchPanelEntry, "id">): ControlDisplay | undefined {
  const name = panelDisplayName(panel.id);
  return name === undefined ? undefined : displays.find((d) => d.name === name);
}

/**
 * The screen a display's link pins (a `&profile=` in it), when it beats the one chosen in Studio: the choice and what
 * it shows then differ. The link keeps working; the choice applies once the link no longer pins.
 */
export function linkPin(display: Pick<ControlDisplay, "screen" | "shows"> | undefined): string | undefined {
  if (!display || display.screen === DISPLAY_FOLLOW || !display.shows || display.shows === display.screen) return undefined;
  return display.shows;
}

/** A monitor's Windows name without its device prefix: `\\.\DISPLAY4` → `DISPLAY4`. */
export const monitorLabel = (name: string): string => name.replace(/^\\\\\.\\/, "");

/**
 * Settings › Touch's one line for a panel: where it stands in plain words, given whether a kiosk shows it now. The
 * device's own trouble (an error, a missing touchscreen) is said by `statusText` as the kiosk's status strip says it.
 */
export function panelLine(state: PanelState, entry: Pick<TouchPanelEntry, "name" | "monitor">, kioskOnline: boolean): string {
  const on = entry.monitor?.name ? monitorLabel(entry.monitor.name) : "its display";
  switch (state) {
    case "ready":
      return kioskOnline ? `Ready: touches go to the kiosk on ${on}` : "Connected, but no display shows its kiosk yet";
    case "not-paired":
      return "Connected, but not paired with its screen yet";
    case "needs-driver":
      return "Windows still owns the touchscreen: it needs the WinUSB driver";
    case "not-connected":
      return "Its touchscreen isn't connected";
    case "off":
      return "Touch panels are off";
  }
}
