import { DEFAULT_COOLDOWN_SECONDS, type AlertRule, type SensorCondition } from "./alerts";
import type { DataPoint } from "./data-points";
import { uid } from "./layout";

/**
 * The studio's alert starters: "Blank sensor rule", "Blank notification rule" and the presets. A preset
 * carries a matcher (a regex over a catalogue point's key and name); the rule takes the first live
 * numeric point that matches, and keeps an empty key (the editor asks to pick one) when none does.
 * See docs/redesign/alerts/PLAN.md.
 */

/** What the matcher needs of a catalogue point. */
export type PresetPoint = Pick<DataPoint, "key" | "name" | "type"> & Partial<Pick<DataPoint, "unit">>;

/** A preset's one condition (its key is picked later) and the hold time. */
type PresetCondition = Omit<SensorCondition, "key"> & { forSeconds: number };

export interface AlertPreset {
  id: string;
  label: string;
  /** One line under the label: what it watches. */
  hint: string;
  /** Tested against `key + " " + name`; absent for notification presets. */
  match?: RegExp;
  /** A point matching this is skipped even when `match` fits. */
  avoid?: RegExp;
  /** Units the threshold is written in (case-insensitive); a point with another unit is skipped. */
  units?: readonly string[];
  /** The rule without id and sensor key. */
  rule: Omit<AlertRule, "id">;
}

const display = (over: Partial<NonNullable<AlertRule["outputs"]["display"]>> = {}) => ({
  style: "toast" as const,
  position: "top-right" as const,
  backdrop: "none" as const,
  size: "m" as const,
  seconds: 8,
  text: "{value} {unit}",
  ...over,
});

/** A notification's display keeps the default text: the app is the title, the body its title then message. */
const notificationDisplay = () => {
  const { text: _sensorText, ...rest } = display({ seconds: 6 });
  return rest;
};

const sensorRule = (
  name: string,
  severity: AlertRule["severity"],
  { forSeconds, ...condition }: PresetCondition,
  out: { cooldown?: number; display?: Parameters<typeof display>[0] } = {}
): Omit<AlertRule, "id"> => ({
  name,
  enabled: true,
  severity,
  source: { kind: "sensor", conditions: [{ key: "", ...condition }], forSeconds },
  cooldownSeconds: out.cooldown ?? DEFAULT_COOLDOWN_SECONDS * 2,
  outputs: { display: display(out.display) },
});

