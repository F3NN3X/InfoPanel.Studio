"use client";

import { createContext, useContext, useEffect, useMemo, useSyncExternalStore, type ReactNode } from "react";
import { useGeneral } from "@/hooks/use-general";
import { resolvePerformance, type PerformanceOverride, type ResolvedPerformance } from "@/lib/performance";
import { setTickerMaxFps } from "@/lib/ticker";

const QUERY = "(prefers-reduced-motion: reduce)";

const subscribe = (onChange: () => void) => {
  if (typeof window === "undefined" || !window.matchMedia) {
    return () => {
      // Nothing to unsubscribe on the server.
    };
  }
  const media = window.matchMedia(QUERY);
  media.addEventListener("change", onChange);
  return () => {
    media.removeEventListener("change", onChange);
  };
};

const getSnapshot = () =>
  typeof window !== "undefined" && Boolean(window.matchMedia?.(QUERY).matches);

const getServerSnapshot = () => false;

const OverrideContext = createContext<PerformanceOverride | undefined>(undefined);

/**
 * The URL and profile overrides (URL already over the profile's) for everything
 * below; also points the shared ticker at the resolved Max FPS. Inside a General provider.
 */
export function PerformanceProvider({ value, children }: { value: PerformanceOverride | undefined; children: ReactNode }) {
  const { maxFps, reduceMotion } = usePerformance(value);
  useEffect(() => {
    setTickerMaxFps(maxFps);
  }, [maxFps]);
  // CSS transitions and animations run at the display rate whatever the cap, so below 60 fps (or with
  // reduced motion) the widgets drop them (see `data-lite-motion` in index.css).
  const lite = reduceMotion || (maxFps > 0 && maxFps < 60);
  useEffect(() => {
    document.documentElement.toggleAttribute("data-lite-motion", lite);
  }, [lite]);
  return <OverrideContext.Provider value={value}>{children}</OverrideContext.Provider>;
}

/** Max FPS and reduced motion: URL > profile > general settings > default (see `resolvePerformance`). */
export function usePerformance(override?: PerformanceOverride): ResolvedPerformance {
  const system = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const general = useGeneral();
  const inherited = useContext(OverrideContext);
  const layer = override ?? inherited;
  return useMemo(() => resolvePerformance({ url: layer, general, system }), [layer, general, system]);
}
