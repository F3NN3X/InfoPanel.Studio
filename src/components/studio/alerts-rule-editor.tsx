import { Activity, ArrowLeft, Bell, FlaskConical, Plus } from "lucide-react";
import { Segmented } from "@/components/ui/segmented";
import { useToast } from "@/components/ui/toast";
import type { HistorySetter } from "@/hooks/use-config-history";
import {
  COOLDOWN_SECONDS_MAX,
  FOR_SECONDS_MAX,
  SEVERITIES,
  type AlertRule,
  type AlertSource,
  type SensorCondition,
} from "@/lib/alerts";
import { postControl } from "@/lib/control";
import type { DataPoint } from "@/lib/data-points";
import { parseNameList } from "@/lib/name-list";
import type { DashboardConfig } from "@/lib/layout";
import { alertsOf, patchRule, ruleKey } from "./alerts-model";
import { AlertCondition } from "./alerts-condition";
import { ChipsField, NumField, SeverityDot, TextField } from "./alerts-fields";
import { AlertOutputs } from "./alerts-outputs";
import { PanelSection } from "./panel-section";
import { InlineRow, SEGMENTED_CLASS, StackRow, ToggleRow } from "./setting-rows";

interface AlertRuleEditorProps {
  rule: AlertRule;
  config: DashboardConfig;
  setConfig: HistorySetter;
  /** The live catalogue, for the notification apps suggestions. */
  points: readonly DataPoint[];
  /** The profile and page on the canvas (defaults of the output pickers). */
  current: { profile: string; page: string };
  /** Edits the server does not have yet: a test would run the old rule. */
  pushPending: boolean;
  onBack: () => void;
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

/** The rule editor sub-view of the Alerts drawer. */
export function AlertRuleEditor({
  rule,
  config,
  setConfig,
  points,
  current,
  pushPending,
  onBack,
  onOpenSources,
}: AlertRuleEditorProps) {
  const toast = useToast();
  const edit = (field: string, fn: (r: AlertRule) => AlertRule) =>
    setConfig((c) => patchRule(c, rule.id, fn), ruleKey(rule.id, field));
  const editSource = <S extends AlertSource>(field: string, fn: (s: S) => S) =>
    edit(field, (r) => ({ ...r, source: fn(r.source as S) }));
  const source = rule.source;
  const alerts = alertsOf(config);
  const sensorEmpty = source.kind === "sensor" && source.conditions.every((c) => c.key === "");
  const testBlocked = pushPending || sensorEmpty;

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

  const test = () =>
    void postControl("alert", { ruleId: rule.id, action: "test" }).then((res) =>
      toast(res ? "Test alert sent" : "Couldn't reach the server")
    );

  return (
    <>
      <div className="flex shrink-0 items-center gap-1.5 px-2.5 pb-2 pt-3">
        <button
          type="button"
          onClick={onBack}
          aria-label="Back to the rules"
          className="flex h-7 items-center gap-1 rounded-md px-1.5 text-caption text-ui-3 hover:bg-ui-hover hover:text-ui-1"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Back
        </button>
        <span className="ml-auto text-body font-semibold text-ui-1">Alert rule</span>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto pb-3">
        <PanelSection id="alert-rule" title="Rule" icon={Bell}>
          <StackRow label="Name">
            <TextField value={rule.name} label="Rule name" onChange={(name) => edit("name", (r) => ({ ...r, name }))} />
          </StackRow>
          <ToggleRow label="Enabled" value={rule.enabled} onChange={(enabled) => edit("enabled", (r) => ({ ...r, enabled }))} />
          <StackRow label="Severity">
            <Segmented
              label="Severity"
              className={SEGMENTED_CLASS}
              value={rule.severity}
              onChange={(severity) => edit("severity", (r) => ({ ...r, severity }))}
              options={SEVERITIES.map((s) => ({
                value: s,
                label: (
                  <span className="flex items-center gap-1.5 capitalize">
                    <SeverityDot severity={s} />
                    {s}
                  </span>
                ),
              }))}
            />
          </StackRow>
        </PanelSection>

        <PanelSection id="alert-source" title={source.kind === "sensor" ? "When a sensor" : "When a notification arrives"} icon={Activity}>
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
              <button
                type="button"
                onClick={addCondition}
                className="flex h-7 items-center gap-1 self-start rounded-md px-1.5 text-caption text-ui-accent-text hover:bg-ui-hover"
              >
                <Plus className="h-3.5 w-3.5" /> Add sensor
              </button>
              {source.conditions.some((c) => c.op !== "changes") && (
                <InlineRow
                  label="For (s)"
                  hint={
                    source.conditions.some((c) => c.op === "missing")
                      ? "A sensor must hold its condition this long (a missing one: be gone, after it has reported once) before the alert fires."
                      : "A sensor must hold its condition this long before the alert fires."
                  }
                >
                  <NumField
                    label="For seconds"
                    min={0}
                    max={FOR_SECONDS_MAX}
                    value={source.forSeconds}
                    onChange={(n) => editSource<SensorSource>("for", (s) => ({ ...s, forSeconds: n ?? 0 }))}
                  />
                </InlineRow>
              )}
            </>
          ) : (
            <>
              <StackRow label="Apps" hint="Empty = every app. Enter adds one.">
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
              <StackRow label="Text contains" hint="The title or body must include this.">
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
          <InlineRow label="Cooldown (s)" hint="No refire within this long after the alert clears.">
            <NumField
              label="Cooldown seconds"
              min={0}
              max={COOLDOWN_SECONDS_MAX}
              value={rule.cooldownSeconds}
              onChange={(n) => edit("cooldown", (r) => ({ ...r, cooldownSeconds: n ?? 0 }))}
            />
          </InlineRow>
          <StackRow label="Screens">
            <div className="space-y-1">
              <label className="flex items-center gap-2 text-[12.5px] text-ui-2">
                <input
                  type="checkbox"
                  checked={rule.profiles === undefined}
                  onChange={(e) =>
                    edit("profiles", (r) => {
                      const { profiles: _was, ...rest } = r;
                      return e.target.checked ? rest : { ...rest, profiles: config.profiles.map((p) => p.id) };
                    })
                  }
                />
                All screens
              </label>
              {rule.profiles !== undefined &&
                config.profiles.map((p) => (
                  <label key={p.id} className="flex items-center gap-2 pl-4 text-[12.5px] text-ui-2">
                    <input
                      type="checkbox"
                      checked={rule.profiles?.includes(p.id) ?? false}
                      onChange={(e) =>
                        edit("profiles", (r) => {
                          const list = r.profiles ?? [];
                          const next = e.target.checked ? [...list, p.id] : list.filter((id) => id !== p.id);
                          // Unticking the last one would mean "all": keep at least this one.
                          return next.length === 0 ? r : { ...r, profiles: next };
                        })
                      }
                    />
                    {p.name}
                  </label>
                ))}
            </div>
          </StackRow>
        </PanelSection>

        <AlertOutputs
          rule={rule}
          config={config}
          defaults={alerts.defaults}
          current={current}
          edit={edit}
        />

        <div className="space-y-1.5 pl-4 pr-2.5 pt-3">
          <button
            type="button"
            onClick={test}
            disabled={testBlocked}
            className="flex h-8 w-full items-center justify-center gap-1.5 rounded-md border border-ui-strong text-[12.5px] text-ui-1 hover:bg-ui-hover disabled:pointer-events-none disabled:opacity-40"
          >
            <FlaskConical className="h-3.5 w-3.5" /> Test
          </button>
          {testBlocked && (
            <div className="text-pretty text-micro leading-[1.4] text-ui-4">
              {sensorEmpty ? "Pick a sensor first." : "Edits are not on the server yet. Save, then test."}
            </div>
          )}
        </div>
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
