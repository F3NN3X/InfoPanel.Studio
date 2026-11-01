import { useMemo, useState } from "react";
import { Pencil, X } from "lucide-react";
import { useSensors } from "@/hooks/useSensors";
import { refreshCatalog, useSensorCatalog } from "@/lib/catalog";
import { buildDataModel } from "@/lib/data-points";
import { sensorAt } from "@/lib/sensors";
import { DataPicker } from "../inspector/data-picker";
import { liveText } from "../inspector/bound-data-model";
import { StackRow, type RowLabelProps } from "../setting-rows";
import { sensorName } from "../widget-kinds";

const SMALL_BUTTON =
  "flex h-6 w-6 items-center justify-center rounded-[5px] text-ui-4 hover:bg-ui-hover hover:text-ui-1";

interface SensorFieldProps {
  label: string;
  hint?: string;
  /** Before the label (the source dot). */
  lead?: RowLabelProps["lead"];
  value: string | undefined;
  onChange: (key: string | undefined) => void;
  /** The picker's "Open data explorer". */
  onOpenExplorer: () => void;
}

/**
 * README's sensor field: the bound point's name, its key in mono, its live
 * value and `edit`, which opens the data picker in single-select (item)
 * mode; picking a point sets the field and closes the picker.
 */
export function SensorField({ label, hint, lead, value, onChange, onOpenExplorer }: SensorFieldProps) {
  const [open, setOpen] = useState(false);
  const catalog = useSensorCatalog();
  const model = useMemo(() => buildDataModel(catalog.sources, catalog.sensors), [catalog.sources, catalog.sensors]);
  const live = useSensors(value ? [value] : []);
  const point = value ? model.byKey.get(value) : undefined;
  const missing = value !== undefined && catalog.status === "ready" && sensorAt(catalog.sensors, value) === undefined;

  const edit = () => {
    void refreshCatalog(); // current names and values each time it opens
    setOpen(true);
  };

  return (
    <StackRow label={label} hint={hint} lead={lead}>
      <div className="flex items-center gap-2 rounded-[7px] border border-ui-default bg-ui-app py-[7px] pl-[9px] pr-1.5 hover:border-[#3a3a44]">
        <span className="min-w-0 flex-1">
          {value ? (
            <>
              <span className="block truncate text-[12px] text-ui-1">{point?.name ?? sensorName(value)}</span>
              <span className="block truncate font-ui-mono text-micro text-ui-4">{value}</span>
            </>
          ) : (
            <span className="block truncate text-[12px] text-ui-4">No sensor bound</span>
          )}
        </span>
        {value && (
          <span className="max-w-[90px] shrink-0 truncate font-ui-mono text-[11px] text-ui-2">
            {liveText(live[value], point) ?? "—"}
          </span>
        )}
        <button type="button" onClick={edit} className={SMALL_BUTTON} aria-label={`Edit ${label}`}>
          <Pencil className="h-[15px] w-[15px]" />
        </button>
        {value && (
          <button
            type="button"
            onClick={() => onChange(undefined)}
            aria-label={`Unbind ${label}`}
            title="Unbind sensor"
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-ui-4 hover:bg-ui-hover hover:text-ui-danger"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
      {missing && (
        <div className="text-[11px] text-ui-warning">not in the live sensor list — it will show “—”</div>
      )}
      <DataPicker
        open={open}
        onOpenChange={setOpen}
        title={`Pick a sensor for ${label}`}
        points={model.points}
        mode="item"
        bound={new Set(value ? [value] : [])}
        onToggle={(p) => onChange(p.key)}
        onOpenExplorer={onOpenExplorer}
      />
    </StackRow>
  );
}
