import { modules } from "@/modules";
import { canvasTitle, CARDS_ID, type Placement } from "@/lib/layout";
import type { WidgetView } from "@/widgets/core/types";

/** A placeable widget: its minimum zone footprint and the Library fields it declares. */
export interface ModuleMeta {
  id: string;
  title: string;
  minCols: number;
  minRows: number;
  category?: string;
  icon?: string;
  description?: string;
  blurb?: string;
  tags?: string;
  defaultSize?: [number, number];
  views?: WidgetView[];
  viewKey?: string;
}

/** Every widget the studio can place, with its minimum zone footprint. */
export const ALL_MODULES: ModuleMeta[] = [
  ...modules.map((m) => ({
    id: m.id,
    title: m.title,
    minCols: m.minCols ?? 2,
    minRows: m.minRows ?? 1,
    category: m.category,
    icon: m.icon,
    description: m.description,
    blurb: m.blurb,
    tags: m.tags,
    defaultSize: m.defaultSize,
    views: m.views,
    viewKey: m.viewKey,
  })),
  { id: CARDS_ID, title: "Other sensors", minCols: 4, minRows: 2 },
];

/** Drag-and-drop payload types for the widget and panel palettes. */
export const DND_MIME = "text/infopanel-module";
export const DND_MIME_PANEL = "text/infopanel-panel";
/** The settings a widget's view adds it with (JSON), beside its `DND_MIME` id. */
export const DND_MIME_SETTINGS = "text/infopanel-module-settings";

/** A module's minimum zone size (grid cells); unknown ids get 2×1. */
export function moduleMinSize(module: string): { cols: number; rows: number } {
  const meta = ALL_MODULES.find((m) => m.id === module);
  return { cols: meta?.minCols ?? 2, rows: meta?.minRows ?? 1 };
}

/** A panel's title: the Widget card's title (`label`) when it is set, else the panel's own. */
export function panelTitle(p: Placement): string {
  const label = String(p.settings?.label ?? "");
  return label !== "" ? label : (p.panel?.title ?? "");
}

/** Display title of a placement: panel title, module title, or its id. */
export function placementTitle(p: Placement): string {
  return (
    (p.panel ? panelTitle(p) : undefined) ??
    canvasTitle(p) ??
    ALL_MODULES.find((m) => m.id === p.module)?.title ??
    p.module
  );
}
