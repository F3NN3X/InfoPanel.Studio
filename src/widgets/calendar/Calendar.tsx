import type { ModuleSettings } from "@/modules/types";
import { Widget, shell, get, num, Num, roomy, useIpTag, type ShellProps } from "../kit";
import { CalendarNav } from "./CalendarNav";
import { meta } from "./meta";

export { meta };

const M = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const W = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export interface CalendarProps extends ShellProps {
  look?: ModuleSettings;
  /** 0 = Sunday, 1 = Monday (default). */
  weekStart?: number;
}

// Today's pill: near-black text on a light accent, white on a dark one (the class's dark text stays where relative colours are unsupported).
const TODAY = { background: "var(--w-accent)", color: "oklch(from var(--w-accent) clamp(0, (0.7 - l) * 1000, 1) 0 0)" };

/** The weekday letters' row at 4x4, px. */
const HEAD_H = 20;

/** A 2x2 tile (200 to 240px square) draws the day and the week itself; the summary views keep every other tile, however large the Summary card setting makes it. */
export const drawsOwnTile = (w: number, h: number): boolean => w >= 200 && h >= 200 && w < 240 && h < 240;

/** The seven days of the week holding `date`, the week starting on `weekStart` (0 = Sunday). */
export const weekOf = (date: Date, weekStart: number): Date[] => {
  const back = (date.getDay() - weekStart + 7) % 7;
  return Array.from({ length: 7 }, (_, i) => new Date(date.getFullYear(), date.getMonth(), date.getDate() - back + i));
};

/** The clock plugin's date and its week of the year. */
function dateOf(p: CalendarProps) {
  const k = (s: string) => num(get(p.data, `plugins.clock-plugin.clock.${s}`));
  const [day, month, year] = [k("day"), k("month"), k("year")];
  return { day, month, year, week: Math.ceil((new Date(year, month - 1, day).getTime() - new Date(year, 0, 1).getTime()) / 864e5 / 7) };
}

/** The standard layout, or the one the zone's Look or Layout pick names (`meta.layouts`). */
export default function Calendar(p: CalendarProps) {
  return p.lookLayout === "grid-nav" ? <CalendarNav {...p} {...dateOf(p)} /> : <MonthCalendar {...p} />;
}

