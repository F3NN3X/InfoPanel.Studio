/**
 * Studio elements as InfoPanel items: `applyElement` derives an element's InfoPanel fields from
 * its spec and box (a ring's vector spec, a card's Shape or Image, the cores' bars), the badge
 * says how it exports, and `recolour` carries a palette change into every element and styled
 * field that follows a slot. Pure: the editor runs `syncElements` on every commit, so a resize,
 * a spec edit and a palette change all land as one undo step.
 */
import { mapItems } from "../editor/bind.ts";
import { withAlpha } from "../editor/look.ts";
import { normalizeGauge, type VectorGauge } from "../gauges/vector.ts";
import { defaultItem, type DisplayItem, type GroupItem } from "../schema.ts";
import { iconFileOf } from "../../effects/icon.ts";
import { alphaOf, resolveInk, rgbOf, type Ink, type Palette, type Slot } from "./palette.ts";
import { applyDoubleRing, applyDrives, applyDual, applyRow, applyRows, applyShadowText, applyStack } from "./compose.ts";
import { elementOf, mapInks, type CardSpec, type CoresSpec, type Threshold, type DividerSpec, type ElementSpec, type LedBarSpec, type RingSpec, type SparklineSpec } from "./spec.ts";

/** A styled InfoPanel colour field that follows a palette slot; `alpha` (0–1) scales the slot colour's own. */
export interface SlotRef {
  slot: Slot;
  alpha?: number;
}

/** The studio-only fields an item can carry next to its InfoPanel ones. */
export interface ElementFields {
  element?: ElementSpec;
  /** What a static element's image was baked from (`elementSignature`). */
  elementBaked?: string;
  /** Colour fields set from a palette slot, by field name. */
  slots?: Record<string, SlotRef>;
  vector?: VectorGauge;
  vectorBaked?: string;
  /** A Drives tile's drive id, which picks its icon from the element's `icons`. */
  driveId?: string;
}

type Lab = DisplayItem & ElementFields;

export { elementOf } from "./spec.ts";
export const slotsOf = (item: DisplayItem): Record<string, SlotRef> | undefined => (item as Lab).slots;

/** The InfoPanel fields every kind shares, kept when an element changes kind. */
const baseOf = (item: DisplayItem) => ({ Name: item.Name, Hidden: item.Hidden, X: item.X, Y: item.Y, IsLocked: item.IsLocked, Rotation: item.Rotation });
const boxOf = (item: DisplayItem) => ({ w: "Width" in item ? Math.max(1, item.Width) : 1, h: "Height" in item ? Math.max(1, item.Height) : 1 });

/** Inks as the vector spec takes them: #RRGGBB stops spread evenly over the range. */
function vectorFill(fill: readonly Ink[], thresholds?: readonly Threshold[]): VectorGauge["fill"] {
  const color = rgbOf(fill[0].color);
  // Colours by value: zones, the first colour from 0 and each threshold's from its place.
  if (thresholds?.length) return { mode: "zones", color, stops: [{ at: 0, color }, ...thresholds.map((t) => ({ at: t.at, color: rgbOf(t.ink.color) }))] };
  if (fill.length < 2) return { mode: "solid", color, stops: [{ at: 0, color }] };
  return { mode: "gradient", color, stops: fill.map((ink, i) => ({ at: (i / (fill.length - 1)) * 100, color: rgbOf(ink.color) })) };
}

const track = (ink: Ink) => ({ track: rgbOf(ink.color), ...(alphaOf(ink.color) < 1 ? { trackOpacity: Math.round(alphaOf(ink.color) * 100) / 100 } : {}) });

/** A ring as the vector gauge spec the export bakes into frames, at the item's size. */
export function ringVector(s: RingSpec, w: number, h: number): VectorGauge {
  return normalizeGauge({
    shape: "arc", width: w, height: h, start: s.start, sweep: s.sweep, thickness: s.thickness, rounded: s.rounded,
    segments: s.segments, gap: s.gap, ...track(s.track), fill: vectorFill(s.fill, s.thresholds), needle: null, reverse: false,
    ticks: s.ticks >= 2 ? { count: s.ticks, length: Math.max(3, Math.round(s.thickness / 2)), width: 2, color: rgbOf(s.track.color) } : null,
    ...(s.glow > 0 ? { glow: s.glow } : {}),
    ...(s.face ? { face: s.face } : {}),
    ...(s.dot && !s.thresholds?.length ? { dot: { color: rgbOf(s.fill.at(-1)!.color), size: Math.round(s.thickness * 1.6) } } : {}),
  });
}

