/**
 * Writes a profile back to a `.infopanel` export (L8): `Profile.xml`,
 * `DisplayItems.xml` and `assets/`, as InfoPanel's XmlSerializer writes them,
 * so `parse.ts` and InfoPanel read the same fields back. Lab fields on items
 * (native mode, vector specs) are not InfoPanel's and are left out; fields
 * InfoPanel versions the lab does not know (`unknown`) are written back as read.
 */
import { SCHEMAS, PROFILE, type DisplayItem, type GaugeItem, type ItemKind, type Profile } from "../schema.ts";
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

/** The fields of a schema, then the unknown ones, one element per line. */
function fields(schema: Record<string, Spec>, obj: Record<string, unknown>, indent: string, skip: (k: string, v: unknown) => boolean = () => false): string[] {
  const out: string[] = [];
  for (const [k, spec] of Object.entries(schema)) {
    const v = obj[k];
    if (skip(k, v)) continue;
    const text = valueText(spec, v);
    if (text !== null) out.push(`${indent}<${k}>${text}</${k}>`);
  }
  for (const [k, raw] of Object.entries((obj.unknown as Record<string, string> | undefined) ?? {})) out.push(`${indent}<${k}>${esc(raw)}</${k}>`);
  return out;
}

/** "" stands for C#'s default font (the first installed family): leave the element out so that default applies. */
const defaultFont = (k: string, v: unknown) => k === "Font" && v === "";

function itemLines(item: DisplayItem, indent: string, element = "DisplayItem", typed = true): string[] {
  const open = typed ? `${indent}<${element} xsi:type="${item.kind}DisplayItem">` : `${indent}<${element}>`;
  const inner = indent + "  ";
  const lines = [open, ...fields(SCHEMAS[item.kind as ItemKind] as Record<string, Spec>, item as unknown as Record<string, unknown>, inner, defaultFont)];
  if (item.kind === "Group") {
    lines.push(`${inner}<DisplayItems>`, ...item.DisplayItems.flatMap((c) => itemLines(c, inner + "  ")), `${inner}</DisplayItems>`);
  } else if (item.kind === "Gauge") {
    lines.push(`${inner}<Images>`, ...(item as GaugeItem).Images.flatMap((f) => itemLines(f, inner + "  ", "ImageDisplayItem", false)), `${inner}</Images>`);
  }
  lines.push(`${indent}</${element}>`);
  return lines;
}

const HEAD = '﻿<?xml version="1.0" encoding="utf-8"?>';
const NS = 'xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema"';

export function profileXml(profile: Profile): string {
  const body = fields(PROFILE as Record<string, Spec>, profile as unknown as Record<string, unknown>, "  ", defaultFont);
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
    { name: "DisplayItems.xml", data: enc.encode(displayItemsXml(items)) },
    ...assets.map((a) => ({ name: `assets/${a.name}`, data: a.bytes })),
  ]);
}
