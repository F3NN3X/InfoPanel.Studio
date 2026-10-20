import type { DashboardConfig, MonitorProfile } from "@/lib/layout";

/**
 * The config with `profile` added. `activate` makes it the one displays show; while the studio is
 * pinned it is false, so the displays are not disturbed.
 */
export function withProfile(config: DashboardConfig, profile: MonitorProfile, activate: boolean): DashboardConfig {
  return {
    ...config,
    profiles: [...config.profiles, profile],
    activeProfile: activate ? profile.id : config.activeProfile,
  };
}

/**
 * The config without profile `id` (never the last one: the same config back). Deleting the edited
 * profile or the pinned one hands the pick to "auto"; any other delete leaves `activeProfile` alone.
 */
export function withoutProfile(config: DashboardConfig, id: string, editedId: string): DashboardConfig {
  if (config.profiles.length <= 1 || !config.profiles.some((p) => p.id === id)) return config;
  const repick = id === editedId || id === config.activeProfile;
  return {
    ...config,
    profiles: config.profiles.filter((p) => p.id !== id),
    activeProfile: repick ? "auto" : config.activeProfile,
  };
}
