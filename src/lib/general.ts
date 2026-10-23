/**
 * The Dashboard settings — dashboard-wide preferences that aren't a look: the
 * page font, how clocks read (seconds, date locale), motion and the kiosk
 * cursor. Stored on `DashboardConfig.general` with only the changed keys;
 * `resolveGeneral` fills the defaults. The 12 / 24 h choice is the themed
 * `clock` of the all-profiles style since config v7 (owner decision Q4).
 */

import { ensureFont, FONT_CATALOG, FONT_IDS, fontById, type FontId } from "@/lib/fonts";
import { isMaxFps } from "@/lib/performance";
import { hour12Of } from "@/modules/setting-readers";
import type { ModuleSettings } from "@/modules/types";

export type GeneralFont = FontId;
export type MotionChoice = "system" | "reduce" | "full";
export type KioskRefresh = "daily" | "off";

export interface GeneralSettings {
  /** The page font every widget's "Theme" (auto) font inherits ("system" = the browser's). */
  font?: GeneralFont;
  /** Clocks show seconds (default on). */
  showSeconds?: boolean;
  /** BCP 47 locale for dates and times; "" / unset = the system's. */
  locale?: string;
  /** Animations: follow the OS setting, or always reduce / always run. */
  motion?: MotionChoice;
  /** Most frames a second animations redraw: 5, 15, 30, 60 (default) or 0 for every display frame. */
  maxFps?: number;
  /** Hide the mouse cursor on kiosk pages. */
  hideCursor?: boolean;
  /** Kiosk page dots and swipe between a profile's pages (default off). */
  kioskPageNav?: boolean;
  /** Kiosk pages reload once a day around 04:00 to give back memory (default daily). */
  kioskRefresh?: KioskRefresh;
  /** Rings ease to each new reading (default off: they step). */
  ringGlide?: boolean;
  /** Cap a widget's blur at 12 px (default on). */
  blurLimit?: boolean;
  /** Badges and cards inside a widget blur what is behind them (default off). */
  innerBlur?: boolean;
  /** A graph's glow is a filter redrawn with the line (default off: a static glow under it). */
  liveGlow?: boolean;
}

/** GeneralSettings with every default filled, and the clocks' 12-hour switch (undefined: the locale's choice). */
export interface ResolvedGeneral {
  font: GeneralFont;
  hour12: boolean | undefined;
  showSeconds: boolean;
  locale: string;
  motion: MotionChoice;
  maxFps: number;
  hideCursor: boolean;
  kioskPageNav: boolean;
  kioskRefresh: KioskRefresh;
  ringGlide: boolean;
  blurLimit: boolean;
  innerBlur: boolean;
  liveGlow: boolean;
}

export const GENERAL_DEFAULTS: ResolvedGeneral = {
  font: "system",
  hour12: undefined,
  showSeconds: true,
  locale: "",
  motion: "system",
  maxFps: 60,
  hideCursor: false,
  kioskPageNav: false,
  kioskRefresh: "daily",
  ringGlide: false,
  blurLimit: true,
  innerBlur: false,
  liveGlow: false,
};

/** CSS font stacks for the font choices (also the widget style's Font option). */
export const FONT_STACKS: Record<Exclude<GeneralFont, "system">, string> = Object.fromEntries(
  FONT_CATALOG.flatMap((f) => ("stack" in f ? [[f.id, f.stack]] : []))
) as Record<Exclude<GeneralFont, "system">, string>;

const FONTS: readonly GeneralFont[] = FONT_IDS;
const MOTIONS: readonly MotionChoice[] = ["system", "reduce", "full"];
const RENDERING_KEYS = ["ringGlide", "blurLimit", "innerBlur", "liveGlow"] as const;
const KIOSK_REFRESHES: readonly KioskRefresh[] = ["daily", "off"];

/**
 * The font-family for a choice; undefined = the page's own ("system").
 * Also makes sure a web font's stylesheet is loading (idempotent).
 */
export function fontStack(font: GeneralFont): string | undefined {
  ensureFont(font);
  return fontById(font)?.stack;
}

/** Whether the runtime can format dates in this locale ("" = the system's). */
export function isSupportedLocale(locale: string): boolean {
  if (locale === "") return true;
  try {
    return Intl.DateTimeFormat.supportedLocalesOf([locale]).length > 0;
  } catch {
    return false; // not a well-formed language tag
  }
}

/** A stored font choice, or undefined when it is not one the catalog knows. */
export const normalizeFont = (v: unknown): GeneralFont | undefined => (FONTS.includes(v as GeneralFont) ? (v as GeneralFont) : undefined);