export const ALERT_PRESETS: readonly AlertPreset[] = [
  {
    id: "gpu-temp",
    units: ["°C", "°F"],
    label: "GPU temperature high",
    hint: "GPU core above 80 °C for 10 s",
    match: /gpu.*temp/i,
    avoid: /hot ?spot|junction|memory|vram/i,
    rule: sensorRule("GPU temperature high", "warning", { op: ">", value: 80, forSeconds: 10, clearBelow: 75 }),
  },
  {
    id: "gpu-hotspot",
    units: ["°C", "°F"],
    label: "GPU hotspot high",
    hint: "GPU hotspot above 95 °C for 10 s",
    match: /gpu.*(hot ?spot|junction)/i,
    avoid: /memory|vram/i,
    rule: sensorRule("GPU hotspot high", "critical", { op: ">", value: 95, forSeconds: 10, clearBelow: 90 }),
  },
  {
    id: "gpu-power",
    units: ["W"],
    label: "GPU power near limit",
    hint: "GPU power above 300 W for 15 s (set your card's limit)",
    match: /gpu.*(power|package)/i,
    avoid: /limit|max|percent|%/i,
    rule: sensorRule("GPU power near limit", "info", { op: ">", value: 300, forSeconds: 15, clearBelow: 280 }),
  },
  {
    id: "cpu-temp",
    units: ["°C", "°F"],
    label: "CPU temperature high",
    hint: "CPU package above 90 °C for 10 s",
    match: /cpu.*(package|tctl|tdie|temp)/i,
    avoid: /gpu|fan|core #/i,
    rule: sensorRule("CPU temperature high", "warning", { op: ">", value: 90, forSeconds: 10, clearBelow: 85 }),
  },
  {
    id: "cpu-usage",
    units: ["%"],
    label: "CPU usage sustained",
    hint: "CPU load above 95 % for 60 s",
    match: /cpu.*(total|usage|load)/i,
    avoid: /gpu|core #|clock|temp/i,
    rule: sensorRule("CPU usage sustained", "info", { op: ">", value: 95, forSeconds: 60, clearBelow: 85 }),
  },
  {
    id: "ram-full",
    units: ["%"],
    label: "RAM almost full",
    hint: "Memory load above 90 % for 30 s",
    match: /(memory|ram).*(load|usage|used)/i,
    avoid: /virtual|gpu|vram|available/i,
    rule: sensorRule("RAM almost full", "warning", { op: ">", value: 90, forSeconds: 30, clearBelow: 85 }),
  },
  {
    id: "vram-full",
    units: ["%"],
    label: "VRAM almost full",
    hint: "GPU memory load above 95 % for 30 s",
    match: /(vram|gpu.*memory).*(load|usage|used)|gpu.*memory/i,
    avoid: /clock|temp|junction|total|free/i,
    rule: sensorRule("VRAM almost full", "warning", { op: ">", value: 95, forSeconds: 30, clearBelow: 90 }),
  },
  {
    id: "drive-full",
    units: ["%"],
    label: "Drive almost full",
    hint: "A drive above 90 % used",
    match: /(drive|disk|storage|volume).*(used|usage|load)/i,
    avoid: /activity|read|write|temp|rate/i,
    rule: sensorRule(
      "Drive almost full",
      "info",
      { op: ">", value: 90, forSeconds: 60, clearBelow: 88 },
      { cooldown: 3600 }
    ),
  },
  {
    id: "fps-drop",
    units: ["FPS"],
    label: "FPS drop",
    hint: "Frame rate below 30 for 5 s",
    match: /fps|frame ?rate/i,
    avoid: /1% ?low|0\.1%|min|max|avg/i,
    rule: sensorRule("FPS drop", "info", { op: "<", value: 30, forSeconds: 5, clearBelow: 40 }),
  },
  {
    id: "network-down",
    label: "Network down",
    hint: "A network status reading \"down\" (edit the value to what your sensor reports)",
    match: /(network|ethernet|wi-?fi|internet).*(status|state|connect)/i,
    rule: sensorRule(
      "Network down",
      "critical",
      { op: "=", value: "down", forSeconds: 10 },
      { display: { style: "banner", position: "top", seconds: 0, text: "{value}" } }
    ),
  },
  {
    id: "plugin-missing",
    label: "Plugin stopped reporting",
    hint: "A plugin's sensor gone for 30 s (pick one of the plugin's sensors)",
    match: /^plugins\./i,
    rule: sensorRule(
      "Plugin stopped reporting",
      "warning",
      { op: "missing", value: 0, forSeconds: 30 },
      { cooldown: 300, display: { style: "island", seconds: 0, text: "Stopped reporting" } }
    ),
  },
  {
    id: "notification",
    label: "Any notification from an app",
    hint: "Windows notifications; pick the apps",
    rule: {
      name: "App notification",
      enabled: true,
      severity: "info",
      source: { kind: "notification" },
      cooldownSeconds: 0,
      outputs: { display: notificationDisplay() },
    },
  },
];

/** The first live numeric point the preset's matcher fits, or undefined. */
export function matchSensor(preset: AlertPreset, points: readonly PresetPoint[]): string | undefined {
  const { match, avoid } = preset;
  if (!match) return undefined;
  const wantsText = preset.rule.source.kind === "sensor" && typeof preset.rule.source.conditions[0].value === "string";
  return points.find((p) => {
    if (p.type === "empty" || (!wantsText && p.type !== "number")) return false;
    const hay = `${p.key} ${p.name}`;
    const unitOk = !preset.units || !p.unit || preset.units.some((u) => u.toLowerCase() === p.unit!.toLowerCase());
    return unitOk && match.test(hay) && !(avoid?.test(hay));
  })?.key;
}

/** A new rule from a preset, its sensor chosen from the live catalogue (empty key when none matches). */
export function presetRule(preset: AlertPreset, points: readonly PresetPoint[]): AlertRule {
  const base = preset.rule;
  const key = matchSensor(preset, points);
  const source: AlertRule["source"] =
    base.source.kind === "sensor"
      ? { ...base.source, conditions: base.source.conditions.map((c) => ({ ...c, key: key ?? "" })) }
      : { ...base.source };
  return { ...base, id: uid("alert"), source, outputs: structuredClone(base.outputs) };
}

/** "Blank sensor rule": an empty key, a threshold at 80 and the default toast. */
export function blankSensorRule(): AlertRule {
  return {
    id: uid("alert"),
    name: "New alert",
    enabled: true,
    severity: "warning",
    source: { kind: "sensor", conditions: [{ key: "", op: ">", value: 80 }], forSeconds: 0 },
    cooldownSeconds: DEFAULT_COOLDOWN_SECONDS,
    outputs: { display: display() },
  };
}

/** "Blank notification rule": every app, the default toast. */
export function blankNotificationRule(): AlertRule {
  return {
    id: uid("alert"),
    name: "New notification alert",
    enabled: true,
    severity: "info",
    source: { kind: "notification" },
    cooldownSeconds: 0,
    outputs: { display: notificationDisplay() },
  };
}
