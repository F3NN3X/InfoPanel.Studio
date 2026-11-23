// Pack CSS is paint only and reaches nothing outside the pack (spec 03, Security): the loader lints it against an allow-list
// of paint properties (`lintPackCss`) and mounts it as `@layer look { @scope ([data-look="id"]) { ... } }` (`scopePackCss`).
// The pack's own elements carry `data-look="<id>"` (the widget card, each stage layer and the overlay); a rule reaches those
// elements' descendants, and the element itself through `:scope`. Layout, visibility, position, size and the page (`:root`,
// `html`, `body`) are not the pack's to touch, and a paint value that hides a widget (G2) or blurs its text (G6) is refused.
// Both read the rules `css-syntax` parsed, and the mounted CSS is written from them, never the pack's own text. Anything
// the lint cannot read is refused. A rule whose every selector ends in `::before` or `::after` is in the pseudo lane: it may also
// set what moves, sizes or fills its own box (`PSEUDO_ONLY`), and the mount pins that box out of the way (`PSEUDO_BOX`).
import { type Declaration, parseCss, type Rule, type Token, writeRules, writeString, writeTokens } from "./css-syntax";
import { commaParts, type Lane, lengthDefinitions, looseColour, PSEUDO_ONLY, pseudoLane, shapeIssue } from "./pack-css-values";
import { packCssIssues, packPath, URL_FUNCS } from "./pack-urls";

export { commaParts };

/**
 * Paint properties, and custom properties named `--pack-*` (an app one such as `--wp-pad` would move the card); a property
 * that is not here, in `SHAPED` or (on a pseudo-element) in `PSEUDO_ONLY` is refused. Left out on purpose: border widths (`SHAPED`
 * reads a border without one; a style on a `medium` border adds width, which the render check compares), `mask-mode` and `mask-composite` (they turn a mask inside out) and stroke dashes
 * (they draw a gauge's value).
 */
const PAINT =
  /^(--pack-[\w-]+|color|(fill-|stroke-)?opacity|filter|backdrop-filter|-webkit-backdrop-filter|box-shadow|text-shadow|fill|stroke(-width|-linecap|-linejoin)?|mix-blend-mode|accent-color|caret-color|font-family|font-feature-settings|-webkit-text-fill-color|-webkit-text-stroke-color|-webkit-background-clip|background(-color|-image|-position(-x|-y)?|-size|-repeat|-attachment|-clip|-origin|-blend-mode)?|border(-(top|right|bottom|left|block|inline)(-(start|end))?)?-color|border-image-(source|slice|repeat)|outline-(color|style)|text-decoration(-color|-style)?|animation(-(name|duration|delay|iteration-count|direction|fill-mode|play-state|timing-function))?)$/;
/** Phase 2's paint (gate 0 §6), on any element, each value read by its shape (`pack-css-values`). */
const SHAPED = /^(clip-path|(-webkit-)?mask(-image|-size|-repeat|-position)?|border(-(top|bottom)-(left|right))?-radius|border-image(-(width|outset))?|border(-style)?|outline-offset|letter-spacing|text-transform|font-variant-numeric|transition(-(property|duration|delay|timing-function))?)$/;
/** What the mount writes after a pseudo-lane rule's own declarations: the box is out of the flow, never hit and under the content (a pack never writes these). */
const PSEUDO_BOX: Declaration[] = [
  { name: "position", value: [{ t: "ident", v: "absolute" }] },
  { name: "pointer-events", value: [{ t: "ident", v: "none" }] },
  { name: "z-index", value: [{ t: "number", v: "0", n: 0 }] },
];
const FONT_FACE = /^(font-family|src|font-weight|font-style|font-stretch|font-display|unicode-range)$/;
const KEYFRAME_SELECTOR = /^(from|to|\d+(\.\d+)?%)(,(from|to|\d+(\.\d+)?%))*$/i;
/** Names a pack defines (keyframes, font faces) start with this, so they never replace one the app uses. */
const OWN = /^pack-/i;
/** The least opacity a pack may give anything: under it a widget is hidden (G2). */
export const OPACITY_FLOOR = 0.5;
/** The most `backdrop-filter: blur()` (the material's glass); `filter: blur()` would blur the widget's own text (G6). */
const BACKDROP_BLUR_MAX = 64;
/** The keywords an `animation` value may hold beside a name, times and timing functions. */
export const ANIMATION_WORDS = new Set(
  "none infinite normal reverse alternate alternate-reverse forwards backwards both running paused auto linear ease ease-in ease-out ease-in-out step-start step-end initial inherit unset revert revert-layer".split(
    " "
  )
);
const TIMING_FUNCTIONS = new Set(["cubic-bezier", "steps", "linear"]);
/** A stroke thinner than this draws nothing a person can see (G2). */
const STROKE_MIN = 0.5;
/** The most a shadow's offset or blur reaches, and a shadow's spread (a larger spread paints a box over its card). */
const SHADOW_MAX = 64;
const SPREAD_MAX = 16;
/** The largest `background-size` or position a pack may give in px. */
const BG_PX_MAX = 4096;
/** An animation that repeats forever runs at least this long (ms): a faster one flashes. */
const LOOP_MIN_MS = 1000;
/** Blend modes that invert or recolour what is under them. */
const BAD_BLEND = /^(difference|exclusion|hue|saturation|color|luminosity|color-dodge|color-burn)$/i;

