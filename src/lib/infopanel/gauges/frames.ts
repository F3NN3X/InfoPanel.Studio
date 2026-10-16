/**
 * Gauge edits (L7) on the item tree and the asset table together, so each is
 * one undo step: an InfoPanel gauge is an ordered list of image frames, the
 * shown one picked from the value over Min..Max.
 *
 * A vector gauge keeps its spec in the lab field `vector` (not an InfoPanel
 * field) next to its frames; baking writes the frames InfoPanel draws and
 * records what they were baked from, so a changed spec shows as stale.
 */
import { add, assetKey, type AssetFile, type Doc } from "../assets/assets.ts";
import { itemAt, updateAt, type Path } from "../editor/ops.ts";
import { defaultItem, type DisplayItem, type GaugeItem, type ImageItem } from "../schema.ts";
import { normalizeGauge, type VectorGauge } from "./vector.ts";

/** The lab's fields on a gauge item. */
interface LabGauge {
  vector?: unknown;
  /** The spec and frame count the current frames were baked from. */
  vectorBaked?: string;
}

export const isGauge = (item: DisplayItem | undefined): item is GaugeItem => item?.kind === "Gauge";

export function vectorOf(item: DisplayItem | undefined): VectorGauge | null {
  const raw = isGauge(item) ? (item as GaugeItem & LabGauge).vector : undefined;
  return raw === undefined ? null : normalizeGauge(raw);
}

/** What baking `g` into `count` frames is recorded as. */
export const bakeSignature = (g: VectorGauge, count: number) => JSON.stringify([count, g]);

/** The spec changed since the frames were baked (or never baked). */
export function isStale(item: DisplayItem | undefined): boolean {
  const g = vectorOf(item);
  if (!g || !isGauge(item)) return false;
  const baked = (item as GaugeItem & LabGauge).vectorBaked;
  return baked !== bakeSignature(g, item.Images.length);
}

/** Frame file names (lower case, as the asset table keys them); null for a frame that is no asset. */
export const frameNames = (g: GaugeItem): (string | null)[] =>
  g.Images.map((f) => (f.Type === "FILE" && f.RelativePath && f.FilePath ? assetKey(f.FilePath) : null));

/** A frame item for an asset, like InfoPanel's gauge editor adds them. */
function frame(name: string, like?: ImageItem): ImageItem {
  return { ...(like ?? defaultItem("Image")), Name: name, Type: "FILE", FilePath: name, RelativePath: true };
}

const withGauge = (items: readonly DisplayItem[], path: Path, fn: (g: GaugeItem & LabGauge) => GaugeItem): DisplayItem[] =>
  updateAt(items, path, (item) => (isGauge(item) ? fn(item as GaugeItem & LabGauge) : item));

/** Reorders, drops or repeats frames by index: `order` lists the old indexes in their new places. */
export function reorderFrames(items: readonly DisplayItem[], path: Path, order: readonly number[]): DisplayItem[] {
  return withGauge(items, path, (g) => ({ ...g, Images: order.flatMap((i) => (g.Images[i] ? [g.Images[i]] : [])) }));
}

export const reverseOrder = (n: number) => Array.from({ length: n }, (_, i) => n - 1 - i);
export const moveOrder = (n: number, i: number, step: -1 | 1) => {
  const order = Array.from({ length: n }, (_, k) => k);
  const j = i + step;
  if (j < 0 || j >= n) return order;
  [order[i], order[j]] = [order[j], order[i]];
  return order;
};
export const removeOrder = (n: number, i: number) => Array.from({ length: n }, (_, k) => k).filter((k) => k !== i);
export const duplicateOrder = (n: number, i: number) => Array.from({ length: n }, (_, k) => k).flatMap((k) => (k === i ? [k, k] : [k]));

/**
 * `count` frames picked evenly from `n`, first and last kept: fewer frames step
 * coarser, more repeat frames (InfoPanel picks by percent, so the ends stay put).
 */
export function resampleOrder(n: number, count: number): number[] {
  if (n === 0 || count < 1) return [];
  if (count === 1) return [0];
  return Array.from({ length: count }, (_, i) => Math.round((i * (n - 1)) / (count - 1)));
}

/**
 * Sets a gauge's frames to files (stored as assets; identical bytes reuse the
 * stored file), keeping each slot's frame fields where there was one.
 */
export function setFrameFiles(doc: Doc, path: Path, files: readonly AssetFile[], baked?: string): Doc {
  const g = itemAt(doc.items, path);
  if (!isGauge(g)) return doc;
  const added = add(doc, files);
  const items = withGauge(added.doc.items, path, (gauge) => {
    const next: GaugeItem & LabGauge = { ...gauge, Images: added.names.map((name, i) => frame(name, gauge.Images[i] ?? gauge.Images[0])) };
    if (baked === undefined) delete next.vectorBaked;
    else next.vectorBaked = baked;
    return next;
  });
  return { ...added.doc, items };
}

/** Replaces one frame with a file. */
export function setFrameFile(doc: Doc, path: Path, index: number, file: AssetFile): Doc {
  const g = itemAt(doc.items, path);
  if (!isGauge(g) || !g.Images[index]) return doc;
  const added = add(doc, [file]);
  return {
    ...added.doc,
    items: withGauge(added.doc.items, path, (gauge) => ({ ...gauge, Images: gauge.Images.map((f, i) => (i === index ? frame(added.names[0], f) : f)) })),
  };
}

/** Sets (or with null, drops) the vector spec. Frames stay as they are until baked. */
export function setVector(items: readonly DisplayItem[], path: Path, g: VectorGauge | null): DisplayItem[] {
  return withGauge(items, path, (gauge) => {
    const next: GaugeItem & LabGauge = { ...gauge };
    if (g) next.vector = g;
    else {
      delete next.vector;
      delete next.vectorBaked;
    }
    return next;
  });
}

/** A new gauge item at the end of the top level, drawn by `g`, with no frames yet. */
export function insertVectorGauge(items: readonly DisplayItem[], g: VectorGauge, name: string): { items: DisplayItem[]; path: Path } {
  const gauge: GaugeItem & LabGauge = { ...defaultItem("Gauge"), Name: name, X: 0, Y: 0, vector: g };
  return { items: [...items, gauge], path: String(items.length) };
}

/** A new frames gauge at the end of the top level. */
export function insertFramesGauge(doc: Doc, files: readonly AssetFile[], name: string, fields: Partial<GaugeItem> = {}): { doc: Doc; path: Path } {
  const gauge: GaugeItem = { ...defaultItem("Gauge"), Name: name, X: 0, Y: 0, ...fields, Images: [] };
  const path = String(doc.items.length);
  return { doc: setFrameFiles({ ...doc, items: [...doc.items, gauge] }, path, files), path };
}

/** Every gauge in tree order. */
export function gaugePaths(items: readonly DisplayItem[], prefix = ""): Path[] {
  return items.flatMap((item, i) => {
    const path = prefix ? `${prefix}.${i}` : String(i);
    return [...(isGauge(item) ? [path] : []), ...(item.kind === "Group" ? gaugePaths(item.DisplayItems, path) : [])];
  });
}

/** A file name stem from a gauge name: letters, digits, `-` and `_`. */
export const safeStem = (name: string) => name.replace(/[^A-Za-z0-9_-]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 40) || "gauge";
