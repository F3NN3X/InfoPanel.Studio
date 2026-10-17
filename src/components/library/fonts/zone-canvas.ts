/**
 * One canvas zone's stored form changed inside a config update, read from the config the update
 * receives (not from a render's props), so an edit made while a download ran is not lost.
 */
import { withCanvas } from "@/components/studio/import-actions";
import type { StoredCanvas } from "@/lib/infopanel/import/stored";
import type { DashboardConfig } from "@/lib/layout";

/** The config with `change` applied to the zone's canvas; the same config when nothing changes. */
export function mapCanvas(config: DashboardConfig, zoneId: string, change: (canvas: StoredCanvas) => StoredCanvas): DashboardConfig {
  const zone = config.profiles.flatMap((p) => p.pages.flatMap((pg) => pg.placements)).find((z) => z.id === zoneId);
  if (!zone?.canvas) return config;
  const next = change(zone.canvas);
  return next === zone.canvas ? config : withCanvas(config, zoneId, next);
}
