/**
 * What the inspector shows with nothing selected on every page (Edit v3 SPEC §10.1), a screen's page and an imported
 * profile's alike: the header (`Page · {name}`, `Nothing selected`), the GRID section (Snap items to grid, the Alt
 * hint, what snapping means) and the label-value rows under it, `Columns × rows` among them.
 */
import { useEffect, useState, type ReactNode } from "react";
import { Grid3x3, Monitor } from "lucide-react";
import { Toggle } from "@/components/ui/toggle";
import { GRID_LIMITS } from "@/lib/page-model/model";
import { cn } from "@/lib/utils";
import { SECTION_LABEL } from "./place-row";
import { CloseButton } from "./zone-inspector-parts";

/** `Page · {name}` over `Nothing selected`, with the 30 px Monitor tile. */
export function PageHeader({ name }: { name: string }) {
  return (
    <div data-inspector-header="" className="flex shrink-0 items-center gap-2.5 border-b border-ui-subtle px-3.5 py-3">
      <span className="grid h-[30px] w-[30px] shrink-0 place-items-center rounded-lg border border-ui-default bg-ui-raised text-ui-3">
        <Monitor className="h-[17px] w-[17px]" strokeWidth={1.75} />
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-px">
        <span className="truncate text-body font-semibold text-ui-1">Page · {name}</span>
        <span className="truncate text-micro text-ui-4">Nothing selected</span>
      </span>
      <CloseButton />
    </div>
  );
}

/** The help under Snap items to grid, as it is on or off. */
export const snapNote = (on: boolean) =>
  on
    ? "Widgets always snap to cells and never overlap. Items and elements snap too; hold Alt to place them freely, on top of widgets if you like."
    : "Items and elements move to the pixel; hold Alt to snap one to cells. Widgets still always snap.";

/** GRID: the Snap items to grid switch (one undo step), the Alt hint and what it means. */
export function SnapSection({ snapItems, onSnapItems }: { snapItems: boolean; onSnapItems: (on: boolean) => void }) {
  return (
    <section className="flex flex-col gap-2 border-b border-ui-subtle px-3.5 py-3">
      <span className={SECTION_LABEL}>Grid</span>
      <div data-testid="page-snap-toggle" className="flex h-9 items-center gap-2.5 rounded-lg border border-ui-default bg-ui-raised px-2.5">
        <Grid3x3 className="h-[17px] w-[17px] shrink-0 text-ui-3" strokeWidth={1.75} />
        <span className="flex-1 text-caption font-medium text-ui-1">Snap items to grid</span>
        <Toggle checked={snapItems} onChange={onSnapItems} label="Snap items to grid" />
      </div>
      <div className="flex items-center gap-1.5 text-micro text-ui-3">
        <kbd className="rounded-[4px] border border-b-2 border-ui-strong px-1.5 py-px font-ui-mono text-[10px] text-ui-1">Alt</kbd>
        <span>hold while dragging an item or element to place it freely</span>
      </div>
      <p className="text-pretty text-micro leading-[1.5] text-ui-4">{snapNote(snapItems)}</p>
    </section>
  );
}

/** One row: the label on the left, its value or control on the right. */
export function PageRow({ label, children, swatch }: { label: string; children: ReactNode; swatch?: string }) {
  return (
    <div className="flex min-h-7 items-center justify-between gap-2 text-caption">
      <span className="shrink-0 text-ui-4">{label}</span>
      <span className="flex min-w-0 items-center justify-end gap-1.5 text-ui-1">
        {swatch && <span className="h-3 w-3 shrink-0 rounded-[3px] border border-white/15" style={{ background: swatch }} />}
        {children}
      </span>
    </div>
  );
}

const NUMBER = "h-7 w-11 rounded-md border border-ui-default bg-ui-app px-1.5 text-right font-ui-mono text-caption text-ui-1 outline-none focus:border-ui-accent";

/** A whole number typed and stored on Enter or leaving (Esc puts it back). */
export function NumberInput({ label, value, min, max, onCommit, className }: { label: string; value: number; min: number; max: number; onCommit: (n: number) => void; className?: string }) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);
  const commit = () => {
    const n = Math.round(Number(draft));
    if (draft.trim() === "" || !Number.isFinite(n)) return setDraft(String(value));
    const v = Math.max(min, Math.min(max, n));
    setDraft(String(v));
    if (v !== value) onCommit(v);
  };
  return (
    <input
      aria-label={label}
      inputMode="numeric"
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === "Enter") e.currentTarget.blur();
        if (e.key === "Escape") {
          setDraft(String(value));
          e.currentTarget.blur();
        }
      }}
      className={cn(NUMBER, className)}
    />
  );
}

/** `Columns × rows`: two numbers; a change goes through `onGrid`, which may refuse it (decision Q5). */
export function ColsRows({ cols, rows, onGrid }: { cols: number; rows: number; onGrid: (cols: number, rows: number) => void }) {
  return (
    <PageRow label="Columns × rows">
      <NumberInput label="Columns" value={cols} min={GRID_LIMITS.cols.min} max={GRID_LIMITS.cols.max} onCommit={(c) => onGrid(c, rows)} />
      <span className="text-ui-4">×</span>
      <NumberInput label="Rows" value={rows} min={GRID_LIMITS.rows.min} max={GRID_LIMITS.rows.max} onCommit={(r) => onGrid(cols, r)} />
    </PageRow>
  );
}
