/**
 * Fonts end to end (L4): a library of font files the lab can supply (pack
 * faces, uploads, downloads) and, per font request, the face to draw with.
 *
 * InfoPanel's own answer comes first (Data API). When InfoPanel falls back
 * because the font is missing, the library is matched the way InfoPanel would
 * match it if those files were installed: the ported createTypeface over the
 * library alone, accepting only a match on the requested family.
 */
import type { FontRequest, ResolvedFont } from "./font-loader.ts";
import { createTypeface, type FontSet, type SkiaFamily, type Slant } from "./fonts.ts";
import { readFaces, type FontFace as SfntFace } from "./sfnt.ts";
import { listEntries, readEntry } from "./zip.ts";

export type FaceOrigin = "pack" | "upload" | "download";

/** A font face the lab can supply. */
export interface SuppliedFace extends SfntFace {
  origin: FaceOrigin;
  /** File it came from (pack path, upload or download name). */
  file: string;
  /** Where the browser loads it: a lab URL or an object URL. */
  url: string;
  /** License text or name, when the source gave one. */
  license?: string;
  /** File size in bytes, when known. */
  size?: number;
}

export const requestKey = (r: FontRequest) => JSON.stringify([r.font, r.style, r.bold, r.italic]);

const slantOf = (f: SfntFace): Slant => (f.italic ? "Italic" : "Upright");

