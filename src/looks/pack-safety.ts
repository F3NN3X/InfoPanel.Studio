// The byte and text checks of the pack validator (P12a): the shape of the JSON a pack brings, the strings in it, an SVG against
// an allow-list of elements and attributes, and a raster file's signature. All fail closed: what these cannot read is refused.
import { SMIL_ATTRIBUTES, SMIL_ELEMENTS, smilIssue, SVG_ANIMATED_MAX, svgSheetIssue } from "./motion-svg";

const MAX_DEPTH = 16;
const MAX_NODES = 20_000;
const MAX_STRING = 8_000;
const FORBIDDEN_KEYS = new Set(["__proto__", "constructor", "prototype"]);

/** What is wrong with the shape of parsed JSON: too deep, too big, a string too long, or a key that names the prototype chain. One line each, empty = fine. */
export function jsonShapeIssues(value: unknown): string[] {
  const issues: string[] = [];
  let nodes = 0;
  const walk = (v: unknown, depth: number, at: string) => {
    if (issues.length) return;
    if (++nodes > MAX_NODES) return void issues.push(`more than ${MAX_NODES} values`);
    if (depth > MAX_DEPTH) return void issues.push(`${at}: nested deeper than ${MAX_DEPTH}`);
    if (typeof v === "string") {
      if (v.length > MAX_STRING) issues.push(`${at}: a string over ${MAX_STRING} characters`);
    } else if (Array.isArray(v)) v.forEach((item, k) => walk(item, depth + 1, `${at}[${k}]`));
    else if (v !== null && typeof v === "object") {
      for (const [key, item] of Object.entries(v)) {
        if (FORBIDDEN_KEYS.has(key)) return void issues.push(`${at}: the key ${key} is not allowed`);
        walk(item, depth + 1, `${at}.${key}`);
      }
    }
  };
  walk(value, 0, "$");
  return issues;
}

/** The strings of parsed JSON (values only) with their paths (`$.fonts[0].copyright`), for the scans below; a path matching `skip` (prose) is left out. */
export function jsonStrings(value: unknown, skip: RegExp, at = "$", out: [string, string][] = []): [string, string][] {
  if (typeof value === "string") {
    if (!skip.test(at)) out.push([at, value]);
  } else if (Array.isArray(value)) value.forEach((item, k) => jsonStrings(item, skip, `${at}[${k}]`, out));
  else if (value !== null && typeof value === "object") for (const [key, item] of Object.entries(value)) jsonStrings(item, skip, `${at}.${key}`, out);
  return out;
}

/** The fields that are prose, by exact path: no style or page reads them as code. A nested key of the same name elsewhere is scanned. */
export const PROSE_PATHS = /^\$\.(name|description|modes\.stance|tags\[\d+\]|t1\.(dark|light)\.[a-z0-9-]+\.usage|fonts\[\d+\]\.(copyright|source))$/;
/** A material, tone or token key. */
export const TOKEN_KEY = /^[a-z][a-z0-9-]*$/;