/** A number or percentage alone, as a fraction (`60%` is 0.6); undefined for anything else (`var()`, `calc()`, two tokens). */
const amount = (value: Token[]) => (value.length !== 1 ? undefined : value[0].t === "number" ? value[0].n : value[0].t === "percentage" ? (value[0].n as number) / 100 : undefined);

const PX_PER: Record<string, number> = { px: 1, em: 16, rem: 16 };
/** The px of a length (`em` and `rem` as 16 px; a bare 0 is 0), or undefined when it is not one a pack may size with. */
function px(tok: Token): number | undefined {
  if (tok.t === "number") return tok.n === 0 ? 0 : undefined;
  const per = tok.t === "dimension" ? PX_PER[tok.unit?.toLowerCase() ?? ""] : undefined;
  return per === undefined ? undefined : (tok.n as number) * per;
}

/** Whether every shadow of a `box-shadow` or `text-shadow` stays within the caps: offsets and blur `SHADOW_MAX`, spread `SPREAD_MAX`, all in px, em or rem. */
function shadowWithinCaps(value: Token[]): boolean {
  return commaParts(value).every((part) => {
    let depth = 0;
    const lengths = part.filter((t) => {
      if (t.t === "function" || t.t === "(") depth++;
      else if (t.t === ")") depth--;
      return depth === 0 && (t.t === "dimension" || t.t === "number");
    });
    const px4 = lengths.map(px);
    return px4.every((n) => n !== undefined) && (px4 as number[]).every((n, k) => Math.abs(n) <= (k === 3 ? SPREAD_MAX : SHADOW_MAX));
  });
}

/** The functions of a filter value with their arguments; undefined when it holds anything but functions and white space. */
function filterFunctions(value: Token[]): [string, Token[]][] | undefined {
  const out: [string, Token[]][] = [];
  for (let k = 0; k < value.length; k++) {
    const tok = value[k];
    if (tok.t === "ws") continue;
    if (tok.t !== "function") return undefined;
    let depth = 1;
    const from = k + 1;
    while (depth > 0 && ++k < value.length) {
      if (value[k].t === "function" || value[k].t === "(") depth++;
      else if (value[k].t === ")") depth--;
    }
    out.push([tok.v.toLowerCase(), value.slice(from, k).filter((t) => t.t !== "ws")]);
  }
  return out;
}

/** Whether a filter keeps content readable: functions from an allow-list, with the values that dim or blur capped. */
function readableFilter(value: Token[], backdrop: boolean): boolean {
  if (value.length === 1 && value[0].t === "ident" && value[0].v.toLowerCase() === "none") return true;
  const fns = filterFunctions(value);
  return (
    fns !== undefined &&
    fns.length > 0 &&
    fns.every(([name, args]) => {
      const a = amount(args);
      if (name === "drop-shadow") return args.filter((t) => t.t === "dimension" || t.t === "number").every((t) => Math.abs(px(t) ?? Infinity) <= SHADOW_MAX);
      if (name === "hue-rotate") return args.length === 1 && (args[0].t === "dimension" || (args[0].t === "number" && args[0].n === 0));
      if (name === "saturate" || name === "sepia" || name === "grayscale") return a !== undefined && a >= 0;
      if (name === "brightness" || name === "contrast") return a !== undefined && a >= OPACITY_FLOOR && a <= 2;
      if (name === "opacity") return a !== undefined && a >= OPACITY_FLOOR;
      if (name === "blur") return backdrop && args.length === 1 && ((args[0].t === "dimension" && args[0].unit?.toLowerCase() === "px" && (args[0].n as number) <= BACKDROP_BLUR_MAX) || (args[0].t === "number" && args[0].n === 0));
      return false;
    })
  );
}

