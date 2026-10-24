/**
 * Native mode (L5, L11): an InfoPanel item as the nearest dashboard panel
 * widget, at the item's position and size. Items with no native equivalent
 * stay in InfoPanel mode with the reason; a conversion lists what it loses.
 *
 * Where the app's widgets fall short (a vertical bar, a capsule, a rotated or
 * flipped item, an image-sequence gauge), the lab draws a
 * studio prototype of the missing capability and the conversion names it in
 * `needs`: the import report sums these up as the app work native mode asks for.
 *
 * The widget model is the app's (`@/lib/panel-model`); the item keeps all its
 * InfoPanel fields, so switching back is lossless.
 */
import type { Widget } from "@/lib/panel-model";
import type { StaticSpec } from "../elements/spec.ts";
import { staticOf } from "../elements/svg.ts";
import { vectorOf } from "../gauges/frames.ts";
import { DEFAULT_GAUGE, type VectorGauge } from "../gauges/vector.ts";
import { cssColor } from "../render/color.ts";
import type { GradientType, GraphInput, ShapeType } from "../render/geometry.ts";
import { imageSource, textStyle, type TextStyle } from "../render/scene.ts";
import type { DisplayItem } from "../schema.ts";
import { isBound, type BoundItem } from "../sensors.ts";

/** Where a native widget sits, in profile pixels. A missing size means the content's. */
export interface NativeBox {
  x: number;
  y: number;
  w?: number;
  h?: number;
  /** "end": `x` is the right edge (InfoPanel's right-aligned text with no Width ends at X). */
  anchor?: "end";
}

/** A capability the app's widgets lack, drawn by a studio prototype. */
export type Custom =
  /** The custom gauge widget: a vector spec drawn live (L7). */
  | { kind: "vector"; gauge: VectorGauge; min: number; max: number }
  /** A static studio element (card, glow, divider, icon) drawn live from its spec. */
  | { kind: "element"; spec: StaticSpec }
  /** An image-sequence gauge: the frame for the value. */
  | { kind: "frames"; urls: string[]; min: number; max: number }
  /** The image stretched over the box with InfoPanel's colour layer (#AARRGGBB) on top; nothing without an image. */
  | {
      kind: "image";
      layer: string | null;
      /** A SensorImage: drawn only while its value (by ValueType) is within min..max, as InfoPanel does. */
      show?: { min: number; max: number; valueType: string };
    }
  /** A line or histogram graph from InfoPanel's own geometry (the sparkline adds a label row and an area fill). */
  /** zeros: unbound, InfoPanel still draws a HWiNFO or Libre graph from zeros. */
  | { kind: "graph"; graph: GraphStyle; zeros: boolean }
  /**
   * A shape the shape widget cannot draw yet, from InfoPanel's own geometry and paints: colours as InfoPanel
   * writes them (#AARRGGBB), a gradient over the turned shape's bounds, turned about its centre like InfoPanel.
   */
  | {
      kind: "shape";
      type: ShapeType;
      radius: number;
      fill: string | null;
      stroke: { color: string; width: number } | null;
      gradient: { color2: string; color3: string; angle: number; speed: number; type: GradientType } | null;
    }
  /**
   * Text in InfoPanel's own font, size, colour and placement, with InfoPanel's text for the item (a sensor's
   * value as InfoPanel formats it, a clock's format), scrolling when it has a marquee: the app's text widgets
   * draw in the theme font and their own format.
   */
  | {
      kind: "text";
      item: TextSource;
      style: TextStyle;
      /** InfoPanel's Width: 0 sizes the box to the text. */
      width: number;
      align: "left" | "center" | "right";
      oneLine: boolean;
      ellipsis: boolean;
      marquee: { speed: number; spacing: number } | null;
    };

/** A graph's look, as InfoPanel's PanelDraw takes it; the samples are the sensor's history, the size the box's. */
export type GraphStyle = Omit<GraphInput, "width" | "height" | "samples">;

/** The items native text draws. */
export type TextSource = Extract<DisplayItem, { kind: "Text" | "Sensor" | "Clock" | "Calendar" | "TableSensor" }>;

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
/** Alpha 00: InfoPanel draws nothing in this colour. */
const clear = (c: string) => /^#?00[0-9a-f]{6}$/i.test(c.trim());
/** A colour the spec can draw, or null for a fully transparent one. */
const shown = (c: string) => (clear(c) ? null : (hexColor(c) ?? null));

