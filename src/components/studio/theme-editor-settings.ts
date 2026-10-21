import { PALETTE_ROLES, ROLE_LABELS, THRESHOLD_QUANTITIES } from "@/lib/theme-model";
import { THEME_SETTINGS } from "@/modules/standard-settings";
import type { FormatKey, ModuleSetting } from "@/modules/types";
import { METER_BALLISTICS } from "@/widgets/registry/audio-settings";
import { formatSetting, thresholdSetting } from "@/widgets/registry/settings-kit";

/**
 * The rows of the theme editor (SPEC §7): every themed key a screen, a
 * page or All screens sets. Style = the look sections (the CSS
 * row out of More: it is the section) and Status & series colors (the
 * palette roles); Data = Units & format, all four rows; Behaviour =
 * Thresholds of every quantity and Motion. Each row files itself by
 * `section`, so `categorize` orders them as a widget's.
 */

const FORMAT_KEYS: readonly FormatKey[] = ["tempUnit", "rateUnit", "decimals", "clock"];

/** One colour per palette role, Auto ("") = each widget's own colour. */
const ROLE_SETTINGS: ModuleSetting[] = PALETTE_ROLES.map((role) => ({
  key: role,
  label: ROLE_LABELS[role],
  type: "color",
  default: "",
  keywords: ["palette", "series", "status", "role"],
  section: "palette",
}));

export const THEME_EDITOR_SETTINGS: ModuleSetting[] = [
  ...THEME_SETTINGS.map((d) => ({ ...d, ...(d.section === "css" ? { more: false } : {}) })),
  ...ROLE_SETTINGS,
  ...FORMAT_KEYS.map((key) => formatSetting(key)),
  ...THRESHOLD_QUANTITIES.map((q) => thresholdSetting(q)),
  METER_BALLISTICS,
];

/** The palette section's title in the theme editor (a widget's is "Widget colors"). */
export const STATUS_COLORS_TITLE = "Status & series colors";
