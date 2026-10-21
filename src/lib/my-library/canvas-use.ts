import type { StoredCanvas } from "@/lib/infopanel/import/stored";
import { CANVAS_ID, type DashboardConfig } from "@/lib/layout";

/** Where a stored canvas is placed: the first canvas zone, in screen then page order, that was made from it. */
export interface CanvasUse {
  profileId: string;
  pageId: string;
  zoneId: string;
}

/**
 * The first zone using a Library canvas. A zone keeps its own copy of the canvas, so it is told by where it came from:
 * the source file's name and import time.
 */
export function findCanvasUse(config: Pick<DashboardConfig, "profiles">, stored: Pick<StoredCanvas, "source">): CanvasUse | undefined {
  for (const profile of config.profiles)
    for (const page of profile.pages) {
      const zone = page.placements.find(
        (z) => z.module === CANVAS_ID && z.canvas?.source.name === stored.source.name && z.canvas.source.importedAt === stored.source.importedAt,
      );
      if (zone) return { profileId: profile.id, pageId: page.id, zoneId: zone.id };
    }
  return undefined;
}
