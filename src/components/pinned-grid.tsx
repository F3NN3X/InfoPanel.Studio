import { useLayoutEffect, useState, type CSSProperties, type RefObject } from "react";
import { PlacementFrame } from "@/components/studio/placement-frame";
import { LivePlacement } from "@/components/studio/placement-content";
import type { Placement, ProfileView } from "@/lib/layout";
import { profileGap } from "@/lib/profile-grid";
import type { Appearance } from "@/lib/style-resolve";
import { clampCells, pinnedPlacement, type PinnedGridItem } from "@/lib/pinned";

// Widgets pinned in place (config v21) on the kiosk, and their box for Edit's canvas: a chunk of its own, loaded by a screen
// that has one, so a screen without grid pins carries none of it.

/**
 * A grid pin's box on the page grid (its cells, kept inside the grid) and the widget in it: the box holds a grid of the
 * cells' own tracks and gaps, so the widget sits at the same size and spans as on the page it came from.
 */
export function gridPinCell(it: PinnedGridItem, profile: ProfileView): { box: CSSProperties; zone: Placement } {
  const at = clampCells(it.at, profile.cols, profile.rows);
  return {
    box: {
      gridColumn: `${at.colStart} / span ${at.colSpan}`,
      gridRow: `${at.rowStart} / span ${at.rowSpan}`,
      display: "grid",
      gap: profileGap(profile),
      gridTemplateColumns: `repeat(${at.colSpan}, minmax(0, 1fr))`,
      gridTemplateRows: `repeat(${at.rowSpan}, minmax(0, 1fr))`,
      minWidth: 0,
      minHeight: 0,
    },
    zone: { ...pinnedPlacement(it), colSpan: at.colSpan, rowSpan: at.rowSpan },
  };
}

interface PinnedGridProps {
  /** The grid pins on this page (`pinnedOnPage`, `isGridPin`). */
  items: readonly PinnedGridItem[];
  profile: ProfileView;
  appearance: Appearance;
  /** The page grid, whose box the items' grid covers, and the page (`<main>`, positioned) it sits in. */
  grid: RefObject<HTMLElement | null>;
  main: RefObject<HTMLElement | null>;
  /** The page grid's gap and tracks: the items sit on its cells. */
  tracks: CSSProperties;
}

type Box = { left: number; top: number; width: number; height: number };

/**
 * Widgets pinned in place (config v21) on their cells: a grid of the page grid's tracks over the page grid's box, outside
 * the page grid (which is keyed by page), so a page change or a swipe leaves them mounted and still; and over it
 * (`z-index: 1`), so a page widget still on their cells draws under them. Only the items take the pointer.
 */
export default function PinnedGrid({ items, profile, appearance, grid, main, tracks }: PinnedGridProps) {
  // the page grid's box in the page, measured, so it holds with a header, the Island's reserve, the edge items' room and a
  // page that scrolls; again when the page (a new grid element) or a size changes
  const [box, setBox] = useState<Box | null>(null);
  useLayoutEffect(() => {
    const el = grid.current;
    if (!el) return;
    const measure = () => {
      const next = { left: el.offsetLeft, top: el.offsetTop, width: el.offsetWidth, height: el.offsetHeight };
      setBox((was) => (was && was.left === next.left && was.top === next.top && was.width === next.width && was.height === next.height ? was : next));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    if (main.current) observer.observe(main.current);
    return () => observer.disconnect();
  }, [grid, main, profile.pageId]);
  if (!box) return null;
  return (
    <div data-pinned-grid="" className="pointer-events-none absolute" style={{ ...box, ...tracks, zIndex: 1, display: "grid" }}>
      {items.map((it) => {
        const { box, zone } = gridPinCell(it, profile);
        return (
          <div key={it.id} className="pointer-events-auto" style={box} data-pinned-item={it.id} data-pinned-mode="grid">
            <LivePlacement placement={zone} appearance={appearance}>
              {({ content, hasData, title, scope }) => (
                <PlacementFrame placement={zone} profile={profile} studio={false} hasData={hasData} title={title} scope={scope}>
                  {content}
                </PlacementFrame>
              )}
            </LivePlacement>
          </div>
        );
      })}
    </div>
  );
}
