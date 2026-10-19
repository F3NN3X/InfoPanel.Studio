import { THEME_SETTINGS } from "@/modules/standard-settings";
import { ALIGN_CODES } from "@/modules/setting-readers";
import { migrateStyleV7 } from "./settings-migrate";
import { THEMED_KEYS } from "./theme-model";
import type { ModuleSetting, ModuleSettings } from "@/modules/types";
import { color, normalizeBackground, type PageBackground } from "./appearance";
import { DEFAULT_THEME, THEME_PRESETS, type ThemePresetName, type ThemeTokens } from "./theme";

/**
 * Appearance presets — a whole dashboard look in one click: theme colours
 * and corner radius (dashboard-wide), the global widget style (the themed
 * keys, `THEMED_KEYS`) and optionally a page background. They are
 * the user's saved looks, in `config.appearancePresets`. Applying
 * one is `applyAppearancePreset` (appearance-preset-apply.ts).
 *
 * Not to be confused with a widget's style presets (`config.stylePresets`,
 * the inspector's "Style presets"), which restyle one widget.
 */

export interface AppearancePreset {
  id: string;
  name: string;
  /** One line for the gallery card. */
  description: string;
  /** Theme tokens, or the name of a built-in theme preset (theme.ts). */
  theme: ThemeTokens | ThemePresetName;
  /** Theme corner radius in rem (`config.radius`). */
  radius: number;
  /** The global style: themed keys only (a stored preset's others are dropped on load). */
  style: ModuleSettings;
  /** A suggested page background (complete, as stored on the config). */
  background?: PageBackground;
}

/**
 * The `builtin:` id prefix is reserved: the built-in looks were replaced by the
 * skin gallery, and stored presets may never take one of their ids.
 */
export const isBuiltinPreset = (id: string): boolean => id.startsWith("builtin:");

/** A preset's theme tokens (a named theme resolved). */
export function presetTokens(preset: Pick<AppearancePreset, "theme">): ThemeTokens {
  if (typeof preset.theme !== "string") return preset.theme;
  return THEME_PRESETS.find((p) => p.name === preset.theme)?.tokens ?? DEFAULT_THEME;
}

/* ---------------- validation ---------------- */

const STYLE_DEFS = new Map<string, ModuleSetting>(
  THEME_SETTINGS.flatMap((d) => (d.keyY ? [[d.key, d], [d.keyY, d]] : [[d.key, d]]))
);
const ALIGN: readonly string[] = ["auto", ...ALIGN_CODES];

/** Whether a value is one the look setting `key` offers. */
export function isValidStyleValue(key: string, value: unknown): boolean {
  const def = STYLE_DEFS.get(key);
  if (!def || !THEMED_KEYS.has(key)) return false;
  switch (def.type) {
    case "select":
      return typeof value === "string" && (def.options ?? []).some((o) => o.value === value);
    case "number":
      return (
        typeof value === "number" &&
        Number.isFinite(value) &&
        (def.min === undefined || value >= def.min) &&
        (def.max === undefined || value <= def.max)
      );
    case "color":
      return value === "" || color(value) !== undefined;
    case "boolean":
      return typeof value === "boolean";
    case "align":
      // The cell code, and the spread toggle as its second key.
      return key === def.keyY ? typeof value === "boolean" : typeof value === "string" && ALIGN.includes(value);
    default:
      return typeof value === "string";
  }
}

/** The keys of a style that aren't valid look values (empty = all valid). */
export function invalidStyleKeys(style: ModuleSettings): string[] {
  return Object.entries(style)
    .filter(([key, value]) => !isValidStyleValue(key, value))
    .map(([key]) => key);
}

/* ---------------- stored presets ---------------- */

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

const THEME_NAMES = new Set<string>(THEME_PRESETS.map((p) => p.name));

function theme(v: unknown): AppearancePreset["theme"] | undefined {
  if (typeof v === "string") return THEME_NAMES.has(v) ? (v as ThemePresetName) : undefined;
  if (!isObject(v)) return undefined;
  const tokens = Object.entries(v).filter(
    ([key, value]) => key in DEFAULT_THEME && typeof value === "string" && value.length <= 64
  );
  return { ...DEFAULT_THEME, ...Object.fromEntries(tokens) };
}

function preset(v: unknown): AppearancePreset | undefined {
  if (!isObject(v) || typeof v.id !== "string" || !v.id || isBuiltinPreset(v.id)) return undefined;
  if (typeof v.name !== "string" || !v.name.trim()) return undefined;
  const t = theme(v.theme);
  if (!t) return undefined;
  // A preset saved before config v7 still names the alignment's two axes.
  const style = isObject(v.style)
    ? Object.fromEntries(Object.entries(migrateStyleV7(v.style as ModuleSettings)).filter(([key, value]) => isValidStyleValue(key, value)))
    : {};
  const radius = typeof v.radius === "number" && Number.isFinite(v.radius) ? Math.min(2, Math.max(0, v.radius)) : 0.5;
  const background = normalizeBackground(v.background);
  return {
    id: v.id,
    name: v.name.trim().slice(0, 80),
    description: typeof v.description === "string" ? v.description.slice(0, 200) : "",
    theme: t,
    radius,
    style: style as ModuleSettings,
    ...(background ? { background } : {}),
  };
}

/**
 * Keep the usable user presets of stored or imported input: id, name and
 * a theme are required; look values that aren't valid options are
 * dropped, the background normalized. No list = `undefined`.
 */
export function normalizeAppearancePresets(v: unknown): AppearancePreset[] | undefined {
  if (!Array.isArray(v)) return undefined;
  const kept = v.map(preset).filter((p): p is AppearancePreset => p !== undefined);
  return kept.length > 0 ? kept : undefined;
}
