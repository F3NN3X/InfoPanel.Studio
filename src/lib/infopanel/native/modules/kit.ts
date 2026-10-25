/**
 * What the dedicated converters share: finding a plugin's container in the Data API, shares of a box, and the
 * few item shapes they all make (a bound value, a bound text, a web image, a table, a bar).
 */
import type { DisplayItem } from "../../schema.ts";
import type { DataApiValue } from "../../sensors.ts";
import { bound, fontSizeOf, make, type ConvertContext, type Rect } from "../items.ts";
import type { ModuleSettings } from "../../../../modules/types.ts";

export type Settings = Readonly<ModuleSettings>;

/** A converter: the widget's box on the screen and its settings in, its items out (none when its plugin isn't there). */
export type Converter = (box: Rect, ctx: ConvertContext, settings: Settings) => DisplayItem[];

/** The Data API prefix (with its trailing dot) of the first plugin container matching `pattern` that holds `entry`. */
export function container(sensors: Readonly<Record<string, DataApiValue>>, pattern: RegExp, entry: string): string | undefined {
  for (const key of Object.keys(sensors)) {
    const m = pattern.exec(key);
    if (m && key === m[0] + entry) return m[0];
  }
  return undefined;
}

/** `weights` as boxes stacked down `box`, `gap` px apart. */
export function column(box: Rect, weights: readonly number[], gap = 6): Rect[] {
  const total = weights.reduce((a, b) => a + b, 0) || 1;
  const free = box.h - gap * (weights.length - 1);
  let y = box.y;
  return weights.map((wt) => {
    const h = (free * wt) / total;
    const r = { x: box.x, y, w: box.w, h };
    y += h + gap;
    return r;
  });
}

/** `weights` as boxes side by side across `box`, `gap` px apart. */
export function across(box: Rect, weights: readonly number[], gap = 8): Rect[] {
  const total = weights.reduce((a, b) => a + b, 0) || 1;
  const free = box.w - gap * (weights.length - 1);
  let x = box.x;
  return weights.map((wt) => {
    const w = (free * wt) / total;
    const r = { x, y: box.y, w, h: box.h };
    x += w + gap;
    return r;
  });
}

const textColor = (ctx: ConvertContext, sub = false) => (sub ? ctx.palette.subtext : ctx.palette.text);

/** A bound Value (or text) item sized to its box: the font fits the box's height. */
export function value(ctx: ConvertContext, rect: Rect, name: string, key: string, opts: { sub?: boolean; bold?: boolean; unit?: boolean; size?: number } = {}): DisplayItem {
  const size = opts.size ?? Math.min(rect.h * 0.8, 48);
  return bound(make("Sensor", ctx, rect, name, { FontSize: fontSizeOf(size), Color: textColor(ctx, opts.sub), Bold: opts.bold ?? false, ShowUnit: opts.unit ?? false, Ellipsis: true, Wrap: false }), key, ctx);
}

/** A bound web image, in the box. */
export const webImage = (ctx: ConvertContext, rect: Rect, name: string, key: string): DisplayItem => bound(make("HttpImage", ctx, rect, name), key, ctx);

/** A bound bar. */
export const bar = (ctx: ConvertContext, rect: Rect, name: string, key: string, max = 100): DisplayItem =>
  bound(make("Bar", ctx, { ...rect, y: rect.y + Math.max(0, (rect.h - 10) / 2), h: Math.min(rect.h, 10) }, name, { MinValue: 0, MaxValue: max, CornerRadius: 5 }), key, ctx);

/** A bound plugin table. */
export const table = (ctx: ConvertContext, rect: Rect, name: string, key: string, rows = 5): DisplayItem =>
  bound(make("TableSensor", ctx, rect, name, { FontSize: fontSizeOf(Math.min(16, rect.h / (rows + 1))), Color: textColor(ctx), MaxRows: rows, ShowHeader: false }), key, ctx);
