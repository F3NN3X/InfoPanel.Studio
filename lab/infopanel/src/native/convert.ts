/**
 * Native mode (L5): an InfoPanel item as the nearest dashboard panel widget,
 * at the item's position and size. Items with no native equivalent stay in
 * InfoPanel mode with the reason; a conversion lists what it loses.
 *
 * The widget model is the app's (`@/lib/panel-model`); the item keeps all its
 * InfoPanel fields, so switching back is lossless.
 */
import type { Widget } from "@/lib/panel-model";
import { vectorOf } from "../gauges/frames.ts";
import type { VectorGauge } from "../gauges/vector.ts";
import { cssColor } from "../render/color.ts";
import { imageSource } from "../render/scene.ts";
import type { DisplayItem } from "../schema.ts";
import { isBound, type BoundItem } from "../sensors.ts";

/** Where a native widget sits, in profile pixels. A missing size means the content's. */
export interface NativeBox {
  x: number;
  y: number;
  w?: number;
  h?: number;
}

export interface NativeItem {
  widget: Widget;
  box: NativeBox;
  /** InfoPanel features the widget does not have. */
  lost: string[];
  /** A vector gauge: the custom gauge widget draws this spec live (studio prototype, L7). */
  custom?: { gauge: VectorGauge; min: number; max: number };
}

export type Conversion = { ok: true; native: NativeItem } | { ok: false; reason: string };

export interface ConvertContext {
  /** FontScale of the profile: InfoPanel draws FontSize × FontScale px. */
  fontScale: number;
  /** The Data API key the item reads (sensor remap), if any. */
  keyOf(item: BoundItem): string | null;
  /** A URL for an export asset, when the lab can serve it. */
  assetUrl(name: string): string | null;
}

/** "#AARRGGBB" → "#RRGGBB" (the widget colours have no alpha). */
export function hexColor(c: string): string | undefined {
  const m = /^#?([0-9a-f]{2})?([0-9a-f]{6})$/i.exec(c.trim());
  return m ? `#${m[2].toUpperCase()}` : undefined;
}
const translucent = (c: string) => {
  const m = /^#?([0-9a-f]{2})[0-9a-f]{6}$/i.exec(c.trim());
  return m !== null && m[1].toUpperCase() !== "FF";
};

const no = (reason: string): Conversion => ({ ok: false, reason });

/** Features that block any conversion: the widget cannot draw them at all. */
function blocker(item: DisplayItem): string | null {
  if (item.kind !== "Donut" && item.Rotation !== 0) return "rotated";
  if ("FlipX" in item && item.FlipX) return "flipped";
  if ("Marquee" in item && item.Marquee) return "marquee (scrolling text)";
  if ("GlowEnabled" in item && item.GlowEnabled) return "glow";
  return null;
}

/** What a text item's widget loses: the dashboard widgets draw in the theme's font. */
function textLosses(item: Extract<DisplayItem, { Font: string }>): string[] {
  const lost = [`font ${item.Font || "default"}${item.Bold ? " bold" : ""}${item.Italic ? " italic" : ""} (widgets use the theme font)`];
  if (item.Underline || item.Strikeout) lost.push("underline / strikeout");
  if (translucent(item.Color)) lost.push("colour transparency");
  return lost;
}

const align = (item: Extract<DisplayItem, { Font: string }>): Widget["align"] =>
  item.CenterAlign ? "center" : item.RightAlign ? "right" : "left";

/** InfoPanel text boxes: 0 means "as wide/tall as the text". */
const textBox = (item: Extract<DisplayItem, { Font: string }>): NativeBox => ({
  x: item.X,
  y: item.Y,
  ...(item.Width > 0 ? { w: item.Width } : {}),
  ...(item.Height > 0 ? { h: item.Height } : {}),
});

