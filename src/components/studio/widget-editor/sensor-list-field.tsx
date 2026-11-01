import { useMemo, useState } from "react";
import { Plus, SlidersHorizontal, X } from "lucide-react";
import { useSensors } from "@/hooks/useSensors";
import { useSensorCatalog } from "@/lib/catalog";
import { buildDataModel } from "@/lib/data-points";
import { cn } from "@/lib/utils";
import { itemsOf, joinKeys, splitKeys, toggleKey } from "@/widgets/registry/settings-kit";
import { DataPicker } from "../inspector/data-picker";
import { liveText } from "../inspector/bound-data-model";
import { StackRow, type RowLabelProps } from "../setting-rows";
import { sensorName } from "../widget-kinds";
import { SensorOverride } from "./sensor-items-field";

const ICON_BUTTON = "flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-ui-4 hover:bg-ui-hover";

/**
 * A `sensor` setting with `multiple`: the bound keys in order (stored comma-separated), each with
 * its live reading and removable, and `Add` opening the data picker in multi-select mode. With
 * `items` (the per-sensor overrides), each row has a tune button opening its overrides inline.
 */
export function SensorListField({
  value,
  onChange,
  onOpenExplorer,
  items,
  ...label
}: RowLabelProps & {
  value: string;
  onChange: (value: string) => void;
  onOpenExplorer: () => void;
  items?: { value: string; onChange: (value: string) => void };
}) {
  const [open, setOpen] = useState(false);
  const [tuning, setTuning] = useState<string | null>(null);
  const catalog = useSensorCatalog();
  const model = useMemo(() => buildDataModel(catalog.sources, catalog.sensors), [catalog.sources, catalog.sensors]);
  const keys = splitKeys(value);
  const live = useSensors(keys);
  const overrides = items ? itemsOf(items.value) : {};
  return (
    <StackRow {...label}>
      {keys.length === 0 ? (
        <span className="text-[11px] text-ui-4">No sensors bound</span>
      ) : (
        <ul className="flex flex-col gap-1">
          {keys.map((key) => {
            const point = model.byKey.get(key);
            const name = point?.name ?? sensorName(key);
            const tuned = overrides[key] !== undefined;
            return (
              <li key={key} className="rounded-[7px] border border-ui-default bg-ui-app py-1 pl-[9px] pr-1.5">
                <div className="flex items-center gap-2">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[12px] text-ui-1">{overrides[key]?.label ?? name}</span>
                    <span className="block truncate font-ui-mono text-micro text-ui-4">{key}</span>
                  </span>
                  <span className="shrink-0 font-ui-mono text-[11px] text-ui-4">{liveText(live[key], point) ?? "–"}</span>
                  {items && (
                    <button
                      type="button"
                      onClick={() => setTuning(tuning === key ? null : key)}
                      aria-label={`Tune ${name}`}
                      aria-expanded={tuning === key}
                      title="Label, bar maximum, thresholds and decimals of this sensor"
                      className={cn(ICON_BUTTON, "hover:text-ui-1", tuned && "text-ui-accent-text")}
                    >
                      <SlidersHorizontal className="h-3.5 w-3.5" />
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => onChange(joinKeys(keys.filter((k) => k !== key)))}
                    aria-label={`Unbind ${key}`}
                    title="Unbind sensor"
                    className={cn(ICON_BUTTON, "hover:text-ui-danger")}
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
                {items && tuning === key && <SensorOverride sensorKey={key} name={name} value={items.value} onChange={items.onChange} />}
              </li>
            );
          })}
        </ul>
      )}
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex items-center gap-1 text-[11px] text-ui-4 hover:text-ui-1"
      >
        <Plus className="h-3.5 w-3.5" /> Add sensors
      </button>
      <DataPicker
        open={open}
        onOpenChange={setOpen}
        title={`Pick sensors for ${label.label}`}
        points={model.points}
        mode="widget"
        bound={new Set(keys)}
        onToggle={(p) => onChange(joinKeys(toggleKey(keys, p.key)))}
        onOpenExplorer={onOpenExplorer}
      />
    </StackRow>
  );
}
