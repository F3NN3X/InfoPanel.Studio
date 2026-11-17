import { Trash2, Undo2 } from "lucide-react";
import type { ContextMenuEntry } from "@/components/ui/context-menu";
import type { PinnedItem } from "@/lib/pinned";
import { unpinBlocked } from "@/lib/pinned-edit";

/**
 * A pinned item's right-click menu (a list row and the item on the canvas): Unpin puts the widget back on the page, Delete
 * removes it. An unpinned widget never vanishes (the owner).
 */
export function pinnedItemMenu(item: PinnedItem, run: { moveToPage: (id: string) => void; remove: (id: string) => void }): ContextMenuEntry[] {
  const why = unpinBlocked(item);
  return [
    { id: "unpin", label: "Unpin", icon: <Undo2 />, disabled: why !== null, title: why ?? undefined, onSelect: () => run.moveToPage(item.id) },
    "separator",
    { id: "delete", label: "Delete", icon: <Trash2 />, hint: "Del", danger: true, onSelect: () => run.remove(item.id) },
  ];
}
