import type { ModuleSettings } from "@/modules/types";
import type { BackgroundScope, PageBackground } from "./appearance";
import { presetTokens, withoutZoneLook, type AppearancePreset } from "./appearance-presets";
import type { DashboardConfig } from "./layout";
import { resolveTheme } from "./theme";
import { pageCustom, SECTION_IDS, SECTION_KEYS, themedOf, withThemeValues, type ThemeLevels } from "./theme-model";

/**
 * Applying a Theme (an appearance preset), and saving one.
 * Pure config → config; the studio sets each result in one call (one
 * undo step, no coalescing key).
 *
 * Scopes (Theme's scope bar):
 * - A screen: the profile's own theme colours + radius
 *   (`MonitorProfile.theme` / `radius`), its widget theme's values and
 *   `background`; other profiles keep theirs.
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

/** Where Theme applies or saves a Theme: a screen, or one of its pages. */
export type ThemeTarget = PresetScope | { kind: "page"; profileId: string; pageId: string };

export interface ApplyOptions {
  /** Replace the scope's background with the preset's (default: only when it has none). */
  includeBackground?: boolean;
}

/** Whether a background shows nothing (unset, "none", or media without a file or fill). */
function isEmptyBackground(bg: PageBackground | undefined): boolean {
  if (!bg || bg.type === "none") return true;
  return (bg.type === "image" || bg.type === "video") && !bg.src && !bg.color;
}

function nextBackground(
  current: PageBackground | undefined,
  preset: AppearancePreset,
  options: ApplyOptions
): PageBackground | undefined {
  if (!preset.background) return current;
  const write = options.includeBackground ?? isEmptyBackground(current);
  return write ? { ...preset.background } : current;
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
              orNone(style) ?? (p.widgetTheme?.values !== undefined ? {} : undefined)
            ),
            background: nextBackground(p.background, preset, options),
          }
        : p
    ),
  };
}

/* ---------------- the user's presets ---------------- */

/** The current look of a screen as a preset (its theme, theme values and background). */
export function presetFromCurrent(
  config: DashboardConfig,
  scope: PresetScope,
  id: string,
  name: string
): AppearancePreset {
  const profile = config.profiles.find((p) => p.id === scope.profileId);
  const style = themedOf(profile?.widgetTheme?.values);
  const background = profile?.background;
  const theme = resolveTheme(profile);
  return {
    id,
    name,
    description: "Saved theme",
    theme: { ...theme.tokens },
    radius: theme.radius,
    style,
    ...(background && !isEmptyBackground(background) ? { background: { ...background } } : {}),
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
  const screen: PresetScope = { kind: "profile", profileId: target.profileId };
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

/** A built-in Theme kept as the user's own, named "‹name› copy", at the end of the saved Themes: free to rename and edit. */
export const saveCopyOfPreset = (config: DashboardConfig, preset: AppearancePreset, copyId: string): DashboardConfig => ({
  ...config,
  appearancePresets: [...(config.appearancePresets ?? []), { ...structuredClone(withoutZoneLook(preset)), id: copyId, name: `${preset.name} copy` }],
});

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
