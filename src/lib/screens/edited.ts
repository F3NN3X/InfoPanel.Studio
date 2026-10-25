import type { DashboardConfig } from "@/lib/layout";

/**
 * `next` with `updatedAt` set to `now` on each screen that is new or is no longer the object it was in `prev`.
 * By identity: an edit copies the screen it changes and shares the rest, so this costs one pass of reference checks per edit.
 * A screen whose `updatedAt` the change itself set keeps that.
 */
export function stampEdited(prev: DashboardConfig, next: DashboardConfig, now: Date): DashboardConfig {
  if (next.profiles === prev.profiles) return next;
  const before = new Map(prev.profiles.map((p) => [p.id, p]));
  let changed = false;
  const profiles = next.profiles.map((p) => {
    const was = before.get(p.id);
    if (was === p || (was && was.updatedAt !== p.updatedAt)) return p;
    changed = true;
    return { ...p, updatedAt: now.toISOString() };
  });
  return changed ? { ...next, profiles } : next;
}