/** An LED bar as a segmented vector bar the full size of its box. */
export function ledVector(s: LedBarSpec, w: number, h: number): VectorGauge {
  const vertical = s.orientation === "vertical";
  return normalizeGauge({
    shape: "bar", width: w, height: h, orientation: s.orientation, thickness: vertical ? w : h, rounded: false, radius: s.radius,
    segments: s.segments, gap: s.gap, ...track(s.track), fill: vectorFill(s.fill, s.thresholds), needle: null, ticks: null, reverse: false,
    ...(s.glow > 0 ? { glow: s.glow } : {}),
  });
}

/** The margin a card's shadow and glow need around it, px. */
export function cardPad(spec: Pick<CardSpec, "shadow" | "glow">): number {
  const s = spec.shadow ? spec.shadow.blur * 1.5 + Math.max(Math.abs(spec.shadow.dx), Math.abs(spec.shadow.dy)) : 0;
  const g = spec.glow ? spec.glow.blur * 1.5 : 0;
  return Math.ceil(Math.max(s, g));
}

/** Whether a card or divider can export as a native Shape: one colour, no shadow or glow. */
export const shapeNative = (s: CardSpec | DividerSpec): boolean => s.fill.length === 1 && (s.type === "divider" || (!s.shadow && !s.glow && !s.blur));

/** The item as an Image showing its baked file (kept when it already was one). */
function asImage(item: DisplayItem, x: number, y: number, w: number, h: number): DisplayItem {
  const img = item.kind === "Image" ? item : { ...defaultItem("Image"), ...baseOf(item) };
  return { ...img, X: x, Y: y, Width: w, Height: h, Scale: 100, Type: "FILE", RelativePath: true, Layer: false } as DisplayItem;
}

/** The item as a plain rectangle Shape (kept when it already was one); a baked image's record goes. */
function asShape(item: DisplayItem, fields: Record<string, unknown>): DisplayItem {
  const shape = item.kind === "Shape" ? item : { ...defaultItem("Shape"), ...baseOf(item) };
  const { elementBaked: _b, ...rest } = { ...shape, Type: "Rectangle", ShowGradient: false, ShowFill: true, ...fields } as Lab;
  return rest as DisplayItem;
}

function applyCard(item: DisplayItem, s: CardSpec): DisplayItem {
  const { w, h } = boxOf(item);
  // The card's own box: the item's, less the margin the last baked image had.
  const [cx, cy, cw, ch] = [item.X + s.pad, item.Y + s.pad, Math.max(1, w - 2 * s.pad), Math.max(1, h - 2 * s.pad)];
  if (shapeNative(s)) {
    const shape = asShape(item, {
      X: cx, Y: cy, Width: cw, Height: ch, CornerRadius: Math.round(s.radius), FillColor: s.fill[0].color,
      ShowFrame: s.stroke !== null, FrameThickness: 1, ...(s.stroke ? { FrameColor: s.stroke.color } : {}),
    });
    return { ...shape, element: { ...s, pad: 0 } } as unknown as DisplayItem;
  }
  const pad = cardPad(s);
  return { ...asImage(item, cx - pad, cy - pad, cw + 2 * pad, ch + 2 * pad), element: { ...s, pad } } as unknown as DisplayItem;
}

function applyDivider(item: DisplayItem, s: DividerSpec): DisplayItem {
  const { w, h } = boxOf(item);
  const [W, H] = s.orientation === "vertical" ? [s.thickness, h] : [w, s.thickness];
  if (shapeNative(s)) return { ...asShape(item, { Width: W, Height: H, CornerRadius: 0, ShowFrame: false, FillColor: s.fill[0].color }), element: s } as unknown as DisplayItem;
  return { ...asImage(item, item.X, item.Y, W, H), element: s } as unknown as DisplayItem;
}

/** The bars' boxes, side by side (horizontal) or stacked (vertical) with `gap` between, on whole pixels. */
export function coresLayout(s: Pick<CoresSpec, "orientation" | "gap" | "width" | "height">, x: number, y: number, n: number): { x: number; y: number; width: number; height: number }[] {
  if (n <= 0) return [];
  const along = s.orientation === "horizontal" ? s.width : s.height;
  const each = (along - s.gap * (n - 1)) / n;
  return Array.from({ length: n }, (_, i) => {
    const a = Math.round(i * (each + s.gap));
    const b = Math.max(a + 1, Math.round(i * (each + s.gap) + each));
    return s.orientation === "horizontal"
      ? { x: x + a, y, width: b - a, height: Math.max(1, s.height) }
      : { x, y: y + a, width: Math.max(1, s.width), height: b - a };
  });
}

