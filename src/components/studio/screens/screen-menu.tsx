import { ArrowDown, ArrowUp, Copy, Link, Pencil, PenLine, Rocket, Share, Shuffle, Trash2 } from "lucide-react";
import type { CardAction } from "./card-actions";

interface ScreenActionsProps {
  onOpen: () => void;
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
  /** Opens the screen on the canvas and the Convert to InfoPanel profile dialog. */
  onConvert: () => void;
  onDelete: () => void;
}

/** The screen card's actions, for its ⋯ menu and its right-click menu. */
export function screenActions(p: ScreenActionsProps): CardAction[] {
  return [
    { id: "open", label: "Open", icon: Pencil, run: p.onOpen },
    { id: "rename", label: "Rename", icon: PenLine, run: p.onRename, focusesField: true },
    { id: "duplicate", label: "Duplicate", icon: Copy, run: p.onDuplicate },
    { id: "always-open", label: "Always open this one", icon: Rocket, run: p.onAlwaysOpen },
    { id: "earlier", label: "Move earlier", icon: ArrowUp, run: () => p.onMove(-1), disabled: !p.canMoveEarlier },
    { id: "later", label: "Move later", icon: ArrowDown, run: () => p.onMove(1), disabled: !p.canMoveLater },
    { id: "copy-link", label: "Copy kiosk link", icon: Link, run: p.onCopyLink },
    { id: "export", label: "Export screen", icon: Share, run: p.onExport },
    { id: "convert", label: "Convert to InfoPanel profile (experimental)", icon: Shuffle, run: p.onConvert },
    { id: "delete", label: "Delete", icon: Trash2, run: p.onDelete, disabled: !p.canDelete, danger: true },
  ];
}
