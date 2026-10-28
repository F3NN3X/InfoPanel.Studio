/**
 * The inspector's field list for each InfoPanel item kind, generated from the
 * schema tables (field kind, default, enum values, setter checks). Only the
 * grouping, order and labels are written by hand: no per-kind panel.
 */
import { SCHEMAS, type DisplayItem, type FieldSpec, type ItemKind } from "../schema.ts";

export interface FieldDef {
  name: string;
  label: string;
  group: string;
  spec: FieldSpec<unknown>;
}

/** Groups in display order; a field goes to the first group whose test matches. */
const GROUPS: [string, (f: string) => boolean][] = [
  ["Item", (f) => ["Name", "Hidden", "IsLocked", "IsExpanded"].includes(f)],
  ["Position", (f) => ["X", "Y", "Width", "Height", "Rotation", "Scale", "FlipX", "CornerRadius"].includes(f)],
  ["Sensor", (f) => ["SensorName", "SensorType", "HwInfoRemoteIndex", "Id", "Instance", "EntryId", "LibreSensorId", "PluginSensorId", "ValueType"].includes(f)],
  ["Value", (f) => /^(Unit|OverrideUnit|ShowUnit|ShowName|OverridePrecision|Precision|ShowThousandsSeparator|AdditionModifier|AbsoluteAddition|MultiplicationModifier|DivisionToggle|Format|MinValue|MaxValue|AutoValue|AnimationSpeed)$/.test(f)],
  ["Thresholds", (f) => f.startsWith("Threshold")],
  ["Text", (f) => /^(Font|FontStyle|FontSize|Bold|Italic|Underline|Strikeout|Color|Uppercase|RightAlign|CenterAlign|Wrap|Ellipsis)$/.test(f)],
  ["Table", (f) => ["MaxRows", "ShowHeader", "TableFormat"].includes(f)],
  ["Marquee", (f) => f.startsWith("Marquee")],
  ["Glow", (f) => f.startsWith("Glow")],
  ["Chart", (f) => /^(Type|Thickness|Step|Fill|FillColor|Frame|FrameColor|FrameThickness|Background|BackgroundColor|Gradient|GradientColor|Span|ShowFrame|ShowFill)$/.test(f)],
  ["Gradient", (f) => f.startsWith("Gradient") || f === "ShowGradient"],
  ["Image", (f) => /^(FilePath|RelativePath|HttpUrl|RtspUrl|Cache|Layer|LayerColor|Volume|ShowPanel)$/.test(f)],
];

/** "MultiplicationModifier" → "Multiplication modifier"; a few names read better spelt out. */
const LABELS: Record<string, string> = {
  X: "X", Y: "Y", FlipX: "Flip X", HwInfoRemoteIndex: "HWiNFO remote", Id: "HWiNFO sensor id", Instance: "HWiNFO instance",
  EntryId: "HWiNFO entry id", LibreSensorId: "Libre sensor id", PluginSensorId: "Plugin sensor id", HttpUrl: "URL",
  RtspUrl: "RTSP URL", IsLocked: "Locked", IsExpanded: "Expanded",
};
export const labelOf = (name: string) =>
  LABELS[name] ?? name.replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/^(.)(.*)$/, (_, a: string, b: string) => a + b.toLowerCase());

/** The kind's fields, grouped and ordered for the inspector. Item-level structure (children, frames) is not a field. */
export function fieldsOf(kind: ItemKind): FieldDef[] {
  const schema = SCHEMAS[kind] as Record<string, FieldSpec<unknown>>;
  const defs = Object.entries(schema).map(([name, spec]) => {
    const g = GROUPS.findIndex(([, test]) => test(name));
    return { name, label: labelOf(name), group: g >= 0 ? GROUPS[g][0] : "Other", spec, order: g >= 0 ? g : GROUPS.length };
  });
  return defs.sort((a, b) => a.order - b.order).map(({ order: _order, ...d }) => d);
}

export type Checked = { ok: true; value: unknown } | { ok: false; reason: string };

/**
 * A typed-in value as InfoPanel would store it: parsed for the field's kind, then
 * through the setter. A rejected value is reported, not silently kept.
 */
export function checkValue(spec: FieldSpec<unknown>, input: unknown): Checked {
  let v: unknown = input;
  switch (spec.kind) {
    case "int":
    case "uint": {
      const n = typeof input === "number" ? input : Number(String(input).trim());
      if (!Number.isInteger(n)) return { ok: false, reason: "a whole number" };
      if (spec.kind === "uint" && n < 0) return { ok: false, reason: "zero or more" };
      if (Math.abs(n) > 2 ** 31) return { ok: false, reason: "out of range" };
      v = n;
      break;
    }
    case "double":
    case "float": {
      const n = typeof input === "number" ? input : Number(String(input).trim());
      if (!Number.isFinite(n)) return { ok: false, reason: "a number" };
      v = spec.kind === "float" ? Math.fround(n) : n;
      break;
    }
    case "bool":
      v = input === true || input === "true";
      break;
    case "color": {
      const s = String(input).trim();
      if (!/^#?([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(s)) return { ok: false, reason: "a color like #AARRGGBB" };
      v = s.startsWith("#") ? s.toUpperCase() : "#" + s.toUpperCase();
      break;
    }
    case "enum":
      if (!spec.values?.includes(String(input))) return { ok: false, reason: `one of ${spec.values?.join(", ")}` };
      break;
    case "string":
      v = String(input);
      break;
  }
  if (spec.accept) {
    let accepted: unknown;
    try {
      accepted = spec.accept(v);
    } catch {
      return { ok: false, reason: "InfoPanel rejects it" };
    }
    if (accepted === undefined) return { ok: false, reason: "InfoPanel ignores this value" };
    v = accepted;
  }
  return { ok: true, value: v };
}

/** The item's current value for a field, for the inspector (null for fields the kind lacks). */
export const valueOf = (item: DisplayItem, name: string): unknown => (name in item ? (item as unknown as Record<string, unknown>)[name] : null);
