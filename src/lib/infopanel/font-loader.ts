/**
 * Gives the browser the typeface InfoPanel draws a text item with, in order:
 *
 * 1. The Data API's font endpoints (fork follow-up to PR #173): InfoPanel
 *    itself resolves the request and serves the face file. Exact, live.
 * 2. fonts/skia-reference.json (tools/skia-fonts): the face Skia drew with
 *    when the reference was taken. Exact for the requests it lists.
 * 3. The ported createTypeface over the reference's font list, letting the
 *    browser find the family by name: close, not exact.
 */
import { createTypeface, type FontSet, type Slant, type Typeface } from "./fonts.ts";
import { DATA_API } from "./sensors.ts";
import { readFaces } from "./sfnt.ts";

export interface FontRequest {
  font: string;
  style: string;
  bold: boolean;
  italic: boolean;
}

interface Reference {
  default: { family: string };
  families: FontSet["families"];
  results: {
    request: { Font: string; Style: string; Bold: boolean; Italic: boolean };
    font: { file: string | null; ttcIndex: number };
  }[];
}

export interface ResolvedFont {
  typeface: Typeface;
  /** CSS for the text: family, weight and style. */
  css: { fontFamily: string; fontWeight: number; fontStyle: "normal" | "italic" | "oblique" };
  /** Exact: the file InfoPanel drew with; otherwise matched by family name. */
  exact: boolean;
  file: string | null;
  /** Where the answer came from. */
  source: "data-api" | "reference" | "ported";
  /** InfoPanel draws another family than the requested one (the font is missing). Data API only. */
  fallback?: boolean;
}

/** One answer of POST /api/fonts/resolve. */
export interface RemoteFont {
  family: string;
  weight: number;
  width: number;
  italic: boolean;
  fallback: boolean;
  face: string | null;
  ttcIndex: number;
}

/** The Data API's answer as a typeface. */
export const remoteTypeface = (r: RemoteFont): Typeface => ({
  family: r.family,
  weight: r.weight,
  width: r.width,
  slant: r.italic ? "Italic" : "Upright",
  via: "data-api",
});

const NO_REFERENCE: Reference = { default: { family: "Segoe UI" }, families: [], results: [] };
/** The endpoint takes at most 256 requests per call. */
const BATCH = 256;

const SAFE_LOCAL_NAME = /^[\p{L}\p{N} ._&+-]{1,100}$/u;
const key = (r: FontRequest) => JSON.stringify([r.font, r.style, r.bold, r.italic]);
const cssStyle = (s: Slant) => (s === "Italic" ? "italic" : s === "Oblique" ? "oblique" : "normal");

export class FontLoader {
  readonly fonts: FontSet;
  /** Whether a reference file was found (its font list backs the ported resolver). */
  readonly hasReference: boolean;
  private readonly files = new Map<string, { file: string | null; ttcIndex: number }>();
  private readonly loaded = new Map<string, Promise<string>>();
  private readonly remote = new Map<string, Promise<RemoteFont | null>>();
  private pending: { request: FontRequest; done(r: RemoteFont | null): void }[] = [];

  /** `api`: the Data API base when it has the font endpoints. */
  constructor(
    reference: Reference | null,
    readonly api: string | null = null,
  ) {
    this.hasReference = reference !== null;
    const ref = reference ?? NO_REFERENCE;
    this.fonts = { families: ref.families, defaultFamily: ref.default.family };
    for (const r of ref.results) {
      this.files.set(key({ font: r.request.Font, style: r.request.Style, bold: r.request.Bold, italic: r.request.Italic }), r.font);
    }
  }

  /** `base`: the folder holding `skia-reference.json` (the lab's), or null for none (the app). */
  static async fetch(base: string | null = "/fonts", api = DATA_API): Promise<FontLoader | null> {
    const [reference, hasApi] = await Promise.all([
      base === null ? null : fetch(`${base}/skia-reference.json`).then((r) => (r.ok ? (r.json() as Promise<Reference>) : null), () => null),
      FontLoader.probe(api),
    ]);
    return reference || hasApi ? new FontLoader(reference, hasApi ? api : null) : null;
  }

