// Animated SVG in a pack (Cyberspec v2 round 3): the subset of animation a pack SVG may carry, read by the validator's SVG
// reader (`svgIssue`, pack-safety.ts). A `<style>` holds `@keyframes` and rules that only start them, on `.class` or `#id`
// selectors; a keyframe moves `transform`, `opacity` or `stroke-dashoffset` and nothing else. SMIL `<animate>` animates
// `opacity` or `stroke-dashoffset` of its parent and `<animateTransform>` its `transform`, with clock values and numbers only.
// A cycle lasts at least a second and holds at most seven steps, so an opacity animation dips at most three times a second.
// Nothing here can name a file, a URL, a script or another element. Whether the SVG moves at all is the app's (pack-stage.tsx):
// a stage layer that declares `animated` draws its moving file only where the screen allows motion, and a still copy otherwise.

/** At most this many elements of one SVG animate (SMIL elements, and elements a style rule animates). */
export const SVG_ANIMATED_MAX = 24;
/** The shortest cycle, ms: an animation of a pack SVG never repeats faster than once a second. */
export const SVG_CYCLE_MIN_MS = 1000;
/** At most this many steps in one cycle (keyframe stops, SMIL `values`): with a cycle of a second at least, at most three dips a second. */
export const SVG_STEPS_MAX = 7;

/** The SMIL elements a pack SVG may hold, and their attributes. */
export const SMIL_ELEMENTS: ReadonlySet<string> = new Set(["animate", "animatetransform"]);
export const SMIL_ATTRIBUTES: ReadonlySet<string> = new Set("id attributename type from to by values dur begin repeatcount repeatdur keytimes keysplines calcmode additive accumulate restart fill".split(" "));
/** What each SMIL element may animate. */
const SMIL_TARGETS: Readonly<Record<string, readonly string[]>> = { animate: ["opacity", "stroke-dashoffset"], animatetransform: ["transform"] };
const TRANSFORM_TYPES = ["translate", "scale", "rotate", "skewX", "skewY"];
const SMIL_WORDS: Readonly<Record<string, readonly string[]>> = {
  calcmode: ["discrete", "linear", "paced", "spline"],
  additive: ["replace", "sum"],
  accumulate: ["none", "sum"],
  restart: ["always", "whenNotActive", "never"],
  fill: ["freeze", "remove"],
};
/** Numbers and the separators of a list of them: no letter but an exponent, so no function, name or URL. */
const NUMBERS = /^[\d\s.,;eE+\-%]*$/;
const CLOCK = /^\s*(\d+(?:\.\d+)?)(ms|s|min|h)?\s*$/;
const UNIT_MS: Readonly<Record<string, number>> = { ms: 1, s: 1000, min: 60_000, h: 3_600_000 };

/** A SMIL clock value in ms (`2s`, `1500ms`, `3`: seconds), or undefined. */
export function clockMs(value: string): number | undefined {
  const m = CLOCK.exec(value);
  return m ? Number(m[1]) * UNIT_MS[m[2] ?? "s"] : undefined;
}

/** The first thing wrong with one SMIL element's attributes (names lower case), undefined when it is in the subset. */
export function smilIssue(element: string, attrs: ReadonlyMap<string, string>): string | undefined {
  const at = `<${element}>`;
  const target = attrs.get("attributename");
  if (!target || !SMIL_TARGETS[element]?.includes(target)) return `${at} animates ${SMIL_TARGETS[element]?.join(" or ") ?? "nothing"} only`;
  const type = attrs.get("type");
  if (element === "animatetransform" ? !type || !TRANSFORM_TYPES.includes(type) : type !== undefined) return element === "animatetransform" ? `${at} type: ${TRANSFORM_TYPES.join(", ")}` : `${at} takes no type`;
  const dur = clockMs(attrs.get("dur") ?? "");
  if (dur === undefined || dur < SVG_CYCLE_MIN_MS) return `${at} dur: a clock value of at least ${SVG_CYCLE_MIN_MS / 1000} s`;
  const begin = attrs.get("begin");
  if (begin !== undefined && !begin.split(";").every((b) => clockMs(b) !== undefined)) return `${at} begin: clock values only`;
  const repeat = attrs.get("repeatcount");
  if (repeat !== undefined && repeat !== "indefinite" && !(Number(repeat) > 0)) return `${at} repeatCount: a number or indefinite`;
  const repeatDur = attrs.get("repeatdur");
  if (repeatDur !== undefined && repeatDur !== "indefinite" && clockMs(repeatDur) === undefined) return `${at} repeatDur: a clock value or indefinite`;
  for (const key of ["from", "to", "by", "values", "keytimes", "keysplines"]) {
    const v = attrs.get(key);
    if (v !== undefined && !NUMBERS.test(v)) return `${at} ${key}: numbers only`;
  }
  if ((attrs.get("values") ?? "").split(";").length > SVG_STEPS_MAX) return `${at} values: at most ${SVG_STEPS_MAX} in a cycle`;
  for (const [key, words] of Object.entries(SMIL_WORDS)) {
    const v = attrs.get(key);
    if (v !== undefined && !words.includes(v)) return `${at} ${key}: ${words.join(", ")}`;
  }
  return undefined;
}

