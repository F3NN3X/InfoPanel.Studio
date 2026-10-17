/**
 * The studio's Export dialog (§9): a canvas zone's stored form written back as a `.canvas.zip`
 * (canvas.json plus its files by SHA-256) or as an `.infopanel` for InfoPanel, after optional
 * frame baking for vector gauges and leaving unused files out. Pure: the dialog reads the files.
 */
import { analyse, type AssetTable, type Doc } from "../assets/assets.ts";
import { itemAt } from "../editor/ops.ts";
import { reviewFont, type Verdict } from "../font-licence.ts";
import { gaugePaths, isStale } from "../gauges/frames.ts";
import type { DataApiInfo } from "../import/stored.ts";
import { toStored, type ItemImport, type StoredCanvas } from "../import/stored.ts";
import { bundle } from "../import/bundle.ts";
import type { DisplayItem, Profile } from "../schema.ts";
import { infopanelExport } from "./write.ts";

/** Paths of the vector gauges whose frames are out of date (bake them before an .infopanel export). */
export const staleGauges = (items: readonly DisplayItem[]): string[] => gaugePaths(items).filter((p) => isStale(itemAt(items, p)));

/** The unused files of a document, and their size. */
export function unusedFiles(doc: Doc): { names: string[]; bytes: number } {
  const names = analyse(doc).unused;
  const bytes = names.reduce((n, name) => n + (doc.assets.get(name.toLowerCase())?.bytes.length ?? 0), 0);
  return { names, bytes };
}

/**
 * The stored form again after an edit that keeps every item's place (frames baked): the same
 * source, mode and fonts, each item's key from `keys` by path, the store's extensions by hash.
 */
export function restoreStored(
  stored: StoredCanvas,
  profile: Profile,
  doc: Doc,
  keys: ReadonlyMap<string, ItemImport>,
  exts: ReadonlyMap<string, string> = new Map(),
): StoredCanvas {
  const pathOf = new Map<DisplayItem, string>();
  const walk = (list: readonly DisplayItem[], prefix: string) =>
    list.forEach((item, i) => {
      const path = prefix ? `${prefix}.${i}` : String(i);
      pathOf.set(item, path);
      if (item.kind === "Group") walk(item.DisplayItems, path);
    });
  walk(doc.items, "");
  const known = new Map(stored.assets.flatMap((a) => (a.ext ? [[a.hash, a.ext] as const] : [])));
  const next = toStored({
    name: stored.source.name,
    origin: stored.source.origin,
    dataApi: stored.dataApi as DataApiInfo | null,
    defaultMode: stored.defaultMode,
    profile,
    items: doc.items,
    assets: doc.assets,
    keyOf: (item) => {
      const k = keys.get(pathOf.get(item) ?? "");
      return k && (k.key !== undefined || k.via) ? { ...(k.key !== undefined ? { key: k.key } : {}), ...(k.via ? { via: k.via } : {}) } : null;
    },
    fonts: stored.fonts,
  });
  return {
    ...next,
    source: stored.source,
    assets: next.assets.map((a) => {
      const ext = exts.get(a.hash) ?? known.get(a.hash);
      return ext ? { ...a, ext } : a;
    }),
  };
}

/* ---- fonts ---- */

export type FontChoice = "include" | "leave";

export interface FontLicenceRow {
  hash: string;
  family: string;
  file: string;
  /** Requests drawn with it. */
  uses: number;
  license?: string;
  verdict: Verdict;
  reason: string;
}

/** One row per supplied font file the stored form carries. */
export function fontLicences(stored: StoredCanvas): FontLicenceRow[] {
  const out = new Map<string, FontLicenceRow>();
  for (const f of stored.fonts) {
    const s = f.use === "supplied" ? f.supplied : undefined;
    if (!s) continue;
    const row = out.get(s.hash);
    if (row) {
      row.uses++;
      continue;
    }
    const review = reviewFont({ license: s.license });
    out.set(s.hash, { hash: s.hash, family: s.family || s.file, file: s.file, uses: 1, license: s.license, verdict: review.verdict, reason: review.reason });
  }
  return [...out.values()];
}

/** The default choice: a font that may not be shared stays out until the user includes it. */
export const defaultFontChoice = (row: FontLicenceRow): FontChoice => (row.verdict === "keep" ? "leave" : "include");

/** The stored form with the left-out fonts drawn as InfoPanel's face instead. */
export function withFontChoices(stored: StoredCanvas, choices: ReadonlyMap<string, FontChoice>): StoredCanvas {
  const fonts = stored.fonts.map((f) => (f.supplied && choices.get(f.supplied.hash) === "leave" ? { request: f.request, use: "infopanel" as const } : f));
  return fonts.some((f, i) => f !== stored.fonts[i]) ? { ...stored, fonts } : stored;
}

/* ---- writing ---- */

/** `<name>.canvas.zip`: the stored form, its assets and the fonts it still draws with. */
export function canvasZip(stored: StoredCanvas, assets: AssetTable, fontFiles: ReadonlyMap<string, Uint8Array>): Uint8Array {
  const used = new Set(stored.fonts.flatMap((f) => (f.use === "supplied" && f.supplied ? [f.supplied.hash] : [])));
  return bundle(stored, assets, new Map([...fontFiles].filter(([hash]) => used.has(hash))));
}

/** `<name>.infopanel`: InfoPanel's two XML files and the assets, without `leaveOut`. */
export function infopanelFile(profile: Profile, doc: Doc, leaveOut: readonly string[] = []): { bytes: Uint8Array; files: number } {
  const skip = new Set(leaveOut.map((n) => n.toLowerCase()));
  const files = [...doc.assets.values()].filter((f) => !skip.has(f.name.toLowerCase()));
  return { bytes: infopanelExport(profile, doc.items, files.map((f) => ({ name: f.name, bytes: f.bytes }))), files: files.length };
}

/** A file name from a profile name ("ARC v2" → "ARC_v2"). */
export const fileStem = (s: string) => s.replace(/[^\w.-]+/g, "_").replace(/^_+|_+$/g, "") || "profile";
