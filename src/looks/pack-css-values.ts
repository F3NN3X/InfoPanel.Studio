// The value shapes Phase 2 adds to pack CSS (gate 0 §6 and its decisions Q2-Q5), read the same way by both gates: the built-in
// packs' lint (`pack-css`) and the user-pack grammar (`user-css`). Each reader takes a value's tokens and gives what is wrong with
// it, or undefined; a shape it cannot read is wrong (fail closed). A colour is the lane's to read: `user-css` passes its grammar,
// the built-in lint passes `looseColour`.
import { type Rule, type Token, writeTokens } from "./css-syntax";

/** The comma-separated parts of a value, commas inside a function left alone. */
export function commaParts(value: Token[]): Token[][] {
  const parts: Token[][] = [[]];
  let depth = 0;
  for (const tok of value) {
    if (tok.t === "function" || tok.t === "(") depth++;
    else if (tok.t === ")") depth--;
    if (tok.t === "," && depth === 0) parts.push([]);
    else parts[parts.length - 1].push(tok);
  }
  return parts;
}

/** The value's parts at the top level, white space between them dropped: a function and its arguments are one part. */
export function words(value: Token[]): Token[][] {
  const out: Token[][] = [];
  let depth = 0;
  let open = false;
  for (const tok of value) {
    if (tok.t === "ws" && depth === 0) {
      open = false;
      continue;
    }
    if (!open) out.push([]);
    open = true;
    out.at(-1)?.push(tok);
    if (tok.t === "function" || tok.t === "(") depth++;
    else if (tok.t === ")") depth--;
  }
  return out;
}

/** Whether a word is one of these keywords. */
export const isWord = (w: Token[] | undefined, ...names: string[]) => w?.length === 1 && w[0].t === "ident" && names.includes(w[0].v.toLowerCase());
/** Whether a word is one call of one of these functions. */
export const isCall = (w: Token[] | undefined, ...names: string[]) => !!w && w[0]?.t === "function" && names.includes(w[0].v.toLowerCase()) && w.at(-1)?.t === ")";
/** A call's arguments, without the white space at either end. */
export function argsOf(w: Token[]): Token[] {
  let a = 1;
  let b = w.length - 1;
  while (a < b && w[a].t === "ws") a++;
  while (b > a && w[b - 1].t === "ws") b--;
  return w.slice(a, b);
}

/** What a lane says of one colour word: undefined when it reads it, else why not. */
export type ColourCheck = (w: Token[]) => string | undefined;

/** The colour functions a built-in pack may name inside a gradient or a border (no image or URL function hides in one). */
const LOOSE_COLOUR = /^(rgba?|hsla?|hwb|lab|lch|oklab|oklch|color|color-mix|var|calc|light-dark)$/i;
/** The built-in lane's colours: a hash, a keyword or a colour function, with nothing inside it but numbers, names and colour functions. */
export const looseColour: ColourCheck = (w) => {
  const ok = w.every((t) => t.t === "hash" || t.t === "ident" || t.t === "number" || t.t === "percentage" || t.t === "dimension" || t.t === "ws" || t.t === "," || t.t === ")" || t.t === "delim" || (t.t === "function" && LOOSE_COLOUR.test(t.v)));
  // a length alone (a `var()` that was a length, once read) is no colour
  const length = w.length === 1 && (w[0].t === "number" || w[0].t === "percentage" || w[0].t === "dimension");
  return ok && w.length > 0 && !length ? undefined : "is not a colour";
};

/** A length's px and % parts. */
export interface Length {
  px: number;
  pct: number;
}
function literalLength(t: Token | undefined): Length | undefined {
  if (t?.t === "number") return t.n === 0 ? { px: 0, pct: 0 } : undefined;
  if (t?.t === "percentage") return { px: 0, pct: t.n as number };
  return t?.t === "dimension" && t.unit?.toLowerCase() === "px" ? { px: t.n as number, pct: 0 } : undefined;
}
/**
 * A length a clip, a mask or a pseudo-element's box may use (Q4): a px or % literal, a bare 0, or `calc()` of those joined by
 * `+` and `-` only (no `var()`, no nesting, no `*` or `/`). Its px and % parts, or undefined.
 */
