import type { HistorySetter } from "@/hooks/use-config-history";
import type { DashboardConfig, ProfileView } from "@/lib/layout";
import type { ModuleSettings } from "@/modules/types";
import { styleKey, withScopeStyle, type StyleScope } from "./appearance-actions";
import { useAppearancePresets } from "./use-appearance-presets";

/**
 * The palette's screen style writer and the saved Themes: a config change through the history setter. The
 * look itself is Theme's (`theme-editor.tsx`), the clock is Settings'.
 */
export function useStyleEdits(config: DashboardConfig, profile: ProfileView, setConfig: HistorySetter) {
  /** Edit this screen's style (same-screen edits coalesce). */
  const setScopeStyle = (fn: (style: ModuleSettings) => ModuleSettings) => {
    const scope: StyleScope = { kind: "profile", profileId: profile.id };
    setConfig((c) => withScopeStyle(c, scope, fn), styleKey(scope));
  };

  const appearancePresets = useAppearancePresets(config, setConfig);

  return { setScopeStyle, appearancePresets };
}