const no = (reason: string): Conversion => ({ ok: false, reason });

/** Rotation and flip, which the app's panel items would need. */
function transformOf(item: DisplayItem): { transform?: NativeItem["transform"]; needs: string[] } {
  const rotate = "Rotation" in item ? item.Rotation : 0;
  const flipX = "FlipX" in item && item.FlipX;
  if (!rotate && !flipX) return { needs: [] };
  return { transform: { rotate, flipX }, needs: [...(rotate ? ["rotated panel items"] : []), ...(flipX ? ["flipped panel items"] : [])] };
}

const align = (item: Extract<DisplayItem, { Font: string }>): NonNullable<Widget["align"]> =>
  item.CenterAlign ? "center" : item.RightAlign ? "right" : "left";

/**
 * InfoPanel text boxes, at whole pixels as it draws them: Width 0 is "as wide as the text", starting at X,
 * or ending at X when right-aligned; Height is only the rotation pivot (and a marquee's clip).
 */
const textBox = (item: Extract<DisplayItem, { Font: string }>): NativeBox => ({
  x: Math.floor(item.X),
  y: Math.floor(item.Y),
  ...(item.Width > 0 ? { w: item.Width } : {}),
  ...(item.Height > 0 ? { h: item.Height } : {}),
  ...(item.Width <= 0 && item.RightAlign && !item.CenterAlign ? { anchor: "end" as const } : {}),
});

/** The studio's text prototype for a text item: its own font, size, colour and placement. */
const textCustom = (item: TextSource, fontScale: number): Extract<Custom, { kind: "text" }> => ({
  kind: "text",
  item,
  style: textStyle(item, fontScale),
  width: item.Width,
  align: align(item),
  oneLine: item.Wrap,
  ellipsis: item.Ellipsis,
  marquee: scrolls(item) ? { speed: Math.max(item.MarqueeSpeed, 1), spacing: Math.max(0, item.MarqueeSpacing) } : null,
});

/** InfoPanel scrolls text only in a box with a width. */
const scrolls = (item: TextSource) => item.Marquee && item.Width > 0;

/** What the app's text widgets would need to draw a text item as InfoPanel does (the text widget scrolls, the rest do not). */
const textNeeds = (item: TextSource, format?: string) => [
  "text font and style",
  ...(format ? [format] : []),
  ...(scrolls(item) && item.kind !== "Text" ? ["scrolling text"] : []),
];

/** A spec the custom gauge widget draws for a chart InfoPanel draws itself. */
const spec = (patch: Partial<VectorGauge>): VectorGauge => ({ ...DEFAULT_GAUGE, rounded: false, needle: null, ticks: null, ...patch });

/**
 * InfoPanel's bar (PanelDraw, render/geometry.ts barParts) as a bar of the bar generator: taller than wide
 * fills bottom up; the frame is a 1 px border that insets the bar by a pixel; background and fill share the
 * corner radius; a gradient runs from Color (held to the middle) to GradientColor over the filled part.
 */
