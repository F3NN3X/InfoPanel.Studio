import { THEME_SETTINGS } from "@/modules/standard-settings";
import { settingKeys, type ModuleSettings } from "@/modules/types";
import type { BackgroundScope, PageBackground } from "./appearance";
import { presetTokens, type AppearancePreset } from "./appearance-presets";
import type { DashboardConfig } from "./layout";
import { resolveTheme } from "./theme";
import { pageCustom, SECTION_IDS, SECTION_KEYS, themedOf, withSectionFlag, withThemeValues, type ThemeLevels } from "./theme-model";

/**
 * Applying a Theme (an appearance preset), and saving one.
 * Pure config → config; the studio sets each result in one call (one
 * undo step, no coalescing key).
 *
 * Scopes (Theme's scope bar):
 * - All screens: theme tokens + radius, `config.style` (replaced
 *   wholesale) and, see below, `config.background`.
 * - A screen: the profile's own theme colours + radius
 *   (`MonitorProfile.theme` / `radius`, over the dashboard's), its widget
 *   theme's values and `background`; other profiles keep theirs. Look keys
 *   the dashboard style sets but the preset doesn't are written as their
 *   defaults, so the profile shows the preset's look, not a blend.
 *
 * - A page: only the widget-style sections the preset sets (a page has no
 *   colour tokens, radius or background, SPEC §4.2): the page's values for
 *   them are replaced and it customises them; sections its screen locks
 *   are left alone.
 *
 * The background is written only when asked (`includeBackground`) or,
 * by default, when the scope has none yet; presets without one never
 * clear it. Content keys and widgets are never touched.
 */

export type PresetScope = BackgroundScope;

/** Where Theme applies or saves a Theme: All screens, a screen, or one of its pages. */
export type ThemeTarget = PresetScope | { kind: "page"; profileId: string; pageId: string };

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

/** A preset's widget style written as a page's own, section by section (see the module comment). */
function applyToPage(config: DashboardConfig, preset: AppearancePreset, profileId: string, pageId: string): DashboardConfig {
  const style = themedOf(preset.style);
  return {
    ...config,
    profiles: config.profiles.map((p) => {
      if (p.id !== profileId) return p;
      const secs = SECTION_IDS.filter((sec) => p.widgetTheme?.locks?.[sec] !== true && SECTION_KEYS[sec].some((key) => key in style));
      const keys = new Set(secs.flatMap((sec) => SECTION_KEYS[sec]));
      return {
        ...p,
        pages: p.pages.map((pg) => {
          if (pg.id !== pageId) return pg;
          const kept = Object.entries(pg.widgetTheme?.values ?? {}).filter(([key]) => !keys.has(key));
          const values = { ...Object.fromEntries(kept), ...Object.fromEntries(Object.entries(style).filter(([key]) => keys.has(key))) };
          const theme = secs.reduce(
            (t, sec) => withSectionFlag(t, "follow", sec, false),
            withThemeValues(pg.widgetTheme, orNone(values))
          );
          const { widgetTheme: _old, ...rest } = pg;
          return theme ? { ...rest, widgetTheme: theme } : rest;
        }),
      };
    }),
  };
}

/** Apply a Theme at any of Theme's scopes ("Apply a theme here…"); `includeBackground` unset = only where none is set. */
export function applyThemeAt(
  config: DashboardConfig,
  preset: AppearancePreset,
  target: ThemeTarget,
  options: ApplyOptions = {}
): DashboardConfig {
  return target.kind === "page"
    ? applyToPage(config, preset, target.profileId, target.pageId)
    : applyAppearancePreset(config, preset, target, options);
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
    description: "Saved theme",
    theme: { ...theme.tokens },
    radius: theme.radius,
    style,
    ...(background && !isEmptyBackground(background, { kind: "all" }) ? { background: { ...background } } : {}),
  };
}

/**
 * The resolved look of one of Theme's scopes as a Theme ("Save as Theme"): the color tokens and radius, the widget
 * style (a page's customised sections over its screen's) and, unless left out, the background. The page font is not
 * part of a Theme (SPEC §7.1 lists tokens, widget style and background).
 */
export function themeFromScope(
  config: DashboardConfig,
  target: ThemeTarget,
  id: string,
  name: string,
  includeBackground = true
): AppearancePreset {
  const screen: PresetScope = target.kind === "all" ? target : { kind: "profile", profileId: target.profileId };
  const preset = presetFromCurrent(config, screen, id, name);
  const page =
    target.kind === "page" ? config.profiles.find((p) => p.id === target.profileId)?.pages.find((pg) => pg.id === target.pageId) : undefined;
  const profile = target.kind === "page" ? config.profiles.find((p) => p.id === target.profileId) : undefined;
  const levels: ThemeLevels = { profile: profile?.widgetTheme, page: page?.widgetTheme };
  const pageValues = Object.entries(page?.widgetTheme?.values ?? {}).filter(([key]) =>
    SECTION_IDS.some((sec) => SECTION_KEYS[sec].includes(key) && pageCustom(levels, sec))
  );
  const { background, ...rest } = preset;
  return {
    ...rest,
    description: "Saved theme",
    style: themedOf({ ...preset.style, ...Object.fromEntries(pageValues) }),
    ...(includeBackground && background ? { background } : {}),
  };
}

/** Save a scope's look into Library › Themes (`config.appearancePresets`). */
export const saveThemeAt = (
  config: DashboardConfig,
  target: ThemeTarget,
  id: string,
  name: string,
  includeBackground = true
): DashboardConfig => ({
  ...config,
  appearancePresets: [...(config.appearancePresets ?? []), themeFromScope(config, target, id, name, includeBackground)],
});

/**
 * Overwrite a saved Theme with a scope's current look ("Update ‹name›"): the same id, name and description, so
 * what applied it keeps pointing at it. The background is rewritten only when the Theme had one or `includeBackground`
 * says so.
 */
export function updateAppearancePreset(
  config: DashboardConfig,
  id: string,
  target: ThemeTarget,
  includeBackground?: boolean
): DashboardConfig {
  const old = config.appearancePresets?.find((p) => p.id === id);
  if (!old) return config;
  const fresh = themeFromScope(config, target, id, old.name, includeBackground ?? old.background !== undefined);
  return { ...config, appearancePresets: config.appearancePresets?.map((p) => (p.id === id ? { ...fresh, description: old.description } : p)) };
}

/** A copy of a saved Theme named "‹name› copy", right after it. */
export function duplicateAppearancePreset(config: DashboardConfig, id: string, copyId: string): DashboardConfig {
  const list = config.appearancePresets ?? [];
  const at = list.findIndex((p) => p.id === id);
  if (at < 0) return config;
  const copy: AppearancePreset = { ...structuredClone(list[at]), id: copyId, name: `${list[at].name} copy` };
  return { ...config, appearancePresets: [...list.slice(0, at + 1), copy, ...list.slice(at + 1)] };
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
