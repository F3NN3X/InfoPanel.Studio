import type { ModuleSettings } from "@/modules/types";
import { Widget, shell, get, num, Num, useIpTag, type ShellProps } from "./kit";
import { meta } from "./meta/Calendar";

export { meta };

const M = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const W = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export interface CalendarProps extends ShellProps {
  look?: ModuleSettings;
  /** 0 = Sunday, 1 = Monday (default). */
  weekStart?: number;
}

// Today's pill: near-black text on a light accent, white on a dark one (the class's dark text stays where relative colours are unsupported).
const TODAY = { background: "var(--accent)", color: "oklch(from var(--accent) clamp(0, (0.7 - l) * 1000, 1) 0 0)" };

/** The seven days of the week holding `date`, the week starting on `weekStart` (0 = Sunday). */
export const weekOf = (date: Date, weekStart: number): Date[] => {
  const back = (date.getDay() - weekStart + 7) % 7;
  return Array.from({ length: 7 }, (_, i) => new Date(date.getFullYear(), date.getMonth(), date.getDate() - back + i));
};

export default function Calendar(p: CalendarProps) {
  const d = p.data;
  const k = (s: string) => num(get(d, `plugins.clock-plugin.clock.${s}`));
  const day = k("day"),
    mon = k("month"),
    yr = k("year");
  const date = new Date(yr, mon - 1, day);
  const ws = p.weekStart ?? 1;
  const first = (new Date(yr, mon - 1, 1).getDay() - ws + 7) % 7;
  const len = new Date(yr, mon, 0).getDate();
  const cells: (number | null)[] = [...Array(Number.isFinite(first) ? first : 0).fill(null), ...Array.from({ length: Number.isFinite(len) ? len : 0 }, (_, i) => i + 1)];
  const week = Math.ceil((date.getTime() - new Date(yr, 0, 1).getTime()) / 864e5 / 7);
  const tag = useIpTag();
  return (
    <Widget {...shell(p)} title={p.title} showHeader={false} compact={{ label: W[date.getDay()], value: day, sub: `${M[mon - 1]} ${yr}`, kind: "value", icon: "calendar_today" }}>
      {({ size, w, h }) =>
        h > 0 && h < 120 ? (
          <div className="flex h-full min-w-0 items-center gap-4">
            {w > 300 && (
              <div className="flex shrink-0 flex-col leading-none">
                <span className="text-[11px] font-medium" style={{ color: "color-mix(in oklab, var(--accent) 60%, var(--w-fg))" }}>{W[date.getDay()]}</span>
                <Num className="text-3xl font-semibold leading-none tracking-tight">{day}</Num>
                <span className="mt-0.5 whitespace-nowrap text-[11px] text-[color:var(--w-muted)]">
                  {M[mon - 1]} · W{week}
                </span>
              </div>
            )}
            <div className="grid min-w-0 flex-1 grid-cols-7 gap-0.5 text-center">
              {weekOf(date, ws).map((x) => (
                <div key={x.getTime()} className="flex min-w-0 flex-col items-center gap-0.5">
                  {h >= 40 && <span className="text-[10px] font-medium leading-3 text-[color:var(--w-faint)]">{W[x.getDay()][0]}</span>}
                  <span
                    className={`flex h-6 w-full max-w-8 items-center justify-center rounded-md text-[11px] tabular-nums ${x.getDate() === day ? "font-semibold text-[#0c0c0e]" : "text-[color:var(--w-fg)]"}`}
                    style={x.getDate() === day ? TODAY : undefined}
                  >
                    {x.getDate()}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ) : (
        <div className="flex h-full gap-5">
          {(size === "lg" || w > 420) && (
            <div className="flex shrink-0 flex-col justify-between">
              <span {...tag("date", { kind: "clock", format: "dddd" })} className="text-sm font-medium" style={{ color: "color-mix(in oklab, var(--accent) 60%, var(--w-fg))" }}>{W[date.getDay()]}</span>
              <Num ip={tag("date", { kind: "clock", format: "%d" })} className="text-7xl font-semibold leading-none tracking-tight">{day}</Num>
              <span className="text-sm text-[color:var(--w-muted)]">
                {M[mon - 1]} {yr} · W{week}
              </span>
            </div>
          )}
          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            <span {...tag("date", { kind: "clock", format: "MMMM" })} className="text-xs font-semibold text-[color:var(--w-fg)]">{M[mon - 1]}</span>
            <div className="grid min-h-0 flex-1 grid-cols-7 gap-0.5 text-center text-[11px]" style={{ gridAutoRows: "minmax(0,1fr)" }}>
              {Array.from({ length: 7 }, (_, i) => (
                <span key={`h${i}`} className="text-[10px] font-medium text-[color:var(--w-faint)]">
                  {W[(i + ws) % 7][0]}
                </span>
              ))}
              {cells.map((c, i) => (
                <span
                  key={i}
                  className={`flex items-center justify-center rounded-md tabular-nums ${c === day ? "font-semibold text-[#0c0c0e]" : c ? "text-[color:var(--w-fg)]" : ""}`}
                  style={c === day ? TODAY : undefined}
                >
                  {c ?? ""}
                </span>
              ))}
            </div>
          </div>
        </div>
        )
      }
    </Widget>
  );
}
