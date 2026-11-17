import { Pin } from "lucide-react";
import type { ContextMenuEntry } from "@/components/ui/context-menu";
import type { Placement } from "@/lib/layout";
import { pinBlocked } from "@/lib/pin-blocked";
import type { PinnedEdge } from "@/lib/pinned";

const EDGES: readonly [PinnedEdge, string][] = [
  ["top", "Top"],
  ["bottom", "Bottom"],
  ["left", "Left"],
  ["right", "Right"],
];

/** The page widget menu's Pin to edge submenu; disabled, with the reason as its title, for a widget that can't be pinned. */
export function pinToEdgeEntry(placement: Placement, pin: (placementId: string, edge: PinnedEdge) => void): ContextMenuEntry {
  const why = pinBlocked(placement);
  return {
    id: "pin-to-edge",
    label: "Pin to edge",
    icon: <Pin />,
    disabled: why !== null,
    title: why ?? undefined,
    submenu: EDGES.map(([edge, label]): ContextMenuEntry => ({ id: `pin:${edge}`, label, onSelect: () => pin(placement.id, edge) })),
  };
}
