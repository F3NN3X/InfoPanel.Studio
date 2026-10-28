import { lazy, Suspense, type CSSProperties, type ReactNode } from "react";
import { createPortal } from "react-dom";
import type { Appearance } from "@/lib/style-resolve";
import { cn } from "@/lib/utils";
import { sizeText } from "./add-catalog";
import { WidgetStage } from "./add-preview";
import type { AddTile, TileStatus } from "./add-tiles";

/** The Add details card (Edit v3 SPEC §9.5): a tile's live render, name and category, description, size and export status. */

/** The Export check's faces for the tiles and the card, loaded on a screen made for InfoPanel (`infopanel/edit/add-status.tsx`). */
export interface AddStatusKit {
  of: (tile: AddTile) => TileStatus | undefined;
  Icon: (props: { status: TileStatus; className?: string }) => ReactNode;
  /** The pill's words: as is, approximated, becomes a picture, left out. */
  word: Record<TileStatus, string>;
  /** Each status's text colour class. */
  text: Record<TileStatus, string>;
  /** The toast after adding the tile's part (SPEC §9.6): `{Name} added. On InfoPanel export it …`. */
  added: (tile: AddTile) => string;
}

/** An item's or element's render: the canvas renderer, loaded with the first card that shows one. */
const AddItemStage = lazy(() => import("@/components/infopanel/edit/add-item-stage"));

export const CARD_WIDTH = 360;
/** The card height the bottom clamp assumes. */
const CARD_HEIGHT = 330;
/** The status bar under the window's content. */
const BOTTOM = 24;

/** The card's top for a tile row at `rowTop` (viewport px): 4 px above it, kept inside the window. */
export function cardTop(rowTop: number, windowHeight: number): number {
  return Math.max(8, Math.min(rowTop - 4, windowHeight - BOTTOM - CARD_HEIGHT));
}

/** The category line: `{Category} · Studio widget`, `InfoPanel item · {Group}` or `Element`. */
export function cardCategory(tile: AddTile): string {
  if (tile.kind === "widget") return `${tile.category} · Studio widget`;
  return tile.kind === "item" ? `InfoPanel item · ${tile.category}` : "Element";
}

/** The description with its kind's sentence. */
export function cardDescription(tile: AddTile): string {
  return tile.kind === "widget"
    ? `${tile.description}. Always sits on the grid; uses your theme, colors and fonts.`
    : `${tile.description}. Snaps to cells; hold Alt to place it freely, even on top of widgets.`;
}

/** The size chip and its note: a widget's default size, else `any size`. */
export function cardSize(tile: AddTile): { chip: string; note: string } {
  const w = tile.widget;
  if (w) return { chip: sizeText(w.w, w.h), note: w.mw === 1 && w.mh === 1 ? "Adapts down to 1×1" : `Needs at least ${sizeText(w.mw, w.mh)}` };
  return { chip: "any size", note: tile.kind === "item" ? "InfoPanel item" : "Studio element" };
}

interface TileCardProps {
  tile: AddTile;
  /** Viewport px: 8 px right of the left panel, and the clamped top. */
  left: number;
  top: number;
  status?: AddStatusKit;
  appearance?: Appearance;
  pageStyle?: CSSProperties;
}

export function TileCard({ tile, left, top, status, appearance, pageStyle }: TileCardProps) {
  const s = status?.of(tile);
  const size = cardSize(tile);
  return createPortal(
    <div
      data-testid="add-preview"
      aria-hidden
      className="add-preview-in pointer-events-none fixed z-[60] flex flex-col overflow-hidden rounded-[12px] border border-[#2a2a31] bg-[#141418] font-ui shadow-[0_20px_50px_#000c]"
      style={{ left, top, width: CARD_WIDTH }}
    >
      <div
        className="flex h-[150px] items-center justify-center overflow-hidden border-b border-[#24242a]"
        style={{ background: "radial-gradient(ellipse at 50% 40%, #1d1d24, #0c0c0e)" }}
      >
        {tile.widget ? (
          <WidgetStage item={tile.widget} appearance={appearance} pageStyle={pageStyle} stage={{ w: 330, h: 130 }} />
        ) : (
          tile.data && (
            <Suspense fallback={null}>
              <AddItemStage data={tile.data} />
            </Suspense>
          )
        )}
      </div>
      <div className="flex flex-col gap-2 px-3.5 py-3">
        <span className="flex items-baseline gap-2">
          <span className="truncate text-[14px] font-semibold text-ui-1">{tile.name}</span>
          <span className="shrink-0 text-[11px] text-ui-4">{cardCategory(tile)}</span>
        </span>
        <p className="text-pretty text-[12px] leading-[1.5] text-ui-2">{cardDescription(tile)}</p>
        <span className="flex items-center gap-2 text-[11px] text-ui-3">
          <span className="rounded-[4px] bg-[#1f1f25] px-1.5 py-px font-ui-mono text-ui-1">{size.chip}</span>
          {size.note}
        </span>
        {status && s && (
          <span className={cn("flex items-center gap-1.5 text-[11px]", status.text[s])}>
            <status.Icon status={s} className="h-3.5 w-3.5" />
            On InfoPanel: {status.word[s]}
          </span>
        )}
        <span className="border-t border-[#24242a] pt-2 text-[11px] text-ui-5">Click to add · drag to place</span>
      </div>
    </div>,
    document.body,
  );
}
