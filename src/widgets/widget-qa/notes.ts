import notes from "./notes.json";

/**
 * Redesign notes, by widget id, then by frame: a span (`2x1`), a view (`view:gauge`) or `*` for the widget as a whole.
 * They live in `notes.json` (tracked), so a note asked for against a copied frame reference ("CodingAgents 2x1") is a
 * one-line edit, and the page shows each note beside its frame. tests/widgets/widget-qa/notes.test.ts keeps every key real.
 */
export type WidgetNotes = Record<string, string>;
export const NOTES: Readonly<Record<string, WidgetNotes>> = notes;

export const notesFor = (id: string): WidgetNotes | undefined => NOTES[id];
