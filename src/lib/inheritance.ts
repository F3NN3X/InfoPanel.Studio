import type { ModuleSettings } from "@/modules/types";
import { resolveBackground, type PageBackground } from "./appearance";
import { GENERAL_DEFAULTS, resolveFont, type GeneralFont, type MotionChoice } from "./general";
import type { DashboardConfig, MonitorProfile, Placement, ProfilePage } from "./layout";
import { appLayer } from "./style-resolve";
import { DEFAULT_RADIUS, DEFAULT_THEME, resolveTheme, type ThemeTokens } from "./theme";
import {
  isLocked,
  pageCustom,
  SECTION_KEYS,
  themeVal,
  type SectionId,
  type ThemeLevels,
} from "./theme-model";

/**
 * Where a setting's value comes from, per section, for the inheritance
 * chip (SPEC §5) — one call over the existing resolvers:
 *
 * - the 11 widget-style sections (`theme-model.ts`): built-in (and the
 *   app's clock) → Screen (`widgetTheme.values` + locks) → Page (a section
 *   the page customises) → Widget (`follow[section] === false`);
 * - the screen's data (`resolveTheme`, `resolveBackground`, its
 *   performance, `resolveFont`): built-in → Screen; its pages and widgets
 *   read the screen's.
 *
 * A level "sets" a widget-style section when it holds a value for any of
 * its keys (a page or widget: when it customises it). Pure; the edits are
 * `components/studio/inheritance-actions.ts`.
 */

/** The chip's states (SPEC §5). */
export type InheritState = "inherited" | "custom" | "locked" | "base" | "builtin";

/** The level a chip names: Screen or Page; a panel's widget (an item) also has its Panel. */
export type InheritLevel = "screen" | "page" | "panel";

/** The screen's data: color tokens + corner radius, the page background, performance and the page font. */
export type DataPath = "tokens" | "background" | "performance" | "font";

/** What a chip describes: a widget-style section, or one of the screen's data. */
export type InheritPath = SectionId | DataPath;

export const DATA_PATHS: readonly DataPath[] = ["tokens", "background", "performance", "font"];

export const isDataPath = (path: InheritPath): path is DataPath => DATA_PATHS.includes(path as DataPath);

/** The level a chip sits at, with the ids that find it in the config. */
export type InheritScope =
  | { level: "screen"; profileId: string }
  | { level: "page"; profileId: string; pageId: string }
  | { level: "widget"; profileId: string; pageId: string; zoneId: string };

/** The resolved performance pair. */
export interface PerformanceValue {
  maxFps: number;
  motion: MotionChoice;
}

/** A value at a level: a section's keys, the tokens + radius, a background, performance or a font. */
export type InheritValue =
  | ModuleSettings
  | { tokens: ThemeTokens; radius: number }
  | PageBackground
  | PerformanceValue
  | GeneralFont
  | undefined;

export interface Inheritance {
  state: InheritState;
  /**
   * The level the value comes from (inherited), the one Reset returns to
   * (custom) or the lock's (locked); none at a screen (the top level).
   */
  from?: InheritLevel;
  /** That level's name: the screen's or the page's name. */
  fromName?: string;
  /** What shows at this scope. */
  resolvedValue: InheritValue;
  /** What would show without this level ("Without it: …"). */
  parentValue: InheritValue;
  /** Locked, but this page or widget keeps its own values for the section (they return on unlock). */
  keptOverride: boolean;
}

export const LEVEL_LABELS: Readonly<Record<InheritLevel, string>> = {
  screen: "Screen",
  page: "Page",
  panel: "Panel",
};

const sets = (values: ModuleSettings | undefined, sec: SectionId): boolean =>
  SECTION_KEYS[sec].some((key) => values?.[key] !== undefined);

/** A section's keys under some levels (the theme's built-ins where none sets them). */
const sectionValues = (levels: ThemeLevels, sec: SectionId): ModuleSettings =>
  Object.fromEntries(SECTION_KEYS[sec].map((key) => [key, themeVal(levels, key)])) as ModuleSettings;

/** A section's keys on a custom widget: its own values over the theme's. */
const ownValues = (levels: ThemeLevels, zone: Placement, sec: SectionId): ModuleSettings =>
  Object.fromEntries(SECTION_KEYS[sec].map((key) => [key, zone.settings?.[key] ?? themeVal(levels, key)])) as ModuleSettings;

interface Found {
  profile?: MonitorProfile;
  page?: ProfilePage;
  zone?: Placement;
}

function find(config: DashboardConfig, scope: InheritScope): Found {
  const profile = config.profiles.find((p) => p.id === scope.profileId);
  if (scope.level === "screen") return { profile };
  const page = profile?.pages.find((pg) => pg.id === scope.pageId);
  if (scope.level === "page") return { profile, page };
  return { profile, page, zone: page?.placements.find((z) => z.id === scope.zoneId) };
}

