import type { CSSProperties } from "react";
import { useGeneral } from "@/hooks/use-general";
import { localeHour12 } from "@/lib/general";
import { hour12Of } from "@/modules/setting-readers";
import type { ModuleSettings } from "@/modules/types";
import { Widget, shell, get, num, rows, fmt, mix, type ShellProps, type WidgetMeta } from "./kit";
import { allDayTitles, hourMarks, nowFraction, placeEvents, railWindow, type RailEvent, type RailWindow } from "./DayPlanner/layout";
import { forecastDay, weatherBand, type BandPoint } from "./DayPlanner/weather-band";
import { useExtras, useInStudio, useNow } from "./time-hooks";

export const meta: WidgetMeta = {
  id: "DayPlanner",
  name: "Day Planner",
  category: "Info",
  icon: "timeline",
  prefixes: ["plugins.yr-weather-plugin."],
  defaultSize: [3, 4],
  minSize: [2, 2],
  blurb: "Calendar events on a time rail with weather",
  tags: "calendar agenda schedule events timeline weather rain today tomorrow",
  description: "Today's events on a time rail with a now line, over a band for the temperature and rain. It reads the calendar links set under Island › Calendar and the Yr weather plugin.",
};

export interface DayPlannerProps extends ShellProps {
  look?: ModuleSettings;
  /** Hours the rail covers, from the hour before now. */
  hours?: number;
  orientation?: "auto" | "vertical" | "horizontal";
  showWeather?: boolean;
  /** Yr container slug; empty = the first. */
  location?: string;
  units?: "C" | "F";
  clock?: "auto" | "12" | "24";
}

const RAIN = "#38bdf8";

interface Weather {
  band: BandPoint[] | null;
  /** Whether a weather source exists at all. */
  present: boolean;
}

function weatherOf(d: ShellProps["data"], location: string | undefined, win: RailWindow, now: number): Weather {
  const slug = location || Object.keys(d || {}).map((k) => k.match(/^plugins\.yr-weather-plugin\.([^.]+)\.temp$/)?.[1]).find(Boolean);
  if (!slug) return { band: null, present: false };
  const base = `plugins.yr-weather-plugin.${slug}`;
  const days = rows(get(d, `${base}.forecast`)).flatMap(([date, , range, mm]) => {
    const day = forecastDay(date ?? "", range ?? "", mm ?? "");
    return day ? [day] : [];
  });
  return { band: weatherBand(win, now, { temp: num(get(d, `${base}.temp`)), rain: num(get(d, `${base}.rain`)), days }), present: true };
}

const hourLabel = (hour: number, h12: boolean) => (h12 ? `${hour % 12 || 12}${hour < 12 ? "a" : "p"}` : String(hour).padStart(2, "0"));

/** The label of a midnight mark: Tmrw for the next day, else the weekday. */
const dayName = (at: number, day: number) => (day === 1 ? "Tmrw" : new Date(at).toLocaleDateString(undefined, { weekday: "short" }));

