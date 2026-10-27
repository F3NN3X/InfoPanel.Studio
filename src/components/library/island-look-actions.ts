import type { DashboardConfig } from "@/lib/layout";
import { withIsland } from "@/lib/island/config";
import type { IslandLookFields } from "@/lib/island/looks";

/**
 * An Island look on one screen or on all of them: its shape, colours, border, shadow and weight, and the island
 * switched on (a look you apply is one you want to see). Everything else of the island is kept, as the Island tab's
 * Look rows would leave it.
 */
export function withIslandLook(config: DashboardConfig, look: IslandLookFields, profileId: string | "all"): DashboardConfig {
  return { ...config, profiles: config.profiles.map((p) => (profileId === "all" || p.id === profileId ? withIsland(p, { ...look, enabled: true }) : p)) };
}
