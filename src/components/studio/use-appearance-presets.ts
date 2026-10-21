import type { HistorySetter } from "@/hooks/use-config-history";
import {
  applyAppearancePreset,
  clearOverrides,
  countOverrides,
  countProfileOverrides,
  deleteAppearancePreset,
  renameAppearancePreset,
  saveAppearancePreset,
  type PresetScope,
} from "@/lib/appearance-preset-apply";
import type { AppearancePreset } from "@/lib/appearance-presets";
import { uid, type DashboardConfig } from "@/lib/layout";
import type { AppearanceTarget } from "./inspector/profile-scope";

/** The Appearance gallery's data and actions (see `useAppearancePresets`). */
export interface AppearancePresetsApi {
  /** The user's saved looks. */
  presets: AppearancePreset[];
  /** What hides the global style of a target: own-look widgets and (all profiles) profile styles. */
  overrides: (target: AppearanceTarget) => { widgets: number; profiles: number };
  /** Apply a preset (one undo step); `includeBackground` unset = only where none is set. */
  apply: (preset: AppearancePreset, target: AppearanceTarget, includeBackground?: boolean) => void;
  /** Make the overriding widgets follow (and drop profile styles for all profiles). */
  clearOverrides: (target: AppearanceTarget) => void;
  /** Save the target's current look as a user preset. */
  save: (target: AppearanceTarget, name: string) => void;
  rename: (id: string, name: string) => void;
  remove: (id: string) => void;
}

/**
 * Appearance presets for the studio: each action is one config change
 * through the history setter without a coalescing key, so one Ctrl+Z
 * reverts a whole preset.
 */
export function useAppearancePresets(
  config: DashboardConfig,
  profileId: string,
  setConfig: HistorySetter
): AppearancePresetsApi {
  const scope = (target: AppearanceTarget): PresetScope =>
    target === "all" ? { kind: "all" } : { kind: "profile", profileId };
  return {
    presets: config.appearancePresets ?? [],
    overrides: (target) => ({
      widgets: countOverrides(config, scope(target)),
      profiles: countProfileOverrides(config, scope(target)),
    }),
    apply: (preset, target, includeBackground) =>
      setConfig((c) => applyAppearancePreset(c, preset, scope(target), { includeBackground })),
    clearOverrides: (target) => setConfig((c) => clearOverrides(c, scope(target))),
    save: (target, name) => setConfig((c) => saveAppearancePreset(c, scope(target), uid("look"), name)),
    rename: (id, name) => setConfig((c) => renameAppearancePreset(c, id, name)),
    remove: (id) => setConfig((c) => deleteAppearancePreset(c, id)),
  };
}
