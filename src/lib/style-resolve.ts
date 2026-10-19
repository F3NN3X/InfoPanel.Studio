import type { ModuleSettings } from "@/modules/types";
import {
  following,
  sectionOfKey,
  THEMED_KEYS,
  type SectionFlags,
  type SectionId,
  type ThemeLevels,
  type WidgetTheme,
} from "./theme-model";

/**
 * Where a widget's look comes from, on the theme model (`theme-model.ts`).
 * Only the themed keys are layered, lowest first:
 *
 *   module default → all-profiles style → profile theme → page theme
 *   (only for a section the page made its own) → the widget's own
 *
 * A widget section that follows the theme (the default, and always while
 * the profile locks it) skips the widget's own values for its keys — they
 * stay stored, inactive. Other keys (sensor, layout, title, …) always come
 * from the widget.
 */

/** The layer a resolved look value comes from ("dashboard": the all-profiles style). */
export type StyleSource = "default" | "dashboard" | "profile" | "page" | "own";

/** The theme a placement renders under, with the names its Follow bars show. */
export interface Appearance extends ThemeLevels {
  profileName?: string;
  pageName?: string;
}

export interface StyleInput {
  /** The lowest layer (a panel's legacy look). */
  moduleDefaults?: ModuleSettings;
  levels?: ThemeLevels;
  /** The widget's saved settings (content and look). */
  own?: ModuleSettings;
  /** The widget's follow flags (absent: every section follows). */
  follow?: SectionFlags;
}

export interface ResolvedStyle {
  /** Other keys from `own`, themed keys from the strongest layer that applies. */
  settings: ModuleSettings;
  /** The layer of each themed key that is set somewhere. */
  source: Record<string, StyleSource>;
}

/** A profile view's or a stored profile's page theme and names. */
interface ProfileLike {
  id?: string;
  name?: string;
  widgetTheme?: WidgetTheme;
  pageId?: string;
  pageTheme?: WidgetTheme;
}

/** The theme a profile (one page of it) renders under. */
export function appearanceOf(
  config: { style?: ModuleSettings; profiles?: { id: string; pages: { id: string; name: string }[] }[] },
  profile: ProfileLike | undefined
): Appearance {
  const pages = config.profiles?.find((p) => p.id === profile?.id)?.pages;
  const page = pages?.find((pg) => pg.id === profile?.pageId) ?? pages?.[0];
  return {
    base: config.style,
    profile: profile?.widgetTheme,
    page: profile?.pageTheme,
    profileName: profile?.name,
    pageName: page?.name,
  };
}

/** Whether the profile locks a section (the colour lock forces a panel's widget colours too). */
export const lockedIn = (appearance: Appearance | undefined, sec: SectionId): boolean =>
  appearance?.profile?.locks?.[sec] === true;

/** Layer the themed keys (see the module comment). */
export function resolveStyle(input: StyleInput): ResolvedStyle {
  const levels = input.levels ?? {};
  const settings: ModuleSettings = {};
  const source: Record<string, StyleSource> = {};
  for (const [key, value] of Object.entries(input.own ?? {})) {
    if (!THEMED_KEYS.has(key)) settings[key] = value;
  }
  const keys = new Set([
    ...Object.keys(input.moduleDefaults ?? {}),
    ...Object.keys(levels.base ?? {}),
    ...Object.keys(levels.profile?.values ?? {}),
    ...Object.keys(levels.page?.values ?? {}),
    ...Object.keys(input.own ?? {}),
  ]);
  for (const key of keys) {
    const sec = sectionOfKey(key);
    if (!sec) continue;
    const pageOwn = levels.page?.follow?.[sec] === false;
    const layers: [StyleSource, unknown][] = [
      ["own", following(levels, input.follow, sec) ? undefined : input.own?.[key]],
      ["page", pageOwn ? levels.page?.values?.[key] : undefined],
      ["profile", levels.profile?.values?.[key]],
      ["dashboard", levels.base?.[key]],
      ["default", input.moduleDefaults?.[key]],
    ];
    const hit = layers.find(([, value]) => value !== undefined);
    if (!hit) continue;
    settings[key] = hit[1] as ModuleSettings[string];
    source[key] = hit[0];
  }
  return { settings, source };
}

/**
 * Each zone of a profile resolved under the theme of the page that holds
 * it (the island reads zones from every page); a zone of no page: its own.
 */
export function zoneResolver(
  config: { style?: ModuleSettings },
  profile: {
    widgetTheme?: WidgetTheme;
    pages: { widgetTheme?: WidgetTheme; placements: { id: string }[] }[];
  }
): (p: { id: string; settings?: ModuleSettings; follow?: SectionFlags }) => ModuleSettings | undefined {
  const pageOf = new Map(profile.pages.flatMap((pg) => pg.placements.map((z) => [z.id, pg] as const)));
  return (p) => {
    const page = pageOf.get(p.id);
    if (!page) return p.settings;
    return resolveWith({ base: config.style, profile: profile.widgetTheme, page: page.widgetTheme }, p.settings, p.follow);
  };
}

/** A widget's settings under a theme (`own` with its follow flags). */
export function resolveWith(
  appearance: ThemeLevels | undefined,
  own: ModuleSettings | undefined,
  follow: SectionFlags | undefined,
  moduleDefaults?: ModuleSettings
): ModuleSettings | undefined {
  if (!appearance) return own;
  const { settings } = resolveStyle({ moduleDefaults, levels: appearance, own, follow });
  return Object.keys(settings).length > 0 ? settings : undefined;
}
