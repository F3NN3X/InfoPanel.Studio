/**
 * SVG template gauges (L9): the user's own SVG, driven by the value through
 * the CSS custom properties `--value` and `--percent` (vector.ts). Browser
 * only (DOMParser).
 *
 * A template is drawn where no script runs (a sandboxed frame without
 * scripts, or an image), so sanitizing is the second line: it drops what
 * could run or reach out anyway (scripts, foreign content, event handlers,
 * references outside the file) and reports what it dropped.
 */
import { MAX_TEMPLATE } from "./vector.ts";

const SVG_NS = "http://www.w3.org/2000/svg";
const DROP = new Set(["script", "foreignobject", "iframe", "object", "embed", "audio", "video", "canvas", "handler", "listener"]);
const ANIMATIONS = new Set(["animate", "set", "animatetransform", "animatemotion"]);
/** In-file references and embedded raster images only. */
const SAFE_REF = /^(#|data:image\/(png|jpeg|gif|webp)[;,])/i;
const DEFAULT_SIZE = 200;

export interface Template {
  /** Sanitized markup, root first, with a viewBox and a numeric width and height. */
  svg: string;
  width: number;
  height: number;
  /** What was dropped, for the user. */
  removed: string[];
}

/** CSS with `@import` and outside `url(...)` removed. */
export function cleanCss(css: string, removed: string[]): string {
  return css
    .replace(/@import[^;]*;?/gi, () => {
      removed.push("@import");
      return "";
    })
    .replace(/url\(\s*(['"]?)(.*?)\1\s*\)/gi, (all, _q, target: string) => {
      if (SAFE_REF.test(target.trim())) return all;
      removed.push(`url(${target.slice(0, 60)})`);
      return "none";
    });
}

/** A length attribute in px (unitless or "px"), else null. */
const px = (v: string | null) => {
  const m = v ? /^\s*([\d.]+)\s*(px)?\s*$/.exec(v) : null;
  const n = m ? Number(m[1]) : NaN;
  return Number.isFinite(n) && n > 0 ? n : null;
};

export function sanitizeTemplate(text: string): Template {
  if (text.length > MAX_TEMPLATE) throw new Error(`The SVG is over ${MAX_TEMPLATE / 1024} KB`);
  const doc = new DOMParser().parseFromString(text, "image/svg+xml");
  if (doc.getElementsByTagName("parsererror").length) throw new Error("Not a well-formed SVG file");
  const root = doc.documentElement;
  if (root.namespaceURI !== SVG_NS || root.localName !== "svg") throw new Error("The file's root element is not <svg>");

  const removed: string[] = [];
  for (const el of [...root.querySelectorAll("*")]) {
    const name = el.localName.toLowerCase();
    const animatesRef = ANIMATIONS.has(name) && /href/i.test(el.getAttribute("attributeName") ?? "");
    if (DROP.has(name) || el.namespaceURI !== SVG_NS || animatesRef) {
      // Removing an ancestor first leaves the descendants detached: counted once.
      if (el.isConnected) removed.push(`<${el.localName}>`);
      el.remove();
    }
  }
  for (const el of [root, ...root.querySelectorAll("*")]) {
    for (const attr of [...el.attributes]) {
      const name = attr.localName.toLowerCase();
      if (name.startsWith("on")) {
        removed.push(`${attr.name} attribute`);
        el.removeAttributeNode(attr);
      } else if (name === "href" && !SAFE_REF.test(attr.value.trim())) {
        removed.push(`link to ${attr.value.slice(0, 60)}`);
        el.removeAttributeNode(attr);
      } else if (/url\(|@import/i.test(attr.value)) {
        attr.value = cleanCss(attr.value, removed);
      }
    }
    if (el.localName === "style") el.textContent = cleanCss(el.textContent ?? "", removed);
  }

  const box = (root.getAttribute("viewBox") ?? "").trim().split(/[\s,]+/).map(Number);
  const hasBox = box.length === 4 && box.every(Number.isFinite) && box[2] > 0 && box[3] > 0;
  const width = Math.round(px(root.getAttribute("width")) ?? (hasBox ? box[2] : DEFAULT_SIZE));
  const height = Math.round(px(root.getAttribute("height")) ?? (hasBox ? box[3] : DEFAULT_SIZE));
  if (!hasBox) root.setAttribute("viewBox", `0 0 ${width} ${height}`);
  root.setAttribute("width", String(width));
  root.setAttribute("height", String(height));
  const svg = new XMLSerializer().serializeToString(root);
  if (svg.length > MAX_TEMPLATE) throw new Error(`The SVG is over ${MAX_TEMPLATE / 1024} KB`);
  return { svg, width, height, removed };
}
