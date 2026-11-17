import { ArrowDown, ArrowUp, Check, Copy, Hand, Link, Monitor, Pencil, PenLine, Rocket, Settings2, Share, Trash2 } from "lucide-react";
import type { CardAction } from "./card-actions";
import type { ShowOnTarget } from "./display-model";

interface ScreenActionsProps {
  onOpen: () => void;
  /** The drawer with size and fit, rotation, performance and the pages. */
  onSettings: () => void;
  /** Any screen but the last one can be deleted. */
  canDelete: boolean;
  canMoveEarlier: boolean;
  canMoveLater: boolean;
  onRename: () => void;
  onDuplicate: () => void;
  onAlwaysOpen: () => void;
  /** Move in the list by this many places (the "Your order" sort). */
  onMove: (by: number) => void;
  onCopyLink: () => void;
  onExport: () => void;
  onDelete: () => void;
  /** "Show on ▸": a row per named display, touch panels included (`showOnRows`). */
  showOn: readonly CardAction[];
  /** "Use on touch panel ▸": a row per touch panel; none outside the desktop app or without panels. */
  touchPanels: readonly CardAction[];
}

/** The screen card's actions, for its ⋯ menu and its right-click menu. */
export function screenActions(p: ScreenActionsProps): CardAction[] {
  return [
    { id: "open", label: "Open", icon: Pencil, run: p.onOpen },
    { id: "settings", label: "Screen settings…", icon: Settings2, run: p.onSettings },
    {
      id: "show-on",
      label: "Show on",
      icon: Monitor,
      run: () => {},
      submenu: p.showOn.length > 0 ? p.showOn : [{ id: "none", label: "No named display yet", icon: Monitor, run: () => {}, disabled: true, title: "Open a kiosk link with a display name first (Add a display)." }],
    },
    ...(p.touchPanels.length > 0 ? [{ id: "touch-panel", label: "Use on touch panel", icon: Hand, run: () => {}, submenu: p.touchPanels }] : []),
    { id: "rename", label: "Rename", icon: PenLine, run: p.onRename, focusesField: true },
    { id: "duplicate", label: "Duplicate", icon: Copy, run: p.onDuplicate },
    { id: "always-open", label: "Always open this one", icon: Rocket, run: p.onAlwaysOpen },
    { id: "earlier", label: "Move earlier", icon: ArrowUp, run: () => p.onMove(-1), disabled: !p.canMoveEarlier },
    { id: "later", label: "Move later", icon: ArrowDown, run: () => p.onMove(1), disabled: !p.canMoveLater },
    { id: "copy-link", label: "Copy kiosk link", icon: Link, run: p.onCopyLink },
    { id: "export", label: "Export screen", icon: Share, run: p.onExport },
    { id: "delete", label: "Delete", icon: Trash2, run: p.onDelete, disabled: !p.canDelete, danger: true },
  ];
}

/** A panel whose kiosk never opened can't be given a screen yet: the server learns a display when its kiosk connects. */
const UNSEEN = "Its kiosk hasn't opened yet. Show its page in InfoPanel first (Set up touch on its display card).";

/**
 * The rows of "Show on ▸" and "Use on touch panel ▸" for one screen: each sets the display's screen on the control
 * channel (`show`), the same choice its display card's Shows makes. The display already set to it has a check.
 */
export function showOnRows(targets: readonly ShowOnTarget[], screenId: string, show: (name: string) => void): { showOn: CardAction[]; touchPanels: CardAction[] } {
  const row = (t: ShowOnTarget): CardAction => ({
    id: `show-on:${t.name}`,
    label: t.label,
    icon: t.screen === screenId ? Check : t.touch ? Hand : Monitor,
    run: () => show(t.name),
    disabled: !t.known,
    title: t.known ? undefined : UNSEEN,
  });
  return { showOn: targets.map(row), touchPanels: targets.filter((t) => t.touch).map(row) };
}
