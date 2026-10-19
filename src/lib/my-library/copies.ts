/**
 * Counting a placed copy on its library item (spec §8: every drop adds 1). The library is server
 * state, apart from the studio's undo history; a failed count is not worth an error.
 */
import { updateLibraryItem, type LibraryCopy, type LibraryItem } from "@/lib/library";

export function recordCopy(item: Pick<LibraryItem, "id" | "copies">, copy: LibraryCopy): Promise<void> {
  if (item.id.startsWith("cfg-")) return Promise.resolve();
  return updateLibraryItem(item.id, { copies: [...item.copies, { ...copy, at: new Date().toISOString() }] }).then(
    () => undefined,
    () => undefined,
  );
}
