import { ArrowLeft, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Segmented } from "@/components/ui/segmented";
import { StatusChip, type StatusTone } from "@/components/ui/status-chip";
import { Toggle } from "@/components/ui/toggle";
import type { HistorySetter } from "@/hooks/use-config-history";
import { useSensors } from "@/hooks/useSensors";
import {
  COOLDOWN_SECONDS_MAX,
  FOR_SECONDS_MAX,
  SEVERITIES,
  type ActiveAlert,
  type AlertRule,
  type AlertSource,
  type SensorCondition,
} from "@/lib/alerts";
import type { DataPoint } from "@/lib/data-points";
import type { DashboardConfig } from "@/lib/layout";
import { parseNameList } from "@/lib/name-list";
import { sensorAt } from "@/lib/sensors";
import { AlertCondition } from "./alerts-condition";
import { ChipsField, NumField, SeverityDot, TextField } from "./alerts-fields";
import { AlertHow } from "./alerts-how";
import { alertsOf, patchRule, previewSensor, previewText, ruleKey, type SensorPreview } from "./alerts-model";
import { AlertOutputs } from "./alerts-outputs";
import { InlineRow, StackRow } from "./setting-rows";
import { sensorName } from "./widget-kinds";

interface AlertRuleEditorProps {
  rule: AlertRule;
  config: DashboardConfig;
  setConfig: HistorySetter;
  /** The alerts the server holds now: is this rule firing. */
  active: readonly ActiveAlert[];
  /** The live catalogue, for the notification apps suggestions. */
  points: readonly DataPoint[];
  /** The profile and page on the canvas (defaults of the output pickers). */
  current: { profile: string; page: string };
  /** Edits the server does not have yet: a test would run the old rule. */
  pushPending: boolean;
  /** Back to the rules list (narrow widths); unset beside the list. */
  onBack?: () => void;
  onOpenSources: () => void;
}

type SensorSource = Extract<AlertSource, { kind: "sensor" }>;
type NotificationSource = Extract<AlertSource, { kind: "notification" }>;

/** App names the Notifications plugin (2.0+) publishes (`…windows.apps`: a JSON array, or a comma list). */
export const NOTIFICATION_APPS_KEY = "plugins.InfoPanel.Notifications.windows.apps";

export function notificationApps(points: readonly DataPoint[]): string[] {
  const p = points.find((x) => x.key === NOTIFICATION_APPS_KEY);
  return p ? parseNameList(p.raw) : [];
}

const TONE: Record<SensorPreview["state"], StatusTone> = { fires: "warn", ok: "neutral", event: "neutral", nodata: "neutral" };

/** The When card's chip: firing now, else what the first sensor would do on its reading. */
function WhenChip({ firing, conditions }: { firing: boolean; conditions: readonly SensorCondition[] }) {
  const keys = conditions.map((c) => c.key).filter(Boolean);
  const live = useSensors(keys);
  const states = conditions.map((c) => previewSensor(c, c.key ? sensorAt(live, c.key) : undefined).state);
  const state = states.find((s) => s === "fires") ?? states[0] ?? "nodata";
  return (
    <span aria-live="polite">
      {firing ? <StatusChip tone="danger">Firing now</StatusChip> : <StatusChip tone={TONE[state]}>{previewText(state)}</StatusChip>}
    </span>
  );
}

