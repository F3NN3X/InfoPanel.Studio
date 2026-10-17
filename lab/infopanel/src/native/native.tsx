/**
 * Native mode on the lab canvas (L5, L11): items flagged `native` are drawn by
 * the app's own WidgetView at their position and size, in their draw order,
 * and left out of the faithful scene. An item that cannot convert stays
 * faithful. Capabilities the app's widgets lack are drawn by the studio
 * prototypes here (convert.ts `custom`), turned and flipped like the item.
 *
 * The flag is a field on the item (set through the editor, so a switch is one
 * undo step); every InfoPanel field stays as it was, so switching back is lossless.
 */
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import type { SensorValue } from "@/hooks/useSensors";
import type { SensorMap } from "@/modules/types";
import { imageSrc, WidgetView } from "@/components/widgets/WidgetView";
import { fraction } from "@/lib/infopanel/gauges/vector.ts";
import { VectorGaugeSvg } from "../gauges/VectorGaugeSvg.tsx";
import { boundsOf, gaugeFrame, gradientAngle, gradientPaint, graphParts, rotatePoints, shapeGeometry, type Paint } from "@/lib/infopanel/render/geometry.ts";
import { cssColor } from "@/lib/infopanel/render/color.ts";
import { PathPaint } from "../render/Paint.tsx";
import { rawValue, tableColumns } from "@/lib/infopanel/render/scene.ts";
import { Table, Text, textCss, type FontCss } from "../render/Text.tsx";
import { tableOf, visibleText } from "@/lib/infopanel/render/scene.ts";
import { ZEROS } from "../sensor-source.ts";
import { dateText, sensorColor, sensorText } from "@/lib/infopanel/sensor-text.ts";
import { toReading, type DataApiValue } from "@/lib/infopanel/sensors.ts";
import type { DisplayItem } from "@/lib/infopanel/schema.ts";
import type { Catalog } from "@/lib/infopanel/sensors.ts";
import { convert, type Conversion, type ConvertContext, type Custom, type GraphStyle, type NativeItem, type TextSource } from "@/lib/infopanel/native/convert.ts";

/** The lab's mode flag on an item (not an InfoPanel field). */
export const isNative = (item: DisplayItem) => (item as { native?: boolean }).native === true;

export interface NativeLayer {
  /** Per flagged item: what it converted to, or why it stays faithful. */
  conversions: Map<string, Conversion>;
  /** Paths drawn natively: the faithful scene leaves them (and their children) out. */
  hidden: Set<string>;
  /** The native widgets, keyed by path, to draw in tree order. */
  elements: Map<string, ReactNode>;
}

/** The live values as the app's widgets read them. */
export function sensorMap(catalog: Catalog): SensorMap {
  const out: SensorMap = {};
  for (const [key, v] of Object.entries(catalog.sensors)) out[key] = { ...v, unit: v.unit ?? "" } as SensorValue;
  return out;
}

/** `hidden`: the item or a group around it is hidden in InfoPanel. */
function walk(items: DisplayItem[], prefix: string, visit: (item: DisplayItem, path: string, hidden: boolean) => void, parentHidden = false) {
  items.forEach((item, i) => {
    const path = prefix ? `${prefix}.${i}` : String(i);
    const hidden = parentHidden || item.Hidden;
    visit(item, path, hidden);
    if (item.kind === "Group") walk(item.DisplayItems, path, visit, hidden);
  });
}

/** Paths of the items that can be drawn natively (for "switch all"). */
export function convertible(items: DisplayItem[], ctx: ConvertContext): string[] {
  const out: string[] = [];
  walk(items, "", (item, path) => {
    if (convert(item, path, ctx).ok) out.push(path);
  });
  return out;
}

