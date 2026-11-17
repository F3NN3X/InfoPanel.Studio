import { modules } from "@/modules";
import { canvasTitle, CARDS_ID, type Placement } from "@/lib/layout";
import type { WidgetView } from "@/widgets/core/types";
import type { ModuleSettings } from "@/modules/types";
import { recipeModule } from "@/widgets/recipe/resolve";

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

/** The view a zone's settings name (the first when none is stored), where it has a minimum of its own (FPS Monitor's pacing view). */
function viewMinSize(meta: ModuleMeta | undefined, settings: ModuleSettings | undefined): [number, number] | undefined {
  const id = settings?.[meta?.viewKey ?? "view"] ?? meta?.views?.[0]?.id;
  return meta?.views?.find((v) => v.id === id)?.minSize;
}

/** A module's minimum zone size (grid cells), its stored view's own when it has one; unknown ids get 2×1. */
export function moduleMinSize(module: string, settings?: ModuleSettings): { cols: number; rows: number } {
  const meta = ALL_MODULES.find((m) => m.id === module);
  const view = viewMinSize(meta, settings);
  return { cols: view?.[0] ?? meta?.minCols ?? 2, rows: view?.[1] ?? meta?.minRows ?? 1 };
}

/** A panel's title: the Widget card's title (`label`) when it is set, else the panel's own. */
export function panelTitle(p: Placement): string {
  const label = String(p.settings?.label ?? "");
  return label !== "" ? label : (p.panel?.title ?? "");
}

/** Display title of a placement: the name it was given in Layers, panel title, module title (a recipe's name once it has loaded), or its id. */
export function placementTitle(p: Placement): string {
  return (
    p.name ||
    ((p.panel ? panelTitle(p) : undefined) ??
      canvasTitle(p) ??
      ALL_MODULES.find((m) => m.id === p.module)?.title ??
      recipeModule(p.module)?.title ??
      p.module)
  );
}
