/**
 * The InfoPanel panel sizes the New profile dialog offers, and how the gallery sorts templates by
 * the shape class of a size (`shapeClassOf`): where a template is listed, the size its thumbnail
 * is drawn at, and the preset choosing it switches to.
 */
import { shapeClassOf, type ShapeClass } from "@/lib/infopanel/templates/layout";
import type { Template } from "@/lib/infopanel/templates/kit";

export interface Size {
  width: number;
  height: number;
}

export const SIZE_PRESETS: readonly Size[] = [
  { width: 480, height: 320 },
  { width: 800, height: 480 },
  { width: 1024, height: 600 },
  { width: 1280, height: 480 },
  { width: 1920, height: 480 },
  { width: 1920, height: 540 },
  { width: 1920, height: 1080 },
  { width: 1920, height: 720 },
  { width: 1600, height: 300 },
  { width: 1280, height: 160 },
  { width: 1080, height: 240 },
  { width: 480, height: 1920 },
];

/** The index of the preset that is this size, if any. */
export const presetIndexOf = (size: Size | undefined): number | undefined => {
  const i = size ? SIZE_PRESETS.findIndex((p) => p.width === size.width && p.height === size.height) : -1;
  return i < 0 ? undefined : i;
};

/** The first preset of a class. */
export const firstPresetOf = (cls: ShapeClass): number => SIZE_PRESETS.findIndex((p) => shapeClassOf(p.width, p.height) === cls);

/** The class a template is listed under for a chosen size: that size's own when it fits, else the class it is made for. */
export const placementOf = (t: Template, sizeClass: ShapeClass): ShapeClass =>
  t.fits.includes(sizeClass) ? sizeClass : t.size ? shapeClassOf(t.size.width, t.size.height) : t.fits[0];

/** The size a template's thumbnail is drawn at in a class's section: the chosen size there, else its own shape. */
export const thumbSizeOf = (t: Template, cls: ShapeClass, sizeClass: ShapeClass, chosen: Size): Size =>
  cls === sizeClass ? chosen : t.size && shapeClassOf(t.size.width, t.size.height) === cls ? t.size : SIZE_PRESETS[firstPresetOf(cls)];

/** The preset index choosing a template switches to, or undefined when it fits the current size. */
export const presetForChoice = (t: Template, sizeClass: ShapeClass): number | undefined => {
  if (t.fits.includes(sizeClass)) return undefined;
  return presetIndexOf(t.size) ?? firstPresetOf(placementOf(t, sizeClass));
};
