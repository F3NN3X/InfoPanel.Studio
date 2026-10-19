/**
 * The gauge icons as SVG markup: the app's widget icons (lucide, a 24 px grid
 * drawn with 2 px round strokes) rendered once each and kept without their
 * outer <svg>. Browser and tests only: the dev server never draws.
 */
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { WIDGET_ICONS } from "@/lib/widget-icons";
import type { GaugeIcon } from "./vector.ts";

const cache = new Map<GaugeIcon, string>();

/** The icon's inner markup in a 24 × 24 box; "" for a name the app does not have. */
export function iconMarkup(name: GaugeIcon): string {
  let inner = cache.get(name);
  if (inner === undefined) {
    const Icon = WIDGET_ICONS[name];
    inner = Icon ? renderToStaticMarkup(createElement(Icon)).replace(/^<svg[^>]*>/, "").replace(/<\/svg>$/, "") : "";
    cache.set(name, inner);
  }
  return inner;
}
