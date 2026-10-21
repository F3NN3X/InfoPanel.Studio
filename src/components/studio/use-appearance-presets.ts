import type { HistorySetter } from "@/hooks/use-config-history";
import {
  applyThemeAt,
  deleteAppearancePreset,
  duplicateAppearancePreset,
  renameAppearancePreset,
  saveThemeAt,
  updateAppearancePreset,
  type ThemeTarget,
} from "@/lib/appearance-preset-apply";
import type { AppearancePreset } from "@/lib/appearance-presets";
import { uid, type DashboardConfig } from "@/lib/layout";
import type { ThemeAt } from "./theme-cards";

/** The saved Themes' data and actions (see `useAppearancePresets`). */
export interface AppearancePresetsApi {
  /** The user's saved Themes (`config.appearancePresets`). */
  presets: AppearancePreset[];
  /** Apply a Theme at a scope (one undo step); `includeBackground` unset = only where none is set. */
  apply: (preset: AppearancePreset, at: ThemeAt, includeBackground?: boolean) => void;
  /** Save a scope's resolved look as a Theme. */
  save: (at: ThemeAt, name: string, includeBackground: boolean) => void;
  /** Overwrite a saved Theme with a scope's current look (same id and name). */
  update: (id: string, at: ThemeAt) => void;
  rename: (id: string, name: string) => void;
  duplicate: (id: string) => void;
  remove: (id: string) => void;
}

/** A Theme scope as the preset writers take it. */
export const themeTarget = (at: ThemeAt): ThemeTarget =>
  at.level === "all" ? { kind: "all" } : at.level === "screen" ? { kind: "profile", profileId: at.profileId } : { kind: "page", profileId: at.profileId, pageId: at.pageId };

/**
 * Saved Themes for the studio: each action is one config change through the
 * history setter without a coalescing key, so one Ctrl+Z reverts a whole Theme.
 */
export function useAppearancePresets(config: DashboardConfig, setConfig: HistorySetter): AppearancePresetsApi {
  return {
    presets: config.appearancePresets ?? [],
    apply: (preset, at, includeBackground) => setConfig((c) => applyThemeAt(c, preset, themeTarget(at), { includeBackground })),
    save: (at, name, includeBackground) => setConfig((c) => saveThemeAt(c, themeTarget(at), uid("look"), name, includeBackground)),
    update: (id, at) => setConfig((c) => updateAppearancePreset(c, id, themeTarget(at))),
    rename: (id, name) => setConfig((c) => renameAppearancePreset(c, id, name)),
    duplicate: (id) => setConfig((c) => duplicateAppearancePreset(c, id, uid("look"))),
    remove: (id) => setConfig((c) => deleteAppearancePreset(c, id)),
  };
}
