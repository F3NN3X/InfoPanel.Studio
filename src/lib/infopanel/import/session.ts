/**
 * The studio's import (A4): a source opened into a parsed profile and its asset table, the asset
 * store upload of each file, and the stored form the canvas zone saves. Pure apart from the
 * reads it is handed; the dialog (src/components/infopanel/import) drives it.
 */
import { entriesFromZip, loadExport, type ExportEntry, type ParsedExport } from "../archive.ts";
import { assetFile, tableFromExport, tableOf, type AssetFile, type AssetTable } from "../assets/assets.ts";
import { assetUrl } from "../canvas.ts";
import type { FontRequest } from "../font-loader.ts";
import type { ConvertContext } from "../native/convert.ts";
import { withMode } from "../native/modes.ts";
import { walkItems } from "../parse.ts";
import { groupId, type Overrides } from "../remap/remap.ts";
import type { DisplayItem, Profile } from "../schema.ts";
import type { Match } from "../sensors.ts";
import { listEntries } from "../zip.ts";
import { openBundle } from "./bundle.ts";
import { assetsFrom, overridesFrom, readStored, remapKeys, toStored, type DataApiInfo, type DefaultMode, type ItemImport, type StoredCanvas, type StoredFont } from "./stored.ts";

export type SourceOrigin = StoredCanvas["source"]["origin"];

/** What a saved canvas brings back: its decisions and its files. */
export interface Restore {
  overrides: Map<string, string>;
  defaultMode: DefaultMode;
  fonts: StoredFont[];
  /** Supplied font files, by hash. */
  fontFiles: Map<string, Uint8Array>;
  /** Files the saved canvas names but lacks. */
  missing: string[];
  /** What the import decided per item path (key, how it was found). */
  keys: Map<string, ItemImport>;
  /** The saved canvas's screenshot (an asset store id). */
  screenshot?: string;
}

export interface OpenedSource {
  name: string;
  origin: SourceOrigin;
  parsed: ParsedExport;
  /** The export's asset files, read and hashed. */
  assets: AssetTable;
  restore?: Restore;
}

const stemOf = (name: string) => name.replace(/^.*[\\/]/, "").replace(/\.(infopanel|canvas\.zip|zip)$/i, "") || "Imported profile";

/** An InfoPanel export as entries plus its parsed XML and assets. */
export async function openEntries(name: string, entries: ExportEntry[], origin: SourceOrigin): Promise<OpenedSource> {
  const parsed = await loadExport(entries);
  return { name, origin, parsed, assets: await tableFromExport(parsed.assets) };
}

/** A `.infopanel` or a saved `.canvas.zip`, told apart by what the zip holds. */
export async function openZip(fileName: string, bytes: Uint8Array): Promise<OpenedSource> {
  let names: string[];
  try {
    names = listEntries(bytes).map((e) => e.name);
  } catch {
    throw new Error(`${fileName} is not a zip: choose an .infopanel export or a saved .canvas.zip`);
  }
  if (names.includes("canvas.json")) {
    const o = await openBundle(bytes);
    const s = o.read.stored;
    return {
      name: s.source.name || stemOf(fileName),
      origin: s.source.origin,
      parsed: o.parsed,
      assets: o.assets,
      restore: { overrides: o.overrides, defaultMode: s.defaultMode, fonts: s.fonts, fontFiles: o.fonts, missing: o.missing, keys: o.read.keys, screenshot: s.screenshot },
    };
  }
  return openEntries(stemOf(fileName), entriesFromZip(bytes), "file");
}

/** A file of a picked folder: its path inside the folder and its bytes. */
export interface FolderFile {
  /** `webkitRelativePath` ("ARCv2/assets/a.png"), else the plain name. */
  path: string;
  read(): Promise<Uint8Array>;
}

/**
 * An extracted export from a picked folder: entries relative to the folder that holds
 * Profile.xml (the picked folder itself, or one level down). Throws when there is none.
 */
export function folderEntries(files: readonly FolderFile[]): { name: string; entries: ExportEntry[] } {
  const norm = files.map((f) => ({ ...f, path: f.path.replaceAll("\\", "/") }));
  const profile = norm
    .filter((f) => /(^|\/)profile\.xml$/i.test(f.path))
    .sort((a, b) => a.path.split("/").length - b.path.split("/").length)[0];
  if (!profile) throw new Error("Not an InfoPanel export: the folder has no Profile.xml");
  const root = profile.path.slice(0, profile.path.length - "profile.xml".length);
  const entries = norm
    .filter((f) => f.path.toLowerCase().startsWith(root.toLowerCase()))
    .map((f) => ({ name: f.path.slice(root.length), read: f.read }));
  const folder = root.replace(/\/$/, "").split("/").pop() || "Imported profile";
  return { name: folder, entries };
}

