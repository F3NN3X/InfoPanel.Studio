/**
 * A canvas zone's files as an asset `Doc` (A6, spec §3 Profile assets): the stored form opened
 * into items and a file table, the edits of assets.ts / bulk.ts applied to it, and the result
 * written back as a stored form. Pure apart from the injected readers and uploader, so the
 * Library tab commits every action as one `withCanvas` and the studio records one undo step.
 */
import { assetUrl, type OpenCanvas } from "../canvas.ts";
import { editItems, storeItems } from "../canvas-edit.ts";
import type { Profile } from "../schema.ts";
import type { StoredAsset, StoredCanvas } from "../import/stored.ts";
import {
  analyse, assetFile, assetKey, LARGE_BYTES, mergeDuplicates, remove, tableOf,
  type AssetFile, type AssetRef, type AssetTable, type Doc, type Oversized,
} from "./assets.ts";
import { resizeTarget, type BulkPlan, type NameMatch } from "./bulk.ts";

/** The zone's items (each bound one carrying its Data API key) and its files. A file whose bytes cannot be read stays listed, empty. */
export async function docFromStored(open: OpenCanvas, read: (a: StoredAsset) => Promise<Uint8Array | null>): Promise<Doc> {
  const files = await Promise.all(
    open.stored.assets.map(async (a): Promise<AssetFile> => {
      const url = open.assets.get(assetKey(a.name))?.url ?? undefined;
      const bytes = await read(a);
      if (!bytes) return { name: a.name, bytes: new Uint8Array(), hash: a.hash, type: a.type, origin: "export", ...(url ? { url } : {}) };
      return { ...(await assetFile(a.name, bytes, "export")), ...(url ? { url } : {}) };
    }),
  );
  return { items: editItems(open), assets: tableOf(files) };
}

/**
 * The stored form of an edited doc: new bytes go through `upload` (it resolves with the asset
 * store's `<sha256>.<ext>` id), files already stored keep their entry under their current name.
 */
export async function storedFromDoc(stored: StoredCanvas, profile: Profile, doc: Doc, upload: (file: AssetFile) => Promise<string>): Promise<StoredCanvas> {
  const byName = new Map(stored.assets.map((a) => [assetKey(a.name), a]));
  const byHash = new Map(stored.assets.map((a) => [a.hash, a]));
  const assets = await Promise.all(
    [...doc.assets.values()].map(async (f): Promise<StoredAsset> => {
      const old = byName.get(assetKey(f.name));
      const known = old?.hash === f.hash ? old : byHash.get(f.hash);
      if (known) return { ...known, name: f.name };
      const ext = (await upload(f)).split(".").slice(1).join(".");
      const usual = assetUrl(f.hash, f.type);
      return { name: f.name, hash: f.hash, type: f.type, size: f.bytes.length, ...(ext && !usual?.endsWith(`.${ext}`) ? { ext } : {}) };
    }),
  );
  return { ...storeItems(stored, profile, doc.items), assets };
}

/* ---- findings ---- */

export type Finding = "unused" | "identical" | "larger" | "large" | "missing";

export interface Findings {
  /** Per file (lower-case name, missing ones included), in the order the table shows them. */
  byName: ReadonlyMap<string, Finding[]>;
  counts: Record<Finding, number>;
  /** Files drawn at least 1.5× larger than needed, with the size they are drawn at. */
  larger: Oversized[];
  missing: { name: string; refs: AssetRef[] }[];
}

const ORDER: Finding[] = ["unused", "identical", "larger", "large", "missing"];

export function findingsOf(doc: Doc): Findings {
  const found = analyse(doc);
  const names = new Map<Finding, Set<string>>(ORDER.map((f) => [f, new Set<string>()]));
  for (const n of found.unused) names.get("unused")!.add(assetKey(n));
  // The first name of a group is the one kept; the others are the identical ones.
  for (const [, ...dupes] of found.duplicates) for (const n of dupes) names.get("identical")!.add(assetKey(n));
  const larger = found.oversized.filter((o) => o.target);
  for (const o of larger) names.get("larger")!.add(assetKey(o.name));
  for (const f of doc.assets.values()) if (f.bytes.length > LARGE_BYTES) names.get("large")!.add(assetKey(f.name));
  for (const m of found.missing) names.get("missing")!.add(m.name);
  // Listed but unreadable: the asset store lost its bytes.
  for (const f of doc.assets.values()) if (f.bytes.length === 0) names.get("missing")!.add(assetKey(f.name));
  const byName = new Map<string, Finding[]>();
  for (const f of ORDER) for (const n of names.get(f)!) byName.set(n, [...(byName.get(n) ?? []), f]);
  return {
    byName,
    counts: Object.fromEntries(ORDER.map((f) => [f, names.get(f)!.size])) as Record<Finding, number>,
    larger,
    missing: found.missing,
  };
}

