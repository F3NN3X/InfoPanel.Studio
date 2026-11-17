import type { ControlDisplay, ControlKiosk, ControlProfile } from "@/lib/control";
import type { MonitorProfile } from "@/lib/layout";
import { displayOfPanel, linkPin, panelDisplayName, panelOfDisplay } from "@/lib/touch/panels";
import type { TouchPanelEntry } from "@/settings/types";
import { cycleLabel } from "../page-tabs";

/**
 * One card of the Displays list: a display, online or not. A named display (`?display=`, or a touch panel's kiosk,
 * named after the panel) is one card however many tabs show it; a kiosk with no name is a card of its own. The server
 * reports no size or connection type for a kiosk, so the card shows only what it does report.
 */
export interface DisplayEntry {
  /** The display's name, or `kiosk:<id>` for a kiosk with no name. */
  key: string;
  /** A kiosk connected now (the first, for a display open in several tabs). */
  kiosk?: ControlKiosk;
  /** The named display, when it has a name. */
  display?: ControlDisplay;
  /** The screen it shows now (else the one chosen for it), when it still exists. */
  screen?: MonitorProfile;
  online: boolean;
  /** Its kiosk runs on this PC (a loopback address). */
  thisPc: boolean;
  /** The touch panel whose kiosk this display is. */
  panel?: TouchPanelEntry;
}

/** An address on this computer, as the server reports a kiosk's. */
export const isLoopback = (address: string | null | undefined): boolean => !!address && (address === "::1" || /^(::ffff:)?127\./.test(address));

/**
 * The Displays list: the kiosks connected now in the order they connected, each named display once, then the named
 * displays not connected; each with the touch panel whose kiosk it is.
 */
export function displayEntries(
  kiosks: readonly ControlKiosk[],
  displays: readonly ControlDisplay[],
  profiles: readonly MonitorProfile[],
  panels: readonly TouchPanelEntry[] = [],
): DisplayEntry[] {
  const screen = (id: string | null | undefined) => profiles.find((p) => p.id === id);
  const named = new Set<string>();
  const online = kiosks.flatMap((kiosk): DisplayEntry[] => {
    if (kiosk.display !== undefined) {
      if (named.has(kiosk.display)) return [];
      named.add(kiosk.display);
    }
    const display = kiosk.display !== undefined ? displays.find((d) => d.name === kiosk.display) : undefined;
    return [{ key: kiosk.display ?? `kiosk:${kiosk.id}`, kiosk, display, screen: screen(kiosk.profile), online: true, thisPc: isLoopback(kiosk.address), panel: panelOfDisplay(panels, kiosk.display) }];
  });
  const rest = displays
    .filter((d) => !named.has(d.name))
    .map((d): DisplayEntry => ({ key: d.name, display: d, screen: screen(d.shows ?? d.screen), online: d.online, thisPc: isLoopback(d.address), panel: panelOfDisplay(panels, d.name) }));
  return [...online, ...rest];
}

/** A card's title: its touch panel's name, the display's name, "This PC" for a kiosk here with no name, else "Kiosk · address". */
export function displayTitle({ kiosk, display, thisPc, panel }: Pick<DisplayEntry, "kiosk" | "display" | "thisPc" | "panel">): string {
  if (panel) return panel.name;
  if (display) return display.name;
  if (kiosk?.display) return kiosk.display;
  if (thisPc) return "This PC";
  return kiosk?.address ? `Kiosk · ${kiosk.address}` : "Kiosk";
}

/** Whether a card offers touch: a touch panel only works on this PC, so a kiosk known to be elsewhere has no touch row. */
export const offersTouch = ({ kiosk, panel }: Pick<DisplayEntry, "kiosk" | "panel">): boolean => !!panel || !kiosk?.address || isLoopback(kiosk.address);

/** "just now", "5 min ago", "3 h ago", "2 d ago". */
export function seenAgo(at: number, now: number): string {
  const minutes = Math.max(0, Math.round((now - at) / 60_000));
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  if (minutes < 1440) return `${Math.round(minutes / 60)} h ago`;
  return `${Math.round(minutes / 1440)} d ago`;
}

/** How long a kiosk has been connected: `5 min`, `2 h`, `3 d` (under a minute: `now`). */
export function connectedFor(since: number, now: number): string {
  const minutes = Math.max(0, Math.floor((now - since) / 60_000));
  if (minutes < 1) return "now";
  if (minutes < 60) return `${minutes} min`;
  if (minutes < 1440) return `${Math.floor(minutes / 60)} h`;
  return `${Math.floor(minutes / 1440)} d`;
}

/** The line under a card's title: Live with the address (unless the title is it) and for how long, or when it was last seen. */
export function displaySubtitle(entry: Pick<DisplayEntry, "kiosk" | "display" | "online" | "thisPc" | "panel">, now: number): string {
  const { kiosk, display } = entry;
  if (!kiosk) return entry.online ? "Live" : `Offline · seen ${seenAgo(display?.lastSeen ?? now, now)}`;
  const age = connectedFor(kiosk.since, now);
  const since = age === "now" ? "connected just now" : `connected ${age}`;
  return kiosk.address && displayTitle(entry) !== `Kiosk · ${kiosk.address}` ? `Live · ${kiosk.address} · ${since}` : `Live · ${since}`;
}

