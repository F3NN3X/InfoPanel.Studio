/**
 * Get a font (A6, spec §3): the faces a free source offers for a family, which of them the
 * profile's missing requests need, and their bytes on demand. Fontsource (its catalogue also lists
 * Google families) serves one file per weight and style; Font Squirrel a zip, through the
 * server's `/api/font-proxy` because it sends no CORS headers.
 */
import type { FontRequest } from "./font-loader.ts";
import { bytes, get, PROXIED, type Fetch, type FontCandidate } from "./font-sources.ts";
import { matchSupplied, type SuppliedFace } from "./font-supply.ts";
import { readFaces } from "./sfnt.ts";
import { listEntries, readEntry } from "./zip.ts";

/** `fetch` for the studio: proxied hosts through the dashboard server, the rest direct. */
export const proxiedFetch: Fetch = (url, init) =>
  PROXIED.has(new URL(url).hostname) ? fetch(`/api/font-proxy?url=${encodeURIComponent(url)}`) : fetch(url, init);

/** One downloadable face of a family. */
export interface FamilyFace {
  id: string;
  /** "Bold", "Light Italic". */
  style: string;
  weight: number;
  italic: boolean;
  /** The file name it is stored under. */
  file: string;
  load(): Promise<Uint8Array>;
}

const WEIGHT_NAME: Record<number, string> = { 100: "Thin", 200: "ExtraLight", 300: "Light", 400: "Regular", 500: "Medium", 600: "SemiBold", 700: "Bold", 800: "ExtraBold", 900: "Black" };
const MAX_FILE = 30 * 1024 * 1024;
const safeName = (name: string) => name.split(/[\\/]/).pop()!.replace(/[^\w.,()-]/g, "_");

interface FontsourceInfo {
  id: string;
  defSubset: string;
  variants: Record<string, Record<string, Record<string, { url: { ttf?: string } }>>>;
}

/** The faces a candidate offers; Font Squirrel's zip is downloaded to read them. */
export async function listFaces(c: FontCandidate, fetchImpl: Fetch): Promise<FamilyFace[]> {
  const out: FamilyFace[] = [];
  if (c.source === "fontsquirrel") {
    const zip = await bytes(fetchImpl, `https://www.fontsquirrel.com/fonts/download/${encodeURIComponent(c.id)}`);
    for (const e of listEntries(zip)) {
      if (!/\.(ttf|otf)$/i.test(e.name)) continue;
      const data = await readEntry(zip, e, MAX_FILE);
      for (const f of readFaces(data)) out.push({ id: `${e.name}#${f.index}`, style: f.face, weight: f.weight, italic: f.italic, file: safeName(e.name), load: async () => data });
    }
    return out;
  }
  // Google's own download server sends no CORS headers: every catalogue entry downloads from Fontsource.
  const info = (await (await get(fetchImpl, `https://api.fontsource.org/v1/fonts/${encodeURIComponent(c.id)}`)).json()) as FontsourceInfo;
  for (const [weight, styles] of Object.entries(info.variants)) {
    for (const [style, subsets] of Object.entries(styles)) {
      const url = (subsets[info.defSubset] ?? Object.values(subsets)[0])?.url.ttf;
      if (!url) continue;
      const w = Number(weight);
      const italic = style === "italic";
      out.push({
        id: `${weight}-${style}`,
        style: italic && w === 400 ? "Italic" : `${WEIGHT_NAME[w] ?? weight}${italic ? " Italic" : ""}`,
        weight: w,
        italic,
        file: `${info.id}-${weight}-${style}.ttf`,
        load: () => bytes(fetchImpl, url),
      });
    }
  }
  return out;
}

/**
 * How many items each face serves (by face id): every request is matched against the family's
 * faces the way InfoPanel would if they were installed. Faces nothing asks for are absent.
 */
export function neededBy(family: string, faces: readonly FamilyFace[], requests: readonly { request: FontRequest; items: number }[]): Map<string, number> {
  const synth = faces.map(
    (f): SuppliedFace => ({
      family,
      face: f.style,
      legacyFamily: f.weight === 400 || f.weight === 700 ? family : `${family} ${f.style}`,
      fullName: `${family} ${f.style}`,
      postscriptName: "",
      weight: f.weight,
      width: 5,
      italic: f.italic,
      index: 0,
      origin: "download",
      file: f.id,
      url: "",
    }),
  );
  const out = new Map<string, number>();
  for (const { request, items } of requests) {
    const hit = matchSupplied(request, synth);
    if (hit) out.set(hit.file, (out.get(hit.file) ?? 0) + items);
  }
  return out;
}
