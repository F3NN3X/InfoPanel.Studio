import { isToday, weekdayLabel } from "@/lib/weather-days";
import type { WeatherCondition } from "@/lib/weather-icons";
import { Num, WeatherGlyph, type WeatherIconProps } from "./kit";

export interface WeatherDay {
  /** "Today" or the weekday short name. */
  label: string;
  cond: WeatherCondition;
  hi: number;
  /** Absent for a Today built from the current reading. */
  lo?: number;
}

/** The forecast rows as the Week columns: a first row that is today stays, else Today is built from the current reading. */
export function weekDays(fc: { date: string; cond: WeatherCondition; hi: number; lo: number }[], current: { cond: WeatherCondition; temp: number }, now: Date): WeatherDay[] {
  const todayFirst = fc.length > 0 && isToday(fc[0].date, now);
  const days = fc.map((f, i) => ({ label: i === 0 && todayFirst ? "Today" : weekdayLabel(f.date), cond: f.cond, hi: f.hi, lo: f.lo }));
  return todayFirst ? days : [{ label: "Today", cond: current.cond, hi: current.temp }, ...days];
}

export function WeatherGlance({ cond, temp, desc, place, w, h, icons }: { cond: WeatherCondition; temp: string; desc: string; place: string; w: number; h: number; icons: WeatherIconProps }) {
  const icon = Math.max(24, Math.min(h * 0.4, w * 0.3));
  return (
    <div className="flex h-full min-w-0 items-center justify-center gap-4">
      <WeatherGlyph {...cond} {...icons} className="text-[color:var(--accent)]" size={icon} />
      <div className="flex min-w-0 flex-col">
        <Num className="leading-none tracking-tight" weight={800} style={{ fontSize: Math.max(28, Math.min(h * 0.45, w * 0.3)) }}>
          {temp}
        </Num>
        {desc && <span className="mt-1 truncate text-xs text-[color:var(--w-muted)]">{desc}</span>}
        {place && <span className="truncate text-xs text-[color:var(--w-muted)]">{place}</span>}
      </div>
    </div>
  );
}

export function WeatherWeek({ days, place, w, h, icons, fmtTemp }: { days: WeatherDay[]; place: string; w: number; h: number; icons: WeatherIconProps; fmtTemp: (c: number) => string }) {
  const cols = Math.max(1, Math.min(days.length, Math.max(3, Math.min(7, Math.floor(w / 64)))));
  const icon = Math.max(20, Math.min(h * 0.28, w / cols * 0.5));
  return (
    <div className="flex h-full min-w-0 flex-col gap-2">
      <div className="grid min-h-0 flex-1 items-center" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0,1fr))` }}>
        {days.slice(0, cols).map((d, i) => (
          <div key={i} className="flex flex-col items-center gap-1">
            <span className="whitespace-nowrap text-[11px] text-[color:var(--w-muted)]">{d.label}</span>
            <WeatherGlyph {...d.cond} {...icons} className="text-[color:var(--w-fg)]" size={icon} />
            <Num className="text-sm leading-none" weight={700}>
              {fmtTemp(d.hi)}
            </Num>
            <span className="text-[11px] tabular-nums leading-none text-[color:var(--w-muted)]">{d.lo === undefined ? " " : fmtTemp(d.lo)}</span>
          </div>
        ))}
      </div>
      {place && <span className="truncate text-[11px] text-[color:var(--w-muted)]">{place}</span>}
    </div>
  );
}
