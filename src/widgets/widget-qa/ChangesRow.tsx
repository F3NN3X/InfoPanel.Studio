import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Change } from "./changes";
import type { QaState } from "./params";

/**
 * The active changes row under the top bar: every setting not at its default as a chip whose × puts it back, then Reset all.
 * Nothing set: no row (`activeChanges` is empty).
 */
export function ChangesRow({ changes, onClear, onReset }: { changes: Change[]; onClear: (patch: Partial<QaState>) => void; onReset: () => void }) {
  if (!changes.length) return null;
  return (
    <ul aria-label="Active changes" className="flex flex-wrap items-center gap-1.5">
      {changes.map((c) => (
        <li key={c.key} data-qa-change={c.key} className="inline-flex h-6 max-w-80 items-center gap-1 rounded-ui-sm border border-ui-strong bg-ui-raised pl-2 text-caption text-ui-2">
          <span className="truncate" title={c.label}>
            {c.label}
          </span>
          <button type="button" aria-label={`Clear ${c.label}`} onClick={() => onClear(c.clear)} className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-ui-sm text-ui-3 hover:bg-ui-hover hover:text-ui-1 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ui-accent">
            <X aria-hidden className="h-3 w-3" strokeWidth={2} />
          </button>
        </li>
      ))}
      <li>
        <Button variant="ghost" small onClick={onReset} className="h-6 text-caption">
          Reset all
        </Button>
      </li>
    </ul>
  );
}