export function convert(item: DisplayItem, id: string, ctx: ConvertContext): Conversion {
  if (item.kind === "Group") return no("a group converts item by item");
  const blocked = blocker(item);
  if (blocked) return no(`${blocked}: no dashboard widget draws it`);

  const base = { id, visible: !item.Hidden, label: undefined } satisfies Partial<Widget>;
  const sensor = isBound(item) ? (ctx.keyOf(item) ?? undefined) : undefined;
  const ok = (widget: Omit<Widget, "id" | "visible">, box: NativeBox, lost: string[]): Conversion => ({
    ok: true,
    native: { widget: { ...base, ...widget } as Widget, box, lost },
  });

  switch (item.kind) {
    case "Text":
      return ok(
        {
          kind: "text",
          text: item.Uppercase ? item.Name.toUpperCase() : item.Name,
          fontSize: Math.round(item.FontSize * ctx.fontScale),
          color: hexColor(item.Color),
          align: align(item),
        },
        textBox(item),
        textLosses(item),
      );

    case "Sensor": {
      const lost = textLosses(item);
      if (item.Threshold1 > 0 || item.Threshold2 > 0) lost.push("threshold colours");
      if (item.AdditionModifier !== 0) lost.push(`adding ${item.AdditionModifier}`);
      if (!item.ShowUnit) lost.push("hidden unit (the widget shows it)");
      if (item.ValueType !== "NOW") lost.push(`${item.ValueType} value (the widget shows the current one)`);
      if (item.ShowName) lost.push("the name before the value (shown as the label)");
      if (!sensor) lost.push("no sensor yet: remap it");
      const scale = item.DivisionToggle ? 1 / (item.MultiplicationModifier || 1) : item.MultiplicationModifier;
      return ok(
        {
          kind: "value",
          sensor,
          label: item.ShowName ? item.Name : undefined,
          unit: item.OverrideUnit && item.ShowUnit ? item.Unit : undefined,
          decimals: item.OverridePrecision ? item.Precision : undefined,
          ...(scale !== 1 ? { scale } : {}),
          fontSize: Math.round(item.FontSize * ctx.fontScale),
          color: hexColor(item.Color),
          align: align(item),
        },
        textBox(item),
        lost,
      );
    }

    case "Clock":
    case "Calendar":
      return ok(
        {
          kind: "clock",
          clock: item.kind === "Clock" ? "time" : "date",
          fontSize: Math.round(item.FontSize * ctx.fontScale),
          color: hexColor(item.Color),
          align: align(item),
        },
        textBox(item),
        [...textLosses(item), `format ${item.Format} (the widget follows General settings)`],
      );

    case "TableSensor": {
      const columns = item.TableFormat.split("|").filter((p) => /^\d+:\d+$/.test(p)).length;
      return ok(
        { kind: "table", sensor, rows: item.MaxRows, columns, fontSize: Math.round(item.FontSize * ctx.fontScale), align: align(item) },
        textBox(item),
        [...textLosses(item), "column widths", ...(item.ShowHeader ? ["the plugin's column headers"] : [])],
      );
    }

    case "Bar": {
      if (item.Height > item.Width) return no("vertical bar: the dashboard bar fills left to right");
      const lost = ["frame and background", "the widget adds a label and value row"];
      if (item.MinValue !== 0) lost.push(`minimum ${item.MinValue}`);
      if (item.Gradient) lost.push("gradient");
      if (!sensor) lost.push("no sensor yet: remap it");
      return ok({ kind: "bar", sensor, max: item.MaxValue, color: hexColor(item.Color) }, { x: item.X, y: item.Y, w: item.Width, h: item.Height }, lost);
    }

    case "Graph": {
      const lost = ["frame, background and fill colour"];
      if (item.Type === "HISTOGRAM") lost.push("histogram bars (drawn as a line)");
      if (!sensor) lost.push("no sensor yet: remap it");
      return ok(
        { kind: "sparkline", sensor, history: Math.max(2, Math.floor(item.Width / item.Step)), color: hexColor(item.Color) },
        { x: item.X, y: item.Y, w: item.Width, h: item.Height },
        lost,
      );
    }

    case "Image":
    case "HttpImage": {
      if (item.Type === "RTSP") return no("RTSP video: no dashboard widget plays it");
      const src = imageSource(item);
      const url = src.kind === "url" ? src.url : src.kind === "asset" ? ctx.assetUrl(src.name) : null;
      if (item.kind === "Image" && !url) {
        return no(src.kind === "none" ? src.why : "the image has no served URL (opened from a file, or edited or added in the lab)");
      }
      // InfoPanel draws a 0 × 0 image at its file's size; the widget needs the box.
      if (item.Width <= 0 || item.Height <= 0) return no("image at its natural size: give it a Width and Height to convert");
      const w = Math.round((item.Width * item.Scale) / 100);
      const h = Math.round((item.Height * item.Scale) / 100);
      const lost = item.Layer ? ["colour layer"] : [];
      return ok(
        { kind: "image", text: url ?? undefined, sensor: item.kind === "HttpImage" ? sensor : undefined, height: h },
        { x: item.X, y: item.Y, w, h },
        lost,
      );
    }

    case "Shape": {
      if (item.ShowGradient) return no("gradient fill: no dashboard widget draws it");
      const shape = item.Type === "Rectangle" ? "rect" : item.Type === "Ellipse" && item.Width === item.Height ? "circle" : null;
      if (!shape) return no(`${item.Type === "Ellipse" ? "oval" : item.Type.toLowerCase()} shape: the dashboard has rectangles and circles`);
      const lost: string[] = [];
      if (item.ShowFrame && item.FrameThickness > 0) lost.push("frame");
      if (shape === "rect" && item.CornerRadius > 0) lost.push(`corner radius ${item.CornerRadius}`);
      const fill = item.ShowFill ? item.FillColor : item.FrameColor;
      if (cssColor(fill) === null || translucent(fill)) lost.push("colour transparency");
      return ok(
        { kind: "shape", shape, color: hexColor(fill), ...(shape === "circle" ? { thickness: item.Width } : {}) },
        { x: item.X, y: item.Y, w: item.Width, h: item.Height },
        lost,
      );
    }

    case "Donut":
      return no("donut: no dashboard widget has its span, thickness and start angle");
    case "Gauge": {
      const g = vectorOf(item);
      if (!g) return no("image-sequence gauge: convert it to a vector gauge first (Gauges panel)");
      const w = Math.floor(((item.Width || g.width) * item.Scale) / 100);
      const h = Math.floor(((item.Height || g.height) * item.Scale) / 100);
      // The studio's custom gauge widget (an app phase) draws the spec itself, live; the
      // app's ring widget is the stand-in kind until then.
      return {
        ok: true,
        native: {
          widget: { ...base, kind: "gauge", sensor, max: item.MaxValue, color: g.fill.color } as Widget,
          box: { x: item.X, y: item.Y, w, h },
          lost: sensor ? [] : ["no sensor yet: remap it"],
          custom: { gauge: g, min: item.MinValue, max: item.MaxValue },
        },
      };
    }

    case "SensorImage":
      return no("image chosen by thresholds: no dashboard widget does that");
  }
}
