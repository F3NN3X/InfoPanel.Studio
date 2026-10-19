/**
 * Dragging a gauge card to the studio canvas (spec §8, #47 G23): the same `LIBRARY_MIME` payload as a
 * Library card. A preset or a profile gauge is no library item, so it travels as a transient one
 * (`cfg-` id: no copy is counted on it) carrying the gauge's data; the canvas's drop handling then
 * places it as it places a library gauge.
 */
import { libraryDataOf, type GaugeEntry } from "@/lib/gauge-studio/model";
import type { LibraryItem } from "@/lib/library";
import { setActiveLibraryDrag, setLibraryDrag } from "@/lib/my-library/drag";

/** Whether the card has anything to drop: a spec or frames the asset store holds. */
export const draggableGauge = (e: GaugeEntry): boolean => e.gauge !== null || !!e.files?.length;

/** The entry as the library item a drop reads (`item` when it is one already). */
export function gaugeDragItem(e: GaugeEntry, item?: LibraryItem): LibraryItem {
  if (item) return item;
  const now = new Date(0).toISOString();
  return { id: `cfg-gauge:${e.key}`, kind: "gauge", name: e.name, createdAt: now, updatedAt: now, files: [], meta: {}, copies: [], data: libraryDataOf(e, e.gauge, e.files) };
}

export function startGaugeDrag(dt: DataTransfer, e: GaugeEntry, item?: LibraryItem): void {
  const drag = gaugeDragItem(e, item);
  setLibraryDrag(dt, { libraryItemId: drag.id, kind: "gauge" });
  setActiveLibraryDrag(drag);
}
