import type { ModuleSettings } from "@/modules/types";
import type { ThemeTarget } from "./appearance-preset-apply";
import { isBuiltinPreset, type AppearancePreset } from "./appearance-presets";
import { sameBackground, sameValues, type AppliedTheme } from "./applied-theme";
import type { DashboardConfig } from "./layout";
import { SECTION_IDS, SECTION_KEYS, type SectionId } from "./theme-model";
import { sameSkin } from "./theme-skins";

/**
 * Which theme a level last applied and what changed since, read from the snapshot the level stores (the theme card,
 * the Update bar, the page inspector's Theme row). Split from `theme-apply` so the studio's entry can name a level's
 * theme without the code that applies one.
 */

/** The four parts of a theme (SPEC §2); everything else at a level is fine-tune. */
export type ThemePart = "palette" | "skin" | "corners" | "background";

/** The snapshot a level holds. */
export function levelApplied(config: DashboardConfig, target: ThemeTarget): AppliedTheme | undefined {
  const p = config.profiles.find((x) => x.id === target.profileId);
  return target.kind === "profile" ? p?.appliedTheme : p?.pages.find((pg) => pg.id === target.pageId)?.appliedTheme;
}

export interface ThemeState {
  applied?: AppliedTheme;
  /** The theme it names: a saved theme, or a template theme found in `templates`. */
  theme?: AppearancePreset;
  /** A saved theme deleted since it was applied (the card shows "‹name› (deleted)"). */
  deleted: boolean;
  /** The parts changed since it was applied (the Update bar); a page has only its skin. */
  changed: ThemePart[];
  /** The sections holding values of the level's own ("Changed here"; what a switch keeps). */
  own: SectionId[];
}

/** Which theme a level last applied, and what changed since (the theme card, the Update bar, the page inspector). */
export function themeState(config: DashboardConfig, target: ThemeTarget, templates: readonly AppearancePreset[] = []): ThemeState {
  const applied = levelApplied(config, target);
  const theme = applied && (config.appearancePresets?.find((p) => p.id === applied.id) ?? templates.find((p) => p.id === applied.id));
  const deleted = applied !== undefined && !isBuiltinPreset(applied.id) && theme === undefined;
  const written = applied?.values ?? {};
  const differs = (values: ModuleSettings | undefined, sec: SectionId) => SECTION_KEYS[sec].some((key) => values?.[key] !== written[key]);
  if (target.kind === "page") {
    const p = config.profiles.find((x) => x.id === target.profileId);
    const pg = p?.pages.find((x) => x.id === target.pageId);
    const custom = (sec: SectionId) => pg?.widgetTheme?.follow?.[sec] === false && p?.widgetTheme?.locks?.[sec] !== true;
    const own = SECTION_IDS.filter((sec) => sec !== "skin" && custom(sec) && differs(pg?.widgetTheme?.values, sec));
    // A page that follows its screen's skin holds none: changed from any skin the theme wrote.
    const skin = custom("skin") ? pg?.widgetTheme?.values?.skin : undefined;
    const skinChanged = skin === undefined ? written.skin !== undefined : !sameSkin(skin, written.skin);
    return { applied, theme, deleted, changed: applied && skinChanged ? ["skin"] : [], own };
  }
  const p = config.profiles.find((x) => x.id === target.profileId);
  const values = p?.widgetTheme?.values;
  const tokens = p?.theme;
  const radius = p?.radius;
  const background = p?.background;
  const own = SECTION_IDS.filter((sec) => sec !== "skin" && differs(values, sec));
  if (!applied) return { applied, theme, deleted, changed: [], own };
  const changed: ThemePart[] = [];
  if (!sameValues(tokens, applied.tokens)) changed.push("palette");
  if (!sameSkin(values?.skin, written.skin)) changed.push("skin");
  if (radius !== applied.radius) changed.push("corners");
  if (applied.background && !sameBackground(background, applied.background)) changed.push("background");
  return { applied, theme, deleted, changed, own };
}
