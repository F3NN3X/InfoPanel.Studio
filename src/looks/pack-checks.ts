// The checks on a pack's stage and ink fills that the loader (pack-load.ts, a pack that fails is refused whole) and the validator
// (pack-validate.ts, a pack as files) share, so the two never read a pack differently.
import { safeFill, safeGradient } from "@/widgets/core/t3-tokens";
import { effectIssues, SIZE_CLASSES } from "./effects";
import { resolveT1, type Look } from "./look";
import type { PackStageSpec } from "./pack";
import { CHROME_CUT_MAX, CHROME_TAB_HEIGHT_MAX, CHROME_TAB_HEIGHT_MIN, CHROME_TAB_WIDTH_MAX, CHROME_TAB_WIDTH_MIN, CHROME_TEXT_MAX, FRAME_ALPHA_MIN, GRID_ALPHA_MAX, GRID_ALPHA_MIN, GRID_SIZE_MAX, GRID_SIZE_MIN } from "./pack-json";
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
  });
  if (stage?.overlayMinSizeClass !== undefined && !SIZE_CLASSES.includes(stage.overlayMinSizeClass)) issues.push("stage overlayMinSizeClass");
  if (stage?.effects) issues.push(...(Array.isArray(stage.effects) ? effectIssues(stage.effects) : ["stage effects is not a list"]));
  issues.push(...stageChromeIssues(stage));
  return issues;
}

const within = (n: unknown, lo: number, hi: number): boolean => typeof n === "number" && n >= lo && n <= hi;
/** Text the app draws for a pack: printable characters, no markup, within its length. */
export const plainText = (text: unknown, max: number): boolean => typeof text === "string" && [...text].length >= 1 && [...text].length <= max && !/[\p{C}\p{Zl}\p{Zp}<>]/u.test(text);

/** The page's dot grid and the screen chrome: sizes, strengths and the tab's text inside their ranges. */
function stageChromeIssues(stage: PackStageSpec | undefined): string[] {
  const issues: string[] = [];
  const { grid, chrome } = stage ?? {};
  if (grid) {
    if (!within(grid.size, GRID_SIZE_MIN, GRID_SIZE_MAX)) issues.push(`stage grid size ${String(grid.size).slice(0, 12)}: ${GRID_SIZE_MIN} to ${GRID_SIZE_MAX} px`);
    if (grid.alpha !== undefined && !within(grid.alpha, GRID_ALPHA_MIN, GRID_ALPHA_MAX)) issues.push(`stage grid alpha ${String(grid.alpha).slice(0, 12)}: ${GRID_ALPHA_MIN} to ${GRID_ALPHA_MAX}`);
    if (grid.minSizeClass !== undefined && !SIZE_CLASSES.includes(grid.minSizeClass)) issues.push("stage grid minSizeClass");
  }
  if (chrome) {
    if (chrome.cut !== undefined && !within(chrome.cut, 0, CHROME_CUT_MAX)) issues.push(`stage chrome cut ${String(chrome.cut).slice(0, 12)}: 0 to ${CHROME_CUT_MAX} px`);
    if (chrome.alpha !== undefined && !within(chrome.alpha, FRAME_ALPHA_MIN, 1)) issues.push(`stage chrome alpha ${String(chrome.alpha).slice(0, 12)}: ${FRAME_ALPHA_MIN} to 1`);
    const tab = chrome.tab;
    if (tab && !(within(tab.width, CHROME_TAB_WIDTH_MIN, CHROME_TAB_WIDTH_MAX) && within(tab.height, CHROME_TAB_HEIGHT_MIN, CHROME_TAB_HEIGHT_MAX))) issues.push(`stage chrome tab ${String(tab.width).slice(0, 8)} by ${String(tab.height).slice(0, 8)}: ${CHROME_TAB_WIDTH_MIN} to ${CHROME_TAB_WIDTH_MAX} by ${CHROME_TAB_HEIGHT_MIN} to ${CHROME_TAB_HEIGHT_MAX} px`);
    if (tab?.text !== undefined && !plainText(tab.text, CHROME_TEXT_MAX)) issues.push(`stage chrome tab text: 1 to ${CHROME_TEXT_MAX} printable characters, no markup`);
    if (chrome.minSizeClass !== undefined && !SIZE_CLASSES.includes(chrome.minSizeClass)) issues.push("stage chrome minSizeClass");
  }
  return issues;
}
