import type { BackgroundScope } from "@/lib/appearance";
import { presetTokens, type AppearancePreset } from "@/lib/appearance-presets";
import type { DashboardConfig, MonitorProfile, ProfileView } from "@/lib/layout";
import { allLocked, withAllLocked } from "@/lib/theme-model";
import type { ThemeTokens } from "@/lib/theme";
import type { ModuleSettings } from "@/modules/types";
import { setProfileStyle } from "./studio-actions";

/**
 * Edits of the global style: the dashboard's ("All profiles") style or a
 * profile's theme values, the force switch (every section of the profile
 * theme locked), and the widgets' follow choice. Pure config → config
 * updates, each one undo step (same-key edits coalesce:
 * `appearance-style:<scope>`, `style-enforce:<scope>`).
 */

/** Which global style an edit targets (the page background's scopes). */
export type StyleScope = BackgroundScope;

const scopeId = (scope: StyleScope) => (scope.kind === "all" ? "all" : scope.profileId);

/** Undo-coalescing key for style edits in a scope. */
export const styleKey = (scope: StyleScope): string => `appearance-style:${scopeId(scope)}`;

/** Undo-coalescing key for the force switch of a scope. */
export const enforceKey = (scope: StyleScope): string => `style-enforce:${scopeId(scope)}`;

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

/** Lock every section of the profile theme, or none: of every profile ("All profiles") or one. */
export function withStyleEnforce(config: DashboardConfig, scope: StyleScope, on: boolean): DashboardConfig {
  const lock = (p: MonitorProfile): MonitorProfile => ({ ...p, widgetTheme: withAllLocked(p.widgetTheme, on) });
  return inScope(config, scope, (c) => ({ ...c, profiles: c.profiles.map(lock) }), lock);
}

/** Whether the force switch of a scope is on: every section locked (in every profile, for "All profiles"). */
export function isForced(config: DashboardConfig, scope: StyleScope): boolean {
  const profiles = scope.kind === "all" ? config.profiles : config.profiles.filter((p) => p.id === scope.profileId);
  return profiles.length > 0 && profiles.every((p) => allLocked(p.widgetTheme));
}

/** Every widget of a profile follows the theme in every section (their own values stay stored). */
export function followAll(profile: ProfileView): ProfileView {
  if (profile.placements.every((p) => p.follow === undefined)) return profile;
  return {
    ...profile,
    placements: profile.placements.map(({ follow: _f, ...p }) => p),
  };
}

/** The palette's force toggle: this profile's sections all locked, or none. */
export function toggleEnforce(config: DashboardConfig, profile: Pick<ProfileView, "id" | "widgetTheme">): DashboardConfig {
  return withStyleEnforce(config, { kind: "profile", profileId: profile.id }, !allLocked(profile.widgetTheme));
}

/** The toast after applying a preset. */
export const appliedMessage = (name: string, target: "all" | "profile"): string =>
  `Applied ${name} to ${target === "all" ? "all profiles" : "this profile"}`;

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
