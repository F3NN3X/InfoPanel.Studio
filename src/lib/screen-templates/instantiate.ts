/**
 * A native screen template made into a new screen at a chosen size: the layout of the size's shape class (or the
 * nearest class the template has), its grid split so the cells keep the shape they have at the class's reference
 * size, the spacing scaled to the size, the template's look as the screen's own, and every setting given by role
 * bound to this machine's sensor for it (a spare zone whose sensor isn't found takes a similar one or makes way for its
 * neighbours: `fallback.ts`), in the palette of the variant chosen. Zones keep their boxes exactly (a split multiplies them), so none overlap
 * or leave the grid that didn't in the template.
 */
import type { ModuleSettings } from "@/modules/types";
import type { DataApiValue } from "../infopanel/sensors";
import { shapeClassOf, type ShapeClass } from "../infopanel/templates/layout";
import { ROLE_INFO, resolveRole, type Role } from "../infopanel/templates/roles";
import { presetTokens } from "../appearance-presets";
import { newProfile, uid, type MonitorProfile, type Placement } from "../layout";
import { MAIN_PAGE_ID } from "../pages";
import { sectionsWithValues } from "../theme-model";
import { placePage, type Placed } from "./fallback";
import { REFERENCE, type ScreenTemplate, type ShapeLayout, type Size, type Variant } from "./kit";
import { templatePreset, variantOf } from "./looks";

export interface TemplateInput {
  name: string;
  /** The id of one of the template's palettes; its first when unset or unknown. */
  variant?: string;
  width: number;
  height: number;
  /** The live Data API's sensors (empty when it can't be reached). */
  sensors?: Readonly<Record<string, DataApiValue>>;
}

export interface Instance {
  profile: MonitorProfile;
  /** The roles nothing on this machine matched, in plain words ("GPU power"), in template order. */
  unbound: string[];
}

/** The classes a template's layouts stand in for when it has none of a size's own, nearest first. */
const NEAREST: Readonly<Record<ShapeClass, readonly ShapeClass[]>> = {
  strip: ["strip", "wide", "standard", "tall"],
  wide: ["wide", "strip", "standard", "tall"],
  standard: ["standard", "wide", "tall", "strip"],
  tall: ["tall", "standard", "wide", "strip"],
};

/** The most columns and rows a split grid takes. */
const MAX_COLS = 36;
const MAX_ROWS = 24;

/** The class whose layout a size gets: its own, else the nearest the template has. */
export function layoutClassOf(t: ScreenTemplate, width: number, height: number): ShapeClass {
  const own = shapeClassOf(width, height);
  return NEAREST[own].find((c) => t.layouts[c]) ?? own;
}

/**
 * How many columns (`kx`) or rows (`ky`) each of the layout's becomes at the size, so the cells keep about the
 * shape they have at the reference size: a canvas twice as wide for its height splits every column in two.
 */
export function splitOf(layout: Pick<ShapeLayout, "cols" | "rows">, cls: ShapeClass, width: number, height: number): { kx: number; ky: number } {
  const ref = REFERENCE[cls];
  const stretch = width / height / (ref.width / ref.height);
  const kx = stretch >= 1.5 ? Math.min(Math.round(stretch), Math.floor(MAX_COLS / layout.cols)) : 1;
  const ky = stretch <= 1 / 1.5 ? Math.min(Math.round(1 / stretch), Math.floor(MAX_ROWS / layout.rows)) : 1;
  return { kx: Math.max(1, kx), ky: Math.max(1, ky) };
}

/**
 * How much a zone's Size % shrinks at a size smaller than the one the template is designed for (1 there and above),
 * within these bounds. A larger screen's zones are grown by the widget shell's own zoom, so this one doesn't.
 */
const ZOOM_MIN = 0.6;
const ZOOM_MAX = 1;
export const zoneZoom = (design: Size, width: number, height: number): number =>
  Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.min(width / design.width, height / design.height)));

const escaped = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** The settings with the variant's colours swapped wherever a value holds them, and its own values set where a zone has the key. */
function recolored(settings: ModuleSettings | undefined, v: Variant | undefined): ModuleSettings | undefined {
  if (!settings || !v) return settings;
  const swap = Object.entries(v.swap ?? {});
  const pattern = swap.length > 0 ? new RegExp(swap.map(([from]) => escaped(from)).join("|"), "gi") : undefined;
  const to = new Map(swap.map(([from, hex]) => [from.toLowerCase(), hex]));
  return Object.fromEntries(
    Object.entries(settings).map(([key, value]) => [
      key,
      key in (v.zones ?? {}) ? v.zones![key] : pattern && typeof value === "string" ? value.replace(pattern, (m) => to.get(m.toLowerCase()) ?? m) : value,
    ]),
  );
}

