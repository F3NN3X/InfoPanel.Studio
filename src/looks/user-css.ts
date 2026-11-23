// The grammar of a user pack's CSS (L94): a reader that accepts only what it positively recognises. The built-in packs' rules
// (`lintPackCss`, the validator's `hiddenPaintIssues`) are a deny-list over free CSS, which cannot say what stays visible (decision
// log, P12a fix round 1), so they are not what guards a user pack. This one is an allow-list: a selector is the documented `data-part`
// slots and the two plain combinators, optionally ending in `::before` or `::after` (the pseudo lane); a declaration is a property of
// the short lists below, each value its own shape (Phase 2's in `pack-css-values`); a colour is a hex or `rgb()` literal, a
// `color-mix()` of those, or a `var(--pack-*)` that resolves to one in the same file; a `--pack-*` may instead hold one px or %
// literal (or a bare 0), which a bare `var(--pack-*)` stands for wherever a shape reads a length (checked in every value it can take). The only at-rule is `@keyframes pack-*`. A
// `url()` names a file of the pack and only on the card or a pseudo-element (decision Q3: the mount rewrites it to the pack's route,
// `scopePackCss`); no `!important`, no fallback, no function beyond those. Passing this says only that the file is plain: whether the
// pack keeps content readable is the render check's (`pack-render-check`), and whether the check ran is what the server's signature
// records (packs.rs).
import { parseColour } from "./colour";
import { parseCss, type Declaration, type Rule, type Token, tokenize, writeTokens } from "./css-syntax";
import { ANIMATION_WORDS, lintPackCss, OPACITY_FLOOR } from "./pack-css";
import { type ColourCheck, commaParts, gradientIssue, isWord, lengthDefinitions, lengthLiteral, msOf, PSEUDO_ONLY, shapeIssue, timingOk, urlOf, viaLengths, words } from "./pack-css-values";
import { isPackRelativeUrl, packCssIssues } from "./pack-urls";

/** The hooks a pack may paint (spec 03, Level 3 hooks, and the three later ones the built-ins use). */
const SLOTS = new Set(["card", "header", "label", "num", "unit", "ring", "bar", "meter", "spark", "threshold", "range", "fader", "icon", "chip", "button", "status", "alert", "tab", "legend", "mono"]);
/** The slots that are marks: a background on one is its track or its value's backdrop, and would hide what the mark draws. */
const MARKS = new Set(["ring", "bar", "meter", "spark", "threshold", "range", "fader", "icon"]);
/** Custom properties the app itself sets (`--pack-chrome-fill`): a pack's own are any other `--pack-*`. */
const RESERVED = /^--pack-chrome-/;
const CUSTOM = /^--pack-[a-z0-9][a-z0-9-]*$/;
const HEX = /^([\da-f]{3,4}|[\da-f]{6}|[\da-f]{8})$/i;
/** The colour spaces a `color-mix()` may mix in. */
const MIX_SPACES = new Set(["srgb", "srgb-linear", "oklab", "oklch", "hsl"]);

/** Properties that hold one colour. Text and marks keep at least `OPACITY_FLOOR` of it; `box` ones paint a box, so never a mark. */
const COLOURS: Record<string, { ink?: boolean; box?: boolean }> = {
  color: { ink: true },
  fill: { ink: true },
  stroke: { ink: true },
  "text-decoration-color": {},
  "caret-color": {},
  "accent-color": {},
  background: { box: true },
  "background-color": { box: true },
  "border-color": { box: true },
  "border-top-color": { box: true },
  "border-right-color": { box: true },
  "border-bottom-color": { box: true },
  "border-left-color": { box: true },
  "outline-color": { box: true },
};
/** A plain number from..to. */
const NUMBERS: Record<string, readonly [number, number]> = { opacity: [OPACITY_FLOOR, 1], "stroke-width": [0.5, 8] };
/** Shadows stay at the box they belong to: a spread or a long offset paints over the neighbour, which no measure can see. */
const SHADOW_OFFSET_MAX = 4;
const SHADOW_BLUR_MAX = 12;
/** Phase 2's properties (gate 0 §6), each read by its shape; the `PSEUDO_ONLY` ones on a `::before`/`::after` alone. */
const SHAPED = /^(clip-path|(-webkit-)?mask(-image|-size|-repeat|-position)?|border(-(top|bottom)-(left|right))?-radius|border-image(-(width|outset))?|outline-offset|letter-spacing|text-transform|font-variant-numeric|transition(-(property|duration|delay|timing-function))?|transform(-origin)?|translate|rotate|scale|content|inset|top|right|bottom|left|width|height|border(-style)?)$/;
/** What only the card or a pseudo-element may set on top of that: a clip, rounded corners, a border image. */
const CARD_OR_PSEUDO = /^(clip-path|border(-(top|bottom)-(left|right))?-radius|border-image(-.*)?)$/;
const ANIMATIONS = /^animation(-(name|duration|delay|iteration-count|direction|fill-mode|play-state|timing-function))?$/;
/** What a transition may name: the paint this grammar reads, never geometry, `content` or a custom property. */
const TRANSITIONS = /^(color|fill|stroke|text-decoration-color|caret-color|accent-color|background-color|border(-(top|right|bottom|left))?-color|outline-color|opacity|stroke-width|box-shadow|text-shadow|clip-path|outline-offset|(-webkit-)?mask-(size|position)|border(-(top|bottom)-(left|right))?-radius)$/;

