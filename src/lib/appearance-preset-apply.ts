import { THEME_SETTINGS } from "@/modules/standard-settings";
import { settingKeys, type ModuleSettings } from "@/modules/types";
import type { BackgroundScope, PageBackground } from "./appearance";
import { presetTokens, type AppearancePreset } from "./appearance-presets";
import type { DashboardConfig, MonitorProfile, Placement } from "./layout";
import { allPlacements, mapPlacements } from "./pages";
import { resolveTheme } from "./theme";
import { ownApplies, themedOf, withThemeValues, type ThemeLevels } from "./theme-model";

/**
 * Applying an appearance preset, and the widgets that would hide it.
 * Pure config → config; the studio sets each result in one call (one
 * undo step, no coalescing key).
 *
 * Scopes (the Appearance tab's switch):
 * - "All profiles": theme tokens + radius, `config.style` (replaced
 *   wholesale) and, see below, `config.background`.
 * - "This profile": the profile's own theme colours + radius
 *   (`MonitorProfile.theme` / `radius`, over the dashboard's), its widget
 *   theme's values and `background`; other profiles keep theirs. Look keys
 *   the dashboard style sets but the preset doesn't are written as their
 *   defaults, so the profile shows the preset's look, not a blend.
 *
 * The background is written only when asked (`includeBackground`) or,
 * by default, when the scope has none yet; presets without one never
 * clear it. Content keys and widgets are never touched.
 */

export type PresetScope = BackgroundScope;

export interface ApplyOptions {
  /** Replace the scope's background with the preset's (default: only when it has none). */
  includeBackground?: boolean;
}

/** Whether a background shows nothing (unset, or media without a file or fill). */
function isEmptyBackground(bg: PageBackground | undefined, scope: PresetScope): boolean {
  if (!bg) return true;
  // A profile's "none" turns the dashboard's off on purpose; the dashboard's is just empty.
  if (bg.type === "none") return scope.kind === "all";
  return (bg.type === "image" || bg.type === "video") && !bg.src && !bg.color;
}

function nextBackground(
  current: PageBackground | undefined,
  preset: AppearancePreset,
  scope: PresetScope,
  options: ApplyOptions
): PageBackground | undefined {
  if (!preset.background) return current;
  const write = options.includeBackground ?? isEmptyBackground(current, scope);
  return write ? { ...preset.background } : current;
}

const LOOK_DEFAULTS: ModuleSettings = Object.fromEntries(
  THEME_SETTINGS.flatMap((s) => settingKeys(s).map((key) => [key, s.default]))
);

/** A profile's style for a preset: the dashboard's keys it leaves unset reset to their defaults. */
function profileStyle(config: DashboardConfig, style: ModuleSettings): ModuleSettings {
  const shadowed = Object.keys(config.style ?? {}).filter((key) => !(key in style) && key in LOOK_DEFAULTS);
  return { ...Object.fromEntries(shadowed.map((key) => [key, LOOK_DEFAULTS[key]])), ...style };
}

const orNone = (style: ModuleSettings): ModuleSettings | undefined =>
  Object.keys(style).length > 0 ? style : undefined;

/** Apply a preset to a scope (see the module comment). */
export function applyAppearancePreset(
  config: DashboardConfig,
  preset: AppearancePreset,
  scope: PresetScope,
  options: ApplyOptions = {}
): DashboardConfig {
  const style = themedOf(preset.style);
  if (scope.kind === "all") {
    return {
      ...config,
      theme: { ...presetTokens(preset) },
      radius: preset.radius,
      style: orNone(style),
      background: nextBackground(config.background, preset, scope, options),
    };
  }
  return {
    ...config,
    profiles: config.profiles.map((p) =>
      p.id === scope.profileId
        ? {
            ...p,
            theme: { ...presetTokens(preset) },
            radius: preset.radius,
            // A profile that had its own style keeps it, even when the preset leaves it empty.
            widgetTheme: withThemeValues(
              p.widgetTheme,
              orNone(profileStyle(config, style)) ?? (p.widgetTheme?.values !== undefined ? {} : undefined)
            ),
            background: nextBackground(p.background, preset, scope, options),
          }
        : p
    ),
  };
}

