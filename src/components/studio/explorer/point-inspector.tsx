import { ArrowUpRight, Bell, Monitor, PanelTop, Plus, SquarePlus, X } from "lucide-react";
import { Button, FOCUS_RING } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { IconButton } from "@/components/ui/icon-button";
import { Popover } from "@/components/ui/popover";
import { sparkSummary } from "@/components/ui/sensor-row";
import { StatusChip } from "@/components/ui/status-chip";
import type { HistoryRecorder } from "@/lib/data-history";
import { formatReading, type DataPoint } from "@/lib/data-points";
import type { Usage } from "@/lib/data-usage";
import type { SensorMap } from "@/modules/types";
import { cn } from "@/lib/utils";
import { AreaChart } from "./area-chart";
import {
  TYPE_LABEL,
  agoText,
  displayValue,
  isBoundTo,
  isImagePoint,
  rawValue,
  splitNumber,
  streamPath,
  usageName,
  type BindOption,
} from "./explorer-model";
import { CopyField, FIELD_LABEL, TypeIcon } from "./explorer-parts";
import { Thumb } from "./point-table";
import { useCopy } from "./use-copy";

interface PointInspectorProps {
  point: DataPoint;
  values: SensorMap;
  recorder: HistoryRecorder;
  apiBase: string;
  /** The active screen's name, the tag on the widgets that use the point. */
  screenName: string;
  usedBy: Usage[];
  /** The alert rules that watch the point. */
  alertRules: { id: string; name: string }[];
  /** The display name its source shows on every screen (null when its source has none to edit). */
  displayName: { key: string; value: string; name: string } | null;
  onDisplayName: (key: string, displayName: string | undefined) => void;
  /** Every place the point can be bound, the chosen one, and a way to change it. */
  options: BindOption[];
  target: BindOption | null;
  onTarget: (target: BindOption) => void;
  onBind: (zoneId: string, widgetId: string | undefined) => void;
  onUnbind: (zoneId: string, widgetId: string | undefined) => void;
  onNewWidget: () => void;
  /** Open a widget that uses the point in Design mode, on its Data tab. */
  onOpenUsage: (usage: Usage) => void;
  /** Open Alerts (Create alert starts a rule on the point's key; a rule that watches it opens plain). */
  onOpenAlerts: (sensorKey?: string) => void;
  onClose: () => void;
}

const USED_ROW = cn(
  "flex h-9 items-center gap-2 rounded-ui-md border border-ui-subtle bg-ui-tile px-3 text-left text-body text-ui-1 hover:border-ui-hover-edge",
  FOCUS_RING
);

/** Min, average and max of the samples, or null before the first. */
function statsOf(samples: readonly number[]): { min: number; avg: number; max: number } | null {
  if (samples.length === 0) return null;
  return { min: Math.min(...samples), avg: samples.reduce((a, b) => a + b, 0) / samples.length, max: Math.max(...samples) };
}

