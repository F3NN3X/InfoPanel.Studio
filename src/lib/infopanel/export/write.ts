/**
 * Writes a profile back to a `.infopanel` export (L8): `Profile.xml`,
 * `DisplayItems.xml` and `assets/`, as InfoPanel's XmlSerializer writes them,
 * so `parse.ts` and InfoPanel read the same fields back. Lab fields on items
 * (native mode, vector specs) are not InfoPanel's and are left out; fields
 * InfoPanel versions the lab does not know (`unknown`) are written back as read.
 */
import { SCHEMAS, PROFILE, type DisplayItem, type GaugeItem, type ItemKind, type Profile } from "../schema.ts";
import { withoutWidgets } from "../native/widget-item.ts";
import { writeZip } from "../zip.ts";

type Spec = { kind: string; default: unknown };

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** XmlConvert.ToString(double): shortest round trip, `E` exponents, INF / NaN. */
export function dotnetDouble(n: number): string {
  if (Number.isNaN(n)) return "NaN";
  if (n === Infinity) return "INF";
  if (n === -Infinity) return "-INF";
  if (Object.is(n, -0)) return "-0";
  return String(n).replace("e", "E");
}

/** XmlConvert.ToString(float): the shortest decimal that reads back to the same float32. */
export function dotnetFloat(n: number): string {
  if (!Number.isFinite(n)) return dotnetDouble(n);
  const f = Math.fround(n);
  for (let p = 1; p <= 9; p++) {
    const s = Number(f.toPrecision(p));
    if (Math.fround(s) === f) return dotnetDouble(s);
  }
  return dotnetDouble(f);
}

/**
 * Element order where it isn't the schema's. XmlSerializer writes a class's members in declaration order and the
 * generated (`[ObservableProperty]`) ones after the rest, so a real export orders these blocks differently from the
 * schema (which groups them for the inspector). Each block is placed where its first member sits in the schema, for
 * the kinds that have its anchor field. lab/infopanel/src/order.test.ts checks the result against every corpus profile.
 */
const BLOCKS: { anchor: string; order: readonly string[] }[] = [
  {
    anchor: "Uppercase",
    order: [
      "Font", "FontSize", "Bold", "Italic", "Underline", "Strikeout", "Color", "Uppercase", "GlowRadius", "FontStyle", "RightAlign", "CenterAlign",
      "Wrap", "Ellipsis", "Width", "Height", "Marquee", "MarqueeSpeed", "MarqueeSpacing", "GlowEnabled", "GlowColor", "GlowBlendMode",
    ],
  },
  {
    anchor: "ShowPanel",
    order: ["Type", "FilePath", "RelativePath", "RtspUrl", "HttpUrl", "Cache", "Scale", "Layer", "LayerColor", "ShowPanel", "Volume", "Width", "Height"],
  },
  { anchor: "Gradient", order: ["Gradient", "GradientColor", "CornerRadius"] },
  { anchor: "AnimationSpeed", order: ["FlipX", "ValueType", "MinValue"] },
  { anchor: "TableFormat", order: ["SensorName", "SensorType", "ValueType", "PluginSensorId"] },
];

/** The schema's field names in the order InfoPanel writes them. */
export function writeOrder(schema: Record<string, unknown>): string[] {
  return BLOCKS.reduce((names, { anchor, order }) => {
    if (!(anchor in schema)) return names;
    const block = order.filter((n) => names.includes(n));
    const rest = names.filter((n) => !block.includes(n));
    const at = names.findIndex((n) => block.includes(n));
    return [...rest.slice(0, at), ...block, ...rest.slice(at)];
  }, Object.keys(schema));
}

function valueText(spec: Spec, v: unknown): string | null {
  if (v === null || v === undefined) return null;
  switch (spec.kind) {
    case "int":
    case "uint":
      return String(Math.trunc(v as number));
    case "double":
      return dotnetDouble(v as number);
    case "float":
      return dotnetFloat(v as number);
    case "bool":
      return v ? "true" : "false";
    default:
      return esc(String(v));
  }
}

/** One element as XmlSerializer writes it: an empty string is `<X />`. */
const element = (name: string, text: string) => (text === "" ? `<${name} />` : `<${name}>${text}</${name}>`);

