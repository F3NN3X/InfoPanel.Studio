/**
 * Turns a parsed profile into draw nodes, in InfoPanel's draw order
 * (`PanelDraw.Run` / `Draw`, d3fe32c). Pure: sensors, images and time come
 * from the caller, so the same scene can show unbound, mocked or live data.
 *
 * Positions are whole pixels: InfoPanel floors X and Y (scale 1).
 */
import type { FontRequest } from "../font-loader.ts";
import { vectorOf } from "../gauges/frames.ts";
import { fraction, type VectorGauge } from "../gauges/vector.ts";
import type { DisplayItem, GaugeItem, ImageItem, Profile } from "../schema.ts";
import { dateText, sensorColor, sensorText, type SensorReading } from "../sensor-text.ts";
import { isBound, type BoundItem, type DataApiValue } from "../sensors.ts";
import {
  autoRange,
  barParts,
  boundsOf,
  donutParts,
  gaugeFrame,
  gradientAngle,
  gradientPaint,
  graphParts,
  rotatePoints,
  shapeGeometry,
  type ChartPart,
  type Paint,
} from "./geometry.ts";

/** A plugin table: column names and rows of cell text. */
export interface TableData {
  columns: string[];
  rows: string[][];
}

/** What a bound item reads: its reading, the graph history (oldest first) and a table. */
export interface SensorState {
  reading: SensorReading | null;
  history: readonly number[];
  table?: TableData | null;
}

/** A loaded image: where to get it and its intrinsic size. */
export interface ImageInfo {
  url: string;
  width: number;
  height: number;
}

export interface SceneInput {
  profile: Profile;
  items: DisplayItem[];
  sensor(item: BoundItem): SensorState;
  /** null: the image cannot load (InfoPanel's placeholder); undefined: still loading. */
  image(source: ImageSource): ImageInfo | null | undefined;
  now: Date;
  /** Time since the profile started drawing, for animated gradients. */
  elapsedMs: number;
  /** Item paths the lab hides (with their children), on top of InfoPanel's own Hidden. */
  hidden?: ReadonlySet<string>;
  /**
   * A gauge's shown position, moving toward `target` at `speed` steps a second
   * (AnimationSpeed) within 0..count − 1: a frame index, which may lie between
   * frames, or a vector gauge's percent. By default the target.
   */
  gaugeIndex?(path: string, target: number, speed: number, count: number): number;
}

/** Where an image item's file comes from. */
export type ImageSource = { kind: "asset"; name: string } | { kind: "url"; url: string } | { kind: "none"; why: string };

export interface TextStyle {
  font: FontRequest;
  /** px: FontSize × the profile's FontScale. */
  size: number;
  color: string;
  underline: boolean;
  strikeout: boolean;
  glow: { radius: number; color: string; blend: string } | null;
}

interface Base {
  /** Index path in the item tree, e.g. "3.0". */
  path: string;
  item: DisplayItem;
}

export type DrawNode =
  | (Base & {
      kind: "text";
      text: string;
      style: TextStyle;
      x: number;
      y: number;
      width: number;
      height: number;
      rightAlign: boolean;
      centerAlign: boolean;
      /** MaxLines = 1 (InfoPanel's Wrap). */
      oneLine: boolean;
      ellipsis: boolean;
      rotation: number;
      /** Scrolls when wider than `width`; drawn as plain text when it fits. */
      marquee: { speed: number; spacing: number } | null;
    })
  | (Base & {
      kind: "table";
      x: number;
      y: number;
      style: TextStyle;
      rightAlign: boolean;
      centerAlign: boolean;
      oneLine: boolean;
      ellipsis: boolean;
      header: boolean;
      /** Columns in TableFormat order, with their x offset and width. */
      columns: { title: string; cells: string[]; dx: number; width: number }[];
    })
  | (Base & {
      /** A vector gauge (L7), drawn live at the value. */
      kind: "vector";
      x: number;
      y: number;
      width: number;
      height: number;
      rotation: number;
      flipX: boolean;
      gauge: VectorGauge;
      /** 0..1 of the range. */
      p: number;
    })
  | (Base & {
      kind: "image";
      x: number;
      y: number;
      width: number;
      height: number;
      rotation: number;
      flipX: boolean;
      /** null: InfoPanel's "no image" placeholder. */
      url: string | null;
      /** A file or URL the item names could not be loaded (the canvas draws a hatched placeholder, not InfoPanel's). */
      missing?: true;
      opacity: number;
      layer: string | null;
    })
  | (Base & { kind: "chart"; x: number; y: number; width: number; height: number; rotation: number; flipX: boolean; parts: ChartPart[] })
  | (Base & {
      kind: "shape";
      d: string;
      rotation: number;
      cx: number;
      cy: number;
      fill: Paint | null;
      stroke: { paint: Paint; width: number } | null;
      /** An animated gradient's fill and stroke paints at `elapsedMs`: the view turns it without a new scene. */
      paintAt?: (elapsedMs: number) => { fill: Paint | null; stroke: Paint | null };
    });