/** What a conversion draws with, for people: the app widget, or the prototype standing in for one. */
export function describeNative(n: NativeItem): string {
  switch (n.custom?.kind) {
    case "vector":
      return "custom gauge widget, drawn live from its spec (studio prototype)";
    case "frames":
      return "image-sequence gauge widget (studio prototype)";
    case "shape":
      return `shape widget with ${n.needs[0] ?? "this shape"} (studio prototype)`;
    case "text":
      return `${n.widget.kind} widget in InfoPanel's font and placement${n.custom.marquee ? ", scrolling" : ""} (studio prototype)`;
    case "graph":
      return `${n.widget.kind} widget drawn as InfoPanel's ${n.custom.graph.type === "HISTOGRAM" ? "histogram" : "line graph"} (studio prototype)`;
    case "image":
      return `image widget, stretched to its box${n.custom.show ? ", shown by value thresholds" : ""} (studio prototype)`;
    default:
      return `${n.widget.kind} widget`;
  }
}

/**
 * InfoPanel's marquee: when the content is wider than the box it scrolls left
 * at `speed` px/s, followed by a second copy `spacing` px behind.
 */
function Marquee({ speed, spacing, width, children }: { speed: number; spacing: number; width?: number; children: ReactNode }) {
  const probe = useRef<HTMLDivElement>(null);
  const [content, setContent] = useState(0);
  useLayoutEffect(() => {
    const el = probe.current;
    if (!el) return;
    const measure = () => setContent(el.scrollWidth);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const scrolls = width !== undefined && content > width;
  const copy = (key: string) => (
    <div key={key} style={{ flex: "none", width: "max-content", paddingRight: scrolls ? spacing : 0 }}>
      {children}
    </div>
  );
  return (
    <div style={{ width, overflow: "hidden" }}>
      <div
        ref={probe}
        style={{
          display: "flex", width: "max-content",
          ...(scrolls ? { animation: `lab-marquee ${(content + spacing) / speed}s linear infinite` } : {}),
        }}
      >
        {scrolls ? [copy("a"), copy("b")] : children}
      </div>
      <style>{"@keyframes lab-marquee{from{transform:translateX(0)}to{transform:translateX(-50%)}}"}</style>
    </div>
  );
}

/** What the native widgets draw with besides the live values: the faces (the lab's font plan) and the time. */
export interface NativeView {
  font: FontCss;
  now: Date;
  /** A sensor key's recent values, oldest first (graphs). */
  history(key: string): readonly number[];
}

/** Seconds since mount, ticking every frame while `on` (an animated gradient). */
function useSeconds(on: boolean): number {
  const [t, setT] = useState(0);
  useEffect(() => {
    if (!on) return;
    const start = performance.now();
    let frame = requestAnimationFrame(function tick(now) {
      setT((now - start) / 1000);
      frame = requestAnimationFrame(tick);
    });
    return () => cancelAnimationFrame(frame);
  }, [on]);
  return t;
}

/**
 * A shape as the scene draws it (render/scene.ts): InfoPanel's geometry in the box, turned about its centre
 * by PathPaint (so a gradient stays over the turned shape's bounds, as Skia computes it), paints from
 * InfoPanel's colours.
 */
function NativeShape({ custom, n, path }: { custom: Extract<Custom, { kind: "shape" }>; n: NativeItem; path: string }) {
  const [w, h] = [n.box.w ?? 0, n.box.h ?? 0];
  const g = custom.gradient;
  const seconds = useSeconds(!!g && g.speed !== 0);
  const geo = shapeGeometry(custom.type, 0, 0, w, h, custom.radius);
  const deg = n.transform?.rotate ?? 0;
  const rotate = { deg, cx: geo.cx, cy: geo.cy };
  const bounds = boundsOf(rotatePoints(geo.points, deg, geo.cx, geo.cy));
  const paint = (color: string): Paint =>
    g ? gradientPaint(bounds, color, g.color2, g.color3, gradientAngle(g.angle, g.speed, seconds), g.type) : { kind: "solid", color };
  return (
    <svg width={w} height={h} style={{ display: "block", overflow: "visible" }}>
      {custom.fill && <PathPaint id={`native-${path}-f`} d={geo.d} paint={paint(custom.fill)} rotate={rotate} space={{ width: w, height: h }} />}
      {custom.stroke && <PathPaint id={`native-${path}-s`} d={geo.d} paint={paint(custom.stroke.color)} stroke={custom.stroke.width} rotate={rotate} space={{ width: w, height: h }} />}
    </svg>
  );
}

/** InfoPanel's graph (render/geometry.ts graphParts) in the native box, from the key's history. */
function NativeGraph({ graph, zeros, n, path, view }: { graph: GraphStyle; zeros: boolean; n: NativeItem; path: string; view: NativeView }) {
  const [width, height] = [n.box.w ?? 0, n.box.h ?? 0];
  const parts = graphParts({ ...graph, width, height, samples: n.widget.sensor ? view.history(n.widget.sensor) : zeros ? ZEROS : [] });
  return (
    <svg width={width} height={height} style={{ display: "block", overflow: "hidden" }}>
      {parts.map((p, i) => (
        <PathPaint key={i} id={`native-${path}-${i}`} d={p.d} paint={p.paint} stroke={p.op === "stroke" ? p.width : undefined} space={{ width, height }} />
      ))}
    </svg>
  );
}

/** The item's text as InfoPanel draws it, and its colour (a sensor's thresholds); a table draws its own. */
function textOf(item: Exclude<TextSource, { kind: "TableSensor" }>, value: SensorValue | undefined, now: Date): { text: string; color?: string } {
  switch (item.kind) {
    case "Text":
      return { text: item.Name };
    case "Clock":
    case "Calendar":
      return { text: dateText(item, now) };
    case "Sensor": {
      // Read as the faithful renderer reads the Data API value (a text sensor shows its first line).
      const r = toReading(value as DataApiValue | undefined);
      return { text: sensorText(item, r), color: sensorColor(item, r) };
    }
  }
}

/** A plugin table as InfoPanel lays it out (render/Text.tsx Table), at the native box; "Invalid sensor" without one. */
function NativeTable({ custom, item, value, view }: { custom: Extract<Custom, { kind: "text" }>; item: Extract<TextSource, { kind: "TableSensor" }>; value: SensorValue | undefined; view: NativeView }) {
  const table = value ? tableOf(value as DataApiValue) : null;
  const common = { path: "", item, x: 0, y: 0, style: custom.style, rightAlign: item.RightAlign, centerAlign: item.CenterAlign, oneLine: item.Wrap, ellipsis: item.Ellipsis };
  if (!table) {
    const node = { ...common, kind: "text", text: "Invalid sensor", width: item.Width, height: item.Height, rotation: 0, marquee: null } as const;
    return <Text node={node} font={view.font} canvasWidth={0} />;
  }
  const node = { ...common, kind: "table", header: item.ShowHeader, columns: tableColumns(item.TableFormat, table, item.MaxRows) } as const;
  return <Table node={node} font={view.font} canvasWidth={0} />;
}

/**
 * The text prototype: InfoPanel's DrawString (render/Text.tsx) in the native box, anchored at its top left,
 * or ending at the box's x when right-aligned without a Width.
 */
function NativeText({ custom, n, sensors, view }: { custom: Extract<Custom, { kind: "text" }>; n: NativeItem; sensors: SensorMap; view: NativeView }) {
  const value = n.widget.sensor ? sensors[n.widget.sensor] : undefined;
  if (custom.item.kind === "TableSensor") return <NativeTable custom={custom} item={custom.item} value={value} view={view} />;
  const { text, color } = textOf(custom.item, value, view.now);
  const face = textCss(color ? { ...custom.style, color } : custom.style, view.font);
  if (custom.marquee) {
    return (
      <Marquee speed={custom.marquee.speed} spacing={custom.marquee.spacing} width={custom.width}>
        <div style={{ ...face, whiteSpace: "pre" }}>{text}</div>
      </Marquee>
    );
  }
  const css: CSSProperties = {
    ...face,
    ...(custom.width > 0
      ? { width: custom.width, whiteSpace: "pre-wrap", overflowWrap: "anywhere", textAlign: custom.align }
      : { width: "max-content", whiteSpace: "pre", textAlign: custom.align === "right" ? "right" : "left" }),
    // RichTextKit's one line: an ellipsis trims until it fits; without one the first wrapped line stays.
    ...(custom.oneLine ? (custom.ellipsis ? { whiteSpace: "pre", overflow: "hidden", textOverflow: "ellipsis" } : { maxHeight: "1lh", overflow: "hidden" }) : {}),
  };
  return <div style={css}>{visibleText(text, custom.oneLine, custom.ellipsis)}</div>;
}

function CustomView({ custom, n, path, sensors, view }: { custom: Custom; n: NativeItem; path: string; sensors: SensorMap; view: NativeView }) {
  const value = n.widget.sensor ? sensors[n.widget.sensor]?.value : undefined;
  const { w, h } = n.box;
  switch (custom.kind) {
    case "vector":
      return <VectorGaugeSvg gauge={custom.gauge} p={fraction(value ?? null, custom.min, custom.max)} width={w} height={h} id={`native-${path}`} />;
    case "frames": {
      const index = gaugeFrame(custom.urls.length, value ?? null, custom.min, custom.max);
      return <img src={custom.urls[index]} alt="" draggable={false} style={{ display: "block", width: w, height: h }} />;
    }
    case "shape":
      return <NativeShape custom={custom} n={n} path={path} />;
    case "text":
      return <NativeText custom={custom} n={n} sensors={sensors} view={view} />;
    case "graph":
      return <NativeGraph graph={custom.graph} zeros={custom.zeros} n={n} path={path} view={view} />;
    case "image": {
      // The URL the app's image widget would show (its own file, or the sensor's image URL); none: nothing.
      const src = imageSrc(n.widget, sensors);
      if (!src) return null;
      if (custom.show) {
        // A SensorImage shows only while its value is within its thresholds (render/scene.ts).
        const r = toReading((n.widget.sensor ? sensors[n.widget.sensor] : undefined) as DataApiValue | undefined);
        const v = r ? rawValue({ ValueType: custom.show.valueType }, r) : null;
        if (v === null || !(v >= custom.show.min && v <= custom.show.max)) return null;
      }
      return (
        <div style={{ position: "relative", width: w, height: h }}>
          <img src={src} alt="" draggable={false} style={{ display: "block", width: "100%", height: "100%" }} />
          {custom.layer && <div style={{ position: "absolute", inset: 0, background: cssColor(custom.layer) ?? "transparent" }} />}
        </div>
      );
    }
  }
}

/** InfoPanel turns and mirrors about the box's integer centre, flipping first. */
function transformCss(n: NativeItem): CSSProperties {
  // Anchored at its right edge: moved left by its own width.
  const shift = n.box.anchor === "end" ? "translateX(-100%)" : "";
  if (!n.transform) return shift ? { transform: shift } : {};
  const { rotate, flipX } = n.transform;
  const t = [shift, flipX && "scaleX(-1)", rotate !== 0 && `rotate(${rotate}deg)`].filter(Boolean).join(" ");
  const origin = n.box.w !== undefined && n.box.h !== undefined ? `${Math.trunc(n.box.w / 2)}px ${Math.trunc(n.box.h / 2)}px` : "50% 50%";
  return { transform: t, transformOrigin: origin };
}

export function nativeLayer(items: DisplayItem[], ctx: ConvertContext, sensors: SensorMap, view: NativeView): NativeLayer {
  const conversions = new Map<string, Conversion>();
  const hidden = new Set<string>();
  const elements = new Map<string, ReactNode>();
  walk(items, "", (item, path, isHidden) => {
    if (!isNative(item)) return;
    const c = convert(item, path, ctx);
    conversions.set(path, c);
    if (!c.ok) return;
    hidden.add(path);
    if (isHidden) return;
    const n = c.native;
    // A shape turns itself (its gradient must not turn with it); everything else turns with its box.
    const turned = n.custom?.kind === "shape" ? {} : transformCss(n);
    const style: CSSProperties = { position: "absolute", left: n.box.x, top: n.box.y, width: n.box.w, height: n.box.h, overflow: "visible", ...turned };
    elements.set(
      path,
      <div key={`native-${path}`} data-path={path} data-native="" style={style}>
        {n.custom ? <CustomView custom={n.custom} n={n} path={path} sensors={sensors} view={view} /> : <WidgetView widget={n.widget} sensors={sensors} />}
      </div>,
    );
  });
  return { conversions, hidden, elements };
}