export function lengthOf(w: Token[] | undefined): Length | undefined {
  if (!w) return undefined;
  if (w.length === 1) return literalLength(w[0]);
  if (!isCall(w, "calc")) return undefined;
  const inner = argsOf(w);
  const sum = { px: 0, pct: 0 };
  let sign = 1;
  for (let k = 0; ; k += 4) {
    const term = literalLength(inner[k]);
    if (!term) return undefined;
    sum.px += sign * term.px;
    sum.pct += sign * term.pct;
    if (k + 1 === inner.length) return sum;
    const [gap, op, after] = inner.slice(k + 1, k + 4);
    if (gap?.t !== "ws" || op?.t !== "delim" || (op.v !== "+" && op.v !== "-") || after?.t !== "ws") return undefined;
    sign = op.v === "-" ? -1 : 1;
  }
}
/** The token of a px or % literal or a bare 0 held alone (what a `--pack-*` may hold as a length), or undefined. */
export const lengthLiteral = (value: Token[]): Token | undefined => (value.length === 1 && literalLength(value[0]) ? value[0] : undefined);

const PACK_VAR = /^--pack-(?!chrome-)[a-z0-9][a-z0-9-]*$/;
/** Every length a `--pack-*` is given anywhere in the rules (`@media` and keyframes included), each distinct literal once, by name. */
export function lengthDefinitions(rules: Rule[], out = new Map<string, Token[]>()): Map<string, Token[]> {
  for (const r of rules) {
    for (const d of r.declarations ?? []) {
      const tok = PACK_VAR.test(d.name) ? lengthLiteral(d.value) : undefined;
      const known = out.get(d.name) ?? [];
      if (tok && !known.some((t) => writeTokens([t]) === writeTokens([tok]))) out.set(d.name, [...known, tok]);
    }
    lengthDefinitions(r.rules ?? [], out);
  }
  return out;
}

/** The most combinations of definitions a value's length `var()`s are checked in. */
const LENGTH_COMBOS = 64;
/** The name a bare `var(--pack-x)` starting at `at` reads, or undefined (a fallback, a chrome name or a nested call is no bare var). */
const varNameAt = (value: Token[], at: number): string | undefined => {
  const [head, name, close] = value.slice(at, at + 3);
  return head?.t === "function" && head.v.toLowerCase() === "var" && name?.t === "ident" && close?.t === ")" && PACK_VAR.test(name.v) ? name.v : undefined;
};
/**
 * Reads a value with each bare `var(--pack-x)` that names a length of this file replaced by every combination of that name's
 * definitions: it passes only when `read` passes every one (more than 64 combinations are refused). The substituted tokens are for
 * checking; the mounted CSS keeps the `var()`. A var with no length definition is left in the value for `read` to refuse (or, as a colour, to read).
 */
export function viaLengths(value: Token[], lengths: Map<string, Token[]>, read: (value: Token[]) => string | undefined): string | undefined {
  const names = [...new Set(value.flatMap((_, k) => varNameAt(value, k) ?? []))].filter((n) => lengths.has(n));
  if (!names.length) return read(value);
  const combos = names.reduce((n, name) => n * (lengths.get(name) as Token[]).length, 1);
  if (combos > LENGTH_COMBOS) return `has var()s of more than ${LENGTH_COMBOS} combinations of lengths`;
  for (let c = 0; c < combos; c++) {
    let rest = c;
    const chosen = new Map(
      names.map((name) => {
        const defs = lengths.get(name) as Token[];
        const pick = defs[rest % defs.length];
        rest = Math.floor(rest / defs.length);
        return [name, pick] as const;
      })
    );
    const swapped: Token[] = [];
    for (let k = 0; k < value.length; k++) {
      const name = varNameAt(value, k);
      const pick = name === undefined ? undefined : chosen.get(name);
      if (pick) {
        swapped.push(pick);
        k += 2;
      } else swapped.push(value[k]);
    }
    const why = read(swapped);
    if (why) return why;
  }
  return undefined;
}

/** A px literal or a bare 0, as px. */
function pxOf(w: Token[] | undefined): number | undefined {
  const l = w?.length === 1 ? literalLength(w[0]) : undefined;
  return l && l.pct === 0 ? l.px : undefined;
}
/** An angle in degrees: `deg`, `turn` (and `rad`, `grad` when `any`), or a bare 0. */
function degOf(w: Token[] | undefined, units: Record<string, number>): number | undefined {
  const t = w?.length === 1 ? w[0] : undefined;
  if (t?.t === "number") return t.n === 0 ? 0 : undefined;
  const per = t?.t === "dimension" ? units[t.unit?.toLowerCase() ?? ""] : undefined;
  return per === undefined ? undefined : (t?.n as number) * per;
}
const TURN = { deg: 1, turn: 360 };
const ANY_ANGLE = { deg: 1, turn: 360, rad: 180 / Math.PI, grad: 0.9 };
const num = (w: Token[] | undefined) => (w?.length === 1 && w[0].t === "number" ? (w[0].n as number) : undefined);

/** The words of each comma part of a call's arguments. */
const callParts = (w: Token[]) => commaParts(argsOf(w)).map(words);