/**
 * The page font a screen shows (SPEC §11.1): its own when set, else the
 * dashboard's (`general.font`, the All screens value), like `resolveTheme`.
 */
export const resolveFont = (general: Pick<ResolvedGeneral, "font">, profile?: { font?: GeneralFont }): GeneralFont =>
  profile?.font ?? general.font;

/** The settings with defaults filled; the 12-hour switch from the all-profiles style's `clock` (auto | 24 | 12). */
export function resolveGeneral(config: { general?: GeneralSettings; style?: ModuleSettings }): ResolvedGeneral {
  return { ...GENERAL_DEFAULTS, ...config.general, hour12: hour12Of(config.style?.clock) };
}

/** Whether the locale writes times with a 12-hour clock ("" = the system's). */
export function localeHour12(locale: string): boolean {
  try {
    return new Intl.DateTimeFormat(locale || undefined, { hour: "numeric" }).resolvedOptions().hour12 === true;
  } catch {
    return false;
  }
}

/**
 * A stored `general` value, keeping only valid keys (an unknown font,
 * an unsupported locale, ... are dropped); undefined when nothing is left.
 */
export function normalizeGeneral(input: unknown): GeneralSettings | undefined {
  if (typeof input !== "object" || input === null || Array.isArray(input)) return undefined;
  const v = input as Record<string, unknown>;
  const out: GeneralSettings = {};
  const font = normalizeFont(v.font);
  if (font) out.font = font;
  if (typeof v.showSeconds === "boolean") out.showSeconds = v.showSeconds;
  if (typeof v.locale === "string" && isSupportedLocale(v.locale.trim())) out.locale = v.locale.trim();
  if (MOTIONS.includes(v.motion as MotionChoice)) out.motion = v.motion as MotionChoice;
  if (isMaxFps(v.maxFps)) out.maxFps = v.maxFps;
  if (typeof v.hideCursor === "boolean") out.hideCursor = v.hideCursor;
  if (typeof v.kioskPageNav === "boolean") out.kioskPageNav = v.kioskPageNav;
  if (KIOSK_REFRESHES.includes(v.kioskRefresh as KioskRefresh)) out.kioskRefresh = v.kioskRefresh as KioskRefresh;
  for (const key of RENDERING_KEYS) if (typeof v[key] === "boolean") out[key] = v[key];
  return Object.keys(out).length > 0 ? out : undefined;
}

/** `general` with one key set (undefined clears it back to the default). */
export function withGeneral<K extends keyof GeneralSettings>(
  general: GeneralSettings | undefined,
  key: K,
  value: GeneralSettings[K]
): GeneralSettings | undefined {
  const rest = Object.fromEntries(Object.entries(general ?? {}).filter(([k]) => k !== key)) as GeneralSettings;
  const next: GeneralSettings = value === undefined ? rest : { ...rest, [key]: value };
  return Object.keys(next).length > 0 ? next : undefined;
}

/** The locales the General tab offers (plus "System"). */
export const COMMON_LOCALES: readonly { value: string; label: string }[] = [
  { value: "en-US", label: "English (US)" },
  { value: "en-GB", label: "English (UK)" },
  { value: "de-DE", label: "Deutsch (Deutschland)" },
  { value: "de-CH", label: "Deutsch (Schweiz)" },
  { value: "fr-FR", label: "Français" },
  { value: "it-IT", label: "Italiano" },
  { value: "es-ES", label: "Español" },
  { value: "nl-NL", label: "Nederlands" },
  { value: "sv-SE", label: "Svenska" },
  { value: "nb-NO", label: "Norsk bokmål" },
  { value: "pl-PL", label: "Polski" },
  { value: "pt-BR", label: "Português (Brasil)" },
  { value: "ja-JP", label: "日本語" },
  { value: "zh-CN", label: "中文 (简体)" },
];

/** The clock's time and date strings for a moment, under the general settings. */
export function formatClock(now: Date, g: Pick<ResolvedGeneral, "hour12" | "showSeconds" | "locale">) {
  const locales = g.locale || undefined;
  const time = now.toLocaleTimeString(locales, {
    hour: "2-digit",
    minute: "2-digit",
    ...(g.showSeconds ? { second: "2-digit" as const } : {}),
    ...(g.hour12 !== undefined ? { hour12: g.hour12 } : {}),
  });
  const date = now.toLocaleDateString(locales, {
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
  return { time, date };
}
