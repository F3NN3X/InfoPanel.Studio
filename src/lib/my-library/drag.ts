/**
 * Dragging a library card (spec §8): the drag data carries `{ libraryItemId, kind }` under its
 * own type, so the studio canvas, the canvas editor and the background slot can tell a library
 * drag from a file or an Add panel widget. The kind is readable while the drag is over a target
 * (types only), the id at the drop.
 */
import type { LibraryItem, LibraryKind } from "@/lib/library";

export const LIBRARY_MIME = "application/x-infopanel-library";
/** The kind as a type of its own: `dragover` can read types but not data. */
const KIND_MIME = (kind: LibraryKind) => `application/x-infopanel-library-${kind}`;

export interface LibraryDrag {
  libraryItemId: string;
  kind: LibraryKind;
}

export function setLibraryDrag(dt: DataTransfer, drag: LibraryDrag): void {
  dt.setData(LIBRARY_MIME, JSON.stringify(drag));
  dt.setData(KIND_MIME(drag.kind), "");
  dt.effectAllowed = "copy";
}

/** The dragged item, read at the drop (null when it is not a library drag). */
export function libraryDragOf(getData: (type: string) => string): LibraryDrag | null {
  try {
    const raw = JSON.parse(getData(LIBRARY_MIME) || "null") as Partial<LibraryDrag> | null;
    return raw && typeof raw.libraryItemId === "string" && typeof raw.kind === "string" ? (raw as LibraryDrag) : null;
  } catch {
    return null;
  }
}

/** Whether a drag over a target is a library card, and its kind when the types say. */
export function libraryDragKind(types: readonly string[]): LibraryKind | null | undefined {
  if (!types.includes(LIBRARY_MIME)) return undefined;
  const t = types.find((x) => x.startsWith(`${LIBRARY_MIME}-`));
  return t ? (t.slice(LIBRARY_MIME.length + 1) as LibraryKind) : null;
}

/**
 * The card being dragged right now. A drag that leaves the Library page for the canvas (the page
 * makes way for it) can't read its data until the drop; the canvas sizes its ghost from this.
 */
let active: LibraryItem | null = null;
export const setActiveLibraryDrag = (item: LibraryItem | null) => {
  active = item;
};
export const activeLibraryDrag = (): LibraryItem | null => active;
