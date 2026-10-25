/**
 * The generic decomposer. The shared primitives tag the nodes that show a live value with `data-ip-key` (the
 * Data API key), `data-ip-kind` (value, bar, ring, graph) and, where it helps, `-unit`, `-decimals` and `-max`.
 * Reading a rendered zone gives each tagged node's box, font and colour; each becomes a bound native item at
 * that box. The picture of everything else is taken with the tagged nodes hidden (`hideTagged`), so the live
 * values are never baked into it.
 */
import { argb, bound, fontSizeOf, make, type ConvertContext, type Rect } from "./items.ts";
import type { DisplayItem } from "../schema.ts";

export type TaggedKind = "value" | "bar" | "ring" | "graph";

export interface Tagged {
  key: string;
  kind: TaggedKind;
  /** On the zone, in design px. */
  box: Rect;
  fontSize: number;
  color: string;
  bold: boolean;
  unit?: string;
  decimals?: number;
  max?: number;
}

const KINDS: readonly string[] = ["value", "bar", "ring", "graph"];

const num = (v: string | undefined): number | undefined => (v !== undefined && v !== "" && Number.isFinite(Number(v)) ? Number(v) : undefined);

/** Every tagged node under `root`, its box relative to `root` and divided by `zoom` (the studio canvas's CSS zoom). */
export function readTagged(root: Element, zoom = 1): Tagged[] {
  const origin = root.getBoundingClientRect();
  return [...root.querySelectorAll<HTMLElement>("[data-ip-key]")].flatMap((el) => {
    const key = el.dataset.ipKey;
    const kind = el.dataset.ipKind;
    if (!key || !kind || !KINDS.includes(kind)) return [];
    const r = el.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) return [];
    const style = getComputedStyle(el);
    return [
      {
        key,
        kind: kind as TaggedKind,
        box: { x: (r.left - origin.left) / zoom, y: (r.top - origin.top) / zoom, w: r.width / zoom, h: r.height / zoom },
        fontSize: parseFloat(style.fontSize) || 20,
        color: style.color,
        bold: Number(style.fontWeight) >= 600,
        unit: el.dataset.ipUnit,
        decimals: num(el.dataset.ipDecimals),
        max: num(el.dataset.ipMax),
      },
    ];
  });
}

/** For `onCloneEachNode` of the picture: the tagged nodes keep their box but are not drawn. */
export function hideTagged(cloned: Node): void {
  if (cloned instanceof HTMLElement && cloned.dataset.ipKey) cloned.style.visibility = "hidden";
}

/** "rgb(r, g, b)" / "rgba(r, g, b, a)" as `#AARRGGBB`. */
export function cssToArgb(css: string): string {
  const m = /^rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)(?:[,\s/]+([\d.]+%?))?\s*\)$/.exec(css.trim());
  if (!m) return argb(css);
  const a = m[4] === undefined ? 1 : m[4].endsWith("%") ? parseFloat(m[4]) / 100 : Number(m[4]);
  const hex = (n: number) => Math.round(Math.max(0, Math.min(255, n))).toString(16).padStart(2, "0");
  return `#${hex(a * 255)}${hex(Number(m[1]))}${hex(Number(m[2]))}${hex(Number(m[3]))}`.toUpperCase();
}

/** The native item of one tagged node, bound to its key. A ring is a Gauge (baked to frames on export). */
export function taggedItem(t: Tagged, origin: Rect, ctx: ConvertContext): DisplayItem {
  const box = { x: origin.x + t.box.x, y: origin.y + t.box.y, w: t.box.w, h: t.box.h };
  const name = t.key;
  switch (t.kind) {
    case "value":
      return bound(
        make("Sensor", ctx, box, name, {
          FontSize: fontSizeOf(t.fontSize),
          Color: cssToArgb(t.color),
          Bold: t.bold,
          ...(t.decimals !== undefined ? { OverridePrecision: true, Precision: t.decimals } : {}),
          ...(t.unit !== undefined ? { OverrideUnit: true, Unit: t.unit, ShowUnit: true } : { ShowUnit: false }),
        }),
        t.key,
        ctx,
      );
    case "bar":
      return bound(make("Bar", ctx, box, name, { MinValue: 0, MaxValue: t.max ?? 100 }), t.key, ctx);
    case "ring":
      return bound(make("Gauge", ctx, box, name, { MaxValue: t.max ?? 100 }), t.key, ctx);
    case "graph":
      return bound(make("Graph", ctx, box, name, { MinValue: 0, MaxValue: t.max ?? 100 }), t.key, ctx);
  }
}

/** The native items of a rendered zone: one per tagged node, in document order, placed on the screen at `origin`. */
export function decompose(root: Element, origin: Rect, ctx: ConvertContext, zoom = 1): DisplayItem[] {
  return readTagged(root, zoom).map((t) => taggedItem(t, origin, ctx));
}