/** A profile installed in InfoPanel (`GET /api/infopanel/installed`). */
export interface InstalledProfile {
  guid: string;
  name: string;
  bytes: number;
  assets: string[];
}

export const INSTALLED_URL = "/api/infopanel/installed";

/** An installed profile as export entries read from the dashboard server. */
export function installedEntries(p: InstalledProfile, fetchImpl: typeof fetch = fetch): ExportEntry[] {
  const at = (rel: string) => async () => {
    const res = await fetchImpl(`${INSTALLED_URL}/${encodeURIComponent(p.guid)}/${rel}`, { cache: "no-store" });
    if (!res.ok) throw new Error(`${rel}: the server answered ${res.status}`);
    return new Uint8Array(await res.arrayBuffer());
  };
  return [
    { name: "Profile.xml", read: at("Profile.xml") },
    { name: "DisplayItems.xml", read: at("DisplayItems.xml") },
    ...p.assets.map((a) => ({ name: `assets/${a}`, read: at(`assets/${encodeURIComponent(a)}`) })),
  ];
}

/* ---- upload ---- */

const startsWith = (b: Uint8Array, sig: readonly number[]) => sig.every((x, i) => b[i] === x);

/**
 * The MIME type the asset store takes a file as, or null when it holds no such files (the item
 * then draws without it). Videos: Matroska is stored as WebM, the rest must be MP4.
 */
export function uploadMime(f: Pick<AssetFile, "type" | "bytes">): string | null {
  switch (f.type) {
    case "png":
      return "image/png";
    case "jpeg":
      return "image/jpeg";
    case "gif":
      return "image/gif";
    case "webp":
      return "image/webp";
    case "bmp":
      return "image/bmp";
    case "ico":
      return "image/x-icon";
    case "svg":
      return "image/svg+xml";
    case "video":
      return startsWith(f.bytes, [0x1a, 0x45, 0xdf, 0xa3]) ? "video/webm" : "video/mp4";
    default:
      return null;
  }
}

/** The asset store's extension for an uploaded file, from its id ("<hash>.webm" → "webm"). */
export const storeExtOf = (id: string) => /\.([a-z0-9]+)$/.exec(id)?.[1];

/**
 * Asset store extensions that differ from the type's usual one (a WebM video), by hash; the
 * stored form records them so the zone loads the right URL.
 */
export function extOverrides(assets: AssetTable, uploaded: ReadonlyMap<string, string>): Map<string, string> {
  const out = new Map<string, string>();
  for (const f of assets.values()) {
    const id = uploaded.get(f.hash);
    const ext = id && storeExtOf(id);
    if (ext && assetUrl(f.hash, f.type) !== `/api/assets/${f.hash}.${ext}`) out.set(f.hash, ext);
  }
  return out;
}

/* ---- the canvas ---- */

/** The convert context of an import: keys from the remap, asset URLs from the store. */
export function importContext(
  profile: Profile,
  assets: AssetTable,
  resolved: ReadonlyMap<string, Match | null>,
  exts: ReadonlyMap<string, string> = new Map(),
): ConvertContext {
  return {
    fontScale: profile.FontScale,
    keyOf: (item) => resolved.get(groupId(item))?.key ?? null,
    assetUrl: (name) => {
      const f = assets.get(name.toLowerCase());
      return f ? assetUrl(f.hash, f.type, exts.get(f.hash)) : null;
    },
  };
}

const TEXT_KINDS = new Set(["Text", "Clock", "Calendar", "Sensor", "TableSensor"]);

/** Every font request of the items, with how many text items use it. */
export function fontRequests(items: readonly DisplayItem[]): Map<string, { request: FontRequest; count: number }> {
  const out = new Map<string, { request: FontRequest; count: number }>();
  for (const { item } of walkItems(items as DisplayItem[])) {
    if (!TEXT_KINDS.has(item.kind) || !("Font" in item)) continue;
    const request = { font: item.Font, style: item.FontStyle, bold: item.Bold, italic: item.Italic };
    const k = JSON.stringify([request.font, request.style, request.bold, request.italic]);
    out.set(k, { request, count: (out.get(k)?.count ?? 0) + 1 });
  }
  return out;
}