/** The most points a `polygon()` clip may have. */
const POLYGON_MAX = 64;
/** `clip-path`: `none`, `inset(<l>{1,4} [round <px>{1,4}])` or `polygon([nonzero|evenodd,] <l> <l>, ...)` of 3 to 64 points. */
export function clipPathIssue(value: Token[]): string | undefined {
  const [w, ...rest] = words(value);
  if (rest.length) return "is not one inset() or polygon() (a geometry box or a second shape is not read)";
  if (isWord(w, "none")) return undefined;
  if (isCall(w, "inset")) {
    const parts = words(argsOf(w));
    const r = parts.findIndex((p) => isWord(p, "round"));
    const box = r < 0 ? parts : parts.slice(0, r);
    const round = r < 0 ? [] : parts.slice(r + 1);
    const ok = box.length >= 1 && box.length <= 4 && box.every((p) => lengthOf(p)) && (r < 0 || (round.length >= 1 && round.length <= 4 && round.every((p) => (pxOf(p) ?? -1) >= 0)));
    return ok ? undefined : "is not inset() of px, % or calc() lengths with an optional round of px";
  }
  if (isCall(w, "polygon")) {
    const parts = callParts(w);
    const points = parts[0]?.length === 1 && isWord(parts[0][0], "nonzero", "evenodd") ? parts.slice(1) : parts;
    const ok = points.length >= 3 && points.length <= POLYGON_MAX && points.every((p) => p.length === 2 && lengthOf(p[0]) && lengthOf(p[1]));
    return ok ? undefined : `is not polygon() of 3 to ${POLYGON_MAX} points of px, % or calc() lengths`;
  }
  return "is not none, inset() or polygon()";
}

const SIDES = ["top", "bottom", "left", "right"];
const RADIAL_WORDS = ["circle", "ellipse", "closest-side", "closest-corner", "farthest-side", "farthest-corner"];
const POSITION_WORDS = ["left", "right", "top", "bottom", "center"];

/** Whether a gradient's first part is a direction (`to right`, an angle) or a radial shape (`circle at 50% 0`). */
function gradientHead(radial: boolean, head: Token[][]): boolean {
  if (!radial) return (head.length === 1 && degOf(head[0], ANY_ANGLE) !== undefined) || (isWord(head[0], "to") && head.length >= 2 && head.length <= 3 && head.slice(1).every((p) => isWord(p, ...SIDES)));
  const at = head.findIndex((p) => isWord(p, "at"));
  const shape = at < 0 ? head : head.slice(0, at);
  const where = at < 0 ? [] : head.slice(at + 1);
  return shape.every((p) => isWord(p, ...RADIAL_WORDS) || (pxOf(p) ?? -1) >= 0) && (at < 0 || (where.length >= 1 && where.length <= 2 && where.every((p) => isWord(p, ...POSITION_WORDS) || lengthOf(p))));
}

/**
 * A `linear-`/`radial-gradient()` (and their `repeating-` forms): an optional direction or shape, then at least two stops, each a
 * colour of the lane and up to two px, % or calc() positions. Anything else (`conic-`, `image()`, a url) is refused.
 */
export function gradientIssue(w: Token[], colour: ColourCheck): string | undefined {
  if (!isCall(w, "linear-gradient", "radial-gradient", "repeating-linear-gradient", "repeating-radial-gradient")) return "is not a linear- or radial-gradient()";
  const radial = /radial/i.test(w[0].v);
  const parts = callParts(w);
  const stops = parts[0]?.length && gradientHead(radial, parts[0]) ? parts.slice(1) : parts;
  if (stops.length < 2) return "has fewer than two colour stops";
  for (const [c, ...at] of stops) {
    const why = c ? colour(c) : "is empty";
    if (why) return `stop ${why}`;
    if (at.length > 2 || !at.every((p) => lengthOf(p))) return "has a stop position that is not px, % or calc()";
  }
  return undefined;
}

/** A `url(...)` word: a url token, or `url(` and a string. */
export const urlOf = (w: Token[] | undefined): string | undefined => {
  if (w?.length === 1 && w[0].t === "url") return w[0].v;
  if (!isCall(w, "url")) return undefined;
  const a = argsOf(w as Token[]);
  return a.length === 1 && a[0].t === "string" ? a[0].v : undefined;
};

/** `mask-image` (+ `-webkit-`), and the image of a `mask`: `none`, a gradient, or a pack file's `url()` (the render check samples its alpha over the text). */
export function maskImageIssue(value: Token[], colour: ColourCheck): string | undefined {
  const [w, ...rest] = words(value);
  if (rest.length || commaParts(value).length > 1) return "is more than one mask image";
  if (isWord(w, "none")) return undefined;
  if (urlOf(w) !== undefined) return undefined;
  return gradientIssue(w, colour);
}

