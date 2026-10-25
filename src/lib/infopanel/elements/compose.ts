/**
 * The composite elements as Groups whose children the element owns: rows, graph stacks, the dual
 * graph, the double ring, the drive tiles and the shadowed text. `applyX` lays the children out
 * from the spec and the group's X and Y and styles them, keeping what the user set on them (a
 * label's text, a value's sensor); a child the layout needs and the group lacks is made, one it
 * doesn't need is dropped. Editing the spec relays the group out, so a resize or a toggle is one step.
 * Pure; `apply` derives a child that is itself an element (an icon, a ring, a sparkline).
 */
import { defaultItem, type DisplayItem, type GroupItem, type ItemKind } from "../schema.ts";
import { bindingOf, isBound } from "../sensors.ts";
import type { Ink } from "./palette.ts";
import type { DoubleRingSpec, DrivesSpec, DualSpec, RowLook, RowSpec, RowsSpec, ShadowTextSpec, StackSpec } from "./spec.ts";

export type Apply = (item: DisplayItem) => DisplayItem;

type Fields = Record<string, unknown>;

/** The children the layout needs, in order: an existing child of the right kind stays, any other is made. */
function reconcile(kids: readonly DisplayItem[], kinds: readonly ItemKind[], names: readonly string[]): DisplayItem[] {
  return kinds.map((kind, i) => (kids[i]?.kind === kind ? kids[i] : { ...defaultItem(kind), Name: names[i] }) as DisplayItem);
}

/** The colour fields set from inks, with the slots that follow a palette change. */
const inked = (fields: Record<string, Ink>): Fields => ({
  ...Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, v.color])),
  slots: Object.fromEntries(Object.entries(fields).flatMap(([k, v]) => (v.slot ? [[k, { slot: v.slot }]] : []))),
});

/** The item bound to the same sensor as `from` (its record of the chosen sensor too). */
function mirror(to: DisplayItem, from: DisplayItem): DisplayItem {
  if (!isBound(from) || !isBound(to)) return to;
  const { $import: _old, ...rest } = to as DisplayItem & { $import?: unknown };
  const record = (from as DisplayItem & { $import?: unknown }).$import;
  return { ...rest, ...bindingOf(from), ...(record ? { $import: record } : {}) } as DisplayItem;
}

const box = (X: number, Y: number, Width: number, Height: number) => ({ X: Math.round(X), Y: Math.round(Y), Width: Math.max(1, Math.round(Width)), Height: Math.max(1, Math.round(Height)) });

/** A single line of text in a box: no wrap, the font size set, an alignment. */
const line = (size: number, align: "left" | "right" | "centre"): Fields => ({
  FontSize: size, Wrap: false, Ellipsis: true, Marquee: false, RightAlign: align === "right", CenterAlign: align === "centre",
});

/** Where a line of `size` text sits to be centred in a band `h` tall (InfoPanel draws FontSize at its scale, about 1.6 px per unit with the leading). */
const centredY = (y: number, h: number, size: number) => y + Math.max(0, Math.round((h - size * 1.6) / 2));

/* ---- row ---- */

/** The row's parts' boxes within its own box: the same layout `applyRow` uses. */
export function rowLayout(s: Pick<RowSpec, "width" | "height" | "bar" | "icon" | "size">) {
  const barH = s.bar ? Math.max(2, Math.round(s.height * 0.14)) : 0;
  const textH = s.height - (s.bar ? barH + 2 : 0);
  const iconS = s.icon ? textH : 0;
  const indent = s.icon ? iconS + 6 : 0;
  const valueW = Math.round((s.width - indent) * 0.4);
  return { barH, textH, iconS, indent, valueW, labelW: Math.max(1, s.width - indent - valueW - 4), textY: Math.max(0, Math.round((textH - s.size * 1.6) / 2)) };
}

export function applyRow(group: GroupItem, s: RowSpec | (RowLook & { width: number; height: number }), apply: Apply): GroupItem {
  const { barH, textH, iconS, indent, valueW, labelW, textY } = rowLayout(s);
  const [x, y] = [group.X, group.Y];
  const [label, value, ...rest] = reconcile(group.DisplayItems, ["Text", "Sensor", ...(s.bar ? (["Bar"] as const) : []), ...(s.icon ? (["Image"] as const) : [])], ["Label", "Value", "Bar", "Icon"]);
  const kids: DisplayItem[] = [
    { ...label, ...box(x + indent, y + textY, labelW, textH - textY), ...line(s.size, "left"), ...inked({ Color: s.label }) } as DisplayItem,
    { ...value, ...box(x + s.width - valueW, y + textY, valueW, textH - textY), ...line(s.size, "right"), ...inked({ Color: s.value }) } as DisplayItem,
  ];
  const bar = s.bar ? rest[0] : undefined;
  if (bar) {
    kids.push(
      mirror(
        {
          ...bar, ...box(x, y + s.height - barH, s.width, barH), CornerRadius: Math.round(barH / 2), Background: true, Frame: false, Gradient: false,
          ...inked({ Color: s.barFill, BackgroundColor: s.barTrack }),
        } as DisplayItem,
        kids[1],
      ),
    );
  }
  const icon = s.icon ? rest[s.bar ? 1 : 0] : undefined;
  if (icon && s.icon) kids.push(apply({ ...icon, ...box(x, y, iconS, iconS), element: { type: "icon", name: s.icon, color: s.iconInk } } as unknown as DisplayItem));
  return { ...group, DisplayItems: kids };
}

