/**
 * The panel sizes the New profile and New screen dialogs offer, and how their galleries sort templates by the shape
 * class of a size (`shapeClassOf`): where a template is listed, the size its thumbnail is drawn at, and the preset
 * choosing it switches to. Any template with `fits` and a `size` sorts here, the InfoPanel profile templates and the
 * native screen templates alike.
 */
import { shapeClassOf, type ShapeClass } from "@/lib/infopanel/templates/layout";

export interface Size {
  width: number;
  height: number;
}

/** What the sorting reads of a template: the classes it looks designed for and the size it is made for. */
export interface Fitting {
  fits: readonly ShapeClass[];
  size?: Size;
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
  // Added after the first of each class, so a class's first preset stays the one above.
  { width: 1920, height: 440 },
  { width: 1280, height: 400 },
  { width: 480, height: 800 },
  { width: 600, height: 1024 },
  { width: 1080, height: 1920 },
];

/** The index of the preset that is this size, if any. */
export const presetIndexOf = (size: Size | undefined): number | undefined => {
  const i = size ? SIZE_PRESETS.findIndex((p) => p.width === size.width && p.height === size.height) : -1;
  return i < 0 ? undefined : i;
};

/** The first preset of a class. */
export const firstPresetOf = (cls: ShapeClass): number => SIZE_PRESETS.findIndex((p) => shapeClassOf(p.width, p.height) === cls);

/** The class a template is listed under for a chosen size: that size's own when it fits, else the class it is made for. */
export const placementOf = (t: Fitting, sizeClass: ShapeClass): ShapeClass =>
  t.fits.includes(sizeClass) ? sizeClass : t.size ? shapeClassOf(t.size.width, t.size.height) : t.fits[0];

/** The size a template's thumbnail is drawn at in a class's section: its own when that is of the class, else the chosen size there, else the class's first preset. */
export const thumbSizeOf = (t: Fitting, cls: ShapeClass, sizeClass: ShapeClass, chosen: Size): Size =>
  t.size && shapeClassOf(t.size.width, t.size.height) === cls ? t.size : cls === sizeClass ? chosen : SIZE_PRESETS[firstPresetOf(cls)];

/**
 * The preset index choosing a template switches to: its own size's; without a size of its own, the first preset of
 * its class when it doesn't fit the current size. Undefined keeps the size, or (a size of its own that isn't a
 * preset) leaves it to the caller to type in.
 */
export const presetForChoice = (t: Fitting, sizeClass: ShapeClass): number | undefined => {
  const own = presetIndexOf(t.size);
  if (own !== undefined || t.size || t.fits.includes(sizeClass)) return own;
  return firstPresetOf(placementOf(t, sizeClass));
};
