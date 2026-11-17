import { Trash2, Undo2 } from "lucide-react";
import type { ContextMenuEntry } from "@/components/ui/context-menu";
import type { PinnedItem } from "@/lib/pinned";
import { unpinBlocked } from "@/lib/pinned-edit";

/** A pinned item's right-click menu: back to the page, and Unpin (a list row and the item on the canvas). */
export function pinnedItemMenu(item: PinnedItem, run: { moveToPage: (id: string) => void; remove: (id: string) => void }): ContextMenuEntry[] {
  const why = unpinBlocked(item);
  return [
    { id: "move-to-page", label: "Move to page", icon: <Undo2 />, disabled: why !== null, title: why ?? undefined, onSelect: () => run.moveToPage(item.id) },
    "separator",
    { id: "unpin", label: "Unpin", icon: <Trash2 />, hint: "Del", danger: true, onSelect: () => run.remove(item.id) },
  ];
}