/** Clean up without the re-encoding: unused files removed, then identical files merged into one. */
export function cleanBasics(doc: Doc): Doc {
  const kept = remove(doc, analyse(doc).unused);
  return mergeDuplicates(kept, analyse(kept).duplicates);
}

/** How many files Clean up touches, `shrinkable` being the ones it can downscale. */
export function cleanupCount(found: Findings, shrinkable: readonly string[]): number {
  const names = new Set<string>(shrinkable.map(assetKey));
  for (const f of ["unused", "identical"] as const) for (const [n, list] of found.byName) if (list.includes(f)) names.add(n);
  return names.size;
}

/* ---- sizes and notes ---- */

/** The largest size every use draws the file at; undefined when a use takes the file's own size or it is unused. */
export function drawnSize(refs: readonly AssetRef[]): { width: number; height: number } | undefined {
  if (refs.length === 0 || !refs.every((r) => r.drawn)) return undefined;
  return { width: Math.ceil(Math.max(...refs.map((r) => r.drawn!.width))), height: Math.ceil(Math.max(...refs.map((r) => r.drawn!.height))) };
}

export type SizeCap = "none" | "drawn" | "half";

/** The pixel size an optimise run encodes a file at: never larger than the file. */
export function optimiseTarget(file: Pick<AssetFile, "width" | "height">, refs: readonly AssetRef[], cap: SizeCap): { width: number; height: number } {
  const w = file.width ?? 1;
  const h = file.height ?? 1;
  if (cap === "half") return resizeTarget(w, h, { kind: "percent", percent: 50 });
  const drawn = cap === "drawn" ? drawnSize(refs) : undefined;
  return drawn ? { width: Math.min(w, Math.max(1, drawn.width)), height: Math.min(h, Math.max(1, drawn.height)) } : { width: w, height: h };
}

function gifFrames(b: Uint8Array): number {
  let frames = 0;
  for (let i = 13; i + 9 < b.length; i++) if (b[i] === 0x21 && b[i + 1] === 0xf9 && b[i + 2] === 0x04 && b[i + 8] === 0x2c) frames++;
  return frames;
}

/** What the type column adds after the type: "alpha" for a PNG with transparency, the frame count of an animation. */
export function typeNote(f: AssetFile): string {
  if (f.animated) {
    const frames = f.type === "gif" ? gifFrames(f.bytes) : 0;
    return frames > 1 ? `${frames} frames` : "animated";
  }
  if (f.type === "png" && f.bytes.length > 25 && (f.bytes[25] === 4 || f.bytes[25] === 6)) return "alpha";
  if (f.type === "webp" && f.bytes.length > 20 && (f.bytes[20] & 0x10) !== 0) return "alpha";
  return "";
}

/* ---- replace by name ---- */

const stem = (name: string) => assetKey(name).replace(/\.[^.]*$/, "");

/** The files an ambiguous new file could replace: the ones with its name without the extension. */
export const candidatesFor = (table: AssetTable, file: Pick<AssetFile, "name">): string[] =>
  [...table.values()].filter((f) => stem(f.name) === stem(file.name)).map((f) => f.name);

/**
 * The plan's matches plus the user's picks for its ambiguous files (`picks`: new file name → target).
 * A target is replaced at most once: the first claim wins.
 */
export function withPicks(plan: BulkPlan, files: readonly AssetFile[], picks: ReadonlyMap<string, string>): NameMatch[] {
  const taken = new Set(plan.matches.map((m) => assetKey(m.target)));
  const chosen: NameMatch[] = [];
  for (const name of plan.ambiguous) {
    const target = picks.get(name);
    const file = files.find((f) => f.name === name);
    if (!target || !file || taken.has(assetKey(target))) continue;
    taken.add(assetKey(target));
    chosen.push({ target, file, byStem: true });
  }
  return [...plan.matches, ...chosen];
}
