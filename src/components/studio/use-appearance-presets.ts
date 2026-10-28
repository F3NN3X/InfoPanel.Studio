import type { HistorySetter } from "@/hooks/use-config-history";
import {
  deleteAppearancePreset,
  duplicateAppearancePreset,
  renameAppearancePreset,
  saveCopyOfPreset,
  type ThemeTarget,
} from "@/lib/appearance-preset-apply";
import type { AppearancePreset } from "@/lib/appearance-presets";
import { uid, type DashboardConfig } from "@/lib/layout";
import type { ThemeAt } from "./theme-cards";

/** The saved Themes' data and actions (see `useAppearancePresets`). */
export interface AppearancePresetsApi {
  /** The user's saved Themes (`config.appearancePresets`). */
  presets: AppearancePreset[];
  /** Apply a Theme at a scope, adding to its look (one undo step); its background unless the scope keeps its own. */
  apply: (preset: AppearancePreset, at: ThemeAt, keepBackground?: boolean) => void;
  /** Reset a scope to exactly a Theme, its background included and its fine-tune cleared (one undo step). */
  reset: (preset: AppearancePreset, at: ThemeAt) => void;
  /** Save a scope's resolved look as a Theme, which the scope then counts as applied. */
  save: (at: ThemeAt, name: string, includeBackground: boolean) => void;
  /** Overwrite a saved Theme with a scope's current look (same id and name), and refresh every scope using it. */
  update: (id: string, at: ThemeAt) => void;
  rename: (id: string, name: string) => void;
  duplicate: (id: string) => void;
  /** Keep a built-in Theme (a template's look) as a saved one of the user's own. */
  saveCopy: (preset: AppearancePreset) => void;
  remove: (id: string) => void;
}

/** A Theme scope as the preset writers take it. */
export const themeTarget = (at: ThemeAt): ThemeTarget =>
  at.level === "screen" ? { kind: "profile", profileId: at.profileId } : { kind: "page", profileId: at.profileId, pageId: at.pageId };

/** The apply rule's own chunk, loaded on the first apply (it pulls in the template variants' colour swaps). */
const themeApply = () => import("@/lib/theme-apply");

/**
 * Saved Themes for the studio: each action is one config change through the
 * history setter without a coalescing key, so one Ctrl+Z reverts a whole Theme.
 */
export function useAppearancePresets(config: DashboardConfig, setConfig: HistorySetter): AppearancePresetsApi {
  return {
    presets: config.appearancePresets ?? [],
    apply: (preset, at, keepBackground) => void themeApply().then((m) => setConfig((c) => m.applyTheme(c, preset, themeTarget(at), { keepBackground }))),
    reset: (preset, at) => void themeApply().then((m) => setConfig((c) => m.resetToTheme(c, preset, themeTarget(at)))),
    save: (at, name, includeBackground) => {
      const id = uid("look");
      void themeApply().then((m) => setConfig((c) => m.saveAsTheme(c, themeTarget(at), id, name, includeBackground)));
    },
    update: (id, at) => void themeApply().then((m) => setConfig((c) => m.updateThemeEverywhere(c, id, themeTarget(at)))),
    rename: (id, name) => setConfig((c) => renameAppearancePreset(c, id, name)),
    duplicate: (id) => setConfig((c) => duplicateAppearancePreset(c, id, uid("look"))),
    saveCopy: (preset) => setConfig((c) => saveCopyOfPreset(c, preset, uid("look"))),
    remove: (id) => setConfig((c) => deleteAppearancePreset(c, id)),
  };
}
