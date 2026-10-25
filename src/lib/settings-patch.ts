/**
 * A change made in the Settings window (PLAN decisions 21 and 22): only the dashboard-wide keys it touches. The
 * server merges it into the saved config (PATCH /api/config/settings, ips-server's config_settings.rs, which checks every
 * value); the Settings window and the Studio window apply the same patch to their own copy with `withSettingsPatch`.
 * null puts a key back to its default, a screen's performance back to All screens', and the startup screen to "auto".
 */

import type { GeneralSettings } from "@/lib/general";
import type { DashboardConfig } from "@/lib/layout";
import type { PerformanceOverride } from "@/lib/performance";

/** The `general` keys Settings › Dashboard writes (the page font is Theme's). */
export type DashboardGeneralKey = "showSeconds" | "locale" | "motion" | "maxFps" | "hideCursor" | "kioskPageNav" | "kioskRefresh" | "ringGlide" | "blurLimit" | "innerBlur" | "liveGlow";

export interface SettingsPatch {
  general?: { [K in DashboardGeneralKey]?: GeneralSettings[K] | null };
  /** The All screens style's 12 / 24 h clock (unset: the locale's). */
  style?: { clock?: "12" | "24" | null };
  /** A screen's own frame-rate cap and animations, by screen id. */
  profiles?: Record<string, { performance: PerformanceOverride | null }>;
  /** What the app opens on: "auto" (the screen that fits the window) or a screen id; null is "auto". */
  activeProfile?: string | null;
}

/** `target` with each key of `patch` set, or removed when null; undefined when nothing is left. */
function mergeKeys<T extends object>(target: T | undefined, patch: object): T | undefined {
  const out: Record<string, unknown> = { ...target };
  for (const [key, value] of Object.entries(patch)) {
    if (value === null) delete out[key];
    else if (value !== undefined) out[key] = value;
  }
  return Object.keys(out).length > 0 ? (out as T) : undefined;
}

/** The config with a Settings patch applied, the way the server applies it to the saved one. */
export function withSettingsPatch(config: DashboardConfig, patch: SettingsPatch): DashboardConfig {
  const general = patch.general ? { general: mergeKeys(config.general, patch.general) } : {};
  const style = patch.style ? { style: mergeKeys(config.style, patch.style) } : {};
  const screens = patch.profiles;
  const profiles = screens
    ? {
        profiles: config.profiles.map((p) => {
          if (!Object.hasOwn(screens, p.id)) return p;
          const { performance: _old, ...rest } = p;
          const performance = mergeKeys<PerformanceOverride>(undefined, screens[p.id].performance ?? {});
          return performance ? { ...rest, performance } : rest;
        }),
      }
    : {};
  const id = patch.activeProfile ?? "auto";
  const launch = patch.activeProfile !== undefined && (id === "auto" || config.profiles.some((p) => p.id === id)) ? { activeProfile: id } : {};
  return { ...config, ...general, ...style, ...profiles, ...launch };
}
