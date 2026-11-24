// A pack's `value` motion (motion.ts), the text half: how a number that changed is drawn on its way to the new reading. A figure
// (`41.5 %`, `-3`, `1,024 MB`) counts from the old reading to the new one in the new one's format; any other text (a clock, a
// word with digits) rolls the digits that changed, compared from the right like an odometer. Pure; motion-runtime.ts draws it.

/** A text that is one number with words around it. */
export interface Figure {
  head: string;
  value: number;
  decimals: number;
  grouped: boolean;
  tail: string;
}

const FIGURE = /^(\D*?)(-?)(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d+))?(\D*)$/;

/** The figure in a text, or undefined when it is not one number. */
export function figureOf(text: string): Figure | undefined {
  const m = FIGURE.exec(text);
  if (!m) return undefined;
  const value = Number(`${m[2]}${m[3].replace(/,/g, "")}.${m[4] ?? "0"}`);
  return Number.isFinite(value) ? { head: m[1], value, decimals: m[4]?.length ?? 0, grouped: m[3].includes(","), tail: m[5] } : undefined;
}

/** `value` written the way `f` is (its words, decimals and grouping). */
export const figureText = (f: Figure, value: number): string =>
  `${f.head}${value.toLocaleString("en-US", { minimumFractionDigits: f.decimals, maximumFractionDigits: f.decimals, useGrouping: f.grouped })}${f.tail}`;

/** The two ends of a count, when both texts are figures with the same words around them. */
export function countOf(from: string, to: string): { from: number; to: Figure } | undefined {
  const a = figureOf(from);
  const b = figureOf(to);
  if (!a || !b || a.head !== b.head || a.tail !== b.tail || a.value === b.value) return undefined;
  return { from: a.value, to: { ...b, grouped: a.grouped || b.grouped } };
}

/** Ease out: quick at first, settling on the reading. */
export const easeOut = (t: number): number => 1 - (1 - Math.min(1, Math.max(0, t))) ** 3;

/** The count's text at `t` (0 to 1); the reading itself at 1. */
export const countAt = (count: { from: number; to: Figure }, t: number): string => figureText(count.to, t >= 1 ? count.to.value : count.from + (count.to.value - count.from) * easeOut(t));

/** One character of a roll: the new character, and the old one it rolls from (only a digit that changed rolls). */
export interface RollCell {
  ch: string;
  from?: string;
}

/** The new text as cells, its changed digits rolling from the old text's characters, compared from the right. */
export function rollOf(from: string, to: string): RollCell[] {
  const a = [...from];
  const b = [...to];
  return b.map((ch, i) => {
    const old = a[a.length - (b.length - i)];
    return /\d/.test(ch) && old !== ch ? { ch, from: old !== undefined && /\d/.test(old) ? old : " " } : { ch };
  });
}
