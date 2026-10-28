import type { DashboardConfig, MonitorProfile } from "@/lib/layout";

/** A profile's screenshot: the `rev` it was taken at, the WebP data URL, and when (ms). */
export interface ShotEntry {
  rev: string;
  dataUrl: string;
  at: number;
}

/** Profile id to its screenshot. */
export type ShotMap = Record<string, ShotEntry>;

const STORAGE_KEY = "infopanel.studio.profile-shots";
/** The cache's total size in characters of data URL (about 2 MB). */
export const SHOT_CACHE_MAX = 2_000_000;

/** 32-bit FNV-1a, as 8 hex digits. */
function fnv1a(text: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

const profileHashes = new WeakMap<MonitorProfile, string>();

/** What a screenshot depends on: the profile and the app's clock it inherits. A new `rev` makes the shot stale. */
export function profileRev(profile: MonitorProfile, dashboard: Pick<DashboardConfig, "general">): string {
  // The profile's own hash is kept per object (an edit makes a new one), so a drag frame hashes only the edited profile.
  let own = profileHashes.get(profile);
  if (own === undefined) profileHashes.set(profile, (own = fnv1a(JSON.stringify(profile))));
  return fnv1a(own + JSON.stringify([dashboard.general?.clock]));
}

/** The cache for the profiles that still exist, the oldest entries dropped until it fits `maxChars`. */
export function pruneShots(map: ShotMap, profileIds: readonly string[], maxChars = SHOT_CACHE_MAX): ShotMap {
  const kept = Object.entries(map)
    .filter(([id]) => profileIds.includes(id))
    .sort(([, a], [, b]) => b.at - a.at);
  let total = 0;
  const out: ShotMap = {};
  for (const [id, entry] of kept) {
    total += entry.dataUrl.length;
    if (total > maxChars) break;
    out[id] = entry;
  }
  return out;
}

const isEntry = (v: unknown): v is ShotEntry =>
  typeof v === "object" &&
  v !== null &&
  typeof (v as ShotEntry).rev === "string" &&
  typeof (v as ShotEntry).dataUrl === "string" &&
  typeof (v as ShotEntry).at === "number";

/** The stored cache; empty when nothing is stored, it is malformed or storage is unavailable. */
export function readShots(): ShotMap {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}");
    if (typeof parsed !== "object" || parsed === null) return {};
    return Object.fromEntries(Object.entries(parsed).filter(([, v]) => isEntry(v)));
  } catch {
    return {};
  }
}

/** Store the cache; a full or unavailable storage keeps the session's copy only. */
export function writeShots(map: ShotMap): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch {
    // Quota or private mode: the shots are regenerated next session.
  }
}
