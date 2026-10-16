/**
 * Native mode (L5, L11): an InfoPanel item as the nearest dashboard panel
 * widget, at the item's position and size. Items with no native equivalent
 * stay in InfoPanel mode with the reason; a conversion lists what it loses.
 *
 * Where the app's widgets fall short (a vertical bar, a capsule, a rotated or
 * flipped item, scrolling text, an image-sequence gauge), the lab draws a
 * studio prototype of the missing capability and the conversion names it in
 * `needs`: the import report sums these up as the app work native mode asks for.
 *
 * The widget model is the app's (`@/lib/panel-model`); the item keeps all its
 * InfoPanel fields, so switching back is lossless.
 */
import type { Widget } from "@/lib/panel-model";
import { vectorOf } from "../gauges/frames.ts";
import { DEFAULT_GAUGE, type VectorGauge } from "../gauges/vector.ts";
import { cssColor } from "../render/color.ts";
import type { ShapeType } from "../render/geometry.ts";
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

/** A capability the app's widgets lack, drawn by a studio prototype. */
export type Custom =
  /** The custom gauge widget: a vector spec drawn live (L7). */
  | { kind: "vector"; gauge: VectorGauge; min: number; max: number }
  /** An image-sequence gauge: the frame for the value. */
  | { kind: "frames"; urls: string[]; min: number; max: number }
  /** A shape the shape widget lacks, from InfoPanel's own geometry. */
  | { kind: "shape"; type: ShapeType; radius: number; fill: string | null; stroke: { color: string; width: number } | null }
  /** The widget, scrolling left when wider than the box (InfoPanel's marquee). */
  | { kind: "marquee"; speed: number; spacing: number };

export interface NativeItem {
  widget: Widget;
  box: NativeBox;
  /** InfoPanel features the widget does not have. */
  lost: string[];
  custom?: Custom;
  /** Turned and mirrored about the box's centre, as InfoPanel does (flip first). */
  transform?: { rotate: number; flipX: boolean };
  /** App features this conversion relies on that the app's panel widgets do not have yet. */
  needs: string[];
}

export type Conversion = { ok: true; native: NativeItem } | { ok: false; reason: string };

