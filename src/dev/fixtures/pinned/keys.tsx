import type { LucideIcon } from "lucide-react";
import { ChevronRight } from "lucide-react";
import { Widget, shell, type ShellProps } from "@/widgets/kit";
import { designWidget, useSpec } from "./stage";
import { series } from "./rail";

/*
 * Keys (design only; P7 builds it, owner Q2): Studio's own key grid, a new built-in beside the Elgato Stream Deck widget,
 * which stays as it is. A key is the tile the press-button widgets draw (`ButtonTile`, widgets/core/button-tile.tsx): a
 * hairline edge, the glyph and name scaled to the key, a tinted fill when on. Corner marks say a key has more: one dot a
 * hold action, two a double tap. Live keys (a track, a timer) are ordinary widgets placed beside the grid, not keys.
 */

export interface KeySpec {
  id: string;
  name: string;
  icon: LucideIcon;
  /** The glyph's series colour (1–6); unset = the text colour. */
  series?: number;
  /** What else the key does: a hold action (one dot) or a double tap (two). */
  more?: "hold" | "double";
  /** A toggle that is on, drawn in its state colour (the mic muted: crit). */
  on?: "crit";
  /** A counter's number, drawn in place of the glyph. */
  count?: number;
  /** Opens a folder of keys. */
  folder?: boolean;
}

export interface KeysSpec {
  cols: number;
  rows: number;
  keys: KeySpec[];
  /** Show the legend for the corner marks in the header. */
  legend?: boolean;
}

function Marks({ more }: { more: NonNullable<KeySpec["more"]> }) {
  return (
    <span aria-hidden className="absolute flex gap-1" style={{ right: 10, top: 10 }}>
      {Array.from({ length: more === "double" ? 2 : 1 }, (_, i) => (
        <span key={i} className="h-1.5 w-1.5 rounded-full" style={{ background: "currentColor", opacity: 0.55 }} />
      ))}
    </span>
  );
}

function Key({ k, side }: { k: KeySpec; side: number }) {
  const on = k.on === "crit";
  const tint = "var(--w-crit)";
  const more = k.more === "hold" ? ", hold for more" : k.more === "double" ? ", double tap for more" : "";
  return (
    <button
      type="button"
      data-press=""
      aria-pressed={k.on ? on : undefined}
      aria-label={`${k.name}${k.count !== undefined ? `: ${k.count}` : ""}${k.folder ? ", opens a folder" : ""}${more}`}
      className="relative flex h-full w-full flex-col items-center justify-center rounded-14 transition"
      style={{
        gap: Math.round(Math.max(6, side * 0.06)),
        color: on ? tint : "var(--w-fg)",
        background: on ? `color-mix(in oklab, ${tint} 16%, transparent)` : "color-mix(in oklab, var(--w-fg) 3%, transparent)",
        boxShadow: on ? `inset 0 0 0 1px color-mix(in oklab, ${tint} 50%, transparent)` : "inset 0 0 0 1px color-mix(in oklab, var(--w-faint) 70%, transparent)",
      }}
    >
      {k.count !== undefined ? (
        <span aria-hidden className="font-bold leading-none tabular-nums" style={{ fontSize: Math.round(side * 0.3), color: k.series ? series(k.series) : undefined }}>
          {k.count}
        </span>
      ) : (
        <k.icon aria-hidden size={Math.round(Math.min(44, side * 0.3))} strokeWidth={1.75} style={{ color: on ? tint : k.series ? series(k.series) : undefined }} />
      )}
      <span className="flex max-w-full items-center truncate px-1.5 font-medium leading-tight" style={{ fontSize: Math.round(Math.max(12, Math.min(16, side * 0.11))) }}>
        {k.name}
        {k.folder && <ChevronRight aria-hidden size={14} />}
      </span>
      {k.more && <Marks more={k.more} />}
    </button>
  );
}

function Legend() {
  return (
    <span className="flex items-center gap-3 text-caption" style={{ color: "var(--w-muted)" }}>
      <span className="flex items-center gap-1">
        <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-current" /> Hold
      </span>
      <span className="flex items-center gap-1">
        <span aria-hidden className="flex gap-0.5">
          <span className="h-1.5 w-1.5 rounded-full bg-current" />
          <span className="h-1.5 w-1.5 rounded-full bg-current" />
        </span>{" "}
        Double tap
      </span>
    </span>
  );
}

function KeysView(p: ShellProps) {
  const spec = useSpec<KeysSpec>();
  return (
    <Widget {...shell(p)} title="Keys" icon="grid_view" showHeader={!!spec.legend} right={spec.legend ? <Legend /> : undefined} design={null}>
      {({ w, h }) => {
        const gap = 10;
        const side = Math.min((w - gap * (spec.cols - 1)) / spec.cols, (h - gap * (spec.rows - 1)) / spec.rows);
        return (
          <div role="group" aria-label="Keys" className="grid h-full w-full" style={{ gap, gridTemplateColumns: `repeat(${spec.cols}, minmax(0, 1fr))`, gridTemplateRows: `repeat(${spec.rows}, minmax(0, 1fr))` }}>
            {spec.keys.map((k) => (
              <Key key={k.id} k={k} side={side} />
            ))}
          </div>
        );
      }}
    </Widget>
  );
}

export const KEYS = designWidget("dev.Keys", "Keys", KeysView);
