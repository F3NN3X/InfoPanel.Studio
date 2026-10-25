/**
 * The generic converter for widgets that are a list of readings. A spec names what the widget shows (a reading found by
 * role, by key, or by a pattern over the Data API's keys) and how (a value, a bar, a graph, a ring, a table, an image);
 * the readings are laid out down the widget's box as bound InfoPanel items, label on the left and value on the right.
 * A reading that isn't on this PC is left out, and a widget with none returns nothing (it then goes as a snapshot).
 */
import type { DataApiValue } from "../../sensors.ts";
import { resolveRole, ROLE_INFO, type Role } from "../../templates/roles.ts";
import { bound, fontSizeOf, make, type ConvertContext, type Rect } from "../items.ts";
import { column, type Converter, type Settings } from "./kit.ts";

export type ReadingKind = "value" | "bar" | "graph" | "ring" | "table" | "image";

export interface Reading {
  label: string;
  key: string;
  kind: ReadingKind;
  max?: number;
  decimals?: number;
}

/** What a spec can look readings up with. */
export interface Finder {
  sensors: Readonly<Record<string, DataApiValue>>;
  /** The key of a role's reading on this PC. */
  role: (role: Role, kind?: ReadingKind, label?: string) => Reading[];
  /** A key as it is, when the Data API has it. */
  key: (key: string, label: string, kind?: ReadingKind, max?: number) => Reading[];
  /** The keys matching a pattern, in key order, up to `limit`. */
  match: (pattern: RegExp, label: (key: string, i: number) => string, kind?: ReadingKind, limit?: number) => Reading[];
}

export type Spec = (find: Finder, settings: Settings) => Reading[];

const WEIGHT: Record<ReadingKind, number> = { value: 1, bar: 1.5, graph: 2.4, ring: 2.6, table: 3, image: 3 };

export function finderOf(sensors: Readonly<Record<string, DataApiValue>>): Finder {
  const keys = Object.keys(sensors);
  return {
    sensors,
    role: (role, kind = "value", label) => {
      const hit = resolveRole(role, sensors);
      const info = ROLE_INFO[role];
      return hit ? [{ label: label ?? info.label, key: hit.key, kind, max: info.max, decimals: info.precision }] : [];
    },
    key: (key, label, kind = "value", max) => (sensors[key] ? [{ label, key, kind, ...(max ? { max } : {}) }] : []),
    match: (pattern, label, kind = "value", limit = 6) =>
      keys
        .filter((k) => pattern.test(k))
        .slice(0, limit)
        .map((key, i) => ({ label: label(key, i), key, kind })),
  };
}

const px = (h: number, share: number, max = 40) => fontSizeOf(Math.max(8, Math.min(max, h * share)));

/** One reading's items in its box. */
function readingItems(r: Reading, box: Rect, ctx: ConvertContext) {
  const ink = ctx.palette;
  const head = r.kind === "value" ? box : { ...box, h: Math.min(box.h * 0.45, 28) };
  const size = px(head.h, 0.45, 22);
  const label = make("Text", ctx, { ...head, w: head.w * 0.55 }, r.label, { FontSize: size, Color: ink.subtext, Ellipsis: true, Wrap: false });
  const value = bound(
    make("Sensor", ctx, { ...head, x: head.x + head.w * 0.55, w: head.w * 0.45 }, r.label, {
      FontSize: size,
      Color: ink.text,
      Bold: true,
      RightAlign: true,
      ShowUnit: true,
      Wrap: false,
      ...(r.decimals !== undefined ? { OverridePrecision: true, Precision: r.decimals } : {}),
    }),
    r.key,
    ctx,
  );
  const below = { x: box.x, y: box.y + head.h + 2, w: box.w, h: Math.max(4, box.h - head.h - 2) };
  switch (r.kind) {
    case "value":
      return [label, value];
    case "bar":
      return [label, value, bound(make("Bar", ctx, { ...below, h: Math.min(below.h, 10) }, `${r.label} bar`, { MinValue: 0, MaxValue: r.max ?? 100, CornerRadius: 5 }), r.key, ctx)];
    case "graph":
      return [label, value, bound(make("Graph", ctx, below, `${r.label} graph`, { MinValue: 0, MaxValue: r.max ?? 100 }), r.key, ctx)];
    case "ring": {
      const side = Math.min(box.h, box.w * 0.45);
      const ring = bound(make("Gauge", ctx, { x: box.x, y: box.y, w: side, h: side }, `${r.label} ring`, { MaxValue: r.max ?? 100 }), r.key, ctx);
      const text = { x: box.x + side + 8, y: box.y + side * 0.25, w: box.w - side - 8, h: side * 0.5 };
      return [
        ring,
        make("Text", ctx, { ...text, h: text.h / 2 }, r.label, { FontSize: px(text.h / 2, 0.55, 18), Color: ink.subtext, Ellipsis: true, Wrap: false }),
        bound(make("Sensor", ctx, { ...text, y: text.y + text.h / 2, h: text.h / 2 }, r.label, { FontSize: px(text.h, 0.5, 26), Color: ink.text, Bold: true, ShowUnit: true, Wrap: false }), r.key, ctx),
      ];
    }
    case "table":
      return [bound(make("TableSensor", ctx, box, r.label, { FontSize: px(box.h / 6, 0.7, 18), Color: ink.text, MaxRows: 5, ShowHeader: false }), r.key, ctx)];
    case "image": {
      const side = Math.min(box.w, box.h);
      return [bound(make("HttpImage", ctx, { x: box.x, y: box.y, w: side, h: side }, r.label), r.key, ctx)];
    }
  }
}

/** A converter from a spec: the readings stacked down the box (two columns when it is wide and there are many). */
export const fromSpec =
  (spec: Spec): Converter =>
  (box, ctx, settings) => {
    const readings = spec(finderOf(ctx.sensors), settings);
    if (readings.length === 0) return [];
    const cols = readings.length > 4 && box.w >= 360 ? 2 : 1;
    const per = Math.ceil(readings.length / cols);
    const colW = (box.w - 12 * (cols - 1)) / cols;
    return Array.from({ length: cols }, (_, c) => readings.slice(c * per, (c + 1) * per)).flatMap((chunk, c) => {
      const rows = column({ x: box.x + c * (colW + 12), y: box.y, w: colW, h: box.h }, chunk.map((r) => WEIGHT[r.kind]), 6);
      return chunk.flatMap((r, i) => readingItems(r, rows[i], ctx));
    });
  };
