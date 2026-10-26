/**
 * A Free page's Studio widget items drawn offscreen for an `.infopanel` export (one-editor SPEC §7.4), so every way
 * into the Export window converts them, the open editor or not. Each widget is drawn at its item's box on a canvas of
 * the profile's size, its values tagged for Recreate, under `[data-widget-item]` as the editor draws it; `onReady`
 * gets the canvas once the first draws, fonts and images have settled (as profile-shots.tsx waits for a page).
 */
import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import type { SensorMap } from "@/modules/types";
import type { Appearance } from "@/lib/style-resolve";
import { itemAt } from "@/lib/infopanel/editor/ops";
import type { DisplayItem } from "@/lib/infopanel/schema";
import { widgetBox, widgetOf, widgetPaths } from "@/lib/infopanel/native/widget-item";
import { WidgetItemView } from "./widget-item-view";

/** The widgets get this long to load and run their first draws (fonts and images are awaited as well). */
export const WARMUP_MS = 1500;

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

async function settled(host: HTMLElement, warmup: number): Promise<void> {
  await sleep(warmup);
  await document.fonts?.ready;
  await Promise.all([...host.querySelectorAll("img")].map((img) => img.decode().catch(() => {})));
}

export interface WidgetsOffscreenProps {
  items: readonly DisplayItem[];
  /** The profile's size, in design px. */
  width: number;
  height: number;
  sensors: SensorMap;
  appearance?: Appearance;
  onReady: (root: HTMLElement) => void;
  warmup?: number;
}

export function WidgetsOffscreen({ items, width, height, sensors, appearance, onReady, warmup = WARMUP_MS }: WidgetsOffscreenProps) {
  const host = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let stop = false;
    void settled(host.current!, warmup).then(() => !stop && host.current && onReady(host.current));
    return () => {
      stop = true;
    };
  }, []);
  return createPortal(
    <div ref={host} aria-hidden {...{ inert: true }} className="pointer-events-none" style={{ position: "fixed", left: -100000, top: 0, width, height }}>
      {widgetPaths(items).map((path) => {
        const item = itemAt(items, path)!;
        const box = widgetBox(item);
        return (
          <div key={path} data-widget-item={path} style={{ position: "absolute", left: box.x, top: box.y, width: box.w, height: box.h }}>
            <WidgetItemView widget={widgetOf(item)!} name={item.Name} width={box.w} height={box.h} sensors={sensors} appearance={appearance} tag />
          </div>
        );
      })}
    </div>,
    document.body,
  );
}
