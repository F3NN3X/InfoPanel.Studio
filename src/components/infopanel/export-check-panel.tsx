/**
 * The Export check's faces (one-editor SPEC §7.2, §8, §5.1): the status icons and canvas badges, the header pill,
 * the live panel in the inspector, and the grouped list the export dialog shows too. All read one `exportCheck`.
 */
import { createContext, useContext, type ReactNode } from "react";
import { Ban, Check, Image, Triangle, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { STATUS_LABEL, STATUS_ORDER, STATUS_SHORT, type CheckRow, type CheckStatus, type ExportCheck } from "@/lib/infopanel/export-check";

export const STATUS_UI: Record<CheckStatus, { icon: LucideIcon; text: string; bg: string; border: string }> = {
  ok: { icon: Check, text: "text-ui-ok", bg: "bg-ui-ok", border: "border-ui-ok" },
  approx: { icon: Triangle, text: "text-ui-warn", bg: "bg-ui-warn", border: "border-ui-warn" },
  pic: { icon: Image, text: "text-ui-info", bg: "bg-ui-info", border: "border-ui-info" },
  out: { icon: Ban, text: "text-ui-danger", bg: "bg-ui-danger", border: "border-ui-danger" },
};

/** The check as the editor's parts read it: on for a screen made for InfoPanel, each part's row by its path. */
export interface ExportCheckState {
  on: boolean;
  byPath: ReadonlyMap<string, CheckRow>;
}

const OFF: ExportCheckState = { on: false, byPath: new Map() };
export const ExportCheckContext = createContext<ExportCheckState>(OFF);
export const useExportCheck = (): ExportCheckState => useContext(ExportCheckContext);

/** A status's icon in its colour, its label as the tooltip. */
export function StatusIcon({ status, className }: { status: CheckStatus; className?: string }) {
  const { icon: Icon, text } = STATUS_UI[status];
  return (
    <span title={STATUS_LABEL[status]} aria-label={STATUS_LABEL[status]} className={cn("inline-flex shrink-0", text)}>
      <Icon className={cn("h-[13px] w-[13px]", className)} strokeWidth={2} />
    </span>
  );
}

/** A part's badge on the canvas (Edit v3 SPEC §7.1): a 16 px circle with its status glyph, 4 px in from its top-right. */
export function CheckBadge({ status }: { status: CheckStatus }) {
  const { icon: Icon, text, border } = STATUS_UI[status];
  return (
    <span
      data-testid="canvas-badge"
      data-status={status}
      aria-label={STATUS_LABEL[status]}
      className={cn("absolute right-1 top-1 grid h-4 w-4 place-items-center rounded-full border bg-ui-chrome", text, border)}
    >
      <Icon className="h-[11px] w-[11px]" strokeWidth={2.25} />
    </span>
  );
}

/** The amber mark on a studio-only look that is set (decision D4). */
export function ApproxMark() {
  return (
    <span title="Approximated on InfoPanel" aria-label="Approximated on InfoPanel" className="inline-flex shrink-0 text-ui-warn">
      <Triangle className="h-[13px] w-[13px]" strokeWidth={2} />
    </span>
  );
}

/** The header's pill: the counts that aren't zero, or that there is nothing to export. */
export function ExportCheckPill({ check, open, onClick }: { check: ExportCheck; open: boolean; onClick: () => void }) {
  const shown = STATUS_ORDER.slice().reverse().filter((s) => check.counts[s] > 0);
  return (
    <button
      type="button"
      aria-pressed={open}
      data-testid="export-pill"
      onClick={onClick}
      title="What happens to each part when you export to InfoPanel"
      className={cn(
        "flex h-[26px] shrink-0 items-center gap-2 rounded-[7px] border bg-ui-raised px-2.5 text-[11.5px] text-ui-3 hover:text-ui-1",
        open ? "border-ui-accent" : "border-ui-default",
      )}
    >
      <span>Export check</span>
      {shown.length === 0 && <span className="text-ui-4">· nothing to export</span>}
      {shown.map((s) => (
        <span key={s} className="flex items-center gap-1 text-ui-2">
          <span className={cn("h-[7px] w-[7px] rounded-full", STATUS_UI[s].bg)} />
          {check.counts[s]} {STATUS_SHORT[s]}
        </span>
      ))}
    </button>
  );
}

/** The rows grouped by status, surprises first; `skipOk` leaves out what exports as is (the export dialog). */
export function CheckGroups({ rows, onSelect, skipOk = false }: { rows: readonly CheckRow[]; onSelect?: (path: string) => void; skipOk?: boolean }) {
  return (
    <div className="flex flex-col gap-3">
      {STATUS_ORDER.filter((s) => !(skipOk && s === "ok")).map((s) => {
        const group = rows.filter((r) => r.status === s);
        if (group.length === 0) return null;
        const { icon: Icon, text } = STATUS_UI[s];
        return (
          <section key={s} aria-label={STATUS_LABEL[s]} className="flex flex-col gap-1">
            <h3 className={cn("flex items-center gap-1.5 text-[11.5px] font-medium", text)}>
              <Icon className="h-[13px] w-[13px]" strokeWidth={2} />
              {STATUS_LABEL[s]} · {group.length}
            </h3>
            {group.map((r) => {
              const body = (
                <>
                  <span className="block truncate text-[11.5px] text-ui-1">{r.name}</span>
                  <span className="block text-[10.5px] leading-snug text-ui-4">{r.why}</span>
                </>
              );
              return onSelect ? (
                <button key={r.path} type="button" onClick={() => onSelect(r.path)} className="rounded-[6px] bg-ui-raised px-2.5 py-1.5 text-left hover:bg-ui-hover">
                  {body}
                </button>
              ) : (
                <div key={r.path} className="rounded-[6px] bg-ui-raised px-2.5 py-1.5">
                  {body}
                </div>
              );
            })}
          </section>
        );
      })}
    </div>
  );
}

/** The live Export check in the inspector: a stacked bar, the groups (a row selects its part), and Export. */
export function ExportCheckPanel({ check, onSelect, onExport, notice }: { check: ExportCheck; onSelect: (path: string) => void; onExport: () => void; notice?: ReactNode }) {
  const total = check.rows.length;
  return (
    <div className="flex min-h-0 flex-1 flex-col font-ui" data-help-article="infopanel-editor" data-testid="export-check">
      <div className="flex flex-col gap-2 border-b border-ui-subtle px-4 pb-3 pt-3.5">
        <div className="flex items-center">
          <h2 className="flex-1 text-[13px] font-semibold text-ui-1">Export check</h2>
          <span className="text-[11px] text-ui-ok">Live</span>
        </div>
        <p className="text-[11.5px] leading-snug text-ui-4">What happens to each part when you export to InfoPanel. Updates as you edit.</p>
        {notice}
        {total > 0 && (
          <div className="flex h-1.5 gap-0.5" aria-hidden>
            {STATUS_ORDER.slice()
              .reverse()
              .filter((s) => check.counts[s] > 0)
              .map((s) => (
                <span key={s} className={cn("rounded-full", STATUS_UI[s].bg)} style={{ flexGrow: check.counts[s] }} />
              ))}
          </div>
        )}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
        {total === 0 ? <p className="text-[12px] text-ui-4">Nothing to export yet.</p> : <CheckGroups rows={check.rows} onSelect={onSelect} />}
      </div>
      <div className="flex flex-col items-center gap-1.5 border-t border-ui-subtle px-4 py-3">
        <button
          type="button"
          onClick={onExport}
          className="flex h-8 w-full items-center justify-center rounded-[7px] bg-ui-accent text-[12.5px] font-semibold text-ui-inverse-fg hover:opacity-90"
        >
          Export .infopanel
        </button>
        <span className="text-[11px] text-ui-4">Export writes a copy. Your screen isn’t changed.</span>
      </div>
    </div>
  );
}
