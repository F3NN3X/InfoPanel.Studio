/**
 * The list model behind every sensor dropdown in the InfoPanel editor (the inspector, the Create
 * dialog's Sensors section): the Data API's points matching a query, grouped "Source › Device",
 * for the kinds that may bind them, and each point as the `ChosenSensor` the bind path takes.
 */
import { searchPoints, type DataPoint } from "../../data-points.ts";
import { bindingFromRef, type DataApiValue } from "../sensors.ts";
import type { ChosenSensor } from "./bind.ts";

/** Shown when the Data API reports no sensor ids. */
export const NOT_EXPORTABLE = "Not exportable to InfoPanel: this InfoPanel build doesn’t report sensor ids";

/** InfoPanel lists only plugin sensors for these. */
export const PLUGIN_ONLY = new Set(["TableSensor", "HttpImage"]);

const LIMIT = 200;

export interface SensorSection {
  title: string;
  points: DataPoint[];
}

/** The points a kind may bind, matching the query, in sections "Source › Device". */
export function pickerSections(points: readonly DataPoint[], sensors: Readonly<Record<string, DataApiValue>>, query: string, pluginOnly: boolean): SensorSection[] {
  const isPlugin = (p: DataPoint) => {
    const ref = sensors[p.key]?.ref;
    return ref ? ref.startsWith("plugin:") : p.key.startsWith("plugins.");
  };
  const shown = searchPoints(points, query)
    .filter((p) => !pluginOnly || isPlugin(p))
    .slice(0, LIMIT);
  const sections = new Map<string, DataPoint[]>();
  for (const p of shown) {
    const title = p.containerTitle && p.containerTitle !== p.sourceName ? `${p.sourceName} › ${p.containerTitle}` : p.sourceName;
    sections.set(title, [...(sections.get(title) ?? []), p]);
  }
  return [...sections].map(([title, list]) => ({ title, points: list }));
}

/** A listed point as the sensor the editor binds. */
export function chosenOf(p: DataPoint, sensors: Readonly<Record<string, DataApiValue>>): ChosenSensor {
  const v = sensors[p.key];
  return { key: p.key, name: v?.name ?? p.name, ...(v?.unit ? { unit: v.unit } : {}), ...(v?.ref ? { ref: v.ref } : {}), ...(v?.table?.format ? { format: v.table.format } : {}) };
}

/** Whether a sensor binds natively (its ref converts to InfoPanel's binding fields). */
export const isNative = (key: string, sensors: Readonly<Record<string, DataApiValue>>): boolean => {
  const ref = sensors[key]?.ref;
  return ref ? bindingFromRef(ref) !== null : false;
};

/** Every point of the sections in list order (the keyboard walks this). */
export const flatPoints = (sections: readonly SensorSection[]): DataPoint[] => sections.flatMap((s) => s.points);
