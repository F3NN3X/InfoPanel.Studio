import { memo } from "react";
import { Monitor } from "lucide-react";
import type { MonitorProfile, ProfilePage } from "@/lib/layout";
import { clampCells, isEdgePin, isGridPin, pinnedBox, pinnedOnPage, pinnedRoom } from "@/lib/pinned";
import { resolveTheme } from "@/lib/theme";
import { cn } from "@/lib/utils";

/**
 * A page drawn as a schematic: its visible placements as rounded boxes on the screen's own background, scaled from the
 * grid's cells into the screen's size and letterboxed at its aspect. Synchronous, so a card has an identity before any
 * screenshot exists (Screens' cards and their page strip). A page with nothing visible keeps the monitor glyph.
 * `pinned`: the profile's pinned layer drawn too, as strips on their edges, with the page in the room they leave, and the
 * widgets pinned in place on their cells, over the page's.
 */
export const PageMap = memo(function PageMap({ profile, page, className, pinned }: { profile: MonitorProfile; page: ProfilePage | undefined; className?: string; pinned?: boolean }) {
  const placements = page?.placements.filter((z) => z.visible) ?? [];
  const items = pinned && page ? pinnedOnPage(profile.pinned, page.id, page.hidePinned) : [];
  const room = pinnedRoom(items);
  const cw = (profile.width - room.left - room.right) / profile.cols;
  const ch = (profile.height - room.top - room.bottom) / profile.rows;
  return (
    <div aria-hidden className={cn("relative grid h-full w-full place-items-center", className)} style={{ background: `hsl(${resolveTheme(profile).tokens.background})` }}>
      {placements.length > 0 || items.length > 0 ? (
        <svg viewBox={`0 0 ${profile.width} ${profile.height}`} preserveAspectRatio="xMidYMid meet" className="h-full w-full">
          {placements.map((z) => (
            <rect
              key={z.id}
              x={room.left + (z.colStart - 1) * cw + 2}
              y={room.top + (z.rowStart - 1) * ch + 2}
              width={Math.max(z.colSpan * cw - 4, 1)}
              height={Math.max(z.rowSpan * ch - 4, 1)}
              rx={Math.min(cw, ch) * 0.08}
              className="fill-ui-active stroke-ui-edge"
              strokeWidth={1}
              vectorEffect="non-scaling-stroke"
            />
          ))}
          {items.filter(isGridPin).map((it) => {
            const at = clampCells(it.at, profile.cols, profile.rows);
            return (
              <rect
                key={it.id}
                data-pinned-cells=""
                x={room.left + (at.colStart - 1) * cw + 2}
                y={room.top + (at.rowStart - 1) * ch + 2}
                width={Math.max(at.colSpan * cw - 4, 1)}
                height={Math.max(at.rowSpan * ch - 4, 1)}
                rx={Math.min(cw, ch) * 0.08}
                className="fill-ui-control"
              />
            );
          })}
          {items.filter(isEdgePin).map((it) => {
            const b = pinnedBox(items, it, 0);
            const w = b.width ?? profile.width - (b.left ?? 0) - (b.right ?? 0);
            const h = b.height ?? profile.height - (b.top ?? 0) - (b.bottom ?? 0);
            const x = b.left ?? profile.width - (b.right ?? 0) - w;
            const y = b.top ?? profile.height - (b.bottom ?? 0) - h;
            return <rect key={it.id} data-pinned-strip="" x={x} y={y} width={Math.max(w, 1)} height={Math.max(h, 1)} className="fill-ui-control" />;
          })}
        </svg>
      ) : (
        <Monitor className="h-6 w-6 text-ui-1 opacity-20" strokeWidth={1.5} />
      )}
    </div>
  );
});
