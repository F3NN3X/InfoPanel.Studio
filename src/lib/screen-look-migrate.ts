import type { ModuleSettings } from "@/modules/types";
import { normalizeBackground, type PageBackground } from "./appearance";
import { guessApplied, guessAppliedThemes, normalizeAppliedTheme, type AppliedTheme } from "./applied-theme";
import type { AppearancePreset } from "./appearance-presets";
import { normalizeFont, type ClockChoice, type GeneralFont } from "./general";
import type { DashboardConfig, MonitorProfile } from "./layout";
import { normalizePerformance, type ScreenPerformance } from "./performance";
import { DEFAULT_RADIUS, DEFAULT_THEME, type ThemeTokens } from "./theme";
import { themedOf, withThemeValues } from "./theme-model";

/**
 * v15 → v16: screens own their look (`mergeConfig` runs it for a config saved before v16). The dashboard level
 * ("All screens") goes: each screen gets a copy of what it inherited from it, so it shows the same look, and the
 * dashboard's fields are dropped. Per screen:
 *
 * - tokens: the dashboard's 19 under the screen's own; radius: the screen's, else the dashboard's;
 * - background: the screen's (its "none" stays none), else the dashboard's (the dashboard's "none" or none: unset);
 * - page font: the screen's, else the dashboard's `general.font`;
 * - widget style: the dashboard's themed values (its 12 / 24 h clock aside, now `general.clock`) under the screen's
 *   own; locks and pages are untouched (a page that follows shows its screen, which now holds the merged values);
 * - performance: the dashboard's Max FPS, motion and rendering switches under the screen's own;
 * - snapshot: the screen's own, else the dashboard's when the screen had no look of its own; either way it keeps what
 *   the dashboard's snapshot wrote into this screen's widgets (`zones`), so Reset can still take those writes back. A
 *   screen with a look of its own and no snapshot gets only those writes (a snapshot reduced to them, as Reset leaves).
 *
 * Each screen gets its own copy of the dashboard's values: nothing is shared between screens.
 */

/** The dashboard's look as a v15 config held it, read once from the stored config (the migrated parts passed in). */
export interface DashboardLook {
  theme: ThemeTokens;
  radius: number;
  background?: PageBackground;
  /** The all-screens style after the v6 / v7 migrations. */
  style?: ModuleSettings;
  appliedTheme?: AppliedTheme;
  font?: GeneralFont;
  performance?: ScreenPerformance;
}

/** The dashboard-level fields a config saved before v16 holds (read here only). */
export interface LegacyDashboardFields {
  theme?: Partial<ThemeTokens>;
  radius?: number;
  background?: unknown;
  style?: ModuleSettings;
  appliedTheme?: unknown;
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/** The dashboard's look from a stored config: its fields guarded, `style` the migrated all-screens style. */
export function dashboardLook(stored: LegacyDashboardFields & { general?: unknown }, style: ModuleSettings | undefined): DashboardLook {
  const general = isObject(stored.general) ? stored.general : {};
  return {
    theme: { ...DEFAULT_THEME, ...(isObject(stored.theme) ? stored.theme : {}) },
    radius: typeof stored.radius === "number" && Number.isFinite(stored.radius) ? stored.radius : DEFAULT_RADIUS,
    background: normalizeBackground(stored.background),
    style,
    appliedTheme: normalizeAppliedTheme(stored.appliedTheme),
    font: normalizeFont(general.font),
    performance: normalizePerformance(general),
  };
}

/** The dashboard style's 12 / 24 h clock, which becomes the app's (`general.clock`); "auto" or none: unset. */
export const clockOfStyle = (style: ModuleSettings | undefined): ClockChoice | undefined =>
  style?.clock === "12" || style?.clock === "24" ? style.clock : undefined;

const orNone = <T extends object>(v: T): T | undefined => (Object.keys(v).length > 0 ? v : undefined);

/** Whether a screen held a look of its own (its colors, corners, background or widget-style values). */
const ownsLook = (p: MonitorProfile): boolean =>
  p.theme !== undefined || p.radius !== undefined || p.background !== undefined || Object.keys(p.widgetTheme?.values ?? {}).length > 0;

/** The dashboard snapshot's writes into this screen's widgets, by zone id; undefined when there are none. */
function zonesOn(p: MonitorProfile, applied: AppliedTheme | undefined): AppliedTheme["zones"] {
  if (!applied?.zones) return undefined;
  const ids = new Set(p.pages.flatMap((pg) => pg.placements.map((z) => z.id)));
  return orNone(Object.fromEntries(Object.entries(applied.zones).filter(([id]) => ids.has(id))));
}

/** The screen's snapshot after v16 (see the module comment). */
function snapshotOf(p: MonitorProfile, dashboard: AppliedTheme | undefined): AppliedTheme | undefined {
  const zones = zonesOn(p, dashboard);
  const withZones = (t: AppliedTheme): AppliedTheme => (zones ? { ...t, zones: { ...zones, ...t.zones } } : t);
  if (p.appliedTheme) return withZones(p.appliedTheme);
  if (!dashboard) return undefined;
  if (!ownsLook(p)) {
    const { zones: _all, ...rest } = dashboard;
    return withZones(rest);
  }
  return zones ? { id: dashboard.id, name: dashboard.name, values: {}, zones } : undefined;
}

/** One screen with the dashboard's look copied down (see the module comment). */
export function screenWithLook(p: MonitorProfile, shared: DashboardLook): MonitorProfile {
  const look = structuredClone(shared);
  const { clock: _app, ...base } = themedOf(look.style);
  // A screen's empty values stay (its own style, empty), as v15 stored them.
  const values = p.widgetTheme?.values ? { ...base, ...p.widgetTheme.values } : orNone(base);
  const background = p.background ?? (look.background?.type === "none" ? undefined : look.background);
  return {
    ...p,
    theme: { ...look.theme, ...p.theme },
    radius: p.radius ?? look.radius,
    background: background ? { ...background } : undefined,
    font: p.font ?? look.font,
    widgetTheme: withThemeValues(p.widgetTheme, values),
    performance: orNone({ ...look.performance, ...p.performance }),
    appliedTheme: snapshotOf(p, look.appliedTheme),
  };
}

/**
 * The v16 config from a v15 one's profiles and dashboard look: the snapshots a config saved before levels kept them
 * guessed first (as v15 did on load, on the look as it stood), then each screen given its look.
 */
export function migrateScreensV16(config: DashboardConfig, look: DashboardLook): DashboardConfig {
  const saved: readonly AppearancePreset[] = config.appearancePresets ?? [];
  const dashboard: DashboardLook = {
    ...look,
    appliedTheme: look.appliedTheme ?? guessApplied(saved, { values: look.style, tokens: look.theme, radius: look.radius, background: look.background }),
  };
  const guessed = guessAppliedThemes(config, look.style);
  return { ...guessed, profiles: guessed.profiles.map((p) => screenWithLook(p, dashboard)) };
}
