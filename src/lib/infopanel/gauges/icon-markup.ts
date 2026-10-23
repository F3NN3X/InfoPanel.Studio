/**
 * The gauge icons as SVG markup: the app's widget icons (lucide, a 24 px grid
 * drawn with 2 px round strokes) without their outer <svg>. The markup is
 * generated ahead of time (tools/gen-gauge-icons.mjs), so the kiosk bundle
 * carries strings instead of React's server renderer.
 */
import { GAUGE_ICON_MARKUP } from "./icon-markup.generated.ts";
import type { GaugeIcon } from "./vector.ts";

/** The icon's inner markup in a 24 × 24 box; "" for a name the app does not have. */
export function iconMarkup(name: GaugeIcon): string {
  return Object.hasOwn(GAUGE_ICON_MARKUP, name) ? GAUGE_ICON_MARKUP[name] : "";
}
