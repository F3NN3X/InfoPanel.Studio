import { useLayoutEffect, useState, type RefObject } from "react";
import { gapPlacement } from "./layout";

type Gap = { left: number; width: number } | null;

const same = (a: Gap, b: Gap) => a === b || (a !== null && b !== null && Math.abs(a.left - b.left) < 0.5 && Math.abs(a.width - b.width) < 0.5);

/**
 * The island's gap in the bar's own px, from the bar's place on the page. `width` is the gap in page px.
 * The studio canvas is a zoomed page element (`data-studio-page`): its rect gives the centre and the zoom;
 * on the kiosk the page is the window, at 1:1. Re-measured on every render (a zone move changes nothing a
 * ResizeObserver sees) and when the bar, the page or the window resize.
 */
export function useGap(ref: RefObject<HTMLElement | null>, width: number, pageWidth: number): Gap {
  const [gap, setGap] = useState<Gap>(null);
  const measure = () => {
    const el = ref.current;
    if (!el) return;
    const bar = el.getBoundingClientRect();
    const page = el.closest<HTMLElement>("[data-studio-page]")?.getBoundingClientRect();
    // viewport px per page px (the canvas zoom), and the bar's own px per viewport px (its Size %)
    const zoom = page && pageWidth > 0 ? page.width / pageWidth : 1;
    const own = bar.width > 0 ? el.offsetWidth / bar.width : 1;
    const placed = gapPlacement({ barLeft: bar.left, barWidth: bar.width, pageCentre: page ? page.left + page.width / 2 : window.innerWidth / 2, width: width * zoom });
    const next = placed && { left: placed.left * own, width: placed.width * own };
    setGap((prev) => (same(prev, next) ? prev : next));
  };
  useLayoutEffect(measure);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    const page = el.closest("[data-studio-page]");
    if (page) ro.observe(page);
    window.addEventListener("resize", measure);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [width, pageWidth]);
  return gap;
}
