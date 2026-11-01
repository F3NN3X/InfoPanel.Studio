import { ArrowRight, Monitor, PanelTop, SquarePlus, X } from "lucide-react";
import { formatReading, type DataPoint } from "@/lib/data-points";
import type { Usage } from "@/lib/data-usage";
import { barHeights, HISTORY_SIZE, type SampleHistory } from "@/lib/sample-history";
import type { SensorMap } from "@/modules/types";
import { cn } from "@/lib/utils";
import {
  TYPE_LABEL,
  displayValue,
  isBoundTo,
  rawValue,
  streamPath,
  usageName,
  type BindOption,
} from "./explorer-model";
import { Chip, CopyField, TypeIcon } from "./explorer-parts";
import { useCopy } from "./use-copy";

interface PointInspectorProps {
  point: DataPoint;
  values: SensorMap;
  history: SampleHistory;
  /** Bumps with every sample so the sparkline redraws. */
  tick: number;
  apiBase: string;
  usedBy: Usage[];
  /** Every place the point can be bound, the chosen one, and a way to change it. */
  options: BindOption[];
  target: BindOption | null;
  onTarget: (target: BindOption) => void;
  onBind: (zoneId: string, widgetId: string | undefined) => void;
  onUnbind: (zoneId: string, widgetId: string | undefined) => void;
  onNewWidget: () => void;
  /** Open a widget that uses the point in Design mode, on its Data tab. */
  onOpenUsage: (usage: Usage) => void;
  onClose: () => void;
}

