// The widget kinds a page shows load together as soon as its profile is known, so the kiosk fetches their chunks in
// parallel (no waterfall behind the first render); the profile's other pages' follow when the page is idle, so a page
// switch draws at once, and a kiosk keeps its screen up until the next screen's are in (`lazy-widget.tsx`).
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { MonitorProfile } from "@/lib/layout";
import type { DashboardModule } from "@/modules/types";

type Pages = Pick<MonitorProfile, "pages">;

/** The widget kinds (module ids) on the zones of `page` (else the first page), each once. */
export function pageKinds(profile: Pages, page?: string): string[] {
  const shown = profile.pages.find((p) => p.id === page) ?? profile.pages[0];
  return [...new Set(shown?.placements.map((z) => z.module) ?? [])];
}

/** The widget kinds on every page of the profiles, each once. */
export function profileKinds(profiles: readonly Pages[]): string[] {
  return [...new Set(profiles.flatMap((p) => p.pages.flatMap((g) => g.placements.map((z) => z.module))))];
}

/** Fetches the chunks of `kinds` at once. Kinds without one (in the entry, a canvas, a panel, unknown) are skipped. */
export function preloadKinds(kinds: readonly string[], mods: readonly DashboardModule[]): Promise<unknown> {
  const byId = new Map(mods.map((m) => [m.id, m]));
  // A failed fetch is left to the zone, which asks again when it draws.
  return Promise.all(kinds.map((k) => byId.get(k)?.preload?.().catch(() => undefined)));
}

/** Calls `fn` when the page is idle. */
function whenIdle(fn: () => void): () => void {
  if (typeof requestIdleCallback === "function") {
    const handle = requestIdleCallback(fn, { timeout: 5000 });
    return () => cancelIdleCallback(handle);
  }
  const t = setTimeout(fn, 1000);
  return () => clearTimeout(t);
}

/**
 * Preloads the widget kinds of the shown page, then, when idle, of the profile's other pages. Off while `enabled` is
 * false (a kiosk before it has the server's config).
 */
export function useWidgetPreload(profile: Pages, page: string | undefined, mods: readonly DashboardModule[], enabled: boolean): void {
  // Before paint: the fetches start in the task that brought the profile, not a frame later.
  useLayoutEffect(() => {
    if (!enabled) return;
    let live = true;
    let cancel = () => {};
    void preloadKinds(pageKinds(profile, page), mods).then(() => {
      if (live) cancel = whenIdle(() => void preloadKinds(profileKinds([profile]), mods));
    });
    return () => {
      live = false;
      cancel();
    };
  }, [profile, page, mods, enabled]);
}

/** The longest a kiosk keeps its old screen up while the next one's widgets load. */
export const HOLD_MS = 3000;

/**
 * The profile to draw: `wanted`, or while `hold` (a kiosk with the server's config) and the screen changes, the one
 * on screen until the next one's widget kinds are in, so the change draws at once. The first profile draws at once
 * (its zones fill in as their chunks arrive), and so does a change to the profile on screen.
 */
export function useLoadedProfile<P extends Pages & { id: string }>(wanted: P, mods: readonly DashboardModule[], hold: boolean): P {
  const onScreen = useRef<P | undefined>(undefined);
  const loaded = useRef(new Set<string>());
  const [, loadedOne] = useState(0);
  const prev = onScreen.current;
  const ready = !hold || !prev || prev.id === wanted.id || loaded.current.has(wanted.id);
  const shown = ready || !prev ? wanted : prev;
  useEffect(() => {
    if (hold) onScreen.current = shown;
  });
  useEffect(() => {
    if (ready) return;
    let live = true;
    // A chunk that never answers holds the old screen for at most HOLD_MS.
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise((resolve) => (timer = setTimeout(resolve, HOLD_MS)));
    void Promise.race([preloadKinds(profileKinds([wanted]), mods), timeout]).then(() => {
      loaded.current.add(wanted.id);
      if (live) loadedOne((n) => n + 1);
    });
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [ready, wanted, mods]);
  return shown;
}
