import type { AppearancePreset } from "@/lib/appearance-presets";
import type { DashboardConfig, Placement } from "@/lib/layout";
import { SECTION_KEYS, themedOf } from "@/lib/theme-model";
import { skinLabel } from "@/lib/theme-skins";
import type { ModuleSetting } from "@/modules/types";
import type { ThemeAt } from "./theme-cards";
import { exceptionsOf, makeFollow, type ThemeException } from "./theme-exceptions";
import { THEME_EDITOR_SETTINGS } from "./theme-editor-settings";
import { listText } from "./theme-view-model";

/**
 * The preview's differences (handoff SPEC §4.4): the widgets on a page that don't follow the level, by card, for
 * their "✎ ‹section›" tags, the differences pill, the selection bar's summary, Use theme's value and Make all follow.
 * Owner rule: what a theme wrote into a widget (a variant's colour swaps and card opacity, `appliedTheme.zones` of
 * its screen or page) is the theme's, not the widget's: a widget whose only own values of a card are still those
 * writes doesn't differ there. Pure.
 */

/** What the themes of a widget's screen and page wrote into it and it still holds. */
function themeWritten(ex: ThemeException): Set<string> {
  const zone = ex.zone!;
  const writes = [ex.profile.appliedTheme, ex.page?.appliedTheme].map((t) => t?.zones?.[zone.id]?.now ?? {});
  return new Set(Object.keys(zone.settings ?? {}).filter((key) => writes.some((now) => now[key] !== undefined && now[key] === zone.settings![key])));
}

/** The widget's own values in the card's sections it customises. */
function ownKeys(ex: ThemeException): string[] {
  const zone = ex.zone!;
  const keys = ex.card.sections.filter((sec) => zone.follow?.[sec] === false).flatMap((sec) => SECTION_KEYS[sec]);
  return keys.filter((key) => zone.settings?.[key] !== undefined);
}

/** Whether an exception is only a theme's writes (owner rule): a widget whose own values of the card a theme wrote. */
export function themeOwned(ex: ThemeException): boolean {
  if (ex.kind !== "widget") return false;
  const own = ownKeys(ex);
  const written = themeWritten(ex);
  return own.length > 0 && own.every((key) => written.has(key));
}

/** The exceptions without the theme's own writes. */
export const differencesOf = (exceptions: readonly ThemeException[]): ThemeException[] => exceptions.filter((ex) => !themeOwned(ex));

/**
 * The widgets' differences at a level in the sections a theme sets: after a pick they keep their own look there (the
 * toast's "N widgets keep their own look" and its Make them follow). A section the screen locks shows the screen's.
 */
export function widgetsKeeping(config: DashboardConfig, at: ThemeAt, preset: AppearancePreset): ThemeException[] {
  const set = new Set(Object.keys(themedOf(preset.style)));
  return differencesOf(exceptionsOf(config, at)).filter(
    (ex) => ex.kind === "widget" && !ex.ignored && ex.card.sections.some((sec) => SECTION_KEYS[sec].some((key) => set.has(key)))
  );
}

/**
 * The toast's count after a pick: the widgets that keep their own look on the config the pick makes, since a pick can
 * change what a widget holds (a variant's swaps become the theme's writes, the last theme's are taken back).
 */
export const widgetsKeepingAfter = (picked: DashboardConfig, at: ThemeAt, preset: AppearancePreset): number => widgetCount(widgetsKeeping(picked, at, preset));

/** How many widgets a list of differences names. */
export const widgetCount = (differences: readonly ThemeException[]): number => new Set(differences.map((ex) => `${ex.page?.id}:${ex.zone?.id}`)).size;

/** A widget on the previewed page that differs, with each card it differs in. */
export interface WidgetDifference {
  zone: Placement;
  exceptions: ThemeException[];
}

/** The widgets of a page that differ, in the order the exceptions list them. */
export function pageDifferences(differences: readonly ThemeException[], pageId: string): Map<string, WidgetDifference> {
  const out = new Map<string, WidgetDifference>();
  for (const ex of differences) {
    if (ex.kind !== "widget" || ex.page?.id !== pageId || !ex.zone) continue;
    const entry = out.get(ex.zone.id);
    if (entry) entry.exceptions.push(ex);
    else out.set(ex.zone.id, { zone: ex.zone, exceptions: [ex] });
  }
  return out;
}

/** The differences pill: "2 widgets differ · hide tags", or "Show what differs" while the tags are hidden. */
export function differencesPill(count: number, shown: boolean): string {
  if (!shown) return "Show what differs";
  return `${count} ${count === 1 ? "widget differs" : "widgets differ"} · hide tags`;
}

const DEFS = new Map<string, ModuleSetting>(THEME_EDITOR_SETTINGS.map((d) => [d.key, d]));

/** "Decimals 1", "Accent #FF0000": a value as its row names it. */
function valueText(key: string, value: unknown): string {
  const def = DEFS.get(key);
  const option = key === "skin" ? skinLabel(value) : def?.options?.find((o) => o.value === String(value))?.label;
  const shown = option ?? (typeof value === "string" && value.startsWith("#") ? value.toUpperCase() : String(value));
  return `${(def?.label ?? key).toLowerCase()} ${shown}`;
}

/**
 * The selection bar's summary: "Uses its own Units & format: decimals 1. Everything else follows Main." (the
 * values it holds of its own, none written by a theme), or what it follows when it differs nowhere.
 */
export function differenceSummary(zone: Placement, diff: WidgetDifference | undefined, levelName: string): string {
  if (!diff) return `Follows ${levelName} everywhere.`;
  const values = diff.exceptions.flatMap((ex) => {
    const written = themeWritten(ex);
    return ownKeys(ex)
      .filter((key) => !written.has(key))
      .map((key) => valueText(key, zone.settings![key]));
  });
  const what = listText(diff.exceptions.map((ex) => ex.card.title));
  return `Uses its own ${what}${values.length > 0 ? `: ${values.join(", ")}` : ""}. Everything else follows ${levelName}.`;
}

/**
 * One difference follows again. A widget card that also holds a theme's writes keeps customising the card, so the writes
 * stay; only the widget's own values in it go.
 */
function followOne(config: DashboardConfig, ex: ThemeException): DashboardConfig {
  const written = ex.kind === "widget" ? themeWritten(ex) : new Set<string>();
  if (written.size === 0) return makeFollow(config, ex);
  const drop = new Set(ownKeys(ex).filter((key) => !written.has(key)));
  const zone = ex.zone!;
  return {
    ...config,
    profiles: config.profiles.map((p) =>
      p.id !== ex.profile.id
        ? p
        : {
            ...p,
            pages: p.pages.map((pg) =>
              pg.id !== ex.page!.id
                ? pg
                : { ...pg, placements: pg.placements.map((z) => (z.id === zone.id ? { ...z, settings: Object.fromEntries(Object.entries(z.settings ?? {}).filter(([key]) => !drop.has(key))) } : z)) }
            ),
          }
    ),
  };
}

/** Use theme's value, or Make all follow: each difference follows again, in one change. */
export const followAll = (config: DashboardConfig, differences: readonly ThemeException[]): DashboardConfig => differences.reduce(followOne, config);