/** The explorer's right column for one selected data point. */
export function PointInspector({
  point,
  values,
  history,
  tick,
  apiBase,
  usedBy,
  options,
  target,
  onTarget,
  onBind,
  onUnbind,
  onNewWidget,
  onOpenUsage,
  onClose,
}: PointInspectorProps) {
  const copy = useCopy();
  const live = point.key in values;
  const value = displayValue(point, values);
  const exact = point.type === "number" ? rawValue(point, values) : value;
  // `prefix` matches by prefix, so this also streams keys that extend this one ("cpu.temp2").
  const stream = streamPath(point.key);
  const crumb =
    point.containerTitle && point.containerTitle !== point.sourceName
      ? `${point.sourceName} › ${point.containerTitle}`
      : point.sourceName;
  const list = point.type === "list" ? (values[point.key]?.text ?? point.raw) : "";
  const bound = isBoundTo(usedBy, target);

  return (
    <div className="flex h-full w-full flex-col gap-4 overflow-y-auto bg-ui-panel p-4 font-ui text-ui-2">
      <div className="flex items-start gap-2.5">
        <div className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-s-divider">
          <TypeIcon type={point.type} className="h-[18px] w-[18px] text-[oklch(0.78_0.12_255)]" />
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="break-words text-[14px] font-semibold leading-[1.3] text-ui-1">{point.name}</span>
          <span className="text-[11.5px] text-ui-4">{crumb}</span>
        </div>
        <button
          type="button"
          aria-label="Close point inspector"
          title="Close point inspector"
          onClick={onClose}
          className="text-ui-3 hover:text-ui-1"
        >
          <X className="h-[18px] w-[18px]" />
        </button>
      </div>

      <div className="flex flex-col gap-2.5 rounded-[10px] border border-ui-default bg-ui-app p-3.5">
        <div className="flex items-center gap-1.5">
          <Chip className="px-[7px] py-0.5 text-micro text-ui-2 rounded-[9px]">{TYPE_LABEL[point.type]}</Chip>
          {point.kind && <Chip className="px-[7px] py-0.5 text-micro text-ui-2 rounded-[9px]">{point.kind}</Chip>}
          {live && (
            <span className="ml-auto flex items-center gap-1 text-micro text-ui-success">
              <span className="h-[5px] w-[5px] rounded-full bg-ui-success" />
              Live
            </span>
          )}
        </div>
        <span
          className={cn(
            "break-words text-[24px] font-semibold leading-[1.15] tracking-[-0.01em]",
            point.type === "empty" ? "text-ui-4" : "text-ui-1"
          )}
        >
          {point.type === "empty" ? "No value" : point.type === "list" ? `${list.split("\n").length} lines` : value}
        </span>
        {point.type === "number" && live && <History history={history} pointKey={point.key} unit={values[point.key]?.unit} tick={tick} />}
        {point.type === "list" && (
          <pre className="max-h-[180px] overflow-auto whitespace-pre-wrap break-words font-ui-mono text-[11px] leading-[1.55] text-ui-2">
            {list}
          </pre>
        )}
      </div>

      {exact !== value && <CopyField label="Exact value" value={exact} onCopy={copy} />}
      <CopyField label="Key" value={point.key} onCopy={copy} />
      <CopyField label="Stream just this value" value={`${apiBase}${stream}`} display={stream} get onCopy={copy} />

      <div className="flex flex-col gap-2 border-t border-ui-subtle pt-3.5">
        <span className="text-[12.5px] font-semibold text-ui-1">Used by</span>
        {usedBy.map((u) => {
          const Icon = u.panelWidgetId ? PanelTop : Monitor;
          return (
            <button
              key={`${u.zoneId}:${u.panelWidgetId ?? ""}`}
              type="button"
              onClick={() => onOpenUsage(u)}
              className="flex items-center gap-2 rounded-[7px] bg-ui-raised px-2 py-[7px] text-left text-[12px] text-ui-1 hover:bg-ui-subtle"
            >
              <Icon className="h-4 w-4 shrink-0 text-ui-4" aria-hidden />
              <span className="min-w-0 flex-1 truncate" title={u.label}>
                {usageName(u)}
              </span>
              <ArrowRight className="h-4 w-4 shrink-0 text-ui-4" aria-hidden />
            </button>
          );
        })}
        {usedBy.length === 0 && <span className="text-[12px] text-ui-4">Not used in this layout yet.</span>}

        <div className="mt-1 flex gap-1.5">
          <select
            aria-label="Widget to bind to"
            value={target ? options.indexOf(target) : ""}
            disabled={options.length === 0}
            onChange={(e) => onTarget(options[Number(e.target.value)])}
            className="h-8 min-w-0 flex-1 rounded-[7px] border border-ui-strong bg-ui-hover px-1.5 text-[12px] text-ui-1 outline-none focus:border-ui-accent/60"
          >
            {options.length === 0 && <option value="">No widgets yet</option>}
            {options.map((o, i) => (
              <option key={`${o.zoneId}:${o.widgetId ?? ""}`} value={i}>
                {o.label}
              </option>
            ))}
          </select>
          <button
            type="button"
            disabled={!target}
            onClick={() => target && (bound ? onUnbind(target.zoneId, target.widgetId) : onBind(target.zoneId, target.widgetId))}
            className="h-8 shrink-0 rounded-[7px] bg-ui-inverse px-3.5 text-[12px] font-semibold text-ui-inverse-fg hover:opacity-90 disabled:opacity-40"
          >
            {bound ? "Unbind" : "Bind"}
          </button>
        </div>
        <button
          type="button"
          onClick={onNewWidget}
          className="flex h-8 items-center justify-center gap-1.5 rounded-[7px] border border-ui-strong bg-ui-raised text-[12px] text-ui-1 hover:bg-ui-subtle"
        >
          <SquarePlus className="h-4 w-4" />
          New widget from this value
        </button>
      </div>
    </div>
  );
}

/** The last samples as bars, then min / avg / max; the space is kept before the second sample arrives. */
function History({ history, pointKey, unit, tick }: { history: SampleHistory; pointKey: string; unit?: string; tick: number }) {
  void tick;
  const samples = history.get(pointKey);
  const stats = samples.length >= 2 ? history.stats(pointKey) : null;
  const heights = barHeights(samples);
  const fmt = (n: number) => formatReading(n, unit);
  return (
    <>
      <div className="flex h-12 items-end gap-0.5" role="img" aria-label={`Last ${HISTORY_SIZE} samples`}>
        {stats &&
          heights.map((h, i) => (
            <div
              key={i}
              style={{ height: `${h}%` }}
              className={cn("flex-1 rounded-[1px]", i === heights.length - 1 ? "bg-ui-accent" : "bg-ui-accent/35")}
            />
          ))}
      </div>
      <div className="grid grid-cols-3 gap-1.5">
        {(
          [
            ["Min", stats?.min],
            ["Avg", stats?.avg],
            ["Max", stats?.max],
          ] as const
        ).map(([label, n]) => (
          <div key={label} className="flex flex-col gap-px">
            <span className="text-micro leading-[1.25] text-ui-4">{label}</span>
            <span className="font-ui-mono text-[11.5px] leading-[1.25] text-ui-1">{n === undefined ? "—" : fmt(n)}</span>
          </div>
        ))}
      </div>
    </>
  );
}
