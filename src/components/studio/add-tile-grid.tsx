import type { DragEvent } from "react";
import { cn } from "@/lib/utils";
import type { AddStatusKit } from "./add-tile-card";
import { PALETTE_DRAG_MIME, tileSize, type AddTile, type TileSection } from "./add-tiles";
import { DND_MIME, DND_MIME_PANEL, DND_MIME_SETTINGS } from "./studio-modules";

/**
 * The Add list as a tile grid (Edit v3 SPEC §9.2, §9.4): section headers with counts, category sub-headers, and three
 * tiles a row at 300 px (icon over name, a widget's size top-left, its export status top-right). The panel owns the
 * highlight, the keys and the details card; this draws the tiles and reports the pointer.
 */

/** The DOM id of a tile (the search box's active descendant). */
export const tileId = (tile: AddTile): string => `add-tile-${tile.key.replace(/[^A-Za-z0-9_-]/g, "_")}`;

/** What a tile's drag carries: a widget's id (and its view's settings), or an item's or element's palette id. */
export function startTileDrag(e: DragEvent, tile: AddTile) {
  const w = tile.widget;
  if (w) {
    e.dataTransfer.setData(w.drop.kind === "panel" ? DND_MIME_PANEL : DND_MIME, w.drop.id);
    if (w.drop.settings) e.dataTransfer.setData(DND_MIME_SETTINGS, JSON.stringify(w.drop.settings));
  } else if (tile.data) e.dataTransfer.setData(PALETTE_DRAG_MIME, tile.data);
  e.dataTransfer.effectAllowed = "copy";
}

interface AddTileGridProps {
  sections: readonly TileSection[];
  /** The highlighted tile (hover or keys). */
  highlighted?: string;
  /** The tile just added: highlighted for 1.5 s. */
  justAdded?: string;
  /** Tiles that can't fill the selected blank zone (dimmed). */
  dimmed?: (tile: AddTile) => boolean;
  status?: AddStatusKit | null;
  onAdd: (tile: AddTile) => void;
  onHover: (tile: AddTile, el: HTMLElement) => void;
  onDragStart: () => void;
}

export function AddTileGrid({ sections, highlighted, justAdded, dimmed, status, onAdd, onHover, onDragStart }: AddTileGridProps) {
  return (
    <>
      {sections.map((s) => (
        <section key={s.id} aria-label={s.title ?? "Matches"}>
          {s.title && (
            <div className="flex h-7 items-end px-1 pb-[5px] font-ui-mono text-[10.5px] tracking-[0.06em] text-ui-3">
              {s.title}
              {s.count !== undefined && <span className="ml-[0.5em] text-ui-hint">{s.count}</span>}
            </div>
          )}
          {s.groups.map((g, gi) => (
            <div key={`${g.sub ?? ""}:${gi}`}>
              {g.sub && <div className="flex h-[22px] items-center px-1 text-[10px] text-ui-4">{g.sub}</div>}
              <div data-add-grid="" className="grid gap-1 pb-1" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(88px, 1fr))" }}>
                {g.tiles.map((tile) => (
                  <Tile
                    key={tile.key}
                    tile={tile}
                    highlighted={highlighted === tile.key}
                    added={justAdded === tile.key}
                    dim={dimmed?.(tile) ?? false}
                    status={status}
                    onAdd={() => onAdd(tile)}
                    onHover={(el) => onHover(tile, el)}
                    onDragStart={(e) => {
                      startTileDrag(e, tile);
                      onDragStart();
                    }}
                  />
                ))}
              </div>
            </div>
          ))}
        </section>
      ))}
    </>
  );
}

interface TileProps {
  tile: AddTile;
  highlighted: boolean;
  added: boolean;
  dim: boolean;
  status?: AddStatusKit | null;
  onAdd: () => void;
  onHover: (el: HTMLElement) => void;
  onDragStart: (e: DragEvent) => void;
}

function Tile({ tile, highlighted, added, dim, status, onAdd, onHover, onDragStart }: TileProps) {
  const Icon = tile.icon;
  const size = tileSize(tile);
  const s = status?.of(tile);
  return (
    <div
      id={tileId(tile)}
      role="option"
      aria-selected={highlighted}
      aria-label={tile.name}
      data-testid="add-tile"
      data-kind={tile.kind}
      data-status={s}
      draggable
      onDragStart={onDragStart}
      onClick={onAdd}
      onMouseEnter={(e) => onHover(e.currentTarget)}
      className={cn(
        "relative flex h-16 cursor-pointer select-none flex-col items-center justify-center gap-[5px] rounded-[8px] border px-1",
        added ? "border-ui-accent/60 bg-ui-accent/14" : highlighted ? "border-[#3a3a44] bg-[#1c1c22]" : "border-[#22222a] bg-[#131317] hover:border-[#3a3a44] hover:bg-[#1c1c22]",
        dim && "opacity-40",
      )}
    >
      <Icon className={cn("h-5 w-5 shrink-0", tile.kind === "widget" ? "text-ui-accent" : "text-ui-3")} strokeWidth={1.75} aria-hidden />
      <span className="max-w-full truncate text-[10.5px] text-ui-2">{tile.name}</span>
      {size && <span className="absolute left-[5px] top-1 font-ui-mono text-[8.5px] leading-none text-ui-hint">{size}</span>}
      {status && s && (
        <span className="absolute right-1 top-1 leading-none">
          <status.Icon status={s} className="h-[11px] w-[11px]" />
        </span>
      )}
    </div>
  );
}
