import { useMemo, type CSSProperties } from "react";
import { PlacementFrame } from "@/components/studio/placement-frame";
import { LivePlacement } from "@/components/studio/placement-content";
import { RailHostContext, RailItemContext, type RailHost } from "@/components/rail-host";
import type { MonitorProfile, ProfileView } from "@/lib/layout";
import type { Appearance } from "@/lib/style-resolve";
import { pinnedBox, pinnedPlacement, type PinnedItem } from "@/lib/pinned";
import { cn } from "@/lib/utils";

interface PinnedCanvasProps {
  /** The stored profile: its pages for the rail, its place for the chip. */
  stored: MonitorProfile;
  profile: ProfileView;
  /** The profile's place in the list (the chip's colour). */
  index: number;
  /** The page on the canvas. */
  pageId: string;
  /** The pinned items drawn on this page (`pinnedOnPage`). */
  items: readonly PinnedItem[];
  appearance: Appearance;
  /** The page's padding, px (a top or bottom item keeps it off the side items, as on the kiosk). */
  padding: number;
  /** Pinned: the items take clicks and show their selection; Page: a click on one shows the pinned layer with it selected. */
  editing: boolean;
  selectedId: string | null;
  onSelect: (id: string) => void;
}

const NO_ALERTS: RailHost["alerts"] = [];

/**
 * The pinned layer on Edit's canvas (P3): each item in its box as the kiosk draws it (`pinnedBox`, inside the page),
 * with the screen's real pages in a rail. Nothing on it runs: a press selects the item, so the rail's buttons never switch
 * pages in the studio. Selected, it wears the studio's selection ring.
 */
export function PinnedCanvas({ stored, profile, index, pageId, items, appearance, padding, editing, selectedId, onSelect }: PinnedCanvasProps) {
  const host = useMemo<RailHost>(
    () => ({
      pages: stored.pages,
      current: pageId,
      profile: { id: stored.id, name: stored.name, index },
      lock: stored.rotate?.enabled === true && stored.pages.length > 1 ? "auto" : null,
      alerts: NO_ALERTS,
      run: () => {},
      zone: (placement, style) => (
        <LivePlacement placement={placement} appearance={appearance} studio>
          {({ content, scope }) => <div style={{ ...style, ...scope }}>{content}</div>}
        </LivePlacement>
      ),
    }),
    [stored, pageId, index, appearance]
  );
  return (
    <RailHostContext.Provider value={host}>
      {items.map((it) => {
        const zone = pinnedPlacement(it);
        const selected = editing && it.id === selectedId;
        return (
          <div
            key={it.id}
            data-pinned-item={it.id}
            className="absolute z-[13]"
            style={{ ...(pinnedBox(items, it, padding) as CSSProperties), display: "grid", gridTemplateColumns: "minmax(0, 1fr)", gridTemplateRows: "minmax(0, 1fr)" }}
          >
            <RailItemContext.Provider value={{ slots: it.rail, edge: it.edge }}>
              <LivePlacement placement={zone} appearance={appearance} studio>
                {({ content, hasData, title, scope }) => (
                  <PlacementFrame placement={zone} profile={profile} studio={false} hasData={hasData} title={title} scope={scope}>
                    {content}
                  </PlacementFrame>
                )}
              </LivePlacement>
            </RailItemContext.Provider>
            {/* over the widget: a press selects the item, the widget's own buttons never get it */}
            <button
              type="button"
              aria-label={`${it.name ?? "Pinned widget"}, pinned ${it.edge}`}
              aria-pressed={editing ? selected : undefined}
              tabIndex={editing ? 0 : -1}
              onClick={(e) => {
                e.stopPropagation();
                onSelect(it.id);
              }}
              className={cn(
                "absolute inset-0 rounded-[3px] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ui-accent",
                selected ? "outline outline-2 outline-ui-accent" : editing ? "hover:outline hover:outline-1 hover:outline-ui-accent" : "cursor-pointer"
              )}
            />
          </div>
        );
      })}
    </RailHostContext.Provider>
  );
}
