/**
 * InfoPanel's typeface choice, ported from SkiaGraphics.CreateTypeface /
 * LoadTypeface / TryLoadTypeface / FindSimilarFont / ExtractBaseFamilyName
 * (`Drawing/SkiaGraphics.cs:296-436`).
 *
 * It runs over Skia's view of the installed fonts (family names in
 * enumeration order, each with its style names, weight, width and slant), as
 * tools/skia-fonts dumps it: DirectWrite's names cannot be derived from the
 * font files alone (style names are localized, e.g. Arial's "Normal").
 */

export type Slant = "Upright" | "Italic" | "Oblique";

export interface SkiaStyle {
  name: string;
  weight: number;
  /** SKFontStyleWidth, 1 (ultra-condensed) … 5 (normal) … 9. */
  width: number;
  slant: Slant;
}

export interface SkiaFamily {
  name: string;
  styles: SkiaStyle[];
}

export type TypefaceVia =
  | "style" // FontStyle named a style of the family
  | "family" // the family, by weight/width/slant
  | "base-family" // the family with style words stripped
  | "similar" // the first family sharing a word
  | "arial" // nothing matched
  | "default" // FontStyle given but not found: SKTypeface.CreateDefault()
  | "data-api"; // InfoPanel resolved it (font-loader.ts)

export interface Typeface extends Omit<SkiaStyle, "name"> {
  family: string;
  via: TypefaceVia;
}

export interface FontSet {
  families: SkiaFamily[];
  /** SKTypeface.CreateDefault(): Segoe UI on Windows. */
  defaultFamily: string;
}

type Want = Omit<SkiaStyle, "name">;
const SLANT_ORDER: Record<Slant, Slant[]> = {
  Upright: ["Upright", "Oblique", "Italic"],
  Italic: ["Italic", "Oblique", "Upright"],
  Oblique: ["Oblique", "Italic", "Upright"],
};

/** Weight preference order, as CSS font matching defines it. */
function weightRank(desired: number, w: number): number {
  if (w === desired) return 0;
  if (desired >= 400 && desired <= 500) {
    if (w > desired && w <= 500) return w - desired;
    if (w < desired) return 1000 + (desired - w);
    return 2000 + (w - desired);
  }
  if (desired < 400) return w < desired ? desired - w : 1000 + (w - desired);
  return w > desired ? w - desired : 1000 + (desired - w);
}

/** Width preference: narrower first when asking for normal or narrower, wider first otherwise. */
function widthRank(desired: number, w: number): number {
  if (w === desired) return 0;
  if (desired <= 5) return w < desired ? desired - w : 100 + (w - desired);
  return w > desired ? w - desired : 100 + (desired - w);
}

/** The family's closest style: width, then slant, then weight (IDWriteFontFamily::GetFirstMatchingFont). */
export function matchStyle(family: SkiaFamily, want: Want): SkiaStyle | undefined {
  const key = (s: SkiaStyle) => [
    widthRank(want.width, s.width),
    SLANT_ORDER[want.slant].indexOf(s.slant),
    weightRank(want.weight, s.weight),
  ];
  const less = (a: number[], b: number[]) => {
    const i = a.findIndex((v, k) => v !== b[k]);
    return i >= 0 && a[i] < b[i];
  };
  let best: SkiaStyle | undefined;
  for (const s of family.styles) if (!best || less(key(s), key(best))) best = s; // first wins a tie
  return best;
}

const findFamily = (fonts: FontSet, name: string) => {
  const lower = name.toLowerCase();
  return fonts.families.find((f) => f.name.toLowerCase() === lower);
};

/** SKTypeface.FromFamilyName(name, style): an unknown family gives the default one. */
function fromFamilyName(fonts: FontSet, name: string, want: Want): Omit<Typeface, "via"> {
  const family = findFamily(fonts, name) ?? findFamily(fonts, fonts.defaultFamily);
  const s = family && matchStyle(family, want);
  if (!family || !s) return { family: fonts.defaultFamily, ...want };
  // DirectWrite simulates bold for a bold request when the match is much lighter, and
  // Skia reports the requested weight (seen with Marathon Shapiro 65, weight 30 → 700).
  const simulatedBold = want.weight >= 600 && s.weight <= want.weight - 200;
  return { family: family.name, weight: simulatedBold ? want.weight : s.weight, width: s.width, slant: s.slant };
}

