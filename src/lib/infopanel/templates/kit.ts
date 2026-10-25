/**
 * The parts a profile template is built from: only the editor's own items and studio elements
 * (`newItem`, `newElement`, `newCores`), each colour taken from a palette slot so a palette change
 * recolours the whole profile, and each sensor item bound through `bind` by its role. Sizes are
 * in canvas pixels; text sizes are the drawn pixel height, turned into InfoPanel's FontSize.
 */
import { glowToInfoPanel } from "../../effects/glow.ts";
import { newItem } from "../editor/create.ts";
import { applyElement } from "../elements/apply.ts";
import type { CoreSensor } from "../elements/cores.ts";
import type { DriveSensors } from "../elements/drives.ts";
import { newCores, newElement } from "../elements/create.ts";
import { slotInk, type Ink, type Palette, type Slot } from "../elements/palette.ts";
import { elementOf, type CardSpec, type CoresSpec, type DividerSpec, type ElementSpec, type LedBarSpec, type RingSpec, type SparklineSpec } from "../elements/spec.ts";
import type { DisplayItem, Profile } from "../schema.ts";
import type { Box, Frame, Grids } from "./layout.ts";
import { ROLE_INFO, type Role } from "./roles.ts";

/** A template's type: one family and the InfoPanel FontStyle names it uses for each weight. */
export interface Type {
  family: string;
  light: string;
  regular: string;
  strong: string;
}

export type Weight = "light" | "regular" | "strong";

export interface Kit {
  profile: Profile;
  palette: Palette;
  frame: Frame;
  type: Type;
  /** The machine's per-core load sensors (Cores), empty when none were found. */
  cores: readonly CoreSensor[];
  /** The machine's drives (Drives), empty when none were found. */
  drives: readonly DriveSensors[];
  /** The palette variant's id the profile is made with. */
  variant: string;
  /** The item bound to the role's sensor, or left unbound and named for the role. */
  bind: (item: DisplayItem, role: Role) => DisplayItem;
}

/** A palette variant: the slots it changes from the template's own palette. */
export interface Variant {
  id: string;
  name: string;
  palette: Partial<Palette>;
}

export interface Template {
  id: string;
  name: string;
  /** One line for the gallery. */
  blurb: string;
  /** The size the template is made for; the gallery picks it when the template is chosen (a preset). */
  size?: { width: number; height: number };
  /** The profile's own look: background, text colour and type. */
  background: string;
  color: string;
  type: Type;
  /** The template's palette; the first variant is this one unchanged. */
  palette: Palette;
  variants: readonly Variant[];
  grids: Grids;
  /** Design px around and between the tiles. */
  margin: number;
  gap: number;
  /** Items behind the tiles (background glows), from the whole canvas. */
  backdrop?: (k: Kit) => DisplayItem[];
  /** One function per grid cell, each filling its tile's box. */
  tiles: readonly ((k: Kit, box: Box) => DisplayItem[])[];
}

export const ink = (k: Kit, slot: Slot): Ink => slotInk(k.palette, slot);

/** InfoPanel's FontSize for text drawn `px` high (FontSize × FontScale is the drawn size). */
export const fontSize = (k: Kit, px: number) => Math.max(4, Math.round(px / k.profile.FontScale));

const round = (b: Box): Box => ({ x: Math.round(b.x), y: Math.round(b.y), width: Math.max(1, Math.round(b.width)), height: Math.max(1, Math.round(b.height)) });

export interface TextOpts {
  x: number;
  y: number;
  /** Drawn height in px. */
  px: number;
  slot?: Slot;
  weight?: Weight;
  /** With a width, the text is aligned in that box; without, it starts at x. */
  width?: number;
  align?: "left" | "center" | "right";
  upper?: boolean;
  /** A glow in accent 1, sized to the text (the glow variants' numbers). */
  glow?: boolean;
}

/** The glow variants (a template's variant "glow") light their big numbers. */
export const glows = (k: Kit): boolean => k.variant === "glow";

function textFields(k: Kit, o: TextOpts) {
  const slot = o.slot ?? "text";
  const align = o.align ?? "left";
  return {
    X: Math.round(o.x), Y: Math.round(o.y), Font: k.type.family, FontStyle: k.type[o.weight ?? "regular"], FontSize: fontSize(k, o.px),
    Color: k.palette[slot], Width: o.width ? Math.round(o.width) : 0, CenterAlign: align === "center", RightAlign: align === "right",
    Uppercase: o.upper ?? false,
    ...(o.glow ? glowToInfoPanel({ radius: Math.round(o.px * 0.1), color: k.palette.accent1 }) : {}),
    slots: { Color: { slot }, ...(o.glow ? { GlowColor: { slot: "accent1" as const } } : {}) },
  };
}

/** A line of text (InfoPanel draws a Text item's name). */
export const text = (k: Kit, label: string, o: TextOpts): DisplayItem => ({ ...newItem("Text", k.profile, k.palette), ...textFields(k, o), Name: label }) as unknown as DisplayItem;

