/**
 * Native mode on the lab canvas (L5): items flagged `native` are drawn by the
 * app's own WidgetView at their position and size, in their draw order, and
 * left out of the faithful scene. An item that cannot convert stays faithful.
 *
 * The flag is a field on the item (set through the editor, so a switch is one
 * undo step); every InfoPanel field stays as it was, so switching back is lossless.
 */
import type { CSSProperties, ReactNode } from "react";
import type { SensorValue } from "@/hooks/useSensors";
import type { SensorMap } from "@/modules/types";
import { WidgetView } from "@/components/widgets/WidgetView";
import type { DisplayItem } from "../schema.ts";
import type { Catalog } from "../sensors.ts";
import { convert, type Conversion, type ConvertContext } from "./convert.ts";

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
    const { box, widget } = c.native;
    const style: CSSProperties = { position: "absolute", left: box.x, top: box.y, width: box.w, height: box.h, overflow: "visible" };
    elements.set(
      path,
      <div key={`native-${path}`} data-path={path} data-native="" style={style}>
        <WidgetView widget={widget} sensors={sensors} />
      </div>,
    );
  });
  return { conversions, hidden, elements };
}