/** The rows' groups: one per row, `count` of them, each keeping its label and sensor. */
export function applyRows(group: GroupItem, s: RowsSpec, apply: Apply): GroupItem {
  const rows = Array.from({ length: s.count }, (_, i) => {
    const old = group.DisplayItems[i];
    const row = (old?.kind === "Group" ? old : { ...defaultItem("Group"), Name: `Row ${i + 1}`, DisplayItems: [{ ...defaultItem("Text"), Name: `Row ${i + 1}` }] }) as GroupItem;
    const { type: _t, count: _c, gap: _g, ...look } = s;
    const next = { ...row, X: group.X, Y: Math.round(group.Y + i * (s.height + s.gap)), element: { ...look, type: "row" } };
    return apply(next as unknown as DisplayItem);
  });
  return { ...group, DisplayItems: rows };
}

/* ---- graphs ---- */

const sparkline = (color: Ink, style: "area" | "line", fillAlpha = 0.25) => ({ type: "sparkline", style, color, dot: false, gradient: false, fillAlpha });

/** Labelled graphs: a Text and a Graph per row. */
export function applyStack(group: GroupItem, s: StackSpec, apply: Apply): GroupItem {
  const kinds = Array.from({ length: s.count }, () => ["Text", "Graph"] as const).flat();
  const kids = reconcile(group.DisplayItems, kinds, kinds.map((k, i) => (k === "Text" ? `Label ${i / 2 + 1}` : `Graph ${(i - 1) / 2 + 1}`)));
  const labelW = Math.round(s.width * 0.28);
  const out = kids.map((kid, i) => {
    const row = Math.floor(i / 2);
    const y = group.Y + row * (s.height + s.gap);
    if (kid.kind === "Text") return { ...kid, ...box(group.X, centredY(y, s.height, s.size), labelW, s.height), ...line(s.size, "left"), ...inked({ Color: s.label }) } as DisplayItem;
    return apply({
      ...kid, ...box(group.X + labelW + 6, y, s.width - labelW - 6, s.height), Background: false, Frame: false, element: sparkline(s.color, s.area ? "area" : "line"),
    } as unknown as DisplayItem);
  });
  return { ...group, DisplayItems: out };
}

/** Two transparent Graphs in one box: the second draws over the first. */
export function applyDual(group: GroupItem, s: DualSpec, apply: Apply): GroupItem {
  const kids = reconcile(group.DisplayItems, ["Graph", "Graph"], ["Series A", "Series B"]);
  const at = box(group.X, group.Y, s.width, s.height);
  return {
    ...group,
    DisplayItems: [
      apply({ ...kids[0], ...at, Background: false, Frame: false, element: sparkline(s.a, s.area ? "area" : "line", 0.2) } as unknown as DisplayItem),
      apply({ ...kids[1], ...at, Background: false, Frame: false, element: sparkline(s.b, "line") } as unknown as DisplayItem),
    ],
  };
}

/* ---- double ring ---- */

/** The two rings' boxes within the element: the outer is the whole, the inner sits a thickness and a gap inside it. */
export function doubleRingLayout(s: Pick<DoubleRingSpec, "size" | "thickness" | "gap">) {
  const inset = Math.round(s.thickness + s.gap);
  return { outer: { offset: 0, size: s.size }, inner: { offset: inset, size: Math.max(8, s.size - 2 * inset) } };
}

export function applyDoubleRing(group: GroupItem, s: DoubleRingSpec, apply: Apply): GroupItem {
  const [outer, inner, centre] = reconcile(group.DisplayItems, ["Gauge", "Gauge", "Sensor"], ["Outer ring", "Inner ring", "Value"]);
  const lay = doubleRingLayout(s);
  const ring = (kid: DisplayItem, at: { offset: number; size: number }, fill: Ink[], extra: Fields) =>
    apply({
      ...kid, ...box(group.X + at.offset, group.Y + at.offset, at.size, at.size),
      element: { type: "ring", start: s.start, sweep: s.sweep, thickness: s.thickness, track: s.track, fill, rounded: true, dot: false, ticks: 0, segments: 0, gap: 3, glow: 0, ...extra },
    } as unknown as DisplayItem);
  const vw = Math.round(lay.inner.size * 0.7);
  const vh = Math.round(s.valueSize * 1.6);
  return {
    ...group,
    DisplayItems: [
      ring(outer, lay.outer, s.outer, {}),
      ring(inner, lay.inner, s.inner, s.innerThresholds.length ? { thresholds: s.innerThresholds } : {}),
      { ...centre, ...box(group.X + (s.size - vw) / 2, group.Y + (s.size - vh) / 2, vw, vh), ...line(s.valueSize, "centre"), ...inked({ Color: s.value }) } as DisplayItem,
    ],
  };
}

