import type { CSSProperties } from "react";
import { PlacementFrame } from "@/components/studio/placement-frame";
import { LivePlacement } from "@/components/studio/placement-content";
import type { ProfileView } from "@/lib/layout";
import type { Appearance } from "@/lib/style-resolve";
import { pinnedBox, pinnedPlacement, type PinnedItem } from "@/lib/pinned";
import { RailItemContext } from "./rail-host";

/** The pinned items on the left or top edge come before the page in the reading and focus order, the rest after it. */
export const leadsPage = (it: PinnedItem): boolean => it.mode === "room" && (it.edge === "left" || it.edge === "top");

interface PinnedItemsProps {
  /** Every pinned item on this page (`pinnedOnPage`): their boxes stack against each other. */
  all: readonly PinnedItem[];
  /** The ones to draw here. */
  items: readonly PinnedItem[];
  profile: ProfileView;
  appearance: Appearance;
  /** The page's padding, px: a top or bottom item keeps it off the side items, so it lines up with the zones. */
  padding: number;
}

/**
 * Pinned items (config v20) on their edges, fixed to the screen: outside the page grid, so a page change or a swipe
 * leaves them still, and over it (`z-index: 1`), so a page being dragged slides under them. Each draws its widget as a
 * kiosk zone does, in a box of the item's size; a rail reads its slots and edge from `RailItemContext`.
 */
export function PinnedItems({ all, items, profile, appearance, padding }: PinnedItemsProps) {
  return items.map((it) => {
    const zone = pinnedPlacement(it);
    return (
      <div
        key={it.id}
        // a grid of one cell, the zone's box; no `grid` class, which marks the page's grid (`.kiosk > .grid`)
        className="fixed"
        style={{ ...(pinnedBox(all, it, padding) as CSSProperties), zIndex: 1, display: "grid", gridTemplateColumns: "minmax(0, 1fr)", gridTemplateRows: "minmax(0, 1fr)" }}
        data-pinned-item={it.id}
        data-pinned-mode={it.mode}
      >
        <RailItemContext.Provider value={{ slots: it.rail, edge: it.edge }}>
          <LivePlacement placement={zone} appearance={appearance}>
            {({ content, hasData, title, scope }) => (
              <PlacementFrame placement={zone} profile={profile} studio={false} hasData={hasData} title={title} scope={scope}>
                {content}
              </PlacementFrame>
            )}
          </LivePlacement>
        </RailItemContext.Provider>
      </div>
    );
  });
}
