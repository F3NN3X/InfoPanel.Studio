/**
 * The step before a native zone or screen goes to InfoPanel: what each dashboard widget becomes there. Recreate
 * rebuilds it from InfoPanel items, a snapshot is a picture of it as it is now, leave out drops it. A widget whose
 * data isn't InfoPanel's can't be recreated: it says so, and is left out unless a snapshot of it is picked.
 */
import { Info, TriangleAlert } from "lucide-react";
import { cn } from "@/lib/utils";
import { choiceFor, notices, type Choices, type ExportRow } from "@/lib/infopanel/export/native-choices";
import type { NativeChoice } from "@/lib/infopanel/native/tiers";
import { Radio } from "./import/import-steps";

export const CHOICE_LABEL: Record<NativeChoice, string> = { recreate: "Recreate", snapshot: "Static snapshot", leave: "Leave out" };
const ORDER: readonly NativeChoice[] = ["recreate", "snapshot", "leave"];

export interface NativeExportStepProps {
  rows: readonly ExportRow[];
  /** Choices by zone id, then row key. */
  choices: Readonly<Record<string, Choices>>;
  onChoose: (zoneId: string, key: string, choice: NativeChoice) => void;
  /** Sets every row that offers it. */
  onSetAll: (choice: NativeChoice) => void;
}

export function NativeExportStep({ rows, choices, onChoose, onSetAll }: NativeExportStepProps) {
  const left = notices(rows);
  const asked = rows;
  return (
    <div className="flex flex-col gap-3">
      <p className="flex gap-2 text-[12px] text-ui-3">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-ui-4" />
        Native widgets are rebuilt from InfoPanel items, so they may look slightly different in InfoPanel.
      </p>
      {left.length > 0 && (
        <ul className="flex flex-col gap-0.5 rounded-[10px] border border-ui-default px-3.5 py-2.5 text-[12px] text-ui-warning">
          {left.map((n) => (
            <li key={n} className="flex gap-1.5">
              <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {n}
            </li>
          ))}
        </ul>
      )}
      {asked.length > 1 && (
        <div className="flex items-center gap-2 text-[12px] text-ui-3">
          <span>Set all:</span>
          {ORDER.map((c) => (
            <button key={c} type="button" onClick={() => onSetAll(c)} className="rounded-[7px] border border-ui-default px-2 py-1 text-ui-2 hover:bg-ui-hover">
              {CHOICE_LABEL[c]}
            </button>
          ))}
        </div>
      )}
      <div className="flex flex-col rounded-[10px] border border-ui-default">
        {asked.length === 0 && <span className="px-3.5 py-2.5 text-[12px] text-ui-4">Nothing here needs a choice.</span>}
        {asked.map((r) => {
          const picked = choiceFor(r, choices[r.zoneId] ?? {});
          return (
            <div key={`${r.zoneId}:${r.key}`} className="flex flex-col gap-1.5 border-b border-ui-subtle px-3.5 py-2.5 last:border-b-0">
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                <span className="w-[150px] truncate text-[12.5px] font-medium text-ui-1">{r.name}</span>
                <div role="radiogroup" aria-label={`${r.name} in InfoPanel`} className="flex flex-wrap gap-x-4 gap-y-1">
                  {ORDER.map((c) => {
                    const offered = r.options.includes(c);
                    return (
                      <button
                        key={c}
                        type="button"
                        role="radio"
                        aria-checked={picked === c}
                        disabled={!offered}
                        title={!offered ? "Not available for this widget yet" : undefined}
                        onClick={() => onChoose(r.zoneId, r.key, c)}
                        className={cn("flex items-center gap-1.5 text-[12px]", offered ? "text-ui-2" : "cursor-not-allowed text-ui-hint opacity-50")}
                      >
                        <Radio on={picked === c} /> {CHOICE_LABEL[c]}
                      </button>
                    );
                  })}
                </div>
              </div>
              {r.note && r.entry.tier !== "native-only" && <span className="text-[11.5px] text-ui-4">Approximated: {r.note}</span>}
              {!r.entry.built && r.entry.tier !== "native-only" && <span className="text-[11.5px] text-ui-4">Rebuilding this one isn’t available yet: it goes as a snapshot.</span>}
            </div>
          );
        })}
      </div>
    </div>
  );
}
