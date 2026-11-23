// A Look's T3 values (src/looks/t3.ts) as the SkinTokens the drawing code reads. Only a value that differs from Classic's
// maps to a token, so Classic (and a skin Look, which carries Classic's T3) draws exactly as before. Free-form CSS values
// (fills) pass `safeFill` / `safeGradient` first: a pack is untrusted, and a fill goes into a style.
import type { CSSProperties } from "react";
import { STATUS } from "@/looks/status";
import type { SkinTokens } from "./types";

const COLOUR_FNS = ["rgb", "rgba", "hsl", "hsla", "hwb", "lab", "lch", "oklab", "oklch", "color", "color-mix"];
const GRADIENT_FNS = ["linear-gradient", "radial-gradient", "conic-gradient", "repeating-linear-gradient", "repeating-radial-gradient", "repeating-conic-gradient"];
// Letters, digits and the punctuation of colour stops; no `;{}\@"'`, so no escape, comment (`/*` is checked) or at-rule.
const PLAIN = /^[\w\s#%.,()+\-/]+$/;
const GRADIENT = /^(repeating-)?(linear|radial|conic)-gradient\(/;
const COLOUR_CALL = /^(rgba?|hsla?|hwb|lab|lch|oklab|oklch|color|color-mix)\(/i;
const LONE_COLOUR = /^(#[0-9a-f]{3,8}|[a-z]+|var\(--w-[\w-]+\))$/i;

/** True when every `name(` in `css` is a colour function, a gradient, or `var(--w-*)`, and the brackets balance. */
function callsAreSafe(css: string): boolean {
  let depth = 0;
  for (const ch of css) {
    depth += ch === "(" ? 1 : ch === ")" ? -1 : 0;
    if (depth < 0) return false;
  }
  if (depth !== 0) return false;
  for (const [, name, arg] of css.matchAll(/([a-z-]*)\((?=([^)]{0,4}))/gi)) {
    const fn = name.toLowerCase();
    if (fn === "var" ? arg !== "--w-" : fn !== "" && !COLOUR_FNS.includes(fn) && !GRADIENT_FNS.includes(fn)) return false;
  }
  return true;
}

const plain = (css: string) => css.length <= 400 && PLAIN.test(css) && !css.includes("/*") && callsAreSafe(css);

/** A gradient with colour stops (colours, `var(--w-*)`), else undefined. */
export function safeGradient(value: unknown): string | undefined {
  const css = typeof value === "string" ? value.trim() : "";
  return GRADIENT.test(css) && plain(css) ? css : undefined;
}

/** A gradient, a colour (hex, colour function, keyword) or a `var(--w-*)`, else undefined; `none` is not a fill. */
export function safeFill(value: unknown): string | undefined {
  const css = typeof value === "string" ? value.trim() : "";
  if (css.toLowerCase() === "none") return undefined;
  return LONE_COLOUR.test(css) || (COLOUR_CALL.test(css) && plain(css)) ? css : safeGradient(css);
}

/** The colour stops of a gradient `safeGradient` passed, for an SVG `linearGradient` (which cannot take a CSS one); undefined under two stops. */
export function gradientStops(css: string | undefined): { colour: string; offset?: number }[] | undefined {
  const inner = css && /^[a-z-]*gradient\((.*)\)$/.exec(css.trim())?.[1];
  if (!inner) return undefined;
  const parts: string[] = [];
  let depth = 0;
  let cur = "";
  for (const ch of inner) {
    depth += ch === "(" ? 1 : ch === ")" ? -1 : 0;
    if (ch === "," && depth === 0) {
      parts.push(cur.trim());
      cur = "";
    } else cur += ch;
  }
  parts.push(cur.trim());
  if (/^(to |[\d.-]+(deg|rad|turn|grad)\b|from |at |circle|ellipse|closest|farthest|in )/i.test(parts[0])) parts.shift();
  const stops = parts.map((p) => {
    const at = /\s+(-?[\d.]+)%$/.exec(p);
    return at ? { colour: p.slice(0, at.index), offset: Number(at[1]) } : { colour: p };
  });
  return stops.length >= 2 ? stops : undefined;
}

const STRETCH_WORDS = ["ultra-condensed", "extra-condensed", "condensed", "semi-condensed", "semi-expanded", "expanded", "extra-expanded", "ultra-expanded"] as const;
const GRAPH_STYLES = ["line", "step", "bars", "dots", "braille"] as const;

/** A `font-stretch` keyword or a percentage from 50 % to 200 %, else undefined; `normal` is the default and maps to nothing. */
function safeStretch(value: unknown): string | undefined {
  const css = typeof value === "string" ? value.trim().toLowerCase() : "";
  if ((STRETCH_WORDS as readonly string[]).includes(css)) return css;
  const pct = /^(\d{2,3}(?:\.\d{1,2})?)%$/.exec(css);
  return pct && Number(pct[1]) >= 50 && Number(pct[1]) <= 200 ? css : undefined;
}

// Classic's own values (src/looks/t3.ts, pinned by tests/widgets/core/t3-tokens.test.tsx): a Look that sets these changes nothing.
// The validator holds a time to 50 ms to 2 s and a stroke to 0.5 to 8 px; a style value cannot end its declaration, so the reader only checks the shape.
const TIME = /^\d+(\.\d+)?m?s$/;
const EASE = /^(linear|ease|ease-in|ease-out|ease-in-out|cubic-bezier\([\d.,\s-]+\))$/;
const MOTION = [["motion-fast", "motionFast", "150ms", TIME], ["motion-base", "motionBase", "300ms", TIME], ["ease-standard", "ease", "cubic-bezier(.2,0,0,1)", EASE]] as const;

const oneOf = <T extends string>(value: unknown, names: readonly T[]): T | undefined => names.find((n) => n === value);
/** The text roles a `label-color` alias may name, as the card's variables (so a variant that recolours the role recolours the labels). */
const LABEL_ALIAS: Readonly<Record<string, string>> = { "{fg}": "var(--w-fg)", "{muted}": "var(--w-muted)", "{accent}": "var(--w-accent)" };
/** `label-color` as CSS: a text role's variable or a lone colour; Classic's `{faint}` (and anything else) is none. */
const labelColour = (value: unknown): string | undefined => {
  const v = typeof value === "string" ? value.trim() : "";
  if (Object.hasOwn(LABEL_ALIAS, v)) return LABEL_ALIAS[v];
  const fill = safeFill(v);
  return fill && !safeGradient(fill) && !fill.startsWith("var(") ? fill : undefined;
};
const off = (value: unknown) => value === undefined || value === "none";
/** The roles a mark colour (a series, a meter zone, an icon) may name, as the card's variables: a variant that recolours the role recolours the mark. */
const MARK_ALIAS: Readonly<Record<string, string>> = { ...LABEL_ALIAS, "{faint}": "var(--w-faint)", "{ok}": `var(--w-ok, ${STATUS.ok})`, "{warn}": `var(--w-warn, ${STATUS.warn})`, "{crit}": `var(--w-crit, ${STATUS.crit})` };
/**
 * A mark colour as CSS: a role's variable, a lone colour, or an alias of another T3 colour the Look sets read through it (as the validator
 * reads it: `"meter-ok": "{accent-ink}"` is the accent even where the theme hands the meters its OK); Classic's value (and anything else) is none.
 */
const markColour = (value: unknown, classic: string, t3: Readonly<Record<string, string | number>>, depth = 0): string | undefined => {
  const v = typeof value === "string" ? value.trim() : "";
  if (v === classic && depth === 0) return undefined;
  if (Object.hasOwn(MARK_ALIAS, v)) return MARK_ALIAS[v];
  const alias = /^\{([\w-]+)\}$/.exec(v)?.[1];
  if (alias) return depth < 4 && Object.hasOwn(t3, alias) ? markColour(t3[alias], classic, t3, depth + 1) : undefined;
  const fill = safeFill(v);
  return fill && !safeGradient(fill) && !fill.startsWith("var(") ? fill : undefined;
};
/** The meter colour and the icon colour a Look may set, with Classic's value (src/looks/t3.ts): token, SkinTokens key, Classic. */
const MARKS = [["meter-ok", "meterOk", "{accent}"], ["icon-color", "iconColor", "{fg}"]] as const;
const SERIES = 6;

/** The tokens a Look's T3 values set; `{}` for Classic's. */
export function t3Tokens(t3: Readonly<Record<string, string | number>> | undefined): Partial<SkinTokens> {
  if (!t3) return {};
  const out: Partial<SkinTokens> = {};
  const numFill = t3["num-fill"] === "solid" ? undefined : safeGradient(t3["num-fill"]);
  if (numFill) out.numFill = numFill;
  if (t3["num-effect"] === "chromatic") out.numChroma = true;
  const stretch = safeStretch(t3["num-stretch"]);
  if (stretch) out.numStretch = stretch;
  if (!off(t3["label-glow"])) out.labelGlow = true;
  if (!off(t3["series-glow"])) out.glow = true;
  const graph = oneOf(t3["graph-style"], GRAPH_STYLES);
  if (graph) out.graph = graph;
  if (/^0(px|rem|em)?$/.test(String(t3["cell-radius"]))) out.cellSquare = true;
  const header = oneOf(t3["header-style"], ["prompt", "icon-badge", "tab-label", "box-legend", "label-bar", "bracket-line", "index"]);
  if (header) out.header = header;
  if (header === "box-legend") out.frame = "legend";
  const headerFill = safeFill(t3["header-fill"]);
  if (headerFill) out.headerFill = headerFill;
  if (t3["ring-cap"] === "butt") out.cap = "butt";
  const ring = t3["ring-style"];
  if (ring === "arc270") out.ringArc = 270;
  const mark = oneOf(ring, ["segmented", "ticks"]);
  if (mark) out.ringMark = mark;
  const ringFill = safeGradient(t3["ring-fill"]);
  if (ringFill) out.ringFill = ringFill;
  const sparkFill = safeGradient(t3["spark-fill"]);
  if (sparkFill) out.sparkFill = sparkFill;
  const barFill = safeGradient(t3["bar-fill"]);
  if (barFill) out.barFill = barFill;
  const label = labelColour(t3["label-color"]);
  if (label) out.labelColor = label;
  const outline = safeFill(t3["focus-outline"]);
  if (outline && !safeGradient(outline)) out.focusOutline = outline;
  const border = safeFill(t3["border-fill"]);
  if (border) Object.assign(out, { frame: "gradient", borderFill: border });
  const meter = oneOf(t3["meter-style"], ["segments", "blocks"]);
  if (meter) out.meter = meter;
  if (t3["meter-zone-style"] === "blend") out.zones = "blend";
  const hold = oneOf(t3["meter-hold-style"], ["dot", "block"]);
  if (hold) out.hold = hold;
  const spike = oneOf(t3["spike-shape"], ["tick", "bar"]);
  if (spike) out.spike = spike;
  const stroke = Number.parseFloat(String(t3["series-stroke"]));
  if (stroke >= 0.5 && stroke <= 8 && stroke !== 1) out.strokeFixed = stroke;
  const fill = String(t3["series-fill-alpha"]);
  const alpha = fill.split(">").map((p) => (p.trim() === "" ? Number.NaN : Number(p)));
  if (alpha.length === 3 && alpha.every((a) => a >= 0 && a <= 1) && fill !== "0.32 > 0.06 > 0") out.fillAlpha = alpha as [number, number, number];
  for (const [key, token, classic, shape] of MOTION) {
    const v = String(t3[key] ?? "").trim();
    if (shape.test(v) && v !== classic) out[token] = v;
  }
  const knob = oneOf(t3["fader-knob-shape"], ["bar", "square", "notch"]);
  if (knob) out.knob = knob;
  const series = Array.from({ length: SERIES }, (_, i) => markColour(t3[`series-${i + 1}`], "", t3) ?? "");
  if (series.some(Boolean)) out.series = series;
  for (const [key, token, classic] of MARKS) {
    const c = markColour(t3[key], classic, t3);
    if (c) out[token] = c;
  }
  return out;
}

/** The card's `--w-s1` to `--w-s6` for the series a Look sets (`seriesColour` reads them); none for a Look that sets none. */
export function seriesVars(series: readonly string[] | undefined): CSSProperties | undefined {
  const v = Object.fromEntries((series ?? []).flatMap((c, i) => (c ? [[`--w-s${i + 1}`, c]] : [])));
  return Object.keys(v).length > 0 ? (v as CSSProperties) : undefined;
}