/** A rule: its name, severity and condition in the centre column, how it shows in the right one. */
export function AlertRuleEditor({ rule, config, setConfig, active, points, current, pushPending, onBack, onOpenSources }: AlertRuleEditorProps) {
  const edit = (field: string, fn: (r: AlertRule) => AlertRule) => setConfig((c) => patchRule(c, rule.id, fn), ruleKey(rule.id, field));
  const editSource = <S extends AlertSource>(field: string, fn: (s: S) => S) => edit(field, (r) => ({ ...r, source: fn(r.source as S) }));
  const source = rule.source;
  const alerts = alertsOf(config);
  const sensorEmpty = source.kind === "sensor" && source.conditions.every((c) => c.key === "");
  const firing = active.some((a) => a.ruleId === rule.id && !a.test);
  const firstKey = source.kind === "sensor" ? source.conditions.find((c) => c.key !== "")?.key : undefined;
  const live = useSensors(firstKey ? [firstKey] : []);
  const reading = firstKey ? sensorAt(live, firstKey) : undefined;
  const sample = {
    value: reading?.value !== undefined ? String(reading.value) : (reading?.text ?? "—"),
    unit: reading?.unit ?? "",
    sensor: firstKey ? sensorName(firstKey) : "",
  };

  const editCondition = (index: number, field: string, fn: (c: SensorCondition) => SensorCondition) =>
    editSource<SensorSource>(`c${index}:${field}`, (s) => ({
      ...s,
      conditions: s.conditions.map((c, i) => (i === index ? fn(c) : c)),
    }));
  const addCondition = () =>
    edit("conditions", (r) =>
      r.source.kind !== "sensor"
        ? r
        : {
            ...r,
            source: { ...r.source, conditions: [...r.source.conditions, { key: "", op: ">", value: 80 }] },
            // The preset text shows one reading; the default text names each sensor that fired.
            outputs: r.outputs.display?.text === "{value} {unit}" ? { ...r.outputs, display: withoutText(r.outputs.display) } : r.outputs,
          }
    );
  const removeCondition = (index: number) =>
    editSource<SensorSource>("conditions", (s) => ({ ...s, conditions: s.conditions.filter((_, i) => i !== index) }));

  return (
    <>
      <div className="flex min-w-0 flex-col gap-4 overflow-y-auto px-6 py-5 max-sm:px-3" data-testid="alert-rule">
        {onBack && (
          <Button small variant="ghost" className="self-start" icon={<ArrowLeft aria-hidden />} onClick={onBack} aria-label="Back to the rules">
            Back
          </Button>
        )}
        <div className="flex items-center gap-3">
          <input
            type="text"
            value={rule.name}
            aria-label="Rule name"
            spellCheck={false}
            onChange={(e) => edit("name", (r) => ({ ...r, name: e.target.value }))}
            className="-ml-2 h-8 min-w-0 flex-1 rounded-ui-sm bg-transparent px-2 text-head font-medium text-ui-1 hover:bg-ui-raised focus:bg-ui-raised focus-visible:outline-2 focus-visible:outline-ui-accent"
          />
          <label className="flex items-center gap-2 text-body text-ui-2">
            Enabled
            <Toggle checked={rule.enabled} label="Enabled" onChange={(enabled) => edit("enabled", (r) => ({ ...r, enabled }))} />
          </label>
        </div>
        <div className="flex items-center gap-3">
          <span className="flex-1 text-body text-ui-2">Severity</span>
          <Segmented
            label="Severity"
            value={rule.severity}
            onChange={(severity) => edit("severity", (r) => ({ ...r, severity }))}
            options={SEVERITIES.map((s) => ({
              value: s,
              label: (
                <span className="flex items-center gap-1.5 capitalize">
                  <SeverityDot severity={s} className="h-1.5 w-1.5" />
                  {s}
                </span>
              ),
            }))}
          />
        </div>

        <section className="flex flex-col gap-3 rounded-14 border border-ui-default bg-ui-panel px-4 py-3" aria-label="When">
          <div className="flex min-h-6 items-center justify-between gap-2">
            <h3 className="text-body font-medium text-ui-1">{source.kind === "sensor" ? "When" : "When a notification arrives"}</h3>
            {source.kind === "sensor" && <WhenChip firing={firing} conditions={source.conditions} />}
          </div>
          {source.kind === "sensor" ? (
            <>
              {source.conditions.map((c, i) => (
                <AlertCondition
                  key={i}
                  condition={c}
                  position={source.conditions.length > 1 ? { index: i, onRemove: () => removeCondition(i) } : undefined}
                  onEdit={(field, fn) => editCondition(i, field, fn)}
                  onOpenSources={onOpenSources}
                />
              ))}
              <Button small variant="ghost" className="self-start" icon={<Plus aria-hidden />} onClick={addCondition}>
                Add sensor
              </Button>
            </>
          ) : (
            <>
              <StackRow label="Apps" hint="Empty = every app. Enter adds one">
                <ChipsField
                  label="Apps"
                  values={source.apps ?? []}
                  suggestions={notificationApps(points)}
                  placeholder="App name"
                  onChange={(apps) => editSource<NotificationSource>("apps", (s) => withList(s, "apps", apps))}
                />
              </StackRow>
              <StackRow label="Exclude apps">
                <ChipsField
                  label="Exclude apps"
                  values={source.exclude ?? []}
                  suggestions={notificationApps(points)}
                  placeholder="App name"
                  onChange={(list) => editSource<NotificationSource>("exclude", (s) => withList(s, "exclude", list))}
                />
              </StackRow>
              <StackRow label="Text contains" hint="The title or body must include this">
                <TextField
                  label="Text contains"
                  value={source.match ?? ""}
                  onChange={(match) =>
                    editSource<NotificationSource>("match", (s) => {
                      const { match: _was, ...rest } = s;
                      return match === "" ? rest : { ...rest, match };
                    })
                  }
                />
              </StackRow>
            </>
          )}
          <div className="flex flex-col divide-y divide-ui-row border-t border-ui-row [&>*]:min-h-10 [&>*]:py-1">
            {source.kind === "sensor" && source.conditions.some((c) => c.op !== "changes") && (
              <InlineRow
                label="Only after it lasts"
                hint={
                  source.conditions.some((c) => c.op === "missing")
                    ? "A sensor must hold its condition this long (a missing one: be gone, after it has reported once) before the alert fires"
                    : "A sensor must hold its condition this long before the alert fires"
                }
              >
                <NumField label="For seconds" unit="s" min={0} max={FOR_SECONDS_MAX} value={source.forSeconds} onChange={(n) => editSource<SensorSource>("for", (s) => ({ ...s, forSeconds: n ?? 0 }))} />
              </InlineRow>
            )}
            <InlineRow label="Wait before firing again" hint="No refire within this long after the alert clears">
              <NumField label="Cooldown seconds" unit="s" min={0} max={COOLDOWN_SECONDS_MAX} value={rule.cooldownSeconds} onChange={(n) => edit("cooldown", (r) => ({ ...r, cooldownSeconds: n ?? 0 }))} />
            </InlineRow>
          </div>
        </section>

        <AlertOutputs rule={rule} config={config} defaults={alerts.defaults} current={current} edit={edit} />
      </div>
      <div className="min-w-0 overflow-y-auto border-l border-ui-subtle px-6 py-5 max-split:border-l-0 max-sm:px-3">
        <AlertHow
          rule={rule}
          config={config}
          defaults={alerts.defaults}
          sample={sample}
          testBlocked={sensorEmpty ? "Pick a sensor first" : pushPending ? "Edits are not on the server yet. Save, then test" : undefined}
          edit={edit}
        />
      </div>
    </>
  );
}

/** A display without its text template, which puts the default back. */
function withoutText(display: NonNullable<AlertRule["outputs"]["display"]>): NonNullable<AlertRule["outputs"]["display"]> {
  const { text: _was, ...rest } = display;
  return rest;
}

/** A notification source with one of its lists set (an empty list is dropped). */
function withList(s: NotificationSource, field: "apps" | "exclude", list: string[]): NotificationSource {
  const { [field]: _was, ...rest } = s;
  return list.length > 0 ? { ...rest, [field]: list } : rest;
}
