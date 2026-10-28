import type { ModuleSetting, ModuleSettings } from "@/modules/types";
import type { GeneralSettings } from "./general";
import {
  following,
  pageCustom,
  sectionOfKey,
  THEMED_KEYS,
  themeKeyOf,
  type SectionFlags,
  type SectionId,
  type ThemeLevels,
  type WidgetTheme,
} from "./theme-model";

/**
 * Where a widget's look comes from, on the theme model (`theme-model.ts`).
 * Only the themed keys are layered, lowest first:
 *
 *   module default → the app's clock (`general.clock`) → profile theme →
 *   page theme (only for a section the page made its own and the profile
 *   does not lock) → the widget's own
 *
 * A clock a level sets, "auto" (the locale's) included, beats the app's,
 * as the dashboard's clock was beaten before v16.
 *
 * A widget section that follows the theme (the default, and always while
 * the profile locks it) skips the widget's own values for its keys — they
 * stay stored, inactive. Other keys (sensor, layout, title, …) always come
 * from the widget. With the widget's schema (`defs`), a per-widget row
 * keeps its own value while its section follows, and a colour row with a
 * palette role reads the role's theme colour (SPEC §3.2 `themeKey`).
 */

/** The layer a resolved look value comes from ("app": the app settings' clock). */
export type StyleSource = "default" | "app" | "profile" | "page" | "own";

/** The app settings' layer under every screen: its 12 / 24 h clock, else none. */
export const appLayer = (general: GeneralSettings | undefined): ModuleSettings | undefined =>
  general?.clock ? { clock: general.clock } : undefined;

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
  /** The widget's schema, for `perWidget` rows and palette `role`s (absent: neither applies). */
  defs?: readonly Pick<ModuleSetting, "key" | "role" | "perWidget">[];
}

/** A row of the schema as the resolution reads it. */
type RowDef = Pick<ModuleSetting, "key" | "role" | "perWidget">;

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
  config: { general?: GeneralSettings; profiles?: { id: string; pages: { id: string; name: string }[] }[] },
  profile: ProfileLike | undefined
): Appearance {
  const pages = config.profiles?.find((p) => p.id === profile?.id)?.pages;
  const page = pages?.find((pg) => pg.id === profile?.pageId) ?? pages?.[0];
  return {
    base: appLayer(config.general),
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
  const perWidget = new Set((input.defs ?? []).filter((d) => d.perWidget).map((d) => d.key));
  /** The strongest layer of a themed key, the widget's own value only where `ownApplies`. */
  const layerOf = (key: string, ownValue: unknown, ownApplies: boolean): [StyleSource, unknown] | undefined => {
    const sec = sectionOfKey(key)!;
    const pageOwn = pageCustom(levels, sec);
    const layers: [StyleSource, unknown][] = [
      ["own", ownApplies ? ownValue : undefined],
      ["page", pageOwn ? levels.page?.values?.[key] : undefined],
      ["profile", levels.profile?.values?.[key]],
      ["app", levels.base?.[key]],
      ["default", input.moduleDefaults?.[key]],
    ];
    return layers.find(([, value]) => value !== undefined);
  };
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
    const hit = layerOf(key, input.own?.[key], perWidget.has(key) || !following(levels, input.follow, sec));
    if (!hit) continue;
    settings[key] = hit[1] as ModuleSettings[string];
    source[key] = hit[0];
  }
  for (const def of input.defs ?? []) withRole(def);
  return { settings, source };

  /** A colour row with a palette role: the role's theme colour, its own value only while its section is custom. */
  function withRole(def: RowDef) {
    const role = themeKeyOf(def);
    const sec = sectionOfKey(role);
    if (role === def.key || !sec || def.perWidget) return;
    const hit = layerOf(role, input.own?.[def.key], !following(levels, input.follow, sec));
    if (hit) {
      settings[def.key] = hit[1] as ModuleSettings[string];
      source[def.key] = hit[0];
    } else delete settings[def.key];
  }
}

/**
 * Each zone of a profile resolved under the theme of the page that holds
 * it (the island reads zones from every page); a zone of no page: its own.
 */
export function zoneResolver(
  config: { general?: GeneralSettings },
  profile: {
    widgetTheme?: WidgetTheme;
    pages: { widgetTheme?: WidgetTheme; placements: { id: string }[] }[];
  },
  /** A zone's schema (its module's settings), for per-widget rows and palette roles. */
  defsOf?: (p: { id: string; module?: string }) => readonly RowDef[] | undefined
): (p: { id: string; module?: string; settings?: ModuleSettings; follow?: SectionFlags }) => ModuleSettings | undefined {
  const pageOf = new Map(profile.pages.flatMap((pg) => pg.placements.map((z) => [z.id, pg] as const)));
  return (p) => {
    const page = pageOf.get(p.id);
    if (!page) return p.settings;
    return resolveWith({ base: appLayer(config.general), profile: profile.widgetTheme, page: page.widgetTheme }, p.settings, p.follow, undefined, defsOf?.(p));
  };
}

/** A widget's settings under a theme (`own` with its follow flags; `defs` its schema, see `StyleInput`). */
export function resolveWith(
  appearance: ThemeLevels | undefined,
  own: ModuleSettings | undefined,
  follow: SectionFlags | undefined,
  moduleDefaults?: ModuleSettings,
  defs?: readonly RowDef[]
): ModuleSettings | undefined {
  if (!appearance) return own;
  const { settings } = resolveStyle({ moduleDefaults, levels: appearance, own, follow, defs });
  return Object.keys(settings).length > 0 ? settings : undefined;
}
