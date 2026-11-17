/**
 * Where the pinned layer's moves land on a page (config v21): the free spot a pinned item goes back to, and the one a page
 * widget under a grid pin moves to. Loaded when one is chosen (`use-pinned-actions.ts`), with the pinned editor's helpers,
 * not with the studio.
 */
import type { MonitorProfile, Placement } from "@/lib/layout";
import { clampCells, isGridPin, type PinnedItem } from "@/lib/pinned";
import { autoPlace } from "../add-place";
import { moduleDropSize } from "../drop-ghost";
import { moduleMinSize } from "../studio-modules";
import { pinnedTaken, zoneFits, type ZoneRect } from "../zone-geometry";

/** The cells taken on `pageId` but by the grid pin or page widget named in `except`: its widgets and the grid pins shown there. */
function takenBut(stored: MonitorProfile, pageId: string, except: { pin?: string; zone?: string }): Placement[] {
  const page = stored.pages.find((p) => p.id === pageId);
  if (!page) return [];
  const pinned = stored.pinned && { items: stored.pinned.items.filter((it) => it.id !== except.pin) };
  return [...page.placements.filter((z) => z.id !== except.zone), ...pinnedTaken({ ...stored, pinned, pageId, hidePinned: page.hidePinned })];
}

/**
 * Where a pinned item goes back on `pageId`: a grid pin on its own cells when they are free there, else (and an edge item)
 * the first free spot at its size, or its widget's default, down to its widget's least; null when the page has no room.
 */
export function spotBack(stored: MonitorProfile, pageId: string, item: PinnedItem): ZoneRect | null {
  const { module, settings } = item.placement;
  const taken = takenBut(stored, pageId, { pin: item.id });
  const own = isGridPin(item) ? clampCells(item.at, stored.cols, stored.rows) : undefined;
  const at = own && { col: own.colStart, row: own.rowStart, cols: own.colSpan, rows: own.rowSpan };
  if (at && zoneFits(at, taken, stored.cols, stored.rows)) return at;
  return autoPlace(stored, taken, at ? { cols: at.cols, rows: at.rows } : moduleDropSize(module, stored, settings), moduleMinSize(module, settings));
}

/** A conflict's Move: the first free spot on its page for the widget under a grid pin, at its size or down to its least. */
export function conflictSpot(stored: MonitorProfile, pageId: string, zone: Placement): ZoneRect | null {
  return autoPlace(stored, takenBut(stored, pageId, { zone: zone.id }), { cols: zone.colSpan, rows: zone.rowSpan }, moduleMinSize(zone.module, zone.settings));
}