const NO_STATE: SensorState = { reading: null, history: [] };

/** A text item's style (native mode draws the same, L14). */
export function textStyle(item: Extract<DisplayItem, { Font: string }>, fontScale: number): TextStyle {
  return {
    font: { font: item.Font, style: item.FontStyle, bold: item.Bold, italic: item.Italic },
    size: item.FontSize * fontScale,
    color: item.Color,
    underline: item.Underline,
    strikeout: item.Strikeout,
    glow: item.GlowEnabled && item.GlowRadius > 0 ? { radius: item.GlowRadius, color: item.GlowColor, blend: item.GlowBlendMode } : null,
  };
}

/** ImageDisplayItem.CalculatedPath, as something the lab can load. */
export function imageSource(item: ImageItem | Extract<DisplayItem, { kind: "HttpImage" | "SensorImage" }>, state?: SensorState): ImageSource {
  if (item.kind === "HttpImage") {
    const url = state?.reading?.text;
    return url ? { kind: "url", url } : { kind: "none", why: "no URL from the sensor" };
  }
  if (item.Type === "RTSP") return { kind: "none", why: "RTSP streams are not supported in the lab" };
  if (item.Type === "URL") return item.HttpUrl ? { kind: "url", url: item.HttpUrl } : { kind: "none", why: "no URL" };
  if (!item.FilePath) return { kind: "none", why: "no file" };
  if (!item.RelativePath) return { kind: "none", why: `absolute path on the exporting machine: ${item.FilePath}` };
  return { kind: "asset", name: item.FilePath.toLowerCase() };
}

/** The value a SensorImage compares with its thresholds: the raw reading by ValueType. */
export function rawValue(item: { ValueType: string }, r: SensorReading): number {
  return item.ValueType === "MIN" ? r.min : item.ValueType === "MAX" ? r.max : item.ValueType === "AVERAGE" ? r.avg : r.now;
}

/** TableFormat `col:width|…` entries that name an existing column (native tables draw the same, L14). */
export function tableColumns(format: string, table: TableData, maxRows: number) {
  const out: { title: string; cells: string[]; dx: number; width: number }[] = [];
  let dx = 0;
  for (const part of format.split("|")) {
    const split = part.split(":");
    if (split.length !== 2 || !/^\s*[+-]?\d+\s*$/.test(split[0]) || !/^\s*[+-]?\d+\s*$/.test(split[1])) continue;
    const column = Number(split[0]);
    const width = Number(split[1]);
    if (column >= table.columns.length || column < 0) continue;
    out.push({ title: table.columns[column], cells: table.rows.slice(0, maxRows).map((r) => r[column] ?? ""), dx, width });
    dx += width + 10;
  }
  return out;
}

