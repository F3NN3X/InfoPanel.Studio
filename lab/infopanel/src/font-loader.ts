/**
 * Gives the browser the typeface InfoPanel draws a text item with.
 *
 * For requests in fonts/skia-reference.json (tools/skia-fonts) it loads the
 * exact font file Skia drew with. Otherwise it resolves the request with the
 * ported createTypeface over the same font list and lets the browser find
 * the family by name, which is close but not exact.
 */
import { createTypeface, type FontSet, type Slant, type Typeface } from "./fonts.ts";
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
}

const key = (r: FontRequest) => JSON.stringify([r.font, r.style, r.bold, r.italic]);
const cssStyle = (s: Slant) => (s === "Italic" ? "italic" : s === "Oblique" ? "oblique" : "normal");

export class FontLoader {
  readonly fonts: FontSet;
  private readonly files = new Map<string, { file: string | null; ttcIndex: number }>();
  private readonly loaded = new Map<string, Promise<string>>();

  constructor(reference: Reference) {
    this.fonts = { families: reference.families, defaultFamily: reference.default.family };
    for (const r of reference.results) {
      this.files.set(key({ font: r.request.Font, style: r.request.Style, bold: r.request.Bold, italic: r.request.Italic }), r.font);
    }
  }

  static async fetch(base = "/fonts"): Promise<FontLoader | null> {
    const r = await fetch(`${base}/skia-reference.json`);
    return r.ok ? new FontLoader(await r.json()) : null;
  }

  /**
   * Registers the face (once per weight) and returns its CSS family alias. The face is
   * declared at the weight Skia reports, so the browser draws it as is; when DirectWrite
   * simulated bold (a bold request on a face 200+ lighter), it is declared at its own
   * weight instead, and the browser synthesizes the bold.
   */
  private loadFile(file: string, ttcIndex: number, typeface: Typeface): Promise<string> {
    const id = `${file}#${ttcIndex}@${typeface.weight}`;
    let p = this.loaded.get(id);
    if (!p) {
      p = (async () => {
        const bytes = new Uint8Array(await (await fetch(`/fonts/${file}`)).arrayBuffer());
        const info = readFaces(bytes)[ttcIndex];
        const simulatedBold = info !== undefined && typeface.weight >= 600 && info.weight <= typeface.weight - 200;
        const alias = `ip-${id.replace(/\W/g, "-")}`;
        // A browser loads the first font of a .ttc; for any other, use the installed copy by full name.
        const source = ttcIndex === 0 ? bytes.buffer : `local("${info?.fullName ?? ""}")`;
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
    const typeface = createTypeface(this.fonts, request.font, request.style, request.bold, request.italic);
    const css = { fontWeight: typeface.weight, fontStyle: cssStyle(typeface.slant) } as const;
    const known = this.files.get(key(request));
    if (known?.file) {
      const alias = await this.loadFile(known.file, known.ttcIndex, typeface);
      return { typeface, css: { ...css, fontFamily: `"${alias}"` }, exact: true, file: known.file };
    }
    return { typeface, css: { ...css, fontFamily: `"${typeface.family}"` }, exact: false, file: null };
  }
}
