/**
 * Font licence review (L12): may a font file travel with a canvas (the stored
 * form's fonts, a shared profile)? A hint from what the file and its source
 * say, not legal advice: open licences may be shared, fonts whose licence
 * forbids it or whose embedding bits say "restricted" may not, anything else
 * is for the user to check.
 */
import type { Embedding } from "./sfnt.ts";

export type Verdict = "share" | "check" | "keep";

export interface LicenceInfo {
  /** The source's licence id (Fontsource, Google), or the font's own licence text (name table 13). */
  license?: string;
  licenseUrl?: string;
  embedding?: Embedding;
}

export interface Review {
  verdict: Verdict;
  reason: string;
}

/** Licence ids (SPDX, as the sources give them) and the names fonts use for them. */
const OPEN = /\b(ofl(-1\.[01])?|sil open font licen[cs]e|open font licen[cs]e|apache(-2\.0| licen[cs]e)|ufl(-1\.0)?|ubuntu font licen[cs]e|cc0(-1\.0)?|mit( licen[cs]e)?|unlicense|gpl-[23]\.0[- ]with[- ]font[- ]exception|public domain)\b/i;
const OPEN_URL = /^https?:\/\/(scripts\.sil\.org\/ofl|openfontlicense\.org|www\.apache\.org\/licenses|ubuntu\.com\/legal\/font-licence|creativecommons\.org\/publicdomain\/zero)/i;
/** What proprietary fonts say about passing them on. */
const PROPRIETARY = /(microsoft supplied font|may not (be )?(re)?distribut|must not (be )?(re)?distribut|not (be )?redistribut|you may use this font .* as permitted by the license terms|commercial licen[cs]e|licensed (only )?to)/i;

export function reviewFont(f: LicenceInfo): Review {
  const text = f.license ?? "";
  if (OPEN.test(text) || (f.licenseUrl && OPEN_URL.test(f.licenseUrl))) {
    return f.embedding === "restricted"
      ? { verdict: "check", reason: "an open licence, but the file's embedding bits say restricted" }
      : { verdict: "share", reason: "an open licence: it may travel with the canvas" };
  }
  if (PROPRIETARY.test(text)) return { verdict: "keep", reason: "its licence does not allow passing it on" };
  if (f.embedding === "restricted") return { verdict: "keep", reason: "its embedding bits say restricted" };
  if (!text) return { verdict: "check", reason: "no licence in the file or from its source" };
  return { verdict: "check", reason: "a licence this lab does not recognise" };
}

export const VERDICT_LABEL: Record<Verdict, string> = { share: "may share", check: "check", keep: "do not share" };