/* ---- drives ---- */

/** The tile kinds in order: card, icon, name, used bar, used %, temperature, free space. */
const TILE: readonly ItemKind[] = ["Shape", "Image", "Text", "Bar", "Sensor", "Sensor", "Sensor"];
const TILE_NAMES = ["Card", "Icon", "Name", "Used bar", "Used", "Temperature", "Free"];

/** The tiles' boxes, side by side or stacked with `gap` between, on whole pixels. */
export function drivesLayout(s: Pick<DrivesSpec, "orientation" | "gap" | "width" | "height">, x: number, y: number, n: number): { x: number; y: number; width: number; height: number }[] {
  if (n <= 0) return [];
  const horizontal = s.orientation === "horizontal";
  const each = ((horizontal ? s.width : s.height) - s.gap * (n - 1)) / n;
  return Array.from({ length: n }, (_, i) => {
    const a = Math.round(i * (each + s.gap));
    const len = Math.max(1, Math.round(i * (each + s.gap) + each) - a);
    return horizontal ? { x: x + a, y, width: len, height: s.height } : { x, y: y + a, width: s.width, height: len };
  });
}

function applyTile(tile: GroupItem, s: DrivesSpec, at: { x: number; y: number; width: number; height: number }, apply: Apply): GroupItem {
  const [card, icon, name, bar, used, temp, free] = reconcile(tile.DisplayItems, TILE, TILE_NAMES);
  const pad = Math.max(4, Math.round(Math.min(at.width, at.height) * 0.08));
  const iconS = Math.max(8, Math.round(at.height * 0.26));
  const size = Math.max(7, Math.round(at.height * 0.06));
  const inner = at.width - 2 * pad;
  const pctW = Math.max(Math.round(inner * 0.26), size * 4);
  const barH = Math.max(3, Math.round(at.height * 0.05));
  const barY = at.y + pad + iconS + pad;
  const lineH = Math.round(size * 1.8);
  const lowY = at.y + at.height - pad - lineH;
  const half = Math.round(inner / 2);
  const kids: DisplayItem[] = [
    {
      ...card, ...box(at.x, at.y, at.width, at.height), Type: "Rectangle", CornerRadius: Math.round(s.radius), ShowFrame: false, ShowGradient: false, ShowFill: true,
      ...inked({ FillColor: s.card }),
    } as DisplayItem,
    apply({ ...icon, ...box(at.x + pad, at.y + pad, iconS, iconS), element: { type: "icon", name: "hard-drive", color: s.icon } } as unknown as DisplayItem),
    { ...name, ...box(at.x + pad + iconS + 6, centredY(at.y + pad, iconS, size), inner - iconS - 6, iconS), ...line(size, "left"), ...inked({ Color: s.text }) } as DisplayItem,
    mirror(
      {
        ...bar, ...box(at.x + pad, barY, inner - pctW - 6, barH), CornerRadius: Math.round(barH / 2), Background: true, Frame: false, Gradient: false,
        MinValue: 0, MaxValue: 100, ...inked({ Color: s.fill, BackgroundColor: s.track }),
      } as DisplayItem,
      used,
    ),
    { ...used, ...box(at.x + at.width - pad - pctW, centredY(barY + barH / 2 - size, size * 2, size), pctW, lineH), ...line(size, "right"), ...inked({ Color: s.text }) } as DisplayItem,
    { ...temp, ...box(at.x + pad, lowY, half, lineH), ...line(size, "left"), ...inked({ Color: s.sub }) } as DisplayItem,
    { ...free, ...box(at.x + pad + half, lowY, inner - half, lineH), ...line(size, "right"), ...inked({ Color: s.sub }) } as DisplayItem,
  ];
  return { ...tile, ...{ X: at.x, Y: at.y }, DisplayItems: kids };
}

/** The drives' tiles laid out and styled from the spec, each keeping its name and sensors. */
export function applyDrives(group: GroupItem, s: DrivesSpec, apply: Apply): GroupItem {
  const boxes = drivesLayout(s, group.X, group.Y, group.DisplayItems.length);
  return { ...group, DisplayItems: group.DisplayItems.map((t, i) => (t.kind === "Group" ? applyTile(t, s, boxes[i], apply) : t)) };
}

/* ---- shadowed text ---- */

/** The text itself is the second child; the first is a copy of it behind, offset and dark, kept in step (same sensor, same text). */
export function applyShadowText(group: GroupItem, s: ShadowTextSpec): GroupItem {
  const main = group.DisplayItems[1] ?? group.DisplayItems[0];
  if (!main || (main.kind !== "Text" && main.kind !== "Sensor")) return group;
  const shadow = { ...main, Name: main.Name, X: main.X + Math.round(s.dx), Y: main.Y + Math.round(s.dy), GlowEnabled: false, ...inked({ Color: s.color }) } as DisplayItem;
  return { ...group, DisplayItems: [shadow, main] };
}