/** A transition may name what a rule paints: never a custom property, an animation, or what only a pseudo-element sets (geometry, `content`). */
const transitionable = (p: string) => (PAINT.test(p) || SHAPED.test(p)) && !p.startsWith("--") && !/^(animation|transition|letter-spacing|text-transform|font-variant)/.test(p);
const laneOf = (pseudo: boolean, lengths: Map<string, Token[]>): Lane => ({ pseudo, colour: looseColour, paints: transitionable, lengths, fill: true });

/** What is wrong with one declaration's value (the property is allowed); `pseudo` when the rule is in the pseudo lane. */
function valueIssue(name: string, value: Token[], keyframes: Set<string>, lengths: Map<string, Token[]>, pseudo: boolean): string | undefined {
  const text = writeTokens(value);
  if (value.some((t) => t.t === "delim" && t.v === "!")) return "!important";
  const shaped = shapeIssue(name, value, laneOf(pseudo, lengths));
  if (shaped) return `${name} ${text.slice(0, 40)} ${shaped}`;
  if (/^(fill-|stroke-)?opacity$/.test(name)) {
    const a = amount(value);
    if (a === undefined || a < OPACITY_FLOOR) return `${name} ${text} is under ${OPACITY_FLOOR} or not a plain number`;
  }
  if (/filter$/.test(name) && !readableFilter(value, name !== "filter")) return `${name} ${text} hides or blurs content`;
  if (name === "stroke-width" && !(value.length === 1 && (value[0].n as number) >= STROKE_MIN)) return `stroke-width ${text} is not a plain width of at least ${STROKE_MIN}`;
  if ((name === "box-shadow" || name === "text-shadow") && !shadowWithinCaps(value)) return `${name} ${text.slice(0, 40)} reaches over ${SHADOW_MAX} px (spread over ${SPREAD_MAX})`;
  if (name === "mix-blend-mode" && value.some((t) => t.t === "ident" && BAD_BLEND.test(t.v))) return `mix-blend-mode ${text} recolours what is under it`;
  if (/^background(-size|-position(-x|-y)?)?$/.test(name) && value.some((t) => t.t === "dimension" && Math.abs(px(t) ?? 0) > BG_PX_MAX)) return `${name} ${text.slice(0, 40)} is over ${BG_PX_MAX} px`;
  if (name === "animation" || name === "animation-name") {
    for (let k = 0; k < value.length; k++) {
      const tok = value[k];
      if (tok.t === "function") {
        if (!TIMING_FUNCTIONS.has(tok.v.toLowerCase())) return `animation ${tok.v}() is not a keyframes of this pack`;
        while (k < value.length && value[k].t !== ")") k++;
      } else if ((tok.t === "ident" || tok.t === "string") && !ANIMATION_WORDS.has(tok.v.toLowerCase()) && !keyframes.has(tok.v)) {
        return `animation ${tok.v} is not a keyframes of this pack`;
      }
    }
  }
  return undefined;
}

/** The type selectors and pseudo-classes that reach the page or the shadow host. */
function escapes(selector: Token[]): boolean {
  return selector.some((tok, k) => {
    const prev = selector[k - 1];
    if (tok.t === "ident" && /^(html|body|head)$/i.test(tok.v)) return !(prev?.t === "delim" && prev.v === ".");
    return (tok.t === "ident" || tok.t === "function") && prev?.t === ":" && /^(root|host|host-context)$/i.test(tok.v);
  });
}

/** The milliseconds of the first time in a value (`2s`, `300ms`), or undefined. */
function firstTimeMs(value: Token[]): number | undefined {
  const t = value.find((tok) => tok.t === "dimension" && /^m?s$/i.test(tok.unit ?? ""));
  return t ? (t.n as number) * (t.unit?.toLowerCase() === "s" ? 1000 : 1) : undefined;
}

