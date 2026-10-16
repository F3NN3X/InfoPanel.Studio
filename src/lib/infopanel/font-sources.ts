/**
 * Finds free downloads for fonts a profile needs but this machine lacks.
 *
 * Sources (all keyless, see docs/infopanel-import/research-font-sources.md):
 * - Fontsource catalog (api.fontsource.org): every Google font plus ~120 other
 *   open-licensed families. Google families download complete from Google's
 *   own manifest (fonts.google.com/download/list, no CORS, so server side);
 *   the others from Fontsource's CDN, one file per weight and style.
 * - Font Squirrel (fontsquirrel.com/api): ~1,000 families, free for commercial
 *   use under varying licenses, downloaded as a zip.
 *
 * Commercial and personal-use fonts (DaFont and the like) have no API and are
 * left to the user: the import asks for the file instead.
 */
import { readFaces } from "./sfnt.ts";
import { listEntries, readEntry, readLimited } from "./zip.ts";

export type SourceId = "google" | "fontsource" | "fontsquirrel";

export interface FontCandidate {
  source: SourceId;
  /** Fontsource id or Font Squirrel url name. */
  id: string;
  family: string;
  /** SPDX id for Fontsource; Font Squirrel licenses vary per family. */
  license: string;
  open: boolean;
  match: "exact" | "base" | "partial";
  page: string;
  weights?: number[];
  styles?: string[];
}

interface FontsourceEntry {
  id: string;
  family: string;
  license: string;
  type: string;
  weights: number[];
  styles: string[];
  defSubset: string;
}
interface FontSquirrelEntry {
  family_name: string;
  family_urlname: string;
}
export interface Catalogs {
  fontsource: FontsourceEntry[];
  fontsquirrel: FontSquirrelEntry[];
  /** Sources that could not be read, with the reason. */
  unavailable: string[];
}

export type Fetch = (url: string, init?: RequestInit) => Promise<Response>;

const OPEN_LICENSES = new Set(["ofl-1.1", "apache-2.0", "ufl-1.0", "cc0-1.0", "mit", "unlicense"]);
const HOSTS = new Set(["api.fontsource.org", "cdn.jsdelivr.net", "fonts.google.com", "fonts.gstatic.com", "www.fontsquirrel.com"]);
const MAX_FILE = 30 * 1024 * 1024;
/** All files of one family together. */
const MAX_FAMILY = 100 * 1024 * 1024;
const MAX_REDIRECTS = 3;

const checkHost = (url: string) => {
  const u = new URL(url);
  if (u.protocol !== "https:" || !HOSTS.has(u.hostname)) throw new Error(`Refusing to fetch ${url}`);
};

/**
 * Fetches only from the known font hosts over HTTPS. Redirects are followed by hand so
 * every hop is checked; a browser hides the target (opaque redirect), so there it fails.
 */
export async function get(fetchImpl: Fetch, url: string): Promise<Response> {
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    checkHost(url);
    const r = await fetchImpl(url, { redirect: "manual" });
    const location = r.status >= 300 && r.status < 400 ? r.headers.get("location") : null;
    if (location) {
      url = new URL(location, url).href;
      continue;
    }
    if (r.type === "opaqueredirect") throw new Error(`${url}: redirected`);
    if (!r.ok) throw new Error(`${url}: HTTP ${r.status}`);
    return r;
  }
  throw new Error(`${url}: too many redirects`);
}

/** The body, read up to MAX_FILE bytes; whatever Content-Length says. */
export async function bytes(fetchImpl: Fetch, url: string): Promise<Uint8Array> {
  const r = await get(fetchImpl, url);
  if (!r.body) return new Uint8Array();
  return readLimited(r.body, MAX_FILE, url);
}

/** Fails once the family's files together pass MAX_FAMILY. */
function capTotal(files: DownloadedFile[]): DownloadedFile[] {
  const total = files.reduce((n, f) => n + f.data.length, 0);
  if (total > MAX_FAMILY) throw new Error(`The family's files total ${total} bytes, over ${MAX_FAMILY}`);
  return files;
}

