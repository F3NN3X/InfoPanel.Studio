import { useSyncExternalStore } from "react";
import type { Flag } from "../adoption";
import type { Probed } from "../probe";

/**
 * What each frame found when it last settled, with the elements its issues are about: the inspector's Issues and Theme flags lists.
 * Keyed by the frame's anchor (`<module>--<key>`), a surface by `surface:<name>`. Only the inspector reads it, so a frame reporting
 * never re-renders a frame (each re-render re-arms its settle and probe).
 */
export interface FrameRead {
  probed: Probed[];
  flags: Flag[];
}

const reads = new Map<string, FrameRead>();
const watchers = new Set<() => void>();
const watch = (fn: () => void) => (watchers.add(fn), () => void watchers.delete(fn));
const bump = () => watchers.forEach((fn) => fn());

/** A frame has settled and been read. */
export function readFrame(id: string, read: FrameRead): void {
  reads.set(id, read);
  bump();
}

/** A frame left the page: its read (and the elements it holds) goes with it. */
export function forgetRead(id: string): void {
  if (reads.delete(id)) bump();
}

/** One frame's read, re-read when that frame reports again; none: not read yet. */
export function useRead(id: string | undefined): FrameRead | undefined {
  return useSyncExternalStore(watch, () => (id ? reads.get(id) : undefined));
}
