/**
 * On InfoPanel (one-editor SPEC §5.5): a part's Export check status, shown on a screen made for InfoPanel by both
 * inspectors. A Studio widget also picks what the export makes of it (Recreate, Snapshot, Leave out); an InfoPanel
 * item says what InfoPanel shows of it.
 */
import type { ReactNode } from "react";
import { Segmented } from "@/components/ui/segmented";
import { StatusIcon } from "@/components/infopanel/export-check-panel";
import { STATUS_LABEL, type CheckRow } from "@/lib/infopanel/export-check";
import type { NativeChoice, TierEntry } from "@/lib/infopanel/native/tiers";

const CHOICE_LABEL: Record<NativeChoice, string> = { recreate: "Recreate", snapshot: "Snapshot", leave: "Leave out" };

/** What a widget's export rule does, in words (§5.5). */
export function choiceHelp(choice: NativeChoice, name: string, entry: TierEntry | null): string {
  if (choice === "recreate") {
    const approx = entry?.approximated ? ` Approximated: ${entry.approximated}.` : "";
    return `A picture of the widget, with its live values put back on top as InfoPanel items. Shows live on Studio panels as usual.${approx}`;
  }
  if (choice === "snapshot") return "A still picture of the widget as it looks at export.";
  if (entry?.tier === "native-only") return `${name} has no InfoPanel version: ${entry.reason}. It stays on Studio panels and is left out of the export.`;
  return "It stays on Studio panels and is left out of the export.";
}

interface OnInfoPanelSectionProps {
  row: CheckRow;
  /** A widget's rule: the choices its tier offers, the one in force, and the change (one undo step). */
  choice?: { options: readonly NativeChoice[]; value: NativeChoice; onChange: (choice: NativeChoice) => void };
  /** The lines under the status: the widget's rule in words, or what InfoPanel shows of an item. */
  children: ReactNode;
}

export function OnInfoPanelSection({ row, choice, children }: OnInfoPanelSectionProps) {
  return (
    <div role="note" aria-label="On InfoPanel" data-on-infopanel="" data-testid="on-infopanel" className="rounded-[8px] border border-ui-default px-2.5 py-2 text-[11.5px]">
      <div className="flex items-center gap-1.5 text-ui-1">
        <StatusIcon status={row.status} />
        <span>
          On InfoPanel: <span className="text-ui-2">{STATUS_LABEL[row.status].toLowerCase()}</span>
        </span>
      </div>
      {choice && (
        <Segmented
          label="On InfoPanel export"
          className="mt-2 w-full flex-nowrap [&>button]:flex-1"
          value={choice.value}
          onChange={choice.onChange}
          options={choice.options.map((c) => ({ value: c, label: CHOICE_LABEL[c] }))}
        />
      )}
      <div className="mt-1.5 leading-snug text-ui-4">{children}</div>
    </div>
  );
}
