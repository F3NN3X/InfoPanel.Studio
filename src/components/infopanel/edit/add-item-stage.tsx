/**
 * The Add details card's render of an InfoPanel item or element (Edit v3 SPEC §9.5): the new part as the palette makes
 * it, drawn by the kiosk's own canvas renderer at a sample size, its sensor (if it has one) reading a sample value.
 * Loaded with the first card that shows one.
 */
import { useMemo } from "react";
import type { SensorMap } from "@/modules/types";
import { bindItem, storeItems } from "@/lib/infopanel/canvas-edit";
import { newStored, readStored } from "@/lib/infopanel/import/stored";
import type { DisplayItem } from "@/lib/infopanel/schema";
import CanvasZone from "../CanvasZone";
import { newPartItem, partSize } from "./grid-item-add";

const SAMPLE_KEY = "add-preview:sample";
const SAMPLE = { key: SAMPLE_KEY, name: "CPU Package", unit: "°C" };
const SENSORS = { [SAMPLE_KEY]: { value: 54, unit: "°C", name: "CPU Package", min: 0, max: 100 } } as unknown as SensorMap;
/** The stage's shape (the card's render area, inside its padding). */
const STAGE = { w: 330, h: 130 };
const PAD = 24;

/** A part's sensor bound to the sample (each part of a group element too). */
const sampled = (item: DisplayItem): DisplayItem =>
  item.kind === "Group" ? ({ ...item, DisplayItems: item.DisplayItems.map(sampled) } as DisplayItem) : bindItem(item, SAMPLE);

export default function AddItemStage({ data }: { data: string }) {
  const canvas = useMemo(() => {
    const base = newStored({ name: "Add", width: STAGE.w, height: STAGE.h, now: new Date(0) });
    const { profile } = readStored(base);
    const made = newPartItem(data, profile);
    if (!made) return null;
    const size = partSize(made, profile);
    // The canvas the part's size and a margin, in the stage's shape, the part in its middle.
    const width = Math.max(STAGE.w, size.w + PAD * 2, ((size.h + PAD * 2) * STAGE.w) / STAGE.h);
    const height = (width * STAGE.h) / STAGE.w;
    const dx = Math.round((width - size.w) / 2);
    const dy = Math.round((height - size.h) / 2);
    // A group element is laid out from 0, 0 and moves with its parts; a single item keeps its kind's default X and Y,
    // so it is put in the middle outright.
    const by = (item: DisplayItem): DisplayItem =>
      item.kind === "Group"
        ? ({ ...item, X: (Number(item.X) || 0) + dx, Y: (Number(item.Y) || 0) + dy, DisplayItems: item.DisplayItems.map(by) } as DisplayItem)
        : ({ ...item, X: (Number(item.X) || 0) + dx, Y: (Number(item.Y) || 0) + dy } as DisplayItem);
    const at = (item: DisplayItem): DisplayItem => (item.kind === "Group" ? by(item) : ({ ...item, X: dx, Y: dy } as DisplayItem));
    const sized = { ...profile, Width: Math.round(width), Height: Math.round(height), BackgroundColor: "#00000000" };
    return storeItems({ ...base, profile: { ...base.profile, Width: sized.Width, Height: sized.Height, BackgroundColor: sized.BackgroundColor } }, sized, [at(sampled(made))]);
  }, [data]);
  if (!canvas) return null;
  return (
    <div className="relative" style={{ width: STAGE.w, height: STAGE.h }}>
      <CanvasZone canvas={canvas} sensors={SENSORS} />
    </div>
  );
}
