import { ArrowDownToLine, ArrowLeftToLine, ArrowRightToLine, ArrowUpToLine, Pin, Trash2, Undo2 } from "lucide-react";
import type { ContextMenuEntry } from "@/components/ui/context-menu";
import type { PinnedEdge, PinnedItem } from "@/lib/pinned";
import { pinBlocked, unpinBlocked } from "@/lib/pinned-edit";
import type { Placement } from "@/lib/layout";

const EDGES: readonly [PinnedEdge, string, typeof Pin][] = [
  ["top", "Top", ArrowUpToLine],
  ["bottom", "Bottom", ArrowDownToLine],
  ["left", "Left", ArrowLeftToLine],
  ["right", "Right", ArrowRightToLine],
];

/** A pinned item's right-click menu: back to the page, and Unpin (a list row and the item on the canvas). */
export function pinnedItemMenu(item: PinnedItem, run: { moveToPage: (id: string) => void; remove: (id: string) => void }): ContextMenuEntry[] {
  const why = unpinBlocked(item);
  return [
    { id: "move-to-page", label: "Move to page", icon: <Undo2 />, disabled: why !== null, title: why ?? undefined, onSelect: () => run.moveToPage(item.id) },
    "separator",
    { id: "unpin", label: "Unpin", icon: <Trash2 />, hint: "Del", danger: true, onSelect: () => run.remove(item.id) },
  ];
}

/** The page widget menu's Pin to edge submenu; disabled, with the reason as its title, for a widget that can't be pinned. */
export function pinToEdgeEntry(placement: Placement, pin: (placementId: string, edge: PinnedEdge) => void): ContextMenuEntry {
  const why = pinBlocked(placement);
  return {
    id: "pin-to-edge",
    label: "Pin to edge",
    icon: <Pin />,
    disabled: why !== null,
    title: why ?? undefined,
    submenu: EDGES.map(([edge, label, Icon]): ContextMenuEntry => ({ id: `pin:${edge}`, label, icon: <Icon />, onSelect: () => pin(placement.id, edge) })),
  };
}
