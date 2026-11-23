import { useEffect, useId, useRef } from "react";
import { ArrowLeftRight, X } from "lucide-react";
import { ChartSummary, chartSummary } from "@/components/ui/chart-summary";
import { Sparkline } from "@/components/ui/sensor-row";
import { useToast } from "@/components/ui/toast";
import { useSensors } from "@/hooks/useSensors";
import type { DataModel, DataPoint } from "@/lib/data-points";
import { bindPoint, unbindPoint, type UsageIndex } from "@/lib/data-usage";
import { recordThrottled, SampleHistory } from "@/lib/sample-history";
import type { DashboardConfig, ProfileView, Placement } from "@/lib/layout";
import { cn } from "@/lib/utils";
import { modules } from "@/modules";
import { boundRows, inProfile, liveText, pointPlace } from "./bound-data-model";
import { DataPicker } from "./data-picker";
import { widgetName } from "../widget-kinds";
import { zoneName } from "./zone-meta";

interface BoundDataProps {
  zone: Placement;
  config: DashboardConfig;
  data: { model: DataModel; usage: UsageIndex };
  /** A panel's selected widget: Bind sets its sensor. */
  selectedWidgetId: string | null;
  /** Edit the active profile (one undo step per `key`). */
  updateProfile: (fn: (p: ProfileView) => ProfileView, key?: string) => void;
  /** Open a point in Sources mode. */
  onOpenPoint: (key: string) => void;
  /** Open Sources mode (the picker's "Open data explorer"). */
  onOpenExplorer: () => void;
  /** The picker is open (kept by the inspector: "Bind data…" opens it too). */
  picker: boolean;
  onPicker: (open: boolean) => void;
}

/**
 * The Data tab's Values (02c, README §4.9): the points the zone reads with their
 * key, a sparkline of what this tab has seen and the live value, Change values…
 * (the picker) and unbind. A widget binds through its source setting (a whole
 * container); a panel binds its selected widget's sensor. Values the widget picks
 * up by itself carry the Auto chip: they can't be unbound, only changed.
 */
export function BoundData({
  zone,
  config,
  data,
  selectedWidgetId,
  updateProfile,
  onOpenPoint,
  onOpenExplorer,
  picker,
  onPicker,
}: BoundDataProps) {
  const toast = useToast();
  const { model, usage } = data;
  const rows = boundRows(zone, usage, model);
  const live = useSensors(rows.map((r) => r.key));
  // The sparklines' last 60 samples, only of the rows in view, from the values this row already receives.
  const history = useRef(new SampleHistory(60));
  const summaryId = useId();
  useEffect(() => void recordThrottled(history.current, live, Date.now()), [live]);
  const title = zoneName(zone);
  const widget = zone.panel?.widgets.find((w) => w.id === selectedWidgetId);
  const mode = zone.panel ? "item" : "widget";

  const apply = (fn: (c: DashboardConfig) => DashboardConfig, key: string) => updateProfile(inProfile(config, fn), key);
  const unbind = (key: string, panelWidgetId: string | undefined) => {
    apply((c) => unbindPoint(c, zone.id, panelWidgetId, key, modules, model), `bind:${key}`);
    toast(`Unbound from ${title}`);
  };
  const bind = (p: DataPoint) => {
    const panelWidgetId = widget?.id;
    if (bindPoint(config, zone.id, panelWidgetId, p.key, modules, model) === config) {
      toast(`${title} can't bind a single value`);
      return;
    }
    apply((c) => bindPoint(c, zone.id, panelWidgetId, p.key, modules, model), `bind:${p.key}`);
    toast(`Bound to ${title}`);
  };
  const bound = new Set(mode === "item" ? [widget?.sensor].filter((k): k is string => !!k) : rows.map((r) => r.key));
  const canUnbind = (key: string, panelWidgetId: string | undefined) =>
    panelWidgetId !== undefined || unbindPoint(config, zone.id, undefined, key, modules, model) !== config;

  /** The source the values come from, when the widget picked them itself: nothing here can be unbound. */
  const auto = rows.length > 0 && rows.every((r) => !canUnbind(r.key, r.panelWidgetId)) ? (rows[0].point?.containerTitle ?? rows[0].point?.sourceName) : undefined;

  const openPicker = () => {
    if (zone.panel && !widget) return toast("Select a widget in the panel first");
    onPicker(true);
  };

  return (
    <div className="space-y-2">
      <div className="flex min-h-6 items-center gap-2">
        <span className="text-body font-medium text-ui-1">Values</span>
        {auto && <span className="ml-auto max-w-50 truncate rounded-full border border-ui-strong px-2 py-0.5 text-micro text-ui-3">Auto · {auto}</span>}
      </div>
      {rows.length === 0 ? (
        <span className="block text-caption text-ui-3">No data bound yet. Change values to make this widget live.</span>
      ) : (
        <ul className="divide-y divide-ui-subtle">
          {rows.map(({ key, point, panelWidgetId }, i) => {
            const value = liveText(live[key], point);
            const samples = history.current.get(key);
            const name = point?.name ?? key;
            return (
              <li key={`${panelWidgetId ?? ""}:${key}`} className="group/value flex min-h-12 items-center gap-1">
                <button
                  type="button"
                  onClick={() => onOpenPoint(key)}
                  title={`${pointPlace(point)}: open ${key} in Sources`}
                  className="flex min-w-0 flex-1 items-center gap-2 rounded-ui-sm text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ui-accent"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-body text-ui-1">{name}</span>
                    <span className="block truncate font-ui-mono text-micro text-ui-hint">{key}</span>
                  </span>
                  <Sparkline samples={samples} label={`${name}, last 60 s`} describedBy={`${summaryId}-${i}`} className="w-12" />
                  <span className={cn("max-w-20 shrink-0 truncate text-right font-ui-mono text-caption tabular-nums", value === null ? "text-ui-warn" : "text-ui-1")}>{value ?? "No data"}</span>
                </button>
                <ChartSummary id={`${summaryId}-${i}`} text={chartSummary({ name, span: "last 60 s", samples, unit: point?.unit })} />
                {canUnbind(key, panelWidgetId) && (
                  <button
                    type="button"
                    onClick={() => unbind(key, panelWidgetId)}
                    aria-label={`Unbind ${point?.name ?? key}`}
                    title="Unbind"
                    className="flex h-5.5 w-5.5 shrink-0 items-center justify-center rounded-6 text-ui-3 hover:bg-ui-hover hover:text-ui-1"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
      <button
        type="button"
        onClick={openPicker}
        className="flex h-8 items-center gap-1.5 rounded-ui-md border border-ui-strong bg-ui-raised px-3 text-body text-ui-1 hover:bg-ui-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ui-accent"
      >
        <ArrowLeftRight className="h-4 w-4 text-ui-3" aria-hidden /> Change values…
      </button>
      {auto && <p className="text-caption leading-snug text-ui-3">The widget picks these up by itself. Change one to pin it.</p>}
      <DataPicker
        open={picker}
        onOpenChange={onPicker}
        title={mode === "item" ? `Pick a sensor for ${widget ? widgetName(widget) : "this widget"}` : `Bind data to ${title}`}
        points={model.points}
        mode={mode}
        bound={bound}
        onToggle={(p) => {
          if (mode === "item" || !bound.has(p.key)) return bind(p);
          if (canUnbind(p.key, undefined)) return unbind(p.key, undefined);
          toast(`${title} always reads this value`);
        }}
        onOpenExplorer={onOpenExplorer}
      />
    </div>
  );
}
