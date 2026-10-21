import { presetMatches } from "@/components/studio/appearance-actions";
import type { AppearancePreset } from "@/lib/appearance-presets";
import type { DashboardConfig } from "@/lib/layout";
import { resolveTheme } from "@/lib/theme";
import { THEME_SETTINGS } from "@/modules/standard-settings";
import type { ModuleSettings } from "@/modules/types";

/** One look key of a Theme or Style, read as a person would: "Surface · Glass". */
export interface SummaryRow {
  label: string;
  value: string;
}

const DEFS = new Map(THEME_SETTINGS.map((d) => [d.key, d]));

/** A Style's or Theme's look keys as labelled rows (the setting's label and the option's label). */
export function styleRows(settings: ModuleSettings): SummaryRow[] {
  return Object.entries(settings).map(([key, raw]) => {
    const def = DEFS.get(key);
    const option = def?.options?.find((o) => o.value === raw)?.label;
    const value = option ?? (typeof raw === "boolean" ? (raw ? "On" : "Off") : raw === "" ? "Theme" : String(raw));
    return { label: def?.label ?? key, value };
  });
}

/** The screens whose look is a saved Theme: its colours, corners and widget style (a screen's own over All screens'). */
export function themeUsedBy(config: DashboardConfig, preset: AppearancePreset): string[] {
  return config.profiles
    .filter((p) => {
      const { tokens, radius } = resolveTheme(config, p);
      return presetMatches(preset, { tokens, radius, style: { ...config.style, ...p.widgetTheme?.values } });
    })
    .map((p) => p.name);
}