/** A colour as read: a literal's alpha, the custom property it names, or the two colours a `color-mix()` mixes. */
type Read = { alpha: number } | { ref: string } | { mix: [Read, Read] };

/**
 * One colour value: a hex token, an `rgb()`/`rgba()` of plain numbers, a bare `var(--pack-x)` or a `color-mix()` of two of those
 * (not of another mix). `transparent` only where `stop` says (a gradient stop, a mix's colour). Anything else is undefined.
 */
function readColour(value: Token[], { stop = false, mixed = false } = {}): Read | undefined {
  const [head] = value;
  if (value.length === 1 && head.t === "hash" && HEX.test(head.v)) return literal(value);
  if (stop && value.length === 1 && head.t === "ident" && head.v.toLowerCase() === "transparent") return { alpha: 0 };
  if (head?.t !== "function" || value.at(-1)?.t !== ")" || words(value).length !== 1) return undefined;
  const inner = value.slice(1, -1);
  const name = head.v.toLowerCase();
  if (name === "var") return inner.length === 1 && inner[0].t === "ident" && CUSTOM.test(inner[0].v) && !RESERVED.test(inner[0].v) ? { ref: inner[0].v } : undefined;
  if (name === "color-mix") return mixed ? undefined : mixOf(inner);
  if (name !== "rgb" && name !== "rgba") return undefined;
  const plain = inner.every((t) => t.t === "number" || t.t === "percentage" || t.t === "ws" || t.t === "," || (t.t === "delim" && t.v === "/"));
  const numbers = inner.filter((t) => t.t === "number" || t.t === "percentage");
  const channels = numbers.slice(0, 3).every((t) => (t.n as number) >= 0 && (t.n as number) <= (t.t === "number" ? 255 : 100));
  const alpha = numbers[3] === undefined || ((numbers[3].n as number) >= 0 && (numbers[3].n as number) <= (numbers[3].t === "number" ? 1 : 100));
  return plain && (numbers.length === 3 || numbers.length === 4) && channels && alpha ? literal(value) : undefined;
}

function literal(value: Token[]): Read | undefined {
  const colour = parseColour(writeTokens(value));
  return colour?.hex ? { alpha: colour.alpha } : undefined;
}

/** `color-mix(in <space>, <colour> [<p>%], <colour> [<p>%])`, its arguments as read; undefined for any other shape. */
function mixOf(args: Token[]): Read | undefined {
  const [space, ...colours] = commaParts(args).map(words);
  const spaced = space?.length === 2 && isWord(space[0], "in") && space[1].length === 1 && space[1][0].t === "ident" && MIX_SPACES.has(space[1][0].v.toLowerCase());
  if (!spaced || colours.length !== 2) return undefined;
  const reads = colours.map(([c, share, ...rest]) => {
    const p = share?.length === 1 && share[0].t === "percentage" ? (share[0].n as number) : share === undefined ? 0 : -1;
    return c && rest.length === 0 && p >= 0 && p <= 100 ? readColour(c, { stop: true, mixed: true }) : undefined;
  });
  return reads[0] && reads[1] ? { mix: [reads[0], reads[1]] } : undefined;
}

