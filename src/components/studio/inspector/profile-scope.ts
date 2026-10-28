import type { DashboardConfig, MonitorProfile } from "@/lib/layout";
import type { ScreenPerformance } from "@/lib/performance";

/**
 * A screen's own data (its colors and corners, background, performance and page font) as pure config updates the
 * studio runs through its history setter: the inheritance chips' Reset at Screen (`inheritance-actions.ts`) and the
 * Performance rows in Screens. A screen owns its look (config v16): an unset value is the built-in one.
 */

export type ScopedSection = "theme" | "background" | "performance" | "font";

/** The profile without these keys (absent, not undefined). */
const without = (p: MonitorProfile, ...keys: (keyof MonitorProfile)[]): MonitorProfile =>
  Object.fromEntries(Object.entries(p).filter(([k]) => !keys.includes(k as keyof MonitorProfile))) as unknown as MonitorProfile;

function builtinIn(p: MonitorProfile, section: ScopedSection): MonitorProfile {
  switch (section) {
    case "theme":
      // Corners go with the theme.
      return without(p, "theme", "radius");
    case "background":
      return without(p, "background");
    case "performance":
      return without(p, "performance");
    case "font":
      return without(p, "font");
  }
}

/** The config with one screen's section back to the built-in value. */
export function withBuiltin(config: DashboardConfig, profileId: string, section: ScopedSection): DashboardConfig {
  return { ...config, profiles: config.profiles.map((p) => (p.id === profileId ? builtinIn(p, section) : p)) };
}

/** A screen's performance with some keys set (undefined clears one); undefined when nothing is left. */
export function withPerformance(performance: ScreenPerformance | undefined, patch: ScreenPerformance): ScreenPerformance | undefined {
  const next = Object.fromEntries(Object.entries({ ...performance, ...patch }).filter(([, v]) => v !== undefined));
  return Object.keys(next).length > 0 ? next : undefined;
}