/** A string that could carry CSS or markup into a style or a page: a resource-loading function (`url`, `image-set`, `env`, `attr`, ...), script, an import, a tag. */
export const INJECTION = /(?<!\w)(?:-webkit-)?(?:url|image-set|image|cross-fade|src|element|paint|env|attr)\s*\(|expression\s*\(|javascript:|vbscript:|<|@import|\/\*/i;
/** Characters that end a CSS declaration or a rule: a Look's values go into styles, so none of them may hold these. */
export const STYLE_BREAKERS = /[;{}\\]/;
/** A `{alias}` is the one place a Look's value holds braces. */
export const withoutAliases = (s: string) => s.replace(/\{[\w.-]+\}/g, "");

// ---- SVG ----------------------------------------------------------------------------------------------------------------

/** The elements of a still SVG, and the three that animate it (motion-svg.ts holds what they may say). `<text>` is not among them: a pack's words are the app's. */
const SVG_ELEMENTS = new Set("svg g defs path rect circle ellipse line polyline polygon lineargradient radialgradient stop pattern clippath mask title desc style animate animatetransform".split(" "));
/** A `<style>`'s one attribute. */
const SHEET_ATTRIBUTES: ReadonlySet<string> = new Set(["type"]);
const SVG_ATTRIBUTES = new Set(
  (
    "xmlns xmlns:xlink version viewbox preserveaspectratio width height x y cx cy r rx ry x1 y1 x2 y2 fx fy fr d points transform patterntransform patternunits patterncontentunits gradienttransform gradientunits spreadmethod offset " +
    "id class fill fill-opacity fill-rule stroke stroke-width stroke-opacity stroke-linecap stroke-linejoin stroke-dasharray stroke-dashoffset stroke-miterlimit opacity stop-color stop-opacity clip-path clip-rule mask maskunits maskcontentunits clippathunits " +
    "style href xlink:href aria-hidden role"
  ).split(" ")
);
const SVG_NS = "http://www.w3.org/2000/svg";
const XLINK_NS = "http://www.w3.org/1999/xlink";
const TAG = /<(\/?)([A-Za-z][\w:.-]*)((?:\s+[A-Za-z_:][\w:.-]*\s*=\s*(?:"[^"<]*"|'[^'<]*'))*)\s*(\/?)>/y;
const ATTRIBUTE = /\s+([A-Za-z_:][\w:.-]*)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
/** Every function of CSS that loads a resource (an image, a font, the page's own values), with or without the `-webkit-` prefix. */
const RESOURCE_FUNCTION = /(?<!\w)(?:-webkit-)?(?:url|image-set|image|cross-fade|src|element|paint|env|attr)\s*\(/i;
/** The one resource a value may name: an id inside the file. */
const INTERNAL_URL = /(?<!\w)url\(\s*["']?#[\w.-]+["']?\s*\)/gi;
/** Whether a value loads anything but an id inside the file. */
const reachesOut = (value: string) => RESOURCE_FUNCTION.test(value.replace(INTERNAL_URL, ""));
/** What the `style` attribute of an SVG element may set, each to a colour literal, a number, `none` or `url(#id)`. */
const STYLE_PROPERTIES = new Set("fill stroke stop-color stop-opacity fill-opacity stroke-opacity opacity stroke-width".split(" "));
const STYLE_VALUE = /^(#[\da-f]{3,8}|(?:rgba?|hsla?)\([\d\s.,%/+-]+\)|[+-]?(?:\d+\.?\d*|\.\d+)(?:px|%)?|none|transparent|currentcolor|url\(\s*#[\w.-]+\s*\))$/i;

/** The first thing in an SVG `style` attribute outside the allow-list (undefined: it is fine). */
function styleIssue(value: string): string | undefined {
  for (const declaration of value.split(";")) {
    if (!declaration.trim()) continue;
    const [property, ...rest] = declaration.split(":");
    const v = rest.join(":").trim();
    if (!STYLE_PROPERTIES.has(property.trim().toLowerCase())) return `the style property ${property.trim().slice(0, 30)} is not one a pack SVG may set`;
    if (/["']/.test(v) || !STYLE_VALUE.test(v)) return `the style value ${v.slice(0, 30)} is not a colour, a number or an id inside the file`;
  }
  return undefined;
}

/** The first reason an SVG is not safe (`undefined`: it is). A small reader, not a parser: markup it cannot read is refused, and a name that is not on the lists is refused whatever its case or prefix. Animation is held to motion-svg.ts's subset. */
export function svgIssue(source: string): string | undefined {
  const svg = source.replace(/^﻿/, "");
  let at = 0;
  let elements = 0;
  let root = true;
  // what animates: SMIL elements, and the `.class` / `#id` selectors a `<style>` starts an animation on (counted over the elements below)
  let smil = 0;
  const animates: string[] = [];
  const marked: { classes: string[]; id?: string }[] = [];
  const head = /^\s*<\?xml\s[^?<>]*\?>/.exec(svg);
  if (head) at = head[0].length;
  for (;;) {
    const open = svg.indexOf("<", at);
    if (open < 0) break;
    if (svg.startsWith("<!--", open)) {
      const end = svg.indexOf("-->", open + 4);
      if (end < 0) return "an unterminated comment";
      at = end + 3;
      continue;
    }
    TAG.lastIndex = open;
    const tag = TAG.exec(svg);
    if (!tag) return "markup the validator cannot read (a doctype, entity, CDATA, processing instruction or unquoted attribute)";
    at = open + tag[0].length;
    const name = tag[2].toLowerCase();
    if (!SVG_ELEMENTS.has(name)) return `the element <${tag[2]}> is not one a pack SVG may use`;
    if (root && (tag[1] || name !== "svg")) return "the file does not start with <svg>";
    root = false;
    if (++elements > 5000) return "more than 5000 elements";
    if (tag[1]) continue;
    const animation = SMIL_ELEMENTS.has(name);
    const allowed = name === "style" ? SHEET_ATTRIBUTES : animation ? SMIL_ATTRIBUTES : SVG_ATTRIBUTES;
    const attrs = new Map<string, string>();
    for (const attribute of tag[3].matchAll(ATTRIBUTE)) {
      const key = attribute[1].toLowerCase();
      const value = attribute[2] ?? attribute[3] ?? "";
      if (!allowed.has(key)) return `the attribute ${attribute[1]} is not one a pack SVG may use${animation || name === "style" ? ` on <${name}>` : ""}`;
      attrs.set(key, value);
      if (/[&\\]|javascript:|vbscript:|expression\(|@import/i.test(value) || reachesOut(value)) return `the ${key} value ${value.slice(0, 30)} reaches outside the file or hides what it is`;
      if (key === "style") {
        const m = styleIssue(value);
        if (m) return m;
      }
      if (key === "xmlns" && value !== SVG_NS) return "xmlns is not the SVG namespace";
      if (key === "xmlns:xlink" && value !== XLINK_NS) return "xmlns:xlink is not the XLink namespace";
      if ((key === "href" || key === "xlink:href") && !value.startsWith("#")) return `${key} ${value.slice(0, 30)} is not an id inside the file`;
    }
    if (attrs.has("class") || attrs.has("id")) marked.push({ classes: (attrs.get("class") ?? "").split(/\s+/).filter(Boolean), id: attrs.get("id") });
    const closed = !!tag[4];
    if (name === "style") {
      if (attrs.has("type") && attrs.get("type") !== "text/css") return "a <style> is text/css";
      if (closed) continue;
      // its text runs to the next tag, which closes it: a style holds no markup (and CDATA, an entity or a comment is refused)
      const end = svg.indexOf("<", at);
      if (end < 0 || !/^<\/style\s*>/i.test(svg.slice(end, end + 12))) return "a <style> holds markup";
      const sheet = svgSheetIssue(svg.slice(at, end));
      if ("issue" in sheet) return sheet.issue;
      animates.push(...sheet.animates);
      at = end;
    } else if (animation) {
      const m = smilIssue(name, attrs);
      if (m) return m;
      smil++;
      // an animation element holds nothing: it is self-closing or closed at once
      if (!closed) {
        const close = new RegExp(`^\\s*</${tag[2]}\\s*>`, "i").exec(svg.slice(at));
        if (!close) return `<${tag[2]}> holds markup`;
        at += close[0].length;
      }
    }
  }
  if (root) return "the file has no <svg>";
  const moved = marked.filter((e) => e.classes.some((c) => animates.includes(`.${c}`)) || (e.id !== undefined && animates.includes(`#${e.id}`))).length;
  if (smil + moved > SVG_ANIMATED_MAX) return `${smil + moved} animated elements, at most ${SVG_ANIMATED_MAX}`;
  return undefined;
}

/** Whether an SVG animates (it holds a `<style>` or a SMIL element). Read on a file `svgIssue` passed. */
export const svgAnimated = (source: string): boolean => /<(?:style|animate|animatetransform)[\s/>]/i.test(source);

/**
 * The SVG with its animation taken out: every `<style>` and SMIL element cut whole, at the reader's tag bounds, so what is left
 * is the file at rest (each element at its own attributes). Read on a file `svgIssue` passed; the app draws this wherever the
 * screen does not allow motion (pack-stage.tsx).
 */
export function svgStill(source: string): string {
  let out = "";
  let at = 0;
  let from = 0;
  for (;;) {
    const open = source.indexOf("<", at);
    if (open < 0) break;
    if (source.startsWith("<!--", open)) {
      at = source.indexOf("-->", open + 4) + 3;
      if (at < 3) break;
      continue;
    }
    TAG.lastIndex = open;
    const tag = TAG.exec(source);
    if (!tag) {
      at = open + 1;
      continue;
    }
    at = open + tag[0].length;
    const name = tag[2].toLowerCase();
    if (tag[1] || !(name === "style" || SMIL_ELEMENTS.has(name))) continue;
    if (!tag[4]) {
      const close = new RegExp(`</${tag[2]}\\s*>`, "i").exec(source.slice(at));
      if (close) at += close.index + close[0].length;
    }
    out += source.slice(from, open);
    from = at;
  }
  return out + source.slice(from);
}

/** The colours an SVG paints with (`fill`, `stroke`, `stop-color`, as attributes or in `style`), as written; `none`, `currentColor` and `url(#id)` are not colours. */
export function svgPaints(source: string): string[] {
  const out: string[] = [];
  for (const m of source.matchAll(/\b(?:fill|stroke|stop-color)\s*(?:=\s*["']|:)\s*([^"';]+)/gi)) {
    const v = m[1].trim();
    if (v && !/^(none|currentcolor|inherit|url\(.*)$/i.test(v)) out.push(v);
  }
  return out;
}

// ---- rasters ------------------------------------------------------------------------------------------------------------

const ascii = (b: Uint8Array, from: number, to: number) => String.fromCharCode(...b.subarray(from, to));

/** Whether the bytes are the image type the extension names (png, jpg, gif, webp, avif); the extension decides, so a script saved as `.png` is refused. */
export function rasterMatches(extension: string, b: Uint8Array): boolean {
  switch (extension) {
    case "png":
      return [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((v, k) => b[k] === v);
    case "jpg":
    case "jpeg":
      return b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;
    case "gif":
      return ascii(b, 0, 4) === "GIF8";
    case "webp":
      return ascii(b, 0, 4) === "RIFF" && ascii(b, 8, 12) === "WEBP";
    case "avif":
      return ascii(b, 4, 8) === "ftyp" && /^(avif|avis)$/.test(ascii(b, 8, 12));
    default:
      return false;
  }
}
