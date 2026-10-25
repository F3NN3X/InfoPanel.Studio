import { CANVAS_ID, type DashboardConfig } from "@/lib/layout";

/** What deleting a screen takes with it, and whether it may be deleted. */
export interface DeletePlan {
  name: string;
  /** False for the last screen: a dashboard always has one. */
  allowed: boolean;
  pages: number;
  zones: number;
  /** InfoPanel canvas zones among the zones. */
  canvases: number;
  /** The app opens on this screen ("Always this screen"); deleting it returns to Best fit. */
  launch: boolean;
  /** Kiosks showing it now. */
  kiosks: number;
}

/** The plan for deleting screen `id`; null for an id nothing matches. `shown` are the profile ids the connected kiosks show. */
export function deletePlan(config: Pick<DashboardConfig, "profiles" | "activeProfile">, id: string, shown: readonly string[] = []): DeletePlan | null {
  const profile = config.profiles.find((p) => p.id === id);
  if (!profile) return null;
  const zones = profile.pages.flatMap((pg) => pg.placements);
  return {
    name: profile.name,
    allowed: config.profiles.length > 1,
    pages: profile.pages.length,
    zones: zones.length,
    canvases: zones.filter((z) => z.module === CANVAS_ID).length,
    launch: config.activeProfile === id,
    kiosks: shown.filter((p) => p === id).length,
  };
}

const count = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** The lines the confirm shows: what goes, then what else changes. */
export function deleteLines(plan: DeletePlan): string[] {
  const goes = [count(plan.pages, "page"), count(plan.zones, "zone")];
  if (plan.canvases > 0) goes.push(count(plan.canvases, "InfoPanel canvas", "InfoPanel canvases"));
  const lines = [`This removes the screen with ${goes.join(", ")}.`];
  if (plan.launch) lines.push("The app opens on it now. After this it opens the best fit for the window.");
  if (plan.kiosks > 0) lines.push(`${count(plan.kiosks, "kiosk")} ${plan.kiosks === 1 ? "shows" : "show"} it now.`);
  lines.push("Undo (Ctrl+Z) brings it back.");
  return lines;
}