/** The screen a named display's link pins, when it beats the one chosen here: the choice and what it shows then differ. */
export function pinnedScreen(display: ControlDisplay | undefined, profiles: readonly MonitorProfile[]): MonitorProfile | undefined {
  const pin = linkPin(display);
  return pin === undefined ? undefined : profiles.find((p) => p.id === pin);
}

/** The page-cycling button's state for the screen a card shows: what it says and what a click does. */
export function rotationButton(
  screen: Pick<MonitorProfile, "name" | "pages" | "rotate">,
  entry: Pick<ControlProfile, "rotating"> | undefined,
): { label: string; running: boolean; toggles: boolean; title: string } {
  if (screen.pages.length < 2) return { label: "One page", running: false, toggles: false, title: `${screen.name} has one page: there is nothing to cycle.` };
  const running = entry?.rotating ?? screen.rotate?.enabled === true;
  // A screen with no saved rotation has no interval to state: say it cycles, not how often.
  const seconds = screen.rotate?.seconds;
  const every = seconds === undefined ? undefined : cycleLabel(seconds);
  return {
    label: running ? `Cycling pages: ${every ? `every ${every}` : "on"}` : "Cycling pages: paused",
    running,
    toggles: true,
    title: running
      ? `${screen.name} cycles its pages${every ? ` every ${every}` : ""} on every display. Pause it for now.`
      : `${screen.name} is not cycling its pages on any display. Start it for now.`,
  };
}

/** A display a screen can be shown on: a named display, or a touch panel (its kiosk is the display named after it). */
export interface ShowOnTarget {
  /** The display's name. */
  name: string;
  /** "hall", or "Panel 1 (touch)". */
  label: string;
  touch: boolean;
  /** The server has seen it, so it can be given a screen; a panel whose kiosk never opened can't be yet. */
  known: boolean;
  /** The screen chosen for it ("follow" or an id), when known. */
  screen?: string;
}

/** Where a screen can be shown: every named display, then each touch panel whose kiosk hasn't opened yet. */
export function showOnTargets(displays: readonly ControlDisplay[], panels: readonly TouchPanelEntry[]): ShowOnTarget[] {
  const named = displays.map((d): ShowOnTarget => {
    const panel = panelOfDisplay(panels, d.name);
    return { name: d.name, label: panel ? `${panel.name} (touch)` : d.name, touch: !!panel, known: true, screen: d.screen };
  });
  const unseen = panels.flatMap((p): ShowOnTarget[] => {
    const name = panelDisplayName(p.id);
    return name && !displayOfPanel(displays, p) ? [{ name, label: `${p.name} (touch)`, touch: true, known: false }] : [];
  });
  return [...named, ...unseen];
}

/** What a screen's card says about where it shows: the chip's words and the display card it leads to, or null. */
export function screenPlaces(screenId: string, entries: readonly DisplayEntry[]): { text: string; key: string } | null {
  const on = entries.filter((e) => e.online && e.kiosk?.profile === screenId);
  if (on.length === 0) return null;
  const text = on.length === 1 && on[0].panel ? `On ${on[0].panel.name} (touch)` : `On ${displaysText(on.length)}`;
  return { text, key: on[0].key };
}

/** A screen no display shows or is set to: its row hints where to put it. */
export const onNoDisplay = (screenId: string, entries: readonly DisplayEntry[]): boolean =>
  !entries.some((e) => e.screen?.id === screenId || e.display?.screen === screenId);

/** How many displays the kiosks are: a named display with two browser tabs open is one. */
export const distinctDisplays = (kiosks: readonly Pick<ControlKiosk, "id" | "display">[]): number => new Set(kiosks.map((k) => k.display ?? k.id)).size;

/** `1 display` / `3 displays`. */
export const displaysText = (n: number): string => `${n} ${n === 1 ? "display" : "displays"}`;

/** Placements across every page: the "widgets" of a card's size line. */
export const widgetCount = (p: Pick<MonitorProfile, "pages">): number => p.pages.reduce((n, pg) => n + pg.placements.length, 0);

/** A card's size line: `1600 × 900 · 1 page · 7 widgets`. */
export function screenSummary(p: Pick<MonitorProfile, "width" | "height" | "pages">): string {
  const pages = `${p.pages.length} ${p.pages.length === 1 ? "page" : "pages"}`;
  const widgets = widgetCount(p);
  return `${p.width} × ${p.height} · ${pages} · ${widgets} ${widgets === 1 ? "widget" : "widgets"}`;
}

/** The header's count line: `4 screens · 2 displays live`. */
export function screensCountLine(screens: number, live: number): string {
  const text = `${screens} ${screens === 1 ? "screen" : "screens"}`;
  return live > 0 ? `${text} · ${displaysText(live)} live` : text;
}