  /** True when the Data API answers a font resolve (InfoPanel running a build with the endpoints). */
  static async probe(api: string): Promise<boolean> {
    try {
      const r = await fetch(`${api}/api/fonts/resolve`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "[]" });
      return r.ok && Array.isArray(await r.json());
    } catch {
      return false;
    }
  }

  /** Requests made in the same tick go to the endpoint together. */
  private resolveRemote(request: FontRequest): Promise<RemoteFont | null> {
    const k = key(request);
    let p = this.remote.get(k);
    if (!p) {
      p = new Promise((done) => {
        if (this.pending.length === 0) setTimeout(() => void this.flush(), 0);
        this.pending.push({ request, done });
      });
      this.remote.set(k, p);
    }
    return p;
  }

  private async flush() {
    const batch = this.pending;
    this.pending = [];
    for (let i = 0; i < batch.length; i += BATCH) {
      const part = batch.slice(i, i + BATCH);
      let answers: RemoteFont[] | null = null;
      try {
        const r = await fetch(`${this.api}/api/fonts/resolve`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(part.map((p) => p.request)),
        });
        if (r.ok) answers = await r.json();
      } catch {
        answers = null;
      }
      part.forEach((p, n) => p.done(answers?.[n] ?? null));
    }
  }

  /**
   * Registers the face (once per weight) and returns its CSS family alias. The face is
   * declared at the weight Skia reports, so the browser draws it as is; when DirectWrite
   * simulated bold (a bold request on a face 200+ lighter), it is declared at its own
   * weight instead, and the browser synthesizes the bold.
   */
  private loadFile(url: string, ttcIndex: number, typeface: Typeface): Promise<string> {
    const id = `${url}#${ttcIndex}@${typeface.weight}`;
    let p = this.loaded.get(id);
    if (!p) {
      p = (async () => {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
        const bytes = new Uint8Array(await res.arrayBuffer());
        const info = readFaces(bytes)[ttcIndex];
        const simulatedBold = info !== undefined && typeface.weight >= 600 && info.weight <= typeface.weight - 200;
        const alias = `ip-${id.replace(/\W/g, "-")}`;
        // A browser loads the first font of a .ttc; for any other, use the installed copy by full
        // name. The name comes from the (untrusted) file, so only plain names go into local().
        const fullName = info?.fullName ?? "";
        if (ttcIndex !== 0 && !SAFE_LOCAL_NAME.test(fullName)) throw new Error(`Unusable font name in ${url}`);
        const source = ttcIndex === 0 ? bytes.buffer : `local("${fullName}")`;
        const face = new FontFace(alias, source, {
          weight: String(simulatedBold ? info.weight : typeface.weight),
          style: cssStyle(typeface.slant),
        });
        document.fonts.add(await face.load());
        return alias;
      })();
      this.loaded.set(id, p);
    }
    return p;
  }

  async resolve(request: FontRequest): Promise<ResolvedFont> {
    const remote = this.api ? await this.resolveRemote(request) : null;
    if (remote) {
      const typeface = remoteTypeface(remote);
      const css = { fontWeight: typeface.weight, fontStyle: cssStyle(typeface.slant) } as const;
      const url = remote.face ? `${this.api}/api/fonts/${encodeURIComponent(remote.face)}` : null;
      const alias = url ? await this.loadFile(url, remote.ttcIndex, typeface).catch(() => null) : null;
      return {
        typeface,
        css: { ...css, fontFamily: `"${alias ?? typeface.family}"` },
        exact: alias !== null,
        file: url,
        source: "data-api",
        fallback: remote.fallback,
      };
    }

    const typeface = createTypeface(this.fonts, request.font, request.style, request.bold, request.italic);
    const css = { fontWeight: typeface.weight, fontStyle: cssStyle(typeface.slant) } as const;
    const known = this.files.get(key(request));
    if (known?.file) {
      const alias = await this.loadFile(`/fonts/${known.file}`, known.ttcIndex, typeface);
      return { typeface, css: { ...css, fontFamily: `"${alias}"` }, exact: true, file: known.file, source: "reference" };
    }
    return { typeface, css: { ...css, fontFamily: `"${typeface.family}"` }, exact: false, file: null, source: "ported" };
  }
}
