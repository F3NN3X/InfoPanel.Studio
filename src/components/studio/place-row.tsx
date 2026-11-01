/**
 * The inspector's Place row (Edit v3 SPEC §10.2, §10.3): a part on the grid shows `PLACE ON GRID`, the `On grid` chip
 * and its COL / ROW / W / H; one placed freely shows `POSITION AND SIZE (PX)`, the accent `Placed freely` chip, its
 * X / Y / W / H and Snap to grid. Each box takes a typed number on Enter or leaving; a value the part can't take
 * (a widget onto another) shows red until the next one. Without handlers the boxes only read.
 */
import { useEffect, useState } from "react";
import { Grid3x3, Move } from "lucide-react";
import { cn } from "@/lib/utils";

export const SECTION_LABEL = "font-ui-mono text-micro uppercase tracking-[0.06em] text-ui-3";

export type CellPatch = Partial<{ col: number; row: number; cols: number; rows: number }>;
export type PxPatch = Partial<{ x: number; y: number; w: number; h: number }>;

interface PlaceRowProps {
  /** On the grid's cells, or placed freely in px. */
  cell?: { col: number; row: number; cols: number; rows: number };
  px?: { x: number; y: number; w: number; h: number };
  /** A typed cell value; false when the part can't take it. */
  onCells?: (patch: CellPatch) => boolean | void;
  /** A typed px value; false when the part can't take it. */
  onPx?: (patch: PxPatch) => boolean | void;
  /** Snap to grid (a part placed freely); none for widgets, which are always on cells. */
  onSnap?: () => void;
  disabled?: boolean;
}

/** One box: its label, then the number, typed and committed on Enter or leaving. */
function Box({ label, value, onCommit, disabled }: { label: string; value: number; onCommit?: (n: number) => boolean | void; disabled?: boolean }) {
  const [draft, setDraft] = useState<string | null>(null);
  const [refused, setRefused] = useState(false);
  useEffect(() => setRefused(false), [value]);
  const commit = () => {
    if (draft === null) return;
    const n = Number(draft.trim());
    setDraft(null);
    if (draft.trim() === "" || !Number.isFinite(n) || Math.round(n) === Math.round(value)) return;
    setRefused(onCommit?.(Math.round(n)) === false);
  };
  return (
    <label
      title={refused ? "That spot overlaps another widget or is outside the grid" : undefined}
      className={cn(
        "flex h-7 min-w-0 items-center gap-1.5 rounded-[6px] border bg-ui-app px-[7px] font-ui-mono text-[11px] text-ui-1 focus-within:border-ui-accent",
        refused ? "border-ui-danger" : "border-ui-default",
      )}
    >
      <span className="shrink-0 text-[10px] text-ui-hint">{label}</span>
      {onCommit && !disabled ? (
        <input
          aria-label={label}
          inputMode="numeric"
          value={draft ?? String(Math.round(value))}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === "Enter") e.currentTarget.blur();
            if (e.key === "Escape") {
              setDraft(null);
              e.currentTarget.blur();
            }
          }}
          className="w-full min-w-0 bg-transparent outline-none"
        />
      ) : (
        <span aria-label={label}>{Math.round(value)}</span>
      )}
    </label>
  );
}

export function PlaceRow({ cell, px, onCells, onPx, onSnap, disabled }: PlaceRowProps) {
  const onGrid = cell !== undefined;
  return (
    <section data-testid="inspector-place" data-mode={onGrid ? "grid" : "free"} className="flex flex-col gap-[7px] border-b border-ui-subtle px-3.5 py-3">
      <div className="flex items-center justify-between gap-2">
        <span className={SECTION_LABEL}>{onGrid ? "Place on grid" : "Position and size (px)"}</span>
        <span className={cn("inline-flex h-5 items-center gap-1 rounded-[5px] px-[7px] text-micro", onGrid ? "bg-ui-hover text-ui-3" : "bg-ui-accent/14 text-ui-accent")}>
          {onGrid ? <Grid3x3 className="h-3 w-3" /> : <Move className="h-3 w-3" />}
          {onGrid ? "On grid" : "Placed freely"}
        </span>
      </div>
      <div className="grid grid-cols-4 gap-1">
        {onGrid ? (
          <>
            <Box label="COL" value={cell.col} disabled={disabled} onCommit={onCells && ((n) => onCells({ col: n }))} />
            <Box label="ROW" value={cell.row} disabled={disabled} onCommit={onCells && ((n) => onCells({ row: n }))} />
            <Box label="W" value={cell.cols} disabled={disabled} onCommit={onCells && ((n) => onCells({ cols: n }))} />
            <Box label="H" value={cell.rows} disabled={disabled} onCommit={onCells && ((n) => onCells({ rows: n }))} />
          </>
        ) : (
          px && (
            <>
              <Box label="X" value={px.x} disabled={disabled} onCommit={onPx && ((n) => onPx({ x: n }))} />
              <Box label="Y" value={px.y} disabled={disabled} onCommit={onPx && ((n) => onPx({ y: n }))} />
              <Box label="W" value={px.w} disabled={disabled} onCommit={onPx && ((n) => onPx({ w: n }))} />
              <Box label="H" value={px.h} disabled={disabled} onCommit={onPx && ((n) => onPx({ h: n }))} />
            </>
          )
        )}
      </div>
      {!onGrid && onSnap && (
        <button
          type="button"
          data-testid="snap-to-grid"
          disabled={disabled}
          onClick={onSnap}
          className="flex h-7 items-center justify-center gap-[5px] rounded-[7px] border border-ui-strong bg-ui-raised text-[12px] text-ui-1 transition-colors hover:bg-ui-hover disabled:pointer-events-none disabled:opacity-40"
        >
          <Grid3x3 className="h-[15px] w-[15px]" />
          Snap to grid
        </button>
      )}
    </section>
  );
}
