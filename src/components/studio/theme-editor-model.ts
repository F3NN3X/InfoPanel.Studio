import type { DashboardConfig, MonitorProfile, Placement } from "@/lib/layout";
import { pageOf } from "@/lib/pages";
import { resolveStyle, type Appearance, type StyleSource } from "@/lib/style-resolve";
import {
  isLocked,
  pageCustom,
  sectionOfKey,
  SECTION_IDS,
  withAllLocked,
  withSectionFlag,
  withThemeValues,
  type SectionId,
  type ThemeLevels,
  type WidgetTheme,
} from "@/lib/theme-model";
import { modules } from "@/modules";
import type { ModuleSettings } from "@/modules/types";
import { SHARED_SECTIONS } from "./inspector-categories";
import {
  allSections,
  followInfo,
  followSection,
  rowSection,
  widgetContext,
  type FollowMode,
  type LookValues,
  type ThemeScopeKind,
} from "./inspector-model";
import { withFollow } from "./inspector/zone-fields";
import type { FieldsApi } from "./settings-panel";

/**
 * The theme editor as data (SPEC §7): the level a scope edits, what its
 * rows show, its Follow bars (a profile's Lock, a page's Customize / Use
 * profile), the edits as config → config updates, and the middle
 * column's previews and "Who doesn't follow the theme". Pure.
 *
 * Scopes (owner decision Q1): All profiles (the base layer, no locks) ·
 * the profile theme (values + locks) · each page (values + follow per section).
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

/** What a scope stores (the base layer as a theme of values only). */
export function themeOf(config: DashboardConfig, profile: MonitorProfile, scope: ThemeScope): WidgetTheme | undefined {
  if (scope.kind === "base") return config.style ? { values: config.style } : undefined;
  if (scope.kind === "profile") return profile.widgetTheme;
  return pageOf(profile, scope.pageId).widgetTheme;
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

/** Reset to theme: these zones of a page follow the section again; their own values stay stored. */
export function withZonesFollowing(
  config: DashboardConfig,
  profileId: string,
  pageId: string,
  sec: SectionId,
  ids: readonly string[]
): DashboardConfig {
  const reset = new Set(ids);
  return {
    ...config,
    profiles: config.profiles.map((p) =>
      p.id !== profileId
        ? p
        : {
            ...p,
            pages: p.pages.map((pg) =>
              pg.id !== pageId ? pg : { ...pg, placements: pg.placements.map((z) => (reset.has(z.id) ? withFollow(z, sec, true) : z)) }
            ),
          }
    ),
  };
}

// -- follow bars ------------------------------------------------------------------

/**
 * How many of a page's widgets are custom for a section (what "Who doesn't
 * follow" lists for it): none while the profile locks it, they follow anyway.
 */
export const customCount = (placements: readonly Placement[], levels: ThemeLevels, sec: SectionId): number =>
  isLocked(levels, sec) ? 0 : placements.filter((z) => z.follow?.[sec] === false).length;

export interface ThemeFollowActions {
  /** Profile scope: lock or unlock a section. */
  onLock: (sec: SectionId, on: boolean) => void;
  /** Page scope: Customize (`false`) or Use profile (`true`). */
  onPageFollow: (sec: SectionId, follows: boolean) => void;
}

/**
 * A scope's Follow bars (SPEC §4.1) and read-only rows. Profile: "Default
 * for all widgets · N custom on <page>" (the page `listed` shows) with Lock / Unlock. Page: "Follows the
 * profile theme" with Customize, or "Custom for <page>" with Use profile;
 * a section the profile locks is "Locked by the profile theme" and
 * read-only. The base layer has no bars.
 */
export function themeFollowFields(
  appearance: Appearance,
  listed: { name: string; placements: readonly Placement[] },
  scope: ThemeScopeKind,
  actions: ThemeFollowActions
): Pick<FieldsApi, "follow" | "readOnly"> {
  if (scope === "base") return {};
  const mode = (sec: SectionId): FollowMode =>
    isLocked(appearance, sec) ? "locked" : scope === "page" && pageCustom(appearance, sec) ? "custom" : "theme";
  return {
    follow: (s) => {
      const sec = followSection(s);
      if (!sec) return undefined;
      const { from, level } = followInfo(appearance, undefined, sec);
      if (scope === "profile")
        return {
          mode: mode(sec),
          from,
          level,
          onCustomize: () => {},
          onUseTheme: () => {},
          scope: {
            kind: "profile",
            custom: customCount(listed.placements, appearance, sec),
            pageName: listed.name,
            onLock: (on) => actions.onLock(sec, on),
          },
        };
      return {
        mode: mode(sec),
        from,
        level,
        onCustomize: () => actions.onPageFollow(sec, false),
        onUseTheme: () => actions.onPageFollow(sec, true),
        scope: { kind: "page", pageName: appearance.pageName ?? "this page" },
      };
    },
    readOnly:
      scope === "page"
        ? (def) => {
            const sec = rowSection(def);
            return sec !== undefined && mode(sec) !== "custom";
          }
        : undefined,
  };
}

// -- the middle column ----------------------------------------------------------------

/** The section names "Who doesn't follow" lists (a widget's: Widget colors, not the palette). */
export const sectionTitle = (sec: SectionId): string => SHARED_SECTIONS.find((s) => s.id === sec)?.title ?? sec;

export interface Override {
  sec: SectionId;
  title: string;
  /** The page's widgets custom for the section. */
  zones: Placement[];
  /** The profile locks it: they show the theme anyway (no Reset). */
  locked: boolean;
}

/** "Who doesn't follow the theme": per section, the widgets of a page with it custom. */
export const overridesOf = (placements: readonly Placement[], levels: ThemeLevels): Override[] =>
  SECTION_IDS.map((sec) => ({
    sec,
    title: sectionTitle(sec),
    zones: placements.filter((z) => z.follow?.[sec] === false),
    locked: isLocked(levels, sec),
  }));

/** The three widgets the previews show (SPEC §7). */
export const PREVIEW_MODULES: readonly string[] = ["CpuMonitor", "Weather", "AudioMeter"];

/** The previews' zones: the page's first widget of each kind (its own values and follow), else a fresh one. */
export const previewZones = (placements: readonly Placement[]): Placement[] =>
  PREVIEW_MODULES.map(
    (module) =>
      placements.find((z) => z.module === module) ?? {
        id: `theme-preview:${module}`,
        module,
        colStart: 1,
        rowStart: 1,
        colSpan: 3,
        rowSpan: 2,
        visible: true,
      }
  );

export interface SourceChip {
  sec: SectionId;
  title: string;
  mode: FollowMode;
}

/** A preview's source chips: each followable section of its widget, Theme / Custom / Locked. */
export function sourceChips(zone: Placement, appearance: Appearance): SourceChip[] {
  const mod = modules.find((m) => m.id === zone.module);
  if (!mod) return [];
  const secs = new Set(allSections(widgetContext(mod)).flatMap((s) => followSection(s) ?? []));
  return SECTION_IDS.filter((sec) => secs.has(sec)).map((sec) => ({
    sec,
    title: sectionTitle(sec),
    mode: followInfo(appearance, zone.follow, sec).mode,
  }));
}
