/**
 * Draw modes per item (L5): an item flagged `native` is drawn by a dashboard widget when it converts,
 * else by the InfoPanel renderer. The flag is the only change; every InfoPanel field stays, so a
 * switch is lossless and one undo step.
 */
import { itemAt, setField, type Path } from "../editor/ops.ts";
import type { DefaultMode } from "../import/stored.ts";
import type { DisplayItem } from "../schema.ts";
import { convert, type ConvertContext } from "./convert.ts";

/** The mode flag on an item (not an InfoPanel field; stored under `$.mode`). */
export const isNative = (item: DisplayItem) => (item as { native?: boolean }).native === true;

/** Visits every item in tree order; `hidden`: the item or a group around it is hidden in InfoPanel. */
export function walkPaths(
  items: readonly DisplayItem[],
  visit: (item: DisplayItem, path: Path, hidden: boolean) => void,
  prefix = "",
  parentHidden = false,
): void {
  items.forEach((item, i) => {
    const path = prefix ? `${prefix}.${i}` : String(i);
    const hidden = parentHidden || item.Hidden;
    visit(item, path, hidden);
    if (item.kind === "Group") walkPaths(item.DisplayItems, visit, path, hidden);
  });
}

/** Paths of the items that can be drawn natively (for "switch all"). */
export function convertible(items: readonly DisplayItem[], ctx: ConvertContext): Path[] {
  const out: Path[] = [];
  walkPaths(items, (item, path) => {
    if (convert(item, path, ctx).ok) out.push(path);
  });
  return out;
}

/**
 * Every item in a mode: native where it converts (also "both", which starts native), else InfoPanel.
 * Groups keep no flag. The same array back when nothing changes.
 */
export function withMode(items: readonly DisplayItem[], ctx: ConvertContext, mode: DefaultMode): DisplayItem[] {
  const targets = mode === "infopanel" ? new Set<Path>() : new Set(convertible(items, ctx));
  let out = items as DisplayItem[];
  walkPaths(items, (item, path) => {
    if (item.kind === "Group") return;
    const want = targets.has(path);
    if (isNative(itemAt(out, path)!) !== want) out = setField(out, path, "native", want);
  });
  return out;
}

/** How many items each mode draws, groups left out (the Mode step's counts). */
export function modeCounts(items: readonly DisplayItem[], ctx: ConvertContext): { items: number; native: number } {
  let count = 0;
  walkPaths(items, (item) => {
    if (item.kind !== "Group") count++;
  });
  return { items: count, native: convertible(items, ctx).length };
}
