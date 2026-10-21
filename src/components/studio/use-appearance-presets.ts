import type { HistorySetter } from "@/hooks/use-config-history";
import {
  applyThemeAt,
  deleteAppearancePreset,
  renameAppearancePreset,
  saveThemeAt,
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
  rename: (id: string, name: string) => void;
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
    rename: (id, name) => setConfig((c) => renameAppearancePreset(c, id, name)),
    remove: (id) => setConfig((c) => deleteAppearancePreset(c, id)),
  };
}
