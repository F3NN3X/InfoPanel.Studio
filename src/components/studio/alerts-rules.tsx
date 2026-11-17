import { useEffect, useRef, useState } from "react";
import { Menu } from "@base-ui/react/menu";
import { Bell, BellRing, Copy, Maximize, PanelTop, Plus, RectangleHorizontal, Sparkles, Trash2, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";
import { Toggle } from "@/components/ui/toggle";
import type { HistorySetter } from "@/hooks/use-config-history";
import { useViewportBelow } from "@/hooks/use-viewport-below";
import type { ActiveAlert, AlertHistoryEntry, AlertRule, AlertsConfig, AlertStyle } from "@/lib/alerts";
import { ALERT_PRESETS, type AlertPreset, blankNotificationRule, blankSensorRule, presetRule } from "@/lib/alert-presets";
import type { DataPoint } from "@/lib/data-points";
import { uid, type DashboardConfig } from "@/lib/layout";
import { cn } from "@/lib/utils";
import { SeverityDot } from "./alerts-fields";
import { ActiveNow } from "./alerts-live";
import { addRule, alertsKey, alertsOf, duplicateRule, firedText, lastFired, patchRule, removeRule, ruleKey, summarizeRule } from "./alerts-model";
import { AlertRuleEditor } from "./alerts-rule-editor";

export interface AlertRulesProps {
  config: DashboardConfig;
  setConfig: HistorySetter;
  /** The alerts the server holds now (the control channel). */
  active: ActiveAlert[];
  /** The server's history: each rule's last firing. */
  history: readonly AlertHistoryEntry[];
  /** The live catalogue: summaries name sensors, presets pick one. */
  points: readonly DataPoint[];
  /** The profile and page on the canvas. */
  current: { profile: string; page: string };
  /** Edits the server does not have yet (Test waits). */
  pushPending: boolean;
  /** The rule open in the editor (view state); null = the first one, or the list when narrow. */
  editingId: string | null;
  onEdit: (id: string | null) => void;
  /** A rule not in the config yet (Create alert on a Data point): shown when it is the open one, saved by its first edit. */
  draft?: AlertRule;
  /** The sensor picker's "Open data explorer". */
  onOpenSources: () => void;
}

/** Under this width the three columns don't fit: the list, then a rule on its own with Back. */
const COLUMNS_MIN = 1180;

const MENU_POPUP =
  "max-h-[60vh] min-w-52 overflow-y-auto rounded-ui-menu border border-ui-menu bg-ui-raised p-1 font-ui text-body text-ui-2 shadow-ui-menu outline-none";
const MENU_ITEM =
  "flex min-h-[32px] cursor-default flex-col justify-center rounded-md px-2 py-1 outline-none select-none data-highlighted:bg-ui-highlight data-highlighted:text-ui-1";

/** The "New rule" menu (SPEC §10.3): blank rules and the presets. */
export function NewRuleMenu({ onAdd, points }: { onAdd: (rule: AlertRule) => void; points: readonly DataPoint[] }) {
  return (
    <Menu.Root>
      <Menu.Trigger render={<Button variant="primary" icon={<Plus aria-hidden />} />}>New rule</Menu.Trigger>
      <Menu.Portal>
        <Menu.Positioner className="z-[80]" sideOffset={4} align="end">
          <Menu.Popup className={MENU_POPUP}>
            <Menu.Item className={MENU_ITEM} onClick={() => onAdd(blankSensorRule())}>
              Blank sensor rule
            </Menu.Item>
            <Menu.Item className={MENU_ITEM} onClick={() => onAdd(blankNotificationRule())}>
              Blank notification rule
            </Menu.Item>
            <div className="my-1 border-t border-ui-subtle px-2 pt-1.5 text-caption text-ui-3">Presets</div>
            {ALERT_PRESETS.map((preset) => (
              <Menu.Item key={preset.id} className={MENU_ITEM} onClick={() => onAdd(presetRule(preset, points))}>
                <span className="text-ui-1">{preset.label}</span>
                <span className="text-micro text-ui-3">{preset.hint}</span>
              </Menu.Item>
            ))}
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
}

/** The rules list with no rules: what this is for, a blank rule, and the headline preset. */
function EmptyRules({ onAdd, points }: { onAdd: (rule: AlertRule) => void; points: readonly DataPoint[] }) {
  const headline: AlertPreset | undefined = ALERT_PRESETS.find((p) => p.id === "gpu-temp");
  return (
    <div className="flex flex-col items-center gap-3 px-6 py-10 text-center">
      <Bell className="h-10 w-10 text-ui-1 opacity-40" strokeWidth={1.25} aria-hidden />
      <h2 className="text-title font-medium text-ui-1">No alert rules yet</h2>
      <p className="max-w-[380px] text-pretty text-body leading-[1.45] text-ui-3">A rule watches a sensor and shows an alert on your kiosks when it crosses a limit</p>
      <div className="flex flex-wrap justify-center gap-2">
        <Button variant="primary" onClick={() => onAdd(blankSensorRule())}>New rule</Button>
        {headline && <Button onClick={() => onAdd(presetRule(headline, points))}>Start from {headline.label}</Button>}
      </div>
    </div>
  );
}

const STYLE_ICON: Record<AlertStyle, LucideIcon> = { auto: Sparkles, island: RectangleHorizontal, toast: BellRing, banner: PanelTop, overlay: Maximize };

/** The display style a rule shows as: its own, else the defaults'. */
export const shownAs = (rule: AlertRule, alerts: AlertsConfig): AlertStyle => rule.outputs.display?.style ?? alerts.defaults.style;

interface RuleRowProps {
  rule: AlertRule;
  summary: string;
  /** The display style it shows as (its own, else the default). */
  style: AlertStyle;
  fired: AlertHistoryEntry | undefined;
  now: number;
  selected: boolean;
  confirming: boolean;
  onOpen: () => void;
  onToggle: (enabled: boolean) => void;
  onDuplicate: () => void;
  onAskDelete: () => void;
  onDelete: () => void;
  onCancelDelete: () => void;
}

function RuleRow({ rule, summary, style, fired, now, selected, confirming, ...on }: RuleRowProps) {
  const cancelRef = useRef<HTMLButtonElement>(null);
  // The row swaps for the question, so the focused Delete button is gone: put focus on the safe answer.
  useEffect(() => {
    if (confirming) cancelRef.current?.focus();
  }, [confirming]);
  if (confirming) {
    return (
      <li role="alert" className="flex items-center gap-2 rounded-[12px] border border-ui-strong bg-ui-raised px-3 py-2.5 text-caption text-ui-2">
        <span className="min-w-0 flex-1 truncate">Delete “{rule.name}”?</span>
        <Button small variant="danger" onClick={on.onDelete}>Delete</Button>
        <button ref={cancelRef} type="button" onClick={on.onCancelDelete} className="h-7 rounded-ui-sm border border-ui-strong bg-ui-raised px-2.5 text-body font-medium text-ui-1 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ui-accent">
          Cancel
        </button>
      </li>
    );
  }
  const Icon = STYLE_ICON[style];
  return (
    <li className={cn("group flex items-center gap-2.5 rounded-[12px] border px-3 py-2.5", selected ? "border-ui-default bg-ui-panel" : "border-transparent hover:bg-ui-raised")}>
      <SeverityDot severity={rule.severity} />
      <button
        type="button"
        onClick={on.onOpen}
        aria-current={selected || undefined}
        className={cn("min-w-0 flex-1 rounded-ui-sm text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ui-accent")}
      >
        <span className={cn("block truncate text-body", rule.enabled ? "text-ui-1" : "text-ui-2")}>{rule.name}</span>
        <span className="block truncate font-ui-mono text-micro text-ui-3" title={summary}>
          {summary}
        </span>
        <span className="block truncate text-micro text-ui-3">{firedText(fired?.startedAt, now)}</span>
      </button>
      <span className="hidden shrink-0 group-focus-within:flex group-hover:flex">
        <IconButton label="Duplicate rule" size={26} onClick={on.onDuplicate}>
          <Copy className="h-3.5 w-3.5" />
        </IconButton>
        <IconButton label="Delete rule" size={26} danger onClick={on.onAskDelete}>
          <Trash2 className="h-3.5 w-3.5" />
        </IconButton>
      </span>
      <span title={`${rule.severity} · shows as ${style}`} className="shrink-0 text-ui-3 group-focus-within:hidden group-hover:hidden">
        <Icon className="h-4 w-4" strokeWidth={1.5} aria-label={`Shows as ${style}`} />
      </span>
      <Toggle checked={rule.enabled} label={`${rule.name} enabled`} onChange={on.onToggle} />
    </li>
  );
}

/**
 * Alerts & Island › Alerts: what is active, the rules (add from blanks or presets, duplicate, delete) and the open rule
 * beside them. Rules are config, so each edit is an undo step.
 */
export function AlertRules({ config, setConfig, active, history, points, current, pushPending, editingId, onEdit, draft, onOpenSources }: AlertRulesProps) {
  const alerts = alertsOf(config);
  const narrow = useViewportBelow(COLUMNS_MIN);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 5000);
    return () => clearInterval(t);
  }, []);
  const [confirming, setConfirming] = useState<string | null>(null);
  const add = (rule: AlertRule) => {
    setConfig((c) => addRule(c, rule), alertsKey(`add:${rule.id}`));
    onEdit(rule.id);
  };
  const unsaved = draft !== undefined && draft.id === editingId && !alerts.rules.some((r) => r.id === draft.id);
  const editing = alerts.rules.find((r) => r.id === editingId) ?? (unsaved ? draft : narrow ? undefined : alerts.rules[0]);

  const labelOf = (rule: AlertRule) => {
    const keys = rule.source.kind === "sensor" ? rule.source.conditions.map((c) => c.key) : [];
    return keys.map((key) => {
      const point = key ? points.find((p) => p.key === key) : undefined;
      return { name: point?.name, unit: point?.unit };
    });
  };

  const editor = editing && (
    <AlertRuleEditor
      rule={editing}
      config={config}
      setConfig={unsaved ? (action, key) => setConfig((c) => { const next = typeof action === "function" ? action : () => action; return next(alertsOf(c).rules.some((r) => r.id === draft.id) ? c : addRule(c, draft)); }, key) : setConfig}
      active={active}
      points={points}
      current={current}
      pushPending={pushPending || unsaved}
      onBack={narrow ? () => onEdit(null) : undefined}
      onOpenSources={onOpenSources}
    />
  );
  if (narrow && editing) return <div className="min-h-0 flex-1 overflow-y-auto">{editor}</div>;

  return (
    <div className="grid min-h-0 flex-1 grid-cols-[308px_minmax(0,1fr)_minmax(0,468px)] max-[1179px]:block max-[1179px]:overflow-y-auto">
      <div className="flex min-w-0 flex-col gap-5 overflow-y-auto border-r border-ui-subtle px-4 py-5 max-[1179px]:border-r-0">
        <ActiveNow active={active} now={now} screens={config.profiles.length} />
        {alerts.rules.length > 0 && (
          <section className="flex flex-col gap-1" aria-label="Rules">
            <h2 className="pb-1 text-caption font-medium text-ui-3">Rules · {alerts.rules.length}</h2>
            <ul className="flex flex-col gap-1">
              {alerts.rules.map((rule) => (
                <RuleRow
                  key={rule.id}
                  rule={rule}
                  summary={summarizeRule(rule, labelOf(rule))}
                  style={shownAs(rule, alerts)}
                  fired={lastFired(history, rule.id)}
                  now={now}
                  selected={rule.id === editing?.id}
                  confirming={confirming === rule.id}
                  onOpen={() => onEdit(rule.id)}
                  onToggle={(enabled) => setConfig((c) => patchRule(c, rule.id, (r) => ({ ...r, enabled })), ruleKey(rule.id, "enabled"))}
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
          </section>
        )}
        <section className="flex flex-col gap-0.5" aria-label="Start from a preset">
          <h2 className="pb-1 text-caption font-medium text-ui-3">Start from a preset</h2>
          {ALERT_PRESETS.map((p) => (
            <button
              key={p.id}
              type="button"
              title={p.hint}
              onClick={() => add(presetRule(p, points))}
              className="flex h-9 items-center gap-2.5 rounded-ui-md px-2 text-body text-ui-2 hover:bg-ui-raised hover:text-ui-1 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ui-accent"
            >
              <Plus className="h-3.5 w-3.5 shrink-0 text-ui-3" aria-hidden />
              <span className="truncate">{p.label}</span>
            </button>
          ))}
        </section>
      </div>
      {editor ?? (
        <div className="col-span-2">
          <EmptyRules onAdd={add} points={points} />
        </div>
      )}
    </div>
  );
}
