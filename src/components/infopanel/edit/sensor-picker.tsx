/**
 * The InfoPanel editor's sensor picker: the live Data API sensors, searchable, grouped by source
 * and device. Picking one binds the item natively (SensorType and ids from the sensor's `ref`),
 * or for the preview only when this InfoPanel build reports no ref. Tables and web images list
 * plugin sensors only, as InfoPanel does.
 */
import { useEffect, useMemo, useState } from "react";
import { Dialog } from "@base-ui/react/dialog";
import { Search, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { refreshCatalog, useSensorCatalog } from "@/lib/catalog";
import { buildDataModel, type DataPoint } from "@/lib/data-points";
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

export function SensorPicker({ open, onOpenChange, title, pluginOnly, current, onPick }: SensorPickerProps) {
  const [query, setQuery] = useState("");
  const catalog = useSensorCatalog();
  const sensors = catalog.sensors as Record<string, DataApiValue>;
  useEffect(() => {
    if (open) void refreshCatalog();
  }, [open]);
  const model = useMemo(() => buildDataModel(catalog.sources, catalog.sensors), [catalog.sources, catalog.sensors]);
  const sections = useMemo(() => pickerSections(model.points, sensors, query, pluginOnly), [model, sensors, query, pluginOnly]);
  const noRefs = model.points.length > 0 && model.points.every((p) => !sensors[p.key]?.ref);
  const pick = (p: DataPoint) => {
    onPick(chosenOf(p, sensors));
    onOpenChange(false);
  };
  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next) setQuery("");
      }}
    >
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-50 bg-black/55" />
        <Dialog.Popup
          data-help-article="infopanel-editor"
          className="fixed left-1/2 top-[10vh] z-50 flex max-h-[72vh] w-[min(600px,calc(100vw-32px))] -translate-x-1/2 flex-col overflow-hidden rounded-xl border border-ui-strong bg-ui-tile font-ui text-ui-1 shadow-ui-modal outline-none"
        >
          <div className="flex shrink-0 flex-col gap-2.5 border-b border-ui-subtle px-4 pb-2.5 pt-3.5">
            <div className="flex items-center justify-between">
              <Dialog.Title className="text-[14px] font-semibold">{title}</Dialog.Title>
              <Dialog.Close aria-label="Close" className="text-ui-3 hover:text-ui-1">
                <X className="h-[18px] w-[18px]" />
              </Dialog.Close>
            </div>
            <div className="flex h-9 items-center gap-2 rounded-lg border border-ui-accent bg-ui-app px-2.5">
              <Search className="h-[17px] w-[17px] shrink-0 text-ui-4" />
              <input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={pluginOnly ? "Search plugin sensors" : "Search sensors, e.g. gpu temp"}
                aria-label="Search sensors"
                className="min-w-0 flex-1 bg-transparent text-[13px] text-ui-1 outline-none placeholder:text-ui-4"
              />
            </div>
            {noRefs && <p className="text-[11.5px] leading-snug text-ui-warning">{NOT_EXPORTABLE}. A choice binds the preview only.</p>}
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-1">
            {catalog.status === "error" && <p className="px-3 py-6 text-center text-[12px] text-ui-4">The Data API isn’t reachable, so there are no sensors to choose.</p>}
            {catalog.status !== "error" && sections.length === 0 && (
              <p className="px-3 py-6 text-center text-[12px] text-ui-4">{pluginOnly ? "No plugin sensors match." : "No sensors match."}</p>
            )}
            {sections.map((s) => (
              <section key={s.title} aria-label={s.title}>
                <div className="sticky top-0 bg-ui-tile px-2.5 pb-1 pt-2 text-[11px] font-medium uppercase tracking-wide text-ui-4">{s.title}</div>
                <ul>
                  {s.points.map((p) => {
                    const ref = sensors[p.key]?.ref;
                    const native = isNative(p.key, sensors);
                    return (
                      <li key={p.key}>
                        <button
                          type="button"
                          role="option"
                          aria-selected={p.key === current}
                          title={native ? ref : `${p.key} · ${NOT_EXPORTABLE}`}
                          onClick={() => pick(p)}
                          className={cn("flex w-full items-center gap-2.5 rounded-[7px] px-2.5 py-1.5 text-left hover:bg-[#1c1c21]", p.key === current && "bg-ui-accent/10")}
                        >
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-[12.5px] text-ui-1">{p.name}</span>
                            <span className="block truncate font-ui-mono text-[10.5px] text-ui-4">{native ? ref : `${p.key} · preview only`}</span>
                          </span>
                          <span className="max-w-[150px] shrink-0 truncate font-ui-mono text-[11.5px] text-ui-2">{p.raw}</span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))}
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
