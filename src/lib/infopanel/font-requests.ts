/**
 * The Fonts view's model (A6, spec §3): the font requests of a canvas zone's stored form with
 * what each draws with, switching one to InfoPanel's fallback and back, supplying faces to the
 * requests that were missing them, and the font files inside a zip. Pure: the studio keeps the
 * stored form in its config, so one `setConfig` over these is one undo step.
 */
import { openCanvas } from "./canvas.ts";
import type { FontLoader, FontRequest, ResolvedFont } from "./font-loader.ts";
import type { Verdict } from "./font-licence.ts";
import { searchName } from "./font-sources.ts";
import { matchSupplied, requestKey, type SuppliedFace, type Use } from "./font-supply.ts";
import type { StoredCanvas, StoredFont } from "./import/stored.ts";
import { walkPaths } from "./native/modes.ts";
import { listEntries, readEntry } from "./zip.ts";

const TEXT_KINDS = new Set(["Text", "Clock", "Calendar", "Sensor", "TableSensor"]);

/** The Library's licence words (spec §3). */
export const LICENCE_LABEL: Record<Verdict, string> = { share: "May share", check: "Check license", keep: "Do not share" };

/** One font request of a zone: how its stored entry is set and the text items that ask for it. */
export interface RequestEntry {
  key: string;
  request: FontRequest;
  use: Use;
  supplied?: StoredFont["supplied"];
  /** Tree paths of the text items using it. */
  paths: string[];
}

/** The requests of a canvas zone's text items, in first-use order, with their stored choice. */
export function zoneRequests(canvas: StoredCanvas): RequestEntry[] {
  const open = openCanvas(canvas);
  const stored = new Map(open.stored.fonts.map((f) => [requestKey(f.request), f]));
  const out = new Map<string, RequestEntry>();
  walkPaths(open.items, (item, path) => {
    if (!TEXT_KINDS.has(item.kind) || !("Font" in item)) return;
    const request = { font: item.Font, style: item.FontStyle, bold: item.Bold, italic: item.Italic };
    const key = requestKey(request);
    const known = out.get(key);
    if (known) return void known.paths.push(path);
    const f = stored.get(key);
    out.set(key, { key, request, use: f?.use ?? "infopanel", ...(f?.supplied ? { supplied: f.supplied } : {}), paths: [path] });
  });
  return [...out.values()];
}

/** InfoPanel draws another family than the requested one (the font is not installed where it runs). */
export function isMissing(loader: FontLoader | null, request: FontRequest, r: ResolvedFont | undefined): boolean {
  const wanted = searchName(request.font).toLowerCase();
  const sameFamily = !!wanted && !!r?.typeface.family.toLowerCase().startsWith(wanted);
  if (r?.fallback !== undefined) return r.fallback && !sameFamily;
  // Neither the Data API nor the reference list answered: nothing to call missing.
  if (!loader) return false;
  return !loader.fonts.families.some((f) => f.name.toLowerCase() === request.font.toLowerCase()) && !sameFamily;
}

export interface RequestStatus {
  status: "ok" | "missing" | "switched" | "unknown";
  drawn: string;
  how: string;
}

const WEIGHT_NAME: Record<number, string> = { 100: "Thin", 200: "ExtraLight", 300: "Light", 400: "", 500: "Medium", 600: "SemiBold", 700: "Bold", 800: "ExtraBold", 900: "Black" };

/** What a request draws with and how it got there (the table's status dot, "Drawn with" and "How"). */
export function describeRequest(entry: RequestEntry, r: ResolvedFont | undefined, missing: boolean, ready: boolean): RequestStatus {
  if (entry.use === "supplied" && entry.supplied) {
    return { status: "ok", drawn: `${entry.supplied.family} ${entry.supplied.face}`.trim(), how: "Supplied with the profile" };
  }
  if (!r) return { status: "unknown", drawn: "—", how: ready ? "InfoPanel gave no answer" : "Asking InfoPanel…" };
  const t = r.typeface;
  if (missing) {
    return entry.supplied
      ? { status: "switched", drawn: `${t.family} (InfoPanel fallback)`, how: "Switched to fallback" }
      : { status: "missing", drawn: "Missing", how: "Not installed" };
  }
  const drawn = [t.family, WEIGHT_NAME[t.weight] ?? String(t.weight), t.slant === "Upright" ? "" : t.slant].filter(Boolean).join(" ");
  return { status: "ok", drawn, how: r.source === "data-api" ? "Asked from InfoPanel (Data API)" : "System font" };
}

/** The stored form with one request set to draw with InfoPanel's fallback or its supplied face; the same object when nothing changes. */
export function withUse(stored: StoredCanvas, key: string, use: Use): StoredCanvas {
  let hit = false;
  const fonts = stored.fonts.map((f) => {
    if (requestKey(f.request) !== key || f.use === use || (use === "supplied" && !f.supplied)) return f;
    hit = true;
    return { ...f, use };
  });
  return hit ? { ...stored, fonts } : stored;
}

/** A font file just added to the store: its hash and the faces read from it. */
export interface SuppliedFile {
  hash: string;
  faces: SuppliedFace[];
  license?: string;
}

/**
 * The stored form with the faces supplied to the requests that were missing them (`missing`:
 * request keys): each takes the face InfoPanel would pick if the files were installed.
 */
export function supplyFonts(stored: StoredCanvas, missing: ReadonlySet<string>, files: readonly SuppliedFile[]): StoredCanvas {
  const faces = files.flatMap((f) => f.faces);
  const fileOf = new Map(files.flatMap((f) => f.faces.map((face) => [face, f] as const)));
  let hit = false;
  const fonts = stored.fonts.map((f) => {
    if (!missing.has(requestKey(f.request))) return f;
    const face = matchSupplied(f.request, faces);
    const file = face && fileOf.get(face);
    if (!face || !file) return f;
    hit = true;
    const supplied = { hash: file.hash, file: face.file, index: face.index, family: face.family, face: face.face, ...(file.license ? { license: file.license } : {}) };
    return { ...f, use: "supplied" as const, supplied };
  });
  return hit ? { ...stored, fonts } : stored;
}

export const FONT_FILE = /\.(ttf|otf|ttc|woff2?)$/i;
const MAX_FONT = 30 * 1024 * 1024;

/** The font files in a zip (a font pack), by their plain names; the rest is skipped. */
export async function fontsInZip(zip: Uint8Array): Promise<{ name: string; data: Uint8Array }[]> {
  const out: { name: string; data: Uint8Array }[] = [];
  for (const e of listEntries(zip)) {
    const name = e.name.split("/").pop() ?? e.name;
    if (!FONT_FILE.test(name) || name.startsWith("._") || e.name.startsWith("__MACOSX/")) continue;
    out.push({ name, data: await readEntry(zip, e, MAX_FONT) });
  }
  return out;
}