export function instantiate(t: ScreenTemplate, input: TemplateInput): Instance {
  const cls = layoutClassOf(t, input.width, input.height);
  const layout = t.layouts[cls];
  if (!layout) throw new Error(`Template ${t.id} has no layout`);
  const { kx, ky } = splitOf(layout, cls, input.width, input.height);
  const ref = REFERENCE[cls];
  const u = Math.min(input.width / ref.width, input.height / ref.height);
  const zoom = zoneZoom(t.size, input.width, input.height);
  const space = (px: number) => Math.max(px > 0 ? 2 : 0, Math.round(px * Math.max(0.4, u)));

  const variant = variantOf(t, input.variant);
  const look = templatePreset(t, variant);

  // Without this machine's sensors (none given, or the Data API can't be reached) every zone stays, its sensor left to pick.
  const known = input.sensors !== undefined && Object.keys(input.sensors).length > 0;
  const found = new Map<Role, string | undefined>();
  const keyOf = (role: Role) => {
    if (!found.has(role)) found.set(role, input.sensors ? resolveRole(role, input.sensors)?.key : undefined);
    return found.get(role);
  };
  /** A sensor that reports no unit (LibreHardwareMonitor's memory sizes) reads in its role's usual one, so a size can step up to GB. */
  const unitOf = (z: Placed["zone"], bound: Placed["bound"], roles: Placed["roles"]): ModuleSettings => {
    const role = roles.sensor;
    const unit = role ? ROLE_INFO[role].unit : "";
    return z.module === "SensorValue" && unit && bound.sensor && input.sensors?.[bound.sensor]?.unit === "" ? { unit } : {};
  };
  const placement = ({ zone: z, at, bound, roles, label }: Placed): Placement => {
    const [col, row, cols, rows] = at;
    const base = recolored(z.settings, variant);
    const settings = { ...base, ...(label !== undefined && typeof base?.label === "string" ? { label } : {}), ...(base?.unit === undefined ? unitOf(z, bound, roles) : {}), ...bound,
      // A zone's Size % is set for the template's own size, so it follows the screen's size from there.
      ...(typeof base?.scale === "number" ? { scale: Math.round(base.scale * zoom) } : {}),
    };
    // A zone's own look values (a bigger clock, its own surface) apply only in the sections it customises.
    const own = sectionsWithValues(base);
    return {
      id: uid(z.module),
      module: z.module,
      colStart: (col - 1) * kx + 1,
      rowStart: (row - 1) * ky + 1,
      colSpan: cols * kx,
      rowSpan: rows * ky,
      visible: true,
      ...(Object.keys(settings).length > 0 ? { settings } : {}),
      ...(own.length > 0 ? { follow: Object.fromEntries(own.map((sec) => [sec, false])) } : {}),
    };
  };

  const base = newProfile(input.name, input.width, input.height);
  const names = t.pages ?? [{ name: "Main" }];
  const style = look.style;
  const profile: MonitorProfile = {
    ...base,
    cols: layout.cols * kx,
    rows: layout.rows * ky,
    // A template is drawn to fill the screen, like a kiosk strip.
    fit: "fill",
    gap: space(t.look.gap),
    padding: space(t.look.padding),
    theme: presetTokens(look),
    radius: look.radius,
    ...(Object.keys(style).length > 0 ? { widgetTheme: { values: style } } : {}),
    ...(look.background ? { background: { ...look.background } } : {}),
    pages: names.map((p, i) => ({
      id: i === 0 ? MAIN_PAGE_ID : uid("page"),
      name: p.name,
      ...(p.icon ? { icon: p.icon } : {}),
      placements: (known ? placePage(layout.pages[i] ?? [], keyOf) : (layout.pages[i] ?? []).map((zone): Placed => ({ zone, at: zone.at, bound: {}, roles: {} }))).map(placement),
    })),
  };
  const wanted = layout.pages.flat().flatMap((z) => Object.values(z.roles ?? {}));
  const unbound = [...new Set(wanted)].filter((role) => keyOf(role) === undefined).map((role) => ROLE_INFO[role].label);
  return { profile, unbound };
}
