/**
 * The theme-adoption check (`?widget-qa&look=<id>`, `window.__qaAdoption()`): for a widget drawn under a worn Look, the elements
 * whose computed colours are not the Look's (a written-out colour in the widget's markup or CSS: a channel bar in its own green, an
 * LCD in its own ink), the text outside the pack's fonts, and pack decoration on a surface that must stay chrome (the page rail's
 * items). What counts as the Look's: the card's tokens (`--w-*`, `--wp-*`, read where the card sets them), the Look's own colours
 * (look.json t1 / t3 and pack.css, `lookColours`) and any tint or shade of one of them (the same hue, or a neutral of a neutral's
 * lightness). It reads computed styles only, so it finds what reaches the screen whichever file wrote it.
 */

/** A colour in OKLCH with its alpha (l 0-1, c, h in degrees). */
export interface Lch {
  l: number;
  c: number;
  h: number;
  a: number;
}

export interface Flag {
  kind: "colour" | "font" | "frame";
  /** Where: the element by its part, slot or tag. */
  at: string;
  /** The property (`background-color`, `font-family`, `data-pack-decor`). */
  prop: string;
  value: string;
}

const lin = (v: number) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);

/** sRGB (0-1) to OKLCH. */
export function rgbToLch(r: number, g: number, b: number, a = 1): Lch {
  const [R, G, B] = [lin(r), lin(g), lin(b)];
  const l = Math.cbrt(0.4122214708 * R + 0.5363325363 * G + 0.0514459929 * B);
  const m = Math.cbrt(0.2119034982 * R + 0.6806995451 * G + 0.1073969566 * B);
  const s = Math.cbrt(0.0883024619 * R + 0.2817188376 * G + 0.6299787005 * B);
  return labToLch(0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s, 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s, 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s, a);
}

const labToLch = (l: number, A: number, B: number, a: number): Lch => ({ l, c: Math.hypot(A, B), h: ((Math.atan2(B, A) * 180) / Math.PI + 360) % 360, a });

const num = (t: string, scale = 1): number => (t.endsWith("%") ? (Number.parseFloat(t) / 100) * scale : Number.parseFloat(t));

/** One colour function as the browser computes it (`rgb()`, `rgba()`, `oklch()`, `oklab()`, `color(srgb …)`), or a hex. */
export function parseColour(text: string): Lch | undefined {
  const t = text.trim().toLowerCase();
  if (t === "transparent" || t === "none" || t === "") return undefined;
  const hex = /^#([0-9a-f]{3,8})$/.exec(t)?.[1];
  if (hex) {
    const full = hex.length <= 4 ? [...hex].map((x) => x + x).join("") : hex;
    const n = (i: number) => Number.parseInt(full.slice(i, i + 2), 16) / 255;
    return rgbToLch(n(0), n(2), n(4), full.length === 8 ? n(6) : 1);
  }
  const fn = /^(rgba?|oklch|oklab|color)\((.*)\)$/.exec(t);
  if (!fn) return undefined;
  const parts = fn[2].split(/[\s,/]+/).filter(Boolean);
  if (fn[1] === "color") {
    const [space, r, g, b, a] = parts;
    const v = [r, g, b].map((x) => num(x));
    const rgb = space === "srgb-linear" ? v.map((x) => (x <= 0.0031308 ? 12.92 * x : 1.055 * x ** (1 / 2.4) - 0.055)) : v;
    return rgbToLch(rgb[0], rgb[1], rgb[2], a === undefined ? 1 : num(a));
  }
  const alpha = parts[3] === undefined ? 1 : num(parts[3]);
  if (fn[1] === "oklch") return { l: num(parts[0]), c: num(parts[1], 0.4), h: Number.parseFloat(parts[2]) || 0, a: alpha };
  if (fn[1] === "oklab") return labToLch(num(parts[0]), num(parts[1], 0.4), num(parts[2], 0.4), alpha);
  return rgbToLch(num(parts[0], 255) / 255, num(parts[1], 255) / 255, num(parts[2], 255) / 255, alpha);
}

