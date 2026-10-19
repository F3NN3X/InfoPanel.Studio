/** How the Gauges page draws a gauge on the dashboard theme (spec §6: "Theme colours follow '<theme>'"). */
import { THEME_PRESETS, type ThemeTokens } from "@/lib/theme";

/** The theme's preset name, or null for a custom palette. */
export function themeNameOf(tokens: Pick<ThemeTokens, "accent" | "foreground">): string | null {
  return THEME_PRESETS.find((t) => t.tokens.accent === tokens.accent && t.tokens.foreground === tokens.foreground)?.label ?? null;
}

/** The widget variable a gauge's theme colours read, from the dashboard theme (the rest are the dark-surface values). */
export const previewScope = (tokens: Pick<ThemeTokens, "accent">): Record<string, string> => ({ "--accent": `hsl(${tokens.accent})` });