/** The largest mask size or position a pack may give in px (as `background-size`, pack-css `BG_PX_MAX`). */
export const MASK_PX_MAX = 4096;
const REPEATS = ["repeat", "no-repeat", "repeat-x", "repeat-y", "space", "round"];
const withinPx = (l: Length | undefined) => !!l && Math.abs(l.px) <= MASK_PX_MAX;

function maskSizeOk(parts: Token[][]): boolean {
  if (parts.length === 1 && isWord(parts[0], "cover", "contain")) return true;
  return parts.length >= 1 && parts.length <= 2 && parts.every((p) => isWord(p, "auto") || (withinPx(lengthOf(p)) && (lengthOf(p) as Length).px >= 0 && (lengthOf(p) as Length).pct >= 0));
}
const maskPositionOk = (parts: Token[][]) => parts.length >= 1 && parts.length <= 4 && parts.every((p) => isWord(p, ...POSITION_WORDS) || withinPx(lengthOf(p)));
const maskRepeatOk = (parts: Token[][]) => parts.length >= 1 && parts.length <= 2 && parts.every((p) => isWord(p, ...REPEATS)) && (parts.length === 1 || !parts.some((p) => isWord(p, "repeat-x", "repeat-y")));

/** `mask-size`, `mask-repeat`, `mask-position` (+ `-webkit-`): one layer, keywords and px/% within `MASK_PX_MAX`. */
export function maskPartIssue(name: string, value: Token[]): string | undefined {
  const parts = words(value);
  if (commaParts(value).length > 1) return "is more than one layer";
  const ok = /size$/.test(name) ? maskSizeOk(parts) : /repeat$/.test(name) ? maskRepeatOk(parts) : maskPositionOk(parts);
  return ok ? undefined : `is not a ${name.replace(/^-webkit-/, "")} of keywords and px or % within ${MASK_PX_MAX} px`;
}

/** The `mask` shorthand (+ `-webkit-`): `<image> [<position> [/ <size>]] [<repeat>]`, one layer, each part as its longhand; no mode, composite or box keyword. */
export function maskIssue(value: Token[], colour: ColourCheck): string | undefined {
  if (commaParts(value).length > 1) return "is more than one mask layer";
  const [image, ...rest] = words(value);
  if (!image) return "is empty";
  const imageWhy = maskImageIssue(image, colour);
  if (imageWhy) return imageWhy;
  const slash = rest.findIndex((p) => p.length === 1 && p[0].t === "delim" && p[0].v === "/");
  const firstRepeat = rest.findIndex((p) => isWord(p, ...REPEATS));
  const repeat = firstRepeat < 0 ? [] : rest.slice(firstRepeat);
  const before = firstRepeat < 0 ? rest : rest.slice(0, firstRepeat);
  const position = slash < 0 ? before : before.slice(0, slash);
  const size = slash < 0 ? [] : before.slice(slash + 1);
  if (position.length && !maskPositionOk(position)) return "has a position that is not keywords or px/%";
  if (slash >= 0 && (!position.length || !maskSizeOk(size))) return "has a size that is not keywords or px/% after a position";
  if (repeat.length && !maskRepeatOk(repeat)) return "has more than a repeat after the size";
  return undefined;
}

/** The scale a pseudo-element may take, and the most it may skew (deg). */
const SCALE_MIN = 0.5;
const SCALE_MAX = 1.1;
const SKEW_MAX = 20;
const scaleOk = (w: Token[] | undefined) => (num(w) ?? -1) >= SCALE_MIN && (num(w) ?? 2) <= SCALE_MAX;
const skewOk = (w: Token[] | undefined) => Math.abs(degOf(w, { deg: 1 }) ?? Infinity) <= SKEW_MAX;
const rotateOk = (w: Token[] | undefined) => degOf(w, TURN) !== undefined;

/** One transform function with its arguments in the caps: translate px/%, rotate deg/turn, scale 0.5-1.1, skew within 20deg. */
function transformFunctionOk(w: Token[]): boolean {
  const name = w[0]?.t === "function" ? w[0].v.toLowerCase() : "";
  if (!isCall(w, name)) return false;
  const a = callParts(w);
  const one = a.length === 1 && a[0].length === 1;
  const each = (ok: (p: Token[]) => boolean, most: number) => a.length >= 1 && a.length <= most && a.every((p) => p.length === 1 && ok(p[0]));
  if (name === "translate") return each((p) => !!lengthOf(p), 2);
  if (name === "translatex" || name === "translatey") return one && !!lengthOf(a[0][0]);
  if (name === "rotate") return one && rotateOk(a[0][0]);
  if (name === "scale") return each(scaleOk, 2);
  if (name === "scalex" || name === "scaley") return one && scaleOk(a[0][0]);
  if (name === "skew") return each(skewOk, 2);
  if (name === "skewx" || name === "skewy") return one && skewOk(a[0][0]);
  return false;
}

