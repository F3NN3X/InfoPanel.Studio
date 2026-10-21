/**
 * The Dynamic Island: a per-profile pill at the top centre of the page that shows the time and
 * springs open for alerts (`MonitorProfile.island`). Absent = no island, so stored configs load
 * unchanged without a migration. Fields added later default to the look they replaced. See
 * docs/redesign/island/PLAN.md.
 */
import { FONT_IDS } from "@/lib/fonts";

/**
 * "sensor": the time and up to three live values (`stats`). "line": a hairline at the top edge that
 * grows into the island when something shows. "hidden": only shows while there is something to show.
 */
export type IslandIdle = "time" | "time-date" | "sensor" | "line" | "hidden";
export const ISLAND_IDLES: readonly IslandIdle[] = ["time", "time-date", "sensor", "line", "hidden"];
export type IslandSize = "s" | "m" | "l";
export const ISLAND_SIZES: readonly IslandSize[] = ["s", "m", "l"];
/** "theme": the theme's card colour and text; "custom": `bgColor` and `fgColor`. */
export type IslandTint = "black" | "theme" | "custom";
export const ISLAND_TINTS: readonly IslandTint[] = ["black", "theme", "custom"];
/** "pill": floating below the top edge; "notch": glued to the top edge with concave corners. */
export type IslandShape = "pill" | "notch";
export const ISLAND_SHAPES: readonly IslandShape[] = ["pill", "notch"];
/** "lively": springs with a little overshoot; "smooth": none; "off": changes at once. */
export type IslandMotion = "lively" | "smooth" | "off";
export const ISLAND_MOTIONS: readonly IslandMotion[] = ["lively", "smooth", "off"];
export type IslandBorder = "none" | "subtle" | "accent";
export const ISLAND_BORDERS: readonly IslandBorder[] = ["none", "subtle", "accent"];
export type IslandWeight = "regular" | "medium" | "semibold" | "bold";
export const ISLAND_WEIGHTS: readonly IslandWeight[] = ["regular", "medium", "semibold", "bold"];
/** "general": as Settings › Dashboard › Clock & date sets clocks; else forced. */
export type IslandSeconds = "general" | "show" | "hide";
export const ISLAND_SECONDS: readonly IslandSeconds[] = ["general", "show", "hide"];
export type IslandHours = "general" | "12" | "24";
export const ISLAND_HOURS: readonly IslandHours[] = ["general", "12", "24"];

/** One live value beside the time; past `warn` it turns orange, past `crit` red (unset = never). */
export interface IslandStat {
  key: string;
  label: string;
  warn?: number;
  crit?: number;
}

/** The dashboard's own notices, each off until switched on. */
export interface IslandNotices {
  /** The page's name when the kiosk switches pages. */
  page: boolean;
  /** "Layout updated" when a studio save reaches the kiosk. */
  layout: boolean;
  /** "<plugin> is back" when a plugin that stopped reports again. */
  plugins: boolean;
  /** A live dot while OBS streams or records (the server's OBS connection). */
  onAir: boolean;
  /** The next calendar event counting down (the server's calendar links). */
  calendar: boolean;
  /** Claude Code and Codex sessions: working, needs you, finished, plan use (tools/agent-install.mjs). */
  agents: boolean;
}
export const ISLAND_NOTICE_KEYS: readonly (keyof IslandNotices)[] = ["page", "layout", "plugins", "onAir", "calendar", "agents"];

export interface IslandConfig {
  enabled: boolean;
  /** What the pill shows with nothing to report. */
  idle: IslandIdle;
  /** The values idle "sensor" shows, at most `ISLAND_STATS_MAX`. */
  stats: IslandStat[];
  /** Seconds each idle view shows before the next (date, values, next event); 0 = all side by side. */
  rotate: number;
  size: IslandSize;
  /** Fine size on top of `size`, percent. */
  scale: number;
  shape: IslandShape;
  /** Distance from the top of the page, px (the pill only; the notch sits on the edge). */
  offsetY: number;
  /**
   * Seconds an alert that stays until acknowledged keeps the island open, for screens without
   * touch; after it the alert stays as a badge until it clears. 0 = open until tapped.
   */
  collapseAfter: number;
  /** Push the zones down by the pill's height instead of overlaying the top row. */
  reserve: boolean;
  tint: IslandTint;
  /** The custom tint's background and text ("#rrggbb"). */
  bgColor: string;
  fgColor: string;
  /** Background opacity, percent; below 100 the page behind is blurred. */
  opacity: number;
  border: IslandBorder;
  shadow: boolean;
  /** A font id from the catalog ("system" = the page's font). */
  font: string;
  weight: IslandWeight;
  seconds: IslandSeconds;
  hours: IslandHours;
  motion: IslandMotion;
  /** Notices of the same kind (one app's notifications) stack into one with a count. */
  group: boolean;
  notices: IslandNotices;
  /** Minutes before a calendar event the countdown starts and the island opens. */
  calendarLead: number;
}

export const ISLAND_DEFAULTS: IslandConfig = {
  enabled: true,
  idle: "time",
  stats: [],
  rotate: 0,
  size: "m",
  scale: 100,
  shape: "pill",
  offsetY: 8,
  collapseAfter: 0,
  reserve: false,
  tint: "black",
  bgColor: "#000000",
  fgColor: "#ffffff",
  opacity: 100,
  border: "none",
  shadow: true,
  font: "system",
  weight: "semibold",
  seconds: "general",
  hours: "general",
  motion: "lively",
  group: false,
  notices: { page: false, layout: false, plugins: false, onAir: false, calendar: false, agents: false },
  calendarLead: 10,
};
/** The label before a value stays short: it shares the pill with the time. */
export const ISLAND_LABEL_MAX = 12;
export const ISLAND_STATS_MAX = 3;
export const ISLAND_OFFSET_MAX = 64;
export const ISLAND_COLLAPSE_MAX = 600;
export const ISLAND_LEAD_MAX = 120;
export const ISLAND_ROTATE_MAX = 60;
export const ISLAND_SCALE_MIN = 80;
export const ISLAND_SCALE_MAX = 150;
export const ISLAND_OPACITY_MIN = 30;