export function buildScene(input: SceneInput): DrawNode[] {
  const { profile } = input;
  const nodes: DrawNode[] = [];

  const draw = (item: DisplayItem, path: string) => {
    if (input.hidden?.has(path)) return;
    const x = Math.floor(item.X);
    const y = Math.floor(item.Y);
    const state = isBound(item) ? input.sensor(item) : NO_STATE;

    switch (item.kind) {
      case "Group":
        item.DisplayItems.forEach((child, i) => !child.Hidden && draw(child, `${path}.${i}`));
        return;

      case "Text":
      case "Clock":
      case "Calendar":
      case "Sensor":
      case "TableSensor": {
        const style = textStyle(item, profile.FontScale);
        if (item.kind === "TableSensor" && state.table) {
          nodes.push({
            kind: "table", path, item, x, y, style,
            rightAlign: item.RightAlign, centerAlign: item.CenterAlign, oneLine: item.Wrap, ellipsis: item.Ellipsis,
            header: item.ShowHeader,
            columns: tableColumns(item.TableFormat, state.table, item.MaxRows),
          });
          return;
        }
        let text = item.Name;
        if (item.kind === "Clock" || item.kind === "Calendar") text = dateText(item, input.now);
        else if (item.kind === "Sensor") {
          text = sensorText(item, state.reading);
          style.color = sensorColor(item, state.reading);
        } else if (item.kind === "TableSensor") text = "Invalid sensor";
        nodes.push({
          kind: "text", path, item, text, style, x, y,
          width: item.Width, height: item.Height,
          rightAlign: item.RightAlign, centerAlign: item.CenterAlign, oneLine: item.Wrap, ellipsis: item.Ellipsis,
          rotation: item.Rotation,
          marquee: item.Marquee && item.Width > 0 ? { speed: Math.max(item.MarqueeSpeed, 1), spacing: item.MarqueeSpacing } : null,
        });
        return;
      }

      case "Image":
      case "HttpImage":
      case "SensorImage": {
        if (item.kind === "SensorImage") {
          const r = state.reading;
          if (!r) return;
          const v = rawValue(item, r);
          if (!(v >= item.Threshold1 && v <= item.Threshold2)) return;
        }
        const source = imageSource(item, state);
        const info = input.image(source);
        if (info === undefined) return;
        // ImageDisplayItem.EvaluateSize: 0 takes the image's own size, then Scale applies.
        let w = item.Width || (info?.width ?? 0);
        let h = item.Height || (info?.height ?? 0);
        w = Math.trunc((w * item.Scale) / 100);
        h = Math.trunc((h * item.Scale) / 100);
        if (w <= 0 || h <= 0) return;
        nodes.push({
          kind: "image", path, item, x, y, width: w, height: h, rotation: item.Rotation, flipX: false,
          url: info?.url ?? null, ...(!info && source.kind !== "none" ? { missing: true as const } : {}),
          opacity: 1, layer: info && item.Layer ? item.LayerColor : null,
        });
        return;
      }

      case "Gauge": {
        const g = item as GaugeItem;
        const r = state.reading;
        const vector = vectorOf(g);
        // A vector gauge moves at AnimationSpeed percent of the range a second: what 101 baked frames would do.
        const shownPercent = (path: string, target: number) =>
          g.AnimationSpeed > 0 && r && input.gaugeIndex ? input.gaugeIndex(path, target, g.AnimationSpeed, 101) : target;
        if (vector) {
          const width = Math.floor(((g.Width || vector.width) * g.Scale) / 100);
          const height = Math.floor(((g.Height || vector.height) * g.Scale) / 100);
          if (width > 0 && height > 0) {
            nodes.push({
              kind: "vector", path, item, x, y, width, height, rotation: g.Rotation, flipX: g.FlipX,
              gauge: vector, p: shownPercent(path, fraction(r ? r.now : null, g.MinValue, g.MaxValue) * 100) / 100,
            });
          }
          return;
        }
        const target = gaugeFrame(g.Images.length, r ? r.now : null, g.MinValue, g.MaxValue);
        const index = g.Images.length > 1 && r && input.gaugeIndex ? input.gaugeIndex(path, target, g.AnimationSpeed, g.Images.length) : target;
        const [lower, upper] = [Math.floor(index), Math.ceil(index)];
        const image = g.Images[lower];
        if (!image) return;
        const info = input.image(imageSource(image));
        if (!info) return;
        const w = Math.floor(((g.Width || info.width) * g.Scale) / 100);
        const h = Math.floor(((g.Height || info.height) * g.Scale) / 100);
        const node = { kind: "image", path, item, x, y, width: w, height: h, rotation: g.Rotation, flipX: g.FlipX, layer: null } as const;
        nodes.push({ ...node, url: info.url, opacity: 1 });
        // The next frame over it, at the fraction (InfoPanel's crossfade while animating).
        const next = upper !== lower ? g.Images[upper] : undefined;
        const nextInfo = next ? input.image(imageSource(next)) : null;
        if (nextInfo && nextInfo.url !== info.url) nodes.push({ ...node, url: nextInfo.url, opacity: index - lower });
        return;
      }

      case "Bar":
      case "Graph":
      case "Donut": {
        let parts: ChartPart[];
        if (item.kind === "Bar") {
          const [min, max] = autoRange(state.history, item.MinValue, item.MaxValue, item.AutoValue);
          parts = barParts({
            width: item.Width, height: item.Height, value: state.reading?.now ?? null, min, max,
            cornerRadius: item.CornerRadius, frame: item.Frame, frameColor: item.FrameColor,
            background: item.Background, backgroundColor: item.BackgroundColor,
            color: item.Color, gradient: item.Gradient, gradientColor: item.GradientColor,
          });
        } else if (item.kind === "Graph") {
          parts = graphParts({
            type: item.Type, width: item.Width, height: item.Height, samples: state.history,
            min: item.MinValue, max: item.MaxValue, auto: item.AutoValue,
            thickness: item.Thickness, step: item.Step, fill: item.Fill, fillColor: item.FillColor, color: item.Color,
            frame: item.Frame, frameColor: item.FrameColor, background: item.Background, backgroundColor: item.BackgroundColor,
          });
        } else {
          const [min, max] = autoRange(state.history, item.MinValue, item.MaxValue, item.AutoValue);
          parts = donutParts({
            width: item.Width, value: state.history.at(-1) ?? 0, min, max, thickness: item.Thickness, span: item.Span,
            color: item.Color, background: item.Background, backgroundColor: item.BackgroundColor,
            frame: item.Frame, frameColor: item.FrameColor,
          });
        }
        if (parts.length === 0) return;
        nodes.push({ kind: "chart", path, item, x, y, width: item.Width, height: item.Height, rotation: item.Rotation, flipX: item.FlipX, parts });
        return;
      }

      case "Shape": {
        const geo = shapeGeometry(item.Type, x, y, item.Width, item.Height, item.CornerRadius);
        const angle = gradientAngle(item.GradientAngle, item.GradientAnimationSpeed, input.elapsedMs / 1000);
        const bounds = boundsOf(rotatePoints(geo.points, item.Rotation, geo.cx, geo.cy));
        const paint = (color: string, a: number): Paint =>
          item.ShowGradient ? gradientPaint(bounds, color, item.GradientColor, item.GradientColor2, a, item.GradientType) : { kind: "solid", color };
        const paintAt = (a: number) => ({
          fill: item.ShowFill ? paint(item.FillColor, a) : null,
          stroke: item.ShowFrame ? paint(item.FrameColor, a) : null,
        });
        const at = paintAt(angle);
        nodes.push({
          kind: "shape", path, item, d: geo.d, rotation: item.Rotation, cx: geo.cx, cy: geo.cy,
          fill: at.fill,
          stroke: at.stroke && { paint: at.stroke, width: item.FrameThickness },
          ...(item.ShowGradient && item.GradientAnimationSpeed !== 0
            ? { paintAt: (ms: number) => paintAt(gradientAngle(item.GradientAngle, item.GradientAnimationSpeed, ms / 1000)) }
            : {}),
        });
        return;
      }
    }
  };

  input.items.forEach((item, i) => !item.Hidden && draw(item, String(i)));
  return nodes;
}

