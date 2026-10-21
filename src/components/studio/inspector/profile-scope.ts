import { GENERAL_DEFAULTS } from "@/lib/general";
import type { DashboardConfig, MonitorProfile } from "@/lib/layout";
import type { PerformanceOverride } from "@/lib/performance";
import type { ThemeTokens } from "@/lib/theme";
import { SECTION_IDS, withAllLocked, withThemeValues, type WidgetTheme } from "@/lib/theme-model";

/**
 * The profile inspector's All profiles | This profile switches, as data. A section is "This
 * profile" while the profile holds its own value (the key is present) and "All profiles" while
 * it doesn't; the switch only adds or drops that key, so nothing new is stored. Pure config
 * updates the studio runs through its history setter. The inheritance chips' Screen level of
 * the two-level data (`inheritance-actions.ts`) uses the same switch.
 */

export type LookScope = "all" | "profile";
/** Which level a style, background or preset edit writes to (the same two scopes). */
export type AppearanceTarget = LookScope;
export type BackgroundTarget = LookScope;

/** A profile's own theme: unset fields = the dashboard's. */
export interface ProfileTheme {
  theme?: Partial<ThemeTokens>;
  radius?: number;
}

export type ScopedSection = "theme" | "style" | "background" | "performance" | "font";

type Own = Pick<MonitorProfile, "theme" | "radius" | "widgetTheme" | "background" | "performance" | "font">;

/** Where a section's edits go: the profile's own value is present, else the dashboard's. */
export function scopeOf(profile: Own, section: ScopedSection): LookScope {
  const own =
    section === "theme"
      ? profile.theme !== undefined || profile.radius !== undefined
      : section === "style"
        ? profile.widgetTheme?.values !== undefined
        : section === "background"
          ? profile.background !== undefined
          : section === "performance"
            ? profile.performance !== undefined
            : profile.font !== undefined;
  return own ? "profile" : "all";
}

/** The profile without these keys (absent, not undefined). */
const without = (p: MonitorProfile, ...keys: (keyof MonitorProfile)[]): MonitorProfile =>
  Object.fromEntries(Object.entries(p).filter(([k]) => !keys.includes(k as keyof MonitorProfile))) as unknown as MonitorProfile;

function profileInScope(config: DashboardConfig, p: MonitorProfile, section: ScopedSection, scope: LookScope): MonitorProfile {
  if (scopeOf(p, section) === scope) return p;
  switch (section) {
    case "theme":
      // Corners go with the theme: back to All profiles drops both.
      return scope === "all" ? without(p, "theme", "radius") : { ...p, theme: { ...config.theme }, radius: p.radius ?? config.radius };
    case "style": {
      // Own values start empty over the shared style, as Custom did.
      const widgetTheme = withThemeValues(p.widgetTheme, scope === "all" ? undefined : (p.widgetTheme?.values ?? {}));
      return widgetTheme ? { ...p, widgetTheme } : without(p, "widgetTheme");
    }
    case "background":
      // None stays `{ type: "none" }` on the profile; absent means the dashboard's.
      return scope === "all" ? without(p, "background") : { ...p, background: config.background ? { ...config.background } : { type: "none" } };
    case "performance":
      return scope === "all"
        ? without(p, "performance")
        : {
            ...p,
            performance: {
              maxFps: config.general?.maxFps ?? GENERAL_DEFAULTS.maxFps,
              motion: config.general?.motion ?? GENERAL_DEFAULTS.motion,
            },
          };
    case "font":
      // The page font starts at the dashboard's (SPEC §11.1).
      return scope === "all" ? without(p, "font") : { ...p, font: config.general?.font ?? GENERAL_DEFAULTS.font };
  }
}

/** The config with one profile's section switched to a scope (starting from the shared values). */
export function withScope(config: DashboardConfig, profileId: string, section: ScopedSection, scope: LookScope): DashboardConfig {
  return { ...config, profiles: config.profiles.map((p) => (p.id === profileId ? profileInScope(config, p, section, scope) : p)) };
}

/** Corners follow the Theme switch: the dashboard's radius, or the profile's own. */
export function withRadius(config: DashboardConfig, profileId: string, scope: LookScope, radius: number): DashboardConfig {
  if (scope === "all") return { ...config, radius };
  return { ...config, profiles: config.profiles.map((p) => (p.id === profileId ? { ...p, radius } : p)) };
}

/** A profile's performance override with one key set; undefined when nothing is left. */
export function withPerformance(
  performance: PerformanceOverride | undefined,
  patch: PerformanceOverride
): PerformanceOverride | undefined {
  const next = Object.fromEntries(Object.entries({ ...performance, ...patch }).filter(([, v]) => v !== undefined));
  return Object.keys(next).length > 0 ? next : undefined;
}

export type LockState = "all" | "some" | "none";

/** Whether every widget-theme section is locked, only some, or none. */
export function lockState(theme: WidgetTheme | undefined): LockState {
  const locked = SECTION_IDS.filter((sec) => theme?.locks?.[sec] === true).length;
  return locked === SECTION_IDS.length ? "all" : locked > 0 ? "some" : "none";
}

/** The "Apply to every widget" toggle: all locked unlocks them, anything less locks every section. */
export const toggleLockAll = (theme: WidgetTheme | undefined): WidgetTheme | undefined =>
  withAllLocked(theme, lockState(theme) !== "all");
