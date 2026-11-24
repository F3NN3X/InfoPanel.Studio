// The checks on a pack's stage and ink fills that the loader (pack-load.ts, a pack that fails is refused whole) and the validator
// (pack-validate.ts, a pack as files) share, so the two never read a pack differently.
import { safeFill, safeGradient } from "@/widgets/core/t3-tokens";
import { effectIssues, SIZE_CLASSES } from "./effects";
import { resolveT1, type Look } from "./look";
import type { PackStageSpec } from "./pack";
import { isPackRelativeUrl } from "./pack-urls";
import { contrastOf } from "./status";

/** A stage draws at most this many page layers (spec 03, layer budget). */
export const MAX_LAYERS = 3;
/** Large numerals hold 3:1 (G6). */
export const NUMERAL_MIN = 3;
const COLOUR_FN = /\b(rgba?|hsla?|hwb|lab|lch|oklab|oklch|color|color-mix)\(/i;
const STOP = /#[0-9a-f]{3,8}\b|var\(--w-[\w-]+\)/gi;
/** A bare word in a gradient is a colour name (`white`) unless it is one of the gradient's own keywords. */
const WORD = /(?<![\w#(.-])[a-z][a-z-]*(?![\w(-])/gi;
const GRADIENT_WORDS = new Set("to top bottom left right center at circle ellipse closest-side farthest-side closest-corner farthest-corner in from".split(" "));

/** The T3 names that paint ink with a gradient: the numerals, a ring's value arc, a graph's line and a bar's fill. */
const INK_FILLS = ["num-fill", "ring-fill", "spark-fill", "bar-fill"] as const;

/** The problems with a gradient ink fill: a stop that cannot be read as a colour, or one under 3:1 on the Look's surface in a mode it supports. */
function inkFillIssues(look: Look, name: (typeof INK_FILLS)[number]): string[] {
  const fill = look.t3?.[name];
  if (fill === undefined || fill === "solid" || fill === "none") return [];
  const gradient = safeGradient(fill);
  if (!gradient) return [`${name} is not a gradient of colours`];
  if (COLOUR_FN.test(gradient)) return [`${name} stops must be hex colours or var(--w-*): other colour functions cannot be checked`];
  const named = (gradient.match(WORD) ?? []).filter((w) => !GRADIENT_WORDS.has(w.toLowerCase()));
  if (named.length) return [`${name} stop ${named[0]} is a colour name: use hex colours or var(--w-*), which can be checked`];
  const issues: string[] = [];
  for (const mode of look.modes.supported) {
    const t1 = resolveT1(look, mode) as Record<string, string>;
    for (const stop of gradient.match(STOP) ?? []) {
      const colour = stop.startsWith("var(") ? t1[stop.slice(8, -1)] : stop;
      const ratio = colour ? contrastOf(colour, t1.surface) : undefined;
      if (ratio === undefined) issues.push(`${name} stop ${stop} cannot be checked (${mode})`);
      else if (ratio < NUMERAL_MIN) issues.push(`${name} stop ${stop} is ${ratio.toFixed(2)}:1 on the surface in ${mode}, under ${NUMERAL_MIN}:1`);
    }
  }
  return issues;
}
export const numeralIssues = (look: Look): string[] => INK_FILLS.flatMap((name) => inkFillIssues(look, name));

/** The problems with each page layer's fill, image, opacity and size class, and with the stage's overlay size class and effects (not the layer count: `MAX_LAYERS`). */
export function stageIssues(stage: PackStageSpec | undefined): string[] {
  const issues: string[] = [];
  (stage?.layers ?? []).forEach((l, i) => {
    if (l.fill !== undefined && !safeFill(l.fill)) issues.push(`stage layer ${i} fill`);
    if (l.image !== undefined && !(isPackRelativeUrl(l.image) && !/["']/.test(l.image))) issues.push(`stage layer ${i} image ${l.image}`);
    if (l.opacity !== undefined && !(l.opacity >= 0 && l.opacity <= 1)) issues.push(`stage layer ${i} opacity`);
    if (l.minSizeClass !== undefined && !SIZE_CLASSES.includes(l.minSizeClass)) issues.push(`stage layer ${i} minSizeClass`);
    if (l.animated !== undefined && !(typeof l.animated === "boolean" && l.image !== undefined && /\.svg$/i.test(l.image))) issues.push(`stage layer ${i} animated: only an SVG image layer animates`);
  });
  if (stage?.overlayMinSizeClass !== undefined && !SIZE_CLASSES.includes(stage.overlayMinSizeClass)) issues.push("stage overlayMinSizeClass");
  if (stage?.effects) issues.push(...(Array.isArray(stage.effects) ? effectIssues(stage.effects) : ["stage effects is not a list"]));
  return issues;
}
