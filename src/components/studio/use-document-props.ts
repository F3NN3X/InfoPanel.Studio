import type { HistorySetter } from "@/hooks/use-config-history";
import { backgroundKey, withBackground, type BackgroundScope, type PageBackground } from "@/lib/appearance";
import { withGeneral, type GeneralSettings } from "@/lib/general";
import type { DashboardConfig, ProfileView } from "@/lib/layout";
import { THEME_PRESETS, type ThemeTokens } from "@/lib/theme";
import type { ModuleSettings } from "@/modules/types";
import { styleKey, withScopeStyle, type StyleScope } from "./appearance-actions";
import type { DocumentInspectorProps } from "./document-inspector";
import {
  toggleLockAll,
  withPerformance,
  withRadius,
  withScope,
  type AppearanceTarget,
  type BackgroundTarget,
  type LookScope,
  type ProfileTheme,
  type ScopedSection,
} from "./inspector/profile-scope";
import { useAppearancePresets } from "./use-appearance-presets";

/**
 * The document inspector's data and edits (nothing selected): theme,
 * global style, background, general settings and the Data API URL, each a
 * config change through the history setter. Everything but the open tab,
 * which the studio keeps.
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

  const appearancePresets = useAppearancePresets(config, profile.id, setConfig);

  /** Set (or clear) the dashboard's or this profile's page background. */
  const setBackground = (target: BackgroundTarget, bg: PageBackground | undefined) => {
    const scope: BackgroundScope = target === "all" ? { kind: "all" } : { kind: "profile", profileId: profile.id };
    setConfig((c) => withBackground(c, scope, bg), backgroundKey(scope));
  };

  const applyPreset = (name: string) => {
    const preset = THEME_PRESETS.find((p) => p.name === name);
    if (preset) setConfig((c) => ({ ...c, theme: { ...preset.tokens } }));
  };

  /** Set this profile's own theme colours / radius (both unset = the dashboard's). */
  const setProfileTheme = (next: ProfileTheme, key?: string) =>
    updateProfile((p) => ({ ...p, theme: next.theme, radius: next.radius }), key && `${profile.id}:${key}`);

  /** Switch a section between the dashboard's value and this profile's own (one undo step). */
  const setScope = (section: ScopedSection, scope: LookScope) =>
    setConfig((c) => withScope(c, profile.id, section, scope));

  /** Set the corner radius of the Theme's scope (same-scope edits coalesce). */
  const setRadius = (scope: LookScope, radius: number) =>
    setConfig((c) => withRadius(c, profile.id, scope, radius), `radius:${scope}:${profile.id}`);

  /** Set this profile's own frame rate or animations. */
  const setPerformance = (patch: Parameters<typeof withPerformance>[1]) =>
    updateProfile((p) => ({ ...p, performance: withPerformance(p.performance, patch) }), "profile:performance");

  /** "Apply to every widget": lock all of this profile's widget-theme sections, or none. */
  const toggleLocks = () => updateProfile((p) => ({ ...p, widgetTheme: toggleLockAll(p.widgetTheme) }), "profile:locks");

  /** Set one general setting (same-key edits coalesce in undo). */
  const setGeneral = <K extends keyof GeneralSettings>(key: K, value: GeneralSettings[K]) =>
    setConfig((c) => ({ ...c, general: withGeneral(c.general, key, value) }), `general:${key}`);

  const props: Omit<DocumentInspectorProps, "jumpTo"> = {
    config,
    theme: config.theme,
    radius: config.radius,
    onToken: (key, value) =>
      setConfig((c) => ({ ...c, theme: { ...c.theme, [key]: value } as ThemeTokens }), `theme:${key}`),
    onThemePreset: applyPreset,
    dashboardStyle: config.style,
    onStyle: setScopeStyle,
    presets: appearancePresets,
    background: config.background,
    profile,
    onProfileTheme: setProfileTheme,
    onBackground: setBackground,
    onScope: setScope,
    onRadius: setRadius,
    onPerformance: setPerformance,
    onToggleLocks: toggleLocks,
    general: config.general,
    onGeneral: setGeneral,
    dataApiUrl: config.dataApiUrl,
    onDataApiUrl: (dataApiUrl) => setConfig((c) => ({ ...c, dataApiUrl }), "data-api-url"),
  };
  return { props, setScopeStyle, appearancePresets };
}
