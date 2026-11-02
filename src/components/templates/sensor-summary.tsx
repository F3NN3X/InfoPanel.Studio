/**
 * The New wizard's Sensors field, one line: how many of the sensors the template reads this PC has, and what happens
 * to the rest. A profile's line opens onto its rows (`children`: each role and its sensor, to fix one now); a screen's
 * never does, since a screen swaps a missing reading for a similar one itself. Without the Data API nothing can be
 * checked, so it says so and doesn't open.
 */
import { useState, type ReactNode } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";
import type { WizardKind } from "./recent-templates";
import type { SensorFit } from "./wizard-kit";

interface SensorSummaryProps {
  kind: WizardKind;
  fit: SensorFit;
  noData: boolean;
  /** The rows the line opens onto (profiles). */
  children?: ReactNode;
}

/** The line's title and note. */
export function summaryText(kind: WizardKind, { need, found }: SensorFit, noData: boolean): { title: string; note: string } {
  const missing = need - found;
  if (noData) return { title: `Sensors · reads ${need}`, note: "The Data API is unreachable, so they’re matched when it reconnects." };
  if (missing === 0) return { title: `Sensors · all ${need} found on this PC`, note: "Each reading is bound to this PC’s sensor." };
  return {
    title: `Sensors · ${found} of ${need} found on this PC`,
    note:
      kind === "ip"
        ? `${missing} left unbound: fix them now, or later with Remap.`
        : `${missing === 1 ? "The missing one is" : "Missing ones are"} replaced by a similar reading or left out.`,
  };
}

export function SensorSummary({ kind, fit, noData, children }: SensorSummaryProps) {
  const [open, setOpen] = useState(false);
  const { title, note } = summaryText(kind, fit, noData);
  const canOpen = kind === "ip" && !noData && !!children;
  const dot = noData ? "bg-ui-4" : fit.found < fit.need ? "bg-ui-warning" : "bg-ui-success";
  const line = (
    <>
      <span aria-hidden className={cn("h-[7px] w-[7px] shrink-0 rounded-full", dot)} />
      <span className="flex min-w-0 flex-1 flex-col text-left">
        <span className="truncate text-caption text-ui-1">{title}</span>
        <span className="truncate text-micro text-ui-3">{note}</span>
      </span>
    </>
  );
  return (
    <div role="group" aria-label="Sensors" className="overflow-hidden rounded-ui-md border border-ui-default">
      {canOpen ? (
        <button type="button" aria-expanded={open} onClick={() => setOpen((o) => !o)} className="flex w-full items-center gap-2.5 bg-ui-raised px-2.5 py-2 hover:bg-ui-hover">
          {line}
          <span className="flex shrink-0 items-center gap-0.5 text-micro text-ui-3">
            {open ? "Hide" : "Review"}
            {open ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          </span>
        </button>
      ) : (
        <div className="flex items-center gap-2.5 bg-ui-raised px-2.5 py-2">{line}</div>
      )}
      {canOpen && open && <div className="max-h-[220px] overflow-y-auto border-t border-ui-default px-2.5 py-2">{children}</div>}
    </div>
  );
}