/** Every colour written in a value (a gradient's stops, a shadow's colour). */
export function coloursIn(value: string): string[] {
  return value.match(/(?:rgba?|oklch|oklab|color)\([^()]*\)|#[0-9a-f]{3,8}\b/gi) ?? [];
}

/** Below this alpha a colour is a wash, too faint to read as its own. */
const FAINT = 0.12;
/** Chroma under which a colour reads as a neutral (grey, white, black). */
const NEUTRAL = 0.035;
/** How far round the wheel a tint may sit from its source, degrees. */
const HUE_SPAN = 18;

const hueGap = (a: number, b: number) => Math.min(Math.abs(a - b), 360 - Math.abs(a - b));
const gap = (x: Lch, y: Lch) => {
  const ax = x.c * Math.cos((x.h * Math.PI) / 180), bx = x.c * Math.sin((x.h * Math.PI) / 180);
  const ay = y.c * Math.cos((y.h * Math.PI) / 180), by = y.c * Math.sin((y.h * Math.PI) / 180);
  return Math.hypot(x.l - y.l, ax - ay, bx - by);
};

/**
 * Whether a colour is the Look's: faint enough not to count, close to one of the palette's, a tint or shade of a chromatic one (its
 * hue), or a neutral where the palette has a neutral of about its lightness (a near black is the card's shade on any dark Look).
 */
export function adopted(c: Lch, palette: readonly Lch[]): boolean {
  if (c.a < FAINT) return true;
  if (palette.some((p) => gap(c, p) < 0.06)) return true;
  if (c.c >= NEUTRAL) return palette.some((p) => p.c >= NEUTRAL && hueGap(c.h, p.h) <= HUE_SPAN);
  if (c.l < 0.25) return true;
  return palette.some((p) => p.c < NEUTRAL * 2 && Math.abs(p.l - c.l) < 0.2);
}

/** The card variables a widget's colours come from (the shell, the T3 tokens, the slab treatment). */
export const PALETTE_VARS = [
  "--w-fg", "--w-muted", "--w-faint", "--w-accent", "--w-ok", "--w-warn", "--w-crit", "--w-track", "--w-master", "--w-hero", "--w-fill",
  "--w-s1", "--w-s2", "--w-s3", "--w-s4", "--w-s5", "--w-s6",
  "--wp-slab-ink", "--wp-slab-accent", "--wp-slab-ok", "--wp-slab-warn", "--wp-slab-crit", "--wp-slab-info", "--wp-tone-warn", "--wp-tone-crit",
] as const;

/** The colours a Look writes out itself: its T1 and T3 values and its pack CSS (a `{ref}` is a token the card already carries). */
export function lookColours(look: { t1?: Record<string, Record<string, { value?: string }>>; t3?: Record<string, unknown> } | undefined, css = ""): string[] {
  const t1 = Object.values(look?.t1 ?? {}).flatMap((mode) => Object.values(mode).map((e) => e.value ?? ""));
  const t3 = Object.values(look?.t3 ?? {}).filter((v): v is string => typeof v === "string");
  return [...t1, ...t3, css].flatMap(coloursIn);
}

/** The palette a card draws from: each variable resolved on the card (a probe's colour), its own background and text, and `extra`. */
export function cardPalette(card: Element, extra: readonly string[]): Lch[] {
  const probe = document.createElement("span");
  probe.style.display = "none";
  card.append(probe);
  const out: Lch[] = [];
  for (const v of PALETTE_VARS) {
    probe.style.color = "";
    probe.style.color = `var(${v}, transparent)`;
    const c = parseColour(getComputedStyle(probe).color);
    if (c && c.a > 0) out.push({ ...c, a: 1 });
  }
  probe.remove();
  const own = getComputedStyle(card);
  for (const v of [own.backgroundColor, own.color, ...extra]) {
    const c = parseColour(v);
    if (c && c.a > 0) out.push({ ...c, a: 1 });
  }
  return out;
}

/** An element by its part or slot, else its tag and first class: enough to find it by eye in the frame. */
function nameOf(el: Element): string {
  const part = el.getAttribute("data-part") ?? el.getAttribute("data-slot");
  if (part) return `${el.tagName.toLowerCase()}[${part}]`;
  const cls = typeof el.className === "string" ? el.className.split(/\s+/).find(Boolean) : undefined;
  const parent = el.parentElement?.closest("[data-part], [data-slot]");
  const where = parent ? `${parent.getAttribute("data-part") ?? parent.getAttribute("data-slot")} > ` : "";
  return `${where}${el.tagName.toLowerCase()}${cls ? `.${cls}` : ""}`;
}

const ownText = (el: Element) => [...el.childNodes].some((n) => n.nodeType === Node.TEXT_NODE && n.textContent?.trim());
const firstFamily = (family: string) => family.split(",")[0].trim().replace(/^["']|["']$/g, "");

/** Icon fonts and an element that keeps its own colours on purpose (a user image, art, a colour the user picked: `data-qa-own-colour`). */
const SKIP = "img, video, canvas, iframe, [data-qa-own-colour], [data-qa-own-colour] *";

export interface CheckOptions {
  /** Colours the Look writes out (`lookColours`). */
  colours: readonly string[];
  /** The pack's font families; none: the fonts are not checked (a Look without fonts of its own draws the app's). */
  fonts: readonly string[];
  /** The root is chrome (the page rail): pack decoration on any of its items (`data-rail-slot`) is flagged. */
  chrome?: boolean;
}

/** What one frame (a zone box or a surface) draws that is not the Look's. */
export function checkAdoption(root: Element, o: CheckOptions): Flag[] {
  const flags = new Map<string, Flag>();
  const add = (f: Flag) => flags.set(`${f.kind}|${f.at}|${f.prop}|${f.value}`, f);
  const palettes = new Map<Element, Lch[]>();
  // the tokens where they are set: the card, or a part of it that sets its own (the ink over cover art, an OSD's panel)
  const paletteOf = (el: Element): Lch[] => {
    const card = el.closest('[style*="--w-fg"], [data-wp-tier]') ?? root;
    let p = palettes.get(card);
    if (!p) palettes.set(card, (p = cardPalette(card, o.colours)));
    return p;
  };
  const fonts = new Set(o.fonts.map((f) => f.toLowerCase()));
  // a widget in a rail slot draws on the rail: a card edge (the material's line or a border) frames it as a card on the page
  if (o.chrome)
    for (const card of root.querySelectorAll("[data-rail-slot] [data-wp-tier]")) {
      const s = getComputedStyle(card);
      if (s.boxShadow !== "none") add({ kind: "frame", at: nameOf(card), prop: "box-shadow", value: s.boxShadow });
      if (Number.parseFloat(s.borderTopWidth) > 0 && s.borderTopStyle !== "none") add({ kind: "frame", at: nameOf(card), prop: "border", value: `${s.borderTopWidth} ${s.borderTopColor}` });
    }
  for (const el of root.querySelectorAll("*")) {
    if (o.chrome && el.hasAttribute("data-pack-decor") && el.closest("[data-rail-slot]")) add({ kind: "frame", at: nameOf(el.parentElement ?? el), prop: "data-pack-decor", value: el.getAttribute("data-pack-decor") ?? "" });
    if (el.closest(SKIP) || el.closest("[data-pack-decor]")) continue;
    const s = getComputedStyle(el);
    if (s.display === "none" || s.visibility === "hidden") continue;
    const palette = paletteOf(el);
    const check = (prop: string, value: string) => {
      for (const text of coloursIn(value)) {
        const c = parseColour(text);
        if (c && !adopted(c, palette)) add({ kind: "colour", at: nameOf(el), prop, value: text });
      }
    };
    const text = ownText(el);
    if (text) check("color", s.color);
    check("background-color", s.backgroundColor);
    if (s.backgroundImage !== "none") check("background-image", s.backgroundImage);
    for (const side of ["Top", "Right", "Bottom", "Left"] as const) if (Number.parseFloat(s[`border${side}Width`]) > 0 && s[`border${side}Style`] !== "none") check("border-color", s[`border${side}Color`]);
    if (el instanceof SVGElement) {
      if (s.fill !== "none") check("fill", s.fill);
      if (s.stroke !== "none") check("stroke", s.stroke);
    }
    if (text && fonts.size > 0) {
      const family = firstFamily(s.fontFamily);
      if (!/material symbols/i.test(family) && !fonts.has(family.toLowerCase())) add({ kind: "font", at: nameOf(el), prop: "font-family", value: family });
    }
  }
  return [...flags.values()];
}

/** The QA page's frames the check reads, and what each is: a widget's span, view or layout, or a surface. */
export const ADOPTION_SELECTOR = "figure[data-qa-module], figure[data-qa-view], figure[data-qa-layout], [data-qa-surface]";

export interface FrameFlags {
  /** `<module> <span>`, `<module> view:<id>`, `<module> layout:<id>` or `surface:<name>`. */
  frame: string;
  flags: Flag[];
}

const frameName = (fig: Element): string => {
  const surface = fig.getAttribute("data-qa-surface");
  if (surface) return `surface:${surface}`;
  const view = fig.getAttribute("data-qa-view");
  if (view) return `${fig.getAttribute("data-qa-view-of")} view:${view}`;
  const layout = fig.getAttribute("data-qa-layout");
  if (layout) return `${fig.getAttribute("data-qa-layout-of")} layout:${layout}`;
  return `${fig.getAttribute("data-qa-module")} ${fig.getAttribute("data-qa-span")}`;
};

/** Every frame on the page with what it flags (none: an empty list); `only`: the frames whose name starts with it (`surface:rail`). */
export function adoptionReport(o: Omit<CheckOptions, "chrome">, only = ""): FrameFlags[] {
  return [...document.querySelectorAll(ADOPTION_SELECTOR)].filter((fig) => frameName(fig).startsWith(only)).map((fig) => {
    const root = fig.querySelector("[data-qa-box]") ?? fig;
    return { frame: frameName(fig), flags: checkAdoption(root, { ...o, chrome: fig.hasAttribute("data-qa-chrome") }) };
  });
}

/** The report as text: a line per flagged frame, then its flags, worst (most) first. */
export function adoptionText(report: readonly FrameFlags[]): string {
  const flagged = report.filter((r) => r.flags.length > 0).sort((a, b) => b.flags.length - a.flags.length);
  const lines = flagged.flatMap((r) => [`${r.frame}: ${r.flags.length}`, ...r.flags.map((f) => `  ${f.kind} ${f.prop} ${f.value} at ${f.at}`)]);
  return [`${flagged.length} of ${report.length} frames flagged`, ...lines].join("\n");
}
