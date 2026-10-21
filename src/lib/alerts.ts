/**
 * Alerts: rules the studio edits (`DashboardConfig.alerts`) and the runtime
 * shapes the server publishes (server/alerts.mjs). Rules are config; active
 * alerts and history are server state, so none of that enters undo.
 * See docs/redesign/alerts/PLAN.md.
 */

export type Severity = "info" | "warning" | "critical";
export const SEVERITIES: readonly Severity[] = ["info", "warning", "critical"];

/** "island": the profile's Dynamic Island (`src/lib/island`); a profile without one shows a top toast. */
export type AlertStyle = "toast" | "banner" | "overlay" | "island";
export const ALERT_STYLES: readonly AlertStyle[] = ["toast", "banner", "overlay", "island"];
export type AlertPosition =
  | "top-left" | "top" | "top-right"
  | "left" | "center" | "right"
  | "bottom-left" | "bottom" | "bottom-right";
export const ALERT_POSITIONS: readonly AlertPosition[] = [
  "top-left", "top", "top-right", "left", "center", "right", "bottom-left", "bottom", "bottom-right",
];
export type AlertBackdrop = "none" | "dim" | "blur";
export const ALERT_BACKDROPS: readonly AlertBackdrop[] = ["none", "dim", "blur"];
export type AlertSize = "s" | "m" | "l";
export const ALERT_SIZES: readonly AlertSize[] = ["s", "m", "l"];

export interface AlertDisplay {
  style: AlertStyle;
  position: AlertPosition;
  backdrop: AlertBackdrop;
  size: AlertSize;
}

/** A display plus how long it stays: seconds, 0 = until acknowledged. */
export type AlertDisplayFull = AlertDisplay & { seconds: number };

/** "missing": the key has been absent for `forSeconds` after the rule saw it (a plugin stopped reporting). */
export type SensorOp = ">" | ">=" | "<" | "<=" | "=" | "!=" | "changes" | "contains" | "missing";
export const SENSOR_OPS: readonly SensorOp[] = [">", ">=", "<", "<=", "=", "!=", "changes", "contains", "missing"];

/** One sensor test of a sensor alert. */
export interface SensorCondition {
  key: string;
  op: SensorOp;
  value: number | string;
  /**
   * Hysteresis: for `>` / `>=` the alert clears once the value falls to or below it; for `<` / `<=`
   * once it rises to or above it. Absent = clears as soon as the condition stops holding.
   */
  clearBelow?: number;
}

export type AlertSource =
  | {
      kind: "sensor";
      /** At least one. The alert fires when any of them holds, and clears when none does. */
      conditions: SensorCondition[];
      /** A condition must hold this long (seconds) before the alert fires. */
      forSeconds: number;
    }
  | {
      kind: "notification";
      /** Apps to include (case-insensitive, empty or absent = all). */
      apps?: string[];
      exclude?: string[];
      /** Title or body must contain this (case-insensitive). */
      match?: string;
    };

export interface AlertOutputs {
  display?: Partial<AlertDisplay> & {
    /** 0 = until acknowledged. */
    seconds?: number;
    /** Template: {name} {value} {unit} {sensor} {app} {title} {body}. */
    text?: string;
  };
  page?: { profile?: string; page: string; returnAfter?: boolean };
  /** Default zones: those bound to the sensor. */
  highlight?: { zones?: string[] };
}

export interface AlertRule {
  id: string;
  name: string;
  enabled: boolean;
  severity: Severity;
  source: AlertSource;
  /** No refire within this many seconds after the alert clears. */
  cooldownSeconds: number;
  outputs: AlertOutputs;
  /** Profiles it shows on; absent = every profile. */
  profiles?: string[];
}

export interface QuietHours {
  /** Local time, "HH:MM"; the window may wrap midnight. */
  from: string;
  to: string;
  /** Alerts below this severity are kept in history but not shown. */
  minSeverity: Severity;
}

export interface AlertsConfig {
  enabled: boolean;
  rules: AlertRule[];
  quietHours?: QuietHours;
  defaults: AlertDisplayFull;
}

