// The Status Bar's drawn readouts (rings, a double ring with thin-bar rows, a stat, a text line) as plain values, and their sizes (pure).

export type Accent = 1 | 2 | 3;

/** A row of a double-ring card: a label, its value and a thin bar at `pct` (0-100). */
export interface CardRow {
  label: string;
  text: string;
  pct: number;
}

export type Card =
  /** A load ring with the label, the temperature and the power beside it. */
  | { kind: "ring"; label: string; accent: Accent; load: number; loadKey?: string; temp?: string; power?: string }
  /** A load ring around a temperature ring (`heat` is its °C, for the colour), the label and temperature beside it, then rows with thin bars. */
  | { kind: "dual"; label: string; accent: Accent; load: number; loadKey?: string; heat: number; temp: string; rows: CardRow[] }
  /** A caption over a big number, and a second one (a 1% low) beside it; `idle` draws the value as a quiet dash. */
  | { kind: "stat"; label: string; accent: Accent; value: string; idle?: boolean; low?: string }
  /** One line: the label, then the values with a dot between. */
  | { kind: "line"; label: string; accent: Accent; values: string[] };

/** Text width in em per character (an estimate; the text is not measured). */
const CHAR_EM = 0.58;

export interface CardSize {
  /** The ring's diameter. */
  ring: number;
  /** The big value, the caption and the small lines, px. */
  big: number;
  cap: number;
  small: number;
  /** The FPS number, px. */
  stat: number;
  /** Space between the parts. */
  gap: number;
}

/** The sizes for a bar `u` px high. */
export function sizeOf(u: number): CardSize {
  return { ring: Math.round(u * 0.8), big: Math.max(11, Math.round(u * 0.34)), cap: Math.max(8, Math.round(u * 0.17)), small: Math.max(8, Math.round(u * 0.19)), stat: Math.max(12, Math.round(u * 0.46)), gap: Math.max(4, Math.round(u * 0.12)) };
}

/** The text size of a line card in a bar `u` px high (the other cards size by `sizeOf`). */
export const lineSize = (u: number): number => Math.min(22, Math.max(12, Math.round(u * 0.3)));

/** The text size of a thin-bar row, px. */
export const rowPx = (u: number): number => sizeOf(u).small * 0.85;

/** How many thin-bar rows fit beside a double ring in a bar `u` px high: each is a line of text and its bar. */
export function rowCount(u: number, wanted: number): number {
  if (u < 40) return 0;
  const row = rowPx(u) * 1.25 + 5;
  return Math.max(0, Math.min(wanted, Math.floor((u * 0.8) / row)));
}

const chars = (s: string | undefined, px: number): number => (s ? s.length * px * CHAR_EM : 0);

/** The width a card takes in a bar `u` px high (used to drop items when the bar is narrow). */
export function cardWidth(card: Card, u: number): number {
  const z = sizeOf(u);
  switch (card.kind) {
    case "ring": {
      const text = Math.max(chars(card.label, z.cap) * 1.1, chars(card.temp, z.big), chars(card.power, z.small));
      return z.ring + (text > 0 ? z.gap + text : 0);
    }
    case "dual": {
      const text = Math.max(chars(card.label, z.cap) * 1.1, chars(card.temp, z.big));
      const rows = rowCount(u, card.rows.length);
      // the rows need room for a readable bar, not just their text
      const rowW = rows > 0 ? Math.max(u * 1.9, ...card.rows.slice(0, rows).map((r) => chars(`${r.label}  ${r.text}`, rowPx(u)))) : 0;
      return z.ring + z.gap + text + (rowW > 0 ? z.gap * 1.5 + rowW : 0);
    }
    case "stat": {
      const one = (label: string, value: string | undefined) => Math.max(chars(label, z.cap) * 1.1, chars(value, z.stat));
      return one(card.label, card.value) + (card.low ? z.gap * 2 + one("1% low", card.low) : 0);
    }
    case "line":
      return chars([card.label, card.values.join(" · ")].join(" "), lineSize(u)) + lineSize(u) * 0.4;
  }
}
