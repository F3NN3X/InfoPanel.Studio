import { onRovingKeyDown } from "@/lib/roving";
import { useEffect, useState } from "react";
import type { HistorySetter } from "@/hooks/use-config-history";
import type { ActiveAlert, AlertRule } from "@/lib/alerts";
import type { DataPoint } from "@/lib/data-points";
import type { DashboardConfig, MonitorProfile } from "@/lib/layout";
import { cn } from "@/lib/utils";
import { AlertDefaults } from "./alerts-defaults";
import { ActiveList, HistoryList, useAlertHistory } from "./alerts-live";
import { addRule, alertsKey, alertsOf } from "./alerts-model";
import { AlertRules, NewRuleMenu } from "./alerts-rules";
import { IslandTab } from "./island-tab";
import type { NavTarget } from "./studio-nav";

/** The tabs of Alerts & Island (SPEC §10.3). */
export type AlertsTab = "rules" | "island" | "defaults" | "history";

const TABS: { id: AlertsTab; label: string }[] = [
  { id: "rules", label: "Rules" },
  { id: "island", label: "Island" },
  { id: "defaults", label: "Defaults" },
  { id: "history", label: "History" },
];

interface AlertsViewProps {
  tab: AlertsTab;
  onTab: (tab: AlertsTab) => void;
  config: DashboardConfig;
  setConfig: HistorySetter;
  /** The alerts the server holds now (the control channel). */
  active: ActiveAlert[];
  /** The live catalogue: summaries name sensors, presets pick one. */
  points: readonly DataPoint[];
  /** The stored screen and its page on the canvas. */
  screen: MonitorProfile;
  page: string;
  /** Edits the server does not have yet (Test waits). */
  pushPending: boolean;
  /** The rule open in the editor (view state), null = the list. */
  editingId: string | null;
  onEdit: (id: string | null) => void;
  /** The sensor pickers' "Open data explorer". */
  onOpenSources: () => void;
  /** Show a widget on the canvas (its screen and page) and open its Behaviour tab. */
  onOpenZone: (profileId: string, pageId: string, zoneId: string) => void;
  navigateTo: (target: NavTarget) => void;
}

/** History: "Active now" on top (acknowledge or dismiss), then what fired before. */
function HistoryTab({ active }: { active: ActiveAlert[] }) {
  const history = useAlertHistory(active);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 5000);
    return () => clearInterval(t);
  }, []);
  return (
    <div className="flex max-w-[720px] flex-col gap-5">
      <section className="flex flex-col gap-2">
        <h2 className="font-ui-mono text-[10px] font-medium uppercase tracking-[.06em] text-ui-4">Active now</h2>
        <ActiveList active={active} now={now} />
      </section>
      <section className="flex flex-col gap-2">
        <h2 className="font-ui-mono text-[10px] font-medium uppercase tracking-[.06em] text-ui-4">History</h2>
        <HistoryList history={history} now={now} />
      </section>
    </div>
  );
}

/**
 * Alerts & Island (SPEC §10.3): the rules and their editor, the island's settings, the display defaults and
 * the history with the alerts active now. Rules are config, so each edit is an undo step; the live list is
 * server state.
 */
export function AlertsView({ tab, onTab, config, setConfig, active, points, screen, page, pushPending, editingId, onEdit, onOpenSources, onOpenZone, navigateTo }: AlertsViewProps) {
  const add = (rule: AlertRule) => {
    setConfig((c) => addRule(c, rule), alertsKey(`add:${rule.id}`));
    onEdit(rule.id);
  };
  return (
    <section aria-label="Alerts & Island" className="flex min-h-0 min-w-0 flex-1 flex-col bg-ui-app font-ui">
      <div className="flex shrink-0 items-center gap-4 border-b border-ui-subtle px-6 max-sm:flex-wrap max-sm:gap-x-3 max-sm:px-3">
        <h1 className="whitespace-nowrap py-3 text-[15px] font-semibold text-ui-1">Alerts &amp; Island</h1>
        {/* On a phone the tabs take their own row under the title and the New rule button. */}
        <div role="tablist" aria-label="Alerts & Island" onKeyDown={(e) => onRovingKeyDown(e, '[role="tab"]')} className="flex gap-1 self-stretch max-sm:order-last max-sm:w-full max-sm:overflow-x-auto">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={tab === t.id}
              tabIndex={tab === t.id ? 0 : -1}
              onClick={() => onTab(t.id)}
              className={cn(
                "shrink-0 border-b-2 px-3 text-[12.5px] hover:text-ui-1 max-sm:py-2.5",
                tab === t.id ? "border-ui-1 text-ui-1" : "border-transparent text-ui-3"
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
        <span className="flex-1" />
        {tab === "rules" && !editingId && <NewRuleMenu onAdd={add} points={points} />}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5 max-sm:px-3">
        {tab === "rules" && (
          <AlertRules
            config={config}
            setConfig={setConfig}
            active={active}
            points={points}
            current={{ profile: screen.id, page }}
            pushPending={pushPending}
            editingId={editingId}
            onEdit={onEdit}
            onOpenSources={onOpenSources}
          />
        )}
        {tab === "island" && (
          <IslandTab config={config} setConfig={setConfig} current={screen} onOpenZone={onOpenZone} onOpenExplorer={onOpenSources} navigateTo={navigateTo} />
        )}
        {tab === "defaults" && <AlertDefaults alerts={alertsOf(config)} setConfig={setConfig} />}
        {tab === "history" && <HistoryTab active={active} />}
      </div>
    </section>
  );
}
