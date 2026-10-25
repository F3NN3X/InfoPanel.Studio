import { BLANK_MODULE, type Placement } from "@/lib/layout";
import { modules } from "@/modules";
import { settingKeys, type ModuleSettings } from "@/modules/types";
import { DND_MIME, DND_MIME_PANEL, DND_MIME_SETTINGS, ALL_MODULES } from "./studio-modules";
import { zoneFits, type ZoneRect } from "./zone-geometry";
import type { LibraryItem as MyLibraryItem } from "@/lib/library";
import { isComponent } from "@/lib/my-library/component-meta";
import { activeLibraryDrag, libraryDragOf } from "@/lib/my-library/drag";

type Size = { cols: number; rows: number };

/** A widget or panel preset from the Add library (dragged, or clicked). */
export interface LibraryItem {
  kind: "module" | "panel";
  id: string;
  /** The settings a widget is added with (a view's `{ [viewKey]: id, ...applies }`). */
  settings?: ModuleSettings;
}

/**
 * What the canvas takes in a drop: an Add panel widget or panel preset, or a My library card
 * (spec §8; `item` is the card when this window started the drag, else only its id is known).
 */
export type CanvasDrop = LibraryItem | { kind: "mylib"; id: string; item?: MyLibraryItem };

/** A My library card's drag, from its data (at the drop) or the card this window is dragging. */
export function myLibraryDropOf(getData: (type: string) => string): CanvasDrop | null {
  const drag = libraryDragOf(getData);
  if (!drag) return null;
  const active = activeLibraryDrag();
  return { kind: "mylib", id: drag.libraryItemId, item: active?.id === drag.libraryItemId ? active : undefined };
}

/**
 * What a library drag carries, read from its data (null = not ours, or an
 * unknown widget). Only readable in `dragstart` and `drop`, not `dragover`.
 */
export function libraryItemOf(getData: (type: string) => string): LibraryItem | null {
  const module = getData(DND_MIME);
  if (module && (module === BLANK_MODULE || ALL_MODULES.some((m) => m.id === module))) {
    const settings = dropSettingsOf(module, getData(DND_MIME_SETTINGS));
    return settings ? { kind: "module", id: module, settings } : { kind: "module", id: module };
  }
  const panel = getData(DND_MIME_PANEL);
  return panel ? { kind: "panel", id: panel } : null;
}

/** A drag's settings (JSON) narrowed to the keys the module has; undefined when none is left or it does not parse. */
function dropSettingsOf(module: string, raw: string): ModuleSettings | undefined {
  if (!raw) return undefined;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return undefined;
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return undefined;
  const keys = new Set((modules.find((m) => m.id === module)?.settings ?? []).flatMap(settingKeys));
  const kept = Object.entries(parsed).filter(([k]) => keys.has(k));
  return kept.length ? (Object.fromEntries(kept) as ModuleSettings) : undefined;
}

/** A widget's footprint when dropped: at least 3×2, its minimum if larger, kept inside the grid. */
export function dropSize(min: Size, grid: { cols: number; rows: number }): Size {
  return {
    cols: Math.min(grid.cols, Math.max(min.cols, 3)),
    rows: Math.min(grid.rows, Math.max(min.rows, 2)),
  };
}

/**
 * What a widget drops with: its declared default size (never below its minimum), else 3×2 or the
 * minimum; kept inside the grid. With `settings` naming one of its views, that view's sizes come first.
 */
export function moduleDropSize(module: string, grid: { cols: number; rows: number }, settings?: ModuleSettings): Size {
  const meta = ALL_MODULES.find((m) => m.id === module);
  const view = settings && meta?.views?.find((v) => v.id === settings[meta.viewKey ?? "view"]);
  const min = { cols: view?.minSize?.[0] ?? meta?.minCols ?? 2, rows: view?.minSize?.[1] ?? meta?.minRows ?? 1 };
  const def = view?.defaultSize ?? meta?.defaultSize;
  return def ? defaultDropSize(def, min, grid) : dropSize(min, grid);
}

/** A declared default size (cols, rows), at least the minimum, kept inside the grid. */
export function defaultDropSize(def: [number, number], min: Size, grid: { cols: number; rows: number }): Size {
  return { cols: Math.min(grid.cols, Math.max(def[0], min.cols)), rows: Math.min(grid.rows, Math.max(def[1], min.rows)) };
}

/**
 * The drop ghost for a pointer over `cell`: the box centred on the cell,
 * clamped into the grid, and whether it is free of other visible zones.
 */
export function dropGhost(
  cell: { col: number; row: number },
  size: Size,
  grid: { cols: number; rows: number },
  placements: Placement[]
): { rect: ZoneRect; ok: boolean } {
  const clamp = (n: number, max: number) => Math.max(1, Math.min(max, n));
  const rect: ZoneRect = {
    col: clamp(cell.col - Math.floor((size.cols - 1) / 2), grid.cols + 1 - size.cols),
    row: clamp(cell.row - Math.floor((size.rows - 1) / 2), grid.rows + 1 - size.rows),
    cols: size.cols,
    rows: size.rows,
  };
  return { rect, ok: zoneFits(rect, placements, grid.cols, grid.rows) };
}

/** A drop point inside a canvas zone's drawn profile, as a fraction of its width and height. */
export interface CanvasPoint {
  zoneId: string;
  fx: number;
  fy: number;
}

/** The canvas zone profile under a screen point (CanvasZone marks it `data-ip-canvas`). */
export function canvasPointAt(x: number, y: number): CanvasPoint | null {
  const el = document.elementsFromPoint(x, y).find((e) => e.hasAttribute("data-ip-canvas"));
  const zoneId = el?.closest("[data-zone-id]")?.getAttribute("data-zone-id");
  if (!el || !zoneId) return null;
  const box = el.getBoundingClientRect();
  if (box.width <= 0 || box.height <= 0) return null;
  return { zoneId, fx: (x - box.left) / box.width, fy: (y - box.top) / box.height };
}

/** Library kinds an imported canvas zone takes as items (an Image, or a Gauge item). */
const CANVAS_DROP_KINDS: readonly string[] = ["image", "svg", "video", "gauge"];

/**
 * Whether the canvas zone under the pointer takes this drag itself (dropped as an item in it), so
 * the grid's placement ghost, and its "No room", would be wrong there.
 */
export function canvasTakesDrop(dragged: CanvasDrop | null, over: CanvasPoint | null): boolean {
  return !!over && dragged?.kind === "mylib" && !!dragged.item && (CANVAS_DROP_KINDS.includes(dragged.item.kind) || isComponent(dragged.item));
}
