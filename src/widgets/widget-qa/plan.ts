import type { DashboardModule, ModuleSettings } from "@/modules/types";
import type { Placement } from "@/lib/layout";
import { WIDGET_MERGES } from "@/lib/settings-migrate.v19";
import { LAYOUTS } from "../layouts";

/** Which modules the page shows: exactly the `module=` ids, else the template widgets. */
export function pickModules(all: DashboardModule[], templates: DashboardModule[], ids?: string[]): DashboardModule[] {
  return ids?.length ? all.filter((m) => ids.includes(m.id)) : templates;
}

/**
 * The widgets that merged into another (config v19) as the page draws them: the survivor under the old id, without its
 * views, each frame the old placement migrated (`Section.tsx`). Their frames keep their keys in the overflow, pack markup
 * and look baselines, so those baselines check that a migrated placement draws as the old widget did.
 */
export function mergedModules(templates: DashboardModule[]): DashboardModule[] {
  return WIDGET_MERGES.flatMap((m) => {
    const to = templates.find((t) => t.id === m.to);
    // the view's own minimum where it has one (Frame Pacing's 2x1 against FPS Monitor's 1x1), so no frame below it appears
    const min = to?.views?.find((v) => v.id === m.view)?.minSize;
    return to ? [{ ...to, id: m.from, title: m.name, views: undefined, viewKey: undefined, ...(min ? { minCols: min[0], minRows: min[1] } : {}) }] : [];
  });
}

/** The filter box: a case-insensitive match on id or title. */
export function filterModules(mods: DashboardModule[], q: string): DashboardModule[] {
  const needle = q.trim().toLowerCase();
  return needle ? mods.filter((m) => m.id.toLowerCase().includes(needle) || m.title.toLowerCase().includes(needle)) : mods;
}

export const categoryId = (category: string) => category.toLowerCase().replace(/[^a-z0-9]+/g, "-");

export interface Section {
  category: string;
  /** Anchor id, `cat-<x>`. */
  id: string;
  mods: DashboardModule[];
}

/** Sections in `order` (empty ones dropped; an unknown or missing category counts as Generic), each sorted by title. */
export function groupByCategory(mods: DashboardModule[], order: readonly string[]): Section[] {
  const known = (c?: string) => (c && order.includes(c) ? c : "Generic");
  return order
    .map((category) => ({
      category,
      id: `cat-${categoryId(category)}`,
      mods: mods.filter((m) => known(m.category) === category).sort((a, b) => a.title.localeCompare(b.title)),
    }))
    .filter((s) => s.mods.length > 0);
}

export interface FramePlan {
  c: number;
  r: number;
  /** Smaller than the module's minimum: drawn as a dimmed placeholder, not rendered. */
  below: boolean;
}

export function framePlan(mod: Pick<DashboardModule, "minCols" | "minRows">, spans: [number, number][]): FramePlan[] {
  return spans.map(([c, r]) => ({ c, r, below: c < (mod.minCols ?? 1) || r < (mod.minRows ?? 1) }));
}

export interface ViewPlan {
  id: string;
  name: string;
  c: number;
  r: number;
  /** What picks the view: its key and the settings it sets with it, over the page's. */
  settings: ModuleSettings;
}

/**
 * The views row of a widget with more than one view: each view at its default size (else the widget's, else 2x2), never
 * under its minimum, picked by the widget's view key with the settings the view brings.
 */
export function viewPlans(mod: Pick<DashboardModule, "views" | "viewKey" | "defaultSize" | "minCols" | "minRows">): ViewPlan[] {
  if (!mod.views || mod.views.length < 2) return [];
  const key = mod.viewKey ?? "view";
  return mod.views.map((v) => {
    const [dc, dr] = v.defaultSize ?? mod.defaultSize ?? [2, 2];
    const [mc, mr] = v.minSize ?? [mod.minCols ?? 1, mod.minRows ?? 1];
    return { id: v.id, name: v.name, c: Math.max(dc, mc), r: Math.max(dr, mr), settings: { ...v.applies, [key]: v.id } };
  });
}

/** A widget's layouts (`LAYOUTS`, look.json `layouts`) with more than its standard one, each at the widget's default size. */
export function layoutPlans(mod: Pick<DashboardModule, "id" | "defaultSize" | "minCols" | "minRows">): { id: string; name: string; c: number; r: number }[] {
  const all = LAYOUTS[mod.id] ?? [];
  if (all.length < 2) return [];
  const [c, r] = mod.defaultSize ?? [2, 2];
  return all.map((l) => ({ id: l.id, name: l.name, c: Math.max(c, mod.minCols ?? 1), r: Math.max(r, mod.minRows ?? 1) }));
}

/** A gallery's span for a widget: its default size, never under its minimum. */
export function gallerySpan(mod: Pick<DashboardModule, "defaultSize" | "minCols" | "minRows"> | undefined, fallback: [number, number]): [number, number] {
  const [c, r] = mod?.defaultSize ?? fallback;
  return [Math.max(c, mod?.minCols ?? 1), Math.max(r, mod?.minRows ?? 1)];
}

/** The pixel size of an n-cell span. */
export const spanSize = (n: number, cell: number, gap: number) => n * cell + (n - 1) * gap;

export function placement(module: string, c: number, r: number, settings: ModuleSettings): Placement {
  return { id: `qa-${module}-${c}x${r}`, module, colStart: 1, rowStart: 1, colSpan: c, rowSpan: r, visible: true, settings };
}