const oneOf = <T extends string>(list: readonly T[], v: unknown): T | undefined =>
  typeof v === "string" && (list as readonly string[]).includes(v) ? (v as T) : undefined;
const clamp = (v: unknown, lo: number, hi: number, fallback: number): number =>
  typeof v === "number" && Number.isFinite(v) ? Math.max(lo, Math.min(hi, Math.round(v))) : fallback;
const hex = (v: unknown, fallback: string): string => (typeof v === "string" && /^#[0-9a-f]{6}$/i.test(v) ? v.toLowerCase() : fallback);
const num = (v: unknown): number | undefined => (typeof v === "number" && Number.isFinite(v) ? v : undefined);

const noticesOf = (raw: unknown): IslandNotices => {
  const r = typeof raw === "object" && raw !== null ? (raw as Record<string, unknown>) : {};
  return { page: r.page === true, layout: r.layout === true, plugins: r.plugins === true, onAir: r.onAir === true, calendar: r.calendar === true, agents: r.agents === true };
};

function statOf(raw: unknown): IslandStat | null {
  if (typeof raw !== "object" || raw === null) return null;
  const r = raw as Record<string, unknown>;
  const key = typeof r.key === "string" ? r.key.trim() : "";
  const label = typeof r.label === "string" ? r.label.slice(0, ISLAND_LABEL_MAX) : "";
  const warn = num(r.warn);
  const crit = num(r.crit);
  return { key, label, ...(warn !== undefined ? { warn } : {}), ...(crit !== undefined ? { crit } : {}) };
}

/** The stored values; an island saved before `stats` had one (`sensorKey`, `sensorLabel`) keeps it as the first. */
function statsOf(r: Record<string, unknown>): IslandStat[] {
  if (Array.isArray(r.stats)) return r.stats.map(statOf).filter((s): s is IslandStat => s !== null).slice(0, ISLAND_STATS_MAX);
  const key = typeof r.sensorKey === "string" ? r.sensorKey.trim() : "";
  const label = typeof r.sensorLabel === "string" ? r.sensorLabel.slice(0, ISLAND_LABEL_MAX) : "";
  return key || label ? [{ key, label }] : [];
}

/** Tolerant read of a stored `island`: bad enums fall back to the defaults, numbers are clamped. */
export function normalizeIsland(raw: unknown): IslandConfig | undefined {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return undefined;
  const r = raw as Record<string, unknown>;
  const d = ISLAND_DEFAULTS;
  return {
    enabled: r.enabled !== false,
    idle: oneOf(ISLAND_IDLES, r.idle) ?? d.idle,
    stats: statsOf(r),
    rotate: clamp(r.rotate, 0, ISLAND_ROTATE_MAX, d.rotate),
    size: oneOf(ISLAND_SIZES, r.size) ?? d.size,
    scale: clamp(r.scale, ISLAND_SCALE_MIN, ISLAND_SCALE_MAX, d.scale),
    shape: oneOf(ISLAND_SHAPES, r.shape) ?? d.shape,
    offsetY: clamp(r.offsetY, 0, ISLAND_OFFSET_MAX, d.offsetY),
    collapseAfter: clamp(r.collapseAfter, 0, ISLAND_COLLAPSE_MAX, d.collapseAfter),
    reserve: r.reserve === true,
    tint: oneOf(ISLAND_TINTS, r.tint) ?? d.tint,
    bgColor: hex(r.bgColor, d.bgColor),
    fgColor: hex(r.fgColor, d.fgColor),
    opacity: clamp(r.opacity, ISLAND_OPACITY_MIN, 100, d.opacity),
    border: oneOf(ISLAND_BORDERS, r.border) ?? d.border,
    shadow: r.shadow !== false,
    font: oneOf(FONT_IDS, r.font) ?? d.font,
    weight: oneOf(ISLAND_WEIGHTS, r.weight) ?? d.weight,
    seconds: oneOf(ISLAND_SECONDS, r.seconds) ?? d.seconds,
    hours: oneOf(ISLAND_HOURS, r.hours) ?? d.hours,
    motion: oneOf(ISLAND_MOTIONS, r.motion) ?? d.motion,
    group: r.group === true,
    notices: noticesOf(r.notices),
    calendarLead: clamp(r.calendarLead, 1, ISLAND_LEAD_MAX, d.calendarLead),
  };
}

/** The island with `patch` applied; a profile without one starts from the defaults (switched off). */
export function withIsland<P extends { island?: IslandConfig }>(profile: P, patch: Partial<IslandConfig>): P {
  return { ...profile, island: { ...ISLAND_DEFAULTS, enabled: false, ...profile.island, ...patch } };
}

/** "warn" / "crit" when a value passes its stat's thresholds (the higher wins), else null. */
export function statLevel(stat: IslandStat, value: number | undefined): "warn" | "crit" | null {
  if (value === undefined || !Number.isFinite(value)) return null;
  if (stat.crit !== undefined && value >= stat.crit) return "crit";
  if (stat.warn !== undefined && value >= stat.warn) return "warn";
  return null;
}
