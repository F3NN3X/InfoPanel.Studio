/**
 * Profile asset management (L6): the export's files as an immutable table,
 * which items use each, and the edits on both (add, replace everywhere,
 * remove, cleanup). Every edit returns a new table and item tree together, so
 * the editor commits it as one undo step.
 *
 * InfoPanel finds an asset by the image item's FilePath (RelativePath set),
 * a file name in the profile's assets folder, matched case-insensitively.
 */
import { itemAt, updateAt, type Path } from "../editor/ops.ts";
import type { DisplayItem, GaugeItem, ImageItem } from "../schema.ts";

export type AssetType = "png" | "jpeg" | "gif" | "webp" | "bmp" | "ico" | "svg" | "video" | "other";

export interface AssetFile {
  /** File name as stored (the table key is its lower case). */
  name: string;
  bytes: Uint8Array;
  /** SHA-256, hex. */
  hash: string;
  type: AssetType;
  /** Pixel size read from the header, for raster images. */
  width?: number;
  height?: number;
  /** Several frames (animated GIF or WebP): never re-encoded. */
  animated?: boolean;
  origin: "export" | "added";
  /** Where the lab server serves the export's own file; edited and added files have none. */
  url?: string;
}

export type AssetTable = ReadonlyMap<string, AssetFile>;

export const assetKey = (name: string) => name.toLowerCase();

const ascii = (b: Uint8Array, at: number, n: number) => String.fromCharCode(...b.subarray(at, at + n));

/** Type and pixel size from the file's own bytes; the extension is not trusted. */
export function sniff(b: Uint8Array): Pick<AssetFile, "type" | "width" | "height" | "animated"> {
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const has = (n: number) => b.length >= n;
  if (has(24) && b[0] === 0x89 && ascii(b, 1, 3) === "PNG") {
    // acTL before IDAT makes it an animated PNG.
    const animated = findChunk(b, "acTL");
    return { type: "png", width: dv.getUint32(16), height: dv.getUint32(20), ...(animated ? { animated } : {}) };
  }
  if (has(10) && ascii(b, 0, 3) === "GIF") {
    const frames = countGifFrames(b);
    return { type: "gif", width: dv.getUint16(6, true), height: dv.getUint16(8, true), ...(frames > 1 ? { animated: true } : {}) };
  }
  if (has(30) && ascii(b, 0, 4) === "RIFF" && ascii(b, 8, 4) === "WEBP") return { type: "webp", ...webpSize(b, dv) };
  if (has(26) && ascii(b, 0, 2) === "BM") return { type: "bmp", width: dv.getInt32(18, true), height: Math.abs(dv.getInt32(22, true)) };
  if (has(3) && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return { type: "jpeg", ...jpegSize(b, dv) };
  if (has(6) && dv.getUint16(0, true) === 0 && dv.getUint16(2, true) === 1) {
    return { type: "ico", width: b[6] || 256, height: b[7] || 256 };
  }
  if (has(12) && ascii(b, 4, 4) === "ftyp") return { type: "video" };
  if (has(4) && dv.getUint32(0) === 0x1a45dfa3) return { type: "video" }; // Matroska / WebM
  const head = new TextDecoder().decode(b.subarray(0, 512)).trimStart();
  if (/^(<\?xml[^>]*>\s*)?(<!--[\s\S]*?-->\s*)*<svg[\s>]/i.test(head)) return { type: "svg" };
  return { type: "other" };
}

function findChunk(b: Uint8Array, name: string): boolean {
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  for (let at = 8; at + 8 <= b.length; ) {
    const len = dv.getUint32(at);
    const type = ascii(b, at + 4, 4);
    if (type === name) return true;
    if (type === "IDAT") return false;
    at += 12 + len;
  }
  return false;
}

function countGifFrames(b: Uint8Array): number {
  let frames = 0;
  // Image descriptors start with 0x2C after a graphic control extension (21 F9 04).
  for (let i = 13; i + 9 < b.length; i++) if (b[i] === 0x21 && b[i + 1] === 0xf9 && b[i + 2] === 0x04 && b[i + 8] === 0x2c && ++frames > 1) break;
  return frames;
}

function webpSize(b: Uint8Array, dv: DataView): Pick<AssetFile, "width" | "height" | "animated"> {
  const chunk = ascii(b, 12, 4);
  if (chunk === "VP8 ") return { width: dv.getUint16(26, true) & 0x3fff, height: dv.getUint16(28, true) & 0x3fff };
  if (chunk === "VP8L") {
    const bits = dv.getUint32(21, true);
    return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
  }
  if (chunk === "VP8X") {
    const u24 = (at: number) => b[at] | (b[at + 1] << 8) | (b[at + 2] << 16);
    return { width: u24(24) + 1, height: u24(27) + 1, ...((b[20] & 0x02) !== 0 ? { animated: true } : {}) };
  }
  return {};
}

function jpegSize(b: Uint8Array, dv: DataView): Pick<AssetFile, "width" | "height"> {
  for (let at = 2; at + 9 < b.length; ) {
    if (b[at] !== 0xff) return {};
    const marker = b[at + 1];
    // SOF0..SOF15 except DHT (C4), JPG (C8) and DAC (CC) carry the frame size.
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      return { height: dv.getUint16(at + 5), width: dv.getUint16(at + 7) };
    }
    at += 2 + dv.getUint16(at + 2);
  }
  return {};
}

