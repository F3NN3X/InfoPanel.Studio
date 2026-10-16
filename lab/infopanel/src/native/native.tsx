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
import { useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import type { SensorValue } from "@/hooks/useSensors";
import type { SensorMap } from "@/modules/types";
import { WidgetView } from "@/components/widgets/WidgetView";
import { fraction } from "../gauges/vector.ts";
import { VectorGaugeSvg } from "../gauges/VectorGaugeSvg.tsx";
import { gaugeFrame, shapeGeometry } from "../render/geometry.ts";
import type { DisplayItem } from "../schema.ts";
import type { Catalog } from "../sensors.ts";
import { convert, type Conversion, type ConvertContext, type Custom, type NativeItem } from "./convert.ts";

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
    case "marquee":
      return `${n.widget.kind} widget, scrolling (studio prototype)`;
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

function CustomView({ custom, n, path, sensors }: { custom: Custom; n: NativeItem; path: string; sensors: SensorMap }) {
  const value = n.widget.sensor ? sensors[n.widget.sensor]?.value : undefined;
  const { w, h } = n.box;
  switch (custom.kind) {
    case "vector":
      return <VectorGaugeSvg gauge={custom.gauge} p={fraction(value ?? null, custom.min, custom.max)} width={w} height={h} id={`native-${path}`} />;
    case "frames": {
      const index = gaugeFrame(custom.urls.length, value ?? null, custom.min, custom.max);
      return <img src={custom.urls[index]} alt="" draggable={false} style={{ display: "block", width: w, height: h }} />;
    }
    case "shape": {
      const d = shapeGeometry(custom.type, 0, 0, w ?? 0, h ?? 0, custom.radius).d;
      return (
        <svg width={w} height={h} style={{ display: "block", overflow: "visible" }}>
          <path d={d} fill={custom.fill ?? "none"} stroke={custom.stroke?.color} strokeWidth={custom.stroke?.width} />
        </svg>
      );
    }
    case "marquee":
      return (
        <Marquee speed={custom.speed} spacing={custom.spacing} width={w}>
          <WidgetView widget={n.widget} sensors={sensors} />
        </Marquee>
      );
  }
}

/** InfoPanel turns and mirrors about the box's integer centre, flipping first. */
function transformCss(n: NativeItem): CSSProperties {
  if (!n.transform) return {};
  const { rotate, flipX } = n.transform;
  const t = [flipX && "scaleX(-1)", rotate !== 0 && `rotate(${rotate}deg)`].filter(Boolean).join(" ");
  const origin = n.box.w !== undefined && n.box.h !== undefined ? `${Math.trunc(n.box.w / 2)}px ${Math.trunc(n.box.h / 2)}px` : "50% 50%";
  return { transform: t, transformOrigin: origin };
}

export function nativeLayer(items: DisplayItem[], ctx: ConvertContext, sensors: SensorMap): NativeLayer {
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
    const style: CSSProperties = { position: "absolute", left: n.box.x, top: n.box.y, width: n.box.w, height: n.box.h, overflow: "visible", ...transformCss(n) };
    elements.set(
      path,
      <div key={`native-${path}`} data-path={path} data-native="" style={style}>
        {n.custom ? <CustomView custom={n.custom} n={n} path={path} sensors={sensors} /> : <WidgetView widget={n.widget} sensors={sensors} />}
      </div>,
    );
  });
  return { conversions, hidden, elements };
}
