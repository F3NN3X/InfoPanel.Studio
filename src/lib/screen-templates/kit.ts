/**
 * Native screen templates as data: a starter screen the New screen gallery offers, made for any size of the shape
 * classes it fits (`shapeClassOf`: strip, wide, standard, tall), the same way the InfoPanel profile templates are.
 * A template is its look (an appearance preset's theme, radius, widget style and background, plus the zone spacing)
 * and, per shape class, a grid with each page's zones: a widget, its settings and its box on that grid. Settings that
 * name a sensor give a role instead (`roles`), found on this machine when the screen is made (`instantiate`).
 * A new template is one more file of this data in `designs/` and a line in `catalog.ts`.
 */
import type { ModuleSettings } from "@/modules/types";
import type { AppearancePreset } from "../appearance-presets";
import type { ThemeTokens } from "../theme";
import type { ShapeClass } from "../infopanel/templates/layout";
import type { Role } from "../infopanel/templates/roles";

export type { ShapeClass };

export interface Size {
  width: number;
  height: number;
}

/** A zone's box on its layout's grid: 1-based column and row, and how many of each it spans. */
export type At = readonly [col: number, row: number, cols: number, rows: number];

export interface Zone {
  /** The registry widget the zone shows (`src/widgets`). */
  module: string;
  at: At;
  settings?: ModuleSettings;
  /** Settings that hold a sensor key, by role: the key of this machine's sensor for it, left unset when none is found. */
  roles?: Readonly<Record<string, Role>>;
  /**
   * A reading that may be filled from a similar one (`fallback.ts`) when its role isn't found on this PC, and left out,
   * its neighbours taking the space, when nothing similar is found either.
   */
  spare?: boolean;
}

/** One shape class's grid and each page's zones on it, in `pages` order. */
export interface ShapeLayout {
  cols: number;
  rows: number;
  pages: readonly (readonly Zone[])[];
}

export interface TemplatePage {
  name: string;
  /** A lucide icon name (the page switcher). */
  icon?: string;
}

/**
 * The template's look, as an appearance preset holds it (the theme, the corner radius, the widget style's themed
 * keys and the page background), and the space between and around the zones in px at the class's reference size.
 */
export interface Look extends Pick<AppearancePreset, "theme" | "radius" | "style" | "background"> {
  gap: number;
  padding: number;
}

/**
 * A palette of a template: what it changes of the template's own look. The first variant of a template changes nothing
 * (the template as designed); it only names itself and gives its swatches.
 */
export interface Variant {
  id: string;
  name: string;
  /** Three colours the gallery's chip shows. */
  swatch: readonly [string, string, string];
  /** The whole theme, in place of the template's. */
  theme?: ThemeTokens;
  /** Style keys it sets over the template's. */
  style?: Look["style"];
  background?: Look["background"];
  /** Colours changed wherever a zone's settings hold them: "#rrggbb" to "#rrggbb", matched without regard to case. */
  swap?: Readonly<Record<string, string>>;
  /** Values set on every zone that has the key (a card's opacity). */
  zones?: ModuleSettings;
}

export interface ScreenTemplate {
  id: string;
  name: string;
  /** One line for the gallery. */
  blurb: string;
  /** A native version of an InfoPanel profile template (same look and content): the gallery lists it apart from the starters. */
  port?: boolean;
  /** The shape classes it looks designed for; the gallery sorts by them. Includes the class of `size`. */
  fits: readonly ShapeClass[];
  /** The size it is made for: its design's zone sizes (`scale`) are right here, and the gallery opens it at this size. */
  size: Size;
  look: Look;
  /** The pages; one "Main" when unset. */
  pages?: readonly TemplatePage[];
  /** The palettes it offers, the first being its own; none when it has only that. */
  variants?: readonly Variant[];
  /** A layout for each class in `fits`. */
  layouts: Readonly<Partial<Record<ShapeClass, ShapeLayout>>>;
}

/**
 * The size each class's layouts are designed at: the grid keeps its cells' shape at other sizes of the class
 * (`instantiate` splits columns or rows), and the spacing scales from it.
 */
export const REFERENCE: Readonly<Record<ShapeClass, Size>> = {
  strip: { width: 1920, height: 480 },
  wide: { width: 1920, height: 720 },
  standard: { width: 1920, height: 1080 },
  tall: { width: 1080, height: 1920 },
};

/** A zone: the widget, its box, its settings and the settings found by role. */
export const zone = (module: string, at: At, settings?: ModuleSettings, roles?: Zone["roles"]): Zone => ({
  module,
  at,
  ...(settings ? { settings } : {}),
  ...(roles ? { roles } : {}),
});
