import { useSyncExternalStore } from "react";

/**
 * What the frames checked so far found, for the top bar's summary: per frame id its issue count and, under a worn Look, its theme
 * flags. Only the bar reads it, so a frame reporting re-renders the bar and never the frames (each re-render of a frame re-arms its
 * settle and probe). A report that changes nothing is dropped, as the "flagged only" store drops one.
 */
interface Found {
  issues: number;
  flags: number;
}

const found = new Map<string, Found>();
const watchers = new Set<() => void>();
let version = 0;
const bump = () => {
  version++;
  watchers.forEach((fn) => fn());
};
const watch = (fn: () => void) => (watchers.add(fn), () => void watchers.delete(fn));

/** A frame has settled and been read. */
export function tallyFrame(id: string, issues: number, flags: number): void {
  const was = found.get(id);
  if (was?.issues === issues && was.flags === flags) return;
  found.set(id, { issues, flags });
  bump();
}

/** A frame left the page (a filter, other sizes): its counts leave the summary. */
export function forgetFrame(id: string): void {
  if (found.delete(id)) bump();
}

export interface Tally {
  /** Frames read so far. */
  checked: number;
  issues: number;
  flags: number;
  /** Frames with at least one issue, and with at least one flag. */
  withIssues: number;
  withFlags: number;
}

/** The totals now. */
export function tally(): Tally {
  const t: Tally = { checked: 0, issues: 0, flags: 0, withIssues: 0, withFlags: 0 };
  for (const f of found.values()) {
    t.checked++;
    t.issues += f.issues;
    t.flags += f.flags;
    if (f.issues) t.withIssues++;
    if (f.flags) t.withFlags++;
  }
  return t;
}

/** The totals, re-read whenever a frame reports. */
export function useTally(): Tally {
  useSyncExternalStore(watch, () => version);
  return tally();
}

/** What one widget's checked frames found: frames read, and the issues and theme flags in them. */
export interface WidgetFound {
  checked: number;
  issues: number;
  flags: number;
}

/** The totals per widget id (a frame id is `<widget>--<key>`), for the widget list's status dots and its filters. */
export function widgetTally(): Map<string, WidgetFound> {
  const out = new Map<string, WidgetFound>();
  for (const [id, f] of found) {
    const w = id.slice(0, id.indexOf("--"));
    const t = out.get(w) ?? { checked: 0, issues: 0, flags: 0 };
    out.set(w, { checked: t.checked + 1, issues: t.issues + f.issues, flags: t.flags + f.flags });
  }
  return out;
}

/** The per-widget totals, re-read whenever a frame reports: only the widget list reads them, never a frame. */
export function useWidgetTally(): Map<string, WidgetFound> {
  useSyncExternalStore(watch, () => version);
  return widgetTally();
}

/**
 * Whether a filter on issues or theme flags hides this widget: it was read (a frame not read yet is not known, so not clean) and
 * every read frame came back without one, as the "flagged only" filter decides.
 */
export const filteredOut = (w: WidgetFound | undefined, by: "issues" | "flags"): boolean => !!w && w.checked > 0 && w[by] === 0;

/**
 * Whether the Issues filter hides one widget, re-read as frames report. The snapshot is the answer itself, so its caller re-renders
 * only when it flips; off, it never subscribes.
 */
export function useHiddenByIssues(id: string, on: boolean): boolean {
  return useSyncExternalStore(on ? watch : noWatch, () => on && filteredOut(widgetTally().get(id), "issues"));
}
const noWatch = () => () => {};
