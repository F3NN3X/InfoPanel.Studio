/**
 * Baking static elements (card, glow, divider, icon) for an `.infopanel` export: each becomes one
 * PNG in the canvas's assets, content-addressed by SHA-256 like any other, and its Image item
 * reads it. The item records what it was baked from, so a changed spec, size or palette shows
 * as stale; a file no item reads any more is left out by the export's unused-files cleanup.
 * Rings and LED bars are vector gauges and bake through the gauge frames (gauges/frames.ts).
 */
import { add, type AssetFile, type Doc } from "../assets/assets.ts";
import { itemAt, updateAt, type Path } from "../editor/ops.ts";
import type { DisplayItem } from "../schema.ts";
import type { ElementFields } from "./apply.ts";
import type { StaticSpec } from "./spec.ts";
import { staticOf } from "./svg.ts";

export { staticOf } from "./svg.ts";

/** What baking a static element at a size is recorded as. */
export const elementSignature = (spec: StaticSpec, width: number, height: number) => JSON.stringify([width, height, spec]);

/** The element has no image yet, or its spec or size changed since it was baked. */
export function isElementStale(item: DisplayItem | undefined): boolean {
  const s = staticOf(item);
  if (!s || item?.kind !== "Image") return false;
  return !item.FilePath || (item as DisplayItem & ElementFields).elementBaked !== elementSignature(s.spec, s.width, s.height);
}

/** Paths of the static elements that need baking, in tree order. */
export function staleElements(items: readonly DisplayItem[], prefix = ""): Path[] {
  return items.flatMap((item, i) => {
    const path = prefix ? `${prefix}.${i}` : String(i);
    return [...(isElementStale(item) ? [path] : []), ...(item.kind === "Group" ? staleElements(item.DisplayItems, path) : [])];
  });
}

/** The element's image set to `file` (stored as an asset; the same bytes reuse the stored file), recorded as baked. */
export function setElementFile(doc: Doc, path: Path, file: AssetFile, baked: string): Doc {
  if (!staticOf(itemAt(doc.items, path))) return doc;
  const added = add(doc, [file]);
  const items = updateAt(added.doc.items, path, (item) => ({ ...item, Type: "FILE", FilePath: added.names[0], RelativePath: true, elementBaked: baked }) as unknown as DisplayItem);
  return { ...added.doc, items };
}