const hex = (buf: ArrayBuffer) => [...new Uint8Array(buf)].map((x) => x.toString(16).padStart(2, "0")).join("");

export async function assetFile(name: string, bytes: Uint8Array, origin: AssetFile["origin"]): Promise<AssetFile> {
  const hash = hex(await crypto.subtle.digest("SHA-256", bytes.slice()));
  return { name, bytes, hash, origin, ...sniff(bytes) };
}

export const tableOf = (files: readonly AssetFile[]): AssetTable => new Map(files.map((f) => [assetKey(f.name), f]));

/**
 * The export's `assets/` entries as a table; a file that cannot be read is left out.
 * `served`: the URL the lab server gives an entry, when it serves the export.
 */
export async function tableFromExport(
  entries: ReadonlyMap<string, { name: string; read(): Promise<Uint8Array> }>,
  served?: (entry: string) => string,
): Promise<AssetTable> {
  const read = await Promise.allSettled(
    [...entries.values()].map(async (e) => ({
      ...(await assetFile(e.name.replace(/^assets\//i, ""), await e.read(), "export")),
      ...(served ? { url: served(e.name) } : {}),
    })),
  );
  return tableOf(read.flatMap((r) => (r.status === "fulfilled" ? [r.value] : [])));
}

export const MIME: Record<AssetType, string> = {
  png: "image/png", jpeg: "image/jpeg", gif: "image/gif", webp: "image/webp", bmp: "image/bmp",
  ico: "image/x-icon", svg: "image/svg+xml", video: "video/mp4", other: "application/octet-stream",
};

/** A use of an asset: an image item, or one frame of a gauge. */
export interface AssetRef {
  path: Path;
  /** Gauge frame index. */
  frame?: number;
  /** Lower-case asset name. */
  name: string;
  /** The largest size InfoPanel draws it at, when the item fixes one. */
  drawn?: { width: number; height: number };
}

/** Where items load images from that are not assets of the export. */
export interface OtherSource {
  path: Path;
  frame?: number;
  kind: "url" | "absolute";
  value: string;
}

const isImage = (item: DisplayItem): item is ImageItem | Extract<DisplayItem, { kind: "SensorImage" }> =>
  item.kind === "Image" || item.kind === "SensorImage";

const fileName = (item: { Type: string; FilePath: string | null; RelativePath: boolean }) =>
  item.Type === "FILE" && item.FilePath && item.RelativePath ? item.FilePath : null;

/** Drawn size: 0 takes the image's own size, which only the file knows. */
const drawnOf = (w: number, h: number, scale: number) => (w > 0 && h > 0 ? { width: (w * scale) / 100, height: (h * scale) / 100 } : undefined);

/** Every asset reference and every outside image source, in tree order. */
export function scanRefs(items: readonly DisplayItem[], prefix = ""): { refs: AssetRef[]; others: OtherSource[] } {
  const refs: AssetRef[] = [];
  const others: OtherSource[] = [];
  const visit = (image: ImageItem | Extract<DisplayItem, { kind: "SensorImage" }>, path: Path, frame?: number, size?: AssetRef["drawn"]) => {
    const at = frame === undefined ? {} : { frame };
    const name = fileName(image);
    if (name) refs.push({ path, ...at, name: assetKey(name), ...(size ? { drawn: size } : {}) });
    else if (image.Type === "URL" && image.HttpUrl) others.push({ path, ...at, kind: "url", value: image.HttpUrl });
    else if (image.Type === "FILE" && image.FilePath) others.push({ path, ...at, kind: "absolute", value: image.FilePath });
  };
  items.forEach((item, i) => {
    const path = prefix ? `${prefix}.${i}` : String(i);
    if (isImage(item)) visit(item, path, undefined, drawnOf(item.Width, item.Height, item.Scale));
    else if (item.kind === "Gauge") {
      const g = item as GaugeItem;
      g.Images.forEach((f, k) => visit(f, path, k, drawnOf(g.Width, g.Height, g.Scale)));
    } else if (item.kind === "Group") {
      const inner = scanRefs(item.DisplayItems, path);
      refs.push(...inner.refs);
      others.push(...inner.others);
    }
  });
  return { refs, others };
}

/** Asset name → its uses. */
export function usesOf(items: readonly DisplayItem[]): Map<string, AssetRef[]> {
  const out = new Map<string, AssetRef[]>();
  for (const r of scanRefs(items).refs) out.set(r.name, [...(out.get(r.name) ?? []), r]);
  return out;
}

/** Points every reference to `from` (lower-case) at `to`, or clears it when `to` is null. */
export function repoint(items: readonly DisplayItem[], from: string, to: string | null): DisplayItem[] {
  const fix = <T extends ImageItem | Extract<DisplayItem, { kind: "SensorImage" }>>(image: T): T => {
    const name = fileName(image);
    if (!name || assetKey(name) !== from) return image;
    return { ...image, FilePath: to };
  };
  let next = [...items];
  for (const r of scanRefs(items).refs) {
    if (r.name !== from) continue;
    next = updateAt(next, r.path, (item) => {
      if (r.frame === undefined) return isImage(item) ? fix(item) : item;
      const g = item as GaugeItem;
      return { ...g, Images: g.Images.map((f, k) => (k === r.frame ? fix(f) : f)) } as DisplayItem;
    });
  }
  return next;
}

/** A name not yet in the table: "logo.png" → "logo (2).png". */
export function freeName(table: AssetTable, name: string): string {
  const clean = name.replace(/^.*[\\/]/, "") || "asset";
  if (!table.has(assetKey(clean))) return clean;
  const dot = clean.lastIndexOf(".");
  const [stem, ext] = dot > 0 ? [clean.slice(0, dot), clean.slice(dot)] : [clean, ""];
  for (let n = 2; ; n++) {
    const candidate = `${stem} (${n})${ext}`;
    if (!table.has(assetKey(candidate))) return candidate;
  }
}

const EXT: Partial<Record<AssetType, string>> = { png: ".png", jpeg: ".jpg", gif: ".gif", webp: ".webp", bmp: ".bmp", ico: ".ico", svg: ".svg" };

export interface Doc {
  items: DisplayItem[];
  assets: AssetTable;
}

const without = (table: AssetTable, keys: Iterable<string>) => {
  const next = new Map(table);
  for (const k of keys) next.delete(k);
  return next;
};

/**
 * Adds files. A file whose bytes are already in the table is not stored twice;
 * its existing name is returned instead.
 */
export function add(doc: Doc, files: readonly AssetFile[]): { doc: Doc; names: string[] } {
  const table = new Map(doc.assets);
  const names = files.map((f) => {
    const same = [...table.values()].find((t) => t.hash === f.hash);
    if (same) return same.name;
    const name = freeName(table, f.name);
    table.set(assetKey(name), { ...f, name });
    return name;
  });
  return { doc: { ...doc, assets: table }, names };
}

/**
 * Replaces an asset everywhere: the new bytes take the old name, so every use
 * follows. When the type changes (a PNG replaced by a JPEG) the name takes the
 * new extension and the uses are pointed at it.
 */
export function replace(doc: Doc, name: string, file: AssetFile): Doc {
  const old = doc.assets.get(assetKey(name));
  if (!old) return doc;
  const ext = EXT[file.type];
  const oldExt = old.name.slice(old.name.lastIndexOf("."));
  const keepsName = !ext || oldExt.toLowerCase() === ext || (ext === ".jpg" && /^\.jpe?g$/i.test(oldExt));
  const rest = without(doc.assets, [assetKey(name)]);
  const newName = keepsName ? old.name : freeName(rest, old.name.replace(/\.[^.]*$/, "") + ext);
  const assets = new Map(rest).set(assetKey(newName), { ...file, name: newName, origin: old.origin });
  const items = keepsName ? doc.items : repoint(doc.items, assetKey(name), newName);
  return { items, assets };
}

/** Points the image items among `paths` at an asset; other items are left alone. */
export function assign(items: readonly DisplayItem[], paths: readonly Path[], name: string): DisplayItem[] {
  return paths.reduce<DisplayItem[]>(
    (tree, p) => updateAt(tree, p, (item) => (isImage(item) ? { ...item, Type: "FILE", FilePath: name, RelativePath: true } : item)),
    [...items],
  );
}

/** Removes assets; uses of a removed asset keep their FilePath and draw InfoPanel's placeholder. */
export const remove = (doc: Doc, names: readonly string[]): Doc => ({ ...doc, assets: without(doc.assets, names.map(assetKey)) });

/** Removes assets and clears the uses' FilePath, so nothing points at a missing file. */
export function removeWithUses(doc: Doc, names: readonly string[]): Doc {
  const items = names.reduce((tree, n) => repoint(tree, assetKey(n), null), doc.items);
  return remove({ ...doc, items }, names);
}

/** Merges each group of identical files into its first name. */
export function mergeDuplicates(doc: Doc, groups: readonly string[][]): Doc {
  let { items } = doc;
  const drop: string[] = [];
  for (const [keep, ...dupes] of groups) {
    const keepName = doc.assets.get(assetKey(keep))?.name ?? keep;
    for (const d of dupes) {
      items = repoint(items, assetKey(d), keepName);
      drop.push(d);
    }
  }
  return remove({ ...doc, items }, drop);
}

/** Files above this size are listed as large whatever they draw at. */
export const LARGE_BYTES = 1_000_000;

export interface Oversized {
  name: string;
  /** The largest size any use draws it at, when every use fixes one. */
  target?: { width: number; height: number };
  reason: string;
}

export interface Cleanup {
  unused: string[];
  /** Groups of identical files, the name to keep first. */
  duplicates: string[][];
  oversized: Oversized[];
  /** Uses whose asset is not in the export: InfoPanel draws the placeholder. */
  missing: { name: string; refs: AssetRef[] }[];
}

/** What a cleanup could do, without doing it. */
export function analyse(doc: Doc): Cleanup {
  const uses = usesOf(doc.items);
  const files = [...doc.assets.values()].sort((a, b) => (uses.get(assetKey(b.name))?.length ?? 0) - (uses.get(assetKey(a.name))?.length ?? 0) || a.name.localeCompare(b.name));
  const unused = files.filter((f) => !uses.has(assetKey(f.name))).map((f) => f.name);

  const byHash = new Map<string, string[]>();
  for (const f of files) byHash.set(f.hash, [...(byHash.get(f.hash) ?? []), f.name]);
  // Keep the plainest name: "logo.png" over "logo - Copy.png".
  const plain = (a: string, b: string) => a.length - b.length || a.localeCompare(b);
  const duplicates = [...byHash.values()].filter((g) => g.length > 1).map((g) => [...g].sort(plain));

  const oversized: Oversized[] = [];
  for (const f of files) {
    const refs = uses.get(assetKey(f.name)) ?? [];
    const sized = refs.length > 0 && refs.every((r) => r.drawn) && f.width && f.height;
    if (sized) {
      const width = Math.ceil(Math.max(...refs.map((r) => r.drawn!.width)));
      const height = Math.ceil(Math.max(...refs.map((r) => r.drawn!.height)));
      // Half again the drawn size in both directions: more than twice the pixels it needs.
      if (f.width! >= width * 1.5 && f.height! >= height * 1.5) {
        oversized.push({ name: f.name, target: { width, height }, reason: `${f.width}×${f.height}, drawn at most ${width}×${height}` });
        continue;
      }
    }
    if (f.bytes.length > LARGE_BYTES) oversized.push({ name: f.name, reason: `${(f.bytes.length / 1e6).toFixed(1)} MB` });
  }

  const missing = [...uses].filter(([name]) => !doc.assets.has(name)).map(([name, refs]) => ({ name, refs }));
  return { unused, duplicates, oversized, missing };
}

/** The item a reference points into, for labels. */
export const refItem = (items: readonly DisplayItem[], r: AssetRef) => itemAt(items, r.path);
