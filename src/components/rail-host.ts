import { createContext, type CSSProperties, type ReactNode } from "react";
import type { ActiveAlert } from "@/lib/alerts";
import type { MonitorProfile, Placement } from "@/lib/layout";
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
  /**
   * The profile picker (P4): unset where the chip cannot switch the profile (the studio, a preview, a kiosk whose link or
   * display pins its profile), and the chip is then a label.
   */
  profiles?: RailProfiles;
}

/** What the profile picker shows and does: the control channel's override and auto-switch (`control_auto.rs`). */
export interface RailProfiles {
  open: boolean;
  close: () => void;
  all: readonly MonitorProfile[];
  /** The profile the panel shows when nothing overrides it ("Default"). */
  defaultId: string;
  /** The program in front, when the server reads one. */
  front?: string;
  /** Auto-switch is paused (the lock). */
  paused: boolean;
  /** Show a profile (the override). */
  pick: (id: string) => void;
  /** Turn auto-switch on or off; off with `lock` locks the panel to that profile. */
  auto: (on: boolean, lock?: string) => void;
}

export const RailHostContext = createContext<RailHost | null>(null);

/** The pinned item a rail is drawn in: its slots (unset: one per page) and its edge (the active page's marker sits on the outer one). */
export interface RailItem {
  slots?: readonly RailSlot[];
  edge: PinnedEdge;
}

export const RailItemContext = createContext<RailItem | null>(null);
