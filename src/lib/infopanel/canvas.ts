/**
 * The canvas zone's model (A2): a placement's stored form (`Placement.canvas`, import/stored.ts)
 * opened for drawing. Opening checks it against the schema tables once per stored object; the
 * zone then reads each bound item's Data API key, its assets from the app's asset store, and
 * its graph history.
 */
import type { AssetType } from "./assets/assets.ts";
import type { FontRequest } from "./font-loader.ts";
import type { Issue } from "./parse.ts";
import { GRAPH_HISTORY, tableOf, ZEROS, type SensorState } from "./render/scene.ts";
import type { DisplayItem, Profile } from "./schema.ts";
import { isBound, toReading, type BoundItem, type DataApiValue } from "./sensors.ts";
import { readStored, type ItemImport, type StoredCanvas } from "./import/stored.ts";

/** The app's asset store URL prefix (src/lib/assets.ts ASSETS_URL; kept here so Node scripts can load this file). */
const ASSETS_URL = "/api/assets";

/** The asset store's extension per stored type; types it does not hold yet have none. */
const STORE_EXT: Partial<Record<AssetType, string>> = { png: "png", jpeg: "jpg", gif: "gif", webp: "webp", bmp: "bmp", ico: "ico", svg: "svg", video: "mp4" };

export interface CanvasAsset {
  hash: string;
  /** Where the zone loads it; null when the asset store cannot hold its type. */
  url: string | null;
}

export interface OpenCanvas {
  stored: StoredCanvas;
  profile: Profile;
  items: DisplayItem[];
  issues: Issue[];
  /** Each item's tree path ("0", "3.1"). */
  pathOf: ReadonlyMap<DisplayItem, string>;
  /** What the import decided per item path (Data API key, how it was found). */
  imports: ReadonlyMap<string, ItemImport>;
  /** Asset files by lower-case name. */
  assets: ReadonlyMap<string, CanvasAsset>;
  /** Every Data API key the canvas reads, sorted (the sensor store subscription). */
  keys: string[];
  /** Keys whose history a bar, graph or donut draws from. */
  historyKeys: ReadonlySet<string>;
  /** Every font the items ask for. */
  fonts: FontRequest[];
}

/** The asset store URL of a stored asset, or null when the store does not take its type. */
export function assetUrl(hash: string, type: AssetType, storeExt?: string): string | null {
  const ext = storeExt ?? STORE_EXT[type];
  return ext ? `${ASSETS_URL}/${hash}.${ext}` : null;
}

const HISTORY_KINDS = new Set(["Bar", "Graph", "Donut"]);

function index(items: DisplayItem[], imports: ReadonlyMap<string, ItemImport>) {
  const pathOf = new Map<DisplayItem, string>();
  const keys = new Set<string>();
  const historyKeys = new Set<string>();
  const fonts = new Map<string, FontRequest>();
  const walk = (list: DisplayItem[], prefix: string) =>
    list.forEach((item, i) => {
      const path = prefix ? `${prefix}.${i}` : String(i);
      pathOf.set(item, path);
      const key = imports.get(path)?.key;
      if (key && isBound(item)) {
        keys.add(key);
        if (HISTORY_KINDS.has(item.kind)) historyKeys.add(key);
      }
      if ("Font" in item) {
        const r = { font: item.Font, style: item.FontStyle, bold: item.Bold, italic: item.Italic };
        fonts.set(JSON.stringify(r), r);
      }
      if (item.kind === "Group") walk(item.DisplayItems, path);
    });
  walk(items, "");
  return { pathOf, keys: [...keys].sort(), historyKeys, fonts: [...fonts.values()] };
}

const opened = new WeakMap<object, OpenCanvas>();

/**
 * The stored form opened for drawing, cached per stored object (configs are updated immutably, so an
 * unchanged canvas is never decoded twice). Throws when `raw` is not a stored canvas at all.
 */
export function openCanvas(raw: unknown): OpenCanvas {
  const cached = raw && typeof raw === "object" ? opened.get(raw) : undefined;
  if (cached) return cached;
  const { stored, profile, items, keys: imports, issues } = readStored(raw);
  const assets = new Map<string, CanvasAsset>();
  for (const a of stored.assets) assets.set(a.name.toLowerCase(), { hash: a.hash, url: assetUrl(a.hash, a.type, a.ext) });
  const open: OpenCanvas = { stored, profile, items, issues, imports, assets, ...index(items, imports) };
  opened.set(raw as object, open);
  return open;
}

/** The Data API key an item reads, if the import found one. */
export const keyOf = (canvas: OpenCanvas, item: DisplayItem): string | null =>
  canvas.imports.get(canvas.pathOf.get(item) ?? "")?.key ?? null;

/**
 * What InfoPanel would read for an item, from the app's live values. Without a key it reads as
 * InfoPanel does unbound: no reading, and a HWiNFO or Libre graph full of zeros.
 */
export function canvasSensor(
  item: BoundItem,
  key: string | null,
  values: Readonly<Record<string, unknown>>,
  history: (key: string) => readonly number[],
): SensorState {
  if (!key) return { reading: null, history: item.SensorType === "Plugin" ? [] : ZEROS };
  const value = values[key] as DataApiValue | undefined;
  const table = item.kind === "TableSensor" && value ? tableOf(value) : null;
  return { reading: toReading(value), history: history(key), table };
}

/**
 * Numeric samples per key, oldest first, one per update, at most InfoPanel's 4096. Values that are
 * not numbers are skipped, as InfoPanel's graphs skip them.
 */
export class KeyHistory {
  private readonly samples = new Map<string, number[]>();
  private last: object | null = null;

  /** One sample per values object: recording the same object again (a re-render) adds nothing. */
  record(keys: Iterable<string>, values: Readonly<Record<string, unknown>>): void {
    if (values === this.last) return;
    this.last = values;
    for (const key of keys) {
      const v = (values[key] as DataApiValue | undefined)?.value;
      if (typeof v !== "number") continue;
      const list = this.samples.get(key) ?? [];
      list.push(v);
      if (list.length > GRAPH_HISTORY) list.splice(0, list.length - GRAPH_HISTORY);
      this.samples.set(key, list);
    }
  }

  get(key: string): readonly number[] {
    return this.samples.get(key) ?? [];
  }
}

/** The scale that fits the profile into a box, keeping its aspect ratio (never 0 or negative). */
export function fitScale(profile: Pick<Profile, "Width" | "Height">, w: number, h: number): number {
  if (profile.Width <= 0 || profile.Height <= 0 || w <= 0 || h <= 0) return 1;
  return Math.min(w / profile.Width, h / profile.Height);
}

/** A stored file's bytes from the asset store (fonts by their file's extension), or null when it is not there. */
export async function readStoreFile(hash: string, ext: string | undefined, type: AssetType, fetchImpl: typeof fetch = fetch): Promise<Uint8Array | null> {
  const url = type === "other" ? (ext ? `${ASSETS_URL}/${hash}.${ext}` : null) : assetUrl(hash, type, ext);
  if (!url) return null;
  const res = await fetchImpl(url);
  return res.ok ? new Uint8Array(await res.arrayBuffer()) : null;
}