const ci = (a: string, b: string) => a.toLowerCase().includes(b.toLowerCase());

/** Accepts only the family asked for (or a name containing it, either way), never Segoe UI. */
function tryLoad(fonts: FontSet, name: string, want: Want): Omit<Typeface, "via"> | null {
  const t = fromFamilyName(fonts, name, want);
  return t.family.toLowerCase() !== "segoe ui" && (ci(name, t.family) || ci(t.family, name)) ? t : null;
}

const DESCRIPTORS = [
  "Ultra Compressed", "Ultra Condensed", "Compressed", "Condensed", "Extended", "Narrow", "Wide", "Black",
  "Bold", "Semibold", "Light", "Thin", "Heavy", "Medium", "Regular", "Italic", "Oblique", "BT",
];
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** ExtractBaseFamilyName: drops style words anywhere, even inside words ("Extrabold" → "Extra"). */
export function baseFamilyName(name: string): string {
  let out = name;
  for (const d of DESCRIPTORS) out = out.replace(new RegExp(`\\s*${escape(d)}\\s*`, "gi"), " ");
  return out.trim();
}

const SYMBOL_FONTS = ["Webdings", "Wingdings", "Symbol", "Marlett"];

/** DirectWrite's weight names, longest first so "SemiBold" is not read as "Bold". */
const STYLE_WEIGHTS: [string, number][] = [
  ["extrablack", 950], ["ultrablack", 950], ["extrabold", 800], ["ultrabold", 800], ["semibold", 600], ["demibold", 600],
  ["extralight", 200], ["ultralight", 200], ["semilight", 350], ["black", 900], ["heavy", 900], ["bold", 700],
  ["medium", 500], ["light", 300], ["thin", 100],
];

/**
 * The typeface by the family's own name, for the browser to find, when no font list says more (InfoPanel's
 * Data API has no font endpoints, or did not answer). A FontStyle names the style InfoPanel picks ("Bold"
 * draws bold even with Bold off); without one, Bold and Italic choose it.
 */
export function namedTypeface(fontName: string, fontStyle: string, bold: boolean, italic: boolean): Typeface {
  const style = fontStyle.toLowerCase().replace(/[\s_-]/g, "");
  if (!style) return { family: fontName, weight: bold ? 700 : 400, width: 5, slant: italic ? "Italic" : "Upright", via: "family" };
  const weight = STYLE_WEIGHTS.find(([name]) => style.includes(name))?.[1] ?? 400;
  const slant: Slant = style.includes("italic") ? "Italic" : style.includes("oblique") ? "Oblique" : "Upright";
  return { family: fontName, weight, width: 5, slant, via: "style" };
}

export function createTypeface(fonts: FontSet, fontName: string, fontStyle: string, bold: boolean, italic: boolean): Typeface {
  if (fontStyle) {
    const family = findFamily(fonts, fontName);
    const style = family?.styles.find((s) => s.name === fontStyle);
    if (family && style) return { ...fromFamilyName(fonts, fontName, style), via: "style" };
    const d = fromFamilyName(fonts, fonts.defaultFamily, { weight: 400, width: 5, slant: "Upright" });
    return { ...d, via: "default" };
  }

  let width = 5;
  if (ci(fontName, "Ultra Compressed") || ci(fontName, "Ultra Condensed")) width = 1;
  else if (ci(fontName, "Compressed") || ci(fontName, "Condensed")) width = 3;
  const want: Want = { weight: bold ? 700 : 400, width, slant: italic ? "Italic" : "Upright" };

  const direct = tryLoad(fonts, fontName, want);
  if (direct) return { ...direct, via: "family" };
  const base = baseFamilyName(fontName);
  if (base !== fontName) {
    const t = tryLoad(fonts, base, want);
    if (t) return { ...t, via: "base-family" };
  }
  const terms = fontName.split(" ").filter(Boolean);
  for (const family of fonts.families) {
    if (SYMBOL_FONTS.some((s) => ci(family.name, s))) continue;
    if (terms.some((term) => ci(family.name, term))) {
      const t = fromFamilyName(fonts, family.name, want);
      if (t.family.toLowerCase() !== "segoe ui") return { ...t, via: "similar" };
    }
  }
  return { ...fromFamilyName(fonts, "Arial", want), via: "arial" };
}