function MonthCalendar(p: CalendarProps) {
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
  const weeks = Math.ceil(cells.length / 7);
  return (
    <Widget {...shell(p)} title={p.title} showHeader={false} compact={(box) =>
      // a 2x2 draws the day and the week itself (below); smaller tiles keep the summary
      drawsOwnTile(box.w, box.h) ? undefined : { label: W[date.getDay()], value: day, sub: `${M[mon - 1]} ${yr}`, kind: "value" as const, icon: "calendar_today" }
    }>
      {({ size, w, h }) => {
        // 4x4: rows are sized from the cell (28 to 52px) so the month fills the box
        const room = roomy(w, h);
        const rowH = Math.min(52, Math.max(28, Math.floor((h - 24 - HEAD_H - weeks * 2) / weeks)));
        const weekStrip = (
            <div className="grid min-w-0 grid-cols-7 gap-0.5 text-center">
              {weekOf(date, ws).map((x) => (
                <div key={x.getTime()} className="flex min-w-0 flex-col items-center gap-0.5">
                  {h >= 40 && <span className="text-micro font-medium leading-3 text-[color:var(--w-faint)]">{W[x.getDay()][0]}</span>}
                  <span
                    className={`flex h-6 w-full max-w-8 items-center justify-center rounded-md text-micro tabular-nums ${x.getDate() === day ? "font-semibold text-w-ink" : "text-[color:var(--w-fg)]"}`}
                    style={x.getDate() === day ? TODAY : undefined}
                  >
                    {x.getDate()}
                  </span>
                </div>
              ))}
            </div>
        );
        // 2x2: the weekday and month over the day, the week's strip under it
        if (!room && w > 0 && w < 300 && h >= 140)
          return (
            <div className="flex h-full min-w-0 flex-col justify-between gap-2">
              <div className="flex flex-col gap-0.5">
                <span className="text-sm font-medium" style={{ color: "color-mix(in oklab, var(--w-accent) 60%, var(--w-fg))" }}>{W[date.getDay()]}</span>
                <span className="text-xs text-[color:var(--w-muted)]">{M[mon - 1]} {yr} · W{week}</span>
              </div>
              <Num className="text-[56px] font-semibold leading-none tracking-tight">{day}</Num>
              {weekStrip}
            </div>
          );
        return h > 0 && h < 120 ? (
          <div className="flex h-full min-w-0 items-center gap-4">
            {w > 300 && (
              <div className="flex shrink-0 flex-col leading-none">
                <span className="text-micro font-medium" style={{ color: "color-mix(in oklab, var(--w-accent) 60%, var(--w-fg))" }}>{W[date.getDay()]}</span>
                <Num className="text-3xl font-semibold leading-none tracking-tight">{day}</Num>
                <span className="mt-0.5 whitespace-nowrap text-micro text-[color:var(--w-muted)]">
                  {M[mon - 1]} · W{week}
                </span>
              </div>
            )}
            <div className="min-w-0 flex-1">{weekStrip}</div>
          </div>
        ) : (
        <div className="flex h-full gap-5">
          {(size === "lg" || w > 420) && (
            <div className={`flex shrink-0 flex-col ${room ? "gap-4" : "justify-between"}`}>
              <div className="flex flex-col gap-0.5">
                <span {...tag("date", { kind: "clock", format: "dddd" })} className="text-sm font-medium" style={{ color: "color-mix(in oklab, var(--w-accent) 60%, var(--w-fg))" }}>{W[date.getDay()]}</span>
                {room && <span className="text-sm text-[color:var(--w-muted)]">{M[mon - 1]} {yr} · W{week}</span>}
              </div>
              <Num ip={tag("date", { kind: "clock", format: "%d" })} className={`${room ? "text-[64px]" : "text-7xl"} font-semibold leading-none tracking-tight`}>{day}</Num>
              {!room && (
                <span className="text-sm text-[color:var(--w-muted)]">
                  {M[mon - 1]} {yr} · W{week}
                </span>
              )}
            </div>
          )}
          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            <span {...tag("date", { kind: "clock", format: "MMMM" })} className="text-xs font-semibold text-[color:var(--w-fg)]">{M[mon - 1]}</span>
            <div className={room ? "grid min-h-0 grid-cols-7 gap-0.5 text-center text-micro" : "grid min-h-0 flex-1 grid-cols-7 gap-0.5 text-center text-micro"} style={room ? { gridTemplateRows: `${HEAD_H}px repeat(${weeks}, ${rowH}px)`, alignContent: "start", containerType: "inline-size" } : { gridAutoRows: "minmax(0,1fr)", maxHeight: "21rem" }}>
              {Array.from({ length: 7 }, (_, i) => (
                <span key={`h${i}`} className="text-micro font-medium text-[color:var(--w-faint)]">
                  {W[(i + ws) % 7][0]}
                </span>
              ))}
              {cells.map((c, i) => (
                <span
                  key={i}
                  className={`flex items-center justify-center rounded-md tabular-nums ${c === day ? "font-semibold text-w-ink" : c ? "text-[color:var(--w-fg)]" : ""}`}
                  style={c === day ? (room ? { ...TODAY, height: `min(${rowH - 4}px, calc(100cqw / 7 - 2px))`, aspectRatio: "1", alignSelf: "center", justifySelf: "center" } : TODAY) : undefined}
                >
                  {c ?? ""}
                </span>
              ))}
            </div>
          </div>
        </div>
        );
      }}
    </Widget>
  );
}
