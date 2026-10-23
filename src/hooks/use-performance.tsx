"use client";

import { createContext, useContext, useEffect, useMemo, useSyncExternalStore, type ReactNode } from "react";
import { useGeneral } from "@/hooks/use-general";
import { resolvePerformance, type PerformanceOverride, type ResolvedPerformance } from "@/lib/performance";
import { setTickerMaxFps } from "@/lib/ticker";

/** The most a widget's blur may be when Limit blur is on. */
const BLUR_CAP_PX = 12;

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
    return () => document.documentElement.removeAttribute("data-lite-motion");
  }, [lite]);
  // The Rendering options reach the CSS the same way (see the flags next to `data-lite-motion` in index.css).
  const { ringGlide, blurLimit, innerBlur, liveGlow } = useGeneral();
  useEffect(() => {
    const root = document.documentElement;
    root.toggleAttribute("data-ring-step", !ringGlide);
    root.toggleAttribute("data-inner-blur-off", !innerBlur);
    root.toggleAttribute("data-glow-static", !liveGlow);
    if (blurLimit) root.style.setProperty("--wp-blur-cap", `${BLUR_CAP_PX}px`);
    else root.style.removeProperty("--wp-blur-cap");
    return () => {
      for (const flag of ["data-ring-step", "data-inner-blur-off", "data-glow-static"]) root.removeAttribute(flag);
      root.style.removeProperty("--wp-blur-cap");
    };
  }, [ringGlide, blurLimit, innerBlur, liveGlow]);
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
