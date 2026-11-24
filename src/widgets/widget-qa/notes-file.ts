/**
 * The shape of `notes.json` and the edits made to it, pure: the page (`notes.ts`, the inspector) and the dev server's writer
 * (`notes-dev.ts`) share it, so both accept and write the same file. No imports: the Vite config loads this file too.
 */

/** Open: still to do (a note with no status is open). Fixed: done, waiting for the owner to remove it (or Clear fixed). */
export type NoteStatus = "open" | "fixed";
export const NOTE_STATUSES: readonly NoteStatus[] = ["open", "fixed"];

/** A note: its text, or its text and a status. An open note is written as its text alone, so today's file needs no migration. */
export type Note = string | { text: string; status?: NoteStatus };
/** One widget's notes, by frame: a span (`2x1`), a view (`view:gauge`) or `*` for the widget as a whole. */
export type WidgetNotes = Record<string, Note>;
export type NotesFile = Record<string, WidgetNotes>;

/** Where the notes live, from the repo's root. The dev server writes this file and no other. */
export const NOTES_PATH = "src/widgets/widget-qa/notes.json";
/** The dev server's notes endpoint (`notes-dev.ts`); only `npm run dev` answers it. */
export const NOTES_ENDPOINT = "/__qa/notes";
/** The header a write must carry: a cross-site page cannot send it without a preflight, which the endpoint never answers. */
export const NOTES_HEADER = "X-QA-Notes";
/** Longest note text the writer accepts. */
export const NOTE_MAX = 2000;

/** A frame a note can name: a span, a view or the widget. Layouts and surfaces take no notes. */
export const NOTE_KEY = /^(\*|\d+x\d+|view:[\w-]+)$/;
const WIDGET_ID = /^[A-Za-z][\w-]*$/;

export const noteText = (n: Note): string => (typeof n === "string" ? n : n.text);
export const noteStatus = (n: Note): NoteStatus => (typeof n === "string" ? "open" : (n.status ?? "open"));

/** A note as the file writes it: an open note is its text alone, a fixed one `{ text, status }`. */
export const noteOf = (text: string, status: NoteStatus): Note => (status === "fixed" ? { text, status } : text);

/** An edit to the file: one note set (`note`) or removed (`note: null`), or every fixed note cleared. */
export type NoteEdit = { module: string; key: string; note: Note | null } | { clear: "fixed" };

/** What is wrong with one note; none: `undefined`. */
function noteProblem(n: unknown): string | undefined {
  const value = typeof n === "string" ? n : n && typeof n === "object" && !Array.isArray(n) ? (n as { text?: unknown }).text : undefined;
  if (typeof value !== "string" || !value.trim()) return "no text";
  if (value.length > NOTE_MAX) return `longer than ${NOTE_MAX} characters`;
  if (typeof n === "object") {
    const extra = Object.keys(n as object).filter((k) => k !== "text" && k !== "status");
    if (extra.length) return `unknown field ${extra.join(", ")}`;
    const status = (n as { status?: unknown }).status;
    if (status !== undefined && !NOTE_STATUSES.includes(status as NoteStatus)) return `status ${JSON.stringify(status)} is not open or fixed`;
  }
  return undefined;
}

/** What is wrong with a notes file's shape: widget ids, frame keys and notes; none: []. Whether an id is a real widget is notes.test.ts's. */
export function notesProblems(file: unknown): string[] {
  if (!file || typeof file !== "object" || Array.isArray(file)) return ["not an object of widgets"];
  return Object.entries(file as Record<string, unknown>).flatMap(([id, byKey]) => {
    if (!WIDGET_ID.test(id)) return [`${id}: not a widget id`];
    if (!byKey || typeof byKey !== "object" || Array.isArray(byKey)) return [`${id}: not an object of frames`];
    return Object.entries(byKey as Record<string, unknown>).flatMap(([key, n]) => {
      if (!NOTE_KEY.test(key)) return [`${id} ${key}: not a span, a view or *`];
      const problem = noteProblem(n);
      return problem ? [`${id} ${key}: ${problem}`] : [];
    });
  });
}

/** What is wrong with an edit before it is applied; none: `undefined`. */
export function editProblem(edit: unknown): string | undefined {
  if (!edit || typeof edit !== "object") return "not an edit";
  const e = edit as Record<string, unknown>;
  if ("clear" in e) return e.clear === "fixed" ? undefined : "clear takes only fixed";
  if (typeof e.module !== "string" || !WIDGET_ID.test(e.module)) return "no widget id";
  if (typeof e.key !== "string" || !NOTE_KEY.test(e.key)) return `${String(e.key)}: not a span, a view or *`;
  return e.note === null ? undefined : noteProblem(e.note);
}

/** The file after an edit; a widget left with no notes leaves the file. Keys keep their order; a new one goes last. */
export function applyNoteEdit(file: NotesFile, edit: NoteEdit): NotesFile {
  if ("clear" in edit)
    return Object.fromEntries(
      Object.entries(file)
        .map(([id, byKey]) => [id, Object.fromEntries(Object.entries(byKey).filter(([, n]) => noteStatus(n) !== "fixed"))] as const)
        .filter(([, byKey]) => Object.keys(byKey).length > 0)
    );
  const { module, key, note } = edit;
  const byKey = { ...file[module] };
  if (note === null) delete byKey[key];
  else byKey[key] = noteOf(noteText(note).trim(), noteStatus(note));
  if (!Object.keys(byKey).length) return Object.fromEntries(Object.entries(file).filter(([id]) => id !== module));
  return module in file ? Object.fromEntries(Object.entries(file).map(([id, v]) => [id, id === module ? byKey : v])) : { ...file, [module]: byKey };
}

/** The file as written: two-space JSON and a final line end, as it is checked in. */
export const notesJson = (file: NotesFile, eol = "\n"): string => `${JSON.stringify(file, null, 2)}\n`.replace(/\n/g, eol);
