/**
 * A native panel's widgets as InfoPanel items. Each widget kind is rebuilt from InfoPanel's own: a stat or value
 * is a Sensor (with a Text label), a bar a Bar, a gauge a ring Gauge, a custom gauge its vector Gauge, a sparkline
 * a Graph, a table a TableSensor, text a Text (a Sensor when bound), an image an Image or HttpImage, a clock a
 * Clock or Calendar, a shape a Shape. Each is placed at the box it was measured at in the studio (`measured`, read
 * from the DOM once the fonts are ready, see `measure.ts`), else the panel's box shared evenly down the zone.
 */
import { defaultItem, type DisplayItem } from "../schema.ts";
import type { PanelDef, Widget } from "../../panel-model.ts";
import { bindKey } from "./bind.ts";
import { argb, bound, fontSizeOf, make, type ConvertContext, type Rect } from "./items.ts";
import { PANEL_KIND_TIERS } from "./tiers.ts";

/** A widget's box on the zone, and the font it was drawn in when that is known. */
export interface Measured extends Rect {
  fontSize?: number;
  color?: string;
}

const FALLBACK_SIZE = 20;

/** The boxes of the visible widgets when none were measured: the zone shared evenly down its height. */
export function stackBoxes(widgets: readonly Widget[], zone: Rect): Map<string, Rect> {
  const h = zone.h / Math.max(1, widgets.length);
  return new Map(widgets.map((w, i) => [w.id, { x: zone.x, y: zone.y + i * h, w: zone.w, h }]));
}

const SHAPE: Record<string, string> = { rect: "Rectangle", vbar: "Rectangle", hbar: "Rectangle", circle: "Ellipse" };

const CLOCK_FORMATS = { time: "HH:mm", date: "dddd d MMMM" } as const;

const textFields = (w: Widget, m: Measured, ctx: ConvertContext) => ({
  FontSize: fontSizeOf(w.fontSize ?? m.fontSize ?? FALLBACK_SIZE),
  Color: argb(w.color ?? m.color ?? ctx.look.Color),
  ...(w.align === "center" ? { CenterAlign: true } : w.align === "right" ? { RightAlign: true } : {}),
});

/** A value's number settings: its decimals, its unit and a display multiplier. */
const numberFields = (w: Widget) => ({
  ...(w.decimals !== undefined ? { OverridePrecision: true, Precision: w.decimals } : {}),
  ...(w.unit !== undefined ? { OverrideUnit: true, Unit: w.unit } : {}),
  ...(w.scale !== undefined && w.scale !== 1 ? { MultiplicationModifier: w.scale } : {}),
});

/** The items of one widget at `m`. */
export function widgetItems(w: Widget, m: Measured, ctx: ConvertContext): DisplayItem[] {
  const name = w.label || w.kind;
  const box: Rect = m;
  switch (w.kind) {
    case "stat":
    case "value": {
      const size = Math.round(w.fontSize ?? m.fontSize ?? FALLBACK_SIZE);
      const labelH = w.kind === "stat" && w.label ? Math.round(size * 0.6) + 4 : 0;
      const value = bound(make("Sensor", ctx, { ...box, y: box.y + labelH, h: box.h - labelH }, name, { ...textFields(w, m, ctx), ...numberFields(w) }), w.sensor, ctx);
      // A Text item's own text is its Name.
      const label = labelH ? [make("Text", ctx, { ...box, h: labelH }, w.label ?? "", { ...textFields(w, m, ctx), FontSize: fontSizeOf(size * 0.6), Color: ctx.palette.subtext })] : [];
      return [...label, value];
    }
    case "bar":
      return [bound(make("Bar", ctx, box, name, { MinValue: 0, MaxValue: w.max ?? 100, ...(w.color ? { Color: argb(w.color) } : {}), ...(w.inverted ? { FlipX: true } : {}) }), w.sensor, ctx)];
    case "gauge": {
      const size = w.size ?? Math.min(m.w, m.h);
      return [bound(make("Gauge", ctx, { ...box, w: size, h: size }, name, { MaxValue: w.max ?? 100 }), w.sensor, ctx)];
    }
    case "customGauge": {
      const gauge = make("Gauge", ctx, box, name, { MaxValue: w.max ?? 100, ...(w.vector ? { vector: w.vector } : {}) });
      return [bound(gauge, w.sensor, ctx)];
    }
    case "sparkline":
      return [bound(make("Graph", ctx, box, name, { MaxValue: w.max ?? 100, ...(w.color ? { Color: argb(w.color) } : {}) }), w.sensor, ctx)];
    case "table": {
      // A table reads plugins only: any other text stays a multi-line value.
      const r = w.sensor ? bindKey(w.sensor, ctx.sensors) : undefined;
      if (r?.ok && r.binding.SensorType !== "Plugin") return [bound(make("Sensor", ctx, box, name, textFields(w, m, ctx)), w.sensor, ctx)];
      return [bound(make("TableSensor", ctx, box, name, { ...textFields(w, m, ctx), MaxRows: w.rows ?? 5, ShowHeader: !!w.header }), w.sensor, ctx)];
    }
    case "text":
      return [w.sensor ? bound(make("Sensor", ctx, box, name, { ...textFields(w, m, ctx), ShowUnit: false }), w.sensor, ctx) : make("Text", ctx, box, w.text ?? "", { ...textFields(w, m, ctx),...(w.scroll ? { Marquee: true, MarqueeSpeed: w.scrollSpeed ?? 50, MarqueeSpacing: w.scrollSpacing ?? 40 } : {}) })];
    case "image":
      return [w.sensor ? bound(make("HttpImage", ctx, box, name), w.sensor, ctx) : make("Image", ctx, box, name, w.text ? { Type: "URL", HttpUrl: w.text } : {})];
    case "clock": {
      const both = w.clock === "both" || !w.clock;
      const parts = both ? (["time", "date"] as const) : ([w.clock as "time" | "date"] as const);
      const h = box.h / parts.length;
      return parts.map((part, i) =>
        make(part === "time" ? "Clock" : "Calendar", ctx, { ...box, y: box.y + i * h, h }, `${name} ${part}`, { ...textFields(w, m, ctx), Format: w.format || CLOCK_FORMATS[part], Uppercase: false }),
      );
    }
    case "shape":
      return [make("Shape", ctx, box, name, { Type: SHAPE[w.shape ?? "rect"] ?? "Rectangle", ...(w.color ? { FillColor: argb(w.color) } : {}), ...(w.thickness && w.shape === "hbar" ? { Height: w.thickness } : {}), ...(w.shape === "circle" || w.shape === "vbar" || w.shape === "hbar" ? { CornerRadius: 0 } : {}) })];
  }
}

/** A panel as a Group at the zone's box holding its visible widgets' items (children carry canvas coordinates). */
export function panelToItems(panel: PanelDef, zone: Rect, measured: ReadonlyMap<string, Measured>, ctx: ConvertContext): DisplayItem {
  const shown = panel.widgets.filter((w) => w.visible);
  const fallback = stackBoxes(shown, zone);
  const kids = shown.flatMap((w) => {
    const m = measured.get(w.id) ?? fallback.get(w.id)!;
    const approx = PANEL_KIND_TIERS[w.kind].approximated;
    if (approx) ctx.notes.push({ name: w.label || w.kind, text: `approximated: ${approx}` });
    return widgetItems(w, m, ctx);
  });
  return { ...defaultItem("Group"), Name: panel.title || "Panel", X: Math.round(zone.x), Y: Math.round(zone.y), DisplayItems: kids } as DisplayItem;
}
