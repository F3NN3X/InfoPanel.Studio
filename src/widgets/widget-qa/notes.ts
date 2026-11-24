import { useSyncExternalStore } from "react";
import notes from "./notes.json";
import { applyNoteEdit, NOTES_ENDPOINT, NOTES_HEADER, noteStatus, notesJson, type NoteEdit, type NotesFile, type WidgetNotes } from "./notes-file";

export { noteStatus, noteText, type Note, type NoteEdit, type NoteStatus, type WidgetNotes } from "./notes-file";

/**
 * Redesign notes, by widget id, then by frame: a span (`2x1`), a view (`view:gauge`) or `*` for the widget as a whole; each is its
 * text, or `{ text, status }` once it is fixed (`notes-file.ts`). They live in `notes.json` (tracked), so a note asked for against a
 * copied frame reference ("CodingAgents 2x1") is a one-line edit, and the page shows each note beside its frame.
 * tests/widgets/widget-qa/notes.test.ts keeps every key real. `NOTES` is the file as the page was built with it; the page reads the
 * live copy (`notesFor`, `useNotes`), which a note saved from the inspector replaces under `npm run dev`.
 */
export const NOTES: Readonly<NotesFile> = notes as NotesFile;

declare global {
  interface Window {
    /** The notes to read in place of the built ones: `report.mjs` passes the repo's file as it is now, which may be newer than the build. */
    __qaNotes?: NotesFile;
  }
}

let live: Readonly<NotesFile> = (typeof window !== "undefined" && window.__qaNotes) || NOTES;
const watchers = new Set<() => void>();
const watch = (fn: () => void) => (watchers.add(fn), () => void watchers.delete(fn));

export const allNotes = (): Readonly<NotesFile> => live;
export const notesFor = (id: string): WidgetNotes | undefined => live[id];

/** Every note, re-read when one is saved. */
export const useNotes = (): Readonly<NotesFile> => useSyncExternalStore(watch, allNotes);
/** One widget's notes; only a save that changes them re-renders. */
export const useWidgetNotes = (id: string): WidgetNotes | undefined => useSyncExternalStore(watch, () => live[id]);

/** How many of a widget's notes are open and how many fixed. */
export function noteCounts(byKey: WidgetNotes | undefined): { open: number; fixed: number } {
  const all = Object.values(byKey ?? {});
  const fixed = all.filter((n) => noteStatus(n) === "fixed").length;
  return { open: all.length - fixed, fixed };
}

/** Whether this page can write `notes.json`: only under `npm run dev`, whose server has the writer (`notes-dev.ts`). A build copies the JSON. */
export const CAN_WRITE: boolean = import.meta.env.DEV;

/** Writes an edit through the dev server and takes the file it wrote back as the live notes. */
export async function writeNote(edit: NoteEdit): Promise<void> {
  const res = await fetch(NOTES_ENDPOINT, { method: "POST", headers: { "Content-Type": "application/json", [NOTES_HEADER]: "1" }, body: JSON.stringify(edit) });
  if (!res.ok) throw new Error((await res.text()) || `the dev server answered ${res.status}`);
  live = (await res.json()) as NotesFile;
  for (const fn of watchers) fn();
}

/** What a build copies in place of a write: the edited widget's notes as a fragment of `notes.json`, or the whole file after Clear fixed. */
export function editJson(edit: NoteEdit): string {
  const next = applyNoteEdit(live, edit);
  if ("clear" in edit) return notesJson(next);
  return JSON.stringify({ [edit.module]: next[edit.module] ?? {} }, null, 2);
}
