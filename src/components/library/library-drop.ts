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
import type { DashboardConfig } from "@/lib/layout";
import type { DroppedFile } from "@/lib/infopanel/canvas-edit";
import type { StoredCanvas } from "@/lib/infopanel/import/stored";
import type { UserPanelPreset } from "@/lib/panel-model";
import { isComponent, rolesOf } from "@/lib/my-library/component-meta";
import { setActiveLibraryDrag } from "@/lib/my-library/drag";
import { droppedFileOf, fileUrl, KIND_LABEL, metaOf } from "@/lib/my-library/model";
import { importIntoProfile, withCanvas } from "@/components/studio/import-actions";
import { getCatalog } from "@/lib/catalog";
import type { DataApiValue } from "@/lib/infopanel/sensors";
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
    case "canvas": {
      // A component takes the footprint of its own shape, at most half the grid.
      if (!isComponent(item)) return null;
      const m = metaOf(item);
      const aspect = m.width && m.height ? m.width / m.height : 16 / 10;
      const cell = { w: grid.width / Math.max(1, grid.cols), h: grid.height / Math.max(1, grid.rows) };
      const rows = Math.max(1, Math.min(Math.ceil(grid.rows / 2), 2));
      return { cols: Math.max(1, Math.min(grid.cols, Math.round((rows * cell.h * aspect) / cell.w) || 1)), rows };
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
  const target = inCanvas && (isComponent(item) || item.kind === "image" || item.kind === "svg" || item.kind === "video" || item.kind === "gauge") ? b.profile.placements.find((z) => z.id === inCanvas.zoneId && z.canvas) : undefined;
  if (inCanvas && target?.canvas && isComponent(item)) return dropComponentIntoCanvas(b, item, target.id, inCanvas);
  if (inCanvas && target?.canvas) return item.kind === "gauge" ? dropGaugeIntoCanvas(b, item, target.id, inCanvas) : dropIntoCanvas(b, item, target.id, target.canvas, inCanvas);
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
    case "canvas":
      return isComponent(item) ? addComponentZone(b, item, rect) : b.toast("Open an InfoPanel profile from the Library to place it");
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
  addGaugeZone(b, item.name, data.vector, rect, item, data.frames);
}

const FRAME_TYPES: Record<string, AssetType> = { png: "png", jpg: "jpeg", jpeg: "jpeg", gif: "gif", webp: "webp", bmp: "bmp", ico: "ico", svg: "svg" };

/** A library frame (its asset id is `<sha256>.<ext>`) as a file a canvas zone can hold. */
const frameFile = (f: LibraryFrame): DroppedFile => {
  const ext = f.id.slice(65);
  return { name: f.name, hash: f.id.slice(0, 64), type: FRAME_TYPES[ext] ?? "other", size: 0, ext };
};

/** A canvas zone's stored canvas in `config`, wherever its page is. */
function canvasIn(config: DashboardConfig, zoneId: string): StoredCanvas | undefined {
  for (const p of config.profiles) for (const pg of p.pages) for (const z of pg.placements) if (z.id === zoneId) return z.canvas;
  return undefined;
}