export default function DayPlanner(p: DayPlannerProps) {
  const { locale } = useGeneral();
  const studio = useInStudio();
  const calendar = useExtras().calendar;
  const now = useNow(60_000);
  const win = railWindow(now, p.hours ?? 12);
  const events: RailEvent[] = calendar.events;
  const placed = placeEvents(events, win);
  const allDay = allDayTitles(events, win);
  const weather = p.showWeather === false ? { band: null, present: true } : weatherOf(p.data, p.location, win, now);
  const h12 = hour12Of(p.clock) ?? localeHour12(locale);
  const timeText = (ms: number) => new Date(ms).toLocaleTimeString(locale || undefined, { hour: "numeric", minute: "2-digit", hour12: h12 });
  const nowAt = nowFraction(now, win);
  const upcoming = events.filter((e) => !e.allDay && e.end > now).sort((a, b) => a.start - b.start)[0];
  const summary = { label: "Next", value: upcoming ? timeText(upcoming.start) : "–", sub: upcoming ? upcoming.title : calendar.configured ? "Nothing planned" : "No calendar", icon: "timeline", kind: "text" as const };

  const hints = studio
    ? [!calendar.configured && "No calendar yet. Add an ICS link under Island › Calendar.", p.showWeather !== false && !weather.present && "No weather: add the Yr weather plugin."].filter((x): x is string => !!x)
    : [];
  const temps = weather.band?.map((b) => b.temp) ?? [];
  const lo = Math.min(...temps);
  const hi = Math.max(...temps);
  const unit = (c: number) => fmt(p.units === "F" ? (c * 9) / 5 + 32 : c, 0);

  return (
    <Widget {...shell(p)} title={p.title ?? "Day planner"} icon="timeline" showHeader={p.showHeader} compact={(box) => (box.shape === "tile" ? summary : undefined)} studio={summary}>
      {({ w, h }) => {
        const horizontal = p.orientation === "horizontal" || ((p.orientation ?? "auto") === "auto" && w >= h * 1.5);
        const head = (allDay.length > 0 ? 20 : 0) + (hints.length > 0 && h >= 90 ? 30 : 0) + (weather.band && h >= 100 ? 18 : 0);
        const railLen = horizontal ? w - 4 : h - head - 4;
        const marks = hourMarks(win, Math.max(2, Math.floor(railLen / (horizontal ? 34 : 24))), now);
        // The rail axis: `along` is the time (0-1), laid out down or across.
        const along = (f: number) => `${f * 100}%`;
        const box = (from: number, to: number, lane: number, lanes: number): CSSProperties =>
          horizontal
            ? { left: along(from), width: along(to - from), top: `${(lane / lanes) * 100}%`, height: `${100 / lanes}%` }
            : { top: along(from), height: along(to - from), left: `${(lane / lanes) * 100}%`, width: `${100 / lanes}%` };
        const point = (a: number, across: number) => (horizontal ? `${a * 100},${100 - across}` : `${across},${a * 100}`);
        const span = hi - lo || 1;
        const frac = (at: number) => (at - win.start) / (win.end - win.start);
        return (
          <div className="flex h-full min-h-0 min-w-0 flex-col gap-1">
            {allDay.length > 0 && <div className="truncate text-[11px] leading-5 text-[color:var(--w-muted)]">All day · {allDay.join(", ")}</div>}
            {hints.length > 0 && h >= 90 && <div className="line-clamp-2 text-[11px] leading-[14px] text-[color:var(--w-faint)]">{hints.join(" ")}</div>}
            {weather.band && h >= 100 && (
              <div className="flex items-center gap-2 text-[11px] leading-[18px] text-[color:var(--w-muted)]">
                <span className="tabular-nums">
                  {unit(lo)}° to {unit(hi)}°{p.units === "F" ? "F" : "C"}
                </span>
                <span className="inline-block h-1.5 w-3 rounded-sm" style={{ background: RAIN, opacity: 0.7 }} />
                <span>rain</span>
              </div>
            )}
            <div className={`flex min-h-0 flex-1 ${horizontal ? "flex-col" : "flex-row"}`}>
              <div className={`relative shrink-0 text-[10px] tabular-nums text-[color:var(--w-faint)] ${horizontal ? "h-4" : "w-7"}`}>
                {marks.map((m) => (
                  <span key={m.at} className="absolute whitespace-nowrap leading-none" style={horizontal ? { left: along(m.fraction), transform: "translateX(-50%)" } : { top: along(m.fraction), transform: "translateY(-50%)" }}>
                    {m.hour === 0 && m.day >= 1 ? dayName(m.at, m.day) : hourLabel(m.hour, h12)}
                  </span>
                ))}
              </div>
              <div className="relative min-h-0 min-w-0 flex-1 overflow-hidden rounded-md" style={{ background: "var(--w-track)" }}>
                {weather.band && (
                  <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 h-full w-full" aria-hidden>
                    <polygon
                      points={`${point(frac(weather.band[0].at), 0)} ${weather.band.map((b) => point(frac(b.at), 20 + ((b.temp - lo) / span) * 55)).join(" ")} ${point(frac(weather.band[weather.band.length - 1].at), 0)}`}
                      fill="var(--accent)"
                      opacity={0.14}
                    />
                    <polyline points={weather.band.map((b) => point(frac(b.at), 20 + ((b.temp - lo) / span) * 55)).join(" ")} fill="none" stroke="var(--accent)" strokeWidth={1.5} opacity={0.55} vectorEffect="non-scaling-stroke" />
                    {weather.band.map((b) =>
                      b.rain > 0.02 ? (
                        <polygon key={b.at} points={`${point(frac(b.at) - 0.5 / (weather.band!.length - 1), 100)} ${point(frac(b.at) + 0.5 / (weather.band!.length - 1), 100)} ${point(frac(b.at) + 0.5 / (weather.band!.length - 1), 100 - b.rain * 22)} ${point(frac(b.at) - 0.5 / (weather.band!.length - 1), 100 - b.rain * 22)}`} fill={RAIN} opacity={0.45} shapeRendering="crispEdges" />
                      ) : null
                    )}
                  </svg>
                )}
                {marks.map((m) => (
                  <span key={m.at} className="absolute" style={horizontal ? { left: along(m.fraction), top: 0, bottom: 0, width: 1, background: m.hour === 0 && m.day >= 1 ? "var(--w-faint)" : "var(--w-track)" } : { top: along(m.fraction), left: 0, right: 0, height: 1, background: m.hour === 0 && m.day >= 1 ? "var(--w-faint)" : "var(--w-track)" }} />
                ))}
                {placed.map(({ event, from, to, lane, lanes }) => {
                  const len = (to - from) * railLen;
                  return (
                    <div key={event.id} className="absolute p-px" style={box(from, to, lane, lanes)} title={`${event.title} · ${timeText(event.start)}`}>
                      <div className="h-full w-full overflow-hidden rounded-[5px] px-1.5 text-[11px] leading-[14px]" style={{ background: mix(30, "var(--w-track)"), borderLeft: "3px solid var(--accent)", color: "var(--w-fg)" }}>
                        {(!horizontal || len >= 44) && <div className={horizontal ? "truncate" : len >= 28 ? "line-clamp-2" : "truncate"}>{event.title}</div>}
                        {len >= (horizontal ? 70 : 40) && <div className="truncate text-[10px] text-[color:var(--w-muted)]">{timeText(event.start)}</div>}
                      </div>
                    </div>
                  );
                })}
                {nowAt !== null && (
                  <span className="absolute" style={{ ...(horizontal ? { left: along(nowAt), top: 0, bottom: 0, width: 2 } : { top: along(nowAt), left: 0, right: 0, height: 2 }), background: "var(--accent)", boxShadow: "0 0 6px var(--accent)" }} />
                )}
                {calendar.configured && placed.length === 0 && allDay.length === 0 && (
                  <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-xs text-[color:var(--w-muted)]">Nothing planned</div>
                )}
              </div>
            </div>
          </div>
        );
      }}
    </Widget>
  );
}
