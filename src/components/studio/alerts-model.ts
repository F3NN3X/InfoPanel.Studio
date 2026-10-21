import type { SensorValue } from "@/hooks/useSensors";
import {
  normalizeAlerts,
  type AlertHistoryEntry,
  type AlertRule,
  type AlertsConfig,
  type QuietHours,
  type SensorCondition,
} from "@/lib/alerts";
import { formatReading } from "@/lib/data-points";
import { uid, type DashboardConfig } from "@/lib/layout";

/**
 * The Alerts panel's pure side: rule summaries, the live preview and the config edits. Every edit
 * returns a new config (created `alerts` on first use) and has a history key, so one burst of typing
 * in a field is one undo step (the history coalesces equal keys).
 */

/** The history key of one field of one rule. */
export const ruleKey = (ruleId: string, field: string): string => `alert:${ruleId}:${field}`;
/** The history key of a field of the alerts section itself. */
export const alertsKey = (field: string): string => `alerts:${field}`;

/** The stored alerts, or the normalised empty section. */
export const alertsOf = (config: DashboardConfig): AlertsConfig =>
  config.alerts ?? (normalizeAlerts({}) as AlertsConfig);

const withAlerts = (config: DashboardConfig, edit: (alerts: AlertsConfig) => AlertsConfig): DashboardConfig => {
  const before = alertsOf(config);
  const after = edit(before);
  return after === before && config.alerts ? config : { ...config, alerts: after };
};

export function setAlertsEnabled(config: DashboardConfig, enabled: boolean): DashboardConfig {
  return withAlerts(config, (a) => ({ ...a, enabled }));
}

export function patchDefaults(config: DashboardConfig, patch: Partial<AlertsConfig["defaults"]>): DashboardConfig {
  return withAlerts(config, (a) => ({ ...a, defaults: { ...a.defaults, ...patch } }));
}

export function setQuietHours(config: DashboardConfig, quietHours: QuietHours | undefined): DashboardConfig {
  return withAlerts(config, (a) => {
    const { quietHours: _was, ...rest } = a;
    return quietHours ? { ...rest, quietHours } : rest;
  });
}

export function addRule(config: DashboardConfig, rule: AlertRule): DashboardConfig {
  return withAlerts(config, (a) => ({ ...a, rules: [...a.rules, rule] }));
}

export function removeRule(config: DashboardConfig, id: string): DashboardConfig {
  return withAlerts(config, (a) =>
    a.rules.some((r) => r.id === id) ? { ...a, rules: a.rules.filter((r) => r.id !== id) } : a
  );
}

/** A copy of a rule right after it (new id, "copy" in its name); the config as is for an unknown id. */
export function duplicateRule(config: DashboardConfig, id: string, newId: string = uid("alert")): DashboardConfig {
  return withAlerts(config, (a) => {
    const at = a.rules.findIndex((r) => r.id === id);
    if (at < 0) return a;
    const copy: AlertRule = { ...structuredClone(a.rules[at]), id: newId, name: `${a.rules[at].name} copy` };
    return { ...a, rules: [...a.rules.slice(0, at + 1), copy, ...a.rules.slice(at + 1)] };
  });
}

/** Replace one rule with `edit(rule)`; the config as is when the id is unknown or nothing changed. */
export function patchRule(config: DashboardConfig, id: string, edit: (rule: AlertRule) => AlertRule): DashboardConfig {
  return withAlerts(config, (a) => {
    const at = a.rules.findIndex((r) => r.id === id);
    if (at < 0) return a;
    const next = edit(a.rules[at]);
    return next === a.rules[at] ? a : { ...a, rules: a.rules.map((r, i) => (i === at ? next : r)) };
  });
}

/* ---------------- text ---------------- */

/** How a rule's sensor is named in a summary. */
export interface SensorLabel {
  name?: string;
  unit?: string;
}

const lastSegment = (key: string): string => key.slice(key.lastIndexOf(".") + 1);

/** One condition as words, without the hold time. */
function describeCondition(c: SensorCondition, sensor: SensorLabel): string {
  const name = sensor.name || lastSegment(c.key);
  const unit = sensor.unit ? ` ${sensor.unit}` : "";
  if (c.op === "changes") return `${name} changes`;
  if (c.op === "missing") return `${name} stops reporting`;
  if (c.op === "contains") return `${name} contains “${c.value}”`;
  return `${name} ${c.op} ${c.value}${typeof c.value === "number" ? unit : ""}`;
}