/** `transform`, `translate`, `rotate`, `scale` and `transform-origin` (pseudo-elements only): 2D, in the caps, no `matrix*`, `perspective`, `*3d`, `*Z` or `var()`. */
export function transformIssue(name: string, value: Token[]): string | undefined {
  const parts = words(value);
  if (name !== "transform-origin" && parts.length === 1 && isWord(parts[0], "none")) return undefined;
  const ok =
    name === "transform" ? parts.length > 0 && parts.every(transformFunctionOk)
    : name === "translate" ? parts.length >= 1 && parts.length <= 2 && parts.every((p) => lengthOf(p))
    : name === "rotate" ? parts.length === 1 && rotateOk(parts[0])
    : name === "scale" ? parts.length >= 1 && parts.length <= 2 && parts.every(scaleOk)
    : parts.length >= 1 && parts.length <= 2 && parts.every((p) => isWord(p, ...POSITION_WORDS) || lengthOf(p));
  return ok ? undefined : `is not a 2D ${name} in the caps (translate px/%, rotate deg/turn, scale ${SCALE_MIN}-${SCALE_MAX}, skew within ${SKEW_MAX}deg)`;
}

/** The most characters a pseudo-element's `content` string holds. */
export const CONTENT_MAX = 64;
const PACK_ATTR = /^data-pack-[a-z0-9][a-z0-9-]*$/;
/** `content` (pseudo-elements only): `none`, `normal`, one string of at most 64 characters, `counter(<name>)` or `attr(data-pack-*)`. */
export function contentIssue(value: Token[]): string | undefined {
  const parts = words(value);
  const [w] = parts;
  if (parts.length !== 1) return "is not one value";
  if (isWord(w, "none", "normal")) return undefined;
  if (w.length === 1 && w[0].t === "string") return [...w[0].v].length <= CONTENT_MAX ? undefined : `is a string over ${CONTENT_MAX} characters`;
  const a = isCall(w, "counter", "attr") ? argsOf(w) : [];
  if (a.length === 1 && a[0].t === "ident" && (isCall(w, "counter") || PACK_ATTR.test(a[0].v))) return undefined;
  return "is not none, normal, one string, counter() or attr(data-pack-*)";
}

/** `inset`, `top`, `right`, `bottom`, `left`, `width`, `height` (pseudo-elements only): `auto`, or px/%/calc() that is not negative. */
export function boxIssue(name: string, value: Token[]): string | undefined {
  const parts = words(value);
  const ok = parts.length >= 1 && parts.length <= (name === "inset" ? 4 : 1) && parts.every((p) => {
    if (isWord(p, "auto")) return true;
    const l = lengthOf(p);
    return !!l && l.pct >= 0 && (l.pct > 0 || l.px >= 0);
  });
  return ok ? undefined : "is not auto or a px, % or calc() length that is not negative";
}

/** The largest corner a pack may round, in px and in % of the box. */
const RADIUS_PX_MAX = 64;
const RADIUS_PCT_MAX = 50;
const radiusOk = (w: Token[]) => {
  const l = w.length === 1 ? literalLength(w[0]) : undefined;
  return !!l && l.px >= 0 && l.px <= RADIUS_PX_MAX && l.pct >= 0 && l.pct <= RADIUS_PCT_MAX;
};
/** `border-radius` and its four corners: px up to 64, % up to 50 (the shorthand with an optional `/` between its two radii). */
export function radiusIssue(name: string, value: Token[]): string | undefined {
  const parts = words(value);
  const slash = parts.findIndex((p) => p.length === 1 && p[0].t === "delim" && p[0].v === "/");
  const groups = slash < 0 ? [parts] : [parts.slice(0, slash), parts.slice(slash + 1)];
  const most = name === "border-radius" ? 4 : 2;
  const ok = (name === "border-radius" || slash < 0) && groups.every((g) => g.length >= 1 && g.length <= most && g.every(radiusOk));
  return ok ? undefined : `is not px up to ${RADIUS_PX_MAX} or % up to ${RADIUS_PCT_MAX}`;
}

