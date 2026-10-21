/**
 * The Gauges view's editor, kept while the page is closed (spec §10: no blocking dialog on a mode
 * switch). The page unmounts with the rail, so the open editor and its working copy live here, like the
 * inspector's hand-opened sections, and returning to Gauges restores them with their undo history.
 */
import type { EditorOpen } from "./open";

export interface EditorSlot {
  id: number;
  open: EditorOpen;
}

let slot: EditorSlot | null = null;
let copy: { id: number; value: unknown } | null = null;
let last = 0;

/** The editor left open, if any. */
export const sessionEditor = (): EditorSlot | null => slot;

/** A new editor replaces the one before it, and its working copy. */
export function openSession(open: EditorOpen): EditorSlot {
  slot = { id: ++last, open };
  copy = null;
  return slot;
}

/** Back to the browse page: nothing is kept. */
export function closeSession(): void {
  slot = null;
  copy = null;
}

/** The working copy of editor `id`, as it was last kept. */
export const sessionCopy = <T,>(id: number): T | undefined => (copy?.id === id ? (copy.value as T) : undefined);

/** Keeps the working copy of editor `id` (ignored once that editor is closed). */
export function keepCopy(id: number, value: unknown): void {
  if (slot?.id === id) copy = { id, value };
}
