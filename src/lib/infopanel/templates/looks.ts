/**
 * What the Dark / White / Smoke / Tint / Float templates (Deck, Meters, Orbit, Tower, Ticker) share:
 * their palettes, a surface that is a card or, in Float, nothing, text that gets a dark shadow
 * in Float, a list of label-and-value lines (Rows, or plain Text and Value in Float), the dual
 * network graph, and the way a value is shown (°, GHz, "GB free").
 */
import { applyElement } from "../elements/apply.ts";
import { rowLook } from "../elements/create.ts";
import { alphaOf, slotInk, type Ink, type Palette, type Slot } from "../elements/palette.ts";
import type { SparklineSpec } from "../elements/spec.ts";
import { defaultItem, type DisplayItem } from "../schema.ts";
import { bar, card, fontSize, ink, sparkline, text, value, type Kit, type TextOpts, type Variant, type Weight } from "./kit.ts";
import type { Box } from "./layout.ts";
import { ROLE_INFO, type Role } from "./roles.ts";

/** The dark palette: blue CPU, purple GPU, green FPS, orange as the warning. */
export const DARK: Palette = {
  accent1: "#FF0A84FF", accent2: "#FFBF5AF2", accent3: "#FF30D158", text: "#FFFFFFFF", subtext: "#FFA0A3B0",
  track: "#FF383B47", card: "#FF14161D", warn: "#FFFF9F0A", crit: "#FFFF453A",
};

const FAMILY = {
  dark: { name: "Dark", palette: {} },
  white: {
    name: "White",
    palette: {
      accent1: "#FF0A6CE8", accent2: "#FFAE4FDB", accent3: "#FF1E9A47", text: "#FF121216", subtext: "#FF5C5F6B",
      track: "#FFB4B6BF", card: "#FFE4E5E9", warn: "#FFD97706", crit: "#FFDC3A2B",
    },
  },
  smoke: { name: "Smoke", palette: { card: "#B83E4156", track: "#FF6C6F84", subtext: "#FFC6C9D6" } },
  tint: { name: "Tint", palette: { card: "#B01B2142", track: "#FF4B5272", subtext: "#FFB4B9D2" } },
  float: { name: "Float", palette: { card: "#00000000", track: "#99FFFFFF", subtext: "#FFE6E8F2" } },
} as const;

/** The family's palette variants, Dark first (the template's own palette). */
export const variantsOf = (...ids: (keyof typeof FAMILY)[]): Variant[] => ids.map((id) => ({ id, name: FAMILY[id].name, palette: FAMILY[id].palette }));

/** Float: no cards, and text with a shadow. */
export const isFloat = (k: Kit): boolean => alphaOf(k.palette.card) === 0;

/** A translucent card (Smoke, Tint) gets a hairline edge. */
const translucent = (k: Kit): boolean => alphaOf(k.palette.card) < 1;

/** A colour with its alpha scaled (#AARRGGBB). */
const fade = (color: string, by: number): string => `#${Math.round(parseInt(color.slice(1, 3), 16) * by).toString(16).padStart(2, "0").toUpperCase()}${color.slice(3)}`;

/**
 * The surface behind a group of content: a rounded card, or nothing in Float. InfoPanel's own
 * rectangle has square corners, so the card is a two-stop fill, which bakes to a rounded image.
 */
export function surface(k: Kit, name: string, b: Box, radius: number): DisplayItem[] {
  if (isFloat(k)) return [];
  const top = ink(k, "card");
  const bottom = translucent(k) ? { color: fade(top.color, 0.82) } : top;
  return [card(k, name, b, { radius: Math.round(radius), fill: [top, bottom], ...(translucent(k) ? { stroke: { color: "#33FFFFFF" } } : {}) })];
}

/** The browser can't pick InfoPanel's named font styles, so a bold style also sets Bold. */
const weighted = (item: DisplayItem): DisplayItem => (/bold/i.test(String((item as DisplayItem & { FontStyle?: string }).FontStyle ?? "")) ? ({ ...item, Bold: true } as unknown as DisplayItem) : item);

/** In Float the item gets a dark offset copy behind it (Shadow text); otherwise it stays as it is. */
export function shadowed(k: Kit, plain: DisplayItem): DisplayItem {
  const item = weighted(plain);
  if (!isFloat(k)) return item;
  const d = Math.max(1, Math.min(4, Math.round(1.4 * k.frame.u)));
  const group = { ...defaultItem("Group"), Name: item.Name, X: item.X, Y: item.Y, DisplayItems: [item, item], element: { type: "shadowtext", dx: d, dy: d, color: { color: "#B3000000" } } };
  return applyElement(group as unknown as DisplayItem);
}

/** The item in a fixed colour (one that doesn't follow the palette: the network's cyan, the frame-time yellow). */
export function coloured(item: DisplayItem, color: string): DisplayItem {
  const slots = Object.fromEntries(Object.entries((item as DisplayItem & { slots?: Record<string, unknown> }).slots ?? {}).filter(([key]) => key !== "Color"));
  return { ...item, Color: color, slots } as unknown as DisplayItem;
}

/** How a value is shown, over the role's own unit: a unit text, a divisor, decimals. */
export interface Shown {
  unit?: string;
  divide?: number;
  precision?: number;
}

export function shown(item: DisplayItem, s?: Shown): DisplayItem {
  if (!s) return item;
  return {
    ...item,
    ...(s.unit !== undefined ? { OverrideUnit: true, Unit: s.unit } : {}),
    ...(s.divide ? { DivisionToggle: true, MultiplicationModifier: s.divide } : {}),
    ...(s.precision !== undefined ? { OverridePrecision: true, Precision: s.precision } : {}),
  } as unknown as DisplayItem;
}