/** The widest `border-image-width` in px; a number is a multiple of the border's own width, so at most 1. */
const BORDER_IMAGE_PX_MAX = 8;
/** `border-image-width` (a number up to 1 or px up to 8, one to four) and `border-image-outset` (`0`: an outset paints over the neighbour). */
export function borderImageIssue(name: string, value: Token[]): string | undefined {
  const parts = words(value);
  if (name === "border-image-outset") return parts.length === 1 && num(parts[0]) === 0 ? undefined : "is not 0";
  const ok = parts.length >= 1 && parts.length <= 4 && parts.every((p) => {
    const n = num(p);
    if (n !== undefined) return n >= 0 && n <= 1;
    const px = pxOf(p);
    return px !== undefined && px >= 0 && px <= BORDER_IMAGE_PX_MAX;
  });
  return ok ? undefined : `is not a number up to 1 or px up to ${BORDER_IMAGE_PX_MAX}`;
}

const REPEAT_KEYWORDS = ["stretch", "repeat", "round", "space"];
const sliceWord = (w: Token[]) => (w.length === 1 && (w[0].t === "number" || w[0].t === "percentage")) || isWord(w, "fill");
const sizeWord = (w: Token[]) => (w.length === 1 && (w[0].t === "number" || w[0].t === "dimension" || w[0].t === "percentage")) || isWord(w, "auto");
const spaced = (ws: Token[][]): Token[] => ws.flatMap((w, k) => (k ? [{ t: "ws", v: " " } as Token, ...w] : w));
/**
 * The `border-image` shorthand: `<source> || <slice> [/ <width> [/ <outset>]] || <repeat>`, read into its parts and each held to its
 * longhand: the source `none`, a url or a gradient of the lane's colours, a slice of one to four non-negative numbers or percentages
 * (a `fill` only where the lane's longhand takes it), the width as `border-image-width`, the outset `0`, one or two repeat keywords.
 */
export function borderImageShorthandIssue(value: Token[], lane: Lane): string | undefined {
  const bad = "is not <source> <slice> [/ <width> [/ <outset>]] <repeat>, each part as its longhand";
  const segments: Token[][] = [[]];
  let depth = 0;
  for (const tok of value) {
    if (tok.t === "function" || tok.t === "(") depth++;
    else if (tok.t === ")") depth--;
    if (depth === 0 && tok.t === "delim" && tok.v === "/") segments.push([]);
    else segments[segments.length - 1].push(tok);
  }
  if (segments.length > 3) return bad;
  const [head, ...tail] = segments.map(words);
  const at = head.flatMap((w, k) => (sliceWord(w) ? [k] : []));
  if (!at.every((k, i) => i === 0 || k === at[i - 1] + 1) || (tail.length && at.at(-1) !== head.length - 1)) return bad;
  const slice = at.map((k) => head[k]);
  const rest = head.filter((_, k) => !at.includes(k));
  const sizes: Token[][][] = [];
  for (const [s, ws] of tail.entries()) {
    const lead = ws.findIndex((w) => !sizeWord(w));
    const size = lead < 0 ? ws : ws.slice(0, lead);
    if (!size.length || (s < tail.length - 1 && size.length !== ws.length)) return bad;
    sizes.push(size);
    if (s === tail.length - 1) rest.push(...ws.slice(size.length));
  }
  const fills = slice.filter((w) => isWord(w, "fill"));
  const numbers = slice.filter((w) => !isWord(w, "fill"));
  if (slice.length && (numbers.length < 1 || numbers.length > 4 || fills.length > 1 || (fills.length > 0 && !lane.fill) || numbers.some((w) => (w[0].n as number) < 0))) {
    return `has a slice that is not one to four non-negative numbers or percentages${lane.fill ? "" : " (no fill)"}`;
  }
  const repeats = rest.filter((w) => isWord(w, ...REPEAT_KEYWORDS));
  const sources = rest.filter((w) => !repeats.includes(w));
  if (sources.length > 1 || repeats.length > 2 || (!slice.length && !rest.length)) return bad;
  const [source] = sources;
  if (source && !isWord(source, "none") && urlOf(source) === undefined) {
    const why = gradientIssue(source, lane.colour);
    if (why) return `has a source that ${why}`;
  }
  const width = sizes[0] && borderImageIssue("border-image-width", spaced(sizes[0]));
  if (width) return `has a width that ${width}`;
  const outset = sizes[1] && borderImageIssue("border-image-outset", spaced(sizes[1]));
  return outset && `has an outset that ${outset}`;
}

/** How far an outline may sit from its box, either way. */
const OUTLINE_OFFSET_MAX = 8;
/** `outline-offset`: px from -8 to 8. */
export function outlineOffsetIssue(value: Token[]): string | undefined {
  const parts = words(value);
  const px = parts.length === 1 ? pxOf(parts[0]) : undefined;
  return px !== undefined && Math.abs(px) <= OUTLINE_OFFSET_MAX ? undefined : `is not px from -${OUTLINE_OFFSET_MAX} to ${OUTLINE_OFFSET_MAX}`;
}