/** A JSON list, or the reason it could not be read. Font Squirrel answers 202 with no body when it throttles. */
async function list<T>(fetchImpl: Fetch, url: string): Promise<T[] | string> {
  try {
    const r = await get(fetchImpl, url);
    const text = await r.text();
    if (!text) return `${new URL(url).hostname}: sent no data (throttled; try again later)`;
    const data: unknown = JSON.parse(text);
    return Array.isArray(data) ? (data as T[]) : `${new URL(url).hostname}: not a list`;
  } catch (e) {
    return `${new URL(url).hostname}: ${(e as Error).message}`;
  }
}

/** Font Squirrel sends no CORS headers: in the lab page its requests go through the dev server (font-proxy-plugin.ts). */
export const PROXIED = new Set(["www.fontsquirrel.com"]);

/** May the dev server fetch this for the page? */
export const proxyAllowed = (url: string) => {
  try {
    const u = new URL(url);
    return u.protocol === "https:" && PROXIED.has(u.hostname);
  } catch {
    return false;
  }
};

export async function fetchCatalogs(fetchImpl: Fetch = fetch): Promise<Catalogs> {
  const [fontsource, fontsquirrel] = await Promise.all([
    list<FontsourceEntry>(fetchImpl, "https://api.fontsource.org/v1/fonts"),
    list<FontSquirrelEntry>(fetchImpl, "https://www.fontsquirrel.com/api/fontlist/all"),
  ]);
  return {
    fontsource: typeof fontsource === "string" ? [] : fontsource,
    fontsquirrel: typeof fontsquirrel === "string" ? [] : fontsquirrel,
    unavailable: [fontsource, fontsquirrel].filter((x): x is string => typeof x === "string"),
  };
}

const STYLE_WORDS =
  /\b(thin|hairline|extra ?light|ultra ?light|light|semi ?light|book|regular|normal|medium|semi ?bold|demi ?bold|bold|extra ?bold|ultra ?bold|heavy|black|italic|oblique|condensed|expanded|narrow|wide)\b/gi;
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

/** The family part of a requested name: style words, and anything after " - ", removed. */
export function searchName(requested: string): string {
  return requested.split(" - ")[0].replace(STYLE_WORDS, " ").replace(/\s+/g, " ").trim();
}

const SOURCE_ORDER: Record<SourceId, number> = { google: 0, fontsource: 1, fontsquirrel: 2 };
const MATCH_ORDER = { exact: 0, base: 1, partial: 2 } as const;

/** Candidates for a requested family name, best first; one per family name. */
export function findCandidates(requested: string, catalogs: Catalogs, sources?: readonly SourceId[]): FontCandidate[] {
  const full = norm(requested);
  const base = norm(searchName(requested));
  const matchOf = (family: string): FontCandidate["match"] | null => {
    const f = norm(family);
    if (!f) return null;
    if (f === full) return "exact";
    if (f === base) return "base";
    if (f.length >= 4 && base.length >= 4 && (base.startsWith(f) || f.startsWith(base))) return "partial";
    return null;
  };

  const out: FontCandidate[] = [];
  for (const e of catalogs.fontsource) {
    const match = matchOf(e.family);
    if (!match) continue;
    const google = e.type === "google";
    out.push({
      source: google ? "google" : "fontsource",
      id: e.id,
      family: e.family,
      license: e.license,
      open: OPEN_LICENSES.has(e.license.toLowerCase()),
      match,
      page: google ? `https://fonts.google.com/specimen/${e.family.replaceAll(" ", "+")}` : `https://fontsource.org/fonts/${e.id}`,
      weights: e.weights,
      styles: e.styles,
    });
  }
  for (const e of catalogs.fontsquirrel) {
    const match = matchOf(e.family_name);
    if (!match) continue;
    out.push({
      source: "fontsquirrel",
      id: e.family_urlname,
      family: e.family_name,
      license: "Font Squirrel (free for commercial use; see the included license)",
      open: false,
      match,
      page: `https://www.fontsquirrel.com/fonts/${e.family_urlname}`,
    });
  }
  const wanted = sources ? out.filter((c) => sources.includes(c.source)) : out;
  wanted.sort((a, b) => MATCH_ORDER[a.match] - MATCH_ORDER[b.match] || SOURCE_ORDER[a.source] - SOURCE_ORDER[b.source]);
  const seen = new Set<string>();
  return wanted.filter((c) => !seen.has(norm(c.family)) && seen.add(norm(c.family)));
}

