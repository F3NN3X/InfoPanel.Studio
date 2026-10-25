import { lazy, Suspense } from "react";
import type { IconSource } from "@/lib/effects/icon";
import { Bar, fitRows, Icon, TONES, type Tone } from "./kit";

const DriveIconImpl = lazy(() => import("./DriveIcon"));

/** A drive's own icon, in its own chunk so a screen with none doesn't load it. */
export const DriveIcon = (p: { source: IconSource; px: number }) => (
  <Suspense fallback={<span style={{ width: p.px, height: p.px }} />}>
    <DriveIconImpl {...p} />
  </Suspense>
);

export interface DriveRow {
  key: string;
  /** "Label (C:)" or the letter. */
  name: string;
  /** "used / total". */
  text: string;
  pct: number;
  t: Tone;
  /** The user's own icon for this drive, instead of the stock one. */
  icon?: IconSource | null;
}

const SEGMENTS = 12;
const GAP = 12;

/** Segments / Bars: an icon with a status dot, the name and used / total, and the fill bar under them. */
export function DriveRows({ rows, view, size, h }: { rows: DriveRow[]; view: "segments" | "bars"; size: string; h: number }) {
  const rowH = size === "lg" ? 52 : size === "sm" ? 36 : 44;
  const icon = size === "lg" ? "text-[32px]" : size === "sm" ? "text-[22px]" : "text-[28px]";
  const iconPx = size === "lg" ? 32 : size === "sm" ? 22 : 28;
  const shown = rows.slice(0, h > 0 ? fitRows(h, rowH, GAP) : rows.length);
  return (
    <div className="flex h-full flex-col overflow-hidden" style={{ gap: GAP }}>
      {shown.map((r) => (
        <div key={r.key} className="flex min-w-0 items-center gap-3" style={{ minHeight: rowH }}>
          <span className="relative shrink-0 text-[color:var(--w-muted)]">
            {r.icon ? <DriveIcon source={r.icon} px={iconPx} /> : <Icon name="hard_drive" className={icon} />}
            <span className="absolute -bottom-0.5 -left-0.5 h-2 w-2 rounded-full" style={{ background: TONES[r.t] }} />
          </span>
          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            <div className="flex items-baseline gap-2 text-xs">
              <span className="truncate font-semibold text-[color:var(--w-fg)]">{r.name}</span>
              <span className="ml-auto shrink-0 font-mono tabular-nums text-[color:var(--w-muted)]">{r.text}</span>
            </div>
            {view === "segments" ? <Bar value={r.pct} t={r.t} style="segments" segments={SEGMENTS} className="h-2" /> : <Bar value={r.pct} t={r.t} style="bar" className="h-1.5" />}
          </div>
        </div>
      ))}
    </div>
  );
}
