import { scrollBehavior } from "@/lib/scroll-behavior";
import { INSPECTOR_SCROLL } from "./inspector-layout";

/** The element that scrolls the inspector: its body under the header (the aside as a fallback). */
function scroller(aside: HTMLElement): HTMLElement {
  return aside.querySelector<HTMLElement>(`[${INSPECTOR_SCROLL}]`) ?? aside;
}

/** Scroll the inspector back to its start. */
export function scrollInspectorToTop(aside: HTMLElement | null) {
  if (aside) scroller(aside).scrollTo({ top: 0, left: 0 });
}

/** Scroll the inspector so an element in it shows (the bottom dock scrolls sideways). */
export function revealInInspector(aside: HTMLElement | null, el: HTMLElement | null) {
  if (!aside || !el) return;
  const box = scroller(aside);
  const r = el.getBoundingClientRect();
  const b = box.getBoundingClientRect();
  const top = r.top - b.top;
  const left = r.left - b.left;
  const inView = top >= 0 && top < box.clientHeight - 64 && left >= 0 && left < box.clientWidth - 64;
  if (inView) return;
  box.scrollTo({ top: box.scrollTop + top - 8, left: box.scrollLeft + left - 8, behavior: scrollBehavior() });
}

/** Scroll the inspector so the widget editor shows. */
export function revealWidgetEditor(aside: HTMLElement | null) {
  revealInInspector(aside, aside?.querySelector<HTMLElement>("[data-widget-editor]") ?? null);
}
