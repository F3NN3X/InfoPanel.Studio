/**
 * The InfoPanel editor's sensor picker: the live Data API sensors, searchable, grouped by source
 * and device. Picking one binds the item natively (SensorType and ids from the sensor's `ref`),
 * or for the preview only when this InfoPanel build reports no ref. Tables and web images list
 * plugin sensors only, as InfoPanel does.
 */
import { useEffect, useMemo, useState } from "react";
import { VirtualRows } from "@/components/ui/virtual-rows";
import { DialogParts } from "@/components/ui/dialog";
import { Search, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { refreshCatalog, useSensorCatalog } from "@/lib/catalog";
import type { DataPoint } from "@/lib/data-points";
import { useDataModel } from "@/lib/use-data-model";
import type { ChosenSensor } from "@/lib/infopanel/editor/bind";
import { chosenOf, isNative, NOT_EXPORTABLE, pickerSections } from "@/lib/infopanel/editor/sensor-list";
import type { DataApiValue } from "@/lib/infopanel/sensors";

interface SensorPickerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** "Choose a sensor for Bar". */
  title: string;
  pluginOnly: boolean;
  /** The key the item reads now. */
  current?: string | null;
  onPick: (sensor: ChosenSensor) => void;
}

/** The list's rows: a section's header, then its sensors. */
type PickerRow = { kind: "head"; title: string } | { kind: "sensor"; point: DataPoint };

const HEAD_H = 30;
const HEAD_CLASS = "-mx-1 flex items-end bg-ui-tile px-3.5 pb-1 text-caption font-medium text-ui-3";
const SENSOR_H = 48;
const rowKey = (row: PickerRow): string => (row.kind === "head" ? `h:${row.title}` : row.point.key);
const rowHeight = (row: PickerRow): number => (row.kind === "head" ? HEAD_H : SENSOR_H);
const isHead = (row: PickerRow): boolean => row.kind === "head";
const isSensor = (row: PickerRow): boolean => row.kind === "sensor";

export function SensorPicker({ open, onOpenChange, title, pluginOnly, current, onPick }: SensorPickerProps) {
  const [query, setQuery] = useState("");
  const catalog = useSensorCatalog();
  const sensors = catalog.sensors as Record<string, DataApiValue>;
  useEffect(() => {
    if (open) void refreshCatalog();
  }, [open]);
  const model = useDataModel();
  const sections = useMemo(() => pickerSections(model.points, sensors, query, pluginOnly), [model, sensors, query, pluginOnly]);
  const rows = useMemo<PickerRow[]>(() => sections.flatMap((s) => [{ kind: "head" as const, title: s.title }, ...s.points.map((point) => ({ kind: "sensor" as const, point }))]), [sections]);
  const noRefs = model.points.length > 0 && model.points.every((p) => !sensors[p.key]?.ref);
  const pick = (p: DataPoint) => {
    onPick(chosenOf(p, sensors));
    onOpenChange(false);
  };
  return (
    <DialogParts.Root
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next) setQuery("");
      }}
    >
      <DialogParts.Content
        layout="panel"
        data-help-article="infopanel-editor"
        className="top-[10vh] translate-y-0 flex max-h-[72vh] w-[min(600px,calc(100vw-32px))] flex-col overflow-hidden rounded-xl bg-ui-tile"
      >
        <div className="flex shrink-0 flex-col gap-2.5 border-b border-ui-subtle px-4 pb-2.5 pt-3.5">
          <div className="flex items-center justify-between">
            <DialogParts.Title className="text-lead font-medium">{title}</DialogParts.Title>
            <DialogParts.Close aria-label="Close" className="text-ui-3 hover:text-ui-1">
              <X className="h-4.5 w-4.5" />
            </DialogParts.Close>
          </div>
          <div className="flex h-9 items-center gap-2 rounded-lg border border-ui-accent bg-ui-app px-2.5">
            <Search className="h-4.25 w-4.25 shrink-0 text-ui-4" />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={pluginOnly ? "Search plugin sensors" : "Search sensors, e.g. gpu temp"}
              aria-label="Search sensors"
              className="min-w-0 flex-1 bg-transparent text-body text-ui-1 outline-none placeholder:text-ui-4"
            />
          </div>
          {noRefs && <p className="text-caption leading-snug text-ui-warn">{NOT_EXPORTABLE}. A choice binds the preview only.</p>}
        </div>
        {catalog.status === "error" && <p className="px-3 py-6 text-center text-caption text-ui-4">The Data API isn’t reachable, so there are no sensors to choose</p>}
        {catalog.status !== "error" && sections.length === 0 && (
          <p className="px-3 py-6 text-center text-caption text-ui-4">{pluginOnly ? "No plugin sensors match." : "No sensors match."}</p>
        )}
        {rows.length > 0 && (
          <VirtualRows
            resetKey={query}
            role="listbox"
            aria-label="Sensors"
            className="px-1 py-1"
            rows={rows}
            rowKey={rowKey}
            rowHeight={rowHeight}
            isSticky={isHead}
            isFocusable={isSensor}
            renderPinned={(row) => row.kind === "head" && <div aria-hidden className={HEAD_CLASS} style={{ height: HEAD_H }}>{row.title}</div>}
            renderRow={(row, tabIndex) => {
              if (row.kind === "head") {
                return (
                  <div role="group" aria-label={row.title} className={HEAD_CLASS} style={{ height: HEAD_H }}>
                    {row.title}
                  </div>
                );
              }
              const p = row.point;
              const ref = sensors[p.key]?.ref;
              const native = isNative(p.key, sensors);
              return (
                <button
                  type="button"
                  data-row
                  role="option"
                  tabIndex={tabIndex}
                  aria-selected={p.key === current}
                  title={native ? ref : `${p.key} · ${NOT_EXPORTABLE}`}
                  onClick={() => pick(p)}
                  style={{ height: SENSOR_H }}
                  className={cn("flex w-full items-center gap-2.5 rounded-8 px-2.5 py-1.5 text-left hover:bg-s-divider", p.key === current && "bg-ui-accent/10")}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-body text-ui-1">{p.name}</span>
                    <span className="block truncate font-ui-mono text-micro text-ui-4">{native ? ref : `${p.key} · preview only`}</span>
                  </span>
                  <span className="max-w-37.5 shrink-0 truncate font-ui-mono text-caption text-ui-2">{p.raw}</span>
                </button>
              );
            }}
          />
        )}
      </DialogParts.Content>
    </DialogParts.Root>
  );
}
