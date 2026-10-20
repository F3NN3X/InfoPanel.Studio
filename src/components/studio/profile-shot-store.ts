import { useSyncExternalStore } from "react";
import { pruneShots, readShots, writeShots, type ShotEntry, type ShotMap } from "@/lib/profile-shot-cache";

/**
 * The screenshots of this machine's profiles, loaded once. Memory keeps every existing profile's shot (so a
 * profile that does not fit the storage cap is not retaken in a loop); only what is persisted is capped.
 */
let shots: ShotMap = readShots();
const listeners = new Set<() => void>();

function commit(next: ShotMap, profileIds: readonly string[]): void {
  shots = pruneShots(next, profileIds, Infinity);
  writeShots(pruneShots(shots, profileIds));
  listeners.forEach((l) => l());
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => void listeners.delete(listener);
};

/** The screenshot taken of a profile (stale or not), if any. */
export const useShot = (profileId: string): ShotEntry | undefined =>
  useSyncExternalStore(subscribe, () => shots[profileId]);

/** Every screenshot, by profile id. */
export const useShots = (): ShotMap => useSyncExternalStore(subscribe, () => shots);

/** Keep a profile's screenshot; `profileIds` are the profiles that exist (the rest are pruned). */
export function setShot(profileId: string, rev: string, dataUrl: string, profileIds: readonly string[]): void {
  commit({ ...shots, [profileId]: { rev, dataUrl, at: Date.now() } }, profileIds);
}

/** Drop the screenshots of deleted profiles. */
export function pruneProfileShots(profileIds: readonly string[]): void {
  if (Object.keys(shots).some((id) => !profileIds.includes(id))) commit(shots, profileIds);
}
