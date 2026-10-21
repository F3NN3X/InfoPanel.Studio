import { resolveProfile, type DashboardConfig } from "@/lib/layout";

/**
 * localStorage key holding the profile the studio edits: the selected card in the Profiles panel.
 * (Named for the "pin" it began as, so a selection saved by an earlier version is still read.)
 */
const STORAGE_KEY = "studio.pinnedProfile";

/**
 * The id of the profile the studio edits: the selected one while it exists, otherwise (before any
 * card was clicked) the one displays open on. An unknown selection is ignored.
 */
export function editedProfileId(config: DashboardConfig, pin: string | undefined, windowWidth: number, windowHeight: number): string {
  if (pin && config.profiles.some((p) => p.id === pin)) return pin;
  return resolveProfile(config, windowWidth, windowHeight).id;
}

/** The stored selection (studio-only view state, never in the config); undefined without one. */
export function readPin(): string | undefined {
  try {
    return localStorage.getItem(STORAGE_KEY) || undefined;
  } catch {
    return undefined;
  }
}

/** Remember the selection, or forget it when `id` is undefined. */
export function writePin(id: string | undefined): void {
  try {
    if (id) localStorage.setItem(STORAGE_KEY, id);
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Storage unavailable (private mode, quota): the selection lasts for the session.
  }
}
