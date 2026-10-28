import type { BackgroundScope } from "@/lib/appearance";
import type { DashboardConfig, MonitorProfile, ProfileView } from "@/lib/layout";
import { allLocked, withAllLocked } from "@/lib/theme-model";
import type { ModuleSettings } from "@/modules/types";
import { setProfileStyle } from "./studio-actions";

/**
 * Edits of the widget style of a screen: its theme values, the palette's
 * lock-all of the profile theme, and the widgets' follow choice. Pure config → config updates, each
 * one undo step (same-key edits coalesce: `appearance-style:<scope>`).
 */

/** Which screen's style an edit targets (the page background's scopes). */
export type StyleScope = BackgroundScope;

/** Undo-coalescing key for style edits in a scope. */
export const styleKey = (scope: StyleScope): string => `appearance-style:${scope.profileId}`;

/** Update the style of a scope. */
export function withScopeStyle(
  config: DashboardConfig,
  scope: StyleScope,
  fn: (style: ModuleSettings) => ModuleSettings
): DashboardConfig {
  return { ...config, profiles: config.profiles.map((p) => (p.id === scope.profileId ? setProfileStyle(p, fn) : p)) };
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
