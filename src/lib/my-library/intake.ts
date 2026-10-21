/**
 * Files dropped on My library (spec §3, §10 upload): what each one is, read from its bytes, and
 * why one is refused (a bad font, an SVG over 256 KB, an unsafe SVG, a type the store doesn't
 * take). Pure; `decode.ts` adds what only a browser can read (pixels, video length, font faces).
 */
import { sniff } from "@/lib/infopanel/assets/assets";
import type { LibraryKind } from "@/lib/library";

/** The asset store's SVG limit (server/assets.mjs SVG_LIMIT). */
export const SVG_LIMIT = 256 * 1024;
/** The store's limits per kind (server/assets.mjs LIMITS). */
export const LIMITS = { image: 25 * 1024 * 1024, video: 300 * 1024 * 1024, font: 30 * 1024 * 1024 };

export type Intake =
  | { ok: true; kind: Extract<LibraryKind, "image" | "video" | "svg" | "font">; type: string; mime: string; width?: number; height?: number; frames?: number }
  /** Not a library file but something to open: a profile goes to the Import dialog. */
  | { ok: true; kind: "infopanel" }
  | { ok: false; reason: string };

const IMAGE_MIME: Record<string, string> = { png: "image/png", jpeg: "image/jpeg", gif: "image/gif", webp: "image/webp", bmp: "image/bmp", ico: "image/x-icon" };

const ascii = (b: Uint8Array, at: number, n: number) => String.fromCharCode(...b.subarray(at, at + n));

/** The font container a file's first bytes name, if any. */
export function fontType(b: Uint8Array): "ttf" | "otf" | "ttc" | "woff" | "woff2" | null {
  if (b.length < 4) return null;
  const tag = ascii(b, 0, 4);
  if (tag === "OTTO") return "otf";
  if (tag === "ttcf") return "ttc";
  if (tag === "wOFF") return "woff";
  if (tag === "wOF2") return "woff2";
  if (tag === "true" || (b[0] === 0 && b[1] === 1 && b[2] === 0 && b[3] === 0)) return "ttf";
  return null;
}

const FONT_MIME = { ttf: "font/ttf", otf: "font/otf", ttc: "font/collection", woff: "font/woff", woff2: "font/woff2" } as const;

/**
 * A courtesy pre-check, not a sanitizer: an SVG with obvious script is refused with a clear reason.
 * The boundary is elsewhere: library SVGs render only through `<img>` (no script runs), the server
 * serves SVG under a sandboxing CSP, and inline drawing goes through `svg-template.ts`'s
 * DOMParser sanitizer.
 */
const UNSAFE_SVG = /<script[\s>]|<foreignObject[\s>]|\son[a-z]+\s*=|javascript:/i;

/** The CSS variables an SVG template reads (`--value`, `--percent`). */
export function svgVars(text: string): string[] {
  return [...new Set([...text.matchAll(/var\(\s*(--[a-z0-9-]+)/gi)].map((m) => m[1]))];
}

/** An SVG's size from its width / height, else its viewBox. */
export function svgSize(text: string): { width?: number; height?: number } {
  const root = /<svg\b[^>]*>/i.exec(text)?.[0] ?? "";
  const attr = (name: string) => {
    const v = new RegExp(`\\s${name}\\s*=\\s*["']\\s*([\\d.]+)(px)?\\s*["']`, "i").exec(root)?.[1];
    return v ? Math.round(Number(v)) : undefined;
  };
  const vb = /viewBox\s*=\s*["']\s*[-\d.]+[\s,]+[-\d.]+[\s,]+([\d.]+)[\s,]+([\d.]+)/i.exec(root);
  return { width: attr("width") ?? (vb ? Math.round(Number(vb[1])) : undefined), height: attr("height") ?? (vb ? Math.round(Number(vb[2])) : undefined) };
}

/** `classify`'s reason for a file that is none of the types it knows. */
export const NOT_MEDIA = "Not an image, video, SVG or font";

export function classify(name: string, declared: string, bytes: Uint8Array): Intake {
  const lower = name.toLowerCase();
  if (lower.endsWith(".infopanel")) return { ok: true, kind: "infopanel" };
  const font = fontType(bytes);
  if (font) {
    if (bytes.length > LIMITS.font) return { ok: false, reason: "Font over 30 MB" };
    return { ok: true, kind: "font", type: font, mime: FONT_MIME[font] };
  }
  if (/\.(ttf|otf|ttc|woff2?)$/.test(lower)) return { ok: false, reason: "Not a font this app can read" };
  const s = sniff(bytes);
  if (s.type === "svg") {
    if (bytes.length > SVG_LIMIT) return { ok: false, reason: "SVG over 256 KB" };
    const text = new TextDecoder().decode(bytes);
    if (UNSAFE_SVG.test(text)) return { ok: false, reason: "Unsafe SVG: it has scripts or event handlers" };
    return { ok: true, kind: "svg", type: "svg", mime: "image/svg+xml", ...svgSize(text) };
  }
  if (s.type === "video") {
    if (bytes.length > LIMITS.video) return { ok: false, reason: "Video over 300 MB" };
    // MP4 has an ftyp box; Matroska and WebM are stored as WebM.
    const mp4 = ascii(bytes, 4, 4) === "ftyp";
    return { ok: true, kind: "video", type: mp4 ? "mp4" : "webm", mime: mp4 ? "video/mp4" : "video/webm" };
  }
  const mime = IMAGE_MIME[s.type];
  if (mime) {
    if (bytes.length > LIMITS.image) return { ok: false, reason: "Image over 25 MB" };
    return { ok: true, kind: "image", type: s.type, mime, width: s.width, height: s.height, ...(s.animated ? { frames: 2 } : {}) };
  }
  if (declared === "image/avif" || lower.endsWith(".avif")) return { ok: true, kind: "image", type: "avif", mime: "image/avif" };
  return { ok: false, reason: NOT_MEDIA };
}

/** A file name without its folder (the card keeps the extension, as the file had it). */
export const displayName = (fileName: string) => fileName.replace(/^.*[\\/]/, "");
