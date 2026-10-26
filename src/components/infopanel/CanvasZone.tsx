/**
 * A canvas zone (A2): an imported InfoPanel profile drawn at its own size, scaled to fit the zone
 * with its aspect ratio kept, items in InfoPanel's draw order. Faithful items are drawn as
 * InfoPanel draws them, untouched by the dashboard theme; native items by the app's widgets.
 * Live values come from the sensor store through the zone (`placementContent`), never a stream per item.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import type { SensorMap } from "@/modules/types";
import { useElementSize } from "@/hooks/use-element-size";
import { getApiBase } from "@/lib/data-api";
import { canvasSensor, fitScale, keyOf, KeyHistory, openCanvas, type OpenCanvas } from "@/lib/infopanel/canvas.ts";
import { FontLoader } from "@/lib/infopanel/font-loader.ts";
import type { ConvertContext } from "@/lib/infopanel/native/convert.ts";
import type { StoredCanvas } from "@/lib/infopanel/import/stored.ts";
import { widgetOf } from "@/lib/infopanel/native/widget-item.ts";
import type { Appearance } from "@/lib/style-resolve";
import { nativeLayer, type NativeView } from "./native.tsx";
import { useSuppliedFonts, withSupplied } from "./supplied-fonts";
import { ProfileView, useFonts, type AssetSource } from "./ProfileView.tsx";
import { WidgetItemView } from "./widget-item-view";

export interface CanvasZoneProps {
  canvas: StoredCanvas;
  /** The live values, as the zone's subscription delivers them (its Studio widgets' keys too). */
  sensors: SensorMap;
  /** The theme the canvas's Studio widgets follow, as the screen's grid zones do. */
  appearance?: Appearance;
}

export function useNow(): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  return now;
}

/** The graph history of the canvas's keys, one sample per change of the live values. */
function useHistory(canvas: OpenCanvas, sensors: SensorMap): KeyHistory {
  const history = useMemo(() => new KeyHistory(), [canvas]);
  // Recorded during render so the frame that brings a value also draws it.
  useMemo(() => history.record(canvas.historyKeys, sensors), [history, canvas, sensors]);
  return history;
}

function CanvasView({ canvas, sensors, appearance }: { canvas: OpenCanvas; sensors: SensorMap; appearance?: Appearance }) {
  const { ref, w, h } = useElementSize();
  const now = useNow();
  const history = useHistory(canvas, sensors);
  const fontLoader = useCallback(() => FontLoader.fetch(null, getApiBase()), []);
  const font = withSupplied(useFonts(canvas.items, fontLoader), useSuppliedFonts(canvas.stored.fonts));
  const assets: AssetSource = useMemo(
    () => new Map([...canvas.assets].flatMap(([name, a]) => (a.url ? [[name, { hash: a.hash, url: a.url }] as const] : []))),
    [canvas],
  );
  const ctx: ConvertContext = useMemo(
    () => ({
      fontScale: canvas.profile.FontScale,
      keyOf: (item) => keyOf(canvas, item),
      assetUrl: (name) => canvas.assets.get(name.toLowerCase())?.url ?? null,
    }),
    [canvas],
  );
  const native = nativeLayer(canvas.items, ctx, sensors, { font, now, history: (key) => history.get(key), widget: widgetDrawer(sensors, appearance) });
  const { profile } = canvas;
  const scale = fitScale(profile, w, h);
  return (
    <div ref={ref} style={{ position: "absolute", inset: 0, overflow: "hidden" }}>
      {w > 0 && h > 0 && (
        <div
          // The studio finds the profile under a drop by this (library-drop.ts).
          data-ip-canvas=""
          style={{
            position: "absolute",
            left: (w - profile.Width * scale) / 2,
            top: (h - profile.Height * scale) / 2,
            width: profile.Width,
            height: profile.Height,
            transform: `scale(${scale})`,
            transformOrigin: "0 0",
          }}
        >
          <ProfileView
            profile={profile}
            items={canvas.items}
            sensor={(item) => canvasSensor(item, keyOf(canvas, item), sensors, (key) => history.get(key))}
            now={now}
            font={font}
            assets={assets}
            hidden={native.hidden}
            native={native.elements}
          />
        </div>
      )}
    </div>
  );
}

/** The native layer's drawing of a Studio widget item: the registry widget at its box, from the zone's values. */
export function widgetDrawer(sensors: SensorMap, appearance?: Appearance): NativeView["widget"] {
  return (item, _path, box) => {
    const widget = widgetOf(item);
    return widget ? <WidgetItemView widget={widget} name={item.Name} width={box.w} height={box.h} sensors={sensors} appearance={appearance} /> : null;
  };
}

export default function CanvasZone({ canvas, sensors, appearance }: CanvasZoneProps) {
  const opened = useMemo((): OpenCanvas | Error => {
    try {
      return openCanvas(canvas);
    } catch (e) {
      return e instanceof Error ? e : new Error(String(e));
    }
  }, [canvas]);
  if (opened instanceof Error) {
    return <div className="grid h-full place-items-center p-3 text-center text-xs text-muted-foreground">{opened.message}</div>;
  }
  return <CanvasView canvas={opened} sensors={sensors} appearance={appearance} />;
}
