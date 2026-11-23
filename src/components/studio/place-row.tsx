/**
 * The inspector's Place row (Edit v3 SPEC §10.2, §10.3): a part on the grid shows its C / R / W / H; one placed freely
 * shows `Position and size (px)`, the accent `Placed freely` chip, its X / Y / W / H and Snap to grid. Each box takes a typed number on Enter or leaving; a value the part can't take
 * (a widget onto another) shows red until the next one. Without handlers the boxes only read.
 */
import { useEffect, useState } from "react";
import { Grid3x3, Move } from "lucide-react";
import { cn } from "@/lib/utils";

export const SECTION_LABEL = "text-caption font-medium text-ui-3";

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
function Box({ label, name = label, value, onCommit, disabled }: { label: string; name?: string; value: number; onCommit?: (n: number) => boolean | void; disabled?: boolean }) {
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
        "flex h-7 min-w-0 items-center gap-2 rounded-ui-sm border bg-ui-panel px-2 font-ui-mono text-caption text-ui-1 focus-within:border-ui-accent",
        refused ? "border-ui-danger" : "border-ui-strong",
      )}
    >
      <span aria-hidden className="shrink-0 text-micro text-ui-hint">
        {label}
      </span>
      {onCommit && !disabled ? (
        <input
          aria-label={name}
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
        <span role="img" aria-label={`${name} ${Math.round(value)}`}>{Math.round(value)}</span>
      )}
    </label>
  );
}

export function PlaceRow({ cell, px, onCells, onPx, onSnap, disabled }: PlaceRowProps) {
  const onGrid = cell !== undefined;
  return (
    <section data-testid="inspector-place" data-mode={onGrid ? "grid" : "free"} aria-label={onGrid ? "Place on grid" : "Position and size"} className="flex flex-col gap-2 border-b border-ui-subtle px-4 pb-3">
      {!onGrid && (
        <div className="flex items-center justify-between gap-2">
          <span className={SECTION_LABEL}>Position and size (px)</span>
          <span className="inline-flex h-5 items-center gap-1 rounded-5 bg-ui-accent/14 px-1.75 text-micro text-ui-accent">
            <Move className="h-3 w-3" />
            Placed freely
          </span>
        </div>
      )}
      <div className="grid grid-cols-4 gap-2">
        {onGrid ? (
          <>
            <Box label="C" name="COL" value={cell.col} disabled={disabled} onCommit={onCells && ((n) => onCells({ col: n }))} />
            <Box label="R" name="ROW" value={cell.row} disabled={disabled} onCommit={onCells && ((n) => onCells({ row: n }))} />
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
          className="flex h-7 items-center justify-center gap-1.25 rounded-7 border border-ui-strong bg-ui-raised text-caption text-ui-1 transition-colors hover:bg-ui-hover disabled:pointer-events-none disabled:opacity-40"
        >
          <Grid3x3 className="h-3.75 w-3.75" />
          Snap to grid
        </button>
      )}
    </section>
  );
}
