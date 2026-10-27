/**
 * The page model's door (Edit v3 SPEC §3.4): a page read through the adapter its backing needs, and ops written
 * back through the same one, so the editor never asks which store a page has. A page that is one canvas filling the
 * screen is canvas-backed (an imported profile); every other page is placement-backed.
 */
import type { DashboardConfig, MonitorProfile, Placement, ProfilePage } from "../layout.ts";
import { freeCanvasOf } from "../screens/list.ts";
import { readCanvas, writeCanvas } from "./canvas-adapter.ts";
import { applyOps, type PageModel, type PageOp } from "./model.ts";
import { readPlacements, writePlacements } from "./placements-adapter.ts";

export * from "./model.ts";

/** Whether the page is backed by one canvas filling the screen (its items in the canvas), not by placements. */
export const canvasBacked = (profile: Pick<MonitorProfile, "cols" | "rows">, page: Pick<ProfilePage, "placements">): boolean => freeCanvasOf(profile, page) !== null;

/** The page as a model; null for a canvas-backed page whose canvas isn't loaded yet. */
export function readPage(profile: MonitorProfile, page: ProfilePage, nameOf?: (p: Placement) => string): PageModel | null {
  return canvasBacked(profile, page) ? readCanvas(profile, page) : readPlacements(profile, page, nameOf);
}

/** The model written back into the page it was read from; the same page when nothing changed. */
export function writePage(profile: MonitorProfile, page: ProfilePage, model: PageModel): ProfilePage {
  return canvasBacked(profile, page) ? writeCanvas(profile, page, model) : writePlacements(page, model);
}

/** The config after `ops` on one page, as one change; the same config when they change nothing or the page is gone. */
export function applyPage(config: DashboardConfig, profileId: string, pageId: string, ops: readonly PageOp[]): DashboardConfig {
  const profile = config.profiles.find((p) => p.id === profileId);
  const page = profile?.pages.find((pg) => pg.id === pageId);
  if (!profile || !page) return config;
  const model = readPage(profile, page);
  if (!model) return config;
  const next = applyOps(model, ops);
  if (next === model) return config;
  const written = writePage(profile, page, next);
  if (written === page) return config;
  const changed = { ...profile, pages: profile.pages.map((pg) => (pg === page ? written : pg)) };
  return { ...config, profiles: config.profiles.map((p) => (p === profile ? changed : p)) };
}
