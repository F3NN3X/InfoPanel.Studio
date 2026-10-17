import { useSyncExternalStore } from "react";

/** The media query for a viewport narrower than `px`. */
export const belowQuery = (px: number) => `(max-width: ${px - 0.02}px)`;

/** True while the viewport is narrower than `px` CSS pixels (false where matchMedia is missing). */
export function useViewportBelow(px: number): boolean {
  const query = belowQuery(px);
  return useSyncExternalStore(
    (onChange) => {
      if (typeof window === "undefined" || !window.matchMedia) return () => undefined;
      const media = window.matchMedia(query);
      media.addEventListener("change", onChange);
      return () => media.removeEventListener("change", onChange);
    },
    () => typeof window !== "undefined" && Boolean(window.matchMedia?.(query).matches),
    () => false
  );
}
