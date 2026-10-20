import { useCallback, useEffect, useRef, useState } from "react";
import { fitZoomFor, stepZoom, type CanvasInset } from "./studio-layout";
import { useMiddlePan } from "./use-middle-pan";
import { loadZoomPref, saveZoomPref } from "./zoom-pref";

/**
 * Canvas zoom: discrete steps, ctrl/cmd + wheel over the scroll container (and middle-drag pans it),
 * and a sticky fit. While `fitting` (the default) the zoom is whatever fits
 * the profile's page (`page.height` 0 = width only) into the canvas, and
 * follows the container and the profile; any manual zoom turns it off and
 * `fitZoom` turns it back on. Attach the scroll container with
 * `attachScroll` (a callback ref: the canvas remounts after a Sources
 * round-trip and the wheel listener must follow it); read it through
 * `scrollRef`. The fit keeps the page clear of `inset` (the open floating
 * inspector).
 */
export function useCanvasZoom(page: { width: number; height: number }, inset: CanvasInset = {}) {
  // The zoom mode (fit, or a manual zoom) is remembered across reloads.
  const [initial] = useState(loadZoomPref);
  const [manual, setManual] = useState(initial.manual);
  const [fitting, setFitting] = useState(initial.fitting);
  useEffect(() => saveZoomPref({ fitting, manual }), [fitting, manual]);
  const [box, setBox] = useState({ width: 0, height: 0 });
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [scrollEl, setScrollEl] = useState<HTMLDivElement | null>(null);
  const attachScroll = useCallback((el: HTMLDivElement | null) => {
    scrollRef.current = el;
    setScrollEl(el);
  }, []);
  useMiddlePan(scrollEl);

  // The fit follows the scroll container's size.
  useEffect(() => {
    const el = scrollEl;
    if (!el) return;
    const measure = () => setBox({ width: el.clientWidth, height: el.clientHeight });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [scrollEl]);

  const fitted = fitZoomFor(box, page, inset);
  // Before the first measurement there is nothing to fit to yet.
  const zoom = fitting && box.width > 0 ? fitted : manual;

  /** Zoom manually: leaves the fit. */
  const setZoom = useCallback((z: number) => {
    setFitting(false);
    setManual(z);
  }, []);

  // Ctrl/cmd + wheel zooms the canvas, from the zoom on screen.
  const zoomRef = useRef(zoom);
  zoomRef.current = zoom;
  useEffect(() => {
    const el = scrollEl;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      e.preventDefault();
      // Advance the ref too: several wheel events can land before a render.
      zoomRef.current = stepZoom(zoomRef.current, e.deltaY < 0 ? 1 : -1);
      setZoom(zoomRef.current);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [scrollEl, setZoom]);

  const zoomStep = (dir: 1 | -1) => setZoom(stepZoom(zoom, dir));

  /** Fit the page to the canvas and keep it fitted. */
  const fitZoom = () => setFitting(true);

  return { zoom, fitting, setZoom, zoomStep, fitZoom, scrollRef, attachScroll };
}
