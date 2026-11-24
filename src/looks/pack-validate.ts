// The pack validator (P12a): a theme pack as files in, a list of issues out. The loader (pack-load.ts) refuses a built pack
// whole; this reads the files a pack author or an importer holds (`pack.json`, `look.json`, `pack.css`, `icons.json`, the file
// list with sizes and bytes) before anything is built, and says which rule each problem breaks. An `error` refuses the pack;
// a `warn` is advice. It reuses the loader's readers (`packCssIssues`, `lintPackCss`, `stageIssues`, `iconSetIssues`) and adds
// the rules they cannot see from a built pack: the asset list against the files, fonts and licence, contrast per card,
// burn-in luminance, ornament and chamfer sizes, CSS paint that hides content (L71) and a user pack's CSS grammar (L94).
//
// Where it runs: the studio (lazy chunk, when a pack is imported) and `tools/validate-pack.mjs` (pack authors, `npm run verify`
// reads the built-in packs through the tests). The server (Rust) does not run it; the server half, for P12b to build, is the
// path-safety check on `GET /api/packs/<id>/<file>` (`isPackRelativeUrl`'s rules) and the size caps (a file, a pack: `PACK_CEILING_BYTES`).
import { safeFill } from "@/widgets/core/t3-tokens";
import { parseCss, type Rule, type Token, tokenize, writeTokens } from "./css-syntax";
import { BLUR_MAX as STAGE_BLUR_MAX, OVERLAY_MAX } from "./effects";
import { iconSetIssues } from "./icon-set";
import { LOOK_IDS } from "./ids";
import { PACK_FONT_FAMILIES } from "./pack-fonts";
import { resolveT1, resolveVariant, VARIANT_ALPHA, VARIANT_COLOURS, type Look, type T1Name, T1_NAMES, type VariantDerive } from "./look";
import lookSchema from "./look.schema.json";
import { motionIssues } from "./motion";
import { SCRIPT_MAX_BYTES } from "./pack-script/limits";
import { MAX_LAYERS, NUMERAL_MIN, numeralIssues, stageIssues } from "./pack-checks";
import { FLASH_MAX, FRAME_ALPHA_MIN, FRAME_SIZE_MAX, FRAME_SPINE_MAX, FRAME_STROKE_MAX, FRAME_TAB_HEIGHT_MAX, FRAME_TAB_WIDTH_MAX, FX_KINDS, ORNAMENT_MAX, ORNAMENT_TEXT_MAX, ORNAMENTS_MAX, TEXT_ORNAMENTS, type PackJson } from "./pack-json";
import { commaParts, lintPackCss, OPACITY_FLOOR } from "./pack-css";
import { INJECTION, jsonShapeIssues, jsonStrings, PROSE_PATHS, rasterMatches, STYLE_BREAKERS, svgAnimated, svgIssue, svgPaints, svgStill, TOKEN_KEY, withoutAliases } from "./pack-safety";
import packSchema from "./pack.schema.json";
import { cssUrls, isPackRelativeUrl, packCssIssues, packPath } from "./pack-urls";
import { schemaErrors } from "./schema-check";
import { userCssIssues } from "./user-css";
import { type Colour, flatOver, isOklch, over, parseColour } from "./colour";
import { contrastOf } from "./status";

export { parseColour };
/** A colour the pack's own CSS, a T3 literal or an SVG writes is read as a literal only: `oklch()` is a T1/T0 token (written as its clamped hex), and here it would be drawn as the browser maps it, not as checked. */
const parseLiteral = (value: string): Colour | undefined => (isOklch(value) ? undefined : parseColour(value));
import { T3_TOKENS } from "./t3";

export interface PackFile {
  /** Relative to the pack folder, `/` separated (`assets/hazard.svg`). */
  path: string;
  /** What the importer says the file holds; it must be a whole number and equal the bytes (the bytes decide). */
  size: number;
  /** Every content check (an SVG's markup, a font's signature, a licence's text, a layer's colours) reads these: a file without them is refused. */
  bytes?: Uint8Array;
}

/** A pack as its author holds it. `pack`, `look` and `icons` are the parsed JSON (unknown: they come from outside). */
export interface PackSource {
  pack: unknown;
  look: unknown;
  css?: string;
  icons?: unknown;
  /** Every file in the folder, the JSON files and the CSS included. */
  files: PackFile[];
}

export interface PackOptions {
  /**
   * `user` (the default) is a pack someone brought: level 1 and 2 of the spec, tokens, values, assets, an icon map and fonts, and a
   * `pack.css` only inside the grammar of `user-css.ts` (rule `user-css`); the render check and the signature that let one be worn
   * are the importer's and the server's. `builtin` is one of ours, whose CSS is read by the CSS rules and then checked in the
   * browser (`pack-visibility`, `pack-selectors`, `pack-faces`).
   */
  source?: "builtin" | "user";
  /**
   * Where a pack's `script` file is: `files` (the default) among the files given, its bytes checked here (an import); `route` with the
   * server, which serves it only by the pack's trust (`GET /api/packs/<id>/fx.js`), so a pack read back from the route lists it and
   * holds no bytes for it.
   */
  script?: "files" | "route";
}

export interface PackIssue {
  rule: string;
  severity: "error" | "warn";
  /** The file the issue is in (`pack.json`, `pack.css`, `assets/x.svg`), or "" for the pack as a whole. */
  file: string;
  message: string;
}

/** The font families of the built-in packs (generated into pack-fonts.ts from their pack.json files): a user pack may not claim one. */
export const BUILTIN_FONT_FAMILIES: ReadonlySet<string> = new Set(PACK_FONT_FAMILIES);

/** The size cap of a pack folder: `packCeilingBytes` of the `packs` block in tools/perf/budgets.json (a test pins them equal). */
export const PACK_CEILING_BYTES = 1_024_000;
/** An ornament is at most this many px and stays inside the card's padding (spec 03, rules for every slot). */
export { ORNAMENT_MAX } from "./pack-json";
/** A pack folder holds at most this many files, and no file is over `FILE_MAX_BYTES`. */
export const FILE_COUNT_MAX = 64;
export const FILE_MAX_BYTES = 256_000;
/** At most this many effects animate at the `full` FX level. */
export const MAX_ANIMATED = 2;
/** A chamfer cuts at most this many px (twice the smallest card padding). */
export const CHAMFER_MAX = FRAME_SIZE_MAX;
/** Body text, muted text and status text hold this on the card (D13); gradient numerals hold 3:1 (`NUMERAL_MIN`). */
export const TEXT_MIN = 4.5;
/** A layer this bright (relative luminance, times its opacity) is not `static-safe` on an always-on panel. */
export const BRIGHT_LAYER = 0.4;
/** Text the pack colours must show against what is behind it at least this much, or it is hidden. */
const HIDDEN_TEXT_MIN = 3;

const ASSET_TYPES = /\.(png|jpe?g|webp|avif|gif|svg|woff2)$/i;
const LICENCE_FILE = /^(OFL\.txt|LICENSE\.txt|LICENCE\.txt|LICENSE|OFL)$/;
const ROOT_FILES = /^(pack\.json|look\.json|pack\.css|icons\.json|LOOK\.md|README(\.md)?|thumb\.(avif|png|webp|jpe?g)|OFL\.txt|LICENSE\.txt|LICENCE\.txt|LICENSE|OFL)$/;
/** A path no file system or server should be asked for: a hidden file, a Windows device name, a trailing dot or space. */
const ODD_PATH = /(^|\/)\.|(^|\/)(con|prn|aux|nul|com\d|lpt\d)(\.|\/|$)|[. ]$/i;
const TEXT_PAIRS = ["fg", "fg-2", "muted", "ok", "warn", "crit", "accent", "info"] as const;

const issue = (rule: string, file: string, message: string, severity: PackIssue["severity"] = "error"): PackIssue => ({ rule, severity, file, message });
const text = (b: Uint8Array) => new TextDecoder().decode(b);

/** The rule a URL breaks: the scheme it names, or `path` when it leaves the folder some other way. */
function urlRule(url: string): string {
  const u = url.trim().toLowerCase();
  if (/^(javascript|vbscript):/.test(u)) return "script-url";
  if (/^[a-z]:[\\/]/.test(u)) return "path";
  if (u.startsWith("data:")) return "data-url";
  if (/^([a-z][a-z0-9+.-]*:|\/\/)/.test(u)) return "remote-url";
  return "path";
}

// ---- colours ----------------------------------------------------------------------------------------------------------

/** A colour that is opaque and readable: its `#rrggbb`, else undefined. */
const opaqueHex = (value: string): string | undefined => {
  const c = parseColour(value);
  return c?.hex && c.alpha >= 1 ? c.hex : undefined;
};


/** Relative luminance of a `#rrggbb` (contrast against black, inverted: reuses the one colour maths of status.ts). */
const luminance = (hex: string): number => ((contrastOf(hex, "#000000") ?? 1) - 1) * 0.05;