/** A Gauge item in a canvas zone, centred on the drop point: one undo step, one copy. */
async function dropGaugeIntoCanvas(b: StudioBridge, item: LibraryItem, zoneId: string, at: CanvasPoint): Promise<void> {
  const data = await gaugeOf(b, item);
  if (!data) return;
  const [{ openCanvas }, { editItems, withDroppedGauge }] = await Promise.all([import("@/lib/infopanel/canvas"), import("@/lib/infopanel/canvas-edit")]);
  let frames = data.frames?.map(frameFile);
  let baked: string | undefined;
  // A spec with no frames draws nothing in InfoPanel: bake it now, and drop nothing if that fails.
  if (data.vector && !frames?.length) {
    b.toast(`Baking ${item.name}…`);
    try {
      ({ frames, baked } = await (await import("@/components/gauges/bake-on-drop")).bakeForDrop(data.vector, item.name));
    } catch (e) {
      return b.toast(`Couldn’t bake ${item.name}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  const gauge = { name: item.name, vector: data.vector, frames, baked, min: data.min, max: data.max, animationSpeed: data.animationSpeed };
  // The canvas as it is now, not as it was at the drop: edits made while baking stay, and a zone removed meanwhile
  // takes nothing. The history setter runs the updater at once, so `placed` is set when it returns.
  let placed: { path: ReturnType<typeof withDroppedGauge>["path"]; name: string } | undefined;
  b.setConfig((c) => {
    const current = canvasIn(c, zoneId);
    if (!current) return c;
    const open = openCanvas(current);
    const r = withDroppedGauge(open.stored, open.profile, editItems(open), gauge, { x: at.fx * open.profile.Width, y: at.fy * open.profile.Height });
    placed = { path: r.path, name: open.stored.source.name };
    return withCanvas(c, zoneId, r.stored);
  });
  if (!placed) return b.toast(`The canvas zone is gone, so ${item.name} wasn’t added`);
  b.addCopy(item, { profileId: b.profileId, ...(b.profile.pageId ? { pageId: b.profile.pageId } : {}), zoneId, itemPath: placed.path, label: `${placed.name} › ${item.name}` });
  b.toast(`Added ${item.name} to ${placed.name}`);
}

/** The Data API's sensors as the role lookup reads them. */
const liveSensors = () => getCatalog().sensors as unknown as Record<string, DataApiValue>;

/** A component's canvas, from the item. */
async function componentOf(b: StudioBridge, item: LibraryItem): Promise<StoredCanvas | null> {
  const stored = await dataOf<StoredCanvas>(item).catch(() => undefined);
  if (!stored) b.toast(`${item.name} couldn’t be read from the Library`);
  return stored ?? null;
}

/**
 * A component as a canvas zone of its own on the page, in `rect` or the free cell that draws it largest: one undo
 * step, one copy. Its sensors are matched by role on this PC first.
 */
export async function addComponentZone(b: StudioBridge, item: LibraryItem, rect?: ZoneRect | null): Promise<void> {
  const stored = await componentOf(b, item);
  if (!stored) return;
  const [{ componentCanvas, withComponent }, { openCanvas }] = await Promise.all([import("@/lib/infopanel/component"), import("@/lib/infopanel/canvas")]);
  const own = componentCanvas(stored, item.name);
  // The roles bind the zone's own copy: merge it into an empty canvas of its size, which keeps the sensors it finds.
  const open = openCanvas(own);
  const size = { width: open.profile.Width, height: open.profile.Height };
  const bound = withComponent({ ...own, items: [], assets: [], fonts: [] }, open.profile, [], own, { at: { x: size.width / 2, y: size.height / 2 } }, { roles: rolesOf(item), sensors: liveSensors() });
  const canvas = { ...bound.stored, assets: own.assets, source: own.source, profile: own.profile };
  const r = importIntoProfile(b.config, b.profile, canvas, size, rect ?? undefined);
  if (!r) return b.toast("No free cell on this page: make room first");
  b.setConfig(r.config);
  b.select(r.zoneId);
  b.addCopy(item, { profileId: b.profileId, ...(b.profile.pageId ? { pageId: b.profile.pageId } : {}), zoneId: r.zoneId, label: item.name });
  b.toast(bound.open > 0 ? `Added ${item.name}; ${bound.open} sensor${bound.open === 1 ? "" : "s"} need a look in Remap` : `Added ${item.name}`);
}

/** A component merged into a canvas zone at the drop point: one undo step, one copy. */
async function dropComponentIntoCanvas(b: StudioBridge, item: LibraryItem, zoneId: string, at: CanvasPoint): Promise<void> {
  const data = await componentOf(b, item);
  if (!data) return;
  const [{ openCanvas }, { editItems }, { withComponent }] = await Promise.all([import("@/lib/infopanel/canvas"), import("@/lib/infopanel/canvas-edit"), import("@/lib/infopanel/component")]);
  let placed: { path: string; name: string; open: number } | undefined;
  b.setConfig((c) => {
    const current = canvasIn(c, zoneId);
    if (!current) return c;
    const open = openCanvas(current);
    const r = withComponent(open.stored, open.profile, editItems(open), data, { at: { x: at.fx * open.profile.Width, y: at.fy * open.profile.Height } }, { roles: rolesOf(item), sensors: liveSensors() });
    placed = { path: r.paths[0], name: open.stored.source.name, open: r.open };
    return withCanvas(c, zoneId, r.stored);
  });
  if (!placed) return b.toast(`The canvas zone is gone, so ${item.name} wasn’t added`);
  b.addCopy(item, { profileId: b.profileId, ...(b.profile.pageId ? { pageId: b.profile.pageId } : {}), zoneId, itemPath: placed.path, label: `${placed.name} › ${item.name}` });
  b.toast(placed.open > 0 ? `Added ${item.name} to ${placed.name}; ${placed.open} sensor${placed.open === 1 ? "" : "s"} need a look in Remap` : `Added ${item.name} to ${placed.name}`);
}
