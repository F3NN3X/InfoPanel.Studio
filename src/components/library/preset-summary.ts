import { THEME_SETTINGS } from "@/modules/standard-settings";
import type { ModuleSettings } from "@/modules/types";

/** One look key of a Style, read as a person would: "Surface · Frosted". */
export interface SummaryRow {
  label: string;
  value: string;
}

const DEFS = new Map(THEME_SETTINGS.map((d) => [d.key, d]));

/** A Style's look keys as labelled rows (the setting's label and the option's label). */
export function styleRows(settings: ModuleSettings): SummaryRow[] {
  return Object.entries(settings).map(([key, raw]) => {
    const def = DEFS.get(key);
    const option = def?.options?.find((o) => o.value === raw)?.label;
    const value = option ?? (typeof raw === "boolean" ? (raw ? "On" : "Off") : raw === "" ? "Theme" : String(raw));
    return { label: def?.label ?? key, value };
  });
}
