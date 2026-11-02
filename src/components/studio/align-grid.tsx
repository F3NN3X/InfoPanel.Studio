import { useRef, useState, type KeyboardEvent } from "react";
import { cn } from "@/lib/utils";

/** An axis of the picker. */
export type AlignAxis = "x" | "y";

/** One axis' value: a cell position, a toggle ("between" / "stretch"), or auto. */
export type AlignAxisValue = string | undefined;

const POS = ["start", "center", "end"] as const;

const NAMES: Record<AlignAxis, Record<string, string>> = {
  x: { start: "Left", center: "Center", end: "Right", between: "Spread", stretch: "Stretch" },
  y: { start: "Top", center: "Middle", end: "Bottom", between: "Spread", stretch: "Stretch" },
};

interface AlignGridProps {
  /** Horizontal value (`undefined` / "auto" = auto). */
  x: AlignAxisValue;
  /** Vertical value (`undefined` / "auto" = auto). */
  y: AlignAxisValue;
  /** Both axes at once (`undefined` = back to auto). */
  onChange: (x: AlignAxisValue, y: AlignAxisValue) => void;
  /** Only this axis is editable (cells then pick a row / column). */
  only?: AlignAxis;
  /** The axis with a "Spread" toggle (its value becomes "between"). */
  spread?: AlignAxis;
  /** The axis with a "Stretch" toggle (its value becomes "stretch"). */
  stretch?: AlignAxis;
  /** Accessible name of the picker. */
  label?: string;
  className?: string;
}

const isSet = (v: AlignAxisValue): v is string => v !== undefined && v !== "auto";

/**
 * A compact 3×3 alignment picker: each cell is a (horizontal, vertical)
 * position; "Spread" / "Stretch" toggles take over one axis, and the cells
 * then pick the other. Clicking the active cell goes back to auto. The
 * cells are one tab stop; the arrow keys move and pick.
 */
export function AlignGrid({ x, y, onChange, only, spread, stretch, label = "Alignment", className }: AlignGridProps) {
  const cells = useRef<(HTMLButtonElement | null)[]>([]);
  const [focus, setFocus] = useState<number | null>(null);
  const toggled = (axis: AlignAxis) => {
    const v = axis === "x" ? x : y;
    return v === "between" || v === "stretch";
  };
  const editable = (axis: AlignAxis) => only === undefined || only === axis;
  const matches = (axis: AlignAxis, pos: string) => {
    const v = axis === "x" ? x : y;
    if (!editable(axis) || !isSet(v)) return true;
    return v === pos || toggled(axis);
  };
  const anySet = (editable("x") && isSet(x)) || (editable("y") && isSet(y));
  const activeAt = (i: number) => anySet && matches("x", POS[i % 3]) && matches("y", POS[Math.floor(i / 3)]);

  const pick = (i: number) => {
    const cx = POS[i % 3];
    const cy = POS[Math.floor(i / 3)];
    const exact = (!editable("x") || x === cx) && (!editable("y") || y === cy);
    if (exact) {
      onChange(editable("x") ? undefined : x, editable("y") ? undefined : y);
      return;
    }
    onChange(
      editable("x") && !toggled("x") ? cx : x,
      editable("y") && !toggled("y") ? cy : y
    );
  };

  const active = [...Array(9).keys()].find(activeAt);
  const tabStop = focus ?? active ?? 4;

  const onKeyDown = (e: KeyboardEvent, i: number) => {
    const step: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -3, ArrowDown: 3 };
    const d = step[e.key];
    if (d === undefined) return;
    e.preventDefault();
    const col = i % 3;
    if ((d === -1 && col === 0) || (d === 1 && col === 2)) return;
    const next = i + d;
    if (next < 0 || next > 8) return;
    setFocus(next);
    cells.current[next]?.focus();
    pick(next);
  };

  const toggle = (axis: AlignAxis, value: "between" | "stretch") => {
    const on = (axis === "x" ? x : y) === value;
    const v = on ? "center" : value;
    onChange(axis === "x" ? v : x, axis === "y" ? v : y);
  };

  return (
    <div className={cn("flex items-center gap-3", className)}>
      <div
        role="radiogroup"
        aria-label={label}
        className="grid shrink-0 grid-cols-3 gap-[3px] rounded-[7px] border border-ui-default bg-ui-app p-1"
      >
        {POS.flatMap((cy, r) =>
          POS.map((cx, c) => {
            const i = r * 3 + c;
            const on = activeAt(i);
            const name =
              only === "x" ? NAMES.x[cx] : only === "y" ? NAMES.y[cy] : `${NAMES.y[cy]} ${NAMES.x[cx].toLowerCase()}`;
            return (
              <button
                key={i}
                ref={(el) => {
                  cells.current[i] = el;
                }}
                type="button"
                role="radio"
                aria-checked={on}
                aria-label={name}
                title={on ? `${name} (click again for auto)` : name}
                tabIndex={i === tabStop ? 0 : -1}
                onClick={() => pick(i)}
                onFocus={() => setFocus(i)}
                onKeyDown={(e) => onKeyDown(e, i)}
                className={cn(
                  "flex h-[22px] w-[22px] items-center justify-center rounded-[4px] transition-colors outline-none focus-visible:ring-1 focus-visible:ring-ui-accent/60",
                  on ? "bg-ui-accent/[.22]" : "hover:bg-ui-hover"
                )}
              >
                <span className={cn("h-1.5 w-1.5 rounded-full", on ? "bg-ui-accent" : "bg-[#4a4a52]")} />
              </button>
            );
          })
        )}
      </div>
      <div className="flex flex-col gap-1">
        <Chip on={!anySet && !toggled("x") && !toggled("y")} onClick={() => onChange(undefined, undefined)}>
          Auto
        </Chip>
        {spread && (
          <Chip on={(spread === "x" ? x : y) === "between"} onClick={() => toggle(spread, "between")}>
            Spread
          </Chip>
        )}
        {stretch && (
          <Chip on={(stretch === "x" ? x : y) === "stretch"} onClick={() => toggle(stretch, "stretch")}>
            Stretch
          </Chip>
        )}
      </div>
    </div>
  );
}

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: string }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={cn(
        "h-6 rounded-md border px-2.5 text-[11.5px] transition-colors",
        on ? "border-ui-edge bg-ui-active text-ui-1" : "border-ui-strong text-ui-3 hover:text-ui-1"
      )}
    >
      {children}
    </button>
  );
}
