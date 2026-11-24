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

/** One widget's totals: the frames whose id starts with `<module>--` (`frameId`). */
export function sectionTally(module: string): Tally {
  const t: Tally = { checked: 0, issues: 0, flags: 0, withIssues: 0, withFlags: 0 };
  for (const [id, f] of found) {
    if (!id.startsWith(`${module}--`)) continue;
    t.checked++;
    t.issues += f.issues;
    t.flags += f.flags;
    if (f.issues) t.withIssues++;
    if (f.flags) t.withFlags++;
  }
  return t;
}

// Every widget's totals as text, read once per report however many headers ask (a pass per header made `mountAllSettled` slower).
let keysAt = -1;
let keys = new Map<string, string>();
function sectionKey(module: string): string {
  if (keysAt !== version) {
    const by = new Map<string, Tally>();
    for (const [id, f] of found) {
      const w = id.slice(0, id.indexOf("--"));
      const t = by.get(w) ?? { checked: 0, issues: 0, flags: 0, withIssues: 0, withFlags: 0 };
      by.set(w, { checked: t.checked + 1, issues: t.issues + f.issues, flags: t.flags + f.flags, withIssues: t.withIssues + (f.issues ? 1 : 0), withFlags: t.withFlags + (f.flags ? 1 : 0) });
    }
    keys = new Map([...by].map(([w, t]) => [w, `${t.checked} ${t.issues} ${t.flags} ${t.withIssues} ${t.withFlags}`]));
    keysAt = version;
  }
  return keys.get(module) ?? "0 0 0 0 0";
}

/** One widget's totals for its section header: a frame of another widget reporting re-renders nothing (the snapshot is text). */
export function useSectionTally(module: string): Tally {
  const key = useSyncExternalStore(watch, () => sectionKey(module));
  const [checked, issues, flags, withIssues, withFlags] = key.split(" ").map(Number);
  return { checked, issues, flags, withIssues, withFlags };
}
