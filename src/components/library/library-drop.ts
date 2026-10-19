/**
 * A My library card dropped on the studio canvas (spec §8): an image or SVG becomes an image
 * zone and a saved panel a panel zone (at the drop ghost, sized as drawn), a style applies to the
 * zone under the pointer, a video becomes the page background, a vector gauge a Custom gauge zone.
 * An image, SVG or video dropped on an imported canvas zone becomes an Image item in it, a gauge a
 * Gauge item, at the pointer. Each drop is one undo step
 * and counts a copy on the library item.
 */
import { gaugeDataOf, type GaugeLibraryData, type LibraryFrame } from "@/lib/gauge-studio/model";
import { getLibraryItem, type LibraryItem } from "@/lib/library";
import type { AssetType } from "@/lib/infopanel/assets/assets";
import type { DroppedFile } from "@/lib/infopanel/canvas-edit";
import type { StoredCanvas } from "@/lib/infopanel/import/stored";
import type { UserPanelPreset } from "@/lib/panel-model";
import { setActiveLibraryDrag } from "@/lib/my-library/drag";
import { droppedFileOf, fileUrl, KIND_LABEL, metaOf } from "@/lib/my-library/model";
import { withCanvas } from "@/components/studio/import-actions";
import type { CanvasPoint } from "@/components/studio/drop-ghost";
import type { ZoneRect } from "@/components/studio/zone-geometry";
import { addGaugeZone, addToProfile, applyStyle, dataOf, imagePanel, setAsBackground, type StudioBridge } from "./library-actions";

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
    case "gauge":
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
  const target = inCanvas && (item.kind === "image" || item.kind === "svg" || item.kind === "video" || item.kind === "gauge") ? b.profile.placements.find((z) => z.id === inCanvas.zoneId && z.canvas) : undefined;
  if (inCanvas && target?.canvas) return item.kind === "gauge" ? dropGaugeIntoCanvas(b, item, target.id, target.canvas, inCanvas) : dropIntoCanvas(b, item, target.id, target.canvas, inCanvas);
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
      return dropGaugeOnGrid(b, item, rect);
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

/** A gauge's data, or null (with the toast) when the item holds none. */
async function gaugeOf(b: StudioBridge, item: LibraryItem): Promise<GaugeLibraryData | null> {
  const data = gaugeDataOf(await dataOf<unknown>(item).catch(() => undefined));
  if (!data) b.toast(`${item.name} has no gauge to place`);
  return data;
}

/** A vector gauge on the grid becomes a Custom gauge zone; an image sequence has no widget form. */
async function dropGaugeOnGrid(b: StudioBridge, item: LibraryItem, rect: ZoneRect | null): Promise<void> {
  const data = await gaugeOf(b, item);
  if (!data) return;
  if (!data.vector) return b.toast("Image-sequence gauges go into a canvas zone");
  if (!rect) return b.toast("No room there");
  addGaugeZone(b, item.name, data.vector, rect, item);
}

const FRAME_TYPES: Record<string, AssetType> = { png: "png", jpg: "jpeg", jpeg: "jpeg", gif: "gif", webp: "webp", bmp: "bmp", ico: "ico", svg: "svg" };

/** A library frame (its asset id is `<sha256>.<ext>`) as a file a canvas zone can hold. */
const frameFile = (f: LibraryFrame): DroppedFile => {
  const ext = f.id.slice(65);
  return { name: f.name, hash: f.id.slice(0, 64), type: FRAME_TYPES[ext] ?? "other", size: 0, ext };
};

/** A Gauge item in a canvas zone, centred on the drop point: one undo step, one copy. */
async function dropGaugeIntoCanvas(b: StudioBridge, item: LibraryItem, zoneId: string, canvas: StoredCanvas, at: CanvasPoint): Promise<void> {
  const data = await gaugeOf(b, item);
  if (!data) return;
  const [{ openCanvas }, { editItems, withDroppedGauge }] = await Promise.all([import("@/lib/infopanel/canvas"), import("@/lib/infopanel/canvas-edit")]);
  const open = openCanvas(canvas);
  const point = { x: at.fx * open.profile.Width, y: at.fy * open.profile.Height };
  const gauge = { name: item.name, vector: data.vector, frames: data.frames?.map(frameFile), min: data.min, max: data.max, animationSpeed: data.animationSpeed };
  const r = withDroppedGauge(open.stored, open.profile, editItems(open), gauge, point);
  b.setConfig((c) => withCanvas(c, zoneId, r.stored));
  b.addCopy(item, { profileId: b.profileId, ...(b.profile.pageId ? { pageId: b.profile.pageId } : {}), zoneId, itemPath: r.path, label: `${open.stored.source.name} › ${item.name}` });
  b.toast(`Added ${item.name} to ${open.stored.source.name}`);
}