/** A file's own limits: a crafted one can chain definitions so a walk without a memo would take 2^n steps. */
const MAX_DEFINITIONS = 8;
const MAX_DECLARATIONS = 2000;

/** The custom properties the file defines, each with every colour it was given, and what each resolved to (an alpha, or the reason it did not); and the lengths it gave each. */
type Defined = { names: Map<string, Read[]>; done: Map<string, number | string>; lengths: Map<string, Token[]> };

/** The lowest alpha a colour can resolve to, or a reason it does not resolve in this file: every definition is followed, and a loop is no colour.
 * A name is walked once, refusals included (a name that reaches a refusal is refused whichever way it got there), so a walk costs one step per definition.
 * A mix is as opaque as the less opaque of its two colours (conservative: its own shares are not counted). */
function resolve(read: Read, defined: Defined, trail: Set<string> = new Set()): number | string {
  if ("alpha" in read) return read.alpha;
  if ("mix" in read) {
    const [a, b] = read.mix.map((r) => resolve(r, defined, trail));
    return typeof a === "string" ? a : typeof b === "string" ? b : Math.min(a, b);
  }
  const known = defined.done.get(read.ref);
  if (known !== undefined) return known;
  if (trail.has(read.ref)) return `var(${read.ref}) loops`;
  const values = defined.names.get(read.ref);
  if (!values) return `var(${read.ref}) is not defined in this file`;
  trail.add(read.ref);
  let least: number | string = 1;
  for (const value of values) {
    const alpha = resolve(value, defined, trail);
    if (typeof alpha === "string") {
      least = alpha;
      break;
    }
    least = Math.min(least, alpha);
  }
  trail.delete(read.ref);
  defined.done.set(read.ref, least);
  return least;
}

/** The lane's colour for a gradient stop, a mask or a border: read, and resolved in this file. */
const stopColour = (defined: Defined): ColourCheck => (w) => {
  const read = readColour(w, { stop: true });
  if (!read) return "is not a hex, rgb(), color-mix(), transparent or var(--pack-*) colour";
  const alpha = resolve(read, defined);
  return typeof alpha === "string" ? alpha : undefined;
};

/** A shadow's px, or undefined: a dimension in px or a bare 0. */
const shadowPx = (word: Token[]): number | undefined => {
  const [tok] = word;
  if (word.length !== 1) return undefined;
  if (tok.t === "number") return tok.n === 0 ? 0 : undefined;
  return tok.t === "dimension" && tok.unit === "px" ? (tok.n as number) : undefined;
};

/** What is wrong with one shadow: `[inset] x y [blur] colour`, no spread and no list. */
function shadowIssue(value: Token[], box: boolean, defined: Defined): string | undefined {
  const parts = words(value);
  if (box && parts[0]?.length === 1 && parts[0][0].t === "ident" && parts[0][0].v.toLowerCase() === "inset") parts.shift();
  const colour = parts.pop();
  const lengths = parts.map(shadowPx);
  if (!colour || (lengths.length !== 2 && lengths.length !== 3) || lengths.some((n) => n === undefined)) return "is not one shadow of x, y, an optional blur and a colour";
  const [x, y, blur = 0] = lengths as number[];
  if (Math.abs(x) > SHADOW_OFFSET_MAX || Math.abs(y) > SHADOW_OFFSET_MAX || blur < 0 || blur > SHADOW_BLUR_MAX) return `reaches past ${SHADOW_OFFSET_MAX} px of offset or ${SHADOW_BLUR_MAX} px of blur`;
  const read = readColour(colour);
  if (!read) return "does not end in a hex or rgb() colour or a var(--pack-*)";
  const alpha = resolve(read, defined);
  return typeof alpha === "string" ? alpha : undefined;
}

/** What a rule paints: the slot of each selector, whether every one ends in `::before`/`::after`, and whether each is the card or a pseudo-element. */
interface Lane {
  slots: string[];
  pseudo: boolean;
  cardOrPseudo: boolean;
}
/** One selector: the slot it paints, and whether it ends in `::before`/`::after`. */
interface Subject {
  slot: string;
  pseudo: boolean;
}
const laneOf = (parts: Subject[]): Lane => ({ slots: parts.map((p) => p.slot), pseudo: parts.length > 0 && parts.every((p) => p.pseudo), cardOrPseudo: parts.length > 0 && parts.every((p) => p.pseudo || p.slot === "card") });
/** A keyframes no rule names paints for no one: a real element's lane, with no slot. */
const NOBODY: Lane = { slots: [], pseudo: false, cardOrPseudo: false };
const merged = (a: Lane, b: Lane): Lane => ({ slots: [...a.slots, ...b.slots], pseudo: a.pseudo && b.pseudo, cardOrPseudo: a.cardOrPseudo && b.cardOrPseudo });