/** The widest border a pseudo-element may draw. */
const BORDER_PX_MAX = 4;
const BORDER_STYLES = ["solid", "dashed", "dotted", "double"];
/** The styles a real element's border may take; `none` is the bare default. */
const REAL_BORDER_STYLES = ["none", ...BORDER_STYLES];
/** A word that gives a border its width: a length or number, `thin`, `medium`, `thick` or a `calc()`. */
const widthWord = (w: Token[]) => (w.length === 1 && (w[0].t === "number" || w[0].t === "dimension" || w[0].t === "percentage")) || isWord(w, "thin", "medium", "thick") || isCall(w, "calc");
/**
 * The `border` shorthand. On a pseudo-element: `<px up to 4> <style> <colour>`. On a real element a width would move the card (G2),
 * and a style alone gives a `medium` border its 3 px (the render check compares the widths with bare): a style and an optional
 * colour, either order, no width token.
 */
export function borderIssue(value: Token[], lane: Lane): string | undefined {
  const parts = words(value);
  if (!lane.pseudo) {
    const styles = parts.filter((p) => isWord(p, ...REAL_BORDER_STYLES));
    const [other, ...more] = parts.filter((p) => !styles.includes(p));
    const bad = `is not one of ${REAL_BORDER_STYLES.join("|")} and an optional <colour>, with no width token`;
    if (styles.length !== 1 || more.length || (other && widthWord(other))) return bad;
    const why = other && lane.colour(other);
    return why && `colour ${why}`;
  }
  const px = pxOf(parts[0]);
  if (parts.length !== 3 || px === undefined || px < 0 || px > BORDER_PX_MAX || !isWord(parts[1], ...BORDER_STYLES)) return `is not <px up to ${BORDER_PX_MAX}> <${BORDER_STYLES.join("|")}> <colour>`;
  const why = lane.colour(parts[2]);
  return why && `colour ${why}`;
}
/** `border-style`: one to four of the styles (the render check refuses a style that adds a width). */
export function borderStyleIssue(value: Token[]): string | undefined {
  const parts = words(value);
  return parts.length >= 1 && parts.length <= 4 && parts.every((p) => isWord(p, ...REAL_BORDER_STYLES)) ? undefined : `is not one to four of ${REAL_BORDER_STYLES.join("|")}`;
}

/** The keywords a timing function may be, and the functions. */
export const TIMING_WORDS = ["linear", "ease", "ease-in", "ease-out", "ease-in-out", "step-start", "step-end"];
const STEP_WORDS = ["start", "end", "jump-start", "jump-end", "jump-none", "jump-both"];
/** A timing function: a keyword, or `cubic-bezier()`, `steps()` or `linear()` of numbers, percentages and step positions. */
export function timingOk(w: Token[]): boolean {
  if (isWord(w, ...TIMING_WORDS)) return true;
  if (!isCall(w, "cubic-bezier", "steps", "linear")) return false;
  return callParts(w).every((p) => p.length >= 1 && p.every((q) => q.length === 1 && (q[0].t === "number" || q[0].t === "percentage" || (q[0].t === "ident" && STEP_WORDS.includes(q[0].v.toLowerCase())))));
}
/** A time in ms, or undefined. */
export function msOf(w: Token[] | undefined): number | undefined {
  const t = w?.length === 1 ? w[0] : undefined;
  if (t?.t !== "dimension" || !/^m?s$/i.test(t.unit ?? "")) return undefined;
  return (t.n as number) * (t.unit?.toLowerCase() === "s" ? 1000 : 1);
}

/** The longest a transition runs (ms). */
export const TRANSITION_MAX_MS = 2000;
const durationOk = (w: Token[]) => (msOf(w) ?? -1) >= 0 && (msOf(w) as number) <= TRANSITION_MAX_MS;
const delayOk = (w: Token[]) => (msOf(w) ?? -1) >= 0;

/**
 * `transition` and its four longhands: each property named one the lane paints (`paints`; never `all`, a custom property, geometry
 * or `content`), durations up to 2 s, delays not negative, timing functions as `animation`. The shorthand names its property in
 * every part: one left out is `all`.
 */
