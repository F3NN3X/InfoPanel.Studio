// The one sizing rule of a recipe's text, shared by the validator (at every allowed size, on a nominal grid cell) and the
// renderer (on the zone's measured box), so "text stays above 11 px at every size" is checked against what is drawn.

/** No text of a recipe is drawn under this many px. */
export const TEXT_FLOOR = 11;

/** A grid cell as the validator measures it: a 12 x 8 grid on a 1600 x 900 screen, less the gaps. */
export const NOMINAL_CELL = { w: 120, h: 100 } as const;

/**
 * A rail slot's widget box, px: the page rail's dense size (under 580 px of height), the smaller of its two, which a recipe's
 * rail preset is checked at (`src/widgets/page-rail/`, decision 8).
 */
export const RAIL_SLOT = { w: 72, h: 64 } as const;

/** The card's base text size, px, for a content box of `w` x `h`: the smaller of a sixteenth of its width and a sixth of its height. */
export const basePx = (w: number, h: number): number => Math.min(w / 16, h / 6);

/** A text at `scale` times the base in a box of `w` x `h`, never under the floor. */
export const textPx = (scale: number, w: number, h: number): number => Math.max(TEXT_FLOOR, basePx(w, h) * scale);

/** The base text size of a zone of `cols` x `rows` nominal cells. */
export const cellBasePx = (cols: number, rows: number): number => basePx(cols * NOMINAL_CELL.w, rows * NOMINAL_CELL.h);

/**
 * A card's content box in nominal cells, for a `when` size condition: the size the validator would have checked for it. Undefined
 * while the box is not measured (a first frame, a server render): a size condition holds then.
 */
export const cellsOf = (w: number, h: number): [number, number] | undefined =>
  w > 0 && h > 0 ? [Math.max(1, Math.round(w / NOMINAL_CELL.w)), Math.max(1, Math.round(h / NOMINAL_CELL.h))] : undefined;
