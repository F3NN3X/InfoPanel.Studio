import { resolveProfile, type DashboardConfig } from "@/lib/layout";

/** localStorage key holding the profile the studio is pinned to for editing. */
const STORAGE_KEY = "studio.pinnedProfile";

/**
 * The id of the profile the studio edits: the pinned one while it exists, otherwise the one the
 * displays show (the config's pick, or what Auto resolves to for the window). An unknown pin is ignored.
 */
export function editedProfileId(config: DashboardConfig, pin: string | undefined, windowWidth: number, windowHeight: number): string {
  if (pin && config.profiles.some((p) => p.id === pin)) return pin;
  return resolveProfile(config, windowWidth, windowHeight).id;
}

/** The pin after a profile is added or imported: while pinned it follows to the new profile. */
export function pinAfterAdd(pin: string | undefined, addedId: string): string | undefined {
  return pin ? addedId : undefined;
}

/** The stored pin (studio-only view state, never in the config); undefined without one. */
export function readPin(): string | undefined {
  try {
    return localStorage.getItem(STORAGE_KEY) || undefined;
  } catch {
    return undefined;
  }
}

/** Remember the pin, or forget it when `id` is undefined. */
export function writePin(id: string | undefined): void {
  try {
    if (id) localStorage.setItem(STORAGE_KEY, id);
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Storage unavailable (private mode, quota): the pin lasts for the session.
  }
}
