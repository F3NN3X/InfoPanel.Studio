import type { LookVariant } from "@/looks/look";
import { MATERIALS } from "@/looks/materials";
import { sampleCards } from "@/looks/sample-cards";
import { isLocked, type SectionId, type ThemeLevels } from "@/lib/theme-model";
import { SURFACE_OPTIONS } from "@/modules/standard-settings";
import type { ModuleSettings, ModuleSettingValue } from "@/modules/types";
import type { LookValues } from "./inspector-model";

/**
 * The Look knobs (D15, investigation 7 F5): the few values a user changes on top of a Look, in the Theme view and the
 * widget inspector. Each knob writes cascade keys at the level (or widget) it edits and shows "Custom" while that holds
 * a value of its own that differs from the Look's; Reset clears the keys, so the Look's value shows again. Align and
 * Size are layout, not knobs. Mode shows for a Look that supports light (P6), Variant for a Look that has variants. Pure.
 */

export type KnobId = "accent" | "mode" | "surface" | "corners" | "density";

/** The keys each knob moves (Surface moves the card with its opacity and blur, D15). */
export const KNOB_KEYS: Readonly<Record<KnobId, readonly string[]>> = {
  accent: ["accent"],
  mode: ["surface"],
  surface: ["surface", "surfaceOpacity", "blur"],
  corners: ["radius"],
  density: ["padding", "gap"],
};

/** The order and names the knob row shows. */
export const KNOBS: readonly { id: KnobId; label: string }[] = [
  { id: "accent", label: "Accent" },
  { id: "mode", label: "Mode" },
  { id: "surface", label: "Surface" },
  { id: "corners", label: "Corners" },
  { id: "density", label: "Density" },
];

/** A value stored where the knob edits, if it applies there (a widget's own value of a following section does not). */
const ownValue = (values: LookValues, key: string): ModuleSettingValue | undefined =>
  values.applies && !values.applies(key) ? undefined : values.own?.[key];

/** The value a key shows: the own one where it applies, else what the level inherits (the Look's included). */
export const knobValue = (values: LookValues, key: string): ModuleSettingValue | undefined => ownValue(values, key) ?? values.inherited?.[key];

/**
 * Whether a knob is Custom: a key it moves holds an own value that is not what the level shows without it (`look`,
 * by default what it inherits: the Look layer as the renderer resolves it for that level, so Reset shows that value).
 */
export function knobCustom(values: LookValues, id: KnobId, look: ModuleSettings | undefined = values.inherited): boolean {
  return KNOB_KEYS[id].some((key) => {
    const own = ownValue(values, key);
    return own !== undefined && own !== look?.[key];
  });
}

/** The accent swatches: the six studio hues (the colour fields' own set); any other colour is the custom picker's. */
export const ACCENTS: readonly { value: string; name: string }[] = [
  { value: "#5fa7ff", name: "Blue" },
  { value: "#ac8ff8", name: "Violet" },
  { value: "#00c1b9", name: "Teal" },
  { value: "#53be70", name: "Green" },
  { value: "#da950b", name: "Amber" },
  { value: "#f37986", name: "Rose" },
];

export type KnobMode = "dark" | "light";

/** The Mode chips. */
export const MODES: readonly { id: KnobMode; label: string }[] = [
  { id: "dark", label: "Dark" },
  { id: "light", label: "Light" },
];

/** The card a mode draws when it is not the Look's own: the app's matte materials. */
const MODE_SURFACE: Readonly<Record<KnobMode, string>> = { dark: "matte-dark", light: "matte-light" };

/**
 * The mode the level shows (D3): the tone of the card it stores (any material), `native` (the Look's own mode) while it stores none or the
 * Look's card; undefined on the theme card, which follows the page.
 */
export function modeOf(values: LookValues, native: KnobMode): KnobMode | undefined {
  const surface = knobValue(values, "surface");
  if (surface === "theme") return undefined;
  const tone = typeof surface === "string" ? (MATERIALS[surface] ?? sampleCards[surface])?.tone : undefined;
  return tone === "light" || tone === "dark" ? tone : native;
}

/** Whether Mode is Custom: it shows a mode other than the Look's own. */
export const modeCustom = (values: LookValues, native: KnobMode): boolean => {
  const own = ownValue(values, "surface");
  return own !== undefined && modeOf(values, native) !== native;
};

/** The values a mode chip writes: nothing stored for the Look's own mode, else that mode's matte card. */
export const modePatch = (mode: KnobMode, native: KnobMode): ModuleSettings => (mode === native ? {} : { surface: MODE_SURFACE[mode] });

