import { decimalsOf, levelOf } from "@/modules/setting-readers";
import type { ModuleSettings, ThresholdQuantity } from "@/modules/types";
import type { ItemLevel, ItemSection, Widget } from "./panel-model";
import { critKey, OFF, warnKey, type SectionFlags } from "./theme-model";

/**
 * How a panel widget's followable sections resolve (SPEC §8): the chain is
 * widget → panel → page → profile. A widget section that follows takes the
 * panel's look — the panel's resolved settings (`resolveStyle`), which hold
 * what the theme levels set — and a custom one its own values over it. A
 * section the profile locks always follows. Pure: the renderer
 * (`PanelView`) and the item inspector read the same rules.
 */

/** The widget's own fields of each section (the per-widget rows — unit, maximum, multiply by — always apply). */
export const ITEM_SECTION_FIELDS: Readonly<Record<ItemSection, readonly (keyof Widget)[]>> = {
  type: ["fontSize", "align"],
  colors: ["color"],
  format: ["decimals"],
  thresholds: ["thr"],
};

/** Whether a widget has own values in a section. */
export const itemHasOwn = (w: Widget, sec: ItemSection): boolean => ITEM_SECTION_FIELDS[sec].some((f) => w[f] !== undefined);

/**
 * Whether a widget section follows its panel: its flag, else while it has
 * no own values there (a widget saved before the flags existed keeps its
 * own values applying); always while the profile locks the section.
 */
export function itemFollows(w: Widget, sec: ItemSection, locks?: SectionFlags): boolean {
  if (locks?.[sec] === true) return true;
  return w.follow?.[sec] ?? !itemHasOwn(w, sec);
}

/** The widget with one section following its panel or custom (its own values stay stored either way). */
export const withItemFollow = (w: Widget, sec: ItemSection, follows: boolean): Widget => ({
  ...w,
  follow: { ...w.follow, [sec]: follows },
});

/**
 * The quantity a widget's thresholds measure, from its bound sensor's unit
 * (owner decision): % = load, a degree sign = temperature, else value.
 */
export function itemQuantity(unit: string | undefined): ThresholdQuantity {
  const u = (unit ?? "").trim();
  if (u.startsWith("%")) return "load";
  if (u.startsWith("°")) return "temp";
  return "value";
}

export interface ItemLevels {
  warn: ItemLevel;
  crit: ItemLevel;
}

/**
 * A widget's warning and critical levels for a quantity. Following: the
 * panel's (what a theme level sets for the quantity), else off — the theme
 * defaults are not drawn, so a panel that never had thresholds looks the
 * same. Custom: its own levels, each unset one the panel's.
 */
export function itemLevels(w: Widget, look: ModuleSettings, q: ThresholdQuantity, locks?: SectionFlags): ItemLevels {
  const panel: ItemLevels = { warn: levelOf(look[warnKey(q)]) ?? OFF, crit: levelOf(look[critKey(q)]) ?? OFF };
  if (itemFollows(w, "thresholds", locks)) return panel;
  return { warn: w.thr?.warn ?? panel.warn, crit: w.thr?.crit ?? panel.crit };
}

/** Where a value sits against the levels ("off" never trips). */
export function itemTone(value: number | undefined, levels: ItemLevels): "ok" | "warn" | "crit" {
  if (value === undefined || !Number.isFinite(value)) return "ok";
  if (levels.crit !== OFF && value >= levels.crit) return "crit";
  if (levels.warn !== OFF && value >= levels.warn) return "warn";
  return "ok";
}

/** Drop some fields (unchanged when none is set). */
function without(w: Widget, fields: readonly (keyof Widget)[]): Widget {
  if (fields.every((f) => w[f] === undefined)) return w;
  return Object.fromEntries(Object.entries(w).filter(([key]) => !fields.includes(key as keyof Widget))) as unknown as Widget;
}

/**
 * The widget as it draws in its panel (`look`: the panel's resolved
 * settings): a following Typography or Color drops the own values (the
 * panel's font and colour tokens show), Units & format takes the panel's
 * decimals (a custom one its own, else the panel's). Thresholds are read
 * with the live value (`itemLevels`). A locked Colors is `enforcedPanel`'s
 * (own fill colours give way to the accent), so it is not read here.
 */
export function resolvedItem(w: Widget, look: ModuleSettings, locks?: SectionFlags): Widget {
  let out = w;
  if (itemFollows(w, "type", locks)) out = without(out, ITEM_SECTION_FIELDS.type);
  if (itemFollows(w, "colors")) out = without(out, ITEM_SECTION_FIELDS.colors);
  const decimals = itemFollows(w, "format", locks) ? decimalsOf(look) : (w.decimals ?? decimalsOf(look));
  if (decimals !== out.decimals) out = decimals === undefined ? without(out, ["decimals"]) : { ...out, decimals };
  return out;
}
