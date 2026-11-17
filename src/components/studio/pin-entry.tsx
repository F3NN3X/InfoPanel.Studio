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

/**
 * The page widget menu's Pin here (config v21): the selected widgets pinned in place, each keeping its cells on every
 * page; disabled, with the first reason as its title, when one of them can't be pinned (or is placed freely in px).
 */
export function pinHereEntry(placements: readonly Placement[], pinHere: (placementIds: string[]) => void): ContextMenuEntry {
  const why = placements.map((p) => pinBlocked(p) ?? (p.px ? "A part placed freely can't be pinned in place" : null)).find((w) => w !== null) ?? null;
  return {
    id: "pin-here",
    label: "Pin here",
    icon: <Pin />,
    disabled: why !== null,
    title: why ?? undefined,
    onSelect: () => pinHere(placements.map((p) => p.id)),
  };
}

/** Pin here, then Pin to edge for a selection of one: the layer menu's pin rows for the selected page placements. */
export function pinEntries(placements: readonly Placement[], pin: (placementId: string, edge: PinnedEdge) => void, pinHere: (placementIds: string[]) => void): ContextMenuEntry[] {
  return [pinHereEntry(placements, pinHere), ...(placements.length === 1 ? [pinToEdgeEntry(placements[0], pin)] : [])];
}