export interface BuildInput {
  source: OpenedSource;
  name: string;
  mode: DefaultMode;
  resolved: ReadonlyMap<string, Match | null>;
  overrides: Overrides;
  dataApi: DataApiInfo | null;
  /** Asset store ids by hash, from the upload. */
  uploaded: ReadonlyMap<string, string>;
  /** The asset store id of InfoPanel's screenshot to keep for Compare. */
  screenshot?: string;
  now?: Date;
}

/**
 * The stored form an import commits: every item in the chosen mode ("both" starts native),
 * its remapped keys, the asset table with the store's extensions, and the font requests (a
 * reopened canvas keeps its supplied fonts).
 */
export function buildCanvas(input: BuildInput): StoredCanvas {
  const { source } = input;
  const { profile } = source.parsed;
  const exts = extOverrides(source.assets, input.uploaded);
  const ctx = importContext(profile, source.assets, input.resolved, exts);
  const items = withMode(source.parsed.items, ctx, input.mode);
  const restored = new Map((source.restore?.fonts ?? []).map((f) => [JSON.stringify([f.request.font, f.request.style, f.request.bold, f.request.italic]), f]));
  const fonts = [...fontRequests(items)].map(([k, { request }]): StoredFont => restored.get(k) ?? { request, use: "infopanel" });
  const stored = toStored({
    name: input.name,
    origin: source.origin,
    dataApi: input.dataApi,
    defaultMode: input.mode,
    profile: { ...profile, Name: input.name },
    items,
    assets: source.assets,
    keyOf: remapKeys(input.resolved, input.overrides),
    fonts,
    screenshot: input.screenshot,
    now: input.now,
  });
  return { ...stored, assets: stored.assets.map((a) => (exts.has(a.hash) ? { ...a, ext: exts.get(a.hash) } : a)) };
}

/** The bytes still to upload: every file the store takes, once per hash. */
export function uploadPlan(assets: AssetTable): { file: AssetFile; mime: string }[] {
  const seen = new Set<string>();
  const out: { file: AssetFile; mime: string }[] = [];
  for (const f of assets.values()) {
    const mime = uploadMime(f);
    if (!mime || seen.has(f.hash)) continue;
    seen.add(f.hash);
    out.push({ file: f, mime });
  }
  return out;
}

/**
 * A stored form reopened from the library or a canvas zone: its files read back by hash (each
 * checked against it), its choices restored. `read` resolves null for a file it cannot get.
 */
export async function openStored(raw: unknown, read: (hash: string, ext: string | undefined, type: AssetFile["type"]) => Promise<Uint8Array | null>): Promise<OpenedSource> {
  const r = readStored(raw);
  const byHash = new Map<string, Uint8Array>();
  for (const a of r.stored.assets) {
    if (byHash.has(a.hash)) continue;
    const bytes = await read(a.hash, a.ext, a.type).catch(() => null);
    if (bytes && (await assetFile(a.name, bytes, "export")).hash === a.hash) byHash.set(a.hash, bytes);
  }
  const fontFiles = new Map<string, Uint8Array>();
  for (const f of r.stored.fonts) {
    const s = f.supplied;
    if (!s || fontFiles.has(s.hash)) continue;
    const bytes = await read(s.hash, /\.([a-z0-9]+)$/i.exec(s.file)?.[1].toLowerCase(), "other").catch(() => null);
    if (bytes && (await assetFile(s.file, bytes, "export")).hash === s.hash) fontFiles.set(s.hash, bytes);
  }
  const { names, missing } = assetsFrom(r.stored.assets, byHash);
  const files = await Promise.all(names.map((n) => assetFile(n.name, n.bytes, "export")));
  const parsed: ParsedExport = {
    profile: r.profile,
    items: r.items,
    assets: new Map(files.map((f) => [f.name.toLowerCase(), { name: `assets/${f.name}`, read: async () => f.bytes }])),
    issues: r.issues,
  };
  return {
    name: r.stored.source.name || r.profile.Name,
    origin: r.stored.source.origin,
    parsed,
    assets: tableOf(files),
    restore: { overrides: overridesFrom(r.items, r.keys), defaultMode: r.stored.defaultMode, fonts: r.stored.fonts, fontFiles, missing, keys: r.keys, screenshot: r.stored.screenshot },
  };
}
