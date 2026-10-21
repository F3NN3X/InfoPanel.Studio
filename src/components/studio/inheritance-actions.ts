import { withBackground } from "@/lib/appearance";
import { withGeneral } from "@/lib/general";
import { isDataPath, type DataPath, type Inheritance, type InheritPath, type InheritScope } from "@/lib/inheritance";
import type { DashboardConfig, Placement } from "@/lib/layout";
import type { ModuleSettings } from "@/modules/types";
import { DEFAULT_THEME } from "@/lib/theme";
import { isLocked, SECTION_IDS, SECTION_KEYS, type SectionId } from "@/lib/theme-model";
import type { MakeThemeTarget } from "./inherit-chip";
import { withFollow } from "./inspector/zone-fields";
import { withScope, type ScopedSection } from "./inspector/profile-scope";
import { dropKeys } from "./settings-model";
import type { NavTarget } from "./studio-nav";
import { withPageFollow, withScopeValues, type ThemeScope } from "./theme-editor-model";

/**
 * The inheritance chip's edits (SPEC §5) as config → config updates, on the
 * existing writers: Reset to inherited / Reset to built-in, Customise here,
 * and where "Edit ‹level› ↗" goes. A page's or widget's Reset keeps its own
 * values stored (as Use profile / Use theme did); they return on Customise.
 */

/** The profile-scope switch of each two-level datum. */
const SCOPED: Readonly<Record<DataPath, ScopedSection>> = {
  tokens: "theme",
  background: "background",
  performance: "performance",
  font: "font",
};

/** The config with one widget's section following (`true`) or custom; its own values stay stored. */
function withZone(config: DashboardConfig, scope: Extract<InheritScope, { level: "widget" }>, sec: SectionId, follows: boolean): DashboardConfig {
  return {
    ...config,
    profiles: config.profiles.map((p) =>
      p.id !== scope.profileId
        ? p
        : {
            ...p,
            pages: p.pages.map((pg) =>
              pg.id !== scope.pageId
                ? pg
                : { ...pg, placements: pg.placements.map((z) => (z.id === scope.zoneId ? withFollow(z, sec, follows) : z)) }
            ),
          }
    ),
  };
}

/** All screens back to the built-in default of a two-level datum ("Reset to built-in"). */
function dataBuiltin(config: DashboardConfig, path: DataPath): DashboardConfig {
  switch (path) {
    case "tokens":
      return { ...config, theme: { ...DEFAULT_THEME }, radius: 0.5 };
    case "background":
      return withBackground(config, { kind: "all" }, undefined);
    case "performance":
      return { ...config, general: withGeneral(withGeneral(config.general, "maxFps", undefined), "motion", undefined) };
    case "font":
      return { ...config, general: withGeneral(config.general, "font", undefined) };
  }
}

const sectionKeys = (sec: SectionId): ReadonlySet<string> => new Set(SECTION_KEYS[sec]);

/**
 * Reset at a scope: All screens to the built-in default, a screen to All
 * screens (its values for the section dropped), a page or widget to the
 * level above (it follows again).
 */
export function resetInheritance(config: DashboardConfig, path: InheritPath, scope: InheritScope): DashboardConfig {
  if (isDataPath(path)) {
    if (scope.level === "all") return dataBuiltin(config, path);
    return scope.level === "screen" ? withScope(config, scope.profileId, SCOPED[path], "all") : config;
  }
  const keys = sectionKeys(path);
  switch (scope.level) {
    case "all":
      return withScopeValues(config, "", { kind: "base" }, (v) => dropKeys(v, keys) ?? {});
    case "screen":
      return withScopeValues(config, scope.profileId, { kind: "profile" }, (v) => dropKeys(v, keys) ?? {});
    case "page":
      return withPageFollow(config, scope.profileId, scope.pageId, path, true);
    case "widget":
      return withZone(config, scope, path, true);
  }
}

/**
 * Customise here: a screen takes All screens' value as its own (a section:
 * the keys All screens sets, so a widget kind's own defaults still apply;
 * none set = nothing to copy, editing a control customises it); a page or
 * widget stops following (its kept values, if any, apply again). All
 * screens, and the pages and widgets of two-level data, have nothing to customise.
 */
export function customiseInheritance(config: DashboardConfig, path: InheritPath, scope: InheritScope): DashboardConfig {
  if (isDataPath(path)) return scope.level === "screen" ? withScope(config, scope.profileId, SCOPED[path], "profile") : config;
  switch (scope.level) {
    case "all":
      return config;
    case "screen": {
      const keys = sectionKeys(path);
      const base = Object.fromEntries(Object.entries(config.style ?? {}).filter(([key]) => keys.has(key)));
      return Object.keys(base).length > 0
        ? withScopeValues(config, scope.profileId, { kind: "profile" }, (v) => ({ ...base, ...v }))
        : config;
    }
    case "page":
      return withPageFollow(config, scope.profileId, scope.pageId, path, false);
    case "widget":
      return withZone(config, scope, path, false);
  }
}