/** The cores' bars laid out and styled from the spec, each keeping its binding. */
export function applyCores(group: GroupItem, s: CoresSpec): GroupItem {
  const boxes = coresLayout(s, group.X, group.Y, group.DisplayItems.length);
  const DisplayItems = group.DisplayItems.map((bar, i) =>
    bar.kind === "Bar"
      ? ({
          ...bar, X: boxes[i].x, Y: boxes[i].y, Width: boxes[i].width, Height: boxes[i].height, CornerRadius: Math.round(s.radius),
          Color: s.fill.color, BackgroundColor: s.track.color, Background: true, Frame: false, Gradient: false,
          slots: { ...(s.fill.slot ? { Color: { slot: s.fill.slot } } : {}), ...(s.track.slot ? { BackgroundColor: { slot: s.track.slot } } : {}) },
        } as DisplayItem)
      : bar,
  );
  return { ...group, DisplayItems };
}

function applySparkline(item: DisplayItem, s: SparklineSpec): DisplayItem {
  if (item.kind !== "Graph") return item;
  return { ...item, Type: s.style === "bars" ? "HISTOGRAM" : "LINE", Color: s.color.color, Fill: s.style !== "line", FillColor: withAlpha(s.color.color, s.fillAlpha * alphaOf(s.color.color)) } as DisplayItem;
}

/** The item's InfoPanel fields derived from its element spec; any other item as it is. */
export function applyElement(item: DisplayItem): DisplayItem {
  const s = elementOf(item);
  if (!s) return item;
  const { w, h } = boxOf(item);
  switch (s.type) {
    case "ring":
      return item.kind === "Gauge" ? ({ ...item, vector: ringVector(s, w, h) } as DisplayItem) : item;
    case "ledbar":
      return item.kind === "Gauge" ? ({ ...item, vector: ledVector(s, w, h) } as DisplayItem) : item;
    case "card":
      return applyCard(item, s);
    case "divider":
      return applyDivider(item, s);
    case "icon": {
      // The user's own file: a native Image of the canvas's file, never baked (a baked record from a lucide icon goes).
      const file = iconFileOf(s.source);
      if (!file) return { ...asImage(item, item.X, item.Y, w, h), element: s } as unknown as DisplayItem;
      const { elementBaked: _b, ...image } = asImage(item, item.X, item.Y, w, h) as Lab;
      return { ...image, FilePath: file, element: s } as unknown as DisplayItem;
    }
    case "glow":
      return { ...asImage(item, item.X, item.Y, w, h), element: s } as unknown as DisplayItem;
    case "cores":
      return item.kind === "Group" ? applyCores(item, s) : item;
    case "sparkline":
      return applySparkline(item, s);
    case "row":
      return item.kind === "Group" ? applyRow(item, s, applyElement) : item;
    case "rows":
      return item.kind === "Group" ? applyRows(item, s, applyElement) : item;
    case "stack":
      return item.kind === "Group" ? applyStack(item, s, applyElement) : item;
    case "dual":
      return item.kind === "Group" ? applyDual(item, s, applyElement) : item;
    case "doublering":
      return item.kind === "Group" ? applyDoubleRing(item, s, applyElement) : item;
    case "drives":
      return item.kind === "Group" ? applyDrives(item, s, applyElement) : item;
    case "shadowtext":
      return item.kind === "Group" ? applyShadowText(item, s) : item;
  }
}

/** Every element in the tree re-derived (a managed group before its children). */
export const syncElements = (items: readonly DisplayItem[]): DisplayItem[] => mapItems(items, (item) => (elementOf(item) ? applyElement(item) : item));

/**
 * A palette change carried into the items: each ink and styled field that follows a slot takes
 * the slot's new colour, then the element is re-derived. A ring or LED bar's vector spec changes
 * with it, and a static element's signature, so both show as needing a new bake.
 */
export function recolour(items: readonly DisplayItem[], palette: Palette): DisplayItem[] {
  return mapItems(items, (item) => {
    const lab = item as Lab;
    let next: Lab = lab;
    if (lab.slots && Object.keys(lab.slots).length) {
      const fields = Object.fromEntries(
        Object.entries(lab.slots).map(([field, ref]) => [field, ref.alpha === undefined ? palette[ref.slot] : withAlpha(palette[ref.slot], ref.alpha * alphaOf(palette[ref.slot]))]),
      );
      next = { ...next, ...fields } as Lab;
    }
    if (lab.element) next = applyElement({ ...next, element: mapInks(lab.element, (ink) => resolveInk(ink, palette)) } as unknown as DisplayItem) as Lab;
    return next as DisplayItem;
  });
}

