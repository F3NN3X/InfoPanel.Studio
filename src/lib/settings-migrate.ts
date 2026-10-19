import type { ModuleSettings } from "@/modules/types";
import {
  normalizeFlags,
  normalizeWidgetTheme,
  sectionsWithValues,
  themedOf,
  withAllLocked,
  withThemeValues,
  type SectionFlags,
  type WidgetTheme,
} from "./theme-model";

/**
 * Stored-data migrations of widget settings v2 (one per config version),
 * pure. Each runs from `mergeConfig` and where outside data enters the
 * config (a saved panel or a style dropped in, a pasted style, appearance
 * presets), keyed on the old fields' presence; what only a pre-v6 config
 * can mean (an unset `styleMode`) is keyed on its stored version.
 *
 * v6 (the theme model, `theme-model.ts`):
 * - `Placement.styleMode` → `Placement.follow`: "follow" → every section
 *   follows; "custom" → every section with own themed values is custom;
 *   unset (pre-v6) → the same as "custom" (its own values won key by key).
 * - `MonitorProfile.style` → `widgetTheme.values`; `styleEnforce` (the
 *   profile's, else the dashboard's) → every section locked.
 * - `DashboardConfig.style` stays the base layer; `styleEnforce` goes.
 * - `autoScale`, `variant` and `compactView` are no longer themed: a
 *   profile's or the dashboard's value is written into each widget that
 *   rendered with it, then dropped from the style.
 */

/** v5 placement fields v6 replaces (read here only). */
export interface LegacyPlacementFields {
  styleMode?: "follow" | "custom";
}

/** v5 profile fields v6 replaces (read here only). */
export interface LegacyProfileFields {
  style?: ModuleSettings;
  styleEnforce?: boolean;
}

/** Look keys the old global style carried that are per widget from v6. */
export const UNTHEMED_LOOK_KEYS: readonly string[] = ["autoScale", "variant", "compactView"];

/** Zones with no look of their own: blank (`BLANK_MODULE`) and canvas (`CANVAS_ID`) zones (layout.ts imports this file). */
const NO_LOOK: ReadonlySet<string> = new Set(["blank", "infopanel"]);

interface MigratablePlacement {
  module: string;
  panel?: unknown;
  settings?: ModuleSettings;
  follow?: SectionFlags;
}

/** Follow flags for own values that won key by key: custom where the widget has own themed values. */
export function followFromOwn(settings: ModuleSettings | undefined): SectionFlags | undefined {
  const secs = sectionsWithValues(settings);
  return secs.length > 0 ? Object.fromEntries(secs.map((sec) => [sec, false])) : undefined;
}

export interface PlacementMigration {
  /** The stored config predates v6 (an unset `styleMode` means "own values win"). */
  legacy: boolean;
  /** The old global style's `UNTHEMED_LOOK_KEYS` this widget rendered under (profile's over dashboard's). */
  layered?: ModuleSettings;
  /** The old global style was forced on this widget. */
  enforced?: boolean;
}

/** A settings map without `undefined` entries (`undefined` when empty). */
const orNone = (s: ModuleSettings): ModuleSettings | undefined => (Object.keys(s).length > 0 ? s : undefined);

/** The widget's own `UNTHEMED_LOOK_KEYS` as it rendered them under the old global style. */
function bakeUnthemed(p: MigratablePlacement, followed: boolean, layered: ModuleSettings | undefined): ModuleSettings | undefined {
  if (p.panel || NO_LOOK.has(p.module)) return p.settings;
  const next: ModuleSettings = { ...p.settings };
  for (const key of UNTHEMED_LOOK_KEYS) {
    const global = layered?.[key];
    if (global !== undefined && (followed || next[key] === undefined)) next[key] = global;
    // Followed, the own value was ignored: the widget showed its default.
    else if (global === undefined && followed) delete next[key];
  }
  return orNone(next);
}

/** v6 for one placement (see the module comment); the same placement when nothing changes. */
export function migratePlacementV6<P extends MigratablePlacement>(input: P & LegacyPlacementFields, ctx: PlacementMigration): P {
  const { styleMode, ...p } = input;
  const old = styleMode !== undefined || ctx.legacy;
  const hasLayered = UNTHEMED_LOOK_KEYS.some((k) => ctx.layered?.[k] !== undefined);
  if (!old && !hasLayered) return input;
  const followed = Boolean(ctx.enforced) || styleMode === "follow";
  const follow = p.follow !== undefined ? normalizeFlags(p.follow) : styleMode === "follow" || !old ? undefined : followFromOwn(p.settings);
  const settings = old || hasLayered ? bakeUnthemed(p, followed, ctx.layered) : p.settings;
  const { follow: _f, settings: _s, ...rest } = p;
  return { ...rest, ...(settings ? { settings } : {}), ...(follow ? { follow } : {}) } as unknown as P;
}

/** The old global style's per-widget look keys (profile's over dashboard's). */
function unthemedOf(style: ModuleSettings | undefined, base: ModuleSettings | undefined): ModuleSettings | undefined {
  const keys = UNTHEMED_LOOK_KEYS.filter((k) => (style?.[k] ?? base?.[k]) !== undefined);
  return keys.length > 0 ? Object.fromEntries(keys.map((k) => [k, (style?.[k] ?? base?.[k])!])) : undefined;
}

interface MigratableProfile {
  widgetTheme?: WidgetTheme;
  pages: { widgetTheme?: WidgetTheme; placements: MigratablePlacement[] }[];
}

export interface ProfileMigration {
  legacy: boolean;
  /** The dashboard's style (`DashboardConfig.style`, as stored). */
  base?: ModuleSettings;
  /** The dashboard's old force switch. */
  enforce?: boolean;
}

/** v6 for one profile: its style and force switch become its widget theme, its zones migrate. */
export function migrateProfileV6<P extends MigratableProfile>(input: P & LegacyProfileFields, ctx: ProfileMigration): P {
  const { style, styleEnforce, ...p } = input;
  const enforced = ctx.legacy || styleEnforce !== undefined ? (styleEnforce ?? ctx.enforce ?? false) : false;
  const placement: PlacementMigration = { legacy: ctx.legacy, layered: unthemedOf(style, ctx.base), enforced };
  const pages = p.pages.map((pg) => {
    const placements = pg.placements.map((pl) => migratePlacementV6(pl, placement));
    const widgetTheme = normalizeWidgetTheme(pg.widgetTheme);
    const same = placements.every((pl, i) => pl === pg.placements[i]) && widgetTheme === pg.widgetTheme;
    if (same) return pg;
    const { widgetTheme: _t, ...rest } = pg;
    return { ...rest, placements, ...(widgetTheme ? { widgetTheme } : {}) };
  });
  const stored = normalizeWidgetTheme(p.widgetTheme);
  // A stored style, even empty, stays the profile's own ("Style: Custom").
  const values = style !== undefined || stored?.values ? { ...themedOf(style), ...stored?.values } : undefined;
  const valued = withThemeValues(stored, values);
  const theme = enforced ? withAllLocked(valued, true) : valued;
  const { widgetTheme: _w, ...rest } = p;
  return { ...rest, pages, ...(theme ? { widgetTheme: theme } : {}) } as unknown as P;
}

/** The all-profiles style from v6: themed keys only (`UNTHEMED_LOOK_KEYS` went into the widgets). */
export const migrateBaseStyleV6 = (style: ModuleSettings | undefined): ModuleSettings | undefined =>
  style ? orNone(themedOf(style)) : undefined;
