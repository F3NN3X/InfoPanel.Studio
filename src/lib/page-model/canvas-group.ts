// Its own module rather than migrate.ts: migrate runs in the kiosk's first bundle, and only Studio's import needs this.
import { CANVAS_ID, type MonitorProfile, type PageGroup, type Placement, type ProfilePage } from "../layout.ts";
import { areaToGroup, type Ctx } from "./migrate.ts";
import { readPlacements, screenGrid, writePlacements } from "./placements-adapter.ts";

/**
 * One canvas zone on a screen's page as a group of item placements, as v15 converts a free area (an InfoPanel profile
 * or component imported onto the page lands this way, so no free area is made any more). The page, and the group's
 * id; the same page and null when the zone isn't a loaded canvas there.
 */
export function canvasAsGroup(profile: MonitorProfile, page: ProfilePage, zoneId: string, log: (line: string) => void = () => {}): { page: ProfilePage; groupId: string | null } {
  const zone = page.placements.find((p) => p.id === zoneId && p.module === CANVAS_ID);
  if (!zone?.canvas) return { page, groupId: null };
  const ctx: Ctx = { profile, grid: screenGrid(profile), taken: new Set(profile.pages.flatMap((pg) => pg.placements.map((z) => z.id))), log };
  const placements: Placement[] = [];
  const groups: PageGroup[] = [...(page.groups ?? [])];
  let store = page.freeCanvas;
  for (const p of page.placements) {
    if (p === zone) store = areaToGroup(ctx, page, p, zone.canvas, store, placements, groups);
    else placements.push(p);
  }
  const groupId = groups[(page.groups ?? []).length]?.id ?? null;
  const next = { ...page, placements, groups, ...(store ? { freeCanvas: store } : {}) };
  return { page: writePlacements(next, readPlacements(profile, next)), groupId };
}
