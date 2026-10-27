/**
 * The canvas as InfoPanel would draw the page after export (decision Q10's `Studio | InfoPanel` view, Edit v3): every
 * item through the InfoPanel renderer (no native drawing), the studio-only letter spacing dropped, and the parts the
 * export leaves out hidden. A view only: the items stored are never changed. Pure.
 */
import { setField, type Path } from "./editor/ops.ts";
import { isNative, walkPaths } from "./native/modes.ts";
import type { DisplayItem } from "./schema.ts";

/** `items` as the export draws them; `out` holds the paths the Export check says are left out. Same array when nothing changes. */
export function asExported(items: readonly DisplayItem[], out: ReadonlySet<Path>): readonly DisplayItem[] {
  let next = items as DisplayItem[];
  walkPaths(items, (item, path) => {
    if (out.has(path) && !item.Hidden) next = setField(next, path, "Hidden", true);
    if (isNative(item)) next = setField(next, path, "native", false);
    if ((item as { letterSpacing?: number }).letterSpacing) next = setField(next, path, "letterSpacing", 0);
  });
  return next;
}
