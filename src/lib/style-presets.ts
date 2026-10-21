import type { ModuleSettings } from "@/modules/types";
import type { DashboardConfig, StylePreset } from "./layout";

/**
 * The saved Styles (`config.stylePresets`): the edits the Library and the Style tab make beyond saving a new one.
 * Pure config → config, each result one undo step.
 */

/**
 * The saved Style a widget's own look is built on: the one whose keys the look all holds (a look that went on to
 * add keys still is it). A Style with no keys matches nothing; the most specific match wins.
 */
export function matchingStyle(presets: readonly StylePreset[], style: ModuleSettings): StylePreset | undefined {
  const holds = (p: StylePreset) => Object.entries(p.settings).every(([key, value]) => style[key] === value);
  return presets
    .filter((p) => Object.keys(p.settings).length > 0 && holds(p))
    .reduce<StylePreset | undefined>((best, p) => (!best || Object.keys(p.settings).length > Object.keys(best.settings).length ? p : best), undefined);
}

const mapStyles = (config: DashboardConfig, fn: (p: StylePreset) => StylePreset): DashboardConfig => ({
  ...config,
  stylePresets: config.stylePresets?.map(fn),
});

/** Overwrite a saved Style's settings ("Update ‹name›", "Update from selection"); its id and name stay. */
export const updateStylePreset = (config: DashboardConfig, id: string, settings: ModuleSettings): DashboardConfig =>
  mapStyles(config, (p) => (p.id === id ? { ...p, settings: { ...settings } } : p));

export const renameStylePreset = (config: DashboardConfig, id: string, name: string): DashboardConfig =>
  mapStyles(config, (p) => (p.id === id ? { ...p, name } : p));

/** A copy of a saved Style named "‹name› copy", right after it. */
export function duplicateStylePreset(config: DashboardConfig, id: string, copyId: string): DashboardConfig {
  const list = config.stylePresets ?? [];
  const at = list.findIndex((p) => p.id === id);
  if (at < 0) return config;
  const copy: StylePreset = { id: copyId, name: `${list[at].name} copy`, settings: { ...list[at].settings } };
  return { ...config, stylePresets: [...list.slice(0, at + 1), copy, ...list.slice(at + 1)] };
}

/** Delete a saved Style; the last one leaves no list behind. */
export function deleteStylePreset(config: DashboardConfig, id: string): DashboardConfig {
  const rest = config.stylePresets?.filter((p) => p.id !== id) ?? [];
  return { ...config, stylePresets: rest.length > 0 ? rest : undefined };
}