function lintDeclarations(where: string, rule: Rule, allowed: (name: string) => boolean, keyframes: Set<string>, lengths: Map<string, Token[]>, issues: string[], pseudo = false): void {
  for (const { name, value } of rule.declarations ?? []) {
    if (!allowed(name)) issues.push(`${where}: property ${name} is not a paint property${PSEUDO_ONLY.test(name) && !pseudo ? " of a real element (only a ::before or ::after sets it)" : ""}`);
    else {
      const issue = valueIssue(name, value, keyframes, lengths, pseudo);
      if (issue) issues.push(`${where}: ${issue}`);
    }
  }
  // a loop faster than `LOOP_MIN_MS` flashes, spelled as the shorthand or as the longhands
  const decls = rule.declarations ?? [];
  const looping = decls.some((d) => (d.name === "animation" || d.name === "animation-iteration-count") && d.value.some((t) => t.t === "ident" && t.v.toLowerCase() === "infinite"));
  const duration = firstTimeMs(decls.find((d) => d.name === "animation-duration")?.value ?? decls.find((d) => d.name === "animation")?.value ?? []);
  if (looping && (duration === undefined || duration < LOOP_MIN_MS)) issues.push(`${where}: an animation that repeats runs at least ${LOOP_MIN_MS / 1000} s per cycle`);
}

/**
 * For each of the pack's keyframes a style rule names, whether every rule that names it is in the pseudo lane: only then may its
 * frames move, size or turn a box. A keyframes no rule names is not in the map, and its frames are held to a real element's paint.
 */
function namingLanes(rules: Rule[], keyframes: Set<string>, out = new Map<string, boolean>()): Map<string, boolean> {
  for (const rule of rules) {
    if (rule.at === "media" || rule.at === "supports") namingLanes(rule.rules ?? [], keyframes, out);
    if (rule.at !== undefined) continue;
    const pseudo = pseudoLane(rule.prelude) === "pseudo";
    for (const d of rule.declarations ?? []) {
      if (d.name !== "animation" && d.name !== "animation-name") continue;
      for (const t of d.value) if ((t.t === "ident" || t.t === "string") && keyframes.has(t.v)) out.set(t.v, (out.get(t.v) ?? true) && pseudo);
    }
  }
  return out;
}

const paints = (p: string) => PAINT.test(p) || SHAPED.test(p);

function lintRules(rules: Rule[], top: boolean, keyframes: Set<string>, lengths: Map<string, Token[]>, named: Map<string, boolean>, issues: string[]): void {
  for (const rule of rules) {
    const prelude = writeTokens(rule.prelude);
    if (rule.at === "media" || rule.at === "supports") lintRules(rule.rules ?? [], false, keyframes, lengths, named, issues);
    else if (top && rule.at === "keyframes") {
      if (!(rule.prelude.length === 1 && rule.prelude[0].t === "ident" && OWN.test(rule.prelude[0].v))) issues.push(`@keyframes ${prelude}: name must start with pack-`);
      // a frame paints what the rules that run it may paint; `content` never animates, and a frame starts no animation or transition
      const pseudo = named.get(rule.prelude[0]?.v ?? "") === true;
      const allowed = (p: string) => (paints(p) && !/^(animation|transition|letter-spacing|text-transform|font-variant)/.test(p)) || (pseudo && PSEUDO_ONLY.test(p) && p !== "content");
      for (const frame of rule.rules ?? []) {
        const selector = writeTokens(frame.prelude.filter((t) => t.t !== "ws"));
        if (frame.at !== undefined || !KEYFRAME_SELECTOR.test(selector)) issues.push(`keyframe ${selector.slice(0, 24)}`);
        else lintDeclarations(`keyframe ${selector}`, frame, allowed, keyframes, lengths, issues, pseudo);
      }
    } else if (top && rule.at === "font-face") {
      lintDeclarations("@font-face", rule, (p) => FONT_FACE.test(p), keyframes, lengths, issues);
      for (const d of rule.declarations ?? []) {
        const family = d.value.map((t) => (t.t === "ws" ? " " : t.v)).join("");
        if (d.name === "font-family" && !(d.value.every((t) => t.t === "string" || t.t === "ident" || t.t === "ws") && OWN.test(family))) {
          issues.push(`@font-face: font-family ${writeTokens(d.value)} must start with pack-`);
        }
      }
    } else if (rule.at !== undefined) issues.push(`at-rule @${rule.at}`);
    else {
      if (rule.prelude.length === 0 || escapes(rule.prelude)) issues.push(`selector ${prelude.slice(0, 40)} reaches outside the pack`);
      const lane = pseudoLane(rule.prelude);
      if (lane === undefined) issues.push(`selector ${prelude.slice(0, 40)} names a pseudo-element other than a final ::before or ::after`);
      const pseudo = lane === "pseudo";
      lintDeclarations(`rule ${prelude.slice(0, 24)}`, rule, (p) => paints(p) || (pseudo && PSEUDO_ONLY.test(p)), keyframes, lengths, issues, pseudo);
    }
  }
}

