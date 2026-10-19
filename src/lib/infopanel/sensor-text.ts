/**
 * The text and colour InfoPanel draws for Sensor, Clock and Calendar items:
 * a port of SensorDisplayItem.EvaluateText / EvaluateColor
 * (`Models/SensorDisplayItem.cs:299-509`) and the Clock / Calendar
 * EvaluateText (`Models/TextDisplayItem.cs`).
 */
import { EN_US, formatDate, formatFixed, formatN, parseAnyInvariant, type Culture } from "./dotnet-format.ts";
import type { DisplayItem } from "./schema.ts";

/** InfoPanel's SensorReading: numbers, or a text value (plugin text and tables). */
export interface SensorReading {
  now: number;
  min: number;
  max: number;
  avg: number;
  unit: string;
  /** A non-empty text is shown verbatim instead of the number. */
  text?: string;
}

type SensorItem = Extract<DisplayItem, { kind: "Sensor" }>;
type DateItem = Extract<DisplayItem, { kind: "Clock" | "Calendar" }>;

/** The reading's value for the item's ValueType, after the modifiers and AbsoluteAddition. */
export function modifiedValue(item: SensorItem, r: SensorReading): number {
  let v = item.ValueType === "MIN" ? r.min : item.ValueType === "MAX" ? r.max : item.ValueType === "AVERAGE" ? r.avg : r.now;
  const m = item.MultiplicationModifier;
  if (item.DivisionToggle) v = m !== 0 ? v / m + item.AdditionModifier : v + item.AdditionModifier;
  else v = v * m + item.AdditionModifier;
  return item.AbsoluteAddition ? Math.abs(v) : v;
}

/** Fraction digits InfoPanel picks from the reading's unit when Precision is not overridden. */
function unitDecimals(unit: string): number {
  switch (unit.toLowerCase()) {
    case "gb":
      return 1;
    case "kb/s":
    case "mb/s":
    case "mbar/min":
    case "mbar":
      return 2;
    case "v":
      return 3;
    default:
      return 0;
  }
}

/** The item's text; `null` reading (no such sensor) gives "-". */
export function sensorText(item: SensorItem, r: SensorReading | null, culture: Culture = EN_US): string {
  if (!r) return "-";
  let value: string;
  if (r.text) {
    value = r.text;
  } else {
    const v = modifiedValue(item, r);
    if (item.OverridePrecision) {
      value = [1, 2, 3].includes(item.Precision) ? formatFixed(v, item.Precision, culture) : formatFixed(Math.floor(v), 0, culture);
    } else {
      value = formatFixed(v, unitDecimals(r.unit), culture);
    }
  }

  if (item.ShowThousandsSeparator) {
    // Parsed and re-formatted with the invariant culture, whatever the current one.
    const parsed = parseAnyInvariant(value);
    if (parsed !== null) {
      const dot = value.indexOf(".");
      value = formatN(parsed, dot >= 0 ? value.length - dot - 1 : 0);
    }
  }
  if (item.ShowUnit) value += item.OverrideUnit ? item.Unit : r.unit;
  if (item.ShowName) value = item.Name + " " + value;
  return value;
}

/** The item's colour: a threshold colour when one is active and reached. */
export function sensorColor(item: SensorItem, r: SensorReading | null): string {
  if (!r || !(item.Threshold1 > 0 || item.Threshold2 > 0)) return item.Color;
  const v = modifiedValue(item, r);
  if (item.Threshold2 > 0 && v >= item.Threshold2) return item.Threshold2Color;
  if (item.Threshold1 > 0 && v >= item.Threshold1) return item.Threshold1Color;
  return item.Color;
}

/** Clock: `DateTime.Now.ToString(Format)`; Calendar: the same for today at midnight. */
export function dateText(item: DateItem, now: Date, culture: Culture = EN_US): string {
  const at = item.kind === "Calendar" ? new Date(now.getFullYear(), now.getMonth(), now.getDate()) : now;
  const text = formatDate(at, item.Format, culture);
  return item.Uppercase ? text.toLocaleUpperCase("en-US") : text;
}