export function transitionIssue(name: string, value: Token[], paints: (property: string) => boolean): string | undefined {
  const parts = commaParts(value).map(words);
  const propertyOk = (w: Token[]) => w.length === 1 && w[0].t === "ident" && paints(w[0].v.toLowerCase()) && !w[0].v.startsWith("--");
  const whole = (ok: (w: Token[]) => boolean) => parts.every((p) => p.length === 1 && ok(p[0]));
  if (parts.length === 1 && parts[0].length === 1 && isWord(parts[0][0], "none") && (name === "transition" || name === "transition-property")) return undefined;
  let ok: boolean;
  if (name === "transition-property") ok = whole(propertyOk);
  else if (name === "transition-duration") ok = whole(durationOk);
  else if (name === "transition-delay") ok = whole(delayOk);
  else if (name === "transition-timing-function") ok = whole(timingOk);
  else {
    ok = parts.every((p) => {
      const property = p.filter((w) => w.length === 1 && w[0].t === "ident" && !TIMING_WORDS.includes(w[0].v.toLowerCase()));
      const times = p.filter((w) => msOf(w) !== undefined);
      const timing = p.filter((w) => !property.includes(w) && !times.includes(w));
      return property.length === 1 && propertyOk(property[0]) && times.length <= 2 && (!times[0] || durationOk(times[0])) && (!times[1] || delayOk(times[1])) && timing.length <= 1 && timing.every(timingOk);
    });
  }
  return ok ? undefined : `is not a transition of named paint properties, up to ${TRANSITION_MAX_MS / 1000} s, with no negative delay`;
}

/** Properties only a `::before`/`::after` may set: they move, size or fill a box, which on a real element would move the widget (G2). */
export const PSEUDO_ONLY = /^(transform(-origin)?|translate|rotate|scale|content|inset|top|right|bottom|left|width|height)$/;

/** How a selector's comma parts end: each in `::before` or `::after` ("pseudo"), none ("real"), some ("mixed"); undefined for any other pseudo-element, one not at the end, or the single-colon spelling. */
export function pseudoLane(selector: Token[]): "pseudo" | "real" | "mixed" | undefined {
  let pseudo = 0;
  const parts = commaParts(selector).map((p) => p.filter((t, k) => !(t.t === "ws" && (k === 0 || k === p.length - 1))));
  for (const part of parts) {
    let ends = false;
    for (let k = 0; k < part.length; k++) {
      if (part[k].t !== ":") continue;
      if (part[k + 1]?.t === ":") {
        const el = part[k + 2];
        if (!(el?.t === "ident" && /^(before|after)$/i.test(el.v)) || k + 3 !== part.length) return undefined;
        ends = true;
        k++;
      } else if (part[k + 1]?.t === "ident" && /^(before|after|first-line|first-letter)$/i.test(part[k + 1].v)) return undefined;
    }
    if (ends) pseudo++;
  }
  return pseudo === 0 ? "real" : pseudo === parts.length ? "pseudo" : "mixed";
}

/** What a lane says of a Phase 2 property's value. */
export interface Lane {
  /** The rule's every selector ends in `::before` or `::after`. */
  pseudo: boolean;
  colour: ColourCheck;
  /** The properties a transition may name. */
  paints: (property: string) => boolean;
  /** The lengths each `--pack-*` is given in this file (`lengthDefinitions`). */
  lengths: Map<string, Token[]>;
  /** Whether `border-image-slice` takes `fill` in this lane. */
  fill: boolean;
}

/** What is wrong with the value of a Phase 2 property (`clip-path`, masks, transforms, `content`, a pseudo box, radii, border images, outline offset, `border`, transitions); undefined for any other property. Which element may set it is the lane's to say. */
export function shapeIssue(name: string, value: Token[], lane: Lane): string | undefined {
  return viaLengths(value, lane.lengths, (v) => shapeRead(name, v, lane));
}

function shapeRead(name: string, value: Token[], lane: Lane): string | undefined {
  if (name === "clip-path") return clipPathIssue(value);
  if (/^(-webkit-)?mask-image$/.test(name)) return maskImageIssue(value, lane.colour);
  if (/^(-webkit-)?mask-(size|repeat|position)$/.test(name)) return maskPartIssue(name, value);
  if (/^(-webkit-)?mask$/.test(name)) return maskIssue(value, lane.colour);
  if (/^(transform(-origin)?|translate|rotate|scale)$/.test(name)) return transformIssue(name, value);
  if (name === "content") return contentIssue(value);
  if (/^(inset|top|right|bottom|left|width|height)$/.test(name)) return boxIssue(name, value);
  if (/^border(-(top|bottom)-(left|right))?-radius$/.test(name)) return radiusIssue(name, value);
  if (/^border-image-(width|outset)$/.test(name)) return borderImageIssue(name, value);
  if (name === "border-image") return borderImageShorthandIssue(value, lane);
  if (name === "outline-offset") return outlineOffsetIssue(value);
  if (name === "border") return borderIssue(value, lane);
  if (name === "border-style") return borderStyleIssue(value);
  if (/^transition(-(property|duration|delay|timing-function))?$/.test(name)) return transitionIssue(name, value, lane.paints);
  return undefined;
}
