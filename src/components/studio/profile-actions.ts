import { clonePlacement, uid, type DashboardConfig, type MonitorProfile } from "@/lib/layout";

/**
 * The config with `profile` added. `activate` makes it the one displays show; the studio passes
 * false, since only "When the app opens" changes what displays show.
 */
export function withProfile(config: DashboardConfig, profile: MonitorProfile, activate: boolean): DashboardConfig {
  return {
    ...config,
    profiles: [...config.profiles, profile],
    activeProfile: activate ? profile.id : config.activeProfile,
  };
}

/**
 * The config without profile `id` (never the last one: the same config back). Deleting the profile
 * displays are set to open hands the pick to "auto"; any other delete leaves `activeProfile` alone.
 */
export function withoutProfile(config: DashboardConfig, id: string): DashboardConfig {
  if (config.profiles.length <= 1 || !config.profiles.some((p) => p.id === id)) return config;
  return {
    ...config,
    profiles: config.profiles.filter((p) => p.id !== id),
    activeProfile: id === config.activeProfile ? "auto" : config.activeProfile,
  };
}

/**
 * A deep copy of `profile` with fresh ids throughout: the profile, its pages, their zones and the
 * panels and widgets in them. `rotate.pages` follows the pages to their new ids. Nothing is shared
 * with the source, by id or by reference.
 */
export function withFreshIds(profile: MonitorProfile): MonitorProfile {
  const copy = structuredClone(profile);
  const pageIds = new Map<string, string>();
  const pages = copy.pages.map((page) => {
    const id = uid("page");
    pageIds.set(page.id, id);
    return { ...page, id, placements: page.placements.map(clonePlacement) };
  });
  const { rotate } = copy;
  return {
    ...copy,
    id: uid("profile"),
    pages,
    rotate: rotate && {
      ...rotate,
      pages: rotate.pages?.flatMap((id) => pageIds.get(id) ?? []),
    },
  };
}

/** The config with a copy of profile `id` ("‹name› copy") directly below it; null for an unknown id. */
export function duplicateProfile(
  config: DashboardConfig,
  id: string
): { config: DashboardConfig; profileId: string } | null {
  const at = config.profiles.findIndex((p) => p.id === id);
  if (at < 0) return null;
  const copy = { ...withFreshIds(config.profiles[at]), name: `${config.profiles[at].name} copy` };
  const profiles = [...config.profiles];
  profiles.splice(at + 1, 0, copy);
  return { config: { ...config, profiles }, profileId: copy.id };
}

/** `name`, or `name 2`, `name 3`… when the profiles already hold it. */
export function uniqueProfileName(profiles: MonitorProfile[], name: string): string {
  const taken = new Set(profiles.map((p) => p.name));
  if (!taken.has(name)) return name;
  let n = 2;
  while (taken.has(`${name} ${n}`)) n += 1;
  return `${name} ${n}`;
}