/** A live value of a role, in the role's unit and precision, coloured by its warning and critical thresholds. */
export function value(k: Kit, role: Role, o: TextOpts & { unit?: boolean }): DisplayItem {
  const info = ROLE_INFO[role];
  const thresholds =
    info.warn !== undefined && info.crit !== undefined
      ? { Threshold1: info.warn, Threshold1Color: k.palette.warn, Threshold2: info.crit, Threshold2Color: k.palette.crit }
      : {};
  const item = {
    ...newItem("Sensor", k.profile, k.palette), ...textFields(k, o), ...thresholds, Name: info.label, Unit: info.scaled?.unit ?? info.unit, ShowUnit: o.unit ?? true,
    OverridePrecision: true, Precision: info.precision,
    ...(info.scaled ? { OverrideUnit: true, DivisionToggle: true, MultiplicationModifier: info.scaled.divide } : {}),
  } as unknown as DisplayItem & { slots: Record<string, { slot: Slot }> };
  const slots = { ...item.slots, ...(info.warn !== undefined ? { Threshold1Color: { slot: "warn" as const }, Threshold2Color: { slot: "crit" as const } } : {}) };
  return k.bind({ ...item, slots } as unknown as DisplayItem, role);
}

/** The time, or the date with `date`, in a .NET format string. */
export const clock = (k: Kit, format: string, o: TextOpts, date = false): DisplayItem =>
  ({ ...newItem(date ? "Calendar" : "Clock", k.profile, k.palette), ...textFields(k, o), Name: date ? "Date" : "Clock", Format: format }) as unknown as DisplayItem;

/** A studio element with its box and spec changed from the element's own defaults. */
function element<S extends ElementSpec>(item: DisplayItem, name: string, b: Box, spec: Partial<S>, fields: Record<string, unknown> = {}): DisplayItem {
  const r = round(b);
  return applyElement({ ...item, ...fields, Name: name, X: r.x, Y: r.y, Width: r.width, Height: r.height, element: { ...elementOf(item), ...spec } } as unknown as DisplayItem);
}

const range = (role: Role) => ({ MinValue: ROLE_INFO[role].min, MaxValue: ROLE_INFO[role].max });

export const card = (k: Kit, name: string, b: Box, spec: Partial<CardSpec> = {}): DisplayItem => element(newElement("card", k.profile, k.palette), name, b, spec);

export const glow = (k: Kit, name: string, b: Box, slot: Slot, alpha: number): DisplayItem =>
  element(newElement("glow", k.profile, k.palette), name, b, { color: ink(k, slot), alpha, radius: Math.round(Math.min(b.width, b.height) / 2) });

export const divider = (k: Kit, b: Box, spec: Partial<DividerSpec> = {}): DisplayItem => element(newElement("divider", k.profile, k.palette), "Divider", b, spec);

export const icon = (k: Kit, name: string, b: Box, slot: Slot = "accent1"): DisplayItem => element(newElement("icon", k.profile, k.palette), `${name} icon`, b, { name, color: ink(k, slot) });

export const ring = (k: Kit, role: Role, b: Box, spec: Partial<RingSpec> = {}): DisplayItem =>
  k.bind(element(newElement("ring", k.profile, k.palette), `${ROLE_INFO[role].label} ring`, b, spec, range(role)), role);

export const ledbar = (k: Kit, role: Role, b: Box, spec: Partial<LedBarSpec> = {}): DisplayItem =>
  k.bind(element(newElement("ledbar", k.profile, k.palette), `${ROLE_INFO[role].label} bar`, b, spec, range(role)), role);

/** A sparkline of a role; rates scale to their own peak (AutoValue). */
export function sparkline(k: Kit, role: Role, b: Box, spec: Partial<SparklineSpec> = {}): DisplayItem {
  const auto = ROLE_INFO[role].unit === "KB/s" ? { AutoValue: true } : {};
  return k.bind(element(newElement("sparkline", k.profile, k.palette), `${ROLE_INFO[role].label} history`, b, spec, { ...range(role), ...auto, Thickness: Math.max(1, Math.round(2 * k.frame.u)), Step: Math.max(2, Math.round(b.width / 60)) }), role);
}

/** InfoPanel's own Bar, styled on the palette's track and accent. */
export function bar(k: Kit, role: Role, b: Box, fill: Slot = "accent1", radius?: number): DisplayItem {
  const r = round(b);
  const item = {
    ...newItem("Bar", k.profile, k.palette), Name: `${ROLE_INFO[role].label} bar`, X: r.x, Y: r.y, Width: r.width, Height: r.height, ...range(role),
    CornerRadius: Math.round(radius ?? r.height / 2), Color: k.palette[fill], slots: { Color: { slot: fill }, BackgroundColor: { slot: "track" } },
  };
  return k.bind(item as unknown as DisplayItem, role);
}

/** The per-core load wall, laid out in the box. */
export function cores(k: Kit, b: Box, spec: Partial<CoresSpec> = {}): DisplayItem {
  const r = round(b);
  const group = newCores(k.profile, k.palette, k.cores, r.x, r.y);
  return applyElement({ ...group, element: { ...elementOf(group), ...spec, width: r.width, height: r.height } } as unknown as DisplayItem);
}