/** The library as Skia would list it: one family per name, legacy names too (DirectWrite answers to both). */
export function fontSetOf(faces: readonly SuppliedFace[]): FontSet {
  const families = new Map<string, SkiaFamily>();
  const add = (name: string, f: SuppliedFace) => {
    if (!name) return;
    const key = name.toLowerCase();
    const family = families.get(key) ?? { name, styles: [] };
    if (!family.styles.some((s) => s.name === f.face && s.weight === f.weight && s.width === f.width && s.slant === slantOf(f))) {
      family.styles.push({ name: f.face, weight: f.weight, width: f.width, slant: slantOf(f) });
    }
    families.set(key, family);
  };
  for (const f of faces) {
    add(f.family, f);
    if (f.legacyFamily.toLowerCase() !== f.family.toLowerCase()) add(f.legacyFamily, f);
  }
  // No default family: a request the library cannot answer must not match anything.
  return { families: [...families.values()], defaultFamily: "" };
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

/**
 * The library face for a request: the one InfoPanel would draw with if the
 * library were installed; failing that, a face whose names start with the
 * requested family (files instanced from a variable font often carry names like
 * "Nunito Sans 12pt ExtraLight 12pt", which DirectWrite would list as is, but
 * the browser loads the bytes and does not care). Null if none fits.
 */
export function matchSupplied(request: FontRequest, faces: readonly SuppliedFace[]): SuppliedFace | null {
  const strict = matchByName(request, faces);
  if (strict) return strict;
  const wanted = norm(request.font);
  const loose = faces.filter((f) => wanted && [f.family, f.legacyFamily, f.fullName].some((n) => norm(n).startsWith(wanted)));
  if (loose.length === 0) return null;
  const renamed = loose.map((f) => ({ ...f, family: request.font, legacyFamily: request.font }));
  const hit = matchByName(request, renamed);
  return hit ? loose[renamed.indexOf(hit)] : null;
}

function matchByName(request: FontRequest, faces: readonly SuppliedFace[]): SuppliedFace | null {
  if (faces.length === 0) return null;
  const set = fontSetOf(faces);
  const t = createTypeface(set, request.font, request.style, request.bold, request.italic);
  if (!["style", "family", "base-family"].includes(t.via) || !t.family) return null;
  const family = t.family.toLowerCase();
  const candidates = faces.filter((f) => [f.family, f.legacyFamily].some((n) => n.toLowerCase() === family) && slantOf(f) === t.slant && f.width === t.width);
  // Exact weight, else the closest (a simulated bold reports the requested weight).
  return candidates.sort((a, b) => Math.abs(a.weight - t.weight) - Math.abs(b.weight - t.weight))[0] ?? null;
}

const FONT_FILE = /\.(ttf|otf|ttc)$/i;
const MAX_FILE = 30 * 1024 * 1024;

/**
 * Faces from an uploaded file: a font (ttf, otf, ttc) or a zip of fonts (a
 * font pack). Every font is checked by the sfnt parser; anything else is
 * reported, not used.
 */
export async function facesFromFile(
  name: string,
  bytes: Uint8Array,
  toUrl: (data: Uint8Array) => string,
): Promise<{ faces: SuppliedFace[]; rejected: string[] }> {
  const faces: SuppliedFace[] = [];
  const rejected: string[] = [];
  const addFont = (file: string, data: Uint8Array) => {
    let found: SfntFace[] = [];
    try {
      found = readFaces(data);
    } catch {
      found = [];
    }
    if (found.length === 0) {
      rejected.push(file);
      return;
    }
    const url = toUrl(data);
    for (const f of found) faces.push({ ...f, origin: "upload", file, url, size: data.length });
  };

  if (/\.zip$/i.test(name)) {
    for (const e of listEntries(bytes)) {
      if (!FONT_FILE.test(e.name)) continue;
      addFont(`${name}/${e.name}`, await readEntry(bytes, e, MAX_FILE));
    }
    if (faces.length === 0 && rejected.length === 0) rejected.push(`${name} (no font files)`);
  } else if (FONT_FILE.test(name)) {
    addFont(name, bytes);
  } else {
    rejected.push(`${name} (not ttf, otf, ttc or zip)`);
  }
  return { faces, rejected };
}

export type Use = "infopanel" | "supplied";

export interface FontRow {
  key: string;
  request: FontRequest;
  /** Text items using the request. */
  count: number;
  /** InfoPanel's answer, once resolved. */
  resolved: ResolvedFont | undefined;
  /** InfoPanel draws another family: the font is missing where InfoPanel runs. */
  missing: boolean;
  supplied: SuppliedFace | null;
  /** What the canvas draws with. */
  use: Use;
}

/**
 * One row per request. The canvas draws the supplied face for a missing font
 * unless the row is set to show InfoPanel's fallback, and InfoPanel's face otherwise.
 */
export function planFonts(
  requests: ReadonlyMap<string, { request: FontRequest; count: number }>,
  resolved: ReadonlyMap<string, ResolvedFont>,
  library: readonly SuppliedFace[],
  choices: ReadonlyMap<string, Use>,
  isMissing: (request: FontRequest, r: ResolvedFont | undefined) => boolean,
): FontRow[] {
  return [...requests].map(([key, { request, count }]) => {
    const r = resolved.get(key);
    const missing = isMissing(request, r);
    const supplied = missing ? matchSupplied(request, library) : null;
    const use = supplied ? (choices.get(key) ?? "supplied") : "infopanel";
    return { key, request, count, resolved: r, missing, supplied, use };
  });
}

/** Missing requests grouped by family, for the report. */
export function missingFamilies(rows: readonly FontRow[]): { family: string; rows: FontRow[]; items: number }[] {
  const out = new Map<string, FontRow[]>();
  for (const row of rows) {
    if (!row.missing) continue;
    out.set(row.request.font, [...(out.get(row.request.font) ?? []), row]);
  }
  return [...out].map(([family, rs]) => ({ family, rows: rs, items: rs.reduce((n, r) => n + r.count, 0) }));
}

/** A font file of the library, as an asset: where it came from, its license, and what draws with it. */
export interface FontFile {
  file: string;
  origin: FaceOrigin;
  faces: SuppliedFace[];
  size?: number;
  /** The source's license (downloads), else the font's own (name table). */
  license?: string;
  licenseUrl?: string;
  embedding?: SfntFace["embedding"];
  /** Requests the canvas draws with one of its faces. */
  rows: FontRow[];
  items: number;
}

/** The library grouped by file, used files first. */
export function fontFiles(library: readonly SuppliedFace[], rows: readonly FontRow[]): FontFile[] {
  const out = new Map<string, FontFile>();
  for (const f of library) {
    const entry = out.get(f.file) ?? {
      file: f.file, origin: f.origin, faces: [], size: f.size,
      license: f.license ?? f.licenseText, licenseUrl: f.licenseUrl, embedding: f.embedding, rows: [], items: 0,
    };
    entry.faces.push(f);
    out.set(f.file, entry);
  }
  for (const row of rows) {
    const file = row.use === "supplied" ? row.supplied?.file : undefined;
    const entry = file ? out.get(file) : undefined;
    if (!entry) continue;
    entry.rows.push(row);
    entry.items += row.count;
  }
  return [...out.values()].sort((a, b) => b.items - a.items || a.file.localeCompare(b.file));
}