// ---- the <style> grammar -------------------------------------------------------------------------------------------------

/** The characters a pack SVG's `<style>` may hold: no quote, slash (so no comment), backslash, `&`, `<`, `>`, `!`, `*` or bracket. */
const SHEET_CHARS = /^[A-Za-z0-9\s.#%@{}:;,()+_-]*$/;
const IDENT = /^-?[A-Za-z_][\w-]*$/;
const SELECTOR = /^[.#][A-Za-z_][\w-]*$/;
const NUM = "-?(?:\\d+\\.?\\d*|\\.\\d+)";
const TRANSFORM_FN = `(?:translate|translateX|translateY|scale|scaleX|scaleY|rotate|skewX|skewY)\\(\\s*${NUM}(?:px|deg|turn|rad|%)?(?:\\s*,?\\s*${NUM}(?:px|deg|turn|rad|%)?){0,2}\\s*\\)`;
const TRANSFORM = new RegExp(`^(?:none|(?:\\s*${TRANSFORM_FN})+)\\s*$`);
const TIMING = new RegExp(`^(?:linear|ease|ease-in|ease-out|ease-in-out|step-start|step-end|steps\\(\\s*\\d+\\s*(?:,\\s*(?:jump-start|jump-end|jump-none|jump-both|start|end)\\s*)?\\)|cubic-bezier\\(\\s*${NUM}\\s*,\\s*${NUM}\\s*,\\s*${NUM}\\s*,\\s*${NUM}\\s*\\))$`);
const TIME = /^(-?(?:\d+\.?\d*|\.\d+))(ms|s)$/;
const timeMs = (v: string): number | undefined => {
  const m = TIME.exec(v);
  return m ? Number(m[1]) * (m[2] === "s" ? 1000 : 1) : undefined;
};
const WORDS = (...w: string[]) => new RegExp(`^(?:${w.join("|")})$`);
/** What a keyframe may set. */
const FRAME_VALUES: Readonly<Record<string, RegExp>> = {
  transform: TRANSFORM,
  opacity: /^(?:0|1|0?\.\d+|1\.0+|\d{1,2}%|100%)$/,
  "stroke-dashoffset": new RegExp(`^${NUM}(?:px|%)?$`),
  "animation-timing-function": TIMING,
};
const DIRECTION = WORDS("normal", "reverse", "alternate", "alternate-reverse");
const FILL_MODE = WORDS("none", "forwards", "backwards", "both");
const PLAY_STATE = WORDS("running", "paused");
const COUNT = /^(?:infinite|\d+(?:\.\d+)?)$/;
/** What a rule may set: it only starts an animation and places its origin. */
const RULE_VALUES: Readonly<Record<string, RegExp | ((v: string) => boolean)>> = {
  "animation-name": IDENT,
  "animation-duration": (v) => (timeMs(v) ?? 0) >= SVG_CYCLE_MIN_MS,
  "animation-delay": (v) => timeMs(v) !== undefined,
  "animation-timing-function": TIMING,
  "animation-iteration-count": COUNT,
  "animation-direction": DIRECTION,
  "animation-fill-mode": FILL_MODE,
  "animation-play-state": PLAY_STATE,
  "transform-origin": new RegExp(`^(?:(?:${NUM}(?:px|%)?|left|right|center|top|bottom)\\s*){1,3}$`),
  "transform-box": WORDS("fill-box", "view-box", "stroke-box", "border-box", "content-box"),
};

/** The parts of an `animation` shorthand (one animation, no list): its name and duration, or a reason it is refused. */
function shorthand(value: string): { name?: string; ms?: number } | string {
  if (value.includes(",") && !/\([^)]*,/.test(value)) return "animation: one animation, not a list";
  const parts = value.match(/[\w.-]+\([^)]*\)|[^\s]+/g) ?? [];
  let name: string | undefined;
  let ms: number | undefined;
  for (const p of parts) {
    const t = timeMs(p);
    if (t !== undefined) {
      if (ms === undefined) ms = t;
      continue;
    }
    if (TIMING.test(p) || COUNT.test(p) || DIRECTION.test(p) || FILL_MODE.test(p) || PLAY_STATE.test(p)) continue;
    if (!IDENT.test(p) || name !== undefined) return `animation: ${p.slice(0, 30)} is not a part of an animation`;
    name = p;
  }
  return { name, ms };
}

/** One `prop: value` list, split; undefined when a declaration has no colon. */
function declarations(body: string): [string, string][] | undefined {
  const out: [string, string][] = [];
  for (const d of body.split(";")) {
    if (!d.trim()) continue;
    const k = d.indexOf(":");
    if (k < 0) return undefined;
    out.push([d.slice(0, k).trim().toLowerCase(), d.slice(k + 1).trim()]);
  }
  return out;
}

/** What a `<style>` animates: the `.class` and `#id` selectors of the rules that start an animation, or the first thing outside the grammar. */
export function svgSheetIssue(sheet: string): { issue: string } | { animates: string[] } {
  if (!SHEET_CHARS.test(sheet)) return { issue: "a <style> holds a character outside its grammar (a quote, slash, backslash, &, <, >, !, * or bracket)" };
  const animates: string[] = [];
  const names = new Set<string>();
  const used: string[] = [];
  let at = 0;
  const block = (from: number): { body: string; end: number } | undefined => {
    const end = sheet.indexOf("}", from);
    return end < 0 ? undefined : { body: sheet.slice(from, end), end: end + 1 };
  };
  for (;;) {
    while (at < sheet.length && /\s/.test(sheet[at])) at++;
    if (at >= sheet.length) break;
    const open = sheet.indexOf("{", at);
    if (open < 0) return { issue: "a <style> rule without its block" };
    const head = sheet.slice(at, open).trim();
    if (head.startsWith("@")) {
      const m = /^@keyframes\s+(-?[A-Za-z_][\w-]*)$/.exec(head);
      if (!m) return { issue: `the at-rule ${head.slice(0, 30)} is not @keyframes` };
      names.add(m[1]);
      at = open + 1;
      let steps = 0;
      for (;;) {
        while (at < sheet.length && /\s/.test(sheet[at])) at++;
        if (sheet[at] === "}") {
          at++;
          break;
        }
        const inner = sheet.indexOf("{", at);
        if (inner < 0) return { issue: `@keyframes ${m[1]} is not closed` };
        const stops = sheet.slice(at, inner).split(",").map((s) => s.trim());
        if (!stops.every((s) => /^(?:from|to|\d{1,3}(?:\.\d+)?%)$/.test(s))) return { issue: `@keyframes ${m[1]}: a stop is from, to or a percentage` };
        steps += stops.length;
        const b = block(inner + 1);
        const decls = b && declarations(b.body);
        if (!b || !decls) return { issue: `@keyframes ${m[1]}: a step that cannot be read` };
        for (const [k, v] of decls) if (!FRAME_VALUES[k]?.test(v)) return { issue: `@keyframes ${m[1]}: a keyframe moves transform, opacity or stroke-dashoffset only (${k.slice(0, 30)})` };
        at = b.end;
      }
      if (steps > SVG_STEPS_MAX) return { issue: `@keyframes ${m[1]} has ${steps} steps, at most ${SVG_STEPS_MAX}` };
      continue;
    }
    const selectors = head.split(",").map((s) => s.trim());
    if (!selectors.every((s) => SELECTOR.test(s))) return { issue: `the selector ${head.slice(0, 30)} is not one .class or #id` };
    const b = block(open + 1);
    const decls = b && declarations(b.body);
    if (!b || !decls || b.body.includes("{")) return { issue: `the rule ${head.slice(0, 30)} cannot be read` };
    let starts = false;
    for (const [k, v] of decls) {
      if (k === "animation") {
        const s = shorthand(v);
        if (typeof s === "string") return { issue: s };
        if (s.name && s.name !== "none") {
          if ((s.ms ?? 0) < SVG_CYCLE_MIN_MS) return { issue: `animation ${s.name}: a cycle of at least ${SVG_CYCLE_MIN_MS / 1000} s` };
          used.push(s.name);
          starts = true;
        }
        continue;
      }
      const rule = RULE_VALUES[k];
      if (!rule) return { issue: `a <style> rule sets ${k.slice(0, 30)}: it may only start an animation (animation, animation-*, transform-origin, transform-box)` };
      if (!(typeof rule === "function" ? rule(v) : rule.test(v))) return { issue: `${k} ${v.slice(0, 30)} is not a value it takes${k === "animation-duration" ? ` (at least ${SVG_CYCLE_MIN_MS / 1000} s)` : ""}` };
      if (k === "animation-name" && v !== "none") {
        used.push(v);
        starts = true;
      }
    }
    if (starts) animates.push(...selectors);
    at = b.end;
  }
  const missing = used.find((n) => !names.has(n));
  if (missing) return { issue: `animation ${missing.slice(0, 30)} names no @keyframes of this file` };
  return { animates };
}
