/**
 * An InfoPanel profile's name, where it is placed: Screens' Rename on an InfoPanel screen renames its canvas too, so
 * the card, the editor and the export agree. One undo step with the screen's own rename.
 */
import type { DashboardConfig, Placement } from "@/lib/layout";

/** The config with the zones of the page holding `zoneId` changed. */
function mapZones(config: DashboardConfig, zoneId: string, change: (zones: Placement[]) => Placement[]): DashboardConfig {
  return {
    ...config,
    profiles: config.profiles.map((p) =>
      p.pages.some((pg) => pg.placements.some((z) => z.id === zoneId))
        ? { ...p, pages: p.pages.map((pg) => (pg.placements.some((z) => z.id === zoneId) ? { ...pg, placements: change(pg.placements) } : pg)) }
        : p,
    ),
  };
}

/** The profile renamed: InfoPanel's own Name, which the card, the editor and the export read. Its source stays, so its Library link holds. */
export function withPlaceName(config: DashboardConfig, zoneId: string, name: string): DashboardConfig {
  return mapZones(config, zoneId, (zones) => zones.map((z) => (z.id === zoneId && z.canvas ? { ...z, canvas: { ...z.canvas, profile: { ...z.canvas.profile, Name: name } } } : z)));
}