/* ---------------- overrides ---------------- */

const inScope = (config: DashboardConfig, scope: PresetScope): MonitorProfile[] =>
  scope.kind === "all" ? config.profiles : config.profiles.filter((p) => p.id === scope.profileId);

/** A widget whose own look shows over the global style: own themed values in a custom, unlocked section. */
function hidesGlobal(p: Placement, levels: ThemeLevels): boolean {
  return Object.keys(themedOf(p.settings)).some((key) => ownApplies(levels, p, key));
}

/** The levels a profile's widgets resolve under, as far as following goes (its locks). */
const levelsOf = (profile: MonitorProfile): ThemeLevels => ({ profile: profile.widgetTheme });

/** The widgets in a scope whose own look hides the global style. */
export function countOverrides(config: DashboardConfig, scope: PresetScope): number {
  return inScope(config, scope).reduce((n, profile) => {
    const levels = levelsOf(profile);
    return n + allPlacements(profile).filter((p) => hidesGlobal(p, levels)).length;
  }, 0);
}

/** Whether a profile has its own look (theme values, theme colours or radius) over the dashboard's. */
const hasOwnLook = (p: MonitorProfile): boolean =>
  Object.keys(p.widgetTheme?.values ?? {}).length > 0 || p.theme !== undefined || p.radius !== undefined;

/** "All profiles" only: the profiles whose own look overrides the dashboard's. */
export function countProfileOverrides(config: DashboardConfig, scope: PresetScope): number {
  if (scope.kind !== "all") return 0;
  return config.profiles.filter(hasOwnLook).length;
}

/**
 * Let the global style through: the overriding widgets follow it in every
 * section (their own looks stay stored) and, for "All profiles", the
 * profiles' own theme values, theme colours and radius are dropped (their
 * locks stay).
 */
export function clearOverrides(config: DashboardConfig, scope: PresetScope): DashboardConfig {
  const ids = new Set(inScope(config, scope).map((p) => p.id));
  return {
    ...config,
    profiles: config.profiles.map((profile) => {
      if (!ids.has(profile.id)) return profile;
      const levels = levelsOf(profile);
      const followed = mapPlacements(profile, (p) => {
        if (!hidesGlobal(p, levels)) return p;
        const { follow: _f, ...rest } = p;
        return rest;
      });
      return scope.kind === "all"
        ? { ...followed, widgetTheme: withThemeValues(followed.widgetTheme, undefined), theme: undefined, radius: undefined }
        : followed;
    }),
  };
}

/* ---------------- the user's presets ---------------- */

/** The current look of a scope as a preset (the profile's own theme and theme values over the dashboard's). */
export function presetFromCurrent(
  config: DashboardConfig,
  scope: PresetScope,
  id: string,
  name: string
): AppearancePreset {
  const profile = scope.kind === "profile" ? config.profiles.find((p) => p.id === scope.profileId) : undefined;
  const style = themedOf({ ...config.style, ...profile?.widgetTheme?.values });
  const background = profile?.background ?? config.background;
  const theme = resolveTheme(config, profile);
  return {
    id,
    name,
    description: "Saved look",
    theme: { ...theme.tokens },
    radius: theme.radius,
    style,
    ...(background && !isEmptyBackground(background, { kind: "all" }) ? { background: { ...background } } : {}),
  };
}

export function saveAppearancePreset(
  config: DashboardConfig,
  scope: PresetScope,
  id: string,
  name: string
): DashboardConfig {
  const preset = presetFromCurrent(config, scope, id, name);
  return { ...config, appearancePresets: [...(config.appearancePresets ?? []), preset] };
}

export function renameAppearancePreset(config: DashboardConfig, id: string, name: string): DashboardConfig {
  return {
    ...config,
    appearancePresets: config.appearancePresets?.map((p) => (p.id === id ? { ...p, name } : p)),
  };
}

/** Delete a user preset; the last one leaves no list behind. */
export function deleteAppearancePreset(config: DashboardConfig, id: string): DashboardConfig {
  const rest = config.appearancePresets?.filter((p) => p.id !== id) ?? [];
  return { ...config, appearancePresets: rest.length > 0 ? rest : undefined };
}