const named = (level: InheritLevel, found: Found): Pick<Inheritance, "from" | "fromName"> => ({
  from: level,
  fromName: level === "screen" ? found.profile?.name : found.page?.name,
});

/** A widget-style section at a scope (see the module comment). */
export function styleInheritance(config: DashboardConfig, scope: InheritScope, sec: SectionId): Inheritance {
  const found = find(config, scope);
  const base: ThemeLevels = { base: appLayer(config.general) };
  const screen: ThemeLevels = { ...base, profile: found.profile?.widgetTheme };
  if (scope.level === "screen" || !found.profile) {
    return {
      state: sets(found.profile?.widgetTheme?.values, sec) ? "base" : "builtin",
      resolvedValue: sectionValues(screen, sec),
      parentValue: sectionValues(base, sec),
      keptOverride: false,
    };
  }
  const levels: ThemeLevels = { ...screen, page: found.page?.widgetTheme };
  const locked = isLocked(levels, sec);
  if (scope.level === "page") {
    const own = found.page?.widgetTheme?.follow?.[sec] === false;
    return {
      state: locked ? "locked" : own ? "custom" : "inherited",
      ...named("screen", found),
      resolvedValue: sectionValues(levels, sec),
      parentValue: sectionValues(screen, sec),
      keptOverride: locked && own,
    };
  }
  const zone = found.zone;
  const own = zone?.follow?.[sec] === false;
  const parent: InheritLevel = !locked && pageCustom(levels, sec) ? "page" : "screen";
  return {
    state: locked ? "locked" : own ? "custom" : "inherited",
    ...named(parent, found),
    resolvedValue: own && !locked && zone ? ownValues(levels, zone, sec) : sectionValues(levels, sec),
    parentValue: sectionValues(levels, sec),
    keptOverride: locked && own,
  };
}

/** Whether a screen holds its own value (else the built-in default shows). */
function screenSets(profile: MonitorProfile, path: DataPath): boolean {
  switch (path) {
    case "tokens":
      return profile.theme !== undefined || profile.radius !== undefined;
    case "background":
      return profile.background !== undefined;
    case "performance":
      return profile.performance !== undefined;
    case "font":
      return profile.font !== undefined;
  }
}

/** A screen's value of its data. */
function dataValue(path: DataPath, profile: MonitorProfile): InheritValue {
  switch (path) {
    case "tokens":
      return resolveTheme(profile);
    case "background":
      return resolveBackground(profile);
    case "performance":
      return {
        maxFps: profile.performance?.maxFps ?? GENERAL_DEFAULTS.maxFps,
        motion: profile.performance?.motion ?? GENERAL_DEFAULTS.motion,
      };
    case "font":
      return resolveFont(profile);
  }
}

const builtinValue = (path: DataPath): InheritValue =>
  path === "tokens"
    ? { tokens: DEFAULT_THEME, radius: DEFAULT_RADIUS }
    : path === "background"
      ? undefined
      : path === "performance"
        ? { maxFps: GENERAL_DEFAULTS.maxFps, motion: GENERAL_DEFAULTS.motion }
        : GENERAL_DEFAULTS.font;

/**
 * A screen's data at a scope. A page or widget has no level of its own
 * (SPEC §4.2): it reads its screen's value, inherited from the screen.
 */
export function dataInheritance(config: DashboardConfig, scope: InheritScope, path: DataPath): Inheritance {
  const { profile } = find(config, scope);
  if (!profile) return { state: "builtin", resolvedValue: builtinValue(path), parentValue: builtinValue(path), keptOverride: false };
  const value = dataValue(path, profile);
  if (scope.level === "screen") {
    return { state: screenSets(profile, path) ? "base" : "builtin", resolvedValue: value, parentValue: builtinValue(path), keptOverride: false };
  }
  return { state: "inherited", ...named("screen", { profile }), resolvedValue: value, parentValue: value, keptOverride: false };
}

/** Any chip's resolution. */
export const resolveInheritance = (config: DashboardConfig, path: InheritPath, scope: InheritScope): Inheritance =>
  isDataPath(path) ? dataInheritance(config, scope, path) : styleInheritance(config, scope, path);

/** The chip menu's value text: a section's first set key, the radius, the background kind, "60 fps", the font. */
export function valueText(path: InheritPath, value: InheritValue): string {
  if (value === undefined) return "none";
  if (typeof value === "string") return value;
  if (path === "tokens" && "radius" in value) return `radius ${value.radius} rem`;
  if (path === "background" && "type" in value) return typeof value.type === "string" ? value.type : "none";
  if (path === "performance" && "maxFps" in value) return value.maxFps === 0 ? "unlimited fps" : `${value.maxFps} fps`;
  const settings = value as ModuleSettings;
  const first = isDataPath(path) ? undefined : SECTION_KEYS[path].map((key) => settings[key]).find((v) => v !== "" && v !== undefined);
  return first === undefined ? "default" : String(first);
}
