/**
 * One InfoPanel item or element on a screen's page, selected (Edit v3 SPEC §10.2): the item inspector an imported
 * profile's items have (Item · Sensor · Look, the kind's fields, its sensor, an element's own panel), over the item
 * placement's stored item (`Placement.item`) with the page's store (`ProfilePage.freeCanvas`: files, fonts, palette)
 * around it. Its Place row moves it through the page model (on cells, or in px), and its LAYER section and On
 * InfoPanel line come after the fields. Every edit is one step of the screen's history. A new Image or Sensor image
 * asks for its file here (DECISIONS after phase 5). Lazy-loaded with the item model.
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { HistorySetter } from "@/hooks/use-config-history";
import { useSensors } from "@/hooks/useSensors";
import { useSensorCatalog } from "@/lib/catalog";
import { editKeys, storeItems, withAsset, type DroppedFile } from "@/lib/infopanel/canvas-edit";
import { checkItems } from "@/lib/infopanel/export-check";
import { updateAt } from "@/lib/infopanel/editor/ops";
import { newStored, type StoredCanvas, type StoredItem } from "@/lib/infopanel/import/stored";
import type { DisplayItem } from "@/lib/infopanel/schema";
import type { DataApiValue } from "@/lib/infopanel/sensors";
import type { DashboardConfig, MonitorProfile, Placement, ProfilePage } from "@/lib/layout";
import type { PageOp, PartPlace } from "@/lib/page-model/model";
import { withoutItems } from "@/lib/page-model/stored-items";
import { PlaceRow } from "@/components/studio/place-row";
import { ExportCheckContext, type ExportCheckState } from "../export-check-panel";
import { ImagePicker } from "./image-picker";
import { ItemInspector } from "./item-inspector";
import { useCanvasEditor, type ReplaceCanvas } from "./use-canvas-editor";

/** The one stored item, path "0" of the one-item canvas the inspector edits. */
const PATH = "0";

/** The item placement's item and the page's store written back from the one-item canvas: one change. */
export function pageItemWriter(profileId: string, pageId: string): ReplaceCanvas {
  return (config: DashboardConfig, zoneId: string, canvas: StoredCanvas) => {
    const item = canvas.items[0];
    if (!item) return config;
    const page = (pg: ProfilePage): ProfilePage =>
      pg.id !== pageId || !pg.placements.some((z) => z.id === zoneId)
        ? pg
        : { ...pg, freeCanvas: withoutItems(canvas), placements: pg.placements.map((z) => (z.id === zoneId ? { ...z, item } : z)) };
    const profiles = config.profiles.map((p) => (p.id !== profileId ? p : { ...p, pages: p.pages.map(page) }));
    return profiles.every((p, i) => p === config.profiles[i]) ? config : { ...config, profiles };
  };
}

/** The page's store around one item (a new store the screen's size when the page has none yet). */
export function oneItemCanvas(page: ProfilePage, item: StoredItem, size: { width: number; height: number }): StoredCanvas {
  const base = page.freeCanvas ?? newStored({ name: page.name, ...size });
  return { ...base, items: [item] } as StoredCanvas;
}

interface PageItemInspectorProps {
  profile: MonitorProfile;
  page: ProfilePage;
  placement: Placement & { item: StoredItem };
  /** Where it is in the page model (its cells, or its px box). */
  place: PartPlace;
  setConfig: HistorySetter;
  onOps: (ops: readonly PageOp[]) => void;
  /** The LAYER section. */
  layer: ReactNode;
  /** The screen is made for InfoPanel: the On InfoPanel line shows. */
  checkOn: boolean;
  onDuplicate: () => void;
  onDelete: () => void;
  /** A new Image or Sensor image: ask for its file, then `onFilePicked` (a Sensor image asks for its sensor next). */
  askFile?: boolean;
  onFileDone?: (picked: boolean) => void;
}