/** An alert the server currently holds (`ControlState.alerts`). */
export interface ActiveAlert {
  id: string;
  ruleId: string;
  name: string;
  severity: Severity;
  /** The card's heading: the source app for a notification, else the rule name. */
  title?: string;
  text: string;
  value?: number | string;
  unit?: string;
  app?: string;
  startedAt: number;
  /** Acknowledged alerts are hidden on kiosks until they clear. */
  acknowledged: boolean;
  /** The rule's display over the config defaults. */
  display: AlertDisplayFull;
  page?: { profile?: string; page: string; returnAfter?: boolean };
  highlight?: { zones?: string[]; key?: string };
  profiles?: string[];
  test?: boolean;
  /** Inside quiet hours and below their severity: in history, not shown. */
  quiet?: boolean;
}

export interface AlertHistoryEntry {
  id: string;
  ruleId: string;
  name: string;
  severity: Severity;
  text: string;
  startedAt: number;
  endedAt?: number;
  acknowledgedAt?: number;
  dismissed?: boolean;
  test?: boolean;
  quiet?: boolean;
}

/** The body of `POST /api/control/alert`. */
export type AlertAction = { id: string; action: "ack" | "dismiss" } | { ruleId: string; action: "test" };

export const DEFAULT_ALERT_DISPLAY: AlertDisplayFull = {
  style: "toast",
  position: "top-right",
  backdrop: "none",
  size: "m",
  seconds: 8,
};
export const DEFAULT_COOLDOWN_SECONDS = 60;
export const FOR_SECONDS_MAX = 3600;
export const COOLDOWN_SECONDS_MAX = 86_400;
export const DISPLAY_SECONDS_MAX = 600;

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);
const oneOf = <T extends string>(list: readonly T[], v: unknown): T | undefined =>
  typeof v === "string" && (list as readonly string[]).includes(v) ? (v as T) : undefined;
const clamp = (v: unknown, lo: number, hi: number, fallback: number): number =>
  typeof v === "number" && Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : fallback;
const strings = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((s): s is string => typeof s === "string" && s.trim() !== "") : [];
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

function normalizeCondition(raw: unknown): SensorCondition | undefined {
  // An empty key is kept: a new rule waits in the studio until a sensor is picked (it never fires).
  if (!isObject(raw) || typeof raw.key !== "string") return undefined;
  const op = raw.op === "≠" ? "!=" : (oneOf(SENSOR_OPS, raw.op) ?? ">");
  const value =
    typeof raw.value === "string" || (typeof raw.value === "number" && Number.isFinite(raw.value)) ? raw.value : 0;
  const clearBelow =
    typeof raw.clearBelow === "number" && Number.isFinite(raw.clearBelow) ? raw.clearBelow : undefined;
  return { key: raw.key, op, value, ...(clearBelow !== undefined ? { clearBelow } : {}) };
}

function normalizeSource(raw: unknown): AlertSource | undefined {
  if (!isObject(raw)) return undefined;
  if (raw.kind === "sensor") {
    // v11: a rule saved with one `key` / `op` / `value` on the source becomes a one-item list.
    const conditions = (Array.isArray(raw.conditions) ? raw.conditions : [raw])
      .map(normalizeCondition)
      .filter((c): c is SensorCondition => c !== undefined);
    if (conditions.length === 0) return undefined;
    return { kind: "sensor", conditions, forSeconds: clamp(raw.forSeconds, 0, FOR_SECONDS_MAX, 0) };
  }
  if (raw.kind === "notification") {
    const apps = strings(raw.apps);
    const exclude = strings(raw.exclude);
    const match = typeof raw.match === "string" && raw.match.trim() !== "" ? raw.match : undefined;
    return {
      kind: "notification",
      ...(apps.length > 0 ? { apps } : {}),
      ...(exclude.length > 0 ? { exclude } : {}),
      ...(match !== undefined ? { match } : {}),
    };
  }
  return undefined;
}

