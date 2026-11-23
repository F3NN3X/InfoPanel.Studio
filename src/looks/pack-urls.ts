// Where G4 is enforced for theme packs: a pack's assets live in its own folder, so the loader refuses any URL that leaves
// it and any `@import`. The server's CSP allows remote images and fonts, so it does not do this job.
import { tokenize } from "./css-syntax";

/** One spelling of a URL: no control character or backslash, no scheme (a drive letter is one) or root path, no `..` step. */
function plainRelative(u: string): boolean {
  if (!u || /[\u0000-\u001f\\]/.test(u)) return false;
  if (/^[a-z][a-z0-9+.-]*:/i.test(u) || u.startsWith("/")) return false;
  return !u.split(/[/?#]/).includes("..");
}

/**
 * Pack-relative as written and after percent-decoding: a server may decode before it joins the path, and `%5c`, `%2f` and
 * `%3a` then become separators. Decoded until stable (`%252e`); an invalid escape fails closed.
 */
export function isPackRelativeUrl(url: string): boolean {
  let u = url.trim();
  for (let round = 0; round < 5; round++) {
    if (!plainRelative(u)) return false;
    let next: string;
    try {
      next = decodeURIComponent(u);
    } catch {
      return false;
    }
    if (next === u) return true;
    u = next;
  }
  return false;
}

/**
 * A pack-relative URL (one `isPackRelativeUrl` passed) as the path of a file from the pack's folder: empty and `.` steps
 * dropped, each step percent-encoded as written (an escape in it stays text, so it names no other file).
 */
export function packPath(url: string): string {
  return url
    .trim()
    .split("/")
    .filter((step) => step !== "" && step !== ".")
    .map(encodeURIComponent)
    .join("/");
}

/** Functions whose string arguments name files. */
export const URL_FUNCS = new Set(["url", "image-set", "src", "image", "cross-fade"]);
/** Functions whose value cannot be known here: inside a URL function they could spell any URL. */
const DYNAMIC_FUNCS = new Set(["var", "env", "attr"]);

/**
 * What is wrong with a pack's CSS, one line each (empty = fine). It reads the tokens of `css-syntax` (CSS Syntax Level 3
 * section 4), so nothing hides in a string or a comment, and fails closed: an escape outside a string (it could spell `url(`
 * or `@import`), a string, comment or url token that never closes, a url token that is not plain, a URL function that never
 * closes, a `var()`, `env()` or `attr()` inside a URL function, `@import`, and any URL that is not pack-relative are issues.
 */
export function packCssIssues(css: string): string[] {
  return scanCss(css).issues;
}

/** Every URL a pack's CSS names (url tokens and strings in URL functions), for the validator's asset check. */
export function cssUrls(css: string): string[] {
  return scanCss(css).urls;
}

function scanCss(css: string): { issues: string[]; urls: string[] } {
  const issues: string[] = [];
  const urls: string[] = [];
  // the open blocks, innermost last: "(" "[" "{" or a function's lowercase name; a string inside a URL function is a URL
  const stack: string[] = [];
  const check = (url: string) => {
    urls.push(url);
    if (!isPackRelativeUrl(url)) issues.push(`url ${url}`);
  };
  const inUrlFunc = () => stack.some((f) => URL_FUNCS.has(f));
  for (const tok of tokenize(css)) {
    if (tok.t === "error") issues.push(tok.v);
    else if (tok.t === "string" && inUrlFunc()) check(tok.v);
    else if (tok.t === "url") check(tok.v);
    else if (tok.t === "at" && tok.v.toLowerCase().replace(/^-[a-z]+-/, "") === "import") issues.push("@import");
    else if (tok.t === "function") {
      const name = tok.v.toLowerCase().replace(/^-[a-z]+-/, "");
      if (DYNAMIC_FUNCS.has(name) && inUrlFunc()) issues.push(`${name}() in a url function`);
      // `attr(x type(<url>))` reads a URL from an element attribute
      if (name === "type" && stack.includes("attr")) issues.push("type() in attr()");
      stack.push(name);
    } else if (tok.t === "(" || tok.t === "[" || tok.t === "{") stack.push(tok.t);
    else if (tok.t === ")" || tok.t === "]" || tok.t === "}") {
      // a `)` closes a function or a bare `(`, never a `[` or `{` left open
      const top = stack.at(-1);
      if (top && (tok.t === ")" ? top !== "[" && top !== "{" : top === (tok.t === "]" ? "[" : "{"))) stack.pop();
    }
  }
  for (const f of stack) if (URL_FUNCS.has(f)) issues.push(`unterminated ${f}(`);
  return { issues, urls };
}