/** The Theme card a widget-style section is edited in, where it is not its own (`theme-cards.ts`). */
const THEME_CARD_OF: Partial<Record<SectionId, string>> = { palette: "colors", skin: "surface" };

/** Where a datum lives in Theme's section list (tokens: Colors; the page font: Typography). */
const THEME_SECTION: Readonly<Record<Exclude<DataPath, "performance">, string>> = {
  tokens: "colors",
  background: "background",
  font: "type",
};

/**
 * Where "Edit ‹level› ↗" goes: the level the chip names, at that scope of
 * Theme with the section open (performance: Settings › Dashboard or the
 * screen in Screens). Locked: Theme at Screen scope. None for base / built-in.
 */
export function inheritanceJump(inheritance: Inheritance, path: InheritPath, scope: InheritScope): NavTarget | undefined {
  const { from } = inheritance;
  if (!from || scope.level === "all") return undefined;
  const profileId = scope.profileId;
  if (path === "performance") {
    return from === "all"
      ? { view: "settings", tab: "dashboard", section: "performance" }
      : { view: "screens", profileId, section: "performance" };
  }
  const themeScope: ThemeScope =
    from === "all" ? { kind: "base" } : from === "page" && scope.level !== "screen" ? { kind: "page", pageId: scope.pageId } : { kind: "profile" };
  return { view: "theme", themeScope, profileId, section: isDataPath(path) ? THEME_SECTION[path] : (THEME_CARD_OF[path] ?? path) };
}

type WidgetScope = Extract<InheritScope, { level: "widget" }>;

const zoneOf = (config: DashboardConfig, scope: WidgetScope): Placement | undefined =>
  config.profiles.find((p) => p.id === scope.profileId)?.pages.find((pg) => pg.id === scope.pageId)?.placements.find((z) => z.id === scope.zoneId);

/**
 * The sections "Make this the theme" would move: the widget's custom ones (a locked section is the screen's,
 * its widget values stay inactive). `only` narrows it to a chip's own sections.
 */
export function makeThemeSections(config: DashboardConfig, scope: WidgetScope, only?: readonly SectionId[]): SectionId[] {
  const zone = zoneOf(config, scope);
  const profile = config.profiles.find((p) => p.id === scope.profileId);
  if (!zone || !profile) return [];
  const levels = { base: config.style, profile: profile.widgetTheme };
  return SECTION_IDS.filter((sec) => zone.follow?.[sec] === false && !isLocked(levels, sec) && (!only || only.includes(sec)));
}

/**
 * Make a widget's custom sections the theme of a scope (All screens, its screen or its page; a page also
 * customises them), then reset them on the widget: the values move, the widget follows the theme again.
 */
export function makeTheme(config: DashboardConfig, scope: WidgetScope, target: MakeThemeTarget, only?: readonly SectionId[]): DashboardConfig {
  const secs = makeThemeSections(config, scope, only);
  const zone = zoneOf(config, scope);
  if (!zone || secs.length === 0) return config;
  const moved: ModuleSettings = {};
  for (const sec of secs) for (const key of SECTION_KEYS[sec]) if (zone.settings?.[key] !== undefined) moved[key] = zone.settings[key];
  const themeScope: ThemeScope = target === "all" ? { kind: "base" } : target === "screen" ? { kind: "profile" } : { kind: "page", pageId: scope.pageId };
  const written = withScopeValues(config, scope.profileId, themeScope, (v) => ({ ...v, ...moved }));
  const flagged = target === "page" ? secs.reduce((c, sec) => withPageFollow(c, scope.profileId, scope.pageId, sec, false), written) : written;
  const drop = new Set(secs.flatMap((sec) => SECTION_KEYS[sec]));
  const reset = (z: Placement): Placement => ({ ...secs.reduce((acc, sec) => withFollow(acc, sec, true), z), settings: dropKeys(z.settings, drop) });
  return {
    ...flagged,
    profiles: flagged.profiles.map((p) =>
      p.id !== scope.profileId
        ? p
        : {
            ...p,
            pages: p.pages.map((pg) =>
              pg.id !== scope.pageId ? pg : { ...pg, placements: pg.placements.map((z) => (z.id === scope.zoneId ? reset(z) : z)) }
            ),
          }
    ),
  };
}
