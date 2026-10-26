// Fit-to-box text maths (pure): how wide a reading is in em, and the font size that fits it in a box.

/**
 * Glyph advance widths in em, the widest of the app's font stacks (measured in the kiosk at weight 300-700, tabular
 * figures): a figure is wider than the 0.55 em the old estimate took, and "%" nearly twice that.
 */
const GLYPH_EM: Readonly<Record<string, number>> = {
  ".": 0.3,
  ",": 0.3,
  ":": 0.32,
  " ": 0.28,
  "-": 0.4,
  "–": 0.56,
  "/": 0.42,
  "%": 0.92,
  "°": 0.42,
};
const DIGIT_EM = 0.62;
const UPPER_EM = 0.72;
const LOWER_EM = 0.58;

/** The width of `text` in em. */
export function textEm(text: string): number {
  let em = 0;
  for (const ch of text) em += ch in GLYPH_EM ? GLYPH_EM[ch] : /\d/.test(ch) ? DIGIT_EM : ch !== ch.toLowerCase() ? UPPER_EM : LOWER_EM;
  return em;
}

/**
 * The font size (px) that fits a line `em` wide in a `w` × `h` box: the box's height over the line height, or the
 * width over the text's, whichever is smaller; never under `min`.
 */
export const fitFont = (em: number, w: number, h: number, { lineHeight = 1, min = 0 }: { lineHeight?: number; min?: number } = {}): number =>
  Math.max(min, Math.min(h / lineHeight, em > 0 ? w / em : Infinity));

/**
 * A reading's number with its unit beside it at `unitScale` of its size (and a small gap), fitted to `w` × `h`, px.
 * Never under 14 px: a box too small for that is the summary card's.
 */
export const valueFont = (text: string, unit: string, w: number, h: number, unitScale = 0.45): number =>
  fitFont(textEm(text) * 0.975 + (unit ? textEm(unit) * unitScale + 0.15 : 0), w, h, { min: 14 });

/**
 * The number inside a ring of diameter `d`: about 0.28 of it, narrower where the text is long (it stays inside the
 * ring's opening), never under 12 px. `unitScale` counts a unit drawn beside the number.
 */
export const ringFont = (text: string, unit: string, unitScale: number, d: number): number =>
  fitFont(textEm(text) + (unit ? textEm(unit) * unitScale : 0), d * 0.66, d * 0.28, { min: 12 });
