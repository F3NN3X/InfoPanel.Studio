/**
 * A native screen template made into a new screen at a chosen size: the layout of the size's shape class (or the
 * nearest class the template has), its grid split so the cells keep the shape they have at the class's reference
 * size, the spacing scaled to the size, the template's look as the screen's own, and every setting given by role
 * bound to this machine's sensor for it. Zones keep their boxes exactly (a split multiplies them), so none overlap
 * or leave the grid that didn't in the template.
 */
import type { DataApiValue } from "../infopanel/sensors";
import { shapeClassOf, type ShapeClass } from "../infopanel/templates/layout";
import { ROLE_INFO, resolveRole, type Role } from "../infopanel/templates/roles";
import { presetTokens } from "../appearance-presets";
import { newProfile, uid, type MonitorProfile, type Placement } from "../layout";
import { MAIN_PAGE_ID } from "../pages";
import { sectionsWithValues, themedOf } from "../theme-model";
import { REFERENCE, type ScreenTemplate, type ShapeLayout, type Zone } from "./kit";

export interface TemplateInput {
  name: string;
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

export function instantiate(t: ScreenTemplate, input: TemplateInput): Instance {
  const cls = layoutClassOf(t, input.width, input.height);
  const layout = t.layouts[cls];
  if (!layout) throw new Error(`Template ${t.id} has no layout`);
  const { kx, ky } = splitOf(layout, cls, input.width, input.height);
  const ref = REFERENCE[cls];
  const u = Math.min(input.width / ref.width, input.height / ref.height);
  const space = (px: number) => Math.max(px > 0 ? 2 : 0, Math.round(px * Math.max(0.4, u)));

  const found = new Map<Role, string | undefined>();
  const keyOf = (role: Role) => {
    if (!found.has(role)) found.set(role, input.sensors ? resolveRole(role, input.sensors)?.key : undefined);
    return found.get(role);
  };
  const placement = (z: Zone): Placement => {
    const [col, row, cols, rows] = z.at;
    const bound = Object.entries(z.roles ?? {}).flatMap(([key, role]) => {
      const sensor = keyOf(role);
      return sensor ? [[key, sensor] as const] : [];
    });
    const settings = { ...z.settings, ...Object.fromEntries(bound) };
    // A zone's own look values (a bigger clock, its own surface) apply only in the sections it customises.
    const own = sectionsWithValues(z.settings);
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
  const style = themedOf(t.look.style);
  const profile: MonitorProfile = {
    ...base,
    cols: layout.cols * kx,
    rows: layout.rows * ky,
    // A template is drawn to fill the screen, like a kiosk strip.
    fit: "fill",
    gap: space(t.look.gap),
    padding: space(t.look.padding),
    theme: { ...presetTokens(t.look) },
    ...(t.look.radius !== undefined ? { radius: t.look.radius } : {}),
    ...(Object.keys(style).length > 0 ? { widgetTheme: { values: style } } : {}),
    ...(t.look.background ? { background: { ...t.look.background } } : {}),
    pages: names.map((p, i) => ({
      id: i === 0 ? MAIN_PAGE_ID : uid("page"),
      name: p.name,
      ...(p.icon ? { icon: p.icon } : {}),
      placements: (layout.pages[i] ?? []).map(placement),
    })),
  };
  const unbound = [...found].filter(([, key]) => key === undefined).map(([role]) => ROLE_INFO[role].label);
  return { profile, unbound };
}
