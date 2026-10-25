/**
 * The 8a composite elements (Row, Rows, Double ring, Drives) as template parts, and a figure: a big
 * value with its unit set small after it. Each is the element the editor's Add menu makes, so a
 * user could build the same profile by hand.
 */
import { applyElement } from "../elements/apply.ts";
import { newComposite, PLACEHOLDER_DRIVES, rowLook } from "../elements/create.ts";
import type { Slot } from "../elements/palette.ts";
import { elementOf, type DrivesSpec, type Threshold } from "../elements/spec.ts";
import { newItem } from "../editor/create.ts";
import { defaultItem, type DisplayItem } from "../schema.ts";
import { ink, text, value, type Kit, type Weight } from "./kit.ts";
import type { Box } from "./layout.ts";
import { ROLE_INFO, type Role } from "./roles.ts";

export interface RowOpts {
  /** The drawn text height. */
  px: number;
  label?: Slot;
  value?: Slot;
  /** A lucide icon before the label. */
  icon?: string;
  iconSlot?: Slot;
  /** A thin bar under the row, on the value's sensor. */
  bar?: boolean;
  fill?: Slot;
  upper?: boolean;
}

/** InfoPanel's FontSize for text drawn `px` high. */
const sizeOf = (k: Kit, px: number) => Math.max(4, Math.round(px / k.profile.FontScale));

const whole = (b: Box) => ({ X: Math.round(b.x), Y: Math.round(b.y) });

const lookOf = (k: Kit, o: RowOpts) =>
  rowLook(k.palette, {
    size: sizeOf(k, o.px), label: ink(k, o.label ?? "subtext"), value: ink(k, o.value ?? "text"), icon: o.icon ?? null,
    iconInk: ink(k, o.iconSlot ?? "accent1"), bar: o.bar ?? false, barFill: ink(k, o.fill ?? "accent1"),
  });

const partsOf = (k: Kit, label: string, role: Role, o: RowOpts): DisplayItem[] => [
  text(k, o.upper ? label.toUpperCase() : label, { x: 0, y: 0, px: o.px, slot: o.label ?? "subtext", upper: o.upper }),
  value(k, role, { x: 0, y: 0, px: o.px, slot: o.value ?? "text" }),
];

/** A Row element: a label on the left, the role's value right-aligned, an optional icon and bar. */
export function labelRow(k: Kit, b: Box, label: string, role: Role, o: RowOpts): DisplayItem {
  const group = { ...defaultItem("Group"), Name: label, ...whole(b), DisplayItems: partsOf(k, label, role, o), element: { type: "row", width: Math.round(b.width), height: Math.round(b.height), ...lookOf(k, o) } };
  return applyElement(group as unknown as DisplayItem);
}

/** A Rows element: one row per entry, evenly spaced down the box. */
export function labelRows(k: Kit, b: Box, entries: readonly { label: string; role: Role }[], o: RowOpts & { gap?: number }): DisplayItem {
  const gap = o.gap ?? Math.round(b.height / entries.length * 0.12);
  const height = Math.max(1, Math.floor((b.height - gap * (entries.length - 1)) / entries.length));
  const rows = entries.map(({ label, role }, i) => ({ ...defaultItem("Group"), Name: `Row ${i + 1}`, DisplayItems: partsOf(k, label, role, o) }));
  const group = { ...defaultItem("Group"), Name: "Rows", ...whole(b), DisplayItems: rows, element: { type: "rows", count: entries.length, gap, width: Math.round(b.width), height, ...lookOf(k, o) } };
  return applyElement(group as unknown as DisplayItem);
}

export interface DoubleRingOpts {
  thickness: number;
  gap: number;
  start?: number;
  sweep?: number;
  outer: readonly Slot[];
  inner: readonly Slot[];
  /** The inner ring's colours by value (a heat ring). */
  heat?: readonly Threshold[];
  /** The centre value's role and drawn height. */
  centre: Role;
  px: number;
}

/** A Double ring element in the square: the outer ring on `outer`'s sensor, the inner on `inner`'s, a value in the middle. */
export function doubleRing(k: Kit, outer: Role, inner: Role, sq: Box, o: DoubleRingOpts): DisplayItem {
  const ring = (role: Role, name: string) => k.bind({ ...newItem("Gauge", k.profile, k.palette), Name: name, MinValue: ROLE_INFO[role].min, MaxValue: ROLE_INFO[role].max } as unknown as DisplayItem, role);
  const group = {
    ...defaultItem("Group"), Name: "Double ring", ...whole(sq),
    DisplayItems: [ring(outer, `${ROLE_INFO[outer].label} ring`), ring(inner, `${ROLE_INFO[inner].label} ring`), value(k, o.centre, { x: 0, y: 0, px: o.px, unit: false })],
    element: {
      type: "doublering", size: Math.round(sq.width), thickness: o.thickness, gap: o.gap, start: o.start ?? 0, sweep: o.sweep ?? 360, track: ink(k, "track"),
      outer: o.outer.map((s) => ink(k, s)), inner: o.inner.map((s) => ink(k, s)), innerThresholds: o.heat ?? [], valueSize: sizeOf(k, o.px), value: ink(k, "text"),
    },
  };
  return applyElement(group as unknown as DisplayItem);
}

/** A Drives element over the box: a tile per drive on this machine (placeholders, unbound, when none were found). */
export function drives(k: Kit, b: Box, o: { gap: number; radius: number; card?: Slot }): DisplayItem {
  const n = k.drives.length || PLACEHOLDER_DRIVES;
  const horizontal = (b.width - o.gap * (n - 1)) / n >= 120 && b.width / n >= b.height * 0.8;
  const group = newComposite("drives", k.profile, k.palette, k.drives, Math.round(b.x), Math.round(b.y));
  const spec = elementOf(group) as DrivesSpec;
  const card = o.card ? { card: ink(k, o.card) } : {};
  return applyElement({ ...group, element: { ...spec, ...card, orientation: horizontal ? "horizontal" : "vertical", gap: o.gap, radius: o.radius, width: Math.round(b.width), height: Math.round(b.height) } } as unknown as DisplayItem);
}

export interface FigureOpts {
  px: number;
  unit: string;
  slot?: Slot;
  weight?: Weight;
  unitSlot?: Slot;
}

/** A big value with its unit set small after it, the pair right-aligned in the box. */
export function figure(k: Kit, role: Role, b: Box, o: FigureOpts): DisplayItem[] {
  const uPx = Math.max(8, Math.round(o.px * 0.3));
  const uW = Math.round(o.unit.length * uPx * 0.62 + uPx * 0.5);
  return [
    value(k, role, { x: b.x, y: b.y, px: o.px, width: Math.max(1, b.width - uW), align: "right", slot: o.slot, weight: o.weight, unit: false }),
    text(k, o.unit, { x: b.x + b.width - uW + Math.round(uPx * 0.3), y: b.y + Math.round(o.px * 1.05 - uPx * 1.1), px: uPx, slot: o.unitSlot ?? "subtext", weight: "regular" }),
  ];
}
