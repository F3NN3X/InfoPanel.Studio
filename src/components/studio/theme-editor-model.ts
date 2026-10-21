import type { DashboardConfig, MonitorProfile } from "@/lib/layout";
import { pageOf } from "@/lib/pages";
import { resolveStyle, type Appearance, type StyleSource } from "@/lib/style-resolve";
import {
  pageCustom,
  sectionOfKey,
  withAllLocked,
  withSectionFlag,
  withThemeValues,
  type SectionId,
  type ThemeLevels,
  type WidgetTheme,
} from "@/lib/theme-model";
import type { ModuleSettings } from "@/modules/types";
import { SHARED_SECTIONS } from "./inspector-categories";
import type { LookValues, ThemeScopeKind } from "./inspector-model";

/**
 * The theme levels as data (SPEC §7): the level a scope edits, what its
 * rows show and the widget-style edits as config → config updates. Pure.
 * Theme's cards (`theme-cards.ts`) and Exceptions (`theme-exceptions.ts`)
 * build on these.
 *
 * Scopes (owner decision Q1): All screens (the base layer, no locks) ·
 * a screen (values + locks) · each page (values + follow per section).
 */

export type ThemeScope = { kind: "base" } | { kind: "profile" } | { kind: "page"; pageId: string };

/**
 * The scope to show and edit: a page scope whose page is not in this
 * profile (another profile is active, the page was deleted) falls back to
 * the profile theme, so an edit never targets a missing level.
 */
export const validScope = (profile: MonitorProfile, scope: ThemeScope): ThemeScope =>
  scope.kind === "page" && !profile.pages.some((p) => p.id === scope.pageId) ? { kind: "profile" } : scope;

/** A scope's id (undo coalescing, the remembered tab). */
export const scopeId = (scope: ThemeScope): string => (scope.kind === "page" ? `page:${scope.pageId}` : scope.kind);

/** The theme levels a scope's rows and previews resolve under (the levels below it, and its own). */
export function scopeAppearance(config: DashboardConfig, profile: MonitorProfile, scope: ThemeScope): Appearance {
  const page = scope.kind === "page" ? pageOf(profile, scope.pageId) : undefined;
  return {
    base: config.style,
    ...(scope.kind !== "base" ? { profile: profile.widgetTheme } : {}),
    ...(page ? { page: page.widgetTheme } : {}),
    profileName: profile.name,
    pageName: page?.name,
  };
}

const sourcesOf = (keys: Iterable<string>, source: StyleSource): Record<string, StyleSource> =>
  Object.fromEntries([...keys].map((key) => [key, source]));

/**
 * Where a scope's values come from: its own over the levels below it. A
 * page's own value applies only where the page is custom for the section
 * (and the profile does not lock it); the rest shows the profile's.
 */
export function scopeLookValues(levels: ThemeLevels, scope: ThemeScopeKind): LookValues {
  if (scope === "base") return { own: levels.base };
  if (scope === "profile")
    return { own: levels.profile?.values, inherited: levels.base, inheritedFrom: sourcesOf(Object.keys(levels.base ?? {}), "dashboard") };
  const { settings, source } = resolveStyle({ levels: { base: levels.base, profile: levels.profile } });
  return {
    own: levels.page?.values,
    inherited: settings,
    inheritedFrom: source,
    applies: (key) => {
      const sec = sectionOfKey(key);
      return sec !== undefined && pageCustom(levels, sec);
    },
  };
}

// -- edits ----------------------------------------------------------------------

const orNone = (values: ModuleSettings): ModuleSettings | undefined => (Object.keys(values).length > 0 ? values : undefined);

/** The config with a scope's theme replaced (`undefined`: none stored). */
export function withScopeTheme(
  config: DashboardConfig,
  profileId: string,
  scope: ThemeScope,
  fn: (theme: WidgetTheme | undefined) => WidgetTheme | undefined
): DashboardConfig {
  if (scope.kind === "base") {
    const values = fn(config.style ? { values: config.style } : undefined)?.values;
    return { ...config, style: values && orNone(values) };
  }
  const own = <T extends { widgetTheme?: WidgetTheme }>(holder: T): T => {
    const { widgetTheme, ...rest } = holder;
    const next = fn(widgetTheme);
    return (next ? { ...rest, widgetTheme: next } : rest) as T;
  };
  return {
    ...config,
    profiles: config.profiles.map((p) => {
      if (p.id !== profileId) return p;
      if (scope.kind === "profile") return own(p);
      return { ...p, pages: p.pages.map((pg) => (pg.id === scope.pageId ? own(pg) : pg)) };
    }),
  };
}

/** The config with a scope's values edited (an empty map is stored as none). */
export const withScopeValues = (
  config: DashboardConfig,
  profileId: string,
  scope: ThemeScope,
  fn: (values: ModuleSettings) => ModuleSettings
): DashboardConfig =>
  withScopeTheme(config, profileId, scope, (t) => withThemeValues(t, orNone(fn(t?.values ?? {}))));

/** Lock a section of the profile theme (every widget, and every page, then shows the profile's), or unlock it. */
export const withLock = (config: DashboardConfig, profileId: string, sec: SectionId, on: boolean): DashboardConfig =>
  withScopeTheme(config, profileId, { kind: "profile" }, (t) => withSectionFlag(t, "locks", sec, on));

/** The profile theme's "Lock all": every section locked, or none. */
export const withLockAll = (config: DashboardConfig, profileId: string, on: boolean): DashboardConfig =>
  withScopeTheme(config, profileId, { kind: "profile" }, (t) => withAllLocked(t, on));

/** A page's section: Customize (`false`, the page's own values) or Use profile (`true`; its values stay stored). */
export const withPageFollow = (
  config: DashboardConfig,
  profileId: string,
  pageId: string,
  sec: SectionId,
  follows: boolean
): DashboardConfig => withScopeTheme(config, profileId, { kind: "page", pageId }, (t) => withSectionFlag(t, "follow", sec, follows));

/** A section's name (a widget's: Widget colors, not the palette). */
export const sectionTitle = (sec: SectionId): string => SHARED_SECTIONS.find((s) => s.id === sec)?.title ?? sec;
