import type { DashboardConfig } from "@/lib/layout";

/** The config with screen `id` moved `by` places in the list (clamped to the ends); the same config when it would not move. */
export function moveProfile(config: DashboardConfig, id: string, by: number): DashboardConfig {
  const from = config.profiles.findIndex((p) => p.id === id);
  if (from < 0) return config;
  const to = Math.min(config.profiles.length - 1, Math.max(0, from + by));
  if (to === from) return config;
  const profiles = [...config.profiles];
  const [moved] = profiles.splice(from, 1);
  profiles.splice(to, 0, moved);
  return { ...config, profiles };
}
