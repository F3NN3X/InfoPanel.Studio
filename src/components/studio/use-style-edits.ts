import type { HistorySetter } from "@/hooks/use-config-history";
import type { DashboardConfig, ProfileView } from "@/lib/layout";
import type { ModuleSettings } from "@/modules/types";
import { styleKey, withScopeStyle, type StyleScope } from "./appearance-actions";
import type { AppearanceTarget } from "./inspector/profile-scope";
import { useAppearancePresets } from "./use-appearance-presets";

/**
 * The palette's scope style writer and the saved Themes: a config change through the history setter. The
 * look itself is Theme's (`theme-editor.tsx`), the clock and the performance defaults are Settings'.
 */
export function useStyleEdits(config: DashboardConfig, profile: ProfileView, setConfig: HistorySetter) {
  /** The global style a target edits: the dashboard's or this profile's. */
  const styleScope = (target: AppearanceTarget): StyleScope =>
    target === "all" ? { kind: "all" } : { kind: "profile", profileId: profile.id };

  /** Edit the dashboard's or this profile's style (same-scope edits coalesce). */
  const setScopeStyle = (target: AppearanceTarget, fn: (style: ModuleSettings) => ModuleSettings) =>
    setConfig((c) => withScopeStyle(c, styleScope(target), fn), styleKey(styleScope(target)));

  const appearancePresets = useAppearancePresets(config, setConfig);

  return { setScopeStyle, appearancePresets };
}
