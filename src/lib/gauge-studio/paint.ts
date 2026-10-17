/** A gauge colour is #RRGGBB or a theme colour name that follows the dashboard theme (spec §6, Fill). */
import { isThemeColor, THEME, type Paint, type ThemeColor } from "@/lib/infopanel/gauges/vector";

export const THEME_COLORS = Object.keys(THEME) as ThemeColor[];

const HEX = /^#[0-9a-f]{6}$/i;

/** The fixed colour to start from when a theme colour is made custom (a translucent track has none: white). */
export function customOf(paint: Paint): string {
  if (!isThemeColor(paint)) return paint;
  return HEX.test(THEME[paint].hex) ? THEME[paint].hex : "#FFFFFF";
}

/** The theme colour to follow when a fixed one is turned to follow the theme (the accent). */
export const followOf = (paint: Paint): Paint => (isThemeColor(paint) ? paint : "accent");

export const follows = (paint: Paint): boolean => isThemeColor(paint);
