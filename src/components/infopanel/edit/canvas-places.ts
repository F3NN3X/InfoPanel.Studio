/**
 * Where the InfoPanel profiles are: every canvas zone in the config. Its own module so the studio can find them without
 * loading the canvas editor (lazy-loaded).
 */
import type { StoredCanvas } from "@/lib/infopanel/import/stored";
import { CANVAS_ID, type DashboardConfig } from "@/lib/layout";

export interface CanvasPlace {
  profileId: string;
  pageId: string;
  zoneId: string;
  /** "Desk › Page 1". */
  where: string;
  name: string;
  width: number;
  height: number;
  items: number;
  canvas: StoredCanvas;
}

/** Every canvas zone in the config, in screen then page order. */
export function canvasPlaces(config: Pick<DashboardConfig, "profiles">): CanvasPlace[] {
  return config.profiles.flatMap((p) =>
    p.pages.flatMap((pg) =>
      pg.placements.flatMap((z) =>
        z.module === CANVAS_ID && z.canvas
          ? [
              {
                profileId: p.id,
                pageId: pg.id,
                zoneId: z.id,
                where: p.pages.length > 1 ? `${p.name} › ${pg.name}` : p.name,
                name: String(z.canvas.profile.Name ?? z.canvas.source.name),
                width: Number(z.canvas.profile.Width) || 0,
                height: Number(z.canvas.profile.Height) || 0,
                items: z.canvas.items.length,
                canvas: z.canvas,
              },
            ]
          : [],
      ),
    ),
  );
}