/** The Data page's right column for one selected data point. */
export function PointInspector({
  point,
  values,
  recorder,
  apiBase,
  screenName,
  usedBy,
  alertRules,
  displayName,
  onDisplayName,
  options,
  target,
  onTarget,
  onBind,
  onUnbind,
  onNewWidget,
  onOpenUsage,
  onOpenAlerts,
  onClose,
}: PointInspectorProps) {
  const copy = useCopy();
  const live = point.key in values;
  const value = displayValue(point, values);
  const exact = point.type === "number" ? rawValue(point, values) : value;
  // `prefix` matches by prefix, so this also streams keys that extend this one ("cpu.temp2").
  const stream = streamPath(point.key);
  const crumb =
    point.containerTitle && point.containerTitle !== point.sourceName ? `${point.sourceName} · ${point.containerTitle}` : point.sourceName;
  const list = point.type === "list" ? (values[point.key]?.text ?? point.raw) : "";
  const bound = isBoundTo(usedBy, target);
  const image = isImagePoint(point);
  const reading = point.type === "number" ? values[point.key] : undefined;
  const unit = reading?.unit ?? point.unit;
  // Before the buffer has its first sample, the reading on screen is the one sample.
  const kept = point.type === "number" ? recorder.history.get(point.key) : [];
  const samples = kept.length === 0 && typeof reading?.value === "number" ? [reading.value] : kept;
  const stats = statsOf(samples);
  const fmt = (n: number) => formatReading(n, unit);
  const split = point.type === "number" ? splitNumber(value) : null;
  const recent = point.type === "number" || point.type === "empty" ? [] : [...recorder.changesOf(point.key)].reverse();
  const now = Date.now();

  return (
    <div className="flex h-full w-full flex-col gap-5 overflow-y-auto bg-ui-panel p-4 font-ui text-ui-2">
      <div className="flex items-center gap-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-ui-md bg-ui-raised">
          <TypeIcon type={point.type} image={image} className="h-4.5 w-4.5 text-ui-hint" />
        </span>
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-lead font-medium text-ui-1">{point.name}</span>
          <span className="truncate text-caption text-ui-3">{crumb}</span>
        </div>
        {live && <StatusChip tone="ok">Live</StatusChip>}
        <IconButton label="Close point inspector" size={28} onClick={onClose}>
          <X className="h-4 w-4" strokeWidth={1.5} />
        </IconButton>
      </div>

      <div className="flex flex-col gap-3 rounded-ui-lg border border-ui-subtle bg-ui-tile p-4">
        <div className="flex items-baseline gap-2">
          {point.type === "number" ? (
            <span className="min-w-0 truncate font-ui-mono text-[30px] leading-none tabular-nums text-ui-1">
              {split ? split.num : value}
              {split && <span className="ml-1.5 text-lead text-ui-hint">{split.unit}</span>}
            </span>
          ) : point.type === "empty" ? (
            <span className="font-ui-mono text-lead text-ui-3">No value</span>
          ) : point.type === "list" ? (
            <span className="font-ui-mono text-lead text-ui-1">{list.split("\n").length} lines</span>
          ) : image ? (
            <span className="font-ui-mono text-lead text-ui-1">image</span>
          ) : (
            <span className="min-w-0 break-words font-ui-mono text-lead leading-[1.3] text-ui-1">{value}</span>
          )}
          {point.type === "number" && <span className="ml-auto whitespace-nowrap text-caption text-ui-3">Last 60 s</span>}
        </div>
        {point.type === "number" && live && (
          <>
            <AreaChart samples={samples} label={sparkSummary(point.name, samples, unit)} />
            <dl className="m-0 grid grid-cols-3 gap-2">
              {(
                [
                  ["Min", stats?.min],
                  ["Avg", stats?.avg],
                  ["Max", stats?.max],
                ] as const
              ).map(([label, n]) => (
                <div key={label} className="flex flex-col gap-0.5">
                  <dt className="text-caption text-ui-3">{label}</dt>
                  <dd className="m-0 font-ui-mono text-body tabular-nums text-ui-1">{n === undefined ? "—" : fmt(n)}</dd>
                </div>
              ))}
            </dl>
          </>
        )}
        {image && <Thumb src={values[point.key]?.text?.trim() || point.raw} className="aspect-square w-full" />}
        {point.type === "list" && (
          <pre className="m-0 max-h-45 overflow-auto whitespace-pre-wrap break-words font-ui-mono text-caption leading-[1.55] text-ui-2">{list}</pre>
        )}
        {recent.length > 0 && (
          <div className="flex flex-col gap-1">
            <span className={FIELD_LABEL}>Recent values</span>
            <ul className="m-0 flex list-none flex-col p-0">
              {recent.map((c) => (
                <li key={c.at} className="flex h-8 items-center gap-3 text-caption">
                  <span className="shrink-0 text-ui-3">{agoText(c.at, now)}</span>
                  <span className="ml-auto flex min-w-0 items-center justify-end">
                    {image ? <Thumb src={c.text} className="h-6 w-6" /> : <span className="truncate font-ui-mono text-ui-1">{c.text || "empty"}</span>}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
        <span className="text-caption text-ui-hint">{image ? "Image" : TYPE_LABEL[point.type]}{point.kind ? ` · ${point.kind}` : ""}</span>
      </div>

      {displayName && (
        <label className="flex flex-col gap-1.5">
          <span className={FIELD_LABEL}>Display name · shown on every screen</span>
          <Field
            key={displayName.value}
            defaultValue={displayName.value}
            placeholder={displayName.name}
            aria-label={`Display name of ${displayName.name}`}
            onBlur={(e) => {
              const next = e.currentTarget.value.trim();
              if (next !== displayName.value) onDisplayName(displayName.key, next || undefined);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") e.currentTarget.blur();
              if (e.key === "Escape") {
                e.stopPropagation();
                e.currentTarget.value = displayName.value; // the blur that follows must not save the edit
                e.currentTarget.blur();
              }
            }}
          />
        </label>
      )}
      {exact !== value && <CopyField label="Exact value" value={exact} onCopy={copy} />}
      <CopyField label="Key" value={point.key} onCopy={copy} />
      <CopyField label="Stream just this value" value={`${apiBase}${stream}`} display={stream} get onCopy={copy} />

      <div className="flex flex-col gap-2">
        <span className={FIELD_LABEL}>Used by</span>
        {alertRules.map((r) => (
          <button key={r.id} type="button" onClick={() => onOpenAlerts()} className={USED_ROW}>
            <Bell className="h-4 w-4 shrink-0 text-ui-hint" strokeWidth={1.5} aria-hidden />
            <span className="min-w-0 flex-1 truncate" title={r.name}>
              {r.name}
            </span>
            <span className="shrink-0 text-caption text-ui-3">Alert</span>
            <ArrowUpRight className="h-4 w-4 shrink-0 text-ui-hint" strokeWidth={1.5} aria-hidden />
          </button>
        ))}
        {usedBy.map((u) => {
          const Icon = u.panelWidgetId ? PanelTop : Monitor;
          return (
            <button key={`${u.zoneId}:${u.panelWidgetId ?? ""}`} type="button" onClick={() => onOpenUsage(u)} className={USED_ROW}>
              <Icon className="h-4 w-4 shrink-0 text-ui-hint" strokeWidth={1.5} aria-hidden />
              <span className="min-w-0 flex-1 truncate" title={u.label}>
                {usageName(u)}
              </span>
              <span className="max-w-[40%] shrink-0 truncate text-caption text-ui-3">{screenName}</span>
              <ArrowUpRight className="h-4 w-4 shrink-0 text-ui-hint" strokeWidth={1.5} aria-hidden />
            </button>
          );
        })}
        {usedBy.length === 0 && alertRules.length === 0 && <span className="text-body text-ui-3">Not used on this screen yet</span>}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Popover
          align="start"
          side="top"
          className="flex w-75 flex-col gap-2 p-3"
          triggerClassName={cn(
            "inline-flex h-8 items-center gap-1.5 whitespace-nowrap rounded-ui-md border border-ui-strong bg-ui-raised px-3 text-body font-medium text-ui-1 hover:border-ui-hover-edge [&_svg]:h-4 [&_svg]:w-4",
            FOCUS_RING
          )}
          trigger={
            <>
              <Plus strokeWidth={1.75} />
              Use in a widget…
            </>
          }
        >
          <span className={FIELD_LABEL}>Widget to bind to</span>
          <div className="flex gap-2">
            <select
              aria-label="Widget to bind to"
              value={target ? options.indexOf(target) : ""}
              disabled={options.length === 0}
              onChange={(e) => onTarget(options[Number(e.target.value)])}
              className={cn("h-8 min-w-0 flex-1 rounded-ui-md border border-ui-control bg-ui-chrome px-2 text-body text-ui-1", FOCUS_RING)}
            >
              {options.length === 0 && <option value="">No widgets yet</option>}
              {options.map((o, i) => (
                <option key={`${o.zoneId}:${o.widgetId ?? ""}`} value={i}>
                  {o.label}
                </option>
              ))}
            </select>
            <Button
              disabled={!target}
              onClick={() => target && (bound ? onUnbind(target.zoneId, target.widgetId) : onBind(target.zoneId, target.widgetId))}
            >
              {bound ? "Unbind" : "Bind"}
            </Button>
          </div>
          <Button icon={<SquarePlus strokeWidth={1.5} />} onClick={onNewWidget}>
            New widget from this value
          </Button>
        </Popover>
        <Button variant="ghost" icon={<Bell strokeWidth={1.5} />} onClick={() => onOpenAlerts(point.key)}>
          Create alert
        </Button>
      </div>
    </div>
  );
}