export const DEGREES: Shown = { unit: "°" };
export const GHZ: Shown = { unit: " GHz", divide: 1000, precision: 2 };

/** Units that read better after a space ("120 W"); a unit the sensor may report differently is left to the sensor. */
const SPACED = new Set(["W", "V", "ms", "RPM"]);

/** A role's value, its unit spaced from the number, then `s` over that. */
export function reading(k: Kit, role: Role, o: TextOpts & { unit?: boolean }, s?: Shown): DisplayItem {
  const info = ROLE_INFO[role];
  const unit = info.scaled ? ` ${info.scaled.unit}` : SPACED.has(info.unit) ? ` ${info.unit === "RPM" ? "rpm" : info.unit}` : undefined;
  return shown(value(k, role, o), { ...(unit ? { unit } : {}), ...s });
}

export interface LineEntry {
  label: string;
  role: Role;
  shown?: Shown;
}

export interface LinesOpts {
  /** The text's drawn height; smaller when the lines are too close for it. */
  px: number;
  /** A thin bar under each line, on its value's sensor. */
  bar?: boolean;
  barFill?: Slot;
  label?: Slot;
  value?: Slot;
  /** px between lines. */
  gap?: number;
}

/**
 * Label-and-value lines filling the box, one per entry, value right-aligned: a Rows element, or in
 * Float (its Row can't carry a shadow) Text and Value items, each with its shadow.
 */
export function lines(k: Kit, b: Box, entries: readonly LineEntry[], o: LinesOpts): DisplayItem[] {
  const n = entries.length;
  const gap = Math.round(o.gap ?? 0);
  const h = Math.max(8, Math.floor((b.height - gap * (n - 1)) / n));
  // A Row gives its value 40% of its width, enough for about eight characters.
  const px = Math.max(6, Math.min(Math.round(o.px), Math.round(h / (o.bar ? 1.9 : 1.45)), Math.round(b.width * 0.085)));
  const x = Math.round(b.x);
  const y = Math.round(b.y);
  const width = Math.max(8, Math.round(b.width));
  if (!isFloat(k)) {
    const kids = entries.map((e) => ({
      ...defaultItem("Group"), Name: e.label,
      DisplayItems: [
        text(k, e.label, { x: 0, y: 0, px }),
        reading(k, e.role, { x: 0, y: 0, px }, e.shown),
        ...(o.bar ? [bar(k, e.role, { x: 0, y: 0, width, height: 4 }, o.barFill)] : []),
      ],
    }));
    const element = {
      type: "rows", count: n, gap, width, height: h,
      ...rowLook(k.palette, {
        size: fontSize(k, px), label: slotInk(k.palette, o.label ?? "subtext"), value: slotInk(k.palette, o.value ?? "text"),
        bar: o.bar ?? false, barFill: slotInk(k.palette, o.barFill ?? "accent1"),
      }),
    };
    return [applyElement({ ...defaultItem("Group"), Name: "Rows", X: x, Y: y, DisplayItems: kids, element } as unknown as DisplayItem)];
  }
  const barH = Math.max(2, Math.round(h * 0.14));
  return entries.flatMap((e, i) => {
    const top = y + i * (h + gap);
    const textH = o.bar ? h - barH - 2 : h;
    const ty = top + Math.max(0, Math.round((textH - fontSize(k, px) * 1.6) / 2));
    return [
      shadowed(k, text(k, e.label, { x, y: ty, px, slot: o.label ?? "subtext" })),
      shadowed(k, reading(k, e.role, { x, y: ty, px, width, align: "right", slot: o.value ?? "text" }, e.shown)),
      ...(o.bar ? [bar(k, e.role, { x, y: top + h - barH, width, height: barH }, o.barFill)] : []),
    ];
  });
}

/** A graph of a role, `window` samples across the box. */
export function graph(k: Kit, role: Role, b: Box, spec: Partial<SparklineSpec>, window = 60): DisplayItem {
  return { ...sparkline(k, role, b, spec), Step: Math.max(1, Math.round(b.width / window)) } as DisplayItem;
}

/** Two roles' graphs over each other in one box (Dual graph). */
export function dualGraph(k: Kit, b: Box, a: Role, second: Role, inks: readonly [Ink, Ink], window = 60): DisplayItem {
  const x = Math.round(b.x);
  const y = Math.round(b.y);
  const [width, height] = [Math.max(8, Math.round(b.width)), Math.max(8, Math.round(b.height))];
  const box = { x, y, width, height };
  const step = Math.max(1, Math.round(width / window));
  const kids = [sparkline(k, a, box), sparkline(k, second, box)].map((g) => ({ ...g, Step: step }));
  const element = { type: "dual", width, height, a: inks[0], b: inks[1], area: true };
  return applyElement({ ...defaultItem("Group"), Name: "Network graph", X: x, Y: y, DisplayItems: kids, element } as unknown as DisplayItem);
}

/** A caption: small capitals (InfoPanel's Text has no upper-case switch, so the letters are) in the sub-text colour (or a slot or fixed colour), shadowed in Float. */
export function caption(k: Kit, label: string, x: number, y: number, px: number, o: { slot?: Slot; color?: string; width?: number; align?: "left" | "center" | "right"; weight?: Weight } = {}): DisplayItem {
  const item = text(k, label.toUpperCase(), { x, y, px, slot: o.slot ?? "subtext", weight: o.weight ?? "strong", width: o.width, align: o.align });
  return shadowed(k, o.color ? coloured(item, o.color) : item);
}