/** The app materials' names in a chip (the Surface row's are longer). */
const SHORT: Readonly<Record<string, string>> = { "matte-light": "Light", "matte-dark": "Dark", theme: "Theme" };

/** The Surface chips: the Look's own card (no value stored) and the app's four materials; the rest stay in Advanced. */
export const SURFACES: readonly { value: string; label: string; name: string }[] = [
  { value: "", label: "Theme's own", name: "The theme's own" },
  ...SURFACE_OPTIONS.slice(0, 4).map((o) => ({ value: o.value, label: SHORT[o.value] ?? o.label, name: o.label })),
];

/** The chip the Surface knob shows checked: the level's own card, "" (the Look's) when it stores none or the Look's own (`look-<id>`, L44). */
export function surfaceChip(values: LookValues): string {
  const own = ownValue(values, "surface");
  return typeof own === "string" && own !== `look-${knobValue(values, "lookId")}` ? own : "";
}

/** The section each knob writes: a page or widget can't change a knob whose section its screen locks. */
const KNOB_SECTION: Readonly<Record<KnobId, SectionId>> = { accent: "colors", mode: "surface", surface: "surface", corners: "spacing", density: "spacing" };

/** The knobs a screen's locks hold, with the reason their tooltip gives. */
export function lockedKnobs(levels: ThemeLevels, screen: string): Partial<Record<KnobId, string>> {
  return Object.fromEntries(KNOBS.filter((k) => isLocked(levels, KNOB_SECTION[k.id])).map((k) => [k.id, `Locked by ${screen}`]));
}

/** The corner steps of the slider (px; "auto" is the Look's). */
export const CORNER_STEPS: readonly number[] = [0, 4, 8, 12, 16, 20, 28];

/** The nearest corner step to a stored radius ("auto" and unknown values: none). */
export function cornerStep(value: ModuleSettingValue | undefined): number | undefined {
  const px = Number(value);
  if (value === undefined || value === "auto" || value === "" || !Number.isFinite(px)) return undefined;
  return CORNER_STEPS.reduce((best, step, i) => (Math.abs(step - px) < Math.abs(CORNER_STEPS[best] - px) ? i : best), 0);
}

export type Density = "compact" | "normal" | "roomy";

/** Density sets the inner padding and the gap between items together; Normal is the Look's (no value stored). */
export const DENSITIES: readonly { id: Density; label: string; values: ModuleSettings }[] = [
  { id: "compact", label: "Compact", values: { padding: "4", gap: "4" } },
  { id: "normal", label: "Normal", values: {} },
  { id: "roomy", label: "Roomy", values: { padding: "16", gap: "16" } },
];

/** The density the values show; "custom" when padding and gap match none of the three. */
export function densityOf(values: LookValues): Density | "custom" {
  const pad = knobValue(values, "padding");
  const gap = knobValue(values, "gap");
  const at = (v: ModuleSettingValue | undefined) => (v === undefined || v === "auto" ? undefined : String(v));
  const hit = DENSITIES.find((d) => at(pad) === (d.values.padding as string | undefined) && at(gap) === (d.values.gap as string | undefined));
  return hit?.id ?? "custom";
}

/** The keys a Look's variants set, once each: what the Variant knob's Reset clears. */
export const variantKeys = (variants: readonly LookVariant[]): string[] => [...new Set(variants.flatMap((v) => Object.keys(v.values)))];

/**
 * The variant the values show: the first whose every value they show; "" (the Look's own) while the level holds none of
 * the variants' keys of its own; undefined (Custom) when it holds some that match no variant.
 */
export function variantOf(values: LookValues, variants: readonly LookVariant[]): string | undefined {
  const shows = (v: LookVariant) => Object.entries(v.values).every(([key, value]) => String(knobValue(values, key) ?? "").toLowerCase() === value.toLowerCase());
  const hit = variants.find((v) => Object.keys(v.values).length > 0 && shows(v));
  if (hit) return hit.id;
  return variantKeys(variants).some((key) => ownValue(values, key) !== undefined) ? undefined : "";
}

/** Whether Variant is Custom: a key of the variants holds an own value that differs from what the level inherits. */
export const variantCustom = (values: LookValues, variants: readonly LookVariant[]): boolean =>
  variantKeys(variants).some((key) => {
    const own = ownValue(values, key);
    return own !== undefined && own !== values.inherited?.[key];
  });

/** The knobs whose keys a variant writes: Variant is read-only while the screen locks any of them. */
export const variantKnobs = (variants: readonly LookVariant[]): KnobId[] => {
  const keys = variantKeys(variants);
  return KNOBS.filter((k) => k.id !== "mode" && KNOB_KEYS[k.id].some((key) => keys.includes(key))).map((k) => k.id);
};