/* ---- badges ---- */

export type BadgeKind = "native" | "baked" | "approximated";

/** How an item exports to InfoPanel, in one line, and what an approximation loses. */
export interface Badge {
  kind: BadgeKind;
  reason: string;
  lost: string[];
}

export const BADGE_LABEL: Record<BadgeKind, string> = { native: "Native", baked: "Baked", approximated: "Approximated" };

const badge = (kind: BadgeKind, reason: string, lost: string[] = []): Badge => ({ kind, reason, lost });

/** The element's export badge; a vector gauge is Baked too. Any other InfoPanel item has none (it is native). */
export function badgeOf(item: DisplayItem): Badge | null {
  const s = elementOf(item);
  if (!s) return (item as Lab).vector && item.kind === "Gauge" ? badge("baked", "Exported as a Gauge with frames baked from its vector spec.") : null;
  switch (s.type) {
    case "ring":
    case "ledbar":
      return badge("baked", "Exported as a Gauge with image frames, bound to its sensor with Min and Max.");
    case "card":
      if (s.blur) {
        return badge("approximated", "Exported as one image with the background behind it blurred in.", ["live values behind the card (the blur covers the background, images and shapes under it, not text or gauges)"]);
      }
      return shapeNative(s)
        ? badge("native", "Exported as a Shape: InfoPanel draws its fill, stroke and corners as they are.")
        : badge("baked", `Exported as one image: InfoPanel can’t draw its ${[s.fill.length > 1 && "gradient", s.shadow && "shadow", s.glow && "glow"].filter(Boolean).join(", ")}.`);
    case "divider":
      return shapeNative(s) ? badge("native", "Exported as a Shape.") : badge("baked", "Exported as one image: InfoPanel can’t draw its gradient as a line.");
    case "glow":
      return badge("baked", "Exported as one image, transparency kept.");
    case "icon":
      return iconFileOf(s.source) ? badge("native", "Exported as an Image of your file, drawn by InfoPanel as it is.") : badge("baked", "Exported as one image of the icon.");
    case "cores": {
      const n = item.kind === "Group" ? item.DisplayItems.length : 0;
      return badge("native", `Exported as a Group of ${n} Bar items, one per core.`);
    }
    case "row": {
      const parts = ["Text", "Value", ...(s.bar ? ["Bar"] : []), ...(s.icon ? ["Image"] : [])];
      return badge("native", `Exported as a Group of ${parts.join(", ")}${s.icon ? " (the icon is a baked image)" : ""}.`);
    }
    case "rows":
      return badge("native", `Exported as a Group of ${s.count} row Groups, each a Text and a Value${s.bar ? " and a Bar" : ""}${s.icon ? " and an icon image" : ""}.`);
    case "stack":
      return badge("native", `Exported as a Group of ${s.count} Text and Graph pairs.`);
    case "dual":
      return badge("native", "Exported as a Group of two transparent Graphs.");
    case "doublering":
      return badge("baked", "Exported as a Group of two Gauges with image frames, and the centre Value.");
    case "drives": {
      const n = item.kind === "Group" ? item.DisplayItems.length : 0;
      return badge("native", `Exported as a Group of ${n} drive tiles: a Shape, Text, Bar and Values each, with the icon as a baked image, or an Image of your file for a drive that has one.`);
    }
    case "shadowtext":
      return badge("approximated", "Exported as two Texts, a dark copy behind the text.", ["a blurred shadow (InfoPanel draws none; the copy is sharp)"]);
    case "sparkline": {
      if (s.style === "bars") return badge("native", "Exported as InfoPanel’s Graph in histogram mode.");
      const lost = [...(s.dot ? ["the end dot"] : []), ...(s.gradient && s.style === "area" ? ["the gradient fill (InfoPanel fills one colour)"] : [])];
      return lost.length ? badge("approximated", "Exported as InfoPanel’s Graph, without some of its look.", lost) : badge("native", "Exported as InfoPanel’s Graph.");
    }
  }
}

/** Every approximated item in the tree, by path, for the export dialog. */
export function approximations(items: readonly DisplayItem[], prefix = ""): { path: string; name: string; lost: string[] }[] {
  return items.flatMap((item, i) => {
    const path = prefix ? `${prefix}.${i}` : String(i);
    const b = badgeOf(item);
    const own = b?.kind === "approximated" ? [{ path, name: item.Name || item.kind, lost: b.lost }] : [];
    return [...own, ...(item.kind === "Group" ? approximations(item.DisplayItems, path) : [])];
  });
}