/**
 * "GPU Temperature > 80 °C for 10 s", "CPU > 95 or GPU > 85 for 10 s", "Notifications from Discord",
 * "Pick a sensor". `sensors` are the labels of the conditions, in order.
 */
export function summarizeRule(rule: AlertRule, sensors: readonly SensorLabel[] = []): string {
  const s = rule.source;
  if (s.kind === "notification") {
    const from = s.apps && s.apps.length > 0 ? `Notifications from ${s.apps.join(", ")}` : "Any notification";
    return s.match ? `${from} containing “${s.match}”` : from;
  }
  const picked = s.conditions.filter((c) => c.key !== "");
  if (picked.length === 0) return "Pick a sensor";
  const parts = s.conditions.flatMap((c, i) => (c.key === "" ? [] : [describeCondition(c, sensors[i] ?? {})]));
  const holds = picked.some((c) => c.op !== "changes");
  return `${parts.join(" or ")}${holds && s.forSeconds > 0 ? ` for ${s.forSeconds} s` : ""}`;
}

/** The newest history entry of a rule (tests excluded), or undefined. */
export function lastFired(history: readonly AlertHistoryEntry[], ruleId: string): AlertHistoryEntry | undefined {
  return history.reduce<AlertHistoryEntry | undefined>(
    (best, h) => (h.ruleId === ruleId && !h.test && (!best || h.startedAt > best.startedAt) ? h : best),
    undefined
  );
}

/** "now", "42 s", "5 m", "3 h", "2 d" ago. */
export function ageText(since: number, now: number): string {
  const s = Math.max(0, Math.round((now - since) / 1000));
  if (s < 5) return "now";
  if (s < 60) return `${s} s`;
  if (s < 3600) return `${Math.floor(s / 60)} m`;
  if (s < 86_400) return `${Math.floor(s / 3600)} h`;
  return `${Math.floor(s / 86_400)} d`;
}

/** The clear-level label flips with the direction: a `>` rule clears below, a `<` rule above. */
export const clearLabel = (op: string): "Clears below" | "Clears above" | null =>
  op === ">" || op === ">=" ? "Clears below" : op === "<" || op === "<=" ? "Clears above" : null;

/* ---------------- live preview ---------------- */

const numeric = (r: SensorValue): number | undefined => {
  if (typeof r.value === "number" && Number.isFinite(r.value)) return r.value;
  const t = r.text?.trim();
  return t && Number.isFinite(Number(t)) ? Number(t) : undefined;
};
const textOf = (r: SensorValue): string | undefined =>
  typeof r.text === "string" ? r.text : typeof r.value === "number" ? String(r.value) : undefined;

/** Whether the condition holds for a reading (the server's `holds`); null = no usable reading. */
function holds(s: SensorCondition, r: SensorValue): boolean | null {
  if (s.op === "contains") {
    const t = textOf(r);
    return t === undefined ? null : t.toLowerCase().includes(String(s.value).toLowerCase());
  }
  if (s.op === "=" || s.op === "!=") {
    const equal =
      typeof s.value === "number"
        ? numeric(r) === s.value
        : (textOf(r) ?? "").toLowerCase() === String(s.value).toLowerCase();
    return s.op === "=" ? equal : !equal;
  }
  const n = numeric(r);
  const limit = Number(s.value);
  if (n === undefined || !Number.isFinite(limit)) return null;
  if (s.op === ">=") return n >= limit;
  if (s.op === "<") return n < limit;
  if (s.op === "<=") return n <= limit;
  return n > limit;
}

export interface SensorPreview {
  /** The reading as text, null without one. */
  value: string | null;
  state: "fires" | "ok" | "nodata" | "event";
}

/** The editor's live line: the current value and whether the condition would fire on it now. */
export function previewSensor(source: SensorCondition, reading: SensorValue | undefined): SensorPreview {
  const value = reading
    ? typeof reading.value === "number"
      ? formatReading(reading.value, reading.unit)
      : (reading.text?.trim() || null)
    : null;
  if (source.op === "changes") return { value, state: "event" };
  if (source.op === "missing") return { value, state: reading ? "ok" : "nodata" };
  const fires = reading ? holds(source, reading) : null;
  return { value, state: fires === null ? "nodata" : fires ? "fires" : "ok" };
}
