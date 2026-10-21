import type { BackgroundScope } from "@/lib/appearance";
import { presetTokens, type AppearancePreset } from "@/lib/appearance-presets";
import type { DashboardConfig, MonitorProfile, ProfileView } from "@/lib/layout";
import { allLocked, withAllLocked } from "@/lib/theme-model";
import type { ThemeTokens } from "@/lib/theme";
import type { ModuleSettings } from "@/modules/types";
import { setProfileStyle } from "./studio-actions";

/**
 * Edits of the Appearance tab's style: the dashboard's ("All profiles")
 * style or a profile's theme values, the palette's lock-all of the profile
 * theme, and the widgets' follow choice. Pure config → config updates, each
 * one undo step (same-key edits coalesce: `appearance-style:<scope>`).
 */

/** Which global style an edit targets (the page background's scopes). */
export type StyleScope = BackgroundScope;

const scopeId = (scope: StyleScope) => (scope.kind === "all" ? "all" : scope.profileId);

/** Undo-coalescing key for style edits in a scope. */
export const styleKey = (scope: StyleScope): string => `appearance-style:${scopeId(scope)}`;

/** Map the profile a scope targets (the config itself for "all"). */
function inScope(
  config: DashboardConfig,
  scope: StyleScope,
  all: (c: DashboardConfig) => DashboardConfig,
  one: (p: MonitorProfile) => MonitorProfile
): DashboardConfig {
  if (scope.kind === "all") return all(config);
  return { ...config, profiles: config.profiles.map((p) => (p.id === scope.profileId ? one(p) : p)) };
}

/** An empty style is stored as none. */
const orNone = (style: ModuleSettings): ModuleSettings | undefined =>
  Object.keys(style).length > 0 ? style : undefined;

/** Update the style of a scope. */
export function withScopeStyle(
  config: DashboardConfig,
  scope: StyleScope,
  fn: (style: ModuleSettings) => ModuleSettings
): DashboardConfig {
  return inScope(
    config,
    scope,
    (c) => ({ ...c, style: orNone(fn(c.style ?? {})) }),
    (p) => setProfileStyle(p, fn)
  );
}

/** Every widget of a profile follows the theme in every section (their own values stay stored). */
export function followAll(profile: ProfileView): ProfileView {
  if (profile.placements.every((p) => p.follow === undefined)) return profile;
  return {
    ...profile,
    placements: profile.placements.map(({ follow: _f, ...p }) => p),
  };
}

/** The palette's lock-all toggle: this profile's theme sections all locked, or none (locks are per profile). */
export function toggleEnforce(config: DashboardConfig, profile: Pick<ProfileView, "id" | "widgetTheme">): DashboardConfig {
  const on = !allLocked(profile.widgetTheme);
  const lock = (p: MonitorProfile): MonitorProfile => ({ ...p, widgetTheme: withAllLocked(p.widgetTheme, on) });
  return { ...config, profiles: config.profiles.map((p) => (p.id === profile.id ? lock(p) : p)) };
}

/**
 * The preset the current look is: same theme colours, corner radius and
 * every style key the preset sets (the first match; undefined = a custom look).
 */
export function activePresetId(
  presets: readonly AppearancePreset[],
  look: { tokens: ThemeTokens; radius: number; style: ModuleSettings | undefined }
): string | undefined {
  const tokens = JSON.stringify(look.tokens);
  return presets.find(
    (p) =>
      p.radius === look.radius &&
      JSON.stringify(presetTokens(p)) === tokens &&
      Object.entries(p.style).every(([key, value]) => look.style?.[key] === value)
  )?.id;
}
