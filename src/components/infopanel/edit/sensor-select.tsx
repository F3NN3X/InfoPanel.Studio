/**
 * The InfoPanel editor's sensor dropdown: a button showing the current sensor and its live reading
 * that opens a search box over the Data API's sensors, grouped by source and device. It uses the
 * same list model as the modal picker (`sensor-list.ts`), so plugin-only kinds and preview-only
 * sensors are handled once. Arrows move, Enter picks, Esc closes.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { Popover } from "@base-ui/react/popover";
import { Check, ChevronsUpDown, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { refreshCatalog, useSensorCatalog } from "@/lib/catalog";
import { buildDataModel, type DataPoint } from "@/lib/data-points";
import type { ChosenSensor } from "@/lib/infopanel/editor/bind";
import { chosenOf, flatPoints, isNative, NOT_EXPORTABLE, pickerSections } from "@/lib/infopanel/editor/sensor-list";
import type { DataApiValue } from "@/lib/infopanel/sensors";
import { valueText } from "../remap-panel";

interface SensorSelectProps {
  /** Names the control for assistive tech ("Sensor", "CPU load sensor"). */
  label: string;
  /** The key the item reads now. */
  current?: string | null;
  /** Shown when `current` isn't in the Data API (an item's own sensor name). */
  fallbackName?: string;
  /** Shown on the button while nothing is chosen. */
  placeholder?: string;
  pluginOnly?: boolean;
  /** The sensor's live reading, when the caller has one (else the catalog's own). */
  reading?: DataApiValue;
  onPick: (sensor: ChosenSensor) => void;
  /** When given, the list starts with "Leave unbound". */
  onClear?: () => void;
  className?: string;
}

export function SensorSelect({ label, current, fallbackName, placeholder = "Choose a sensor", pluginOnly = false, reading, onPick, onClear, className }: SensorSelectProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [cursor, setCursor] = useState(0);
  const catalog = useSensorCatalog();
  const sensors = catalog.sensors as Record<string, DataApiValue>;
  const popup = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (open) void refreshCatalog();
  }, [open]);
  const model = useMemo(() => buildDataModel(catalog.sources, catalog.sensors), [catalog.sources, catalog.sensors]);
  const sections = useMemo(() => (open ? pickerSections(model.points, sensors, query, pluginOnly) : []), [open, model, sensors, query, pluginOnly]);
  const flat = useMemo(() => flatPoints(sections), [sections]);
  const at = Math.min(cursor, flat.length - 1);
  const entry = current ? sensors[current] : undefined;
  const shownName = entry?.name ?? (current ? fallbackName || current : undefined);
  const shownValue = valueText(reading ?? entry);

  const close = () => {
    setOpen(false);
    setQuery("");
    setCursor(0);
  };
  const pick = (p: DataPoint) => {
    onPick(chosenOf(p, sensors));
    close();
  };
  const move = (to: number) => {
    setCursor(to);
    popup.current?.querySelector(`[data-index="${to}"]`)?.scrollIntoView?.({ block: "nearest" });
  };

  return (
    <Popover.Root open={open} onOpenChange={(next) => (next ? setOpen(true) : close())}>
      <Popover.Trigger
        role="combobox"
        aria-label={label}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={cn(
          "flex h-9 w-full items-center gap-2 rounded-lg border border-ui-default bg-ui-raised px-2.5 text-left hover:border-ui-strong focus-visible:border-ui-accent focus-visible:outline-none",
          className,
        )}
      >
        <span className={cn("min-w-0 flex-1 truncate text-[12.5px]", shownName ? "text-ui-1" : "text-ui-4")}>{shownName ?? placeholder}</span>
        {shownName && shownValue && <span className="max-w-[110px] shrink-0 truncate font-ui-mono text-[11.5px] text-ui-2">{shownValue}</span>}
        <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 text-ui-4" aria-hidden />
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner side="bottom" align="start" sideOffset={4} className="z-[90]">
          <Popover.Popup
            ref={popup}
            initialFocus={() => popup.current?.querySelector("input") ?? true}
            data-help-article="infopanel-editor"
            className="flex max-h-[min(420px,60vh)] w-[min(360px,calc(100vw-24px))] flex-col overflow-hidden rounded-xl border border-ui-strong bg-ui-tile font-ui text-ui-1 shadow-ui-modal outline-none"
          >
            <div className="flex shrink-0 items-center gap-2 border-b border-ui-subtle px-2.5 py-2">
              <Search className="h-4 w-4 shrink-0 text-ui-4" />
              <input
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setCursor(0);
                }}
                onKeyDown={(e) => {
                  if (e.key === "ArrowDown") move(Math.min(at + 1, flat.length - 1));
                  else if (e.key === "ArrowUp") move(Math.max(at - 1, 0));
                  else if (e.key === "Enter" && flat[at]) pick(flat[at]);
                  else return;
                  e.preventDefault();
                }}
                placeholder={pluginOnly ? "Search plugin sensors" : "Search sensors, e.g. gpu temp"}
                aria-label="Search sensors"
                aria-controls="sensor-select-list"
                className="min-w-0 flex-1 bg-transparent text-[12.5px] text-ui-1 outline-none placeholder:text-ui-4"
              />
              <span className="text-micro text-ui-hint">↑↓ Enter</span>
            </div>
            <div id="sensor-select-list" role="listbox" aria-label="Sensors" className="min-h-0 flex-1 overflow-y-auto p-1">
              {onClear && (
                <button
                  type="button"
                  role="option"
                  aria-selected={!current}
                  onClick={() => {
                    onClear();
                    close();
                  }}
                  className="flex w-full items-center rounded-[7px] px-2.5 py-1.5 text-left text-[12.5px] text-ui-2 hover:bg-ui-hover"
                >
                  Leave unbound
                </button>
              )}
              {catalog.status === "error" && <p className="px-3 py-5 text-center text-[12px] text-ui-4">The Data API isn’t reachable, so there are no sensors to choose.</p>}
              {catalog.status !== "error" && flat.length === 0 && (
                <p className="px-3 py-5 text-center text-[12px] text-ui-4">{pluginOnly ? "No plugin sensors match." : "No sensors match."}</p>
              )}
              {sections.map((s) => (
                <div key={s.title} role="group" aria-label={s.title}>
                  <div className="sticky top-0 bg-ui-tile px-2.5 pb-1 pt-2 text-[11px] font-medium uppercase tracking-wide text-ui-4">{s.title}</div>
                  {s.points.map((p) => {
                    const index = flat.indexOf(p);
                    const native = isNative(p.key, sensors);
                    return (
                      <button
                        key={p.key}
                        type="button"
                        role="option"
                        data-index={index}
                        aria-selected={p.key === current}
                        title={native ? sensors[p.key]?.ref : `${p.key} · ${NOT_EXPORTABLE}`}
                        onClick={() => pick(p)}
                        onMouseMove={() => index !== at && setCursor(index)}
                        className={cn("flex w-full items-center gap-2 rounded-[7px] px-2.5 py-1.5 text-left", index === at && "bg-ui-active")}
                      >
                        <span className="w-3.5 shrink-0 text-ui-accent">{p.key === current && <Check className="h-3.5 w-3.5" />}</span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[12.5px] text-ui-1">{p.name}</span>
                          {!native && <span className="block truncate font-ui-mono text-micro text-ui-4">preview only</span>}
                        </span>
                        <span className="max-w-[110px] shrink-0 truncate font-ui-mono text-[11.5px] text-ui-2">{p.raw}</span>
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}