function normalizeOutputs(raw: unknown): AlertOutputs {
  if (!isObject(raw)) return {};
  const out: AlertOutputs = {};
  if (isObject(raw.display)) {
    const d = raw.display;
    const display: NonNullable<AlertOutputs["display"]> = {};
    const style = oneOf(ALERT_STYLES, d.style);
    const position = oneOf(ALERT_POSITIONS, d.position);
    const backdrop = oneOf(ALERT_BACKDROPS, d.backdrop);
    const size = oneOf(ALERT_SIZES, d.size);
    if (style) display.style = style;
    if (position) display.position = position;
    if (backdrop) display.backdrop = backdrop;
    if (size) display.size = size;
    if (typeof d.seconds === "number" && Number.isFinite(d.seconds)) {
      display.seconds = clamp(d.seconds, 0, DISPLAY_SECONDS_MAX, 0);
    }
    if (typeof d.text === "string" && d.text !== "") display.text = d.text;
    out.display = display;
  }
  if (isObject(raw.page) && typeof raw.page.page === "string" && raw.page.page !== "") {
    out.page = {
      ...(typeof raw.page.profile === "string" && raw.page.profile !== "" ? { profile: raw.page.profile } : {}),
      page: raw.page.page,
      ...(raw.page.returnAfter === true ? { returnAfter: true } : {}),
    };
  }
  if (isObject(raw.highlight)) {
    const zones = strings(raw.highlight.zones);
    out.highlight = zones.length > 0 ? { zones } : {};
  }
  return out;
}

function normalizeRule(raw: unknown): AlertRule | undefined {
  if (!isObject(raw) || typeof raw.id !== "string" || raw.id === "") return undefined;
  const source = normalizeSource(raw.source);
  if (!source) return undefined;
  const profiles = strings(raw.profiles);
  return {
    id: raw.id,
    name: typeof raw.name === "string" && raw.name.trim() !== "" ? raw.name : "Alert",
    enabled: raw.enabled !== false,
    severity: oneOf(SEVERITIES, raw.severity) ?? "warning",
    source,
    cooldownSeconds: clamp(raw.cooldownSeconds, 0, COOLDOWN_SECONDS_MAX, DEFAULT_COOLDOWN_SECONDS),
    outputs: normalizeOutputs(raw.outputs),
    ...(profiles.length > 0 ? { profiles } : {}),
  };
}

function normalizeQuietHours(raw: unknown): QuietHours | undefined {
  if (!isObject(raw) || typeof raw.from !== "string" || typeof raw.to !== "string") return undefined;
  if (!TIME.test(raw.from) || !TIME.test(raw.to)) return undefined;
  return { from: raw.from, to: raw.to, minSeverity: oneOf(SEVERITIES, raw.minSeverity) ?? "critical" };
}

/**
 * Tolerant read of a stored `alerts` value: bad rules are dropped, unknown enums fall back to their
 * defaults and numbers are clamped. Absent (or not an object) stays absent.
 */
export function normalizeAlerts(raw: unknown): AlertsConfig | undefined {
  if (!isObject(raw)) return undefined;
  const seen = new Set<string>();
  const rules: AlertRule[] = [];
  for (const r of Array.isArray(raw.rules) ? raw.rules : []) {
    const rule = normalizeRule(r);
    if (!rule || seen.has(rule.id)) continue;
    seen.add(rule.id);
    rules.push(rule);
  }
  const d = isObject(raw.defaults) ? raw.defaults : {};
  const quietHours = normalizeQuietHours(raw.quietHours);
  return {
    enabled: raw.enabled !== false,
    rules,
    ...(quietHours ? { quietHours } : {}),
    defaults: {
      style: oneOf(ALERT_STYLES, d.style) ?? DEFAULT_ALERT_DISPLAY.style,
      position: oneOf(ALERT_POSITIONS, d.position) ?? DEFAULT_ALERT_DISPLAY.position,
      backdrop: oneOf(ALERT_BACKDROPS, d.backdrop) ?? DEFAULT_ALERT_DISPLAY.backdrop,
      size: oneOf(ALERT_SIZES, d.size) ?? DEFAULT_ALERT_DISPLAY.size,
      seconds: clamp(d.seconds, 0, DISPLAY_SECONDS_MAX, DEFAULT_ALERT_DISPLAY.seconds),
    },
  };
}
