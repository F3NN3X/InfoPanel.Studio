/**
 * The upload tray (spec §10): bottom right, one row per file with its progress and outcome
 * (a duplicate says it kept the existing copy; a refused file says why). It collapses to a pill.
 */
import { useState } from "react";
import { Check, ChevronDown, CircleAlert, Copy, Loader2, Upload, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatBytes } from "@/lib/assets";
import type { UploadRow } from "./use-my-library";

const STATE_TEXT: Record<UploadRow["state"], string> = {
  queued: "Waiting",
  reading: "Reading",
  uploading: "Uploading",
  done: "Added",
  duplicate: "Already in your library",
  error: "Not added",
};

export function UploadTray({ rows, onClear, onShow }: { rows: UploadRow[]; onClear: () => void; onShow: (itemId: string) => void }) {
  const [open, setOpen] = useState(true);
  if (rows.length === 0) return null;
  const busy = rows.filter((r) => r.state === "queued" || r.state === "reading" || r.state === "uploading").length;
  const failed = rows.filter((r) => r.state === "error").length;
  const kept = rows.filter((r) => r.state === "duplicate").length;
  const added = rows.length - failed - kept;
  const summary = busy
    ? `Uploading ${rows.length - busy + 1} of ${rows.length}`
    : [`${added} added`, kept && `${kept} already there`, failed && `${failed} not added`].filter(Boolean).join(" · ");
  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="absolute bottom-4 right-4 z-20 flex h-9 items-center gap-2 rounded-full border border-ui-strong bg-ui-raised px-3.5 text-[12.5px] text-ui-1 shadow-ui-modal"
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
        {summary}
      </button>
    );
  }
  return (
    <div role="status" aria-label="Uploads" className="absolute bottom-4 right-4 z-20 flex w-[360px] flex-col overflow-hidden rounded-[12px] border border-ui-strong bg-ui-raised font-ui shadow-ui-modal">
      <div className="flex items-center gap-2 border-b border-ui-subtle px-3.5 py-2.5">
        <span className="flex-1 text-[12.5px] font-medium text-ui-1">{summary}</span>
        <button type="button" aria-label="Collapse" onClick={() => setOpen(false)} className="grid h-6 w-6 place-items-center rounded text-ui-4 hover:text-ui-1">
          <ChevronDown className="h-4 w-4" />
        </button>
        {!busy && (
          <button type="button" aria-label="Clear" onClick={onClear} className="grid h-6 w-6 place-items-center rounded text-ui-4 hover:text-ui-1">
            <X className="h-4 w-4" />
          </button>
        )}
      </div>
      <ul className="max-h-[280px] overflow-y-auto py-1">
        {rows.map((r) => (
          <li key={r.id} className="px-3.5 py-1.5">
            <div className="flex items-center gap-2 text-[12px]">
              {r.state === "done" ? (
                <Check className="h-3.5 w-3.5 shrink-0 text-ui-success" />
              ) : r.state === "duplicate" ? (
                <Copy className="h-3.5 w-3.5 shrink-0 text-ui-4" />
              ) : r.state === "error" ? (
                <CircleAlert className="h-3.5 w-3.5 shrink-0 text-ui-danger" />
              ) : (
                <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-ui-4" />
              )}
              <button
                type="button"
                disabled={!r.itemId}
                onClick={() => r.itemId && onShow(r.itemId)}
                className="min-w-0 flex-1 truncate text-left text-ui-1 enabled:hover:underline"
              >
                {r.name}
              </button>
              <span className="shrink-0 font-ui-mono text-[10.5px] text-ui-4">{formatBytes(r.size)}</span>
            </div>
            <div className={cn("ml-[22px] text-[11px]", r.state === "error" ? "text-ui-danger" : "text-ui-4")}>{r.message ?? STATE_TEXT[r.state]}</div>
            {(r.state === "reading" || r.state === "uploading" || r.state === "queued") && (
              <div className="ml-[22px] mt-1 h-1 overflow-hidden rounded-full bg-ui-subtle">
                <div className={cn("h-full rounded-full bg-ui-accent transition-all", r.state === "queued" ? "w-0" : r.state === "reading" ? "w-1/3" : "w-2/3 animate-pulse")} />
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