/** Luminance times alpha of one colour as written (transparent: 0), or undefined when it cannot be read. */
function paintLuminance(value: string): number | undefined {
  const c = parseColour(value);
  return c ? (c.hex ? luminance(c.hex) * c.alpha : 0) : undefined;
}

const COLOUR_LITERAL = /#[\da-f]{8}\b|#[\da-f]{6}\b|#[\da-f]{3,4}\b|(?:rgba?|hsla?)\([^)]*\)|\btransparent\b/gi;
const GRADIENT_WORDS = /\b(to|top|bottom|left|right|center|at|circle|ellipse|closest-side|farthest-side|closest-corner|farthest-corner|in|from)\b/gi;

/** The colours of a CSS fill (a colour or gradients, layers comma-separated) as written, `var(--w-name)` read through `vars`; undefined when it holds none, or anything that is not a colour literal, a var of `vars` or a gradient keyword (a name, `oklch()`, `color-mix()`). */
function fillStops(css: string, vars: Record<string, string> = {}): Colour[] | undefined {
  const text = css.replace(/var\(--w-([\w-]+)\)/gi, (m, n: string) => (Object.hasOwn(vars, n) ? vars[n] : m));
  const found = text.match(COLOUR_LITERAL) ?? [];
  const rest = text
    .replace(COLOUR_LITERAL, " ")
    .replace(/(repeating-)?(linear|radial|conic)-gradient\(/gi, " ")
    .replace(/-?\d*\.?\d+(deg|grad|rad|turn|px|%)?/gi, " ")
    .replace(GRADIENT_WORDS, " ");
  if (!found.length || /[a-z]/i.test(rest)) return undefined;
  const stops = found.map(parseColour);
  return stops.some((c) => c === undefined) ? undefined : (stops as Colour[]);
}

/** A colour laid over `under` at its alpha times `opacity`, as `#rrggbb`; transparent leaves `under`. */
const flatOn = (c: Colour, under: string, opacity = 1): string => (c.hex ? over(c.hex, c.alpha * opacity, under) : under);

/** The brightest stop of a CSS fill, each times its alpha; undefined when `fillStops` cannot read it. */
function fillBrightness(css: string): number | undefined {
  const stops = fillStops(css);
  return stops && Math.max(0, ...stops.map((c) => (c.hex ? luminance(c.hex) * c.alpha : 0)));
}

/** The brightest paint of an SVG (the default fill, black, counts as 0); undefined when a paint is not a colour literal. */
function svgBrightness(source: string): number | undefined {
  const lums = svgPaints(source).map(paintLuminance);
  return lums.some((l) => l === undefined) ? undefined : Math.max(0, ...(lums as number[]));
}

// ---- pack.css (built-in packs; a user pack's is user-css.ts) --------------------------------------------------------------------

/** Declarations that move, turn or resize a box; the card is never rotated (spec 03, Layout). */
const ROTATION = /^(transform(-origin|-box|-style)?|rotate|scale|translate|perspective(-origin)?|offset-rotate|zoom|writing-mode)$/;
/** What a rule that reaches every element may paint: anything that compounds or covers is refused. */
const UNIVERSAL_OK = /^(font-family|font-feature-settings|color|text-shadow|caret-color|accent-color|text-decoration(-color|-style)?)$/;
const BG = /^background(-color)?$/;
/** Values that carry the surrounding colour instead of naming one. */
const KEEP = /^(currentcolor|inherit|initial|unset|revert|revert-layer)$/i;
/** A fill or stroke this close to the card's colour (contrast) is not seen. */
const SAME_AS_CARD = 1.2;
/** Filters, backdrop filters and blend modes a pack's CSS declares, in all (each is a compositing layer). */
const COMPOSITING_MAX = 4;
const COMPOSITING = /^(filter|backdrop-filter|-webkit-backdrop-filter|mix-blend-mode)$/;

/** The pack CSS's own rule for each message the loader's readers give. */
function cssRule(message: string): string {
  if (message === "@import") return "import";
  if (message.startsWith("url ")) return urlRule(message.slice(4));
  if (message.includes("!important")) return "no-important";
  const prop = /property ([\w-]+) is not a paint property/.exec(message)?.[1];
  if (prop) return ROTATION.test(prop) ? "no-rotation" : "paint-only";
  if (/reaches over|recolours|is over \d+ px|repeats runs/.test(message)) return "paint-cap";
  if (/hides or blurs|opacity|stroke-width/.test(message)) return "hides-content";
  if (message.includes("reaches outside") || message.includes("names a pseudo-element")) return "selector";
  if (message.includes("must start with pack-")) return "font-face";
  if (message.includes("nested too deep")) return "css-syntax";
  if (/^(at-rule|keyframe|@keyframes)/.test(message)) return "paint-only";
  return "css-syntax";
}

interface Styled {
  rule: Rule;
  /** A keyframe's frame, which has no selector of its own. */
  frame: boolean;
}

/** Every style rule with its declarations, media and supports blocks flattened, and the frames of keyframes (a frame paints too); font faces are left out. */
function styledRules(rules: Rule[]): Styled[] {
  return rules.flatMap((r): Styled[] =>
    r.at === undefined ? [{ rule: r, frame: false }] : r.at === "media" || r.at === "supports" ? styledRules(r.rules ?? []) : r.at === "keyframes" ? (r.rules ?? []).map((f) => ({ rule: f, frame: true })) : []
  );
}

/**
 * Whether a selector can match more than the pack's own named parts: a `*`, a bare type (`div`, `svg`), `[class]` or any
 * attribute without a value, `:not()`, `:is()`, `:where()`, `:has()`, `:scope`. A part is named by a class, an id or an
 * attribute with a value (`[data-part="num"]`).
 */
function broadSelector(prelude: Token[]): boolean {
  return commaParts(prelude).some((part) => {
    let named = false;
    for (let k = 0; k < part.length; k++) {
      const t = part[k];
      if (t.t === "delim" && t.v === "*") return true;
      if (t.t === "delim" && t.v === "." && part[k + 1]?.t === "ident") named = true;
      if (t.t === "hash") named = true;
      if ((t.t === "ident" || t.t === "function") && part[k - 1]?.t === ":" && /^(not|is|where|has|scope|matches|-webkit-any|-moz-any)$/i.test(t.v)) return true;
      if (t.t === "[") {
        let end = k + 1;
        while (end < part.length && part[end].t !== "]") end++;
        if (part.slice(k, end).some((x) => x.t === "delim" && x.v === "=")) named = true;
        else return true;
      }
    }
    return !named;
  });
}

/** The rules of pack CSS that hide content with paint the lint (`lintPackCss`) reads one declaration at a time (L68, L71). `cards` are the cards' colours, `texts` the Look's text colours. */
function hiddenPaintIssues(css: string, cards: string[], texts: string[]): PackIssue[] {
  const out: PackIssue[] = [];
  const all = styledRules(parseCss(css, []));
  const literals = (v: string) => (v.match(COLOUR_LITERAL) ?? []).flatMap((c) => parseColour(c)?.hex ?? []);
  const bgs = all.flatMap(({ rule }) => (rule.declarations ?? []).filter((d) => BG.test(d.name)).flatMap((d) => literals(writeTokens(d.value))));
  let opacity = 1;
  let compositing = 0;
  for (const { rule, frame } of all) {
    const selector = frame ? `keyframe ${writeTokens(rule.prelude)}` : writeTokens(rule.prelude);
    const universal = !frame && broadSelector(rule.prelude);
    const decls = rule.declarations ?? [];
    const own = decls.filter((d) => BG.test(d.name)).flatMap((d) => literals(writeTokens(d.value)));
    const ownText = decls.some((d) => d.name === "color" || d.name === "-webkit-text-fill-color");
    for (const { name, value } of decls) {
      const v = writeTokens(value);
      const where = `"${selector.slice(0, 30)}"`;
      if (universal && !UNIVERSAL_OK.test(name)) out.push(issue("universal", "pack.css", `${name} on ${where} can reach every element of a card: a rule that does may set only text colour, font and text shadow`));
      if (COMPOSITING.test(name)) compositing++;
      if (/^(fill-|stroke-)?opacity$/.test(name) || (name === "filter" && /opacity\(/i.test(v))) {
        if (universal) out.push(issue("opacity-compound", "pack.css", `${name} on ${where} compounds down every element`));
        const a = parseFloat(/opacity\(([^)]*)\)/i.exec(v)?.[1] ?? v);
        if (Number.isFinite(a)) opacity *= Math.min(1, a);
      }
      if (name === "color" || name === "-webkit-text-fill-color") {
        const c = parseLiteral(v);
        if (KEEP.test(v)) continue;
        if (!c) out.push(issue("hidden-text", "pack.css", `${name} ${v} cannot be read as a colour: use #rgb, #rrggbb, rgb() or hsl()`));
        else if (c.alpha < OPACITY_FLOOR) out.push(issue("hidden-text", "pack.css", `${name} ${v} is transparent text`));
        else if (c.hex) {
          const behind = own.length ? own : [...bgs, ...cards];
          if (behind.length && !behind.some((b) => (contrastOf(c.hex!, b) ?? HIDDEN_TEXT_MIN) >= HIDDEN_TEXT_MIN)) out.push(issue("hidden-text", "pack.css", `${name} ${v} is under ${HIDDEN_TEXT_MIN}:1 on what is behind it`));
        }
      }
      if (name === "fill" || name === "stroke") {
        const c = parseLiteral(v);
        if (KEEP.test(v) || /^url\(/i.test(v)) continue;
        if (/^none$/i.test(v)) out.push(issue("hidden-gauge", "pack.css", `${name}: ${v} on ${where} paints a gauge, mark, text or icon away`));
        else if (!c) out.push(issue("hidden-gauge", "pack.css", `${name} ${v} cannot be read as a colour: use #rgb, #rrggbb, rgb() or hsl()`));
        else if (c.alpha < OPACITY_FLOOR) out.push(issue("hidden-gauge", "pack.css", `${name}: ${v} on ${where} paints a gauge, mark, text or icon away`));
        else if (c.hex && cards.some((card) => (contrastOf(c.hex!, card) ?? 99) < SAME_AS_CARD)) out.push(issue("hidden-gauge", "pack.css", `${name} ${v} on ${where} is the colour of the card it is on`));
      }
      if (BG.test(name) && !KEEP.test(v) && !/^none$/i.test(v)) {
        const c = parseLiteral(v);
        if (!c && !/url\(|gradient\(/i.test(v)) out.push(issue("hidden-text", "pack.css", `${name} ${v} cannot be read as a colour: use #rgb, #rrggbb, rgb() or hsl()`));
        else if (c?.hex && c.alpha >= OPACITY_FLOOR && !ownText) {
          const hidden = texts.find((t) => (contrastOf(c.hex!, t) ?? 99) < HIDDEN_TEXT_MIN);
          if (hidden) out.push(issue("hidden-text", "pack.css", `${name} ${v} on ${where} is under ${HIDDEN_TEXT_MIN}:1 against the text colour ${hidden}`));
        }
      }
    }
  }
  if (compositing > COMPOSITING_MAX) out.push(issue("paint-cap", "pack.css", `${compositing} filter, backdrop-filter and blend declarations, at most ${COMPOSITING_MAX}: each is a compositing layer`));
  if (opacity < OPACITY_FLOOR) out.push(issue("opacity-compound", "pack.css", `the opacities of the rules multiply to ${opacity.toFixed(2)}, under ${OPACITY_FLOOR}`));
  return out;
}

// ---- the Look ---------------------------------------------------------------------------------------------------------

const ALIAS = /^\{([\w.-]+)\}$/;
/** A T1 or T0 value: a colour literal or an alias. */
const colourOrAlias = (v: string) => ALIAS.test(v) || parseColour(v) !== undefined;
/** The corner radius: a length up to 64 px. */
const RADIUS = /^(0|\d+(\.\d+)?(px|rem|em))$/;
const BLUR = /^\d+(\.\d+)?px$/;
const BLUR_MAX = 64;
/** T3 values that are plain words, numbers, aliases and the operators between them (`soft`, `0.32 > 0.06 > 0`, `{faint} / 22%`): no parenthesis, no quote. */
const SIMPLE = /^[\w\s.%/>{}+,-]*$/;
const CUBIC = /^cubic-bezier\(\s*[\d.\s,-]+\)$/;
const MOTION = new Set(["motion-fast", "motion-base", "motion-data"]);
/** A glide lasts 2 s at most and 50 ms at least: a shorter time is a flicker (WCAG 2.3.1: no more than 3 flashes a second; no T3 token repeats, so a bounded time is the whole rule). */
const MOTION_MAX_MS = 2000;
const MOTION_MIN_MS = 50;
/** A card under this opaque over a stage layer whose colours cannot be known (a raster) is refused: the text on it could be on anything. */
export const RASTER_ALPHA_MIN = 0.85;
/** Lengths a mark is drawn with, in px (a number, or a number and `px`): [least, most]. A width or stroke is never nothing (M-3); a gap may be 0. */
const LENGTH_T3: Record<string, readonly [number, number]> = {
  "ring-width": [0.5, 64], "icon-stroke": [0.5, 64], "threshold-width": [0.5, 64], "range-height": [0.5, 64], "series-stroke": [0.5, 8], "ring-gap": [0, 64], "meter-gap": [0, 64],
};
const COUNT_T3: Record<string, readonly [number, number]> = { "meter-segments": [2, 64], "num-weight": [100, 900], "hero-weight": [100, 900] };
const WEIGHT_WORDS = new Set(["normal", "bold"]);
/** `num-tracking` is `normal`, 0 or a number of em within this either way (a wider gap pushes a numeral out of its card). */
const TRACKING_MAX_EM = 0.5;
const PLAIN_NUMBER = /^(-?\d+(?:\.\d+)?)$/;

/** What is wrong with the value of a length, count, weight or tracking token, or undefined (also for a token not in these tables). */
function rangeIssue(name: string, v: string | number): string | undefined {
  const length = LENGTH_T3[name];
  const count = COUNT_T3[name];
  if (length || count) {
    const [least, most] = (length ?? count)!;
    const s = String(v).trim();
    if (typeof v === "string" && WEIGHT_WORDS.has(s) && name.endsWith("weight")) return undefined;
    const m = (length ? /^(-?\d+(?:\.\d+)?)(px)?$/ : PLAIN_NUMBER).exec(s);
    const n = m ? Number(m[1]) : Number.NaN;
    if (!(n >= least && n <= most) || (name === "meter-segments" && !Number.isInteger(n))) return `t3 ${name} ${s.slice(0, 20)}: ${count ? "a number" : "a length in px"} from ${least} to ${most}`;
    return undefined;
  }
  if (name === "num-tracking") {
    const m = /^(-?\d+(?:\.\d+)?)em$/.exec(String(v).trim());
    return v === "normal" || v === 0 || (m && Math.abs(Number(m[1])) <= TRACKING_MAX_EM) ? undefined : `t3 num-tracking ${String(v).slice(0, 20)}: normal, or a number of em within ${TRACKING_MAX_EM}`;
  }
  if (name === "series-fill-alpha") {
    const parts = String(v).split(">").map((p) => p.trim());
    return parts.length === 3 && parts.every((p) => PLAIN_NUMBER.test(p) && Number(p) >= 0 && Number(p) <= 1) ? undefined : `t3 series-fill-alpha ${String(v).slice(0, 20)}: three numbers from 0 to 1 joined by >`;
  }
  return undefined;
}
/** T3 names that colour text: held to 4.5:1 on the surface when they resolve to a T1 colour. */
const TEXT_T3 = new Set(["status-ok", "status-warn", "status-crit", "info", "unit-color", "label-color", "header-color", "axis-label"]);
/** T3 names that colour a mark (a series, a meter zone, an icon): held to 3:1. */
const MARK_T3 = new Set(["series-1", "series-2", "series-3", "series-4", "series-5", "series-6", "meter-ok", "meter-warn", "meter-clip", "threshold-line", "spike-marker", "icon-color", "toggle-on", "live-indicator", "fader-fill", "range-fill", "mute-active", "solo-active", "focus-outline"]);
const OTHER_COLOUR_T3 = new Set(["meter-track", "meter-hold", "range-track", "range-highlight", "fader-track", "fader-knob", "icon-muted", "ring-track", "track", "num-glow-color", "accent-ink", "idle", "mute"]);
/** T3 names that take a gradient or colour fill (`safeFill`); the numeral, ring and spark fills' stops are also read by `numeralIssues`. */
const FILL_T3 = new Set(["border-fill", "header-fill", "num-fill", "ring-fill", "spark-fill", "bar-fill"]);

const T3_NAMES = new Set<string>(T3_TOKENS);
/** Header styles that paint the fill as a band under small text rather than as the title's own colour: the text is held to 4.5:1 on it. */
const BAND_HEADERS = new Set(["tab-label", "label-bar"]);

type Resolved = { value: string } | { error: string };

/** A T3 colour value read through its aliases down to a literal: a T1 name gives its value in the mode, another T3 token its own value. A loop, a token the Look does not set (or sets to `""`, a number or a shell name such as `faint` or `mat.fill`) is an error: nothing there can be read, so nothing is assumed. */
function resolveAlias(value: string, t3: Record<string, string | number>, t1: Record<string, string>, trail: string[]): Resolved {
  const alias = ALIAS.exec(value)?.[1];
  if (alias === undefined) return { value };
  if ((T1_NAMES as readonly string[]).includes(alias)) return { value: t1[alias] };
  if (trail.includes(alias)) return { error: `the aliases ${[...trail, alias].map((n) => `{${n}}`).join(" > ")} loop` };
  const next = Object.hasOwn(t3, alias) ? t3[alias] : undefined;
  if (typeof next !== "string" || next === "") return { error: `{${alias}} is not a T1 name or a T3 colour this theme sets${alias === "faint" || alias === "track" ? " (the shell's faint and track follow the material's tone: write a colour)" : ""}` };
  return resolveAlias(next, t3, t1, [...trail, alias]);
}

/** The lowest contrast of a colour (alpha laid over each card) against the cards, or undefined when it cannot be read. */
function worstContrast(c: Colour | undefined, cards: string[]): { ratio: number; card: string } | undefined {
  if (!c || (!c.hex && c.alpha > 0)) return undefined;
  let worst: { ratio: number; card: string } | undefined;
  for (const card of cards) {
    const ratio = contrastOf(flatOn(c, card), card);
    if (ratio === undefined) return undefined;
    if (!worst || ratio < worst.ratio) worst = { ratio, card };
  }
  return worst;
}

/** The T3 values: every name known, every value a plain word, a number, an alias, a colour literal or a gradient `safeFill` reads, lengths and times capped, aliases resolved, colour tokens that hold text and the header's fill held to contrast on every card the Look is drawn on. */
function t3Issues(look: Look, t1: Record<T1Name, string>, mode: string, cards: string[]): PackIssue[] {
  const out: PackIssue[] = [];
  const bad = (rule: string, message: string) => out.push(issue(rule, "look.json", message));
  const t3 = look.t3 ?? {};
  for (const [name, v] of Object.entries(t3)) {
    if (!T3_NAMES.has(name)) {
      bad("t3", `t3 ${name} is not a T3 name`);
      continue;
    }
    const range = rangeIssue(name, v);
    if (range) {
      bad("t3", range);
      continue;
    }
    if (typeof v === "number") {
      if (!Number.isFinite(v) || Math.abs(v) > 1000 || MOTION.has(name)) bad("t3", `t3 ${name} ${v} is out of range${MOTION.has(name) ? " (a time is written with ms or s)" : ""}`);
      continue;
    }
    if (FILL_T3.has(name)) {
      if (v !== "solid" && v !== "none" && safeFill(v) === undefined) bad("t3", `t3 ${name} is not a colour or a gradient of colours`);
      else if (v !== "solid" && v !== "none" && (name === "header-fill" || name === "border-fill")) {
        const stops = fillStops(v, t1);
        if (!stops) bad(name === "header-fill" ? "contrast" : "t3", `${mode} t3 ${name} cannot be checked: use hex colours, rgb(), hsl() or var(--w-*) of a T1 colour`);
        else if (name === "border-fill") {
          if (stops.some((c) => c.alpha < OPACITY_FLOOR)) bad("t3", `${mode} t3 border-fill has a stop under ${OPACITY_FLOOR} opaque: the border would not be drawn`);
          else {
            const lost = cards.find((card) => stops.every((c) => (contrastOf(flatOn(c, card), card) ?? SAME_AS_CARD) < SAME_AS_CARD));
            if (lost) out.push(issue("t3", "look.json", `${mode} t3 border-fill is the colour of the card ${lost}: the border is not seen there`, "warn"));
          }
        }
        else {
          // the title is painted in this fill (bg-clip: text): each stop over each card is text on it
          const worst = stops.map((c) => worstContrast(c, cards)).sort((x, y) => (x?.ratio ?? 0) - (y?.ratio ?? 0))[0];
          if (!worst) bad("contrast", `${mode} t3 header-fill cannot be checked`);
          else if (worst.ratio < (BAND_HEADERS.has(String(t3["header-style"])) ? TEXT_MIN : NUMERAL_MIN)) bad("contrast", `${mode} t3 header-fill is ${worst.ratio.toFixed(2)}:1 on the card ${worst.card}, under ${BAND_HEADERS.has(String(t3["header-style"])) ? TEXT_MIN : NUMERAL_MIN}:1`);
        }
      }
      continue;
    }
    // `none` is Classic's focus-outline: no ring beyond the browser's own, and no colour to read
    const colour = (TEXT_T3.has(name) || MARK_T3.has(name) || OTHER_COLOUR_T3.has(name)) && !(name === "focus-outline" && v === "none");
    if (colour && v !== "" && !ALIAS.test(v) && !parseLiteral(v) && !/^var\(--w-[\w-]+\)$/.test(v)) bad("t3", `t3 ${name} ${v} cannot be read as a colour: use #rgb, #rrggbb, rgb(), hsl() or an alias`);
    else if (!colour && !SIMPLE.test(v) && !CUBIC.test(v)) bad("t3", `t3 ${name} ${v.slice(0, 40)} is not a plain value`);
    if (MOTION.has(name)) {
      const m = /^(\d+(?:\.\d+)?)(ms|s)$/.exec(v);
      const ms = m ? Number(m[1]) * (m[2] === "s" ? 1000 : 1) : Number.NaN;
      if (!(ms >= MOTION_MIN_MS && ms <= MOTION_MAX_MS)) bad("t3", `t3 ${name} ${v.slice(0, 20)}: one time, ${MOTION_MIN_MS} to ${MOTION_MAX_MS} ms (a number and ms or s)`);
    }
    if (colour && v !== "") {
      const r = resolveAlias(v, t3, t1, [name]);
      if ("error" in r) {
        bad("contrast", `${mode} t3 ${name} ${v}: ${r.error}`);
        continue;
      }
      if (!TEXT_T3.has(name) && !MARK_T3.has(name)) continue;
      const min = TEXT_T3.has(name) ? TEXT_MIN : NUMERAL_MIN;
      const worst = worstContrast(parseColour(r.value), cards);
      if (!worst) bad("contrast", `${mode} t3 ${name} ${v} cannot be checked: use #rgb or #rrggbb`);
      else if (worst.ratio < min) bad("contrast", `${mode} t3 ${name} ${v} is ${worst.ratio.toFixed(2)}:1 on the card ${worst.card}, under ${min}:1`);
    }
  }
  return out;
}

/** One stage layer's paint for the cards' backdrop: the colours it may show (undefined: they cannot be known, a raster or an unreadable paint) and its opacity. */
interface LayerPaint {
  stops: Colour[] | undefined;
  opacity: number;
}

/** What a card may sit on in one mode: the page colour (`bg`), and the stage layers over it at their lightest, their darkest and each alone. `unknown`: a layer's colours cannot be read, so black and white are possible too. */
interface Backdrops {
  colours: string[];
  unknown: boolean;
}

function backdropsOf(page: string | undefined, layers: LayerPaint[]): Backdrops {
  if (!page) return { colours: [], unknown: false };
  const known = layers.filter((l): l is LayerPaint & { stops: Colour[] } => l.stops !== undefined);
  const unknown = known.length < layers.length;
  const stack = (sign: 1 | -1) =>
    known.reduce((under, l) => l.stops.map((c) => flatOn(c, under, l.opacity)).reduce((best, o) => ((luminance(o) - luminance(best)) * sign > 0 ? o : best)), page);
  const colours = new Set([page, stack(1), stack(-1)]);
  for (const l of known) for (const c of l.stops) colours.add(flatOn(c, page, l.opacity));
  if (unknown) colours.add("#000000").add("#ffffff");
  return { colours: [...colours], unknown };
}

/** A glass card's fill alpha where its backdrop blur is off when the material names none (`BLUR_FALLBACK_ALPHA`, materials.ts: a pack never paints less). */
const FALLBACK_ALPHA = 0.9;
/**
 * The shell's text variables per tone that no pack sets (`TEXT_VARS`, src/widgets/core/theme.ts; a test pins these to it): `--w-faint`
 * (the axis labels, units and sub-lines) and `--w-track` (its colour and alpha), held to a contrast on every card of the material.
 * `theme` and `auto` take the app theme's colours, which no pack file can know: a user pack names `dark` or `light`.
 */
export const SHELL_TONES: Record<"dark" | "light", { faint: string; track: string; trackAlpha: number }> = {
  dark: { faint: "#8a8a94", track: "#ffffff", trackAlpha: 0.07 },
  light: { faint: "#636366", track: "#18181b", trackAlpha: 0.1 },
};
/** The track must show against the card at least this much, or a gauge's empty part is not drawn. */
export const TRACK_MIN = 1.1;

/** What each Look in the pack is drawn on: the surface and every material's flat colours (its export, its fill and fill-2 laid over each backdrop by their alpha, and again by the blur fallback's), per mode; a colour the check cannot read is an issue. */
function cardsOf(look: Look, mode: string, surface: string, back: Backdrops, issues: PackIssue[], user: boolean): string[] {
  const cards = [surface];
  for (const [name, m] of Object.entries(look.t2?.materials ?? {})) {
    const own: string[] = [];
    const blurs = m.blur !== undefined || m.kind === "glass";
    const fallback = m["blur-fallback-alpha"] ?? FALLBACK_ALPHA;
    if (user && blurs && fallback < FALLBACK_ALPHA) issues.push(issue("blur-fallback", "look.json", `material ${name} blur-fallback-alpha ${fallback}: at least ${FALLBACK_ALPHA} (it is the fill where the blur is off)`));
    for (const field of ["export", "fill", "fill-2"] as const) {
      const v = m[field];
      if (typeof v !== "string") continue;
      const c = parseColour(v);
      const fillAlpha = (c?.alpha ?? 1) * (m["fill-alpha"] ?? 1);
      // a card with a blur is drawn at the lower of its fill alpha and its fallback's (H-1: the blur may be off)
      const alphas = field === "export" ? [c?.alpha ?? 1] : [...new Set([fillAlpha, ...(blurs ? [Math.min(fillAlpha, (c?.alpha ?? 1) * fallback)] : [])])];
      for (const alpha of alphas) {
        if (c?.hex && alpha >= 0.999) own.push(c.hex);
        else if (c?.hex && back.colours.length) {
          if (back.unknown && alpha < RASTER_ALPHA_MIN) issues.push(issue("contrast", "look.json", `${mode} material ${name} ${field} is ${alpha.toFixed(2)} opaque over a stage layer whose colours cannot be known (a raster or an unreadable paint): at least ${RASTER_ALPHA_MIN}`));
          else for (const b of back.colours) own.push(over(c.hex, alpha, b));
        } else issues.push(issue("contrast", "look.json", `${mode} material ${name} ${field} ${v} cannot be read: use #rgb, #rrggbb, rgb() or hsl() (over an opaque bg)`));
      }
    }
    if (m.blur !== undefined && !(BLUR.test(m.blur) && parseFloat(m.blur) <= BLUR_MAX)) issues.push(issue("blur", "look.json", `material ${name} blur ${m.blur}: a length in px up to ${BLUR_MAX}`));
    if (user) toneIssues(name, m.tone, mode, own, issues);
    cards.push(...own);
  }
  return [...new Set(cards)];
}

/** M-1: the shell sets `--w-faint` and `--w-track` from a material's tone, so the tone must be the side of the card's luminance the pack's own cards are. */
function toneIssues(name: string, tone: string | undefined, mode: string, cards: string[], issues: PackIssue[]): void {
  const shell = SHELL_TONES[tone === "light" ? "light" : "dark"];
  if (tone !== undefined && tone !== "dark" && tone !== "light") return void issues.push(issue("tone", "look.json", `material ${name} tone ${tone}: a user pack names dark or light (theme and auto take colours no pack file can know)`));
  for (const card of cards) {
    const faint = contrastOf(shell.faint, card);
    const track = contrastOf(over(shell.track, shell.trackAlpha, card), card);
    if (faint === undefined || track === undefined) continue;
    if (faint < TEXT_MIN) issues.push(issue("tone", "look.json", `${mode} material ${name} tone ${tone ?? "dark"}: the shell's faint text ${shell.faint} is ${faint.toFixed(2)}:1 on the card ${card}, under ${TEXT_MIN}:1 (the tone is the wrong side of the card)`));
    if (track < TRACK_MIN) issues.push(issue("tone", "look.json", `${mode} material ${name} tone ${tone ?? "dark"}: the shell's gauge track is ${track.toFixed(2)}:1 on the card ${card}, under ${TRACK_MIN}:1`));
  }
}

/** A variant sets the Variant knob's keys (`KNOB_KEYS`) and the colours the Look's roles reach (`VARIANT_COLOURS`), each with the value the knob stores: why a value is refused, or undefined. */
const VARIANT_NUMBER: Record<string, readonly [number, number]> = { surfaceOpacity: [0, 100], blur: [0, BLUR_MAX], radius: [0, 64], padding: [0, 64], gap: [0, 64] };
/** What a derived colour's fields may hold (lightness and chroma as OKLCH reads them). */
const DERIVE_RANGE: Record<string, readonly [number, number]> = { l: [0, 1], lMin: [0, 1], c: [0, 0.4], cMul: [0, 2], cMax: [0, 0.4], alpha: [0, 1] };
const VARIANT_KEYS = `accent, surface, surfaceOpacity, blur, radius, padding, gap, ${VARIANT_COLOURS.slice(1).join(", ")}`;
const isVariantColour = (key: string) => (VARIANT_COLOURS as readonly string[]).includes(key);

function deriveIssue(key: string, d: VariantDerive): string | undefined {
  if (!isVariantColour(key) || key === "accent") return "a colour other than the accent derives (it is derived from the accent)";
  if (d === null || typeof d !== "object" || Array.isArray(d) || d.from !== "accent") return 'a derive is {"from": "accent", ...} with l, lMin, c, cMul, cMax or alpha';
  const fields = Object.entries(d).filter(([k]) => k !== "from");
  for (const [k, v] of fields) {
    const range = Object.hasOwn(DERIVE_RANGE, k) ? DERIVE_RANGE[k] : undefined;
    if (!range) return `derive ${k} is not a field (from, l, lMin, c, cMul, cMax, alpha)`;
    if (!(typeof v === "number" && v >= range[0] && v <= range[1])) return `derive ${k} is a number from ${range[0]} to ${range[1]}`;
  }
  if (fields.length === 0) return "a derive sets at least one of l, lMin, c, cMul, cMax, alpha";
  if (d.l !== undefined && d.lMin !== undefined) return "derive l and lMin are both set: use one";
  if (d.c !== undefined && d.cMul !== undefined) return "derive c and cMul are both set: use one";
  if (d.alpha !== undefined && d.alpha < 1 && !VARIANT_ALPHA.includes(key)) return `${key} takes no alpha (only ${VARIANT_ALPHA.join(", ")})`;
  return undefined;
}

function variantValueIssue(key: string, value: string | VariantDerive): string | undefined {
  if (typeof value !== "string") return deriveIssue(key, value);
  if (isVariantColour(key)) {
    if (!colourOrAlias(value)) return "a colour (#rgb, #rrggbb, rgb(), hsl(), oklch() or an alias)";
    return !VARIANT_ALPHA.includes(key) && key !== "accent" && (parseColour(value)?.alpha ?? 1) < 1 ? `${key} takes no alpha (only ${VARIANT_ALPHA.join(", ")})` : undefined;
  }
  if (key === "surface") return value === "theme" || TOKEN_KEY.test(value) ? undefined : "a material name";
  const range = Object.hasOwn(VARIANT_NUMBER, key) ? VARIANT_NUMBER[key] : undefined;
  if (!range) return `not a key a variant sets (${VARIANT_KEYS})`;
  const n = /^\d+(\.\d+)?$/.test(value) ? Number(value) : Number.NaN;
  return n >= range[0] && n <= range[1] ? undefined : `a number from ${range[0]} to ${range[1]}`;
}

/** The roles a variant sets that are read as text on the card: each is held to the same ratio as the Look's own. */
const VARIANT_TEXTS = ["accent", "textColor", "mutedColor", "ok", "warn", "crit"] as const;

function lookIssues(look: Look, layers: LayerPaint[], user: boolean): { issues: PackIssue[]; cards: string[]; texts: string[] } {
  const issues: PackIssue[] = [];
  const cards: string[] = [];
  const texts: string[] = [];
  for (const [k, v] of Object.entries(look.t0 ?? {})) if (!colourOrAlias(v)) issues.push(issue("colour", "look.json", `t0 ${k} ${v.slice(0, 40)} must be #rgb, #rrggbb, rgb(), hsl(), oklch() or an alias`));
  if (!RADIUS.test(look.radius) || parseFloat(look.radius) * (look.radius.endsWith("px") ? 1 : 16) > 64) issues.push(issue("colour", "look.json", `radius ${look.radius}: a length up to 64 px`));
  for (const v of look.variants ?? []) for (const [k, value] of Object.entries(v.values)) {
    const m = variantValueIssue(k, value);
    if (m) issues.push(issue("variant", "look.json", `variant ${v.id} ${k} ${(typeof value === "string" ? value : JSON.stringify(value)).slice(0, 40)}: ${m}`));
  }
  for (const mode of look.modes.supported) {
    let t1: Record<string, string>;
    try {
      t1 = resolveT1(look, mode);
    } catch (e) {
      issues.push(issue("schema", "look.json", `${mode}: ${(e as Error).message}`));
      continue;
    }
    for (const name of T1_NAMES) if (!(TEXT_PAIRS as readonly string[]).includes(name) && name !== "surface" && !parseColour(t1[name])) issues.push(issue("colour", "look.json", `${mode} ${name} ${t1[name].slice(0, 40)} must be #rgb, #rrggbb, rgb(), hsl() or oklch()`));
    // L93: the chrome (the island's pill, the alert cards) takes the surface verbatim, so it is a literal and opaque
    const surface = parseColour(t1.surface);
    if (!surface?.hex || surface.alpha < 1 || !/^#([\da-f]{3}|[\da-f]{6})$/i.test(t1.surface)) issues.push(issue("chrome-surface", "look.json", `${mode} surface ${t1.surface} must be an opaque #rgb or #rrggbb: the chrome and the contrast check read it as written`));
    const modeCards = cardsOf(look, mode, t1.surface, backdropsOf(opaqueHex(t1.bg), layers), issues, user);
    for (const card of modeCards) {
      cards.push(card);
      for (const name of TEXT_PAIRS) {
        // L-8: a text with an alpha is read as drawn, laid over the card
        const ratio = contrastOf(flatOver(t1[name], card), card);
        if (ratio === undefined) issues.push(issue("contrast", "look.json", `${mode} ${name} ${t1[name]} on ${card} cannot be checked: use #rgb or #rrggbb`));
        else if (ratio < TEXT_MIN) issues.push(issue("contrast", "look.json", `${mode} ${name} ${t1[name]} is ${ratio.toFixed(2)}:1 on the card ${card}, under ${TEXT_MIN}:1`));
      }
    }
    // the text on an accent fill (a button, a label bar) is read on the accent itself
    const accentHex = opaqueHex(t1.accent) ?? t1.accent;
    const onAccent = contrastOf(flatOver(t1["accent-on"], accentHex), accentHex);
    if (onAccent === undefined) issues.push(issue("contrast", "look.json", `${mode} accent-on ${t1["accent-on"]} on the accent ${t1.accent} cannot be checked: use #rgb or #rrggbb`));
    else if (onAccent < TEXT_MIN) issues.push(issue("contrast", "look.json", `${mode} accent-on ${t1["accent-on"]} is ${onAccent.toFixed(2)}:1 on the accent ${t1.accent}, under ${TEXT_MIN}:1`));
    // a variant is applied in the first mode: the colours it sets are read on that mode's cards, derived ones from its own accent
    if (mode === look.modes.supported[0]) for (const v of look.variants ?? []) {
      const set = resolveVariant(look, v, mode).values;
      for (const [key, value] of Object.entries(v.values)) if (typeof value !== "string" && isVariantColour(key) && key !== "accent" && set[key] === undefined) issues.push(issue("variant", "look.json", `variant ${v.id} ${key} cannot be derived: the accent is not a colour that can be read`));
      // a variant that sets none of the new colour roles is an accent swap as packs have always had them, and is not held to a ratio it was never checked for
      const roles = Object.keys(v.values).some((key) => isVariantColour(key) && key !== "accent");
      for (const key of roles ? VARIANT_TEXTS : []) for (const card of modeCards) {
        if (set[key] === undefined) continue;
        const ratio = contrastOf(flatOver(set[key], card), card);
        if (ratio === undefined) issues.push(issue("contrast", "look.json", `variant ${v.id} ${key} ${set[key]} on ${card} cannot be checked: use #rgb or #rrggbb`));
        else if (ratio < TEXT_MIN) issues.push(issue("contrast", "look.json", `variant ${v.id} ${key} ${set[key]} is ${ratio.toFixed(2)}:1 on the card ${card}, under ${TEXT_MIN}:1`));
      }
    }
    for (const name of ["fg", "fg-2", "muted"] as const) for (const card of modeCards) if (parseColour(t1[name])?.hex) texts.push(flatOver(t1[name], card));
    issues.push(...t3Issues(look, t1 as Record<T1Name, string>, mode, modeCards));
  }
  for (const m of numeralIssues(look)) issues.push(issue("contrast", "look.json", m));
  return { issues, cards: [...new Set(cards)], texts: [...new Set(texts)] };
}

// ---- the folder -------------------------------------------------------------------------------------------------------


/** What is wrong with a pack, one issue each, errors before warnings (empty: it may load). A crash inside a rule is an issue, never an exception. */
export function validatePack(src: PackSource, options: PackOptions = {}): PackIssue[] {
  try {
    return validate(src, options.source ?? "user", options.script ?? "files");
  } catch (e) {
    return [issue("internal", "", `the pack could not be read to the end (${(e as Error).name}: ${(e as Error).message.slice(0, 80)}): refused`)];
  }
}

function validate(src: PackSource, source: "builtin" | "user", scriptAt: "files" | "route"): PackIssue[] {
  const user = source === "user";
  // the one `.js` a pack may hold is the file its `script` names (read loosely here: the schema checks the key below)
  const named = (src.pack as { script?: { file?: unknown } } | undefined)?.script?.file;
  const scriptPath = typeof named === "string" ? `assets/${named}` : undefined;
  const out: PackIssue[] = [];
  const add = (rule: string, file: string, message: string, severity: PackIssue["severity"] = "error") => void out.push(issue(rule, file, message, severity));

  // the JSON's own shape first (the schema walker recurses): depth, size, prototype keys
  for (const [file, value] of [["pack.json", src.pack], ["look.json", src.look], ["icons.json", src.icons]] as const) for (const m of jsonShapeIssues(value)) add("json-shape", file, m);
  if (out.length) return finish(out);

  // schema
  const packErrors = schemaErrors(src.pack, packSchema as Record<string, unknown>, packSchema as Record<string, unknown>);
  const lookErrors = schemaErrors(src.look, lookSchema as Record<string, unknown>, lookSchema as Record<string, unknown>);
  for (const m of packErrors) add("schema", "pack.json", m);
  for (const m of lookErrors) add("schema", "look.json", m);
  // every string a Look or pack carries ends up in a style or a page: no URL function, script, import or tag, and in a Look no character that ends a declaration
  for (const [file, value] of [["pack.json", src.pack], ["look.json", src.look], ["icons.json", src.icons]] as const) {
    for (const [, str] of jsonStrings(value, PROSE_PATHS)) if (INJECTION.test(str) || (file === "look.json" && STYLE_BREAKERS.test(withoutAliases(str)))) add("injection", file, `the value ${str.slice(0, 40)} holds markup, a URL function or a character that ends a style rule`);
  }

  // material, tone and token keys are plain names
  const look0 = src.look as Look | undefined;
  for (const [group, obj] of [["materials", look0?.t2?.materials], ["tones", look0?.t2?.tones], ["t3", look0?.t3], ...Object.values(look0?.t2?.tones ?? {}).map((t) => ["tone", t] as const)] as [string, unknown][]) {
    if (obj && typeof obj === "object") for (const key of Object.keys(obj)) if (!TOKEN_KEY.test(key)) add("schema", "look.json", `${group} key ${key.slice(0, 30)} is not a plain name (a-z, 0-9, -)`);
  }

  // the folder: every file's size from its bytes, its own path, the caps, nothing outside the pack's shape
  const files = new Map<string, PackFile>();
  const lower = new Set<string>();
  let total = 0;
  if (src.files.length > FILE_COUNT_MAX) add("size", "", `${src.files.length} files, at most ${FILE_COUNT_MAX}`);
  for (const f of src.files) {
    const claimed = Number.isInteger(f.size) && f.size >= 0;
    if (!claimed) add("size", f.path, `size ${f.size} is not a whole number of bytes`);
    else if (f.bytes && f.bytes.length !== f.size) add("size", f.path, `is declared ${f.size} bytes and holds ${f.bytes.length}`);
    if (!f.bytes) add("content-unread", f.path, "the file's bytes were not given, so its content cannot be checked");
    const n = f.bytes?.length ?? (claimed ? f.size : 0);
    total += n;
    if (n > FILE_MAX_BYTES) add("size", f.path, `is ${n} bytes, over the ${FILE_MAX_BYTES} cap for a file`);
    files.set(f.path, { ...f, size: n });
    if (!isPackRelativeUrl(f.path)) add(urlRule(f.path), f.path, `file path ${f.path} leaves the pack folder`);
    else if (f.path.length > 120 || ODD_PATH.test(f.path) || lower.has(f.path.toLowerCase()) || (f.path.startsWith("assets/") && f.path.slice(7).includes("/"))) add("path", f.path, "a path that is too long, hidden, a device name, repeated, or in a folder of assets/");
    else if (f.path.startsWith("assets/")) {
      if (!ASSET_TYPES.test(f.path) && f.path !== scriptPath) add("asset-type", f.path, "an asset is an image (png, jpg, webp, avif, gif, svg) or a woff2 font");
    } else if (!ROOT_FILES.test(f.path)) add("asset-extra", f.path, "not a file a pack has");
    lower.add(f.path.toLowerCase());
  }
  if (total > PACK_CEILING_BYTES) add("size", "", `the pack is ${total} bytes, over the ${PACK_CEILING_BYTES} cap`);

  if (packErrors.length || lookErrors.length) return finish(out);
  const pack = src.pack as PackJson;
  const look = src.look as Look;
  if (look.id !== pack.id) add("id", "look.json", `look.id ${look.id} is not the pack id ${pack.id}`);
  if (pack.modes.join() !== look.modes.supported.join()) add("modes", "pack.json", "modes differ from look.json modes.supported");
  // a user pack never takes a built-in's id or font family (P12b sets `source` from where the pack was loaded, never from the pack)
  if (user && LOOK_IDS.includes(pack.id)) add("provenance", "pack.json", `the id ${pack.id} is a built-in theme's: a user pack takes its own`);
  if (user) for (const f of pack.fonts) if (BUILTIN_FONT_FAMILIES.has(f.family)) add("provenance", "pack.json", `the font family ${f.family} is a built-in pack's: a user pack names its own`);
  // a descending weight range is no `@font-face` descriptor (the face would not load); a Look names only faces its own pack brings
  for (const f of pack.fonts) {
    const [low, high] = f.weight.split(" ").map(Number);
    if (high !== undefined && low > high) add("font-weight", "pack.json", `${f.family} weight ${f.weight}: the lower weight comes first`);
  }
  if (user) for (const [role, family] of Object.entries(look.fonts)) if (family.startsWith("pack-") && !pack.fonts.some((f) => f.family === family)) add("font-family", "look.json", `fonts.${role} ${family} is not a family this pack brings`);
  for (const key of T1_NAMES) for (const mode of look.modes.supported) if (!look.t1[mode]?.[key]) add("schema", "look.json", `${mode} ${key} is missing`);

  // referenced files: stage images, fonts, icons, CSS urls; each is a pack path and a file of the folder
  const referenced = new Map<string, string>();
  const resolve = (name: string, base: string) => {
    const path = name.replace(/[?#].*$/, "").replace(/^\.\//, "");
    return [base + path, path, `assets/${path}`].find((p) => files.has(p));
  };
  const refer = (from: string, name: string, base: string, exact = false) => {
    if (!isPackRelativeUrl(name) || /["']/.test(name)) return void add(urlRule(name), from, `${name} is not a path inside the pack`);
    // a user pack's CSS url is served as written (`scopePackCss` rewrites it to the route), so it names its file exactly
    const found = exact ? [packPath(name)].find((p) => files.has(p)) : resolve(name, base);
    if (!found) add("asset-missing", from, `${name} is not in the pack's files`);
    else referenced.set(found, from);
  };
  pack.stage.layers.forEach((l) => l.image !== undefined && refer("pack.json", l.image, "assets/"));
  pack.fonts.forEach((f) => refer("pack.json", f.file, "assets/"));
  if (src.css !== undefined) for (const u of cssUrls(src.css)) refer("pack.css", u, "", user);

  // the asset list matches the files (a user pack must list every asset)
  const assets = [...files.keys()].filter((p) => p.startsWith("assets/"));
  if (!pack.assets && user && assets.length) add("asset-listed", "pack.json", "a pack with assets lists each in pack.json's assets: anything not listed is refused");
  if (pack.assets) {
    const listed = new Set<string>();
    for (const a of pack.assets) {
      const f = files.get(`assets/${a.file}`);
      listed.add(`assets/${a.file}`);
      if (!f) {
        if (!(scriptAt === "route" && `assets/${a.file}` === scriptPath)) add("asset-listed", "pack.json", `${a.file} is listed and not in the pack's files`);
      }
      else if (f.size !== a.bytes) add("asset-listed", "pack.json", `${a.file} is listed as ${a.bytes} bytes and is ${f.size}`);
    }
    for (const p of assets) if (!listed.has(p)) add("asset-listed", p, "not in pack.json's asset list: anything not listed is refused");
  }
  if (scriptPath && files.has(scriptPath)) referenced.set(scriptPath, "pack.json");
  for (const p of assets) if (!referenced.has(p)) add("asset-unused", p, "nothing in the pack uses this file", "warn");

  // what each image and font file is, from its bytes (the extension is only a claim)
  const moving = new Set<string>();
  for (const f of files.values()) {
    const ext = /\.([a-z0-9]+)$/i.exec(f.path)?.[1].toLowerCase();
    if (!f.bytes || !ext || !(f.path.startsWith("assets/") ? ASSET_TYPES.test(f.path) : /^thumb\./.test(f.path))) continue;
    if (ext === "svg") {
      const m = svgIssue(text(f.bytes));
      // a file that passes once its animation is cut breaks the animation subset only (motion-svg.ts)
      if (m) add(svgIssue(svgStill(text(f.bytes))) ? "svg-unsafe" : "svg-animation", f.path, m);
      else if (svgAnimated(text(f.bytes))) moving.add(f.path);
    } else if (ext === "woff2") {
      if (text(f.bytes.subarray(0, 4)) !== "wOF2") add("font-type", f.path, "the file is not a woff2 font (wrong signature)");
    } else if (!rasterMatches(ext, f.bytes)) add("image-type", f.path, `the bytes are not a ${ext} image`);
  }

  // an animated SVG moves only as a stage layer that says so: there the app draws it still below Full, in lite mode and under
  // reduced motion (pack-stage.tsx); pack.css cannot hold one still, so it may not use one
  pack.stage.layers.forEach((l, i) => {
    const path = l.image !== undefined && isPackRelativeUrl(l.image) ? resolve(l.image, "assets/") : undefined;
    if (path && moving.has(path) && l.animated !== true) add("svg-animation", "pack.json", `stage layer ${i}'s ${l.image} animates: declare the layer animated, so the app holds it still where the screen allows no motion`);
    if (l.animated === true && !(path && moving.has(path))) add("svg-animation", "pack.json", `stage layer ${i} is declared animated and its image does not animate`, "warn");
  });
  if (src.css !== undefined) {
    for (const u of cssUrls(src.css)) {
      const path = isPackRelativeUrl(u) ? (user ? [packPath(u)].find((p) => files.has(p)) : resolve(u, "")) : undefined;
      if (path && moving.has(path)) add("svg-animation", "pack.css", `${u} animates: an animated SVG is drawn only as a stage layer, where the app holds it still below Full`);
    }
  }

  // fonts: woff2 with a licence file (OFL) and a copyright line
  const licence = [...files.values()].find((f) => LICENCE_FILE.test(f.path));
  if (pack.fonts.length && !licence) add("font-licence", "", "fonts need their licence file (OFL.txt) in the pack");
  if (licence?.bytes && !(/SIL OPEN FONT LICENSE,? Version 1\.1/i.test(text(licence.bytes)) && /copyright/i.test(text(licence.bytes)))) add("font-licence", licence.path, "the licence file is not the SIL Open Font License 1.1 with its copyright line");
  for (const f of pack.fonts) {
    if (!/\.woff2$/i.test(f.file)) add("font-type", "pack.json", `${f.file} is not a woff2 file`);
    if (f.licence !== "OFL-1.1") add("font-licence", "pack.json", `${f.file} licence ${f.licence}: only OFL-1.1 fonts are accepted`);
  }

  // stage, effects, layer budget (the loader's own checks), overlay strength
  if (pack.stage.layers.length > MAX_LAYERS) add("layers", "pack.json", `stage has ${pack.stage.layers.length} layers, at most ${MAX_LAYERS}`);
  for (const m of stageIssues(pack.stage)) {
    if (/^stage layer \d+ image/.test(m)) continue;
    add(/^effect|^more than/.test(m) ? "effects" : "stage", "pack.json", m);
  }
  for (const e of pack.stage.effects ?? []) if (e.opacity !== undefined && e.opacity > OVERLAY_MAX) add("overlay-alpha", "pack.json", `${e.kind} opacity ${e.opacity} is over ${OVERLAY_MAX}: an overlay never hides what is under it`);
  for (const e of pack.stage.effects ?? []) if (e.kind === "blur" && e.px !== undefined && e.px > STAGE_BLUR_MAX) add("effects", "pack.json", `blur px ${e.px} is drawn at ${STAGE_BLUR_MAX}, the stage's cap`, "warn");

  // fx: the kinds that flash, their rate, how many animate at once
  const effects = pack.stage.effects ?? [];
  effects.forEach((e, i) => {
    const at = `stage effect ${i} (${e.kind})`;
    const flashes = (FX_KINDS as readonly string[]).includes(e.kind);
    if (flashes && e.cost !== "animated") add("fx-cost", "pack.json", `${at} flashes: declare cost animated`);
    if (e.rate !== undefined && !flashes) add("fx-rate", "pack.json", `${at} has a rate: only ${FX_KINDS.join(", ")} take one`);
    else if (e.rate !== undefined && !(typeof e.rate === "number" && e.rate > 0 && e.rate <= FLASH_MAX)) add("fx-rate", "pack.json", `${at} rate ${String(e.rate).slice(0, 12)}: above 0 and at most ${FLASH_MAX} flashes a second`);
  });
  const animated = effects.filter((e) => e.cost === "animated").length;
  if (animated > MAX_ANIMATED) add("fx-animated", "pack.json", `${animated} animated effects, at most ${MAX_ANIMATED} at full`);

  // ornament (the slot's size), ornaments, frame, edge
  if (pack.ornament && pack.ornament.size > ORNAMENT_MAX && !pack.ornament.bleed) add("ornament", "pack.json", `ornament is ${pack.ornament.size} px, at most ${ORNAMENT_MAX}`);
  if (pack.ornament && pack.ornaments) add("ornament", "pack.json", "ornament and ornaments are both set: use ornaments");
  if (pack.ornaments && pack.ornaments.length > ORNAMENTS_MAX) add("ornament", "pack.json", `${pack.ornaments.length} ornaments, at most ${ORNAMENTS_MAX}`);
  (pack.ornaments ?? []).forEach((o, i) => {
    const at = `ornaments[${i}] (${o.kind})`;
    const hasText = o.text !== undefined;
    if ((TEXT_ORNAMENTS as readonly string[]).includes(o.kind) !== hasText) add("ornament", "pack.json", hasText ? `${at} takes no text` : `${at} needs its text`);
    else if (hasText && ([...o.text!].length > ORNAMENT_TEXT_MAX || /[\p{C}\p{Zl}\p{Zp}<>]/u.test(o.text!) || INJECTION.test(o.text!))) add("ornament", "pack.json", `${at} text: 1 to ${ORNAMENT_TEXT_MAX} printable characters, no markup`);
  });
  if (pack.frame && pack.edge) add("frame", "pack.json", "frame and edge are both set: use frame");
  if (pack.frame) {
    const { size, stroke, which } = pack.frame;
    if (!(size >= 0 && size <= FRAME_SIZE_MAX)) add("frame", "pack.json", `frame size ${size}: 0 to ${FRAME_SIZE_MAX} px`);
    if (stroke !== undefined && !(stroke >= 0 && stroke <= FRAME_STROKE_MAX)) add("frame", "pack.json", `frame stroke ${stroke}: 0 to ${FRAME_STROKE_MAX} px`);
    if (which && (which.length === 0 || new Set(which).size !== which.length)) add("frame", "pack.json", "frame which: at least one corner, none twice");
    const { spine, tab, alpha } = pack.frame;
    if (alpha !== undefined && !(alpha >= FRAME_ALPHA_MIN && alpha <= 1)) add("frame", "pack.json", `frame alpha ${alpha}: ${FRAME_ALPHA_MIN} to 1`);
    if (spine && !(spine.width >= 1 && spine.width <= FRAME_SPINE_MAX)) add("frame", "pack.json", `frame spine width ${spine.width}: 1 to ${FRAME_SPINE_MAX} px`);
    if (tab && !(tab.width >= 1 && tab.width <= FRAME_TAB_WIDTH_MAX && tab.height >= 1 && tab.height <= FRAME_TAB_HEIGHT_MAX)) add("frame", "pack.json", `frame tab ${tab.width} by ${tab.height}: at most ${FRAME_TAB_WIDTH_MAX} by ${FRAME_TAB_HEIGHT_MAX} px`);
  }
  if (pack.edge?.kind === "distressed") add("chamfer", "pack.json", "edge distressed draws nothing: the app has no such mask", "warn");
  if (pack.edge?.kind === "chamfer" && !(pack.edge.cut !== undefined && pack.edge.cut <= CHAMFER_MAX)) add("chamfer", "pack.json", `chamfer cut ${pack.edge.cut ?? "missing"}: at most ${CHAMFER_MAX} px`);
  else if (pack.edge?.kind !== "chamfer" && pack.edge?.cut !== undefined && pack.edge.cut > CHAMFER_MAX) add("chamfer", "pack.json", `edge cut ${pack.edge.cut}: at most ${CHAMFER_MAX} px`);

  out.push(...motionPackIssues(pack));
  out.push(...scriptIssues(pack, files, scriptAt, source));

  // icons
  if (src.icons !== undefined) {
    for (const m of iconSetIssues(src.icons)) add(m.includes("icon name list") ? "icon-key" : "icons", "icons.json", m);
  }

  // the Look: contrast per card, opaque chrome surface, gradient numerals, T3 values, readable colours
  const layers = pack.stage.layers.flatMap((l) => layerPaint(l, files, resolve) ?? []);
  const { issues: lookRules, cards, texts } = lookIssues(look, layers, user);
  out.push(...lookRules);

  // burn-in: a static-safe claim on bright static art (layers stack: each adds to what is behind it; unreadable art is not static-safe)
  if (pack.burnIn === "static-safe") {
    let behind = 1;
    pack.stage.layers.forEach((l, i) => {
      const art = layerBrightness(l, files, resolve);
      if (art === undefined) return void add("burn-in", "pack.json", `stage layer ${i}'s colours cannot be read (a name, var(), a raster or an unusual colour function): declare needs-shift or needs-dim, not static-safe`);
      const lum = art * (l.opacity ?? 1);
      behind *= 1 - Math.min(1, lum);
      if (lum >= BRIGHT_LAYER) add("burn-in", "pack.json", `stage layer ${i} is bright static art (luminance ${lum.toFixed(2)}): declare needs-shift or needs-dim, not static-safe`);
    });
    if (1 - behind >= BRIGHT_LAYER) add("burn-in", "pack.json", `the stage layers together are bright static art (luminance ${(1 - behind).toFixed(2)}): declare needs-shift or needs-dim, not static-safe`);
  }

  // pack.css: a user pack's is read by its own grammar (a file that could not be read as text is refused); a built-in pack's for URLs, paint only and hiding paint
  if (user && src.css !== undefined) for (const m of userCssIssues(src.css)) add("user-css", "pack.css", m);
  else if (user && files.has("pack.css")) add("user-css", "pack.css", "the file was not read as UTF-8 text, or the server would not vouch for it");
  if (!user && src.css !== undefined) {
    for (const m of packCssIssues(src.css)) add(cssRule(m), "pack.css", m);
    for (const m of lintPackCss(src.css)) add(cssRule(m), "pack.css", m);
    if (!tokenize(src.css).some((t) => t.t === "error")) out.push(...hiddenPaintIssues(src.css, cards, texts));
  }
  return finish(out);
}

/** A stage layer's paint for the cards' backdrop (`backdropsOf`): its fill's stops, or an SVG's paints with the default black and nothing (it covers part of the page); undefined stops when they cannot be read; no paint for a layer with neither. */
function layerPaint(l: { fill?: string; image?: string; opacity?: number }, files: Map<string, PackFile>, resolve: (name: string, base: string) => string | undefined): LayerPaint | undefined {
  const opacity = l.opacity ?? 1;
  if (l.fill !== undefined) return { stops: fillStops(l.fill), opacity };
  if (l.image === undefined) return undefined;
  const path = isPackRelativeUrl(l.image) ? resolve(l.image, "assets/") : undefined;
  const f = path ? files.get(path) : undefined;
  if (!f?.bytes || !/\.svg$/i.test(f.path)) return { stops: undefined, opacity };
  const paints = svgPaints(text(f.bytes)).map(parseLiteral);
  return { stops: paints.some((c) => c === undefined) ? undefined : [{ hex: "#000000", alpha: 1 }, { alpha: 0 }, ...(paints as Colour[])], opacity };
}

/** How bright a stage layer is (0-1, before its opacity): its fill, or its SVG's paints; undefined when that cannot be read (a raster, a missing file, a colour name). */
function layerBrightness(l: { fill?: string; image?: string }, files: Map<string, PackFile>, resolve: (name: string, base: string) => string | undefined): number | undefined {
  if (l.fill !== undefined) return fillBrightness(l.fill);
  if (l.image === undefined) return 0;
  const path = isPackRelativeUrl(l.image) ? resolve(l.image, "assets/") : undefined;
  const f = path ? files.get(path) : undefined;
  return f?.bytes && /\.svg$/i.test(f.path) ? svgBrightness(text(f.bytes)) : undefined;
}

/** The motion block (L117): each effect's strength and timing inside its range (`MOTION_RULES`); the schema has already refused an unknown effect or key. Inert data, the same for a user pack. */
function motionPackIssues(pack: PackJson): PackIssue[] {
  return motionIssues(pack.motion).map((m) => issue("motion", "pack.json", m));
}

/**
 * The script key (G4 as changed 2026-11-23): one `.js` file of the pack's assets, listed in `assets` like any other, at most
 * `SCRIPT_MAX_BYTES`, UTF-8 text. It is never run here or by the loader: only the pack-script sandbox runs it, and only when the
 * server's trust answer says so. A pack read back from the route (`script: "route"`) has no bytes for it to check: the server keeps them.
 * A built-in pack lists no assets (the bundler serves them, and its script ships in the bundle, pack-script/builtin.ts).
 */
export function scriptIssues(pack: Pick<PackJson, "script" | "assets">, files: ReadonlyMap<string, PackFile>, scriptAt: "files" | "route" = "files", origin: "builtin" | "user" = "user"): PackIssue[] {
  if (!pack.script) return [];
  const { file } = pack.script;
  const out: PackIssue[] = [];
  if (origin === "user" && !pack.assets?.some((a) => a.file === file)) out.push(issue("script", "pack.json", `the script ${file} is not in pack.json's asset list`));
  const f = files.get(`assets/${file}`);
  if (!f) {
    if (scriptAt === "files") out.push(issue("script", "pack.json", `the script ${file} is not in the pack's files`));
    return out;
  }
  if (f.size > SCRIPT_MAX_BYTES) out.push(issue("script", f.path, `the script is ${f.size} bytes, at most ${SCRIPT_MAX_BYTES}`));
  let source: string | undefined;
  try {
    source = f.bytes && new TextDecoder("utf-8", { fatal: true }).decode(f.bytes);
  } catch {
    source = undefined;
  }
  if (source === undefined || source.includes("\u0000")) out.push(issue("script", f.path, "the script is not UTF-8 text"));
  return out;
}

/** Errors first; the same rule on the same file and message once. */
function finish(issues: PackIssue[]): PackIssue[] {
  const seen = new Set<string>();
  const unique = issues.filter((i) => !seen.has(`${i.rule}|${i.file}|${i.message}`) && seen.add(`${i.rule}|${i.file}|${i.message}`));
  return [...unique.filter((i) => i.severity === "error"), ...unique.filter((i) => i.severity === "warn")];
}