export default function PageItemInspector({ profile, page, placement, place, setConfig, onOps, layer, checkOn, onDuplicate, onDelete, askFile = false, onFileDone }: PageItemInspectorProps) {
  const zone = useMemo(
    () => ({ ...placement, canvas: oneItemCanvas(page, placement.item, { width: profile.width, height: profile.height }) }),
    [placement, page.freeCanvas, page.name, profile.width, profile.height],
  );
  const writer = useMemo(() => pageItemWriter(profile.id, page.id), [profile.id, page.id]);
  const editor = useCanvasEditor(zone, setConfig, writer, [PATH]);
  const sensors = useSensorCatalog().sensors as unknown as Record<string, DataApiValue>;
  const keys = useMemo(() => editKeys(editor.committed), [editor.committed]);
  const live = useSensors(keys) as unknown as Record<string, DataApiValue>;
  const check: ExportCheckState = useMemo(() => ({ on: checkOn, byPath: new Map(checkItems(editor.committed, false).rows.map((r) => [r.path, r])) }), [checkOn, editor.committed]);
  const [fileOpen, setFileOpen] = useState(askFile);
  const picked = useRef(false);
  useEffect(() => setFileOpen(askFile), [askFile, placement.id]);
  const item = editor.committed[0] as DisplayItem | undefined;
  const pickFile = (file: DroppedFile) => {
    const { stored, profile: look } = editor.open;
    const { assets, name } = withAsset(stored.assets, file);
    const items = updateAt(editor.committed, PATH, (it) => ({ ...it, FilePath: name, RelativePath: true }) as DisplayItem);
    editor.commitStored(storeItems({ ...stored, assets }, look, items));
  };

  const locked = placement.locked === true;
  const placeRow =
    "cell" in place ? (
      <PlaceRow
        cell={place.cell}
        disabled={locked}
        onCells={(patch) =>
          onOps([
            ...(patch.col !== undefined || patch.row !== undefined ? [{ type: "move" as const, id: placement.id, to: { col: patch.col ?? place.cell.col, row: patch.row ?? place.cell.row } }] : []),
            ...(patch.cols !== undefined || patch.rows !== undefined ? [{ type: "resize" as const, id: placement.id, to: { cols: patch.cols ?? place.cell.cols, rows: patch.rows ?? place.cell.rows } }] : []),
          ])
        }
      />
    ) : (
      <PlaceRow
        px={place.px}
        disabled={locked}
        onPx={(patch) =>
          onOps([
            ...(patch.x !== undefined || patch.y !== undefined ? [{ type: "move" as const, id: placement.id, to: { x: patch.x ?? place.px.x, y: patch.y ?? place.px.y } }] : []),
            ...(patch.w !== undefined || patch.h !== undefined ? [{ type: "resize" as const, id: placement.id, to: { w: Math.max(1, patch.w ?? place.px.w), h: Math.max(1, patch.h ?? place.px.h) } }] : []),
          ])
        }
        onSnap={() => onOps([{ type: "snapToGrid", id: placement.id }])}
      />
    );

  if (!item) return null;
  return (
    <ExportCheckContext.Provider value={check}>
      <ItemInspector
        editor={editor}
        live={live}
        sensors={sensors}
        onRemap={() => {}}
        onBindSensor={"SensorType" in item ? (sensor) => editor.bind(PATH, sensor) : undefined}
        place={placeRow}
        after={layer}
        actions={{
          onToggleHidden: () => onOps([{ type: "setHidden", id: placement.id, hidden: placement.visible }]),
          onDuplicate,
          onDelete,
        }}
      />
      <ImagePicker
        open={fileOpen}
        onOpenChange={(open) => {
          if (open) return;
          setFileOpen(false);
          onFileDone?.(picked.current);
          picked.current = false;
        }}
        title={`Choose an image for ${item.Name || item.kind}`}
        onPick={(file) => {
          pickFile(file);
          picked.current = true;
        }}
      />
    </ExportCheckContext.Provider>
  );
}
