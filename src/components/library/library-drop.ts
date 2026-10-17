/**
 * A My library card dropped on the studio canvas (spec §8): an image or SVG becomes an image
 * zone and a saved panel a panel zone (at the drop ghost, sized as drawn), a style applies to the
 * zone under the pointer, a video becomes the page background. An image, SVG or video dropped on
 * an imported canvas zone becomes an Image item in it, at the pointer. Each drop is one undo step
 * and counts a copy on the library item.
 */
import { getLibraryItem, type LibraryItem } from "@/lib/library";
import type { StoredCanvas } from "@/lib/infopanel/import/stored";
import type { UserPanelPreset } from "@/lib/panel-model";
import { setActiveLibraryDrag } from "@/lib/my-library/drag";
import { droppedFileOf, fileUrl, KIND_LABEL, metaOf } from "@/lib/my-library/model";
import { withCanvas } from "@/components/studio/import-actions";
import type { CanvasPoint } from "@/components/studio/drop-ghost";
import type { ZoneRect } from "@/components/studio/zone-geometry";
import { addToProfile, applyStyle, imagePanel, setAsBackground, type StudioBridge } from "./library-actions";

type Size = { cols: number; rows: number };

/** The footprint a card drops with on the page's grid (null: it isn't a zone). */
export function librarySizeOf(item: LibraryItem | undefined, grid: { cols: number; rows: number; width: number; height: number }): Size | null {
  if (!item) return null;
  switch (item.kind) {
    case "image":
    case "svg": {
      const p = imagePanel(item.name, fileUrl(item) ?? "", metaOf(item), grid);
      return { cols: p.colSpan, rows: p.rowSpan };
    }
    case "panel": {
      const data = item.data as UserPanelPreset | undefined;
      return { cols: Math.min(grid.cols, data?.colSpan ?? 2), rows: Math.min(grid.rows, data?.rowSpan ?? 1) };
    }
    // The ghost marks the cell: the style lands on the zone there.
    case "style":
      return { cols: 1, rows: 1 };
    default:
      return null;
  }
}

/** The visible zone covering a grid cell. */
export function zoneAtCell<Z extends { visible: boolean; colStart: number; rowStart: number; colSpan: number; rowSpan: number }>(
  zones: readonly Z[],
  cell: { col: number; row: number },
): Z | undefined {
  return zones.find(
    (z) => z.visible && cell.col >= z.colStart && cell.col < z.colStart + z.colSpan && cell.row >= z.rowStart && cell.row < z.rowStart + z.rowSpan,
  );
}

export async function dropLibraryItem(
  b: StudioBridge,
  drop: { id: string; item?: LibraryItem },
  rect: ZoneRect | null,
  cell: { col: number; row: number } | null,
  inCanvas: CanvasPoint | null = null,
): Promise<void> {
  setActiveLibraryDrag(null);
  const item = drop.item ?? (await getLibraryItem(drop.id).catch(() => null));
  if (!item) return b.toast("That library item is no longer there");
  const target = inCanvas && (item.kind === "image" || item.kind === "svg" || item.kind === "video") ? b.profile.placements.find((z) => z.id === inCanvas.zoneId && z.canvas) : undefined;
  if (inCanvas && target?.canvas) return dropIntoCanvas(b, item, target.id, target.canvas, inCanvas);
  switch (item.kind) {
    case "image":
    case "svg":
    case "panel":
      if (!rect) return b.toast("No room there");
      return addToProfile(b, item, rect);
    case "style": {
      const zone = cell ? zoneAtCell(b.profile.placements, cell) : undefined;
      if (!zone) return b.toast("Drop a style on a widget");
      return applyStyle(b, item, [zone.id]);
    }
    case "video":
      return setAsBackground(b, item);
    case "gauge":
      return b.toast("Gauges are placed from the Gauges page");
    default:
      return b.toast(`${KIND_LABEL[item.kind]}s don’t go on the page: open it from the Library`);
  }
}

/** An image item in a canvas zone, centred on the drop point: one undo step, one copy. */
async function dropIntoCanvas(b: StudioBridge, item: LibraryItem, zoneId: string, canvas: StoredCanvas, at: CanvasPoint): Promise<void> {
  const file = droppedFileOf(item);
  if (!file) return b.toast(`${item.name} can’t be drawn by InfoPanel`);
  // The canvas code loads with the zone, not with the studio.
  const [{ openCanvas }, { editItems, withDroppedImage }] = await Promise.all([import("@/lib/infopanel/canvas"), import("@/lib/infopanel/canvas-edit")]);
  const open = openCanvas(canvas);
  const point = { x: at.fx * open.profile.Width, y: at.fy * open.profile.Height };
  const r = withDroppedImage(open.stored, open.profile, editItems(open), file, point);
  b.setConfig((c) => withCanvas(c, zoneId, r.stored));
  b.addCopy(item, { profileId: b.profileId, ...(b.profile.pageId ? { pageId: b.profile.pageId } : {}), zoneId, itemPath: r.path, label: `${open.stored.source.name} › ${file.name}` });
  b.toast(`Added ${item.name} to ${open.stored.source.name}`);
}