export interface DownloadedFile {
  name: string;
  data: Uint8Array;
  kind: "font" | "license";
}

const FONT_FILE = /\.(ttf|otf)$/i;
const LICENSE_FILE = /(ofl|license|licence)[^/]*\.txt$/i;
const safeName = (name: string) => name.split(/[\\/]/).pop()!.replace(/[^\w.,()-]/g, "_");

/** Keeps a font file only if it parses as one. */
function checked(name: string, data: Uint8Array): DownloadedFile {
  if (readFaces(data).length === 0) throw new Error(`${name} is not a readable font`);
  return { name: safeName(name), data, kind: "font" };
}

/**
 * The family's font files (and license text). Google: the complete family
 * from Google's manifest; Fontsource: one file per weight and style (its
 * default subset only); Font Squirrel: the font files in its zip.
 */
export async function downloadFamily(c: FontCandidate, fetchImpl: Fetch = fetch): Promise<DownloadedFile[]> {
  if (c.source === "google") {
    const text = await (await get(fetchImpl, `https://fonts.google.com/download/list?family=${encodeURIComponent(c.family)}`)).text();
    const manifest = JSON.parse(text.replace(/^\)\]\}'/, "")).manifest as {
      files: { filename: string; contents: string }[];
      fileRefs: { filename: string; url: string }[];
    };
    const fonts = await Promise.all(
      manifest.fileRefs.filter((f) => FONT_FILE.test(f.filename)).map(async (f) => checked(f.filename, await bytes(fetchImpl, f.url))),
    );
    const licenses = manifest.files
      .filter((f) => LICENSE_FILE.test(f.filename))
      .map((f): DownloadedFile => ({ name: safeName(f.filename), data: new TextEncoder().encode(f.contents), kind: "license" }));
    return capTotal([...fonts, ...licenses]);
  }

  if (c.source === "fontsource") {
    const info = (await (await get(fetchImpl, `https://api.fontsource.org/v1/fonts/${encodeURIComponent(c.id)}`)).json()) as FontsourceEntry & {
      variants: Record<string, Record<string, Record<string, { url: { ttf?: string } }>>>;
    };
    const files: DownloadedFile[] = [];
    for (const [weight, styles] of Object.entries(info.variants)) {
      for (const [style, subsets] of Object.entries(styles)) {
        const url = (subsets[info.defSubset] ?? Object.values(subsets)[0])?.url.ttf;
        if (url) files.push(checked(`${info.id}-${weight}-${style}.ttf`, await bytes(fetchImpl, url)));
        capTotal(files);
      }
    }
    return files;
  }

  const zip = await bytes(fetchImpl, `https://www.fontsquirrel.com/fonts/download/${encodeURIComponent(c.id)}`);
  const files: DownloadedFile[] = [];
  for (const e of listEntries(zip)) {
    if (FONT_FILE.test(e.name)) files.push(checked(e.name, await readEntry(zip, e, MAX_FILE)));
    else if (LICENSE_FILE.test(e.name)) files.push({ name: safeName(e.name), data: await readEntry(zip, e, MAX_FILE), kind: "license" });
    capTotal(files);
  }
  return files;
}
