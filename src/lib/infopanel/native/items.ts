/**
 * The pieces the native → InfoPanel converters share: the context they work in, a new item set at a box and
 * styled from the profile, an item bound to a Data API key (or left unbound with a note saying why), and the
 * note a conversion report lists.
 */
import { bindItem } from "../canvas-edit.ts";
import { newItem } from "../editor/create.ts";
import { withBox } from "../editor/ops.ts";
import type { Palette } from "../elements/palette.ts";
import type { DisplayItem, ItemKind, Profile } from "../schema.ts";
import type { DataApiValue } from "../sensors.ts";
import { bindKey } from "./bind.ts";

/** A box in px: on the zone while a widget is converted, on the screen once it is placed. */
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** InfoPanel draws FontSize × FontScale px (the profile's FontScale, 1.33 by default): a size in px as its FontSize. */
export const fontSizeOf = (px: number, scale = 1.33): number => Math.max(1, Math.round(px / scale));

export type Look = Pick<Profile, "Font" | "FontSize" | "Color" | "BackgroundColor">;

/** One line of a conversion report. */
export interface Note {
  /** The widget or item it is about. */
  name: string;
  text: string;
}

export interface ConvertContext {
  look: Look;
  palette: Palette;
  sensors: Readonly<Record<string, DataApiValue>>;
  /** Collects the report lines (the converters push to it). */
  notes: Note[];
}

/** A colour as InfoPanel writes it: `#AARRGGBB`. Accepts `#RGB`, `#RRGGBB` and CSS `#RRGGBBAA`; anything else is returned as is. */
export function argb(color: string): string {
  const h = color.trim();
  if (/^#[0-9a-f]{3}$/i.test(h)) return `#FF${[...h.slice(1)].map((c) => c + c).join("")}`.toUpperCase();
  if (/^#[0-9a-f]{6}$/i.test(h)) return `#FF${h.slice(1)}`.toUpperCase();
  if (/^#[0-9a-f]{8}$/i.test(h)) return `#${h.slice(7)}${h.slice(1, 7)}`.toUpperCase();
  return color;
}

/** A new item of `kind` at `box`, with `fields` over InfoPanel's and the profile's defaults. */
export function make(kind: ItemKind, ctx: ConvertContext, box: Rect, name: string, fields: Record<string, unknown> = {}): DisplayItem {
  const item = { ...newItem(kind, ctx.look, ctx.palette), Name: name, ...fields } as DisplayItem;
  return withBox(item, { x: box.x, y: box.y, width: box.w, height: box.h });
}

/**
 * The item bound to a Data API key by its InfoPanel reference. A key with none stays unbound: the item is
 * kept as a placeholder and the report says why.
 */
export function bound(item: DisplayItem, key: string | undefined, ctx: ConvertContext): DisplayItem {
  if (!key) return item;
  const r = bindKey(key, ctx.sensors);
  if (!r.ok) {
    ctx.notes.push({ name: item.Name, text: `not bound: ${r.reason}` });
    return item;
  }
  if (r.via === "remap") ctx.notes.push({ name: item.Name, text: `reads ${r.sensor.name}, InfoPanel's reading for ${key}` });
  const next = bindItem(item, r.sensor);
  if (next === item) ctx.notes.push({ name: item.Name, text: `not bound: a ${item.kind} can't read ${r.sensor.name}` });
  return next;
}

/** The first key of the Data API ending in `.suffix` under `prefix` (a plugin container), else undefined. */
export function keyUnder(sensors: Readonly<Record<string, DataApiValue>>, prefix: string, suffix: string): string | undefined {
  return Object.keys(sensors).find((k) => k.startsWith(prefix) && k.endsWith("." + suffix));
}