export function barSpec(item: Extract<DisplayItem, { kind: "Bar" }>): VectorGauge {
  const vertical = item.Height > item.Width;
  const frame = item.Frame ? 1 : 0; // a transparent frame still insets the bar
  const color = hexColor(item.Color) ?? "#FFFFFF";
  return spec({
    shape: "bar",
    orientation: vertical ? "vertical" : "horizontal",
    width: Math.max(4, item.Width),
    height: Math.max(4, item.Height),
    thickness: Math.max(1, (vertical ? item.Width : item.Height) - 2 * frame),
    radius: Math.max(0, item.CornerRadius - frame),
    track: item.Background ? shown(item.BackgroundColor) : null,
    fill: item.Gradient
      ? { mode: "gradient", color, over: "fill", stops: [{ at: 0, color }, { at: 50, color }, { at: 100, color: hexColor(item.GradientColor) ?? color }] }
      : { ...DEFAULT_GAUGE.fill, mode: "solid", color },
    ...(item.Frame && !clear(item.FrameColor) ? { background: { color: null, border: { color: hexColor(item.FrameColor) ?? "#FFFFFF", width: 1 }, radius: item.CornerRadius } } : {}),
  });
}

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
  // Text items: the app widget they become, drawn meanwhile by the text prototype in InfoPanel's font and place.
  switch (item.kind) {
    case "Text":
      return ok(
        {
          kind: "text", text: item.Name, fontSize: Math.round(item.FontSize * ctx.fontScale), color: hexColor(item.Color), align: align(item),
          ...(scrolls(item) ? { scroll: true, scrollSpeed: Math.max(item.MarqueeSpeed, 1), scrollSpacing: Math.max(0, item.MarqueeSpacing) } : {}),
        },
        textBox(item),
        [],
        { custom: textCustom(item, ctx.fontScale), needs: textNeeds(item) },
      );

    case "Sensor": {
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
        sensor ? [] : ["no sensor yet: remap it"],
        { custom: textCustom(item, ctx.fontScale), needs: textNeeds(item, "InfoPanel value format (name, unit, precision, thresholds)") },
      );
    }

    case "Clock":
    case "Calendar":
      return ok(
        {
          kind: "clock", clock: item.kind === "Clock" ? "time" : "date", fontSize: Math.round(item.FontSize * ctx.fontScale), color: hexColor(item.Color), align: align(item),
          ...(item.Format ? { format: item.Format } : {}),
        },
        textBox(item),
        item.Uppercase ? ["Uppercase"] : [],
        { custom: textCustom(item, ctx.fontScale), needs: textNeeds(item) },
      );

    case "TableSensor": {
      const columns = item.TableFormat.split("|").filter((p) => /^\d+:\d+$/.test(p)).length;
      // Drawn meanwhile as InfoPanel lays it out: its columns at their widths, rows at the font's line step.
      return ok(
        { kind: "table", sensor, rows: item.MaxRows, columns, fontSize: Math.round(item.FontSize * ctx.fontScale), align: align(item) },
        { x: Math.floor(item.X), y: Math.floor(item.Y) },
        sensor ? [] : ["no sensor yet: remap it"],
        { custom: textCustom(item, ctx.fontScale), needs: textNeeds(item, "InfoPanel table layout (column widths, headers)") },
      );
    }

    case "Bar": {
      // The bar generator's bar (the custom gauge widget): the app's bar widget adds a label and value row and
      // has no frame, background, corner radius, gradient or vertical bar.
      const box = { x: Math.floor(item.X), y: Math.floor(item.Y), w: item.Width, h: item.Height };
      const gauge = barSpec(item);
      const vertical = gauge.orientation === "vertical";
      const lost: string[] = [];
      if (item.AutoValue) lost.push("automatic range");
      // A fully transparent track or frame is simply left out; any other translucency is lost.
      if ([item.Color, ...(item.Gradient ? [item.GradientColor] : [])].some(translucent) || [...(item.Background ? [item.BackgroundColor] : []), ...(item.Frame ? [item.FrameColor] : [])].some((c) => translucent(c) && !clear(c))) {
        lost.push("colour transparency");
      }
      if (vertical && item.Gradient) lost.push("gradient direction (InfoPanel runs a vertical bar's gradient across it)");
      if (!sensor) lost.push("no sensor yet: remap it");
      return ok({ kind: "bar", sensor, max: item.MaxValue, color: hexColor(item.Color) }, box, lost, {
        custom: { kind: "vector", gauge, min: item.MinValue, max: item.MaxValue },
        needs: ["custom gauge widget"],
      });
    }

    case "Graph": {
      const graph: GraphStyle = {
        type: item.Type, min: item.MinValue, max: item.MaxValue, auto: item.AutoValue, thickness: item.Thickness, step: item.Step,
        fill: item.Fill, fillColor: item.FillColor, color: item.Color,
        frame: item.Frame, frameColor: item.FrameColor, background: item.Background, backgroundColor: item.BackgroundColor,
      };
      return ok(
        { kind: "sparkline", sensor, history: Math.max(2, Math.floor(item.Width / Math.max(item.Step, 1))), color: hexColor(item.Color) },
        { x: Math.floor(item.X), y: Math.floor(item.Y), w: item.Width, h: item.Height },
        sensor ? [] : ["no sensor yet: remap it"],
        { custom: { kind: "graph", graph, zeros: item.SensorType !== "Plugin" }, needs: [`InfoPanel graph style (${item.Type === "HISTOGRAM" ? "histogram, " : ""}step, thickness, frame, background, fill)`] },
      );
    }

    case "Image":
    case "HttpImage":
    case "SensorImage": {
      const element = staticOf(item);
      if (element) {
        const box = { x: Math.floor(item.X), y: Math.floor(item.Y), w: element.width, h: element.height };
        return ok({ kind: "image", height: element.height }, box, [], { custom: { kind: "element", spec: element.spec }, needs: ["studio element"] });
      }
      if (item.Type === "RTSP") return no("RTSP video: no dashboard widget plays it");
      const src = imageSource(item);
      const url = src.kind === "url" ? src.url : src.kind === "asset" ? ctx.assetUrl(src.name) : null;
      if (item.kind !== "HttpImage" && !url) {
        return no(src.kind === "none" ? src.why : "the image has no URL yet (uploading to the lab asset store, or not an image the widget shows)");
      }
      // InfoPanel draws a 0 × 0 image at its file's size; the widget needs the box.
      const natural = src.kind === "asset" ? (ctx.assetSize?.(src.name) ?? null) : null;
      const width = item.Width || natural?.width || 0;
      const height = item.Height || natural?.height || 0;
      if (width <= 0 || height <= 0) return no("image at its natural size, which is not known: give it a Width and Height to convert");
      const w = Math.trunc((width * item.Scale) / 100);
      const h = Math.trunc((height * item.Scale) / 100);
      // Drawn meanwhile as InfoPanel draws it: the app's image widget crops (cover), rounds its corners and shows a
      // placeholder while there is no image; InfoPanel stretches it over the box, square, under its colour layer.
      return ok(
        { kind: "image", text: url ?? undefined, sensor: item.kind !== "Image" ? sensor : undefined, height: h },
        { x: Math.floor(item.X), y: Math.floor(item.Y), w, h },
        item.kind !== "Image" && !sensor ? ["no sensor yet: remap it"] : [],
        {
          custom: {
            kind: "image",
            layer: item.Layer ? item.LayerColor : null,
            ...(item.kind === "SensorImage" ? { show: { min: item.Threshold1, max: item.Threshold2, valueType: item.ValueType } } : {}),
          },
          needs: [
            "image stretched to its box, nothing while there is no image",
            ...(item.Layer ? ["image colour layer"] : []),
            ...(item.kind === "SensorImage" ? ["image shown by value thresholds"] : []),
          ],
        },
      );
    }

    case "Shape": {
      const box = { x: Math.floor(item.X), y: Math.floor(item.Y), w: item.Width, h: item.Height };
      const fill = item.ShowFill ? item.FillColor : null;
      const stroke = item.ShowFrame && item.FrameThickness > 0 ? { color: item.FrameColor, width: item.FrameThickness } : null;
      const plain = item.Type === "Rectangle" ? "rect" : item.Type === "Ellipse" && item.Width === item.Height ? "circle" : null;
      const widget = { kind: "shape", shape: plain ?? "rect", color: hexColor(fill ?? item.FrameColor), ...(plain === "circle" ? { thickness: item.Width } : {}) } as const;
      // What the app's shape widget would need to draw it; a plain opaque rectangle or circle it draws already.
      const needs = [
        ...(plain ? [] : [`${item.Type === "Ellipse" ? "oval" : item.Type.toLowerCase()} shape`]),
        ...(stroke ? ["shape frame"] : []),
        ...(plain === "rect" && item.CornerRadius > 0 ? ["shape corner radius"] : []),
        ...([fill, stroke?.color].some((c) => c && (cssColor(c) === null || translucent(c))) ? ["colour transparency"] : []),
        ...(item.ShowGradient ? [item.GradientAnimationSpeed !== 0 ? "animated gradient shapes" : "gradient shapes"] : []),
      ];
      if (needs.length === 0) return ok(widget, box, []);
      return ok(widget, box, [], {
        custom: {
          kind: "shape", type: item.Type, radius: item.CornerRadius, fill, stroke,
          gradient: item.ShowGradient
            ? { color2: item.GradientColor, color3: item.GradientColor2, angle: item.GradientAngle, speed: item.GradientAnimationSpeed, type: item.GradientType }
            : null,
        },
        needs,
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

  }
}
