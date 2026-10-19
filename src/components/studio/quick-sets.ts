import type { Placement } from "@/lib/layout";
import { STANDARD_KEYS } from "@/modules/standard-settings";
import { isMore, type ModuleSetting } from "@/modules/types";
import { pinsOf } from "./inspector/inspector-prefs";
import { sharedDefs } from "./inspector-model";

/**
 * A widget type's default quick set (the quick bar before the user pins
 * anything): Density and Accent when it has them, then its first two own
 * settings that fit a compact control (toggle, choice, number, colour).
 * Up to four keys. Pins replace it per type (`inspector-prefs`).
 */

/** Setting types the quick bar shows as a compact control (an alignment as its cell, the spread stays). */
export const QUICK_TYPES: ReadonlySet<string> = new Set(["boolean", "select", "number", "color", "align"]);

/** Whether a setting can sit in the quick bar. */
export const quickable = (def: ModuleSetting): boolean =>
  QUICK_TYPES.has(def.type) && !def.multiple && (!def.keyY || def.type === "align") && !def.optionsFrom;

export function defaultQuickKeys(defs: readonly ModuleSetting[]): string[] {
  const has = (key: string) => defs.some((d) => d.key === key);
  const own = defs
    .filter((d) => quickable(d) && !isMore(d) && !STANDARD_KEYS.has(d.key))
    .slice(0, 2)
    .map((d) => d.key);
  return [...(has("sizeTier") ? ["sizeTier"] : []), ...(has("accent") ? ["accent"] : []), ...own].slice(0, 4);
}

/** The pins' key for a zone: its widget type, or one shared by every panel. */
export const pinTypeOf = (zone: Pick<Placement, "module" | "panel">): string => (zone.panel ? "panel" : zone.module);

/**
 * The settings the quick bar shows for a selection: each zone type's pins
 * (or its default set), only those every selected type pinned, in the first
 * zone's order, that exist on every selected zone and fit a compact control.
 */
export function quickDefsFor(
  zones: readonly Placement[],
  pins: Record<string, string[]>,
  defsOf: (zone: Placement) => ModuleSetting[]
): ModuleSetting[] {
  if (zones.length === 0) return [];
  const pinned = zones.map((z) => pinsOf(pins, pinTypeOf(z), defaultQuickKeys(defsOf(z))));
  const shared = sharedDefs(zones.map(defsOf));
  return pinned[0]
    .filter((key) => pinned.every((keys) => keys.includes(key)))
    .flatMap((key) => shared.filter((d) => d.key === key && quickable(d)));
}
