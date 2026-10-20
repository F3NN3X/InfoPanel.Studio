import { useEffect, useState } from "react";
import { Menu } from "@base-ui/react/menu";
import { BellRing, Copy, History, ListChecks, Plus, Trash2 } from "lucide-react";
import { IconButton } from "@/components/ui/icon-button";
import { Toggle } from "@/components/ui/toggle";
import type { HistorySetter } from "@/hooks/use-config-history";
import type { ActiveAlert, AlertHistoryEntry, AlertRule } from "@/lib/alerts";
import { ALERT_PRESETS, blankNotificationRule, blankSensorRule, presetRule } from "@/lib/alert-presets";
import type { DataPoint } from "@/lib/data-points";
import { uid, type DashboardConfig } from "@/lib/layout";
import { cn } from "@/lib/utils";
import { AlertDefaults } from "./alerts-defaults";
import { SeverityDot } from "./alerts-fields";
import { ActiveList, HistoryList, useAlertHistory } from "./alerts-live";
import {
  addRule,
  ageText,
  alertsKey,
  alertsOf,
  duplicateRule,
  lastFired,
  patchRule,
  removeRule,
  ruleKey,
  setAlertsEnabled,
  summarizeRule,
} from "./alerts-model";
import { AlertRuleEditor } from "./alerts-rule-editor";
import { PanelSection, SectionPad } from "./panel-section";
import { ToggleRow } from "./setting-rows";

export interface AlertsPanelProps {
  config: DashboardConfig;
  setConfig: HistorySetter;
  /** The alerts the server holds now (the control channel). */
  active: ActiveAlert[];
  /** The live catalogue: summaries name sensors, presets pick one. */
  points: readonly DataPoint[];
  /** The profile and page on the canvas. */
  current: { profile: string; page: string };
  /** Edits the server does not have yet (Test waits). */
  pushPending: boolean;
  /** The rule open in the editor (view state), null = the list. */
  editingId: string | null;
  onEdit: (id: string | null) => void;
  /** The sensor picker's "Open data explorer". */
  onOpenSources: () => void;
}

const MENU_POPUP =
  "max-h-[60vh] min-w-52 overflow-y-auto rounded-[9px] border border-ui-menu bg-ui-raised p-1 font-ui text-[12.5px] text-ui-2 shadow-ui-menu outline-none";
const MENU_ITEM =
  "flex min-h-[30px] cursor-default flex-col justify-center rounded-md px-2 py-1 outline-none select-none data-highlighted:bg-ui-hover";