export interface ConvertContext {
  /** FontScale of the profile: InfoPanel draws FontSize × FontScale px. */
  fontScale: number;
  /** The Data API key the item reads (sensor remap), if any. */
  keyOf(item: BoundItem): string | null;
  /** A URL for an export asset, when the lab can serve it. */
  assetUrl(name: string): string | null;
  /** An export asset's own size, when known (images drawn at their natural size). */
  assetSize?(name: string): { width: number; height: number } | null;
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

/** Rotation and flip, which the app's panel items would need. */
function transformOf(item: DisplayItem): { transform?: NativeItem["transform"]; needs: string[] } {
  const rotate = "Rotation" in item ? item.Rotation : 0;
  const flipX = "FlipX" in item && item.FlipX;
  if (!rotate && !flipX) return { needs: [] };
  return { transform: { rotate, flipX }, needs: [...(rotate ? ["rotated panel items"] : []), ...(flipX ? ["flipped panel items"] : [])] };
}

/** What a text item's widget loses: the dashboard widgets draw in the theme's font. */
function textLosses(item: Extract<DisplayItem, { Font: string }>): string[] {
  const lost = [`font ${item.Font || "default"}${item.Bold ? " bold" : ""}${item.Italic ? " italic" : ""} (widgets use the theme font)`];
  if (item.Underline || item.Strikeout) lost.push("underline / strikeout");
  if (translucent(item.Color)) lost.push("colour transparency");
  return lost;
}

/** InfoPanel scrolls text only in a box with a width. */
const marqueeOf = (item: Extract<DisplayItem, { Font: string }>): Custom | undefined =>
  "Marquee" in item && item.Marquee && item.Width > 0 ? { kind: "marquee", speed: Math.max(item.MarqueeSpeed, 1), spacing: item.MarqueeSpacing } : undefined;

const align = (item: Extract<DisplayItem, { Font: string }>): Widget["align"] =>
  item.CenterAlign ? "center" : item.RightAlign ? "right" : "left";

/** InfoPanel text boxes: 0 means "as wide/tall as the text". */
const textBox = (item: Extract<DisplayItem, { Font: string }>): NativeBox => ({
  x: item.X,
  y: item.Y,
  ...(item.Width > 0 ? { w: item.Width } : {}),
  ...(item.Height > 0 ? { h: item.Height } : {}),
});

/** A spec the custom gauge widget draws for a chart InfoPanel draws itself. */
const spec = (patch: Partial<VectorGauge>): VectorGauge => ({ ...DEFAULT_GAUGE, rounded: false, needle: null, ticks: null, ...patch });

export function convert(item: DisplayItem, id: string, ctx: ConvertContext): Conversion {
  if (item.kind === "Group") return no("a group converts item by item");
  if ("GlowEnabled" in item && item.GlowEnabled) return no("glow: no dashboard widget draws it");

  const base = { id, visible: !item.Hidden, label: undefined } satisfies Partial<Widget>;
  const sensor = isBound(item) ? (ctx.keyOf(item) ?? undefined) : undefined;
  const turned = transformOf(item);
  const ok = (widget: Omit<Widget, "id" | "visible">, box: NativeBox, lost: string[], extra: { custom?: Custom; needs?: string[] } = {}): Conversion => ({
    ok: true,
    native: {
      widget: { ...base, ...widget } as Widget,
      box,
      lost,
      ...(extra.custom ? { custom: extra.custom } : {}),
      ...(turned.transform ? { transform: turned.transform } : {}),
      needs: [...(extra.needs ?? []), ...turned.needs],
    },
  });
  const scrolling = (custom: Custom | undefined) => (custom ? { custom, needs: ["scrolling text"] } : {});

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
        scrolling(marqueeOf(item)),
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
        scrolling(marqueeOf(item)),
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
        scrolling(marqueeOf(item)),
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
      const box = { x: item.X, y: item.Y, w: item.Width, h: item.Height };
      const lost: string[] = [];
      if (item.MinValue !== 0 && item.Height <= item.Width) lost.push(`minimum ${item.MinValue}`);
      if (item.AutoValue) lost.push("automatic range");
      if (!sensor) lost.push("no sensor yet: remap it");
      if (item.Height > item.Width) {
        // The dashboard bar fills left to right: a vertical one is drawn as the custom gauge widget's bar.
        const color = hexColor(item.Color) ?? "#FFFFFF";
        const gauge = spec({
          shape: "bar", orientation: "vertical", width: item.Width, height: item.Height, thickness: item.Width,
          track: item.Background ? (hexColor(item.BackgroundColor) ?? null) : null,
          fill: item.Gradient
            ? { mode: "gradient", color, stops: [{ at: 0, color }, { at: 100, color: hexColor(item.GradientColor) ?? color }] }
            : { ...DEFAULT_GAUGE.fill, mode: "solid", color },
          ...(item.Frame ? { background: { color: null, border: { color: hexColor(item.FrameColor) ?? "#FFFFFF", width: 1 }, radius: item.CornerRadius } } : {}),
        });
        if (item.CornerRadius > 0) lost.push(`corner radius ${item.CornerRadius} of the fill`);
        return ok({ kind: "bar", sensor, max: item.MaxValue, color }, box, lost, {
          custom: { kind: "vector", gauge, min: item.MinValue, max: item.MaxValue },
          needs: ["vertical bar"],
        });
      }
      lost.unshift("frame and background", "the widget adds a label and value row");
      if (item.Gradient) lost.push("gradient");
      return ok({ kind: "bar", sensor, max: item.MaxValue, color: hexColor(item.Color) }, box, lost);
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
        return no(src.kind === "none" ? src.why : "the image has no URL yet (uploading to the lab asset store, or not an image the widget shows)");
      }
      // InfoPanel draws a 0 × 0 image at its file's size; the widget needs the box.
      const natural = src.kind === "asset" ? (ctx.assetSize?.(src.name) ?? null) : null;
      const width = item.Width || natural?.width || 0;
      const height = item.Height || natural?.height || 0;
      if (width <= 0 || height <= 0) return no("image at its natural size, which is not known: give it a Width and Height to convert");
      const w = Math.trunc((width * item.Scale) / 100);
      const h = Math.trunc((height * item.Scale) / 100);
      const lost = item.Layer ? ["colour layer"] : [];
      return ok(
        { kind: "image", text: url ?? undefined, sensor: item.kind === "HttpImage" ? sensor : undefined, height: h },
        { x: item.X, y: item.Y, w, h },
        lost,
      );
    }

    case "Shape": {
      if (item.ShowGradient) return no("gradient fill: no dashboard widget draws it");
      const box = { x: item.X, y: item.Y, w: item.Width, h: item.Height };
      const fill = item.ShowFill ? item.FillColor : item.FrameColor;
      const lost: string[] = [];
      if (cssColor(fill) === null || translucent(fill)) lost.push("colour transparency");
      const shape = item.Type === "Rectangle" ? "rect" : item.Type === "Ellipse" && item.Width === item.Height ? "circle" : null;
      if (shape) {
        if (item.ShowFrame && item.FrameThickness > 0) lost.push("frame");
        if (shape === "rect" && item.CornerRadius > 0) lost.push(`corner radius ${item.CornerRadius}`);
        return ok({ kind: "shape", shape, color: hexColor(fill), ...(shape === "circle" ? { thickness: item.Width } : {}) }, box, lost);
      }
      // Capsules, ovals and polygons: the shape widget would need them.
      const name = item.Type === "Ellipse" ? "oval" : item.Type.toLowerCase();
      return ok({ kind: "shape", shape: "rect", color: hexColor(fill) }, box, lost, {
        custom: {
          kind: "shape", type: item.Type, radius: item.CornerRadius,
          fill: item.ShowFill ? (hexColor(item.FillColor) ?? null) : null,
          stroke: item.ShowFrame && item.FrameThickness > 0 ? { color: hexColor(item.FrameColor) ?? "#FFFFFF", width: item.FrameThickness } : null,
        },
        needs: [`${name} shape`],
      });
    }

    case "Donut": {
      // InfoPanel's donut starts at 3 o'clock and runs clockwise for Span degrees: an arc of the custom gauge widget.
      const gauge = spec({
        width: item.Width, height: item.Width, start: 90, sweep: Math.max(1, item.Span), thickness: Math.max(1, item.Thickness),
        track: item.Background ? (hexColor(item.BackgroundColor) ?? null) : null,
        fill: { ...DEFAULT_GAUGE.fill, mode: "solid", color: hexColor(item.Color) ?? "#FFFFFF" },
      });
      const lost = [...(item.Frame ? ["frame"] : []), ...(item.AutoValue ? ["automatic range"] : []), ...(sensor ? [] : ["no sensor yet: remap it"])];
      return ok({ kind: "gauge", sensor, max: item.MaxValue }, { x: item.X, y: item.Y, w: item.Width, h: item.Width }, lost, {
        custom: { kind: "vector", gauge, min: item.MinValue, max: item.MaxValue },
        needs: ["custom gauge widget"],
      });
    }

    case "Gauge": {
      const g = vectorOf(item);
      if (g) {
        const w = Math.floor(((item.Width || g.width) * item.Scale) / 100);
        const h = Math.floor(((item.Height || g.height) * item.Scale) / 100);
        // The studio's custom gauge widget draws the spec itself, live; the app's ring widget is the stand-in kind.
        return ok({ kind: "gauge", sensor, max: item.MaxValue, color: g.fill.color }, { x: item.X, y: item.Y, w, h }, sensor ? [] : ["no sensor yet: remap it"], {
          custom: { kind: "vector", gauge: g, min: item.MinValue, max: item.MaxValue },
          needs: ["custom gauge widget"],
        });
      }
      if (item.Images.length === 0) return no("gauge without frames");
      const sources = item.Images.map((img) => imageSource(img));
      const urls = sources.map((s) => (s.kind === "url" ? s.url : s.kind === "asset" ? ctx.assetUrl(s.name) : null));
      if (urls.some((u) => u === null)) return no("image-sequence gauge: its frames have no URL yet (uploading to the lab asset store)");
      const first = sources[0].kind === "asset" ? (ctx.assetSize?.(sources[0].name) ?? null) : null;
      const w = Math.floor(((item.Width || first?.width || 0) * item.Scale) / 100);
      const h = Math.floor(((item.Height || first?.height || 0) * item.Scale) / 100);
      if (w <= 0 || h <= 0) return no("image-sequence gauge at its frames' size, which is not known");
      const lost = [...(item.AnimationSpeed > 0 ? ["AnimationSpeed (the frame changes at once)"] : []), ...(sensor ? [] : ["no sensor yet: remap it"])];
      return ok({ kind: "gauge", sensor, max: item.MaxValue }, { x: item.X, y: item.Y, w, h }, lost, {
        custom: { kind: "frames", urls: urls as string[], min: item.MinValue, max: item.MaxValue },
        needs: ["image-sequence gauge widget"],
      });
    }

    case "SensorImage":
      return no("image chosen by thresholds: no dashboard widget does that");
  }
}
