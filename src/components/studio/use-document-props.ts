import type { HistorySetter } from "@/hooks/use-config-history";
import { withGeneral, type GeneralSettings } from "@/lib/general";
import type { DashboardConfig, ProfileView } from "@/lib/layout";
import type { ModuleSettings } from "@/modules/types";
import { styleKey, withScopeStyle, type StyleScope } from "./appearance-actions";
import type { DocumentInspectorProps } from "./document-inspector";
import { withPerformance, withScope, type AppearanceTarget, type LookScope, type ScopedSection } from "./inspector/profile-scope";
import { dropKeys } from "./settings-model";
import { useAppearancePresets } from "./use-appearance-presets";

/**
 * The document inspector's data and edits (nothing selected, the screen's
 * Layout and Behaviour tabs): performance, general settings, the clocks'
 * 12 / 24 h and the Data API URL, each a config change through the history
 * setter. Also the palette's scope style writer and the saved Themes. The
 * look itself is Theme's (`theme-editor.tsx`).
 */
export function useDocumentProps(
  config: DashboardConfig,
  profile: ProfileView,
  setConfig: HistorySetter,
  updateProfile: (fn: (p: ProfileView) => ProfileView, key?: string) => void
) {
  /** The global style a target edits: the dashboard's or this profile's. */
  const styleScope = (target: AppearanceTarget): StyleScope =>
    target === "all" ? { kind: "all" } : { kind: "profile", profileId: profile.id };

  /** Edit the dashboard's or this profile's style (same-scope edits coalesce). */
  const setScopeStyle = (target: AppearanceTarget, fn: (style: ModuleSettings) => ModuleSettings) =>
    setConfig((c) => withScopeStyle(c, styleScope(target), fn), styleKey(styleScope(target)));

  const appearancePresets = useAppearancePresets(config, setConfig);

  /** Switch a section between the dashboard's value and this profile's own (one undo step). */
  const setScope = (section: ScopedSection, scope: LookScope) =>
    setConfig((c) => withScope(c, profile.id, section, scope));

  /** Set this profile's own frame rate or animations. */
  const setPerformance = (patch: Parameters<typeof withPerformance>[1]) =>
    updateProfile((p) => ({ ...p, performance: withPerformance(p.performance, patch) }), "profile:performance");

  /** Set one general setting (same-key edits coalesce in undo). */
  const setGeneral = <K extends keyof GeneralSettings>(key: K, value: GeneralSettings[K]) =>
    setConfig((c) => ({ ...c, general: withGeneral(c.general, key, value) }), `general:${key}`);

  /** The clocks' 12 / 24 h: the all-screens style's themed `clock` (config v7). */
  const setHours = (v: string | undefined) =>
    setScopeStyle("all", (s) => (v === undefined ? (dropKeys(s, new Set(["clock"])) ?? {}) : { ...s, clock: v }));

  const props: Omit<DocumentInspectorProps, "jumpTo"> = {
    config,
    profile,
    hours: config.style?.clock === undefined ? undefined : String(config.style.clock),
    onHours: setHours,
    onScope: setScope,
    onPerformance: setPerformance,
    general: config.general,
    onGeneral: setGeneral,
    dataApiUrl: config.dataApiUrl,
    onDataApiUrl: (dataApiUrl) => setConfig((c) => ({ ...c, dataApiUrl }), "data-api-url"),
  };
  return { props, setScopeStyle, appearancePresets };
}
