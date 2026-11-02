import { useEffect } from "react";

/** The app zoom steps (percent) the app windows offer. */
export const ZOOMS = [80, 90, 100, 110, 125, 150, 175, 200];

/** The zoom a step away (clamped at the ends); 0 resets to 100. */
export function stepZoom(current: number, step: -1 | 0 | 1): number {
  if (step === 0) return 100;
  const i = ZOOMS.indexOf(current);
  const from = i < 0 ? ZOOMS.findIndex((z) => z >= current) : i;
  return ZOOMS[Math.min(ZOOMS.length - 1, Math.max(0, (from < 0 ? ZOOMS.length - 1 : from) + step))];
}

/** What a zoom key says when it can go no further. */
export const zoomLimitText = (percent: number): string => `${percent}% — ${percent <= ZOOMS[0] ? "minimum" : "maximum"}`;

/** Ctrl +, Ctrl - and Ctrl 0 zoom every app window; `notify` says when a key hits the end of the steps. */
export function useZoomKeys(zoom: number, setZoom: (percent: number) => void | Promise<void>, notify?: (message: string) => void) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
      const step = e.key === "=" || e.key === "+" ? 1 : e.key === "-" ? -1 : e.key === "0" ? 0 : null;
      if (step === null) return;
      e.preventDefault();
      const next = stepZoom(zoom, step);
      if (next !== zoom) void setZoom(next);
      else if (step !== 0) notify?.(zoomLimitText(next));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [zoom, setZoom, notify]);
}
