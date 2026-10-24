/**
 * Binding an item to a Data API sensor natively: InfoPanel's own binding fields written from the
 * sensor's `ref` (`bindingFromRef`), so a `.infopanel` export reads the sensor the studio shows.
 */
import type { KeyOf } from "../import/stored.ts";
import type { DisplayItem } from "../schema.ts";
import { bindingFromRef, bindingOf, isBound, withBinding, type DataApiValue } from "../sensors.ts";

/** A Data API sensor as the editor binds to it: its key, display name, unit, and native ref when the Data API reports one. */
export interface ChosenSensor {
  key: string;
  name: string;
  unit?: string;
  ref?: string;
  /** A plugin table's default column format, when the Data API reports it. */
  format?: string;
}

/** The catalog's sensor for a key, if it has one. */
export type SensorOf = (key: string) => ChosenSensor | undefined;

export const sensorOfCatalog =
  (sensors: Readonly<Record<string, DataApiValue>>): SensorOf =>
  (key) => {
    const v = sensors[key];
    return v ? { key, name: v.name ?? key, unit: v.unit, ...(v.ref ? { ref: v.ref } : {}), ...(v.table?.format ? { format: v.table.format } : {}) } : undefined;
  };

/** InfoPanel's binding fields set from a sensor's ref; the item unchanged when there is none, or it can't hold it. */
export function rebound(item: DisplayItem, sensor: ChosenSensor | undefined): DisplayItem {
  if (!sensor?.ref || !isBound(item)) return item;
  const binding = bindingFromRef(sensor.ref);
  return (binding && withBinding(item, binding, sensor.name)) || item;
}

/** Whether a sensor binds natively too (its ref converts and the item can hold it), so the `.infopanel` export reads it. */
export function exportsBinding(item: DisplayItem, sensor: ChosenSensor | undefined): boolean {
  const binding = sensor?.ref ? bindingFromRef(sensor.ref) : null;
  return binding !== null && isBound(item) && withBinding(item, binding, "") !== null;
}

/** Every item, inside groups too, through `fn` (a group is rebuilt only when a child changed). */
export function mapItems(items: readonly DisplayItem[], fn: (item: DisplayItem) => DisplayItem): DisplayItem[] {
  return items.map((item) => {
    const next = fn(item);
    if (next.kind !== "Group") return next;
    const kids = mapItems(next.DisplayItems, fn);
    return kids.every((k, i) => k === next.DisplayItems[i]) ? next : { ...next, DisplayItems: kids };
  });
}

/**
 * The import's remap choices written into InfoPanel's own binding fields too (`bindItem`): each
 * item whose record says the user chose its sensor. Rebinding changes the group a record was
 * found by, so the records come back keyed by the new items. A sensor without a ref, or "left
 * unbound", leaves the native fields.
 */
export function rebindChosen(items: readonly DisplayItem[], keyOf: KeyOf, sensorOf: SensorOf): { items: DisplayItem[]; keyOf: KeyOf } {
  const records = new WeakMap<DisplayItem, NonNullable<ReturnType<KeyOf>>>();
  const next = mapItems(items, (item) => {
    const rec = keyOf(item);
    const out = rec?.via === "chosen" && rec.key ? rebound(item, sensorOf(rec.key)) : item;
    // A rebound item keeps the binding it was imported with, for Reset to automatic.
    if (rec) records.set(out, out !== item && isBound(item) ? { ...rec, original: bindingOf(item) } : rec);
    return out;
  });
  return { items: next, keyOf: (item) => records.get(item) ?? null };
}