/** The fields of a schema in InfoPanel's order, then the unknown ones, one element per line. */
function fields(schema: Record<string, Spec>, obj: Record<string, unknown>, indent: string, skip: (k: string, v: unknown) => boolean = () => false): string[] {
  const out: string[] = [];
  for (const k of writeOrder(schema)) {
    const v = obj[k];
    if (skip(k, v)) continue;
    const text = valueText(schema[k], v);
    // XmlSerializer also writes SensorDisplayItem's public `_valueType` field, just before SensorName.
    if (k === "SensorName" && "ValueType" in schema) out.push(indent + element("_valueType", String(valueText(schema.ValueType, obj.ValueType))));
    if (text !== null) out.push(indent + element(k, text));
  }
  for (const [k, raw] of Object.entries((obj.unknown as Record<string, string> | undefined) ?? {})) out.push(indent + element(k, esc(raw)));
  return out;
}

/** "" stands for C#'s default font (the first installed family): leave the element out so that default applies. */
const defaultFont = (k: string, v: unknown) => k === "Font" && v === "";

/** A list element: `<Name />` when empty, as XmlSerializer writes an empty collection. */
const list = (indent: string, name: string, lines: string[]) => (lines.length ? [`${indent}<${name}>`, ...lines, `${indent}</${name}>`] : [`${indent}<${name} />`]);

function itemLines(item: DisplayItem, indent: string, tag = "DisplayItem", typed = true): string[] {
  const open = typed ? `${indent}<${tag} xsi:type="${item.kind}DisplayItem">` : `${indent}<${tag}>`;
  const inner = indent + "  ";
  const lines = [open, ...fields(SCHEMAS[item.kind as ItemKind] as Record<string, Spec>, item as unknown as Record<string, unknown>, inner, defaultFont)];
  if (item.kind === "Group") {
    lines.push(...list(inner, "DisplayItems", item.DisplayItems.flatMap((c) => itemLines(c, inner + "  "))));
  } else if (item.kind === "Gauge") {
    lines.push(...list(inner, "Images", (item as GaugeItem).Images.flatMap((f) => itemLines(f, inner + "  ", "ImageDisplayItem", false))));
  }
  lines.push(`${indent}</${tag}>`);
  return lines;
}

const HEAD = '﻿<?xml version="1.0" encoding="utf-8"?>';
const NS = 'xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema"';

/**
 * What InfoPanel's own export (`SharedModel.ExportProfile`) leaves at a fresh profile's values: the window state of
 * the PC it came from. Importing a file that carried them would import the profile inactive, topmost, pinned to a
 * process or placed at the old window position. The Guid is kept: InfoPanel mints a new one on import.
 */
export const FRESH = { IsSelected: false, Drag: true, Active: true, Topmost: false, WindowX: 0, WindowY: 0, Resize: true, StrictWindowMatching: false, TriggerProcessNames: null };

/** `Profile.xml`: the fields InfoPanel's export carries, with the window state reset, in its order. */
export function profileXml(profile: Profile): string {
  const body = fields(PROFILE as Record<string, Spec>, { ...profile, ...FRESH } as unknown as Record<string, unknown>, "  ", defaultFont);
  return [HEAD, `<Profile ${NS}>`, ...body, "</Profile>"].join("\r\n");
}

export function displayItemsXml(items: readonly DisplayItem[]): string {
  return [HEAD, `<ArrayOfDisplayItem ${NS}>`, ...items.flatMap((i) => itemLines(i, "  ")), "</ArrayOfDisplayItem>"].join("\r\n");
}

/** The `.infopanel` file: the two XML entries and every asset under `assets/`. */
export function infopanelExport(profile: Profile, items: readonly DisplayItem[], assets: readonly { name: string; bytes: Uint8Array }[]): Uint8Array {
  const enc = new TextEncoder();
  return writeZip([
    { name: "Profile.xml", data: enc.encode(profileXml(profile)) },
    // A Studio widget item the export didn't convert is left out: InfoPanel would show an empty Image.
    { name: "DisplayItems.xml", data: enc.encode(displayItemsXml(withoutWidgets(items))) },
    ...assets.map((a) => ({ name: `assets/${a.name}`, data: a.bytes })),
  ]);
}