/** A file of the pack: relative by `isPackRelativeUrl`, and with no query or fragment (the route serves files, `packPath`). */
const fileIssue = (url: string) => (isPackRelativeUrl(url) && !/[?#]/.test(url) ? undefined : `url ${url.slice(0, 40)} is not a file of the pack (a relative path, no query or fragment)`);

/** A background or border image: `none`, one gradient, or one url() of a pack file, on the card or a pseudo-element only. */
function imageIssue(text: string, value: Token[], lane: Lane, colour: ColourCheck, lengths: Map<string, Token[]>): string | undefined {
  if (!lane.cardOrPseudo) return `${text}: only the card or a ::before or ::after paints an image`;
  const [w, ...rest] = words(value);
  if (rest.length || !w) return `${text} is not one gradient or url()`;
  if (isWord(w, "none")) return undefined;
  if (urlOf(w) !== undefined) return undefined;
  const why = viaLengths(w, lengths, (v) => gradientIssue(v, colour));
  return why && `${text} ${why}`;
}

/** An animation value of the file's own keyframes, times, counts, keywords and timing functions (the names and loop speed are `lintPackCss`'s). */
function animationOk(value: Token[], keyframes: Set<string>): boolean {
  return commaParts(value).every((part) => {
    const ws = words(part);
    return ws.length > 0 && ws.every((w) => msOf(w) !== undefined || timingOk(w) || (w.length === 1 && ((w[0].t === "number" && (w[0].n as number) >= 0) || (w[0].t === "ident" && (ANIMATION_WORDS.has(w[0].v.toLowerCase()) || keyframes.has(w[0].v))))));
  });
}

/** What is wrong with one declaration on a rule that paints `lane`. */
function declarationIssue({ name, value }: Declaration, lane: Lane, defined: Defined, keyframes: Set<string>): string | undefined {
  const text = `${name}: ${writeTokens(value).slice(0, 40)}`;
  if (name.startsWith("--")) {
    if (!CUSTOM.test(name) || RESERVED.test(name)) return `${name} is not a custom property of the pack`;
    if (lengthLiteral(value)) return defined.names.has(name) ? `${text}: ${name} is given a colour as well as a length in this file` : undefined;
    if (!readColour(value)) return `${text} is not a hex or rgb() colour, a var(--pack-*) or one px or % length`;
    if (defined.lengths.has(name)) return `${text}: ${name} is given a length as well as a colour in this file`;
    const alpha = resolve({ ref: name }, defined);
    return typeof alpha === "string" ? `${text}: ${alpha}` : undefined;
  }
  for (const w of words(value)) {
    const url = urlOf(w);
    const why = url === undefined ? undefined : fileIssue(url);
    if (why) return `${text}: ${why}`;
  }
  const marked = lane.slots.find((s) => MARKS.has(s));
  if (PSEUDO_ONLY.test(name) && !lane.pseudo) return `property ${name} is set only on a ::before or ::after`;
  // the render check reads a mask's alpha over text, not over a mark's stroke, so a mark is never masked
  if (/^(-webkit-)?mask/.test(name) && marked && !lane.pseudo) return `${name} would fade the mark ${marked} draws`;
  const colour = Object.hasOwn(COLOURS, name) ? COLOURS[name] : undefined;
  if (colour) {
    if (colour.box && marked) return `${name} paints the box of ${marked}, which would hide the mark it draws`;
    const read = readColour(value);
    if (!read && name === "background") return imageIssue(text, value, lane, stopColour(defined), defined.lengths);
    if (!read) return `${text} is not a hex or rgb() colour or a var(--pack-*)`;
    const alpha = resolve(read, defined);
    if (typeof alpha === "string") return `${text}: ${alpha}`;
    return colour.ink && alpha < OPACITY_FLOOR ? `${text} is under ${OPACITY_FLOOR} opaque` : undefined;
  }
  const range = Object.hasOwn(NUMBERS, name) ? NUMBERS[name] : undefined;
  if (range) return value.length === 1 && value[0].t === "number" && (value[0].n as number) >= range[0] && (value[0].n as number) <= range[1] ? undefined : `${text} is not a number from ${range[0]} to ${range[1]}`;
  if (name === "box-shadow" || name === "text-shadow") {
    if (name === "box-shadow" && marked) return `box-shadow paints the box of ${marked}, which would hide the mark it draws`;
    const issue = shadowIssue(value, name === "box-shadow", defined);
    return issue && `${text} ${issue}`;
  }
  if (name === "background-image" || name === "border-image-source" || CARD_OR_PSEUDO.test(name)) {
    if (!lane.cardOrPseudo) return `property ${name} is set only on the card or a ::before or ::after`;
    if (name === "background-image" || name === "border-image-source") return imageIssue(text, value, lane, stopColour(defined), defined.lengths);
  }
  if ((name === "border" || name === "border-style") && marked) return `${name} paints the box of ${marked}, which would hide the mark it draws`;
  if (name === "border-image-slice") {
    const ws = words(value);
    return ws.length >= 1 && ws.length <= 4 && ws.every((w) => w.length === 1 && (w[0].t === "number" || w[0].t === "percentage") && (w[0].n as number) >= 0) ? undefined : `${text} is not one to four numbers or percentages (no fill)`;
  }
  if (name === "border-image-repeat") {
    const ws = words(value);
    return ws.length >= 1 && ws.length <= 2 && ws.every((w) => isWord(w, "stretch", "repeat", "round", "space")) ? undefined : `${text} is not stretch, repeat, round or space`;
  }
  if (SHAPED.test(name)) {
    const why = shapeIssue(name, value, { pseudo: lane.pseudo, colour: stopColour(defined), paints: (p) => TRANSITIONS.test(p), lengths: defined.lengths, fill: false });
    return why && `${text} ${why}`;
  }
  if (ANIMATIONS.test(name)) return animationOk(value, keyframes) ? undefined : `${text} is not the file's own keyframes, times and timing`;
  return `property ${name} is not one a pack may set`;
}

/** The slot of one compound (`[data-part="num"]`), read from `at`; undefined for anything else. */
function slotAt(part: Token[], at: number): string | undefined {
  const [open, attr, is, name, close] = part.slice(at, at + 5);
  const exact = open?.t === "[" && attr?.t === "ident" && attr.v === "data-part" && is?.t === "delim" && is.v === "=" && name?.t === "string" && close?.t === "]";
  return exact && SLOTS.has(name.v) ? name.v : undefined;
}

/** What one selector paints, or undefined: compounds of one known slot each, joined by a descendant or a child combinator, then optionally `::before` or `::after`. */
function subject(part: Token[]): Subject | undefined {
  const tokens = part.filter((t, k) => !(t.t === "ws" && (k === 0 || k === part.length - 1)));
  let at = 0;
  for (;;) {
    const slot = slotAt(tokens, at);
    if (slot === undefined) return undefined;
    at += 5;
    if (at === tokens.length) return { slot, pseudo: false };
    const [a, b, el] = tokens.slice(at, at + 3);
    if (a?.t === ":" && b?.t === ":" && el?.t === "ident" && (el.v === "before" || el.v === "after") && at + 3 === tokens.length) return { slot, pseudo: true };
    const from = at;
    if (tokens[at]?.t === "ws") at++;
    if (tokens[at]?.t === "delim" && tokens[at].v === ">") at += tokens[at + 1]?.t === "ws" ? 2 : 1;
    if (at === from) return undefined;
  }
}

/** The lane each keyframes runs in: every rule that names it, together (a keyframes that a real element runs may not move a box). */
function keyframeLanes(rules: Rule[], keyframes: Set<string>): Map<string, Lane> {
  const out = new Map<string, Lane>();
  for (const rule of rules) {
    const parts = rule.at === undefined ? commaParts(rule.prelude).map(subject) : [];
    if (!parts.length || parts.some((p) => p === undefined)) continue;
    const lane = laneOf(parts as Subject[]);
    for (const d of rule.declarations ?? []) {
      if (d.name !== "animation" && d.name !== "animation-name") continue;
      for (const t of d.value) if (t.t === "ident" && keyframes.has(t.v)) out.set(t.v, out.has(t.v) ? merged(out.get(t.v) as Lane, lane) : lane);
    }
  }
  return out;
}

function ruleIssues(rule: Rule, defined: Defined, keyframes: Set<string>, lanes: Map<string, Lane>): string[] {
  const where = writeTokens(rule.prelude).slice(0, 40);
  if (rule.at === "keyframes") {
    const name = rule.prelude.length === 1 && rule.prelude[0].t === "ident" && /^pack-/.test(rule.prelude[0].v) ? rule.prelude[0].v : undefined;
    if (!name) return [`@keyframes ${where}: a pack's keyframes are named pack-*`];
    const lane = lanes.get(name) ?? NOBODY;
    // a frame paints what the rules that run it may paint; `content` never animates, and a frame starts no animation or transition
    return (rule.rules ?? []).flatMap((frame) =>
      (frame.declarations ?? []).flatMap((d) => {
        const issue = /^(content|animation|transition|letter-spacing|text-transform|font-variant)/.test(d.name) ? `property ${d.name} is not one a keyframe may set` : declarationIssue(d, lane, defined, keyframes);
        return issue ? [`@keyframes ${name}: ${issue}`] : [];
      })
    );
  }
  if (rule.at !== undefined) return [`at-rule @${rule.at}: a user pack's CSS has style rules and @keyframes pack-* only`];
  const parts = commaParts(rule.prelude).map(subject);
  if (rule.prelude.length === 0 || parts.some((s) => s === undefined)) return [`selector ${where} is not the data-part slots`];
  const lane = laneOf(parts as Subject[]);
  return (rule.declarations ?? []).flatMap((d) => {
    const issue = declarationIssue(d, lane, defined, keyframes);
    return issue ? [`${where}: ${issue}`] : [];
  });
}

/** What is wrong with a user pack's CSS, one line each. Empty means every part of it was recognised; nothing else does. */
export function userCssIssues(css: string): string[] {
  const syntax: string[] = [];
  const rules = parseCss(css, syntax);
  if (syntax.length) return syntax;
  // the parser reads `@-webkit-keyframes` as `@keyframes`; the server's deny-list and this grammar take the plain name only
  const prefixed = tokenize(css).find((t) => t.t === "at" && t.v.startsWith("-"));
  if (prefixed) return [`at-rule @${prefixed.v}: a user pack's CSS has style rules and @keyframes pack-* only`];
  // the server's deny-list (`css_deny`) reads the text, not the tokens: a string holding `@`, `<` or `\` passes here but is never signed
  const unsignable = tokenize(css).find((t) => t.t === "string" && /[@<\\]/.test(t.v));
  if (unsignable) return [`string ${writeTokens([unsignable]).slice(0, 40)}: a user pack's strings may not hold @, < or \\ (the server refuses them)`];
  if (!rules.some((r) => r.declarations?.length)) return ["the file holds no rule"];
  const declarations = rules.reduce((n, r) => n + (r.declarations?.length ?? 0) + (r.rules ?? []).reduce((m, f) => m + (f.declarations?.length ?? 0), 0), 0);
  if (declarations > MAX_DECLARATIONS) return [`the file holds ${declarations} declarations, more than the ${MAX_DECLARATIONS} a pack may have`];
  const defined: Defined = { names: new Map(), done: new Map(), lengths: lengthDefinitions(rules) };
  for (const rule of rules) {
    for (const d of rule.declarations ?? []) {
      if (!d.name.startsWith("--")) continue;
      const read = readColour(d.value);
      if (read) defined.names.set(d.name, [...(defined.names.get(d.name) ?? []), read]);
    }
  }
  const crowded = [...defined.names].find(([, reads]) => reads.length > MAX_DEFINITIONS);
  if (crowded) return [`${crowded[0]} is defined ${crowded[1].length} times, more than the ${MAX_DEFINITIONS} a pack may give one property`];
  const keyframes = new Set(rules.flatMap((r) => (r.at === "keyframes" && r.prelude.length === 1 && r.prelude[0].t === "ident" ? [r.prelude[0].v] : [])));
  const lanes = keyframeLanes(rules, keyframes);
  const issues = rules.flatMap((r) => ruleIssues(r, defined, keyframes, lanes));
  // what the loader reads the mounted file with: the grammar sits inside it, and a disagreement refuses the file
  return issues.length ? issues : [...packCssIssues(css), ...lintPackCss(css)];
}
