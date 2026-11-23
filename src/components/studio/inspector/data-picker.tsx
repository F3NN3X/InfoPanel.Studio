import { useState } from "react";
import { DialogParts } from "@/components/ui/dialog";
import { Search, Square, SquareCheck, X } from "lucide-react";
import type { DataPoint } from "@/lib/data-points";
import { cn } from "@/lib/utils";
import { TypeIcon } from "../explorer/explorer-parts";
import { pickerResults, pointPlace, resultsLabel } from "./bound-data-model";

interface DataPickerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** "Bind data to <name>" / "Pick a sensor for <label>". */
  title: string;
  points: readonly DataPoint[];
  /**
   * "widget": every row toggles a binding (checkboxes); "item": picking a
   * row sets a panel widget's sensor and closes the picker.
   */
  mode: "widget" | "item";
  /** The keys bound now. */
  bound: ReadonlySet<string>;
  onToggle: (point: DataPoint) => void;
  onOpenExplorer: () => void;
}

const FOOT_BUTTON = "h-7.5 rounded-7 px-3 text-caption";

/** The data point picker (README §4.9). */
export function DataPicker({ open, onOpenChange, title, points, mode, bound, onToggle, onOpenExplorer }: DataPickerProps) {
  const [query, setQuery] = useState("");
  const { shown } = pickerResults(points, query, bound);
  const pick = (p: DataPoint) => {
    onToggle(p);
    if (mode === "item") onOpenChange(false);
  };
  return (
    <DialogParts.Root
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next) setQuery("");
      }}
    >
      <DialogParts.Content layout="panel" className="top-[10vh] translate-y-0 flex max-h-[72vh] w-[min(600px,calc(100vw-32px))] flex-col overflow-hidden rounded-xl bg-ui-tile">
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
              placeholder={`Search ${points.length} data points, e.g. gpu temp, steam level`}
              aria-label="Search data points"
              className="min-w-0 flex-1 bg-transparent text-body text-ui-1 outline-none placeholder:text-ui-4"
            />
          </div>
        </div>
        <ul className="min-h-0 flex-1 overflow-y-auto p-1">
          {shown.map((p) => {
            const on = bound.has(p.key);
            return (
              <li key={p.key}>
                <button
                  type="button"
                  role={mode === "widget" ? "checkbox" : "option"}
                  aria-checked={mode === "widget" ? on : undefined}
                  aria-selected={mode === "item" ? on : undefined}
                  title={p.key}
                  onClick={() => pick(p)}
                  className={cn(
                    "flex w-full items-center gap-2.5 rounded-7 px-2.5 py-2 text-left hover:bg-s-divider",
                    on && "bg-ui-accent/10"
                  )}
                >
                  {mode === "widget" ? (
                    on ? (
                      <SquareCheck className="h-4.5 w-4.5 shrink-0 text-ui-accent" />
                    ) : (
                      <Square className="h-4.5 w-4.5 shrink-0 text-ui-4" />
                    )
                  ) : null}
                  <TypeIcon type={p.type} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-body text-ui-1">{p.name}</span>
                    <span className="block truncate text-micro text-ui-4">{pointPlace(p)}</span>
                  </span>
                  <span className="max-w-37.5 shrink-0 truncate font-ui-mono text-micro text-ui-2">{p.raw}</span>
                </button>
              </li>
            );
          })}
          {shown.length === 0 && <li className="px-3 py-6 text-center text-caption text-ui-4">No data points match.</li>}
        </ul>
        <div className="flex shrink-0 items-center gap-2.5 border-t border-ui-subtle px-4 py-2.5">
          <span className="text-micro text-ui-hint">
            {resultsLabel(shown.length)} · {bound.size} bound
          </span>
          <button
            type="button"
            onClick={() => {
              onOpenChange(false);
              onOpenExplorer();
            }}
            className={cn(FOOT_BUTTON, "ml-auto border border-ui-strong bg-ui-raised text-ui-1")}
          >
            Open data explorer
          </button>
          <DialogParts.Close className={cn(FOOT_BUTTON, "bg-ui-inverse px-3.5 font-medium text-ui-inverse-fg")}>Done</DialogParts.Close>
        </div>
      </DialogParts.Content>
    </DialogParts.Root>
  );
}
