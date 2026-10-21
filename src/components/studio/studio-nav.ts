import { useEffect } from "react";
import type { ThemeScope } from "./theme-editor-model";

/**
 * Where a `↗` link, an inheritance chip's "Edit … ↗" or a status bar item
 * goes (SPEC §4.1): a view, its tab and section, and the control to focus.
 * The views mark their targets with `data-nav-section` / `data-nav-control`;
 * `useNavFocus` scrolls to and focuses them once the view has rendered.
 */

/** The studio's full views (SPEC §3.2), plus Screens (reached from the switcher and links), and the Settings window. */
export type StudioView = "design" | "theme" | "library" | "gauges" | "data" | "alerts" | "screens" | "settings";

export interface NavTarget {
  view: StudioView;
  /** A tab of the view (Alerts & Island: rules | island | …); Settings: dashboard | studio | app, its window's page. */
  tab?: string;
  /** A section of the view or tab (`data-nav-section`). */
  section?: string;
  /** The control to focus (`data-nav-control`), inside the section when one is given. */
  control?: string;
  /** Theme: the scope to open at. */
  themeScope?: ThemeScope;
  /** Theme or Screens: the screen (profile) to open with. */
  profileId?: string;
}

/**
 * The Settings window's page for a Settings target (PLAN decision 21): an App page (`server`, General when none is
 * named), or Dashboard or Studio with the group to scroll to (`dashboard/performance`). Undefined for no tab: the
 * window opens, or comes to the front, as it was.
 */
export function settingsPageOf(target: NavTarget): string | undefined {
  if (!target.tab) return undefined;
  if (target.tab === "app") return target.section ?? "general";
  const page = target.tab === "studio" ? "studio" : "dashboard";
  return target.section ? `${page}/${target.section}` : page;
}

/** A navigation request; `seq` makes a repeat of the same target count. */
export interface NavRequest {
  target: NavTarget;
  seq: number;
}

const FOCUSABLE = "button:not(:disabled), [href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex='-1'])";

/**
 * Scroll a target's section into view and focus its control (or the
 * section's first focusable control). False while the view has not
 * rendered it yet.
 */
export function focusNavTarget(root: ParentNode, target: NavTarget): boolean {
  const section = target.section ? root.querySelector<HTMLElement>(`[data-nav-section="${CSS.escape(target.section)}"]`) : null;
  if (target.section && !section) return false;
  const scope: ParentNode = section ?? root;
  const marked = target.control ? scope.querySelector<HTMLElement>(`[data-nav-control="${CSS.escape(target.control)}"]`) : null;
  if (target.control && !marked) return false;
  const control = marked && !marked.matches(FOCUSABLE) ? (marked.querySelector<HTMLElement>(FOCUSABLE) ?? marked) : marked;
  (control ?? section)?.scrollIntoView({ block: "nearest" });
  (control ?? section?.querySelector<HTMLElement>(FOCUSABLE))?.focus({ preventScroll: true });
  return true;
}

/** Frames `useNavFocus` waits for a lazy view to render its target. */
const MAX_FRAMES = 30;

/** Focus each new request's target once it renders (gives up after about half a second). */
export function useNavFocus(request: NavRequest | undefined): void {
  useEffect(() => {
    if (!request || (!request.target.section && !request.target.control)) return;
    let frames = 0;
    let id = requestAnimationFrame(function attempt() {
      if (focusNavTarget(document, request.target) || ++frames >= MAX_FRAMES) return;
      id = requestAnimationFrame(attempt);
    });
    return () => cancelAnimationFrame(id);
  }, [request?.seq]);
}