/** Whether some item that is drawn (not Hidden, nor in `hidden`, nor under such a group) satisfies `test`. */
function anyDrawn(items: DisplayItem[], test: (item: DisplayItem) => boolean, hidden?: ReadonlySet<string>, prefix = ""): boolean {
  return items.some((i, n) => {
    const path = prefix ? `${prefix}.${n}` : String(n);
    if (i.Hidden || hidden?.has(path)) return false;
    return i.kind === "Group" ? anyDrawn(i.DisplayItems, test, hidden, path) : test(i);
  });
}

/** Drawn gauges that move between frames over time (AnimationSpeed). */
export function hasAnimatedGauge(items: DisplayItem[], hidden?: ReadonlySet<string>): boolean {
  return anyDrawn(items, (i) => i.kind === "Gauge" && i.AnimationSpeed > 0, hidden);
}

/**
 * A plugin table from the Data API's flattened text (one row per line, cells joined
 * with ", "). Lossy: column names are not exported, and a cell holding ", " splits.
 */
export function tableFromText(text: string): TableData {
  const rows = text.split("\n").map((line) => line.split(", "));
  const count = Math.max(0, ...rows.map((r) => r.length));
  return { columns: Array.from({ length: count }, (_, i) => `Column ${i}`), rows };
}

/** The structured table when the Data API sends one, else the flattened text. */
export function tableOf(value: DataApiValue): TableData | null {
  if (value.table) return { columns: value.table.columns, rows: value.table.rows.map((r) => r.map((c) => c ?? "")) };
  return value.text !== undefined ? tableFromText(value.text) : null;
}

/** MaxLines = 1 keeps the first line, with an ellipsis when more were cut. */
export function visibleText(text: string, oneLine: boolean, ellipsis: boolean): string {
  const nl = text.search(/\r?\n/);
  if (!oneLine || nl < 0) return text;
  return text.slice(0, nl) + (ellipsis ? "…" : "");
}

/** InfoPanel keeps 4096 samples per graph. */
export const GRAPH_HISTORY = 4096;
/** An unbound HWiNFO or Libre graph: InfoPanel fills it with zeros. */
export const ZEROS: readonly number[] = new Array(GRAPH_HISTORY).fill(0);