/** The "+" menu: blank rules and the presets. */
function AddMenu({ onAdd, points }: { onAdd: (rule: AlertRule) => void; points: readonly DataPoint[] }) {
  return (
    <Menu.Root>
      <Menu.Trigger
        aria-label="New alert rule"
        title="New alert rule"
        className="inline-flex h-[26px] w-[26px] items-center justify-center rounded-md border border-ui-strong bg-ui-raised text-ui-1 hover:bg-[#1e1e23] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ui-accent/60"
      >
        <Plus className="h-[18px] w-[18px]" />
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Positioner className="z-[80]" sideOffset={4} align="end">
          <Menu.Popup className={MENU_POPUP}>
            <Menu.Item className={MENU_ITEM} onClick={() => onAdd(blankSensorRule())}>
              Blank sensor rule
            </Menu.Item>
            <Menu.Item className={MENU_ITEM} onClick={() => onAdd(blankNotificationRule())}>
              Blank notification rule
            </Menu.Item>
            <div className="my-1 border-t border-ui-subtle px-2 pt-1.5 text-[10.5px] uppercase tracking-wide text-ui-4">Presets</div>
            {ALERT_PRESETS.map((preset) => (
              <Menu.Item key={preset.id} className={MENU_ITEM} onClick={() => onAdd(presetRule(preset, points))}>
                <span className="text-ui-1">{preset.label}</span>
                <span className="text-[11px] text-ui-4">{preset.hint}</span>
              </Menu.Item>
            ))}
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
}

interface RuleRowProps {
  rule: AlertRule;
  summary: string;
  fired: AlertHistoryEntry | undefined;
  now: number;
  confirming: boolean;
  onOpen: () => void;
  onToggle: (enabled: boolean) => void;
  onDuplicate: () => void;
  onAskDelete: () => void;
  onDelete: () => void;
  onCancelDelete: () => void;
}

function RuleRow({ rule, summary, fired, now, confirming, ...on }: RuleRowProps) {
  if (confirming) {
    return (
      <li className="flex items-center gap-2 rounded-lg bg-ui-hover p-2 text-[12px] text-ui-2">
        <span className="min-w-0 flex-1 truncate">Delete “{rule.name}”?</span>
        <button type="button" onClick={on.onDelete} className="h-6 rounded-md bg-ui-danger px-2 text-[11.5px] text-black">
          Delete
        </button>
        <button type="button" onClick={on.onCancelDelete} className="h-6 rounded-md border border-ui-strong px-2 text-[11.5px]">
          Cancel
        </button>
      </li>
    );
  }
  return (
    <li className="group flex items-center gap-2 rounded-lg p-2 hover:bg-ui-hover">
      <Toggle checked={rule.enabled} label={`${rule.name} enabled`} onChange={on.onToggle} />
      <button
        type="button"
        onClick={on.onOpen}
        className={cn(
          "min-w-0 flex-1 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ui-accent/60",
          !rule.enabled && "opacity-55"
        )}
      >
        <span className="flex items-center gap-1.5">
          <SeverityDot severity={rule.severity} />
          <span className="truncate text-[12.5px] text-ui-1">{rule.name}</span>
        </span>
        <span className="block truncate text-[11px] text-ui-3" title={summary}>
          {summary}
        </span>
        <span className="block truncate text-[10.5px] text-ui-4">
          {fired ? `Last fired ${ageText(fired.startedAt, now)} ago` : "Never fired"}
        </span>
      </button>
      <span className="hidden shrink-0 group-focus-within:flex group-hover:flex">
        <IconButton label="Duplicate rule" onClick={on.onDuplicate}>
          <Copy className="h-3.5 w-3.5" />
        </IconButton>
        <IconButton label="Delete rule" danger onClick={on.onAskDelete}>
          <Trash2 className="h-3.5 w-3.5" />
        </IconButton>
      </span>
    </li>
  );
}

/**
 * The Alerts drawer: the master switch, the alerts active now (acknowledge / dismiss), the history, the
 * rules (add from blanks or presets, edit, duplicate, delete) and the global defaults. A rule opens in
 * the editor sub-view. Rules are config, so each edit is an undo step; the live list is server state.
 */
export function AlertsPanel({
  config,
  setConfig,
  active,
  points,
  current,
  pushPending,
  editingId,
  onEdit,
  onOpenSources,
}: AlertsPanelProps) {
  const alerts = alertsOf(config);
  const history = useAlertHistory(active);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 5000);
    return () => clearInterval(t);
  }, []);
  const [confirming, setConfirming] = useState<string | null>(null);

  const editing = editingId ? alerts.rules.find((r) => r.id === editingId) : undefined;
  if (editing) {
    return (
      <AlertRuleEditor
        rule={editing}
        config={config}
        setConfig={setConfig}
        points={points}
        current={current}
        pushPending={pushPending}
        onBack={() => onEdit(null)}
        onOpenSources={onOpenSources}
      />
    );
  }

  const add = (rule: AlertRule) => {
    setConfig((c) => addRule(c, rule), alertsKey(`add:${rule.id}`));
    onEdit(rule.id);
  };
  const labelOf = (rule: AlertRule) => {
    const key = rule.source.kind === "sensor" ? rule.source.key : "";
    const point = key ? points.find((p) => p.key === key) : undefined;
    return { name: point?.name, unit: point?.unit };
  };

  return (
    <>
      <div className="flex shrink-0 items-center justify-between px-3.5 pb-2.5 pt-3.5">
        <span className="text-[13px] font-semibold text-ui-1">Alerts</span>
        <AddMenu onAdd={add} points={points} />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="border-b border-[#1c1c21] py-1.5">
          <SectionPad>
            <ToggleRow
              label="Alerts on"
              value={alerts.enabled}
              onChange={(on) => setConfig((c) => setAlertsEnabled(c, on), alertsKey("enabled"))}
            />
          </SectionPad>
        </div>
        <PanelSection id="alerts-active" title="Active now" icon={BellRing}>
          <ActiveList active={active} now={now} />
        </PanelSection>
        <PanelSection id="alerts-history" title="History" icon={History} defaultOpen={false}>
          <HistoryList history={history} now={now} />
        </PanelSection>
        <PanelSection id="alerts-rules" title="Rules" icon={ListChecks} pad={false}>
          <div className="px-2 py-1">
            {alerts.rules.length === 0 ? (
              <p className="px-2 py-2 text-pretty text-[12px] leading-[1.45] text-ui-4">
                No alert rules yet. Use + to start from a blank rule or a preset such as “GPU temperature high”.
              </p>
            ) : (
              <ul className="space-y-0.5">
                {alerts.rules.map((rule) => (
                  <RuleRow
                    key={rule.id}
                    rule={rule}
                    summary={summarizeRule(rule, labelOf(rule))}
                    fired={lastFired(history, rule.id)}
                    now={now}
                    confirming={confirming === rule.id}
                    onOpen={() => onEdit(rule.id)}
                    onToggle={(enabled) =>
                      setConfig((c) => patchRule(c, rule.id, (r) => ({ ...r, enabled })), ruleKey(rule.id, "enabled"))
                    }
                    onDuplicate={() => {
                      const id = uid("alert");
                      setConfig((c) => duplicateRule(c, rule.id, id), alertsKey(`duplicate:${id}`));
                    }}
                    onAskDelete={() => setConfirming(rule.id)}
                    onCancelDelete={() => setConfirming(null)}
                    onDelete={() => {
                      setConfirming(null);
                      setConfig((c) => removeRule(c, rule.id), alertsKey(`remove:${rule.id}`));
                    }}
                  />
                ))}
              </ul>
            )}
          </div>
        </PanelSection>
        <AlertDefaults alerts={alerts} setConfig={setConfig} />
      </div>
    </>
  );
}
