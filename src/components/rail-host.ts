import { createContext, type CSSProperties, type ReactNode } from "react";
import type { ActiveAlert } from "@/lib/alerts";
import type { Placement } from "@/lib/layout";
import type { PinnedEdge, RailSlot, TouchAction } from "@/lib/pinned";
import type { RailPage } from "@/lib/rail";

/**
 * What the page rail (`src/widgets/page-rail/`) reads from the screen it is on: the kiosk gives the profile's pages, the
 * page shown, the page lock, the alerts it shows, a way to run a touch action and one to draw a widget in a slot. Kept
 * apart from the widget so the kiosk entry carries the context only, never the rail; the zone renderer comes from the
 * screen for the same reason (the rail's chunk importing it would split it out of the kiosk entry).
 */
export interface RailHost {
  pages: readonly RailPage[];
  /** The page shown. */
  current: string;
  /** The profile chip: its name, and its place among the profiles (its series colour, `chipSeries`). */
  profile: { id: string; name: string; index: number };
  /** The page lock: `auto` while the pages rotate, `locked` while paused; null when the profile has no rotation. */
  lock: "auto" | "locked" | null;
  /** The alerts shown on this kiosk (`visibleAlerts`), for the `alerts` badge. */
  alerts: readonly ActiveAlert[];
  run: (action: TouchAction) => void;
  /** Draws a widget in a slot as a kiosk zone does, in a box of `style`; unset (a preview) leaves the box empty. */
  zone?: (placement: Placement, style: CSSProperties) => ReactNode;
}

export const RailHostContext = createContext<RailHost | null>(null);

/** The pinned item a rail is drawn in: its slots (unset: one per page) and its edge (the active page's marker sits on the outer one). */
export interface RailItem {
  slots?: readonly RailSlot[];
  edge: PinnedEdge;
}

export const RailItemContext = createContext<RailItem | null>(null);