/** What is wrong with a pack's CSS beyond its URLs (`packCssIssues`): CSS the parser refuses, a property that is not paint, a value that hides, a selector outside the pack, an at-rule or `!important`. Empty = paint only. */
export function lintPackCss(css: string): string[] {
  const issues: string[] = [];
  const rules = parseCss(css, issues);
  if (issues.length) return issues;
  const keyframes = new Set(rules.filter((r) => r.at === "keyframes" && r.prelude.length === 1).map((r) => r.prelude[0].v));
  lintRules(rules, true, keyframes, lengthDefinitions(rules), namingLanes(rules, keyframes), issues);
  // what the page gets must parse to the same rules, or the browser and the lint could read it differently
  const text = writeRules(rules);
  if (writeRules(parseCss(text, issues)) !== text) issues.push("css does not read back as written");
  return issues;
}

/** A user pack's URLs as the route serves its files (decision Q3): every url token and every string inside a URL function, rewritten from the tokens to `base` and the file's normalised path. */
function servedFrom(value: Token[], base: string): Token[] {
  const open: string[] = [];
  return value.map((tok) => {
    if (tok.t === "function") open.push(tok.v.toLowerCase().replace(/^-[a-z]+-/, ""));
    else if (tok.t === "(") open.push("(");
    else if (tok.t === ")") open.pop();
    return tok.t === "url" || (tok.t === "string" && open.some((f) => URL_FUNCS.has(f))) ? { ...tok, v: base + packPath(tok.v) } : tok;
  });
}

/** The rules as mounted: a pseudo-lane rule ends in `PSEUDO_BOX`, and with `base` every URL is the route's. */
function mounted(rules: Rule[], base: string | undefined): Rule[] {
  return rules.map((r) => {
    if (r.rules) return { ...r, rules: mounted(r.rules, base) };
    const declarations = (r.declarations ?? []).map((d) => (base ? { ...d, value: servedFrom(d.value, base) } : d));
    return { ...r, declarations: r.at === undefined && pseudoLane(r.prelude) === "pseudo" ? [...declarations, ...PSEUDO_BOX] : declarations };
  });
}

/**
 * The stylesheet that goes in the page, written from the parsed rules: scoped to `[data-look="id"]` inside `@layer look`.
 * `@keyframes` and `@font-face` cannot nest in a scope, so they sit beside it in the layer. Every `::before`/`::after` rule gets
 * `position:absolute;pointer-events:none;z-index:0` after the pack's own declarations. A `user` pack's URLs are rewritten to
 * `/api/packs/<id>/<path>` (a relative one would resolve against the page); a built-in pack's are written as they are. CSS that
 * fails `lintPackCss`, or a user pack's that names a URL outside the pack, gives "" (nothing is mounted).
 */
export function scopePackCss(id: string, css: string, { user = false }: { user?: boolean } = {}): string {
  if (lintPackCss(css).length || (user && packCssIssues(css).length)) return "";
  const rules = mounted(parseCss(css, []), user ? `/api/packs/${encodeURIComponent(id)}/` : undefined);
  const global = (r: Rule) => r.at === "keyframes" || r.at === "font-face";
  return `@layer look{${writeRules(rules.filter(global))}@scope ([data-look=${writeString(id)}]){${writeRules(rules.filter((r) => !global(r)))}}}`;
}
